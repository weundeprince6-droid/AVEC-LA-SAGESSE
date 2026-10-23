/* Exposition : galerie de publications de l'organisation (photos, vidéos, documents).
   Les membres voient, aiment (♥) et commentent ; l'équipe publie et modère.
   Script classique : il utilise les variables globales de index.html (currentUser, members, F(), CLOUD, ...).
   Données : posts, postLikes, postComments (voir firestore.rules). Cloud uniquement.
   Sans Firebase Storage (formule gratuite) : photos réduites et enregistrées dans la publication,
   vidéos = lien (YouTube ou autre), documents = lien ou petit PDF (≤ 350 Ko). */

(function () {
    const s = document.createElement('style');
    s.textContent = '.pub-feed{display:grid;gap:12px;grid-template-columns:minmax(0,1fr);}' +
        '.pub-ph{position:relative;overflow:hidden;border-radius:10px;background:#0f172a;cursor:zoom-in;margin-bottom:10px;}' +
        '.pub-ph img{display:block;width:100%;height:100%;object-fit:cover;}' +
        '.pub-ph.single{height:clamp(230px,55vw,400px);}.pub-ph.single .bg{position:absolute;inset:-24px;background-size:cover;background-position:center;filter:blur(20px) brightness(.65);}' +
        '.pub-ph.single .fg{position:relative;object-fit:contain;}' +
        '.pub-grid{display:grid;gap:4px;height:clamp(220px,46vw,360px);margin-bottom:10px;border-radius:10px;overflow:hidden;}.pub-grid .pub-ph{margin:0;border-radius:0;min-height:0;}' +
        '.pub-grid.n2{grid-template-columns:1fr 1fr;}.pub-grid.n3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;}.pub-grid.n3 .pub-ph:first-child{grid-row:span 2;}' +
        '.pub-cb{position:absolute;right:8px;bottom:8px;z-index:2;background:rgba(15,23,42,.72);color:#fff;border-radius:14px;padding:3px 9px;font-size:0.78rem;}' +
        '.pub-card h3{font-size:1.1rem;}.pub-card{overflow:hidden;}' +
        '.pub-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.18);color:#fff;border:none;border-radius:50%;width:42px;height:42px;font-size:1.4rem;cursor:pointer;}' +
        '.pub-side{display:none;margin-top:8px;}.pub-side.open{display:block;}' +
        '.pub-side-h{font-weight:700;font-size:0.9rem;margin-bottom:4px;}' +
        '@media (min-width:900px){.pub-card{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start;}' +
        '.pub-side,.pub-side.open{display:block;margin-top:0;border-left:1px solid var(--border);padding-left:16px;max-height:560px;overflow-y:auto;}' +
        '.pub-cbtn{display:none!important;}}';
    document.head.appendChild(s);
})();

let pubPosts = [], pubLikes = [], pubComments = [];
let pubDraftImages = [], pubDraftDoc = null, pubFilter = 'all', pubOpenComments = {}, pubBusy = false;
const PUB_MAX_IMAGES = 3, PUB_IMG_CHARS = 118000, PUB_PDF_MAX = 350 * 1024;

function pubReset() { pubPosts = []; pubLikes = []; pubComments = []; pubDraftImages = []; pubDraftDoc = null; pubOpenComments = {}; }
const pubOnData = {
    posts: l => { pubPosts = l; pubRefresh(); },
    likes: l => { pubLikes = l; pubRefresh(); },
    comments: l => { pubComments = l; pubRefresh(); }
};
function pubIsAdmin() { return !!currentUser && isAdmin(currentUser); }
function pubRefresh() {
    if (!currentUser) return;
    pubZoomShow();
    if (pubIsAdmin()) pubRenderAdmin(); else pubRenderMember();
    pubUpdateBadge();
}
function pubSorted() {
    return pubPosts.filter(p => pubIsAdmin() || p.status === 'publié').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function pubSeenKey() { return 'avec_pub_seen_' + (currentUser && (currentUser.memberId || currentUser.username) || ''); }
function pubUpdateBadge() {
    let seen = ''; try { seen = localStorage.getItem(pubSeenKey()) || ''; } catch (e) {}
    const n = pubPosts.filter(p => p.status === 'publié' && String(p.date) > seen).length;
    const bd = document.getElementById('pubMemberBadge');
    if (bd) { bd.textContent = n; setHidden('pubMemberBadge', !(n > 0) || pubIsAdmin() || currentMTab === 'expo'); }
}
function pubMarkSeen() {
    try { localStorage.setItem(pubSeenKey(), new Date().toISOString()); } catch (e) {}
    pubUpdateBadge();
}

// ---------- sécurité d'affichage ----------
function pubOkImg(s) { return typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s); }
function pubOkPdf(s) { return typeof s === 'string' && /^data:application\/pdf;base64,[A-Za-z0-9+\/=]+$/.test(s); }
function pubOkUrl(s) { return typeof s === 'string' && /^https:\/\/[^\s<>"']{3,290}$/.test(s); }
function pubYoutubeId(u) {
    const m = String(u || '').match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
}
function pubAgo(iso) {
    const t = Date.parse(iso); if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    if (s < 86400 * 7) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return formatISOtoFR(String(iso).slice(0, 10));
}
function pubKind(p) {
    const k = [];
    if ((p.images || []).length) k.push('photo');
    if (p.videoUrl) k.push('video');
    if (p.docUrl || p.docData) k.push('doc');
    return k;
}

// ---------- rendu d'une publication ----------
function pubCard(p) {
    const E = escapeHtml, admin = pubIsAdmin();
    const me = currentUser && currentUser.memberId;
    const likes = pubLikes.filter(l => l.postId === p.id), liked = !!me && likes.some(l => l.memberId === me);
    const coms = pubComments.filter(c => c.postId === p.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const imgs = (p.images || []).filter(pubOkImg);
    let media = '';
    if (imgs.length === 1) {
        media += '<div class="pub-ph single" onclick="pubZoom(\'' + E(p.id) + '\',0)"><div class="bg" style="background-image:url(' + imgs[0] + ')"></div><img class="fg" alt="" src="' + imgs[0] + '">' + pubBadge(p.id, 0) + '</div>';
    } else if (imgs.length > 1) {
        media += '<div class="pub-grid n' + imgs.length + '">' + imgs.map((s, i) => '<div class="pub-ph" onclick="pubZoom(\'' + E(p.id) + '\',' + i + ')"><img alt="" src="' + s + '">' + pubBadge(p.id, i) + '</div>').join('') + '</div>';
    }
    const yt = pubYoutubeId(p.videoUrl);
    if (yt) media += '<div style="position:relative;padding-top:min(56.25%,360px);max-width:640px;margin-bottom:10px;border-radius:8px;overflow:hidden;background:#000;"><iframe src="https://www.youtube-nocookie.com/embed/' + yt + '" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>';
    else if (pubOkUrl(p.videoUrl)) media += '<a class="btn-small" href="' + E(p.videoUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 6px 10px 0;text-decoration:none;"><i class="fa-solid fa-circle-play"></i> Voir la vidéo</a>';
    if (pubOkUrl(p.docUrl)) media += '<a class="btn-small" href="' + E(p.docUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 6px 10px 0;text-decoration:none;"><i class="fa-solid fa-file-lines"></i> ' + E(p.docName || 'Ouvrir le document') + '</a>';
    if (pubOkPdf(p.docData)) media += '<button type="button" class="btn-small" onclick="pubOpenDoc(\'' + E(p.id) + '\')" style="margin:0 6px 10px 0;"><i class="fa-solid fa-file-pdf"></i> ' + E(p.docName || 'Document PDF') + '</button>';
    const open = !!pubOpenComments[p.id];
    let h = '<article class="card pub-card" style="padding:14px 16px;' + (p.status === 'masqué' ? 'opacity:.55;' : '') + '">' +
        '<div class="pub-main"><div style="display:flex;align-items:flex-start;gap:8px;"><div style="flex:1;min-width:0;">' +
        '<h3 style="margin:0;font-size:1.05rem;">' + E(p.title || '') + (p.status === 'masqué' ? ' <span class="badge badge-due">Masquée</span>' : '') + '</h3>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);margin:2px 0 8px;">' + E(pubAgo(p.date)) + '</div></div>' +
        (admin ? '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="btn-small" onclick="pubToggleHide(\'' + E(p.id) + '\')" title="' + (p.status === 'masqué' ? 'Republier' : 'Masquer aux membres') + '"><i class="fa-solid ' + (p.status === 'masqué' ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
            (canDelete(currentUser) ? '<button type="button" class="btn-small danger" onclick="pubDelete(\'' + E(p.id) + '\')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>' : '') + '</div>' : '') +
        '</div>' + media +
        (p.text ? '<p style="margin:0 0 10px;white-space:pre-wrap;word-break:break-word;font-size:0.92rem;">' + E(p.text) + '</p>' : '') +
        '<div style="display:flex;gap:14px;align-items:center;border-top:1px solid var(--border);padding-top:8px;">' +
        (me ? '<button type="button" onclick="pubLike(\'' + E(p.id) + '\')" style="background:none;border:none;cursor:pointer;font-size:0.95rem;padding:2px 4px;color:' + (liked ? '#e11d48' : 'var(--text-muted)') + ';"><i class="fa-' + (liked ? 'solid' : 'regular') + ' fa-heart"></i> ' + likes.length + '</button>'
            : '<span style="font-size:0.9rem;color:var(--text-muted);"><i class="fa-solid fa-heart"></i> ' + likes.length + '</span>') +
        '<button type="button" class="pub-cbtn" onclick="pubToggleComments(\'' + E(p.id) + '\')" style="background:none;border:none;cursor:pointer;font-size:0.95rem;padding:2px 4px;color:var(--text-muted);"><i class="fa-regular fa-comment"></i> ' + coms.length + '</button></div>';
    h += '</div>';   // fin de la colonne de la publication
    {
        h += '<div class="pub-side' + (open ? ' open' : '') + '"><div class="pub-side-h">Commentaires (' + coms.length + ')</div>' + (coms.length ? coms.map(c => pubComHtml(c, p.id, true)).join('') : '<div style="font-size:0.85rem;color:var(--text-muted);padding:4px 0;">Aucun commentaire pour le moment.</div>');
        if (me) h += '<form onsubmit="pubComment(event,\'' + E(p.id) + '\')" style="display:flex;gap:6px;margin-top:8px;"><input type="text" id="pubCom-' + E(p.id) + '" maxlength="300" placeholder="Écrire un commentaire…" required style="flex:1;min-width:0;"><button type="submit" class="btn-small"><i class="fa-solid fa-paper-plane"></i></button></form>';
        h += '</div>';
    }
    return h + '</article>';
}
// un commentaire (withTag : indique la photo concernée, cliquable)
function pubBadge(postId, i) {
    const n = pubComments.filter(c => c.postId === postId && c.photo === i).length;
    return '<span class="pub-cb"><i class="fa-regular fa-comment"></i> ' + (n || '') + '</span>';
}
function pubComHtml(c, postId, withTag) {
    const E = escapeHtml, me = currentUser && currentUser.memberId, admin = pubIsAdmin();
    const has = Number.isInteger(c.photo) && c.photo >= 0;
    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.88rem;"><strong>' + E(c.name || '') + '</strong> <span style="color:var(--text-muted);font-size:0.75rem;">' + E(pubAgo(c.date)) + '</span>' +
        (withTag && has ? ' <a href="javascript:void(0)" onclick="pubZoom(\'' + E(postId) + '\',' + c.photo + ')" style="font-size:0.72rem;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:1px 7px;text-decoration:none;"><i class="fa-solid fa-image"></i> Photo ' + (c.photo + 1) + '</a>' : '') +
        ((c.memberId === me || (admin && canDelete(currentUser))) ? ' <button type="button" onclick="pubDeleteComment(\'' + E(c.id) + '\')" title="Supprimer" style="background:none;border:none;cursor:pointer;color:#b91c1c;font-size:0.8rem;"><i class="fa-solid fa-xmark"></i></button>' : '') +
        '<div style="white-space:pre-wrap;word-break:break-word;">' + E(c.text || '') + '</div></div>';
}
function pubFeedHtml() {
    const list = pubSorted().filter(p => pubFilter === 'all' || pubKind(p).indexOf(pubFilter) >= 0);
    const chips = [['all', 'Tout', 'fa-border-all'], ['photo', 'Photos', 'fa-image'], ['video', 'Vidéos', 'fa-circle-play'], ['doc', 'Documents', 'fa-file-lines']].map(c =>
        '<button type="button" class="subtab' + (pubFilter === c[0] ? ' active' : '') + '" onclick="pubSetFilter(\'' + c[0] + '\')"><i class="fa-solid ' + c[2] + '"></i> ' + c[1] + '</button>').join('');
    return '<div class="subtabs" style="flex-wrap:wrap;margin-bottom:12px;">' + chips + '</div>' +
        (list.length ? '<div class="pub-feed">' + list.map(pubCard).join('') + '</div>'
            : '<div class="card" style="text-align:center;color:var(--text-muted);padding:28px 16px;"><i class="fa-solid fa-images" style="font-size:1.8rem;margin-bottom:8px;display:block;"></i>Aucune publication pour le moment.</div>');
}
function pubKeepFocus(fn) {
    // ne pas perdre le commentaire en cours de frappe quand la liste se met à jour
    const a = document.activeElement, id = a && a.id && a.id.indexOf('pubCom-') === 0 ? a.id : '', v = id ? a.value : '';
    fn();
    if (id) { const n = document.getElementById(id); if (n) { n.value = v; n.focus(); } }
}
function pubRenderMember() {
    const box = document.getElementById('pubMemberFeed');
    if (!box || document.getElementById('mp-expo').classList.contains('hidden')) return;
    pubKeepFocus(() => { box.innerHTML = pubFeedHtml(); });
}
function pubRenderAdmin() {
    const box = document.getElementById('pubAdminFeed');
    if (!box || document.getElementById('panel-pub').classList.contains('hidden')) return;
    pubKeepFocus(() => { box.innerHTML = pubFeedHtml(); });
    pubRenderDraft();
}
function pubSetFilter(f) { pubFilter = f; pubRefresh(); }
function pubToggleComments(id) { pubOpenComments[id] = !pubOpenComments[id]; pubRefresh(); }

// ---------- actions des membres ----------
async function pubLike(postId) {
    const me = currentUser && currentUser.memberId; if (!me || !F()) return;
    const id = postId + '_' + me, has = pubLikes.some(l => l.id === id);
    try {
        if (has) await F().write('postLikes', [], [id]);
        else await F().write('postLikes', [{ id: id, data: { postId: postId, memberId: me, date: new Date().toISOString() } }], []);
    } catch (e) { alert("Impossible d'enregistrer votre « j'aime » : " + errText(e)); }
}
async function pubComment(e, postId, photo) {
    e.preventDefault();
    const me = currentUser && currentUser.memberId, m = members.find(x => x.id === me);
    const inp = document.getElementById(Number.isInteger(photo) ? 'pubCom-zoom' : 'pubCom-' + postId), text = (inp.value || '').trim().slice(0, 300);
    if (!me || !m || !text || !F()) return;
    const id = 'C' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    try {
        await F().write('postComments', [{ id: id, data: Object.assign({ id: id, postId: postId, memberId: me, name: m.name, text: text, date: new Date().toISOString() }, Number.isInteger(photo) ? { photo: photo } : {}) }], []);
        inp.value = '';
    } catch (err) { alert('Commentaire non enregistré : ' + errText(err)); }
}
async function pubDeleteComment(id) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    try { await F().write('postComments', [], [id]); } catch (e) { alert('Suppression impossible : ' + errText(e)); }
}
function pubOpenDoc(postId) {
    const p = pubPosts.find(x => x.id === postId); if (!p || !pubOkPdf(p.docData)) return;
    try {
        const bin = atob(p.docData.split(',')[1]), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([u], { type: 'application/pdf' }));
        if (!window.open(url, '_blank')) { const a = document.createElement('a'); a.href = url; a.download = (p.docName || 'document') + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { alert("Le document n'a pas pu être ouvert."); }
}
let pubZ = { postId: '', imgs: [], i: 0 };
function pubZoom(postId, idx) {
    const p = pubPosts.find(x => x.id === postId); if (!p) return;
    pubZ = { postId: postId, imgs: (p.images || []).filter(pubOkImg), i: idx || 0 };
    if (!pubZ.imgs.length) return;
    let z = document.getElementById('pubZoom');
    if (!z) {
        const s = document.createElement('style');
        s.textContent = '#pubZoom{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:3000;display:none;flex-direction:column;}' +
            '#pubZoom .pz-img{position:relative;flex:1 1 55%;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;}' +
            '#pubZoom .pz-img img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;cursor:zoom-out;}' +
            '#pubZoom .pz-side{flex:0 0 42%;background:#fff;overflow-y:auto;padding:12px 14px;border-radius:14px 14px 0 0;}' +
            '#pubZoom .pz-x{position:absolute;top:10px;right:12px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:50%;width:38px;height:38px;font-size:1.2rem;cursor:pointer;z-index:2;}' +
            '@media (min-width:900px){#pubZoom{flex-direction:row;}#pubZoom .pz-img{flex:1 1 auto;}#pubZoom .pz-side{flex:0 0 360px;border-radius:0;}}';
        document.head.appendChild(s);
        z = document.createElement('div'); z.id = 'pubZoom';
        z.innerHTML = '<div class="pz-img" id="pzImg"><img alt=""><button type="button" class="pz-x" onclick="pubZoomClose()" title="Fermer">×</button>' +
            '<button type="button" class="pub-nav" id="pubPrev" style="left:12px;" onclick="pubZoomStep(-1)">‹</button><button type="button" class="pub-nav" id="pubNext" style="right:12px;" onclick="pubZoomStep(1)">›</button>' +
            '<div id="pubCount" style="position:absolute;bottom:10px;left:0;right:0;text-align:center;color:#fff;font-size:0.85rem;"></div></div><div class="pz-side" id="pzSide"></div>';
        z.querySelector('img').onclick = pubZoomClose;
        document.body.appendChild(z);
        document.addEventListener('keydown', e => {
            if (z.style.display === 'none' || (e.target && e.target.tagName === 'INPUT')) return;
            if (e.key === 'Escape') pubZoomClose(); else if (e.key === 'ArrowLeft') pubZoomStep(-1); else if (e.key === 'ArrowRight') pubZoomStep(1);
        });
    }
    z.style.display = 'flex'; pubZoomShow();
}
function pubZoomClose() { const z = document.getElementById('pubZoom'); if (z) z.style.display = 'none'; }
function pubZoomStep(d) { const n = pubZ.imgs.length; if (n < 2) return; pubZ.i = (pubZ.i + d + n) % n; pubZoomShow(); }
function pubZoomShow() {
    const z = document.getElementById('pubZoom'); if (!z || z.style.display === 'none') return;
    const n = pubZ.imgs.length, E = escapeHtml, me = currentUser && currentUser.memberId;
    z.querySelector('#pzImg img').src = pubZ.imgs[pubZ.i];
    document.getElementById('pubPrev').style.display = document.getElementById('pubNext').style.display = n > 1 ? '' : 'none';
    document.getElementById('pubCount').textContent = n > 1 ? (pubZ.i + 1) + ' / ' + n : '';
    const coms = pubComments.filter(c => c.postId === pubZ.postId && c.photo === pubZ.i).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const side = document.getElementById('pzSide'), a = document.activeElement, keep = a && a.id === 'pubCom-zoom' ? a.value : null;
    side.innerHTML = '<div class="pub-side-h">Commentaires sur cette photo (' + coms.length + ')</div>' +
        (coms.length ? coms.map(c => pubComHtml(c, pubZ.postId, false)).join('') : '<div style="font-size:0.85rem;color:var(--text-muted);padding:4px 0;">Aucun commentaire sur cette photo.</div>') +
        (me ? '<form onsubmit="pubComment(event,\'' + E(pubZ.postId) + '\',' + pubZ.i + ')" style="display:flex;gap:6px;margin-top:10px;"><input type="text" id="pubCom-zoom" maxlength="300" placeholder="Commenter cette photo…" required style="flex:1;min-width:0;"><button type="submit" class="btn-small"><i class="fa-solid fa-paper-plane"></i></button></form>' : '');
    if (keep !== null) { const inp = document.getElementById('pubCom-zoom'); if (inp) { inp.value = keep; inp.focus(); } }
}
function pubShowMember() { pubMarkSeen(); pubRenderMember(); }

// ---------- espace de l'équipe : publier / modérer ----------
function pubResizeImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
            try {
                let max = 1100, q = 0.78;
                for (let i = 0; i < 12; i++) {
                    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
                    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
                    const d = c.toDataURL('image/jpeg', q);
                    if (d.length <= PUB_IMG_CHARS) { URL.revokeObjectURL(url); resolve(d); return; }
                    if (q > 0.5) q -= 0.08; else max = Math.round(max * 0.8);
                }
                URL.revokeObjectURL(url); reject(new Error('image trop lourde'));
            } catch (e) { reject(e); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
        img.src = url;
    });
}
async function pubPickImages(input) {
    const files = Array.from(input.files || []); input.value = '';
    for (const f of files) {
        if (pubDraftImages.length >= PUB_MAX_IMAGES) { pubMsg('Trois photos au maximum par publication.', false); break; }
        if (!/^image\//.test(f.type)) { pubMsg('« ' + f.name + ' » n\'est pas une image.', false); continue; }
        try { pubDraftImages.push(await pubResizeImage(f)); } catch (e) { pubMsg('Photo « ' + f.name + ' » refusée : ' + errText(e), false); }
    }
    pubRenderDraft();
}
function pubPickPdf(input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf') { pubMsg('Choisissez un fichier PDF (ou collez plutôt un lien).', false); return; }
    if (f.size > PUB_PDF_MAX) { pubMsg('PDF trop lourd (' + Math.round(f.size / 1024) + ' Ko). Maximum 350 Ko : pour un fichier plus gros, collez un lien (Google Drive, par exemple).', false); return; }
    const r = new FileReader();
    r.onload = () => { pubDraftDoc = { data: String(r.result), name: f.name.replace(/\.pdf$/i, '').slice(0, 60) }; pubRenderDraft(); };
    r.readAsDataURL(f);
}
function pubDropImage(i) { pubDraftImages.splice(i, 1); pubRenderDraft(); }
function pubDropDoc() { pubDraftDoc = null; pubRenderDraft(); }
function pubRenderDraft() {
    const a = document.getElementById('pubDraftImgs'); if (!a) return;
    a.innerHTML = pubDraftImages.map((s, i) => '<span style="position:relative;display:inline-block;margin:0 6px 6px 0;"><img alt="" src="' + s + '" style="height:64px;border-radius:6px;border:1px solid var(--border);"><button type="button" onclick="pubDropImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;background:#b91c1c;color:#fff;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:0.65rem;line-height:1;">×</button></span>').join('') +
        (pubDraftDoc ? '<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"><i class="fa-solid fa-file-pdf"></i> ' + escapeHtml(pubDraftDoc.name) + ' <button type="button" onclick="pubDropDoc()" style="background:none;border:none;cursor:pointer;color:#b91c1c;">×</button></span>' : '');
}
function pubMsg(text, ok) {
    const b = document.getElementById('pubMsg'); if (!b) return;
    b.className = 'alert ' + (ok ? 'alert-success' : 'alert-error'); b.style.display = 'block'; b.textContent = text;
}
async function pubSave(e) {
    e.preventDefault();
    if (!requireAdmin() || pubBusy) return;
    const g = id => (document.getElementById(id).value || '').trim();
    const title = g('pubTitle').slice(0, 80), text = g('pubText').slice(0, 1000), video = g('pubVideo'), doc = g('pubDocUrl');
    if (!title) { pubMsg('Donnez un titre à la publication.', false); return; }
    if (video && !pubOkUrl(video)) { pubMsg('Le lien de la vidéo doit commencer par https://', false); return; }
    if (doc && !pubOkUrl(doc)) { pubMsg('Le lien du document doit commencer par https://', false); return; }
    if (!pubDraftImages.length && !video && !doc && !pubDraftDoc && !text) { pubMsg('Ajoutez au moins du texte, une photo, une vidéo ou un document.', false); return; }
    const id = 'P' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const data = { id: id, title: title, text: text, images: pubDraftImages.slice(), videoUrl: video, docUrl: doc, docName: pubDraftDoc ? pubDraftDoc.name : g('pubDocName').slice(0, 60),
        docData: pubDraftDoc ? pubDraftDoc.data : '', status: 'publié', date: new Date().toISOString(), by: String(currentUser.username).slice(0, 80) };
    pubBusy = true;
    try {
        await F().write('posts', [{ id: id, data: data }], []);
        pubDraftImages = []; pubDraftDoc = null; e.target.reset(); pubRenderDraft();
        pubMsg('Publication en ligne : les membres la voient maintenant.', true);
        logActivity('Publication ajoutée : ' + title);
    } catch (err) { pubMsg('Publication impossible : ' + errText(err) + ' (les règles Firestore sont-elles republiées ?)', false); }
    pubBusy = false;
}
async function pubToggleHide(id) {
    if (!requireAdmin()) return;
    const p = pubPosts.find(x => x.id === id); if (!p) return;
    const d = Object.assign({}, p); delete d.id; d.id = p.id; d.status = p.status === 'masqué' ? 'publié' : 'masqué';
    try { await F().write('posts', [{ id: id, data: d }], []); } catch (e) { alert('Modification impossible : ' + errText(e)); }
}
async function pubDelete(id) {
    if (!requireAdmin() || !canDelete(currentUser)) return;
    if (!confirm('Supprimer définitivement cette publication, avec ses « j\'aime » et ses commentaires ?')) return;
    try {
        await F().write('postLikes', [], pubLikes.filter(l => l.postId === id).map(l => l.id));
        await F().write('postComments', [], pubComments.filter(c => c.postId === id).map(c => c.id));
        await F().write('posts', [], [id]);
        logActivity('Publication supprimée');
    } catch (e) { alert('Suppression impossible : ' + errText(e)); }
}
