// Identité de l'organisation : nom et logo, choisis par l'administrateur (création du compte ou tableau de bord).
// En ligne, ils sont gardés dans la base (settings/org, lisibles par tous pour s'afficher dès la page de connexion)
// et mis en cache dans ce navigateur pour que l'écran de connexion les affiche tout de suite.
const ORG_DEFAULT = 'AVEC LA SAGESSE';
let orgState = { name: '', logo: '', ratio: 1 };
let orgFromDb = false;     // true quand la base a répondu (même vide)
let orgDbHas = false;      // true quand la base contient déjà un nom
let orgDraftLogo = null;   // logo choisi dans le formulaire, pas encore enregistré ('' = à retirer)
try {
    const c = JSON.parse(localStorage.getItem('avec_org') || 'null');
    if (c && typeof c === 'object') orgState = { name: String(c.name || ''), logo: String(c.logo || ''), ratio: Number(c.ratio) || 1 };
} catch (e) { /* sans cache */ }

function orgName() { return String(orgState.name || '').trim() || ORG_DEFAULT; }
function orgLogo() { return /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(orgState.logo || '') ? orgState.logo : ''; }
function orgSet(o, fromDb) {
    orgState = { name: String((o && o.name) || '').trim().slice(0, 60), logo: String((o && o.logo) || ''), ratio: Number(o && o.ratio) || 1 };
    try { localStorage.setItem('avec_org', JSON.stringify(orgState)); } catch (e) { /* cache impossible */ }
    if (fromDb) { orgFromDb = true; orgDbHas = !!orgState.name; }
    orgApply();
}
// Met à jour tout ce qui affiche le nom ou le logo
function orgApply() {
    const n = orgName(), logo = orgLogo();
    try { document.title = 'Gestion ' + n + ' - Caisse & Suivi'; } catch (e) {}
    if (document.querySelectorAll) {
        document.querySelectorAll('.org-name').forEach(el => { el.textContent = n; });
        document.querySelectorAll('.org-logo').forEach(el => {
            if (logo) { el.src = logo; el.style.display = ''; } else { el.removeAttribute('src'); el.style.display = 'none'; }
        });
        document.querySelectorAll('.org-logo-alt').forEach(el => { el.style.display = logo ? 'none' : ''; });
        const bc = document.getElementById('waBcText');
        if (bc) bc.placeholder = 'Bonjour {prénom}, réunion samedi à 10 h. — ' + n;
        const on = document.getElementById('bqOrgName');
        if (on && !on.value) on.placeholder = n;
    }
    try {
        if (logo && document.head) {
            let l = document.querySelector('link[rel="icon"]');
            if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
            l.href = logo;
        }
    } catch (e) {}
    orgRenderForm();
}

// ----- Formulaire « Identité de l'organisation » (tableau de bord de l'administrateur) -----
function orgMsg(text, ok) {
    const b = document.getElementById('orgMsg');
    if (!b) return;
    b.className = 'alert ' + (ok ? 'alert-success' : 'alert-error');
    b.textContent = text;
}
function orgRenderForm() {
    const inp = document.getElementById('orgNameInput');
    if (!inp) return;
    if (document.activeElement !== inp) inp.value = orgState.name || '';
    const prev = document.getElementById('orgLogoPrev');
    const shown = orgDraftLogo !== null ? orgDraftLogo : orgLogo();
    if (prev) prev.innerHTML = shown ? '<img alt="" src="' + shown + '" style="max-height:64px;max-width:200px;border-radius:8px;border:1px solid var(--border);background:#fff;">' : '<span style="color:var(--text-muted);font-size:0.85rem;">Aucun logo</span>';
    const del = document.getElementById('orgLogoDel');
    if (del) del.style.display = shown ? '' : 'none';
}
function orgPickLogo(input) {
    const f = input && input.files && input.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { orgMsg('Choisissez une image (JPG ou PNG).', false); input.value = ''; return; }
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
        try {
            const k = Math.min(1, 320 / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
            const cx = cv.getContext('2d');
            cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);   // fond blanc (les PNG transparents deviennent blancs)
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            let out = cv.toDataURL('image/jpeg', 0.85);
            if (out.length > 140000) out = cv.toDataURL('image/jpeg', 0.6);
            URL.revokeObjectURL(url);
            if (out.length > 145000) { orgMsg('Logo trop lourd. Choisissez une image plus petite.', false); return; }
            orgDraftLogo = out; orgDraftRatio = cv.width / cv.height;
            orgRenderForm();
        } catch (e) { orgMsg('Image illisible.', false); }
    };
    img.onerror = () => orgMsg('Image illisible. Essayez le format JPG ou PNG.', false);
    img.src = url;
    input.value = '';
}
let orgDraftRatio = 1;
function orgRemoveLogo() { orgDraftLogo = ''; orgDraftRatio = 1; orgRenderForm(); }
function orgSave(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!currentUser || !isAdmin(currentUser) || !canDelete(currentUser)) { orgMsg("Seul l'accès total peut changer l'identité de l'organisation.", false); return; }
    const name = (document.getElementById('orgNameInput').value || '').trim().slice(0, 60);
    if (!name) { orgMsg("Écrivez le nom de l'organisation.", false); return; }
    const logo = orgDraftLogo !== null ? orgDraftLogo : (orgState.logo || '');
    const ratio = orgDraftLogo !== null ? (orgDraftLogo ? orgDraftRatio : 1) : (orgState.ratio || 1);
    const data = { name: name, logo: logo, ratio: round2(ratio), by: String(currentUser.username), date: new Date().toISOString() };
    const done = () => { orgDraftLogo = null; orgSet(data, CLOUD); orgMsg("Enregistré : l'application et les rapports utilisent maintenant « " + name + " ».", true); if (CLOUD) logActivity("Identité de l'organisation : " + name); };
    if (CLOUD) {
        if (!F() || !F().saveOrg) { orgMsg("La mise à jour n'est pas chargée : appuyez sur Ctrl+F5 puis réessayez.", false); return; }
        F().saveOrg(data).then(done).catch(err => orgMsg('Enregistrement impossible : ' + errText(err) + ' (les règles Firestore sont-elles republiées ?)', false));
    } else done();
}

// Appelé à la connexion de l'administrateur : crée l'identité si elle n'existe pas encore
let orgTries = 0;
function orgAfterAdminLogin() {
    if (!currentUser || !isAdmin(currentUser) || !canDelete(currentUser)) return;
    if (CLOUD && !orgFromDb) {                       // on attend la réponse de la base (6 essais au plus)
        if (orgTries++ < 6) setTimeout(orgAfterAdminLogin, 1200);
        return;
    }
    if (orgDbHas || (!CLOUD && orgState.name)) return;
    let pending = '';
    try { pending = localStorage.getItem('avec_org_pending') || ''; } catch (e) {}
    let name = pending.trim();
    if (!name) {
        if (orgAsked) return;
        orgAsked = true;
        name = (window.prompt("Quel est le nom de votre organisation ?\n(Il sera affiché partout dans l'application. Vous pourrez le changer, et ajouter un logo, dans le tableau de bord.)", '') || '').trim();
        if (!name) return;
    }
    name = name.slice(0, 60);
    try { localStorage.removeItem('avec_org_pending'); } catch (e) {}
    const data = { name: name, logo: '', ratio: 1, by: String(currentUser.username), date: new Date().toISOString() };
    if (CLOUD) { if (F() && F().saveOrg) F().saveOrg(data).then(() => orgSet(data, true)).catch(() => {}); }
    else orgSet(data, false);
}
let orgAsked = false;
orgApply();
