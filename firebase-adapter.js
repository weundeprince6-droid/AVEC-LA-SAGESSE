// Adaptateur Firebase : connexion (Authentication) + synchronisation (Firestore).
// Chargé par index.html ; ne fait rien tant que firebase-config.js n'est pas rempli.
//
// Organisation des données (voir firestore.rules) :
//   members/{MBR-001}   fiche du membre (épargne, crédits, historique)  -> écrite par l'administrateur
//   whatsappQueue/{id}  messages WhatsApp à envoyer automatiquement (traités par la Cloud Function)
//   reportRequests/{id}  demandes d'envoi immédiat du rapport PDF par e-mail (traitées par la Cloud Function)
//   shops/{MBR-001}     boutique d'un membre (validée par l'équipe)
//   items/{id}          articles à vendre (publiés après validation)
//   orders/{id}         commandes entre membres (conclues par l'équipe : épargne acheteur -> vendeur, 5 % à l'AVEC)
//   announcements/{id}  annonces de l'administrateur, lues par tous les membres
//   claims/{id}         réclamations                                    -> créées par le membre, traitées par l'admin
//   requests/{id}       demandes de crédit / retrait                    -> créées par le membre, traitées par l'admin
//   profiles/{uid}      lien compte de connexion -> membre (+ mustChange)
//   loginIndex/{MBR-001} numéro de version du compte (réinitialisation du mot de passe)
//   registrations/{id}  demandes d'inscription envoyées par le formulaire public (lien ?inscription)
//   activity/{id}       journal des actions de l'équipe (créé par l'équipe, lu par l'administrateur)
//   staff/{e-mail}      équipe : level 'poste' (tout sauf supprimer) ou 'total' (tous les droits)
//
// Le membre se connecte avec son identifiant (ex. MBR-001) : il est transformé en adresse technique
// mbr-001-g1@membres.avec-sagesse.app (jamais utilisée pour envoyer un e-mail).
// L'administrateur se connecte avec sa vraie adresse e-mail (vérifiée).

const FIREBASE_VERSION = '10.14.1';
const CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
const MEMBER_DOMAIN = 'membres.avec-sagesse.app';

window.FB_READY = (async () => {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !/^AIza[\w-]{20,}$/.test(String(cfg.apiKey || '')) || !cfg.projectId) return;

    const [appM, authM, fsM] = await Promise.all([
        import(CDN + 'firebase-app.js'),
        import(CDN + 'firebase-auth.js'),
        import(CDN + 'firebase-firestore.js')
    ]);
    const { initializeApp } = appM;
    const { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword,
        createUserWithEmailAndPassword, signOut, sendEmailVerification, updatePassword,
        reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } = authM;
    const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
        onSnapshot, writeBatch, orderBy, limit } = fsM;

    const app = initializeApp(cfg);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Deuxième instance, uniquement pour créer les comptes des membres sans déconnecter l'administrateur
    let secAuth = null;
    function secondaryAuth() {
        if (!secAuth) secAuth = initializeAuth(initializeApp(cfg, 'secondary'), { persistence: inMemoryPersistence });
        return secAuth;
    }

    const memberEmail = (id, gen) => String(id).toLowerCase() + '-g' + gen + '@' + MEMBER_DOMAIN;
    const isMemberEmail = email => String(email || '').toLowerCase().endsWith('@' + MEMBER_DOMAIN);
    const brief = u => (u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null);
    const withId = d => Object.assign({}, d.data(), { id: d.id });

    window.FB = {
        memberEmail: memberEmail,
        isMemberEmail: isMemberEmail,

        // ----- Connexion -----
        onAuth(cb) { return onAuthStateChanged(auth, u => cb(brief(u))); },
        async login(email, password) {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            return brief(cred.user);
        },
        async signUpAdmin(email, password) {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(cred.user);
            await signOut(auth);
        },
        async sendVerification() {
            if (auth.currentUser) await sendEmailVerification(auth.currentUser);
        },
        async logout() { await signOut(auth); },
        async resetPassword(email) { auth.languageCode = 'fr'; await sendPasswordResetEmail(auth, email); },

        // Numéro de version du compte d'un membre (1 par défaut)
        async getLoginGen(memberId) {
            try {
                const s = await getDoc(doc(db, 'loginIndex', memberId));
                return s.exists() ? (Number(s.data().gen) || 1) : 1;
            } catch (e) {
                return 1;
            }
        },
        async getProfile(uid) {
            const s = await getDoc(doc(db, 'profiles', uid));
            return s.exists() ? s.data() : null;
        },

        // Le membre change son mot de passe (l'ancien est revérifié), puis le mot de passe par défaut est marqué comme changé
        async changePassword(current, next, uid) {
            const u = auth.currentUser;
            await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
            await updatePassword(u, next);
            for (let i = 0; i < 2; i++) {
                try { await updateDoc(doc(db, 'profiles', uid), { mustChange: false }); return; } catch (e) { /* nouvel essai */ }
            }
            const err = new Error('flag');
            err.code = 'avec/flag-not-saved';
            throw err;
        },

        // L'administrateur / l'équipe change son propre mot de passe (l'ancien est revérifié)
        async changeAdminPassword(current, next) {
            const u = auth.currentUser;
            await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
            await updatePassword(u, next);
        },

        // ----- Comptes des membres (administrateur) -----
        // Crée un compte de connexion pour le membre avec le mot de passe par défaut ; remplace l'ancien s'il existe.
        async provisionMember(memberId, password, oldUid) {
            let gen = 1;
            try {
                const s = await getDoc(doc(db, 'loginIndex', memberId));
                if (s.exists()) gen = (Number(s.data().gen) || 0) + 1;
            } catch (e) { /* on repart de 1 */ }

            const sa = secondaryAuth();
            let cred = null;
            let used = gen;
            for (let t = 0; t < 10 && !cred; t++) {
                try {
                    cred = await createUserWithEmailAndPassword(sa, memberEmail(memberId, gen + t), password);
                    used = gen + t;
                } catch (e) {
                    if (e.code !== 'auth/email-already-in-use') throw e;
                }
            }
            if (!cred) throw new Error('Impossible de créer le compte de ce membre (identifiant déjà pris).');
            const uid = cred.user.uid;
            try { await signOut(sa); } catch (e) { /* sans importance */ }

            await setDoc(doc(db, 'profiles', uid), { memberId: memberId, mustChange: true });
            await setDoc(doc(db, 'loginIndex', memberId), { gen: used });
            if (oldUid && oldUid !== uid) {
                try { await deleteDoc(doc(db, 'profiles', oldUid)); } catch (e) { /* ancien accès déjà supprimé */ }
            }
            return { uid: uid, gen: used };
        },
        // Supprime l'accès d'un membre supprimé (le compte de connexion devient inutilisable)
        async removeMemberAccess(memberId, uid) {
            if (uid) { try { await deleteDoc(doc(db, 'profiles', uid)); } catch (e) { /* ignoré */ } }
            try { await deleteDoc(doc(db, 'loginIndex', memberId)); } catch (e) { /* ignoré */ }
        },

        // ----- Équipe (postes et accès total) -----
        // Fiche de l'équipe pour cette adresse : { level: 'poste' | 'total', poste, ... } ou null
        async getStaff(email) {
            const s = await getDoc(doc(db, 'staff', String(email).toLowerCase()));
            return s.exists() ? s.data() : null;
        },
        async saveStaff(email, data) {
            await setDoc(doc(db, 'staff', String(email).toLowerCase()), data);
        },
        async removeStaff(email) {
            await deleteDoc(doc(db, 'staff', String(email).toLowerCase()));
        },
        listenStaff(cb, onError) {
            return onSnapshot(collection(db, 'staff'),
                snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { email: d.id }))), err => onError(err));
        },

        // ----- Journal d'activité (visible par l'administrateur seulement, non modifiable) -----
        async addActivity(entry) {
            await setDoc(doc(db, 'activity', entry.id), entry);
        },
        listenActivity(cb, onError) {
            const q = query(collection(db, 'activity'), orderBy('date', 'desc'), limit(300));
            return onSnapshot(q, snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), err => onError(err));
        },

        // ----- Profil complété par le membre (adresse, profession, personne à prévenir…) -----
        async saveMemberProfile(memberId, data) {
            await setDoc(doc(db, 'memberProfiles', memberId), data);
        },
        async removeMemberProfile(memberId) {
            await deleteDoc(doc(db, 'memberProfiles', memberId));
        },
        // L'équipe reçoit tous les profils ; renvoie { MBR-001: {...}, ... }
        listenMemberProfiles(cb, onError) {
            return onSnapshot(collection(db, 'memberProfiles'), snap => {
                const map = {}; snap.docs.forEach(d => { map[d.id] = d.data(); }); cb(map);
            }, err => onError(err));
        },
        listenMyProfile(memberId, cb, onError) {
            return onSnapshot(doc(db, 'memberProfiles', memberId), s => cb(s.exists() ? { [memberId]: s.data() } : {}), err => onError(err));
        },

        // ----- Réglages (montant de la cotisation hebdomadaire) -----
        async saveSettings(data) {
            await setDoc(doc(db, 'settings', 'social'), data);
        },
        listenSettings(cb, onError) {
            return onSnapshot(doc(db, 'settings', 'social'), s => cb(s.exists() ? s.data() : null), err => onError(err));
        },

        // ----- WhatsApp automatique : réglage (manuel / automatique) et file d'envoi lue par la Cloud Function -----
        async saveWaSettings(data) {
            await setDoc(doc(db, 'settings', 'whatsapp'), data);
        },
        listenWaSettings(cb, onError) {
            return onSnapshot(doc(db, 'settings', 'whatsapp'), s => cb(s.exists() ? s.data() : null), err => onError(err));
        },
        async queueWhatsapp(entry) {
            await setDoc(doc(db, 'whatsappQueue', entry.id), entry);
        },
        async removeWaQueue(ids) {
            for (let i = 0; i < ids.length; i += 400) {
                const batch = writeBatch(db);
                ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, 'whatsappQueue', id)));
                await batch.commit();
            }
        },
        listenWaQueue(cb, onError) {
            const q = query(collection(db, 'whatsappQueue'), orderBy('date', 'desc'), limit(60));
            return onSnapshot(q, snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), err => onError(err));
        },

        // ----- Identité de l'organisation (nom + logo) : settings/org, lisible avant la connexion -----
        async saveOrg(data) {
            await setDoc(doc(db, 'settings', 'org'), data);
        },
        listenOrg(cb, onError) {
            return onSnapshot(doc(db, 'settings', 'org'), s => cb(s.exists() ? s.data() : null), err => onError(err));
        },

        // ----- Rapport mensuel par e-mail : réglage (settings/report) et demande d'envoi immédiat -----
        async saveReportSettings(data) {
            await setDoc(doc(db, 'settings', 'report'), data, { merge: true });
        },
        listenReportSettings(cb, onError) {
            return onSnapshot(doc(db, 'settings', 'report'), s => cb(s.exists() ? s.data() : null), err => onError(err));
        },
        async requestReportNow(entry) {
            await setDoc(doc(db, 'reportRequests', entry.id), entry);
        },

        // ----- Inscriptions : formulaire public (création sans connexion), traitées par l'équipe -----
        async submitRegistration(entry) {
            await setDoc(doc(db, 'registrations', entry.id), entry);
        },
        async updateRegistration(id, patch) {
            await updateDoc(doc(db, 'registrations', id), patch);
        },
        async removeRegistration(id) {
            await deleteDoc(doc(db, 'registrations', id));
        },
        listenRegistrations(cb, onError) {
            const q = query(collection(db, 'registrations'), orderBy('date', 'desc'), limit(200));
            return onSnapshot(q, snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), err => onError(err));
        },

        // ----- Annonces (écrites par l'équipe, lues par tous les membres connectés) -----
        async addAnnouncement(entry) {
            await setDoc(doc(db, 'announcements', entry.id), entry);
        },
        async removeAnnouncement(id) {
            await deleteDoc(doc(db, 'announcements', id));
        },
        listenAnnouncements(cb, onError) {
            const q = query(collection(db, 'announcements'), orderBy('date', 'desc'), limit(50));
            return onSnapshot(q, snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), err => onError(err));
        },


        // ----- Boutique des membres -----
        async saveShop(data) { await setDoc(doc(db, 'shops', data.id), data); },
        async saveItem(data) { await setDoc(doc(db, 'items', data.id), data); },
        async patchItem(id, patch) { await updateDoc(doc(db, 'items', id), patch); },
        async patchShop(id, patch) { await updateDoc(doc(db, 'shops', id), patch); },
        async removeItem(id) { await deleteDoc(doc(db, 'items', id)); },
        async createOrder(entry) { await setDoc(doc(db, 'orders', entry.id), entry); },
        async patchOrder(id, patch) { await updateDoc(doc(db, 'orders', id), patch); },
        // Vente conclue : épargne de l'acheteur, épargne du vendeur, commande et stock changent en UNE seule opération
        async concludeOrder(buyer, seller, order, item) {
            const batch = writeBatch(db);
            batch.set(doc(db, 'members', buyer.id), buyer);
            if (seller) batch.set(doc(db, 'members', seller.id), seller);   // vente de l'organisation : pas de vendeur membre
            batch.set(doc(db, 'orders', order.id), order);
            batch.set(doc(db, 'items', item.id), item);
            await batch.commit();
        },
        // L'équipe suit tout ; un membre suit les boutiques validées, les articles publiés, et ses propres données
        listenBoutique(admin, memberId, h, onError) {
            const stops = [];
            const sources = {};
            const emit = (name) => { const m = {}; Object.keys(sources[name]).forEach(k => Object.assign(m, sources[name][k])); h[name](Object.keys(m).map(k => m[k])); };
            const watch = (name, key, q) => {
                sources[name] = sources[name] || {};
                stops.push(onSnapshot(q, snap => {
                    const m = {}; snap.docs.forEach(d => { m[d.id] = withId(d); });
                    sources[name][key] = m; emit(name);
                }, err => onError(err)));
            };
            if (admin) {
                watch('shops', 'all', collection(db, 'shops'));
                watch('items', 'all', collection(db, 'items'));
                watch('orders', 'all', collection(db, 'orders'));
            } else {
                watch('shops', 'ok', query(collection(db, 'shops'), where('status', '==', 'validée')));
                stops.push(onSnapshot(doc(db, 'shops', memberId), s => {
                    sources.shops = sources.shops || {};
                    sources.shops.mine = s.exists() ? { [s.id]: withId(s) } : {};
                    emit('shops');
                }, err => onError(err)));
                watch('items', 'ok', query(collection(db, 'items'), where('status', '==', 'publié')));
                watch('items', 'mine', query(collection(db, 'items'), where('ownerId', '==', memberId)));
                watch('orders', 'buy', query(collection(db, 'orders'), where('buyerId', '==', memberId)));
                watch('orders', 'sell', query(collection(db, 'orders'), where('sellerId', '==', memberId)));
            }
            return () => stops.forEach(s => s());
        },

        // ----- Données -----
        async write(name, upserts, deletes) {
            const ops = upserts.map(u => ({ t: 's', id: u.id, data: u.data })).concat(deletes.map(id => ({ t: 'd', id: id })));
            for (let i = 0; i < ops.length; i += 400) {
                const batch = writeBatch(db);
                ops.slice(i, i + 400).forEach(o => {
                    const ref = doc(db, name, o.id);
                    if (o.t === 's') batch.set(ref, o.data); else batch.delete(ref);
                });
                await batch.commit();
            }
        },
        // L'administrateur suit toutes les collections en temps réel
        listenAdmin(h) {
            const stops = ['members', 'claims', 'requests'].map(n =>
                onSnapshot(collection(db, n), snap => h[n](snap.docs.map(withId)), err => h.error(err)));
            return () => stops.forEach(s => s());
        },
        // Un membre ne suit que ses propres données
        listenMember(memberId, h) {
            const s1 = onSnapshot(doc(db, 'members', memberId),
                s => h.members(s.exists() ? [withId(s)] : []), err => h.error(err));
            const s2 = onSnapshot(query(collection(db, 'claims'), where('memberId', '==', memberId)),
                snap => h.claims(snap.docs.map(withId)), err => h.error(err));
            const s3 = onSnapshot(query(collection(db, 'requests'), where('memberId', '==', memberId)),
                snap => h.requests(snap.docs.map(withId)), err => h.error(err));
            return () => { s1(); s2(); s3(); };
        }
    };
})();
