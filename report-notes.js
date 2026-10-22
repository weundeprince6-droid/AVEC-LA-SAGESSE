// Commentaires automatiques sous chaque tableau du rapport (PDF et Excel).
// Tout est calculé à partir des données au moment du rapport : rien n'est inventé, chaque phrase s'appuie sur un chiffre.
// Utilise les fonctions de index.html (fmt, sav, creditRemaining, memberOutstanding, socialFund, ...).

function reportComments() {
    const today = todayISO(), E = {};
    const R2 = v => round2(Number(v) || 0);
    const days = iso => Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z')) / 86400000);
    const names = (list, n) => { const a = list.slice(0, n || 3).map(x => x.name || x); return a.join(', ') + (list.length > (n || 3) ? ' et ' + (list.length - (n || 3)) + ' autre(s)' : ''); };
    const pct = (a, b) => b > 0 ? Math.round(a * 100 / b) + ' %' : '0 %';
    const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
    const vb = (n, one, many) => n > 1 ? many : one;   // accord du verbe : 0 ou 1 -> singulier
    const both = f => fmt(f('USD'), 'USD') + ' et ' + fmt(f('FC'), 'FC');
    const monthKey = off => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

    const credits = [];
    members.forEach(m => (m.credits || []).forEach(c => credits.push({ m: m, c: c })));
    const stOf = c => creditRemaining(c) === 0 ? 'ok' : (c.dueDate && c.dueDate < today ? 'late' : 'run');
    const late = credits.filter(x => stOf(x.c) === 'late'), run = credits.filter(x => stOf(x.c) === 'run'), done = credits.filter(x => stOf(x.c) === 'ok');
    const sumC = (list, dev, f) => R2(list.filter(x => devOf(x.c) === dev).reduce((t, x) => t + (Number(f(x.c)) || 0), 0));
    const ops = [];
    members.forEach(m => (m.history || []).forEach(h => { if (h.note !== 'Épargne initiale') ops.push({ m: m, h: h }); }));
    const mNow = monthKey(0), mPrev = monthKey(-1);
    const opsNow = ops.filter(o => String(o.h.date).slice(0, 7) === mNow), opsPrev = ops.filter(o => String(o.h.date).slice(0, 7) === mPrev);
    const fund = socialFund();
    const totalSav = d => R2(members.reduce((t, m) => t + sav(m, d), 0));
    const pendingReq = requests.filter(r => r.status === 'en attente'), openClaims = claims.filter(c => c.status !== 'traitée');

    // ---------- Synthèse ----------
    const s = E.synthese = [];
    if (members.length) {
        const ranked = members.slice().sort((a, b) => sav(b, 'USD') - sav(a, 'USD'));
        const top3 = ranked.slice(0, 3).reduce((t, m) => t + sav(m, 'USD'), 0);
        s.push('L\'épargne du groupe atteint ' + both(totalSav) + ' pour ' + plural(members.length, 'membre') + '.' +
            (totalSav('USD') > 0 && members.length > 3 ? ' Les trois plus gros épargnants en dollars (' + names(ranked, 3) + ') détiennent ' + pct(top3, totalSav('USD')) + ' du total' +
                (top3 * 100 / totalSav('USD') > 60 ? ' : l\'épargne est très concentrée, il serait utile d\'encourager les autres membres à verser davantage.' : ' : la répartition reste équilibrée.') : ''));
    }
    if (credits.length) {
        const given = d => sumC(credits, d, c => c.amount), back = d => sumC(credits, d, c => c.repaid);
        s.push('Sur ' + plural(credits.length, 'crédit accordé', 'crédits accordés') + ' : ' + done.length + ' remboursé(s), ' + run.length + ' en cours et ' + late.length + ' en retard. ' +
            'Taux de remboursement en dollars : ' + pct(back('USD'), given('USD') + sumC(credits, 'USD', c => c.interet)) + ' (capital et intérêts attendus) ; reste à récupérer : ' + both(d => R2(members.reduce((t, m) => t + memberOutstanding(m, d), 0))) + '.');
    } else s.push('Aucun crédit n\'a encore été accordé : l\'épargne n\'est pas encore mise à profit pour faire grandir la caisse par les intérêts.');
    if (late.length) s.push('Priorité : ' + plural(late.length, 'crédit en retard', 'crédits en retard') + ' (' + names(late.map(x => x.m), 3) + '). Un rappel par WhatsApp aux membres concernés est conseillé.');
    else if (credits.length) s.push('Aucun crédit en retard : les remboursements sont respectés, bravo.');
    if (opsNow.length || opsPrev.length) {
        const diff = opsNow.length - opsPrev.length;
        s.push('Activité : ' + plural(opsNow.length, 'opération') + ' ce mois-ci contre ' + opsPrev.length + ' le mois précédent' + (diff > 0 ? ' (en hausse).' : diff < 0 ? ' (en baisse, le mois n\'est peut-être pas terminé).' : ' (stable).'));
    }
    if (pendingReq.length || openClaims.length) s.push('À traiter : ' + plural(pendingReq.length, 'demande en attente', 'demandes en attente') + ' et ' + plural(openClaims.length, 'réclamation ouverte', 'réclamations ouvertes') + '.');
    if (typeof bqOrders !== 'undefined' && bqOrders.length) {
        const sold = bqOrders.filter(o => o.status === 'conclue');
        const com = d => R2(sold.filter(o => devOf(o) === d).reduce((t, o) => t + (Number(o.commission) || 0), 0));
        s.push('Boutique : ' + plural(sold.length, 'vente conclue', 'ventes conclues') + ', ' + both(com) + ' encaissés pour la caisse de l\'AVEC.' + (bqOrders.some(o => o.status === 'acceptée') ? ' Des ventes acceptées attendent encore votre conclusion.' : ''));
    }

    // ---------- Membres ----------
    const m = E.membres = [];
    if (members.length) {
        const noSav = members.filter(x => sav(x, 'USD') === 0 && sav(x, 'FC') === 0);
        const avg = R2(totalSav('USD') / members.length);
        const noAccess = members.filter(x => !(CLOUD ? x.authUid : users.some(u => u.role === 'member' && u.memberId === x.id)));
        const profiled = members.filter(x => profileCount(memberProfiles[x.id]) === PROFILE_FIELDS.length).length;
        m.push('Épargne moyenne en dollars : ' + fmt(avg, 'USD') + ' par membre. ' + (noSav.length ? plural(noSav.length, 'membre') + ' ' + vb(noSav.length, 'n\'a', 'n\'ont') + ' encore aucune épargne (' + names(noSav, 3) + ').' : 'Tous les membres ont de l\'épargne.'));
        m.push(plural(members.filter(hasActiveCredit).length, 'membre') + ' ' + vb(members.filter(hasActiveCredit).length, 'a', 'ont') + ' un crédit en cours (' + pct(members.filter(hasActiveCredit).length, members.length) + ' du groupe).');
        m.push(plural(profiled, 'profil complet', 'profils complets') + ' sur ' + members.length + ' (' + pct(profiled, members.length) + ')' + (noAccess.length ? ' ; ' + plural(noAccess.length, 'membre') + ' sans accès à ' + vb(noAccess.length, 'son espace', 'leur espace') + ' (' + names(noAccess, 3) + ') : pensez à créer ' + vb(noAccess.length, 'son accès', 'leurs accès') + '.' : ' ; tous ont un accès à leur espace.'));
    }

    // ---------- Crédits ----------
    const c = E.credits = [];
    if (credits.length) {
        c.push('Capital accordé : ' + both(d => sumC(credits, d, x => x.amount)) + ' ; intérêts prévus (10 %) : ' + both(d => sumC(credits, d, x => x.interet)) + ' ; déjà remboursé : ' + both(d => sumC(credits, d, x => x.repaid)) + '.');
        if (late.length) {
            const worst = late.slice().sort((a, b) => String(a.c.dueDate).localeCompare(String(b.c.dueDate)))[0];
            c.push('En retard : ' + names(late.map(x => x.m), 4) + '. Le plus ancien retard : ' + worst.m.name + ', échéance dépassée de ' + days(worst.c.dueDate) + ' jour(s), reste ' + fmt(creditRemaining(worst.c), devOf(worst.c)) + '.');
        } else c.push('Aucun crédit en retard à ce jour.');
        const soon = run.filter(x => x.c.dueDate && days(x.c.dueDate) <= 0 && days(x.c.dueDate) >= -30);
        if (soon.length) c.push('Échéances dans les 30 prochains jours : ' + soon.map(x => x.m.name + ' (' + formatISOtoFR(x.c.dueDate) + ', reste ' + fmt(creditRemaining(x.c), devOf(x.c)) + ')').slice(0, 4).join(' ; ') + '.');
        const ext = credits.filter(x => (x.c.extensions || []).length).length;
        if (ext) c.push(plural(ext, 'crédit') + ' ' + vb(ext, 'a été prolongé', 'ont été prolongés') + ' : à suivre de près.');
    }

    // ---------- Opérations ----------
    const o = E.operations = [];
    if (ops.length) {
        const byType = {};
        ops.forEach(x => { const l = OP_LABELS[x.h.type] || 'Autre'; byType[l] = (byType[l] || 0) + 1; });
        const topType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0];
        o.push(plural(ops.length, 'mouvement enregistré', 'mouvements enregistrés') + '. Le type le plus fréquent est « ' + topType + ' » (' + pct(byType[topType], ops.length) + ' des opérations).');
        const byMember = {};
        ops.forEach(x => { byMember[x.m.name] = (byMember[x.m.name] || 0) + 1; });
        const act = Object.keys(byMember).sort((a, b) => byMember[b] - byMember[a])[0];
        o.push('Membre le plus actif : ' + act + ' (' + byMember[act] + ' opérations).');
        const quiet = members.filter(x => !(x.history || []).some(h => days(h.date) <= 30));
        o.push(quiet.length ? plural(quiet.length, 'membre') + ' sans mouvement depuis 30 jours (' + names(quiet, 3) + ') : un petit rappel d\'épargne peut ' + vb(quiet.length, 'le', 'les') + ' relancer.' : 'Tous les membres ont eu un mouvement durant les 30 derniers jours.');
        const dep = ops.filter(x => x.h.type === 'epargne' && days(x.h.date) <= 30);
        if (dep.length) o.push('Versements d\'épargne des 30 derniers jours : ' + dep.length + ' pour ' + both(d => R2(dep.filter(x => devOf(x.h) === d).reduce((t, x) => t + (Number(x.h.amount) || 0), 0))) + '.');
    }

    // ---------- Cas sociaux ----------
    const sc = E.social = [];
    const arrears = members.filter(x => x.socialSince && socialArrears(x) > 0);
    const started = members.filter(x => x.socialSince);
    sc.push('Le fonds des cas sociaux contient ' + fmt(fund.balance, 'FC') + ' (cotisé ' + fmt(fund.paid, 'FC') + ', aides versées ' + fmt(fund.aid, 'FC') + ').');
    if (started.length) sc.push(plural(started.length - arrears.length, 'membre') + ' sur ' + started.length + ' ' + vb(started.length - arrears.length, 'est', 'sont') + ' à jour dans leurs cotisations (' + pct(started.length - arrears.length, started.length) + ')' +
        (arrears.length ? ' ; en retard : ' + names(arrears, 4) + ' (' + fmt(R2(arrears.reduce((t, x) => t + socialArrears(x) * socialWeekly, 0)), 'FC') + ' à récupérer).' : '.'));
    if (members.length - started.length > 0) sc.push(plural(members.length - started.length, 'membre') + ' ' + vb(members.length - started.length, 'n\'a', 'n\'ont') + ' pas encore de date de début de cotisation.');
    const coll = allCollectes();
    if (coll.length) {
        const got = R2(coll.reduce((t, x) => t + collecteCollected(x.c.id), 0)), rem = R2(coll.reduce((t, x) => t + (Number(x.c.remitted) || 0), 0));
        sc.push('Cotisations occasionnelles : ' + plural(coll.length, 'collecte') + ', ' + fmt(got, 'FC') + ' récoltés, ' + fmt(rem, 'FC') + ' remis aux bénéficiaires' + (got - rem > 0 ? ', reste à remettre ' + fmt(R2(got - rem), 'FC') + '.' : '.'));
    }
    E.collectes = [];

    // ---------- Annonces / Galerie ----------
    const an = E.annonces = [];
    if (announcements.length) {
        const last = annSorted()[0];
        an.push(plural(announcements.length, 'annonce publiée', 'annonces publiées') + ' ; la plus récente date du ' + formatISOtoFR(String(last.date || '').slice(0, 10)) + (days(last.date) > 30 ? ' (plus d\'un mois : pensez à informer les membres).' : '.'));
        const imp = announcements.filter(a => a.important).length;
        if (imp) an.push(plural(imp, 'annonce') + ' ' + vb(imp, 'marquée importante', 'marquées importantes') + '.');
    } else an.push('Aucune annonce publiée : utilisez l\'onglet Annonces pour informer les membres des réunions et décisions.');
    const ga = E.galerie = [];
    const withPhoto = members.filter(x => memberProfiles[x.id] && memberProfiles[x.id].photo);
    ga.push(plural(withPhoto.length, 'membre') + ' sur ' + members.length + ' ' + vb(withPhoto.length, 'a', 'ont') + ' une photo de profil (' + pct(withPhoto.length, members.length) + ').' + (withPhoto.length < members.length ? ' Les autres peuvent l\'ajouter dans « Mon compte » pour être reconnus du groupe.' : ' La galerie est complète.'));

    // ---------- Demandes / Réclamations ----------
    const dq = E.demandes = [];
    if (requests.length) {
        const ok = requests.filter(r => r.status === 'approuvée').length, ko = requests.filter(r => r.status === 'refusée').length;
        dq.push(plural(requests.length, 'demande') + ' : ' + ok + ' approuvée(s), ' + ko + ' refusée(s), ' + pendingReq.length + ' en attente.');
        if (pendingReq.length) dq.push('En attente de décision : ' + pendingReq.slice(0, 4).map(r => (members.find(x => x.id === r.memberId) || {}).name + ' (' + fmt(r.amount, devOf(r)) + ', ' + (REQ_LABELS[r.type] || '') + ')').join(' ; ') + '.');
        const cash = requests.filter(r => r.type === 'retrait' && r.status === 'approuvée' && !r.remis);
        if (cash.length) dq.push(plural(cash.length, 'retrait approuvé', 'retraits approuvés') + ' dont l\'argent n\'est pas encore marqué comme remis au membre.');
    } else dq.push('Aucune demande pour le moment.');
    const rc = E.reclamations = [];
    if (claims.length) {
        rc.push(plural(claims.length, 'réclamation') + ' : ' + openClaims.length + ' ouverte(s), ' + (claims.length - openClaims.length) + ' traitée(s) (' + pct(claims.length - openClaims.length, claims.length) + ').');
        if (openClaims.length) {
            const old = openClaims.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
            rc.push('La plus ancienne réclamation ouverte date de ' + days(old.date) + ' jour(s)' + (days(old.date) > 7 ? ' : répondez-y rapidement pour garder la confiance des membres.' : '.'));
        }
        const by = {};
        claims.forEach(x => { by[x.subject || 'Autre'] = (by[x.subject || 'Autre'] || 0) + 1; });
        const topS = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
        rc.push('Objet le plus fréquent : « ' + topS + ' » (' + by[topS] + ').');
    } else rc.push('Aucune réclamation : les membres semblent satisfaits de leurs relevés.');

    // ---------- Équipe / Journal ----------
    if (typeof staffList !== 'undefined' && staffList.length) E.equipe = [plural(staffList.length, 'personne') + ' dans l\'équipe dont ' + staffList.filter(x => x.level === 'total').length + ' avec l\'accès total. Limitez l\'accès total au strict nécessaire.'];
    if (typeof activityList !== 'undefined' && activityList.length) {
        const by = {};
        activityList.forEach(a => { by[a.by || '?'] = (by[a.by || '?'] || 0) + 1; });
        const t = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
        E.journal = [activityList.length > 1 ? 'Sur les ' + activityList.length + ' dernières actions, la plus grande part (' + by[t] + ') vient de ' + t + '.' : 'Une seule action récente : ' + t + '.'];
    }
    return E;
}
