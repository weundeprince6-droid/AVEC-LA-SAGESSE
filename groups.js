/* Phase 2 : sous-groupes et chefs de groupe.
   - L'équipe crée un groupe en choisissant un membre comme chef (identifiant du groupe = identifiant du chef),
     affecte des membres, et valide les opérations proposées.
   - Le chef de groupe voit les fiches de son groupe, invite de nouveaux membres par un lien d'inscription propre
     (la demande arrive à l'équipe) et PROPOSE des versements / remboursements : l'argent ne bouge qu'à la validation de l'équipe.
   - Tous les membres du groupe restent dans la même caisse de l'organisation (rapports par groupe).
   Script classique : il utilise les variables globales de index.html (members, currentUser, F(), CLOUD, ...). Cloud uniquement. */

let grpGroups = [];        // administrateur : tous les groupes
let grpOps = [];           // administrateur : toutes les propositions ; chef : celles de son groupe
let grpMine = null;        // chef : son groupe (null si ce membre n'est pas chef)
let grpMembers = [];       // chef : fiches des membres de son groupe
let grpReqs = [], grpClaims = []; // chef : demandes et réclamations de ses membres
let grpMemberGroup = null; // membre : le groupe auquel il appartient (nom, chef)
let grpWatchedId = '', grpStopDoc = null, grpOpenId = '', grpDraft = {};

function grpReset() { grpGroups = []; grpOps = []; grpMine = null; grpMembers = []; grpReqs = []; grpClaims = []; grpMemberGroup = null; grpWatchedId = ''; if (grpStopDoc) { grpStopDoc(); grpStopDoc = null; } grpOpenId = ''; }
const grpOnAdmin = { groups: l => { grpGroups = l; grpRefresh(); }, ops: l => { grpOps = l; grpRefresh(); } };
const grpOnLeader = {
    group: g => { grpMine = g; grpRefresh(); },
    gmembers: l => { grpMembers = l; grpRefresh(); },
    greqs: l => { grpReqs = l; grpRefresh(); },
    gclaims: l => { grpClaims = l; grpRefresh(); },
    ops: l => { grpOps = l; grpRefresh(); }
};
function grpIsAdmin() { return !!currentUser && isAdmin(currentUser) && !currentUser.leader; }
function grpRefresh() {
    if (!currentUser) return;
    if (grpIsAdmin()) { grpRenderAdmin(); grpAdminBadge(); } else if (currentUser.leader) { renderGrpInfo(); if (typeof currentTab !== 'undefined' && currentTab === 'groupes') grpRenderMember(); } else { renderGrpInfo(); grpRenderMember(); }
}
// Un membre non chef regarde le groupe auquel il appartient (nom du groupe et du chef)
function grpOnMemberRender(m) {
    if (!CLOUD || !F() || !m) return;
    const gid = m.groupId || '';
    if (!gid || gid === m.id) { grpMemberGroup = null; grpWatchedId = gid; renderGrpInfo(); return; }
    if (grpWatchedId === gid) { renderGrpInfo(); return; }
    grpWatchedId = gid;
    if (grpStopDoc) { grpStopDoc(); grpStopDoc = null; }
    if (F().listenGroupDoc) grpStopDoc = F().listenGroupDoc(gid, g => { grpMemberGroup = g; renderGrpInfo(); }, () => {});
}
function renderGrpInfo() {
    const box = document.getElementById('grpInfoBar'); if (!box) return;
    const g = grpMine || grpMemberGroup;
    const tag = g ? '<i class="fa-solid fa-people-group"></i> Groupe ' + escapeHtml(g.name) + (grpMine ? ' · Chef' : '') : '';
    ['hdrGrp', 'hdrGrpAdm'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.innerHTML = tag; if (g) el.classList.remove('hidden'); else el.classList.add('hidden'); });
    if (!g) { box.style.display = 'none'; return; }
    box.style.display = '';
    const lead = !!grpMine;
    box.innerHTML = '<i class="fa-solid fa-people-group"></i> Groupe <strong>' + escapeHtml(g.name) + '</strong> · ' + (lead ? '<strong>vous en êtes le chef</strong>' : 'chef : ' + escapeHtml(g.leaderName || ''));
    setHidden('mtabGroupe', !lead);
    setHidden('swMember', !lead);
}

// ---------- calculs ----------
function grpStats(list) {
    const t = { n: list.length, sUSD: 0, sFC: 0, cUSD: 0, cFC: 0, late: 0 }, today = todayISO();
    list.forEach(m => {
        t.sUSD += sav(m, 'USD'); t.sFC += sav(m, 'FC'); t.cUSD += memberOutstanding(m, 'USD'); t.cFC += memberOutstanding(m, 'FC');
        if ((m.credits || []).some(c => creditRemaining(c) > 0 && c.dueDate && c.dueDate < today)) t.late++;
    });
    ['sUSD', 'sFC', 'cUSD', 'cFC'].forEach(k => { t[k] = round2(t[k]); });
    return t;
}
function grpName(id) { const g = grpGroups.find(x => x.id === id); return g ? g.name : ''; }
function grpMoney(v, d) { return fmt(v, d === 'FC' ? 'FC' : 'USD'); }
const GRP_ST = { 'à valider': '<span class="badge badge-due">À valider</span>', 'validée': '<span class="badge badge-ok">Validée</span>', 'refusée': '<span class="badge badge-late">Refusée</span>' };
function grpOpLabel(o) { return o.type === 'remboursement' ? 'Remboursement' : "Versement d'épargne"; }
function grpMsg(id, text, ok) {
    const b = document.getElementById(id); if (!b) return;
    b.className = 'alert ' + (ok ? 'alert-success' : 'alert-error'); b.style.display = 'block'; b.textContent = text;
}

// =================== Espace de l'équipe ===================
function grpAdminBadge() {
    tabCnt.grp = grpOps.filter(o => o.status === 'à valider').length;
    if (typeof syncMainBadges === 'function') syncMainBadges();
}
function grpRenderAdmin() {
    const box = document.getElementById('grpAdminBox');
    if (!box || document.getElementById('panel-groupes').classList.contains('hidden')) return;
    const E = escapeHtml;
    const leaders = new Set(grpGroups.map(g => g.id));
    const cand = members.filter(m => !leaders.has(m.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    let h = '<section class="card"><div class="card-header"><i class="fa-solid fa-people-group"></i><h3>Créer un sous-groupe</h3></div>' +
        '<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px;">Choisissez un membre comme <strong>chef de groupe</strong>. Il aura son propre réseau de membres, qu\'il suit et dont il propose les opérations ; l\'équipe valide tout.</p>' +
        '<form onsubmit="grpCreate(event)" style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end;">' +
        '<div class="form-group" style="margin:0;"><label>Chef de groupe</label><select id="grpLeader" required><option value="">-- Choisir un membre --</option>' + cand.map(m => '<option value="' + E(m.id) + '">' + E(m.name) + ' (' + E(m.id) + ')</option>').join('') + '</select></div>' +
        '<div class="form-group" style="margin:0;"><label>Nom du groupe</label><input type="text" id="grpName" maxlength="60" required placeholder="Ex : Groupe des commerçants"></div>' +
        '<button type="submit" class="btn" style="width:auto;"><i class="fa-solid fa-plus"></i> Créer le groupe</button></form>' +
        '<div id="grpCreateMsg" class="alert" style="margin-top:10px;display:none;"></div></section>';
    // propositions à valider
    const pend = grpOps.filter(o => o.status === 'à valider').sort((a, b) => String(a.date).localeCompare(String(b.date)));
    h += '<section class="card"><div class="card-header"><i class="fa-solid fa-clipboard-check"></i><h3>Opérations proposées à valider (' + pend.length + ')</h3></div>';
    h += pend.length ? '<div style="overflow-x:auto;"><table><thead><tr><th>Date</th><th>Groupe</th><th>Membre</th><th>Opération</th><th>Montant</th><th>Détail</th><th></th></tr></thead><tbody>' + pend.map(o => {
        const m = members.find(x => x.id === o.memberId);
        const cr = o.type === 'remboursement' && m ? (m.credits || []).find(c => c.id === o.creditId) : null;
        return '<tr><td>' + E(formatISOtoFR(String(o.date).slice(0, 10))) + '</td><td>' + E(grpName(o.groupId) || o.groupId) + '<br><small style="color:var(--text-muted);">chef : ' + E(o.leaderName || '') + '</small></td><td>' + E(o.memberName || '') + ' <small>(' + E(o.memberId) + ')</small></td><td>' + grpOpLabel(o) +
            '</td><td><strong>' + grpMoney(o.amount, o.devise) + '</strong></td><td>' + E(o.note || '') + (cr ? '<br><small style="color:var(--text-muted);">Crédit du ' + E(cr.date || '') + ' : reste ' + grpMoney(creditRemaining(cr), devOf(cr)) + '</small>' : '') +
            '</td><td style="white-space:nowrap;"><button type="button" class="btn-small" onclick="grpDecide(\'' + E(o.id) + '\',true)"><i class="fa-solid fa-check"></i> Valider</button> <button type="button" class="btn-small danger" onclick="grpDecide(\'' + E(o.id) + '\',false)"><i class="fa-solid fa-xmark"></i> Refuser</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<p style="color:var(--text-muted);font-size:0.9rem;">Aucune opération en attente.</p>';
    h += '</section>';
    // groupes
    h += '<section class="card"><div class="card-header"><i class="fa-solid fa-diagram-project"></i><h3>Les groupes (' + grpGroups.length + ')</h3></div>';
    if (!grpGroups.length) h += '<p style="color:var(--text-muted);font-size:0.9rem;">Aucun groupe pour le moment.</p>';
    grpGroups.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(g => {
        const list = members.filter(m => m.groupId === g.id), s = grpStats(list), open = grpOpenId === g.id;
        h += '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;">' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><div style="flex:1;min-width:200px;"><strong>' + E(g.name) + '</strong> ' + (g.status === 'suspendu' ? '<span class="badge badge-due">Suspendu</span>' : '') + '<br><small style="color:var(--text-muted);">Chef : ' + E(g.leaderName || '') + ' (' + E(g.id) + ')</small></div>' +
            '<button type="button" class="btn-small" onclick="grpToggle(\'' + E(g.id) + '\')"><i class="fa-solid fa-' + (open ? 'chevron-up' : 'chevron-down') + '"></i> ' + (open ? 'Réduire' : 'Voir tout') + '</button>' +
            '<button type="button" class="btn-small" onclick="grpExportPdf(\'' + E(g.id) + '\')" title="Rapport PDF du groupe"><i class="fa-solid fa-file-pdf"></i> PDF</button>' +
            '<button type="button" class="btn-small" onclick="grpSuspend(\'' + E(g.id) + '\')" title="' + (g.status === 'suspendu' ? 'Réactiver' : 'Suspendre') + '"><i class="fa-solid fa-' + (g.status === 'suspendu' ? 'play' : 'pause') + '"></i></button>' +
            (canDelete(currentUser) ? '<button type="button" class="btn-small danger" onclick="grpDissolve(\'' + E(g.id) + '\')" title="Dissoudre le groupe"><i class="fa-solid fa-trash"></i></button>' : '') + '</div>' +
            '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:0.88rem;"><span><strong>' + s.n + '</strong> membre(s)</span><span>Épargne : <strong>' + grpMoney(s.sUSD, 'USD') + '</strong> · <strong>' + grpMoney(s.sFC, 'FC') + '</strong></span><span>Crédits en cours : <strong>' + grpMoney(s.cUSD, 'USD') + '</strong> · <strong>' + grpMoney(s.cFC, 'FC') + '</strong></span>' + (s.late ? '<span style="color:#b91c1c;"><strong>' + s.late + '</strong> en retard</span>' : '') + '</div>';
        if (open) {
            h += '<div style="margin-top:8px;font-size:0.85rem;color:var(--text-muted);">Groupe créé le ' + E(formatISOtoFR(String(g.date || '').slice(0, 10))) + (g.by ? ' par ' + E(g.by) : '') + ' · Chef : ' + E(g.leaderName || '') + ' (' + E(g.leaderId || g.id) + ')</div>' + grpDetailHtml(g.id) + '<h4 style="margin:14px 0 6px;font-size:0.95rem;">Membres du groupe</h4>';
            const free = members.filter(m => !m.groupId).sort((a, b) => String(a.name).localeCompare(String(b.name)));
            h += '<div style="margin-top:10px;overflow-x:auto;"><table><thead><tr><th>Membre</th><th>Épargne $</th><th>Épargne FC</th><th>Crédit en cours</th><th></th></tr></thead><tbody>' +
                (list.map(m => '<tr><td>' + E(m.name) + ' <small>(' + E(m.id) + ')</small>' + (m.id === g.id ? ' <span class="badge badge-ok">Chef</span>' : '') + '</td><td>' + grpMoney(sav(m, 'USD'), 'USD') + '</td><td>' + grpMoney(sav(m, 'FC'), 'FC') + '</td><td>' + grpMoney(memberOutstanding(m, 'USD'), 'USD') + ' · ' + grpMoney(memberOutstanding(m, 'FC'), 'FC') + '</td><td>' +
                    (m.id === g.id ? '' : '<button type="button" class="btn-small danger" onclick="grpUnassign(\'' + E(m.id) + '\')" title="Retirer du groupe"><i class="fa-solid fa-user-minus"></i></button>') + '</td></tr>').join('') || '<tr><td colspan="5" style="color:var(--text-muted);">Aucun membre.</td></tr>') + '</tbody></table></div>' +
                '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;"><select id="grpAssign-' + E(g.id) + '" style="flex:1;min-width:200px;"><option value="">-- Ajouter un membre sans groupe --</option>' + free.map(m => '<option value="' + E(m.id) + '">' + E(m.name) + ' (' + E(m.id) + ')</option>').join('') + '</select>' +
                '<button type="button" class="btn-small" onclick="grpAssign(\'' + E(g.id) + '\')"><i class="fa-solid fa-user-plus"></i> Ajouter</button></div>';
        }
        h += '</div>';
    });
    h += '</section>';
    // historique
    const done = grpOps.filter(o => o.status !== 'à valider').sort((a, b) => String(b.decidedAt || b.date).localeCompare(String(a.decidedAt || a.date))).slice(0, 30);
    if (done.length) h += '<section class="card"><div class="card-header"><i class="fa-solid fa-clock-rotate-left"></i><h3>Dernières décisions</h3></div><div style="overflow-x:auto;"><table><thead><tr><th>Date</th><th>Groupe</th><th>Membre</th><th>Opération</th><th>Montant</th><th>Statut</th></tr></thead><tbody>' +
        done.map(o => '<tr><td>' + E(formatISOtoFR(String(o.decidedAt || o.date).slice(0, 10))) + '</td><td>' + E(grpName(o.groupId) || o.groupId) + '</td><td>' + E(o.memberName || '') + '</td><td>' + grpOpLabel(o) + '</td><td>' + grpMoney(o.amount, o.devise) + '</td><td>' + (GRP_ST[o.status] || '') + '</td></tr>').join('') + '</tbody></table></div></section>';
    const a = document.activeElement, keep = a && a.id ? [a.id, a.value] : null;
    box.innerHTML = h;
    if (keep) { const n = document.getElementById(keep[0]); if (n && n.tagName !== 'BUTTON') { n.value = keep[1]; } }
}
// Toutes les informations d'un groupe : chiffres, opérations récentes, demandes, réclamations, inscriptions, propositions
function grpDetailHtml(gid) {
    const E = escapeHtml, list = members.filter(m => m.groupId === gid), ids = new Set(list.map(m => m.id)), today = todayISO();
    const nameOf = id => { const m = list.find(x => x.id === id); return m ? m.name : id; };
    let inter = 0, octroye = { USD: 0, FC: 0 }, late = 0;
    list.forEach(m => { (m.credits || []).forEach(c => { inter += 0; octroye[devOf(c)] += Number(c.amount) || 0; }); if ((m.credits || []).some(c => creditRemaining(c) > 0 && c.dueDate && c.dueDate < today)) late++; });
    const s = grpStats(list);
    const card = (label, val) => '<div style="flex:1 1 140px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;">' + label + '</div><div style="font-weight:700;">' + val + '</div></div>';
    const hist = [];
    list.forEach(m => (m.history || []).forEach(h => hist.push({ m: m, h: h })));
    hist.sort((a, b) => String(b.h.date).localeCompare(String(a.h.date)));
    const reqs = requests.filter(r => ids.has(r.memberId)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
    const cls = claims.filter(c => ids.has(c.memberId)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
    const regs = (typeof registrations !== 'undefined' ? registrations : []).filter(r => r.groupId === gid && r.status === 'pending');
    const ops = grpOps.filter(o => o.groupId === gid).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
    const sec = (title, body) => '<h4 style="margin:14px 0 6px;font-size:0.95rem;">' + title + '</h4>' + body;
    const none = '<p style="color:var(--text-muted);font-size:0.88rem;">Rien pour le moment.</p>';
    const tbl = (head, rows) => '<div style="overflow-x:auto;"><table><thead><tr>' + head.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    let h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' + card('Membres', s.n) + card('Épargne', grpMoney(s.sUSD, 'USD') + '<br>' + grpMoney(s.sFC, 'FC')) +
        card('Crédits octroyés', grpMoney(octroye.USD, 'USD') + '<br>' + grpMoney(octroye.FC, 'FC')) + card('Reste à rembourser', grpMoney(s.cUSD, 'USD') + '<br>' + grpMoney(s.cFC, 'FC')) + card('Membres en retard', late) + '</div>';
    h += sec('Opérations récentes du groupe', hist.length ? tbl(['Date', 'Membre', 'Opération', 'Montant', 'Précision'], hist.slice(0, 25).map(x => '<tr><td>' + E(formatISOtoFR(String(x.h.date).slice(0, 10))) + '</td><td>' + E(x.m.name) + '</td><td>' + E((typeof OP_LABELS !== 'undefined' && OP_LABELS[x.h.type]) || x.h.type) + '</td><td>' + grpMoney(x.h.amount, x.h.devise) + '</td><td>' + E(x.h.note || '') + '</td></tr>')) : none);
    h += sec('Demandes de crédit / retrait', reqs.length ? tbl(['Date', 'Membre', 'Type', 'Montant', 'Statut'], reqs.map(r => '<tr><td>' + E(formatISOtoFR(String(r.date || '').slice(0, 10))) + '</td><td>' + E(nameOf(r.memberId)) + '</td><td>' + (r.type === 'credit' ? 'Crédit' : 'Retrait') + '</td><td>' + grpMoney(r.amount, devOf(r)) + '</td><td>' + E(r.status || '') + '</td></tr>')) : none);
    h += sec('Réclamations', cls.length ? tbl(['Date', 'Membre', 'Sujet', 'Statut'], cls.map(c => '<tr><td>' + E(formatISOtoFR(String(c.date || '').slice(0, 10))) + '</td><td>' + E(nameOf(c.memberId)) + '</td><td>' + E(c.subject || '') + '</td><td>' + E(c.status || '') + '</td></tr>')) : none);
    h += sec('Inscriptions en attente (' + regs.length + ')', regs.length ? tbl(['Nom', 'Téléphone', 'Date'], regs.map(r => '<tr><td>' + E(r.name) + '</td><td>' + E(r.phone || '') + '</td><td>' + E(formatISOtoFR(String(r.date || '').slice(0, 10))) + '</td></tr>')) : none);
    if (ops.length) h += sec('Anciennes propositions au chef', tbl(['Date', 'Membre', 'Opération', 'Montant', 'Statut'], ops.map(o => '<tr><td>' + E(formatISOtoFR(String(o.date).slice(0, 10))) + '</td><td>' + E(o.memberName || '') + '</td><td>' + grpOpLabel(o) + '</td><td>' + grpMoney(o.amount, o.devise) + '</td><td>' + (GRP_ST[o.status] || '') + '</td></tr>')));
    return h;
}
function grpToggle(id) { grpOpenId = grpOpenId === id ? '' : id; grpRenderAdmin(); }

async function grpCreate(e) {
    e.preventDefault();
    if (!requireAdmin() || !F()) return;
    const id = document.getElementById('grpLeader').value, name = document.getElementById('grpName').value.trim().slice(0, 60);
    const m = members.find(x => x.id === id);
    if (!m || name.length < 2) { grpMsg('grpCreateMsg', 'Choisissez un chef et donnez un nom au groupe.', false); return; }
    if (m.groupId && m.groupId !== id) { grpMsg('grpCreateMsg', m.name + ' appartient déjà à un autre groupe : retirez-le d\'abord de ce groupe.', false); return; }
    const data = { id: id, name: name, leaderId: id, leaderName: m.name, status: 'actif', date: new Date().toISOString(), by: String(currentUser.username).slice(0, 80) };
    try {
        await F().write('groups', [{ id: id, data: data }], []);
        m.groupId = id; store.set('avec_members', members);
        e.target.reset(); grpMsg('grpCreateMsg', 'Groupe « ' + name + ' » créé. ' + m.name + ' en est le chef : il voit maintenant l\'onglet « Mon groupe ».', true);
        logActivity('Groupe créé : ' + name + ' (chef : ' + m.name + ')', m.id);
    } catch (err) { grpMsg('grpCreateMsg', 'Création impossible : ' + errText(err) + ' (les règles Firestore sont-elles republiées ?)', false); }
}
function grpAssign(gid) {
    if (!requireAdmin()) return;
    const sel = document.getElementById('grpAssign-' + gid), m = members.find(x => x.id === (sel && sel.value));
    if (!m) return;
    m.groupId = gid; store.set('avec_members', members);
    logActivity('Membre ajouté au groupe « ' + grpName(gid) + ' » : ' + m.name, m.id);
    grpRenderAdmin();
}
function grpUnassign(mid) {
    if (!requireAdmin()) return;
    const m = members.find(x => x.id === mid); if (!m) return;
    if (!confirm('Retirer ' + m.name + ' du groupe « ' + grpName(m.groupId) + ' » ?')) return;
    const g = grpName(m.groupId);
    delete m.groupId; store.set('avec_members', members);
    logActivity('Membre retiré du groupe « ' + g + ' » : ' + m.name, m.id);
    grpRenderAdmin();
}
async function grpSuspend(gid) {
    if (!requireAdmin()) return;
    const g = grpGroups.find(x => x.id === gid); if (!g) return;
    const d = Object.assign({}, g); d.status = g.status === 'suspendu' ? 'actif' : 'suspendu';
    try { await F().write('groups', [{ id: gid, data: d }], []); } catch (e) { alert('Modification impossible : ' + errText(e)); }
}
async function grpDissolve(gid) {
    if (!requireAdmin() || !canDelete(currentUser)) return;
    const g = grpGroups.find(x => x.id === gid); if (!g) return;
    if (!confirm('Dissoudre le groupe « ' + g.name + ' » ? Ses membres restent membres de l\'organisation (avec leurs comptes) mais ne sont plus dans un groupe, et les propositions en attente sont supprimées.')) return;
    try {
        members.filter(m => m.groupId === gid).forEach(m => { delete m.groupId; });
        store.set('avec_members', members);
        await F().write('groupOps', [], grpOps.filter(o => o.groupId === gid && o.status === 'à valider').map(o => o.id));
        await F().write('groups', [], [gid]);
        logActivity('Groupe dissous : ' + g.name);
    } catch (e) { alert('Suppression impossible : ' + errText(e)); }
}
// Valider (applique l'opération à la fiche du membre, comme une saisie de l'équipe) ou refuser
async function grpDecide(opId, ok) {
    if (!requireAdmin() || !F()) return;
    const o = grpOps.find(x => x.id === opId); if (!o || o.status !== 'à valider') return;
    const m = members.find(x => x.id === o.memberId);
    let note = '';
    if (ok) {
        if (!m) { alert('Fiche du membre introuvable.'); return; }
        const dev = o.devise === 'FC' ? 'FC' : 'USD', amt = round2(Number(o.amount));
        if (!(amt > 0)) { alert('Montant invalide.'); return; }
        if (o.type === 'epargne') {
            if (!confirm('Valider le versement de ' + grpMoney(amt, dev) + ' pour ' + m.name + ' (proposé par ' + o.leaderName + ') ?\nVérifiez que l\'argent a bien été reçu.')) return;
            setSav(m, dev, round2(sav(m, dev) + amt));
            logOp(m, 'epargne', amt, 'Via le chef de groupe ' + (o.leaderName || ''), dev);
        } else {
            const cr = (m.credits || []).find(c => c.id === o.creditId);
            if (!cr) { alert('Ce crédit n\'existe plus : refusez la proposition.'); return; }
            if (amt > creditRemaining(cr)) { alert('Le montant dépasse le reste à rembourser (' + grpMoney(creditRemaining(cr), devOf(cr)) + ') : refusez la proposition.'); return; }
            if (!confirm('Valider le remboursement de ' + grpMoney(amt, devOf(cr)) + ' pour ' + m.name + ' (proposé par ' + o.leaderName + ') ?\nVérifiez que l\'argent a bien été reçu.')) return;
            cr.repaid = round2((Number(cr.repaid) || 0) + amt);
            logOp(m, 'remboursement', amt, 'Crédit du ' + (cr.date || '') + ' · via le chef de groupe ' + (o.leaderName || ''), devOf(cr));
        }
        store.set('avec_members', members);
        updateDashboard();
    } else {
        note = (prompt('Motif du refus (facultatif) :', '') || '').slice(0, 200);
        if (!confirm('Refuser cette proposition ?')) return;
    }
    const d = Object.assign({}, o); delete d.id; d.id = o.id;
    d.status = ok ? 'validée' : 'refusée'; d.decidedBy = String(currentUser.username).slice(0, 80); d.decidedAt = new Date().toISOString();
    if (note) d.decisionNote = note;
    try { await F().write('groupOps', [{ id: o.id, data: d }], []); logActivity((ok ? 'Proposition validée' : 'Proposition refusée') + ' : ' + grpOpLabel(o) + ' ' + grpMoney(o.amount, o.devise) + ' — ' + (o.memberName || ''), o.memberId); }
    catch (e) { alert('Décision non enregistrée : ' + errText(e) + '\n(Si l\'opération a déjà été appliquée, ne la saisissez pas une seconde fois : actualisez la page.)'); }
}

// =================== Espace du chef de groupe ===================
function grpInviteLink() {
    try { return location.origin + location.pathname + '?inscription&g=' + encodeURIComponent(currentUser.memberId); } catch (e) { return ''; }
}
function grpRenderMember() {
    const lm = !!(currentUser && currentUser.leader);
    const box = document.getElementById(lm ? 'grpAdminBox' : 'grpLeaderBox');
    if (!box || (!lm && document.getElementById('mp-groupe').classList.contains('hidden'))) return;
    if (!grpMine) { box.innerHTML = '<div class="card" style="color:var(--text-muted);">Vous n\'êtes pas chef de groupe.</div>'; return; }
    const E = escapeHtml, s = grpStats(grpMembers), suspended = grpMine.status === 'suspendu';
    let h = '<section class="card"><div class="card-header"><i class="fa-solid fa-people-group"></i><h3>' + E(grpMine.name) + '</h3></div>' +
        (suspended ? '<div class="alert alert-error" style="margin-bottom:10px;">Ce groupe est suspendu par l\'équipe : vous ne pouvez pas enregistrer d\'opérations pour le moment.</div>' : '') +
        '<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:0.92rem;"><span><strong>' + s.n + '</strong> membre(s)</span><span>Épargne : <strong>' + grpMoney(s.sUSD, 'USD') + '</strong> · <strong>' + grpMoney(s.sFC, 'FC') + '</strong></span><span>Crédits en cours : <strong>' + grpMoney(s.cUSD, 'USD') + '</strong> · <strong>' + grpMoney(s.cFC, 'FC') + '</strong></span>' + (s.late ? '<span style="color:#b91c1c;"><strong>' + s.late + '</strong> crédit(s) en retard</span>' : '') + '</div></section>';
    if (!lm) h = '<section class="card" style="background:#eff6ff;border-color:#bfdbfe;"><p style="margin-bottom:10px;font-size:0.92rem;">Vous avez accès aux <strong>mêmes onglets que l\'équipe</strong> (tableau de bord, membres, opérations, demandes, réclamations…), limités aux membres de votre groupe.</p>' + (suspended ? '' : '<button type="button" class="btn" style="width:auto;" onclick="grpEnterManage()"><i class="fa-solid fa-table-columns"></i> Ouvrir mon espace de gestion</button>') + '</section>' + h;
    h += '<section class="card"><div class="card-header"><i class="fa-solid fa-user-plus"></i><h3>Faire entrer de nouveaux membres</h3></div>' +
        '<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">Envoyez ce lien à la personne : elle remplit sa demande d\'inscription ; l\'équipe la vérifie, l\'accepte et la place dans votre groupe.</p>' +
        '<input type="text" readonly value="' + E(grpInviteLink()) + '" onclick="this.select()" style="margin-bottom:8px;">' +
        '<button type="button" class="btn-small wa" onclick="grpInviteWa()"><i class="fa-brands fa-whatsapp"></i> Envoyer par WhatsApp</button> <button type="button" class="btn-small" onclick="grpCopyLink()"><i class="fa-solid fa-copy"></i> Copier le lien</button></section>';
    h = h.replace('<h3>' + E(grpMine.name) + '</h3></div>', '<h3>' + E(grpMine.name) + '</h3><button type="button" class="btn-small" style="margin-left:auto;" onclick="grpExportPdf(\'' + E(grpMine.id) + '\')"><i class="fa-solid fa-file-pdf"></i> Rapport PDF du groupe</button></div>');
    h += '<section class="card"><div class="card-header"><i class="fa-solid fa-users"></i><h3>Mes membres</h3></div><div style="overflow-x:auto;"><table><thead><tr><th>Membre</th><th>Épargne</th><th>Crédit en cours</th><th>Statut</th><th></th></tr></thead><tbody>' +
        (grpMembers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(m => {
            const late = (m.credits || []).some(c => creditRemaining(c) > 0 && c.dueDate && c.dueDate < todayISO());
            const cr = memberOutstanding(m, 'USD') + memberOutstanding(m, 'FC') > 0;
            return '<tr><td>' + E(m.name) + ' <small>(' + E(m.id) + ')</small>' + (m.id === grpMine.id ? ' <span class="badge badge-ok">Chef</span>' : '') + '</td><td>' + grpMoney(sav(m, 'USD'), 'USD') + '<br>' + grpMoney(sav(m, 'FC'), 'FC') + '</td><td>' + grpMoney(memberOutstanding(m, 'USD'), 'USD') + '<br>' + grpMoney(memberOutstanding(m, 'FC'), 'FC') + '</td><td>' + (late ? '<span class="badge badge-late">En retard</span>' : cr ? '<span class="badge badge-due">En cours</span>' : '<span class="badge badge-ok">À jour</span>') +
                '</td><td>' + (suspended ? '' : '<button type="button" class="btn-small" onclick="grpPropose(\'' + E(m.id) + '\')"><i class="fa-solid fa-hand-holding-dollar"></i> Opérer</button>') + '</td></tr>' +
                (grpDraft.memberId === m.id ? '<tr><td colspan="5" style="background:#f4f7fb;">' + grpFormHtml(m) + '</td></tr>' : '');
        }).join('') || '<tr><td colspan="5" style="color:var(--text-muted);">Aucun membre dans votre groupe pour le moment.</td></tr>') + '</tbody></table></div>' +
        '<div id="grpPropMsg" class="alert" style="margin-top:10px;display:none;"></div></section>';
    const mine = grpOps.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    h += grpReqClaimHtml(suspended);
    if (mine.length) h += '<section class="card"><div class="card-header"><i class="fa-solid fa-clipboard-list"></i><h3>Anciennes propositions</h3></div>' + (mine.length ? '<div style="overflow-x:auto;"><table><thead><tr><th>Date</th><th>Membre</th><th>Opération</th><th>Montant</th><th>Statut</th><th></th></tr></thead><tbody>' + mine.map(o =>
        '<tr><td>' + E(formatISOtoFR(String(o.date).slice(0, 10))) + '</td><td>' + E(o.memberName || '') + '</td><td>' + grpOpLabel(o) + '</td><td>' + grpMoney(o.amount, o.devise) + '</td><td>' + (GRP_ST[o.status] || '') + (o.decisionNote ? '<br><small style="color:var(--text-muted);">' + E(o.decisionNote) + '</small>' : '') + '</td><td>' +
        (o.status === 'à valider' ? '<button type="button" class="btn-small danger" onclick="grpCancel(\'' + E(o.id) + '\')" title="Annuler"><i class="fa-solid fa-xmark"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p style="color:var(--text-muted);font-size:0.9rem;">Aucune proposition pour le moment. Vos propositions sont vérifiées et validées par l\'équipe avant d\'être enregistrées.</p>') + '</section>';
    h += '<section class="card"><div class="card-header"><i class="fa-solid fa-circle-info"></i><h3>Toutes les informations du groupe</h3></div>' + grpDetailHtml(grpMine.id) + '</section>';
    const a = document.activeElement, keep = a && a.id && a.id.indexOf('grp') === 0 ? [a.id, a.value] : null;
    box.innerHTML = h;
    if (keep) { const n = document.getElementById(keep[0]); if (n && n.tagName !== 'BUTTON') { n.value = keep[1]; n.focus(); } }
}
function grpFormHtml(m) {
    const E = escapeHtml, d = grpDraft;
    const credits = (m.credits || []).filter(c => creditRemaining(c) > 0);
    return '<form onsubmit="grpSubmit(event)" style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:end;">' +
        '<div class="form-group" style="margin:0;"><label>Opération</label><select id="grpType" onchange="grpDraftChange()"><option value="epargne"' + (!d.type || d.type === 'epargne' ? ' selected' : '') + '>Versement d\'épargne</option><option value="retrait"' + (d.type === 'retrait' ? ' selected' : '') + '>Retrait d\'épargne</option><option value="credit"' + (d.type === 'credit' ? ' selected' : '') + '>Octroi de crédit</option><option value="remboursement"' + (d.type === 'remboursement' ? ' selected' : '') + '>Remboursement de crédit</option></select></div>' +
        (d.type === 'remboursement' ? '<div class="form-group" style="margin:0;"><label>Crédit</label><select id="grpCredit" required>' + (credits.length ? credits.map(c => '<option value="' + E(c.id) + '">' + grpMoney(c.amount, devOf(c)) + ' du ' + E(c.date || '') + ' — reste ' + grpMoney(creditRemaining(c), devOf(c)) + '</option>').join('') : '<option value="">Aucun crédit en cours</option>') + '</select></div>'
            : '<div class="form-group" style="margin:0;"><label>Devise</label><select id="grpDevise"><option value="USD">Dollars ($)</option><option value="FC">Francs (FC)</option></select></div>') +
        '<div class="form-group" style="margin:0;"><label>Montant</label><input type="number" id="grpAmount" min="0.01" step="0.01" required></div>' +
        '<div class="form-group" style="margin:0;"><label>Précision</label><input type="text" id="grpNote" maxlength="200" placeholder="Facultatif"></div>' +
        '<div style="display:flex;gap:6px;"><button type="submit" class="btn-small"><i class="fa-solid fa-check"></i> Enregistrer</button><button type="button" class="btn-small" onclick="grpPropose(\'\')">Annuler</button></div></form>';
}
function grpPropose(mid) { grpDraft = mid ? { memberId: mid, type: 'epargne' } : {}; grpRenderMember(); }
function grpDraftChange() { const t = document.getElementById('grpType').value; grpDraft.type = t; grpRenderMember(); }
// Le chef de groupe a, sur les membres de SON groupe, les mêmes droits qu'un poste de l'équipe : l'opération est enregistrée tout de suite.
function grpWho() { return 'chef de groupe ' + String((grpMine && grpMine.leaderName) || (currentUser && currentUser.username) || ''); }
// Applique une opération sur une copie de la fiche ; renvoie { m } ou { err }
function grpApplyOp(m0, type, amount, dev, creditId, note) {
    const m = JSON.parse(JSON.stringify(m0)), tag = 'Par le ' + grpWho() + (note ? ' · ' + note : '');
    if (type === 'epargne') {
        setSav(m, dev, round2(sav(m, dev) + amount)); logOp(m, 'epargne', amount, tag, dev);
    } else if (type === 'retrait') {
        const max = availableWithdrawal(m, dev);
        if (amount > max) return { err: 'Retrait refusé : le maximum possible est ' + grpMoney(max, dev) + ' (l\'épargne restante doit couvrir les crédits en cours).' };
        setSav(m, dev, round2(sav(m, dev) - amount)); logOp(m, 'retrait', amount, tag, dev);
    } else if (type === 'credit') {
        if (hasActiveCredit(m)) return { err: m.name + ' a déjà un crédit en cours : il doit être remboursé en entier avant un nouveau crédit.' };
        const max = availableCeiling(m, dev);
        if (amount > max) return { err: 'Le crédit demandé dépasse le plafond disponible de ' + m.name + ' (' + grpMoney(max, dev) + ').' };
        grantCredit(m, amount, dev);
    } else {
        const cr = (m.credits || []).find(c => c.id === creditId);
        if (!cr) return { err: 'Choisissez le crédit à rembourser.' };
        if (amount > creditRemaining(cr)) return { err: 'Le montant dépasse le reste à rembourser (' + grpMoney(creditRemaining(cr), devOf(cr)) + ').' };
        cr.repaid = round2((Number(cr.repaid) || 0) + amount); logOp(m, 'remboursement', amount, 'Crédit du ' + (cr.date || '') + ' · ' + tag, devOf(cr));
    }
    return { m: m };
}
async function grpSubmit(e) {
    e.preventDefault();
    if (!grpMine || !F() || grpMine.status === 'suspendu') return;
    const m = grpMembers.find(x => x.id === grpDraft.memberId); if (!m) return;
    const type = document.getElementById('grpType').value, amount = round2(parseFloat(document.getElementById('grpAmount').value));
    let dev = 'USD', creditId = '';
    if (!(amount > 0)) { grpMsg('grpPropMsg', 'Le montant doit être supérieur à 0.', false); return; }
    if (type === 'remboursement') {
        creditId = (document.getElementById('grpCredit') || {}).value || '';
        const cr = (m.credits || []).find(c => c.id === creditId);
        dev = cr ? devOf(cr) : 'USD';
    } else dev = document.getElementById('grpDevise').value === 'FC' ? 'FC' : 'USD';
    const note = (document.getElementById('grpNote').value || '').trim().slice(0, 200);
    const label = { epargne: 'Versement d\'épargne', retrait: 'Retrait d\'épargne', credit: 'Crédit', remboursement: 'Remboursement' }[type];
    const r = grpApplyOp(m, type, amount, dev, creditId, note);
    if (r.err) { grpMsg('grpPropMsg', r.err, false); return; }
    if (!confirm('Enregistrer : ' + label + ' de ' + grpMoney(amount, dev) + ' pour ' + m.name + ' ?' + (type === 'credit' ? '\nIntérêt de 10 % prélevé : ' + grpMoney(round2(amount * 0.10), dev) : '') + '\nVérifiez l\'argent avant de valider.')) return;
    try {
        await F().write('members', [{ id: m.id, data: r.m }], []);
        grpDraft = {}; grpRenderMember();
        grpMsg('grpPropMsg', 'Opération enregistrée : ' + label + ' de ' + grpMoney(amount, dev) + ' pour ' + m.name + '.', true);
    } catch (err) { grpMsg('grpPropMsg', 'Enregistrement impossible : ' + errText(err), false); }
}
// Demandes de crédit / retrait et réclamations des membres du groupe
function grpReqClaimHtml(suspended) {
    const E = escapeHtml, nameOf = id => { const m = grpMembers.find(x => x.id === id); return m ? m.name : id; };
    const pend = grpReqs.filter(r => r.status === 'en attente').sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const open = grpClaims.filter(c => c.status === 'ouverte').sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let h = '<section class="card"><div class="card-header"><i class="fa-solid fa-inbox"></i><h3>Demandes de mes membres (' + pend.length + ')</h3></div>';
    h += pend.length ? pend.map(r => '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;"><strong>' + E(nameOf(r.memberId)) + '</strong> · ' + (r.type === 'credit' ? 'Crédit' : 'Retrait') + ' de <strong>' + grpMoney(r.amount, devOf(r)) + '</strong> · ' + E(formatISOtoFR(String(r.date || '').slice(0, 10))) +
        (r.note ? '<br><small>' + E(r.note) + '</small>' : '') + (suspended ? '' : '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><input type="text" id="grpReqNote-' + E(r.id) + '" maxlength="300" placeholder="Réponse (facultatif)" style="flex:1;min-width:140px;"><button type="button" class="btn-small" onclick="grpReqDecide(\'' + E(r.id) + '\', true)"><i class="fa-solid fa-check"></i> Accepter</button><button type="button" class="btn-small danger" onclick="grpReqDecide(\'' + E(r.id) + '\', false)"><i class="fa-solid fa-xmark"></i> Refuser</button></div>') + '</div>').join('')
        : '<p style="color:var(--text-muted);font-size:0.9rem;">Aucune demande en attente.</p>';
    h += '</section><section class="card"><div class="card-header"><i class="fa-solid fa-comment-dots"></i><h3>Réclamations de mes membres (' + open.length + ')</h3></div>';
    h += open.length ? open.map(c => '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;"><strong>' + E(nameOf(c.memberId)) + '</strong> · ' + E(c.subject || '') + ' · ' + E(formatISOtoFR(String(c.date || '').slice(0, 10))) + '<br>' + E(c.message || '') +
        (suspended ? '' : '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><input type="text" id="grpClaimReply-' + E(c.id) + '" maxlength="500" placeholder="Votre réponse" style="flex:1;min-width:140px;"><button type="button" class="btn-small" onclick="grpClaimAnswer(\'' + E(c.id) + '\')"><i class="fa-solid fa-reply"></i> Répondre</button></div>') + '</div>').join('')
        : '<p style="color:var(--text-muted);font-size:0.9rem;">Aucune réclamation ouverte.</p>';
    return h + '</section>';
}
async function grpReqDecide(id, ok) {
    if (!grpMine || !F() || grpMine.status === 'suspendu') return;
    const r0 = grpReqs.find(x => x.id === id); if (!r0 || r0.status !== 'en attente') return;
    const m0 = grpMembers.find(x => x.id === r0.memberId); if (!m0) { alert('Membre introuvable.'); return; }
    const f = document.getElementById('grpReqNote-' + id), note = f ? f.value.trim().slice(0, 300) : '';
    const r = JSON.parse(JSON.stringify(r0)), dev = devOf(r0);
    let mNew = null;
    if (ok) {
        const res = grpApplyOp(m0, r0.type === 'credit' ? 'credit' : 'retrait', round2(Number(r0.amount)), dev, '', 'Demande approuvée');
        if (res.err) { alert('Impossible d\'accepter : ' + res.err); return; }
        if (!confirm((r0.type === 'credit' ? 'Accorder un crédit' : 'Retirer') + ' de ' + grpMoney(r0.amount, dev) + ' pour ' + m0.name + ' ?')) return;
        mNew = res.m; r.status = 'approuvée'; r.decision = note || (r0.type === 'credit' ? 'Crédit accordé. À rembourser dans les 3 mois.' : 'Retrait accepté.');
    } else {
        if (!confirm('Refuser cette demande ?')) return;
        r.status = 'refusée'; r.decision = note || 'Demande refusée.';
    }
    r.decisionDate = todayISO();
    try {
        if (mNew) await F().write('members', [{ id: mNew.id, data: mNew }], []);
        await F().write('requests', [{ id: r.id, data: r }], []);
    } catch (err) { alert('Décision non enregistrée : ' + errText(err) + '\n(Actualisez la page avant de recommencer : l\'opération a peut-être déjà été appliquée.)'); }
}
async function grpClaimAnswer(id) {
    if (!grpMine || !F() || grpMine.status === 'suspendu') return;
    const c0 = grpClaims.find(x => x.id === id); if (!c0) return;
    const f = document.getElementById('grpClaimReply-' + id), text = f ? f.value.trim().slice(0, 500) : '';
    const c = JSON.parse(JSON.stringify(c0)); c.status = 'traitée'; c.response = text || 'Votre réclamation a été examinée.'; c.responseDate = todayISO();
    try { await F().write('claims', [{ id: c.id, data: c }], []); } catch (err) { alert('Réponse non enregistrée : ' + errText(err)); }
}
async function grpCancel(id) {
    if (!confirm('Annuler cette proposition ?')) return;
    try { await F().write('groupOps', [], [id]); } catch (e) { alert('Annulation impossible : ' + errText(e)); }
}
function grpInviteWa() {
    const msg = 'Bonjour,\nPour rejoindre mon groupe « ' + (grpMine ? grpMine.name : '') + ' » (' + orgName() + '), remplissez votre demande d\'inscription ici :\n' + grpInviteLink() + '\nL\'équipe confirmera votre inscription.';
    waOpen('', msg);
}
function grpCopyLink() {
    const l = grpInviteLink();
    try { navigator.clipboard.writeText(l).then(() => grpMsg('grpPropMsg', 'Lien copié.', true), () => prompt('Copiez ce lien :', l)); } catch (e) { prompt('Copiez ce lien :', l); }
}
function grpShowMember() { grpRenderMember(); }

// =================== Page publique d'inscription : groupe d'accueil ===================
let grpSignupId = '';
function grpSignupInit() {
    let g = '';
    try { const m = (location.search || '').match(/[?&]g=([A-Za-z0-9_-]{3,20})/); g = m ? m[1] : ''; } catch (e) {}
    if (!g || !CLOUD) return;
    grpSignupId = g;
    Promise.resolve(window.FB_READY).then(() => F() && F().getGroup ? F().getGroup(g) : null).then(grp => {
        const b = document.getElementById('grpSignupBanner');
        if (!grp || grp.status === 'suspendu') { grpSignupId = ''; return; }
        if (b) { b.style.display = ''; b.innerHTML = '<i class="fa-solid fa-people-group"></i> Vous vous inscrivez dans le groupe <strong>' + escapeHtml(grp.name) + '</strong> (chef : ' + escapeHtml(grp.leaderName || '') + ').'; }
    }).catch(() => { grpSignupId = ''; });
}

// Rapport PDF d'un groupe : l'équipe (tous les groupes) ou le chef (son groupe)
async function grpExportPdf(gid) {
    const admin = grpIsAdmin();
    const grp = admin ? grpGroups.find(x => x.id === gid) : (grpMine && grpMine.id === gid ? grpMine : null);
    if (!grp) return;
    const list = admin ? members.filter(m => m.groupId === gid) : grpMembers;
    try {
        await preparePdfLib();
        const r = await AvecPdf.buildGroupReport(PDFLib, { protect: reportProtectPwd(), group: grp, members: list, ops: grpOps.filter(o => o.groupId === gid), org: orgName(), logo: orgLogo(), now: new Date() });
        savePdfFile(r.bytes, r.fileName);
        if (admin) logActivity('Rapport PDF du groupe « ' + grp.name + ' » téléchargé');
    } catch (err) { console.error(err); alert('Le rapport du groupe n\'a pas pu être créé : ' + errText(err) + '\n(Connexion internet ? Actualisez la page avec Ctrl+F5.)'); }
}

// =================== Espace de gestion du chef de groupe ===================
// Le chef retrouve les onglets de l'équipe (tableau de bord, membres, opérations, demandes, réclamations, galerie des membres),
// mais ils ne contiennent QUE les membres de son groupe. La base de données applique la même limite.
let grpLeaderBackup = null;
function grpSetLeaderUi(on) {
    document.body.classList.toggle('leader-mode', !!on);
    setHidden('btnLeaderBack', !on);
}
function grpEnterManage() {
    if (!grpMine || !CLOUD || !F() || !F().listenLeaderData || !currentUser || currentUser.role !== 'member') return;
    if (grpMine.status === 'suspendu') { alert('Votre groupe est suspendu par l\'équipe.'); return; }
    const me = currentUser, gid = grpMine.id;
    grpLeaderBackup = me;
    if (stopListening) { stopListening(); stopListening = null; }
    resetCloudState();
    currentUser = { username: me.memberId, role: 'admin', level: 'chef', poste: 'Chef de groupe', leader: true, groupId: gid, memberId: me.memberId, uid: me.uid, root: false };
    try { ['adminProfileBox', 'admPwdResultBox', 'weeklyInput'].forEach(id => { const el = document.getElementById(id), sec = el && el.closest('section'); if (sec) sec.classList.add('lm-hide'); }); } catch (e) {}
    grpSetLeaderUi(true);
    setHidden('memberSection', true);
    setHidden('dashboardSection', false);
    document.getElementById('currentUserDisplay').textContent = (me.username || me.memberId) + ' · Chef de groupe';
    setHidden('btnExportXlsx', true);
    setHidden('tabBtnGroupes', false);
    showTab('dashboard');
    updateDashboard();
    setSync('connecting');
    startListening();
}
function grpLeaveManage() {
    if (!grpLeaderBackup) return;
    if (stopListening) { stopListening(); stopListening = null; }
    resetCloudState();
    currentUser = grpLeaderBackup; grpLeaderBackup = null;
    grpSetLeaderUi(false);
    setHidden('dashboardSection', true);
    setHidden('memberSection', false);
    setSync('connecting');
    startListening();
    renderMemberPortal();
}
