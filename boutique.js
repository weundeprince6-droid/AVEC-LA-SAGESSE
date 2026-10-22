// Boutique des membres : chaque membre ouvre sa boutique, publie des articles (après validation de l'équipe)
// et les autres membres peuvent les acheter. Le prix est prélevé sur l'épargne de l'acheteur,
// 95 % vont à l'épargne du vendeur et 5 % à la caisse de l'AVEC.
// Fonctionne en mode en ligne seulement (les membres doivent être connectés à la même base).
// Ce fichier est chargé après index.html et utilise ses fonctions (fmt, round2, sav, setSav, logOp, ...).

const SHOP_RATE = 0.05;
let bqShops = [], bqItems = [], bqOrders = [], bqSub = 'catalogue', bqPhotoData = '', bqEditId = null;

function bqReset() { bqShops = []; bqItems = []; bqOrders = []; bqPhotoData = ''; bqEditId = null; }
// L'adaptateur appelle h.shops(list), h.items(list), h.orders(list)
const bqOnData = { shops: l => { bqShops = l; bqRefresh(); }, items: l => { bqItems = l; bqRefresh(); }, orders: l => { bqOrders = l; bqRefresh(); if (currentUser && isAdmin(currentUser)) updateDashboard(); } };

function bqSplit(price) {
    const commission = round2(price * SHOP_RATE);
    return { commission: commission, net: round2(price - commission) };
}
function bqCommission(d) { return round2(bqOrders.filter(o => o.status === 'conclue' && devOf(o) === d).reduce((t, o) => t + (Number(o.commission) || 0), 0)); }
// Activité : un versement d'épargne dans les 14 derniers jours
const BQ_ACTIVE_DAYS = 14;
function bqDay(iso) { return Math.floor(Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z') / 86400000); }
function bqLastSaving(m) {
    let last = Number(m && m.lastEpargneDay) || 0;
    ((m && m.history) || []).forEach(h => { if (h.type === 'epargne' && h.date) { const d = bqDay(h.date); if (isFinite(d) && d > last) last = d; } });
    return last;
}
function bqActiveInfo(m) {
    const last = bqLastSaving(m), today = bqDay(todayISO());
    if (!last) return { ok: false, last: 0, left: 0 };
    const age = today - last;
    return { ok: age <= BQ_ACTIVE_DAYS, last: last, left: BQ_ACTIVE_DAYS - age };
}
function bqId(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function bqMe() { return currentUser && currentUser.role === 'member' ? currentUser.memberId : ''; }
function bqMyMember() { return members.find(x => x.id === bqMe()); }
function bqSay(text, ok) {
    const box = document.getElementById('bqNotice');
    if (!box) return;
    box.className = 'alert ' + (ok ? 'alert-success' : 'alert-error');
    box.textContent = text;
    clearTimeout(bqSay.t);
    bqSay.t = setTimeout(() => { box.className = 'alert hidden'; }, 7000);
}
function bqStatusBadge(st) {
    const cls = { 'validée': 'badge-ok', 'publié': 'badge-ok', 'conclue': 'badge-ok', 'acceptée': 'badge-due', 'en attente': 'badge-due' }[st] || 'badge-late';
    const txt = { 'validée': 'Ouverte', 'masquée': 'Masquée', 'publié': 'Publié', 'conclue': 'Vente conclue', 'acceptée': 'Acceptée', 'en attente': 'En attente', 'refusée': 'Refusée', 'annulée': 'Annulée', 'masqué': 'Masqué par l\'administrateur', 'retiré': 'Retiré', 'vendu': 'Épuisé' }[st] || st;
    return '<span class="badge ' + cls + '">' + escapeHtml(txt) + '</span>';
}
function bqRefresh() {
    if (!currentUser) return;
    if (isAdmin(currentUser)) { bqRenderAdmin(); return; }
    bqRenderMember();
}
function bqImg(src, h) {
    if (typeof src === 'string' && src.indexOf('data:image/jpeg;base64,') === 0) return '<img alt="" src="' + src + '" style="width:100%;height:' + (h || 130) + 'px;object-fit:cover;border-radius:8px;background:#f1f5f9;">';
    return '<div style="width:100%;height:' + (h || 130) + 'px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1.8rem;"><i class="fa-solid fa-box-open"></i></div>';
}

// ================= Espace du membre =================
function bqShowSub(which) {
    bqSub = which;
    ['catalogue', 'ma', 'cmd'].forEach(t => {
        setHidden('bq-' + t, t !== which);
        const b = document.getElementById('bqSubBtn-' + t);
        if (b) { if (t === which) b.classList.add('active'); else b.classList.remove('active'); }
    });
    bqRenderMember();
}
function bqRenderMember() {
    const me = bqMe();
    if (!me) return;
    const m = bqMyMember();
    const myShop = bqShops.find(s => s.id === me);
    // pastille : commandes à traiter (ventes en attente)
    const todo = bqOrders.filter(o => o.sellerId === me && o.status === 'en attente').length;
    const bd = document.getElementById('bqMemberBadge');
    if (bd) { bd.textContent = todo; setHidden('bqMemberBadge', !(todo > 0)); }
    const cb = document.getElementById('bqCmdBadge');
    if (cb) { cb.textContent = todo; setHidden('bqCmdBadge', !(todo > 0)); }
    ['catalogue', 'ma', 'cmd'].forEach(t => setHidden('bq-' + t, t !== bqSub));

    if (m) {
        const bal = document.getElementById('bqBalance');
        if (bal) bal.innerHTML = 'Votre épargne disponible pour acheter (en gardant le tiers de votre crédit) : <span style="color:var(--primary);">' + fmt(availableWithdrawal(m, 'USD'), 'USD') + '</span> · <span style="color:var(--primary);">' + fmt(availableWithdrawal(m, 'FC'), 'FC') + '</span>';
    }
    bqRenderShowcase();
    // --- catalogue ---
    const q = normText((document.getElementById('bqSearch') || {}).value || '');
    const shopOf = id => bqShops.find(s => s.id === id);
    const list = bqItems.filter(i => i.status === 'publié' && i.ownerId !== me && (i.qty || 0) > 0 && (!shopOf(i.ownerId) || shopOf(i.ownerId).status === 'validée') &&
        (!q || normText(i.title + ' ' + i.desc + ' ' + (i.shopName || '') + ' ' + (i.ownerName || '')).indexOf(q) > -1));
    const cat = document.getElementById('bqCatalog');
    if (cat) {
        cat.innerHTML = list.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;">' + list.map(i => {
            const open = bqOrders.some(o => o.itemId === i.id && o.buyerId === me && (o.status === 'en attente' || o.status === 'acceptée'));
            return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff;">' + bqImg(i.photo) +
                '<div style="font-weight:700;margin-top:8px;">' + escapeHtml(i.title) + '</div>' +
                '<div style="font-size:0.8rem;color:var(--text-muted);">' + escapeHtml(i.shopName || '') + ' · ' + escapeHtml(i.ownerName || '') + '</div>' +
                (i.desc ? '<div style="font-size:0.82rem;margin-top:4px;">' + escapeHtml(i.desc) + '</div>' : '') +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:6px;"><strong style="color:var(--primary);">' + fmt(i.price, i.devise) + '</strong><small style="color:var(--text-muted);">Stock : ' + i.qty + '</small></div>' +
                (open ? '<div style="margin-top:8px;font-size:0.82rem;">' + bqStatusBadge('en attente') + ' commande en cours</div>'
                      : '<button type="button" class="btn" style="margin-top:8px;padding:8px;" onclick="bqBuy(\'' + escapeHtml(i.id) + '\')"><i class="fa-solid fa-wallet"></i> Payer avec mon épargne</button>' +
                      '<button type="button" class="btn" style="margin-top:6px;padding:8px;background:#128c7e;" onclick="bqContact(\'' + escapeHtml(i.id) + '\')"><i class="fa-solid fa-handshake"></i> Contacter le vendeur</button>') +
                '</div>';
        }).join('') + '</div>' : '<p style="color:var(--text-muted);">Aucun article disponible pour le moment.</p>';
    }
    // --- ma boutique ---
    const st = document.getElementById('bqShopState');
    if (st) st.innerHTML = myShop ? bqStatusBadge(myShop.status) : '';
    const nm = document.getElementById('bqShopName');
    if (nm && document.activeElement !== nm && document.activeElement && !['bqShopDesc', 'bqShopContact'].includes(document.activeElement.id)) {
        nm.value = myShop ? myShop.name : (nm.value || '');
        document.getElementById('bqShopDesc').value = myShop ? (myShop.desc || '') : document.getElementById('bqShopDesc').value;
        document.getElementById('bqShopContact').value = myShop ? (myShop.contact || '') : document.getElementById('bqShopContact').value;
    }
    setHidden('bqItemCard', !myShop);
    const act = m ? bqActiveInfo(m) : { ok: false };
    const ab = document.getElementById('bqActiveBox');
    if (ab && m) {
        ab.className = 'alert ' + (act.ok ? 'alert-success' : 'alert-error');
        ab.textContent = act.ok ? 'Vous êtes actif : dernier versement d\'épargne le ' + formatISOtoFR(new Date(act.last * 86400000).toISOString().slice(0, 10)) + '. Vous pouvez publier encore pendant ' + Math.max(0, act.left) + ' jour(s) sans nouveau versement.'
            : 'Pour publier un article, vous devez avoir versé de l\'épargne dans les ' + BQ_ACTIVE_DAYS + ' derniers jours' + (act.last ? ' (dernier versement le ' + formatISOtoFR(new Date(act.last * 86400000).toISOString().slice(0, 10)) + ')' : ' (aucun versement enregistré)') + '. Faites un versement auprès de l\'administrateur, puis revenez.';
    }
    const itemForm = document.querySelector('#bqItemCard form');
    if (itemForm) itemForm.style.display = act.ok ? '' : 'none';
    const mine = bqItems.filter(i => i.ownerId === me).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const mi = document.getElementById('bqMyItems');
    if (mi) mi.innerHTML = mine.length ? mine.map(i =>
        '<div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border);padding:8px 0;flex-wrap:wrap;">' +
        '<div style="width:56px;">' + bqImg(i.photo, 56) + '</div>' +
        '<div style="flex:1;min-width:160px;"><strong>' + escapeHtml(i.title) + '</strong> ' + bqStatusBadge(i.status) + '<br><span style="font-size:0.85rem;">' + fmt(i.price, i.devise) + ' · stock ' + i.qty + '</span></div>' +
        (i.status === 'publié' ? '<button type="button" class="btn-small" onclick="bqHideItem(\'' + escapeHtml(i.id) + '\')">Retirer</button>' : '') +
        (i.status === 'retiré' ? '<button type="button" class="btn-small" onclick="bqRepublish(\'' + escapeHtml(i.id) + '\')">Remettre en vente</button>' : '') +
        (i.status !== 'vendu' ? '<button type="button" class="btn-small danger" onclick="bqDeleteItem(\'' + escapeHtml(i.id) + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
        '</div>').join('') : '<p style="color:var(--text-muted);">Vous n\'avez pas encore d\'article.</p>';
    // --- commandes ---
    const orderLine = (o, sell) => {
        const who = sell ? 'Acheteur : ' + escapeHtml(o.buyerName || o.buyerId) : 'Vendeur : ' + escapeHtml(o.sellerName || o.sellerId);
        let act = '';
        if (sell && o.status === 'en attente') act = '<button type="button" class="btn-small" onclick="bqSellerAnswer(\'' + escapeHtml(o.id) + '\',true)"><i class="fa-solid fa-check"></i> Accepter</button><button type="button" class="btn-small danger" onclick="bqSellerAnswer(\'' + escapeHtml(o.id) + '\',false)">Refuser</button>';
        if (!sell && (o.status === 'en attente' || o.status === 'acceptée')) act = '<button type="button" class="btn-small danger" onclick="bqCancelOrder(\'' + escapeHtml(o.id) + '\')">Annuler</button>';
        const extra = o.status === 'conclue' ? '<br><span style="font-size:0.82rem;color:var(--text-muted);">' + (sell ? 'Vous avez reçu ' + fmt(o.net, o.devise) + ' (commission AVEC ' + fmt(o.commission, o.devise) + ').' : 'Payé ' + fmt(o.price, o.devise) + ' depuis votre épargne.') + '</span>'
            : (o.status === 'acceptée' ? '<br><span style="font-size:0.82rem;color:var(--text-muted);">Le vendeur a accepté ; l\'administrateur va conclure la vente.</span>' : '');
        return '<div style="border-bottom:1px solid var(--border);padding:8px 0;"><strong>' + escapeHtml(o.itemTitle) + '</strong> · ' + fmt(o.price, o.devise) + ' ' + bqStatusBadge(o.status) +
            '<br><span style="font-size:0.85rem;color:var(--text-muted);">' + who + ' · ' + escapeHtml(formatISOtoFR(String(o.date).slice(0, 10))) + '</span>' + extra + (act ? '<div style="margin-top:6px;">' + act + '</div>' : '') + '</div>';
    };
    const byDate = (a, b) => String(b.date).localeCompare(String(a.date));
    const buy = bqOrders.filter(o => o.buyerId === me).sort(byDate), sell = bqOrders.filter(o => o.sellerId === me).sort(byDate);
    const eb = document.getElementById('bqOrdersBuy'), es = document.getElementById('bqOrdersSell');
    if (eb) eb.innerHTML = buy.length ? buy.map(o => orderLine(o, false)).join('') : '<p style="color:var(--text-muted);">Aucun achat pour le moment.</p>';
    if (es) es.innerHTML = sell.length ? sell.map(o => orderLine(o, true)).join('') : '<p style="color:var(--text-muted);">Aucune vente pour le moment.</p>';
}
function bqRenderCatalog() { bqRenderMember(); }

function bqSaveShop(e) {
    e.preventDefault();
    const me = bqMe(), m = bqMyMember();
    if (!me || !m || !F() || !F().saveShop) { bqSay("La mise à jour n'est pas chargée : appuyez sur Ctrl+F5 puis réessayez.", false); return; }
    const old = bqShops.find(s => s.id === me);
    const shop = {
        id: me, ownerId: me, ownerName: m.name,
        name: document.getElementById('bqShopName').value.trim().slice(0, 50),
        desc: document.getElementById('bqShopDesc').value.trim().slice(0, 300),
        contact: document.getElementById('bqShopContact').value.trim().slice(0, 60),
        status: old ? old.status : 'validée',
        date: old ? old.date : new Date().toISOString()
    };
    if (!shop.name) { bqSay('Donnez un nom à votre boutique.', false); return; }
    F().saveShop(shop)
        .then(() => bqSay(old ? 'Boutique mise à jour.' : 'Boutique créée. Vous pouvez maintenant ajouter vos articles.', true))
        .catch(err => bqSay('Enregistrement impossible : ' + errText(err), false));
}
function bqPhoto(input) {
    const f = input && input.files && input.files[0];
    const prev = document.getElementById('bqPhotoPrev');
    if (!f) { bqPhotoData = ''; if (prev) prev.innerHTML = ''; return; }
    if (!/^image\//.test(f.type)) { bqSay('Choisissez une image.', false); input.value = ''; return; }
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
        try {
            const W = 480, k = Math.min(1, W / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            let out = cv.toDataURL('image/jpeg', 0.72);
            if (out.length > 110000) out = cv.toDataURL('image/jpeg', 0.5);
            URL.revokeObjectURL(url);
            if (out.length > 115000) { bqSay('Photo trop lourde. Choisissez une photo plus petite.', false); bqPhotoData = ''; return; }
            bqPhotoData = out;
            if (prev) prev.innerHTML = '<img alt="" src="' + out + '" style="height:80px;border-radius:8px;">';
        } catch (err) { bqSay('Photo illisible.', false); }
    };
    img.onerror = () => bqSay('Photo illisible. Essayez le format JPG ou PNG.', false);
    img.src = url;
}
function bqSaveItem(e) {
    e.preventDefault();
    const me = bqMe(), m = bqMyMember(), shop = bqShops.find(s => s.id === me);
    if (!me || !m || !shop || !F() || !F().saveItem) { bqSay("Créez d'abord votre boutique.", false); return; }
    if (!bqActiveInfo(m).ok) { bqSay('Pour publier un article, versez de l\'épargne : un versement dans les ' + BQ_ACTIVE_DAYS + ' derniers jours est nécessaire.', false); return; }
    const price = round2(parseFloat(document.getElementById('bqItemPrice').value));
    const qty = parseInt(document.getElementById('bqItemQty').value, 10);
    if (!isFinite(price) || price <= 0) { bqSay('Indiquez un prix valide.', false); return; }
    if (!isFinite(qty) || qty < 1) { bqSay('Indiquez une quantité valide.', false); return; }
    const item = {
        id: bqId('IT'), ownerId: me, ownerName: m.name, shopName: shop.name,
        title: document.getElementById('bqItemTitle').value.trim().slice(0, 60),
        desc: document.getElementById('bqItemDesc').value.trim().slice(0, 300),
        price: price, devise: document.getElementById('bqItemDev').value === 'FC' ? 'FC' : 'USD',
        qty: qty, photo: bqPhotoData || '', status: 'publié', date: new Date().toISOString()
    };
    if (!item.title) { bqSay("Donnez un nom à l'article.", false); return; }
    F().saveItem(item).then(() => {
        bqSay('Article publié : les autres membres peuvent le voir.', true);
        ['bqItemTitle', 'bqItemDesc', 'bqItemPrice'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('bqItemQty').value = '1'; document.getElementById('bqItemPhoto').value = '';
        document.getElementById('bqPhotoPrev').innerHTML = ''; bqPhotoData = '';
    }).catch(err => bqSay('Envoi impossible : ' + errText(err), false));
}
function bqHideItem(id) {
    if (!confirm('Retirer cet article de la vente ?')) return;
    F().patchItem(id, { status: 'retiré' }).catch(err => bqSay('Impossible : ' + errText(err), false));
}
function bqRepublish(id) {
    const m = bqMyMember();
    if (!m || !bqActiveInfo(m).ok) { bqSay('Pour remettre un article en vente, un versement d\'épargne dans les ' + BQ_ACTIVE_DAYS + ' derniers jours est nécessaire.', false); return; }
    F().patchItem(id, { status: 'publié' }).then(() => bqSay('Article remis en vente.', true)).catch(err => bqSay('Impossible : ' + errText(err), false));
}
function bqDeleteItem(id) {
    if (!confirm('Supprimer définitivement cet article ?')) return;
    F().removeItem(id).catch(err => bqSay('Impossible : ' + errText(err), false));
}
function bqBuy(id) {
    const me = bqMe(), m = bqMyMember(), it = bqItems.find(x => x.id === id);
    if (!m || !it || it.status !== 'publié' || it.ownerId === me) return;
    if (round2(it.price) > availableWithdrawal(m, it.devise)) {
        const keepB = round2(memberOutstanding(m, it.devise) / 3);
        bqSay('Votre épargne disponible pour acheter (' + fmt(availableWithdrawal(m, it.devise), it.devise) + ') ne suffit pas pour cet article à ' + fmt(it.price, it.devise) + '.' + (keepB > 0 ? ' Votre épargne doit rester au moins égale au tiers de votre crédit en cours (' + fmt(keepB, it.devise) + ').' : ''), false);
        return;
    }
    if (!confirm('Commander « ' + it.title + ' » pour ' + fmt(it.price, it.devise) + ' ?\nLe montant sera prélevé sur votre épargne quand l\'administrateur conclura la vente, après accord du vendeur.')) return;
    const sp = bqSplit(it.price);
    const order = {
        id: bqId('CMD'), itemId: it.id, itemTitle: it.title, sellerId: it.ownerId, sellerName: it.ownerName || '',
        buyerId: me, buyerName: m.name, price: it.price, devise: it.devise, commission: sp.commission, net: sp.net, qty: 1,
        note: '', status: 'en attente', decision: '', date: new Date().toISOString(), decisionDate: ''
    };
    F().createOrder(order).then(() => { bqSay('Commande envoyée au vendeur.', true); bqShowSub('cmd'); }).catch(err => bqSay('Commande impossible : ' + errText(err), false));
}
function bqSellerAnswer(id, yes) {
    if (!yes && !confirm('Refuser cette commande ?')) return;
    F().patchOrder(id, { status: yes ? 'acceptée' : 'refusée', decision: yes ? 'Acceptée par le vendeur.' : 'Refusée par le vendeur.', decisionDate: todayISO() })
        .catch(err => bqSay('Impossible : ' + errText(err), false));
}
function bqCancelOrder(id) {
    if (!confirm('Annuler cette commande ?')) return;
    F().patchOrder(id, { status: 'annulée', decision: 'Annulée par l\'acheteur.', decisionDate: todayISO() }).catch(err => bqSay('Impossible : ' + errText(err), false));
}

// ================= Espace de l'équipe =================
function bqAdminSay(text, ok) { alert(text); }
let bqBackfilled = false;
function bqBackfill() {
    // une seule fois par session : inscrit sur chaque fiche le jour du dernier versement (utilisé par les règles de sécurité)
    if (bqBackfilled || !CLOUD || !cloudLoaded.members || !members.length) return;
    bqBackfilled = true;
    let changed = false;
    members.forEach(m => { const d = bqLastSaving(m); if (d && Number(m.lastEpargneDay) !== d) { m.lastEpargneDay = d; changed = true; } });
    if (changed) store.set('avec_members', members);
}
function bqRenderAdmin() {
    if (!currentUser || !isAdmin(currentUser) || !CLOUD) return;
    bqBackfill();
    bqRenderShowcase();
    const orders = bqOrders.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const done = orders.filter(o => o.status === 'conclue');
    const com = d => round2(done.filter(o => devOf(o) === d).reduce((t, o) => t + (Number(o.commission) || 0), 0));
    const pendShops = [], pendItems = [];
    const toConclude = orders.filter(o => o.status === 'acceptée' || o.status === 'en attente');
    const badge = document.getElementById('bqAdminBadge');
    const n = orders.filter(o => o.status === 'acceptée').length;
    if (badge) { badge.textContent = n; setHidden('bqAdminBadge', !(n > 0)); }
    const stat = (t, v) => '<div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:10px;"><div style="font-size:0.78rem;color:var(--text-muted);">' + t + '</div><div style="font-weight:800;font-size:1.1rem;">' + v + '</div></div>';
    const stats = document.getElementById('bqAdminStats');
    if (stats) stats.innerHTML = stat('Commissions encaissées (USD)', fmt(com('USD'), 'USD')) + stat('Commissions encaissées (FC)', fmt(com('FC'), 'FC')) + stat('Ventes conclues', done.length) + stat('Commandes à conclure', n);

    const sellerInfo = o => escapeHtml(o.buyerName || o.buyerId) + ' → ' + escapeHtml(o.sellerName || o.sellerId);
    const ob = document.getElementById('bqAdminOrders');
    if (ob) ob.innerHTML = orders.length ? orders.slice(0, 80).map(o =>
        '<div style="border-bottom:1px solid var(--border);padding:8px 0;"><strong>' + escapeHtml(o.itemTitle) + '</strong> · ' + fmt(o.price, o.devise) + ' ' + bqStatusBadge(o.status) +
        '<br><span style="font-size:0.85rem;color:var(--text-muted);">' + sellerInfo(o) + ' · ' + escapeHtml(formatISOtoFR(String(o.date).slice(0, 10))) +
        (o.status === 'conclue' ? ' · commission ' + fmt(o.commission, o.devise) + ' · vendeur reçoit ' + fmt(o.net, o.devise) : '') + '</span>' +
        (o.status === 'acceptée' || o.status === 'en attente' ? '<div style="margin-top:6px;"><button type="button" class="btn-small" onclick="bqConclude(\'' + escapeHtml(o.id) + '\')"><i class="fa-solid fa-handshake"></i> Conclure la vente</button><button type="button" class="btn-small danger" onclick="bqRefuseOrder(\'' + escapeHtml(o.id) + '\')">Refuser</button>' +
            (o.status === 'en attente' ? ' <small style="color:var(--text-muted);">le vendeur n\'a pas encore répondu</small>' : '') + '</div>' : '') + '</div>').join('') : '<p style="color:var(--text-muted);">Aucune commande.</p>';

    const pend = document.getElementById('bqAdminPending');
    if (pend) pend.innerHTML = (pendShops.length || pendItems.length) ?
        pendShops.map(s => '<div style="border-bottom:1px solid var(--border);padding:8px 0;"><i class="fa-solid fa-shop"></i> <strong>' + escapeHtml(s.name) + '</strong> · ' + escapeHtml(s.ownerName || s.id) + (s.desc ? '<br><span style="font-size:0.85rem;">' + escapeHtml(s.desc) + '</span>' : '') +
            '<div style="margin-top:6px;"><button type="button" class="btn-small" onclick="bqShopStatus(\'' + escapeHtml(s.id) + '\',\'validée\')"><i class="fa-solid fa-check"></i> Valider</button><button type="button" class="btn-small danger" onclick="bqShopStatus(\'' + escapeHtml(s.id) + '\',\'masquée\')">Refuser</button></div></div>').join('') +
        pendItems.map(i => '<div style="display:flex;gap:10px;border-bottom:1px solid var(--border);padding:8px 0;flex-wrap:wrap;"><div style="width:70px;">' + bqImg(i.photo, 70) + '</div><div style="flex:1;min-width:170px;"><strong>' + escapeHtml(i.title) + '</strong> · ' + fmt(i.price, i.devise) + ' · stock ' + i.qty +
            '<br><span style="font-size:0.85rem;color:var(--text-muted);">' + escapeHtml(i.shopName || '') + ' · ' + escapeHtml(i.ownerName || '') + '</span>' + (i.desc ? '<br><span style="font-size:0.85rem;">' + escapeHtml(i.desc) + '</span>' : '') +
            '<div style="margin-top:6px;"><button type="button" class="btn-small" onclick="bqItemStatus(\'' + escapeHtml(i.id) + '\',\'publié\')"><i class="fa-solid fa-check"></i> Publier</button><button type="button" class="btn-small danger" onclick="bqItemStatus(\'' + escapeHtml(i.id) + '\',\'masqué\')">Refuser</button></div></div></div>').join('')
        : '<p style="color:var(--text-muted);">Rien à valider.</p>';

    const all = document.getElementById('bqAdminAll');
    if (all) all.innerHTML = (bqShops.length || bqItems.length) ?
        bqShops.map(s => '<div style="border-bottom:1px solid var(--border);padding:8px 0;"><i class="fa-solid fa-shop"></i> <strong>' + escapeHtml(s.name) + '</strong> · ' + escapeHtml(s.ownerName || s.id) + ' ' + bqStatusBadge(s.status) +
            (s.status === 'validée' ? ' <button type="button" class="btn-small danger" onclick="bqShopStatus(\'' + escapeHtml(s.id) + '\',\'masquée\')">Masquer</button>' : ' <button type="button" class="btn-small" onclick="bqShopStatus(\'' + escapeHtml(s.id) + '\',\'validée\')">Rétablir</button>') + '</div>' +
            bqItems.filter(i => i.ownerId === s.id).map(i => '<div style="padding:4px 0 4px 22px;font-size:0.88rem;">• ' + escapeHtml(i.title) + ' · ' + fmt(i.price, i.devise) + ' · stock ' + i.qty + ' ' + bqStatusBadge(i.status) +
                (i.status === 'publié' ? ' <button type="button" class="btn-small danger" onclick="bqItemStatus(\'' + escapeHtml(i.id) + '\',\'masqué\')">Masquer</button>' : '') + (i.status === 'masqué' || i.status === 'en attente' ? ' <button type="button" class="btn-small" onclick="bqItemStatus(\'' + escapeHtml(i.id) + '\',\'publié\')">Publier</button>' : '') + '</div>').join('')).join('')
        : '<p style="color:var(--text-muted);">Aucune boutique pour le moment.</p>';
}
function bqShopStatus(id, st) {
    if (!requireAdmin()) return;
    F().patchShop(id, { status: st }).then(() => logActivity('Boutique ' + id + ' : ' + st, id)).catch(err => alert('Impossible : ' + errText(err)));
}
function bqItemStatus(id, st) {
    if (!requireAdmin()) return;
    F().patchItem(id, { status: st }).then(() => logActivity('Article ' + id + ' : ' + st)).catch(err => alert('Impossible : ' + errText(err)));
}
function bqRefuseOrder(id) {
    if (!requireAdmin()) return;
    if (!confirm('Refuser cette commande ?')) return;
    F().patchOrder(id, { status: 'refusée', decision: "Refusée par l'administrateur.", decisionDate: todayISO() }).catch(err => alert('Impossible : ' + errText(err)));
}
// Conclut la vente : épargne acheteur -> épargne vendeur (95 %) + commission 5 % pour l'AVEC, en une seule opération
function bqConclude(id) {
    if (!requireAdmin()) return;
    const o = bqOrders.find(x => x.id === id);
    if (!o || (o.status !== 'acceptée' && o.status !== 'en attente')) return;
    const item = bqItems.find(x => x.id === o.itemId);
    const bOrig = members.find(x => x.id === o.buyerId), sOrig = members.find(x => x.id === o.sellerId);
    if (!bOrig || !sOrig) { alert('Acheteur ou vendeur introuvable.'); return; }
    if (!item || item.status !== 'publié' || (item.qty || 0) < 1) { alert("Cet article n'est plus disponible. Refusez la commande."); return; }
    const dev = devOf(o), price = round2(o.price);
    if (round2(item.price) !== price || devOf(item) !== dev) { alert('Le prix de l\'article a changé depuis la commande. Refusez la commande.'); return; }
    if (price > availableWithdrawal(bOrig, dev)) {
        const keep = round2(memberOutstanding(bOrig, dev) / 3);
        alert('Vente impossible : après ce paiement, l\'épargne de ' + bOrig.name + ' (' + fmt(sav(bOrig, dev), dev) + ') passerait sous le tiers de son crédit en cours (' + fmt(keep, dev) + ' à conserver). ' +
            'Il peut dépenser au maximum ' + fmt(availableWithdrawal(bOrig, dev), dev) + ' ; le prix est de ' + fmt(price, dev) + '. Refusez la commande.');
        return;
    }
    const sp = bqSplit(price);
    if (!confirm('Conclure la vente « ' + o.itemTitle + ' » ?\n\n' + bOrig.name + ' paie ' + fmt(price, dev) + ' (prélevé sur son épargne)\n' + sOrig.name + ' reçoit ' + fmt(sp.net, dev) + ' (sur son épargne)\nAVEC : commission 5 % = ' + fmt(sp.commission, dev))) return;
    const b = JSON.parse(JSON.stringify(bOrig)), s = JSON.parse(JSON.stringify(sOrig));
    setSav(b, dev, round2(sav(b, dev) - price));
    logOp(b, 'achat', price, 'Achat : ' + o.itemTitle + ' (vendeur ' + sOrig.name + ')', dev);
    setSav(s, dev, round2(sav(s, dev) + sp.net));
    logOp(s, 'vente', sp.net, 'Vente : ' + o.itemTitle + ' (acheteur ' + bOrig.name + ') · commission AVEC ' + fmt(sp.commission, dev), dev);
    const order = Object.assign({}, o, { status: 'conclue', commission: sp.commission, net: sp.net, decision: 'Vente conclue.', decisionDate: todayISO(), concludedBy: String(currentUser.username) });
    const left = (item.qty || 1) - 1;
    const it2 = Object.assign({}, item, { qty: left, status: left > 0 ? 'publié' : 'vendu' });
    F().concludeOrder(b, s, order, it2)
        .then(() => logActivity('Vente conclue : ' + o.itemTitle + ' ' + fmt(price, dev) + ' (' + bOrig.name + ' → ' + sOrig.name + '), commission ' + fmt(sp.commission, dev), o.buyerId))
        .catch(err => alert('Vente non enregistrée : ' + errText(err)));
}

// ================= Vitrine horizontale : plusieurs articles, vendeurs alternés =================
let bqShowIds = '', bqShowList = [], bqShowTimer = null, bqShowPaused = false;

function bqShowItems() {
    const me = bqMe();
    const shopOf = id => bqShops.find(s => s.id === id);
    const list = bqItems
        .filter(i => i.status === 'publié' && (!me || i.ownerId !== me) &&
            (Number(i.qty) || 0) > 0 &&
            (!shopOf(i.ownerId) || shopOf(i.ownerId).status === 'validée'))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    // Alternance équitable : un article de chaque vendeur, puis leur deuxième article, etc.
    const byOwner = Object.create(null), owners = [];
    list.forEach(i => {
        if (!byOwner[i.ownerId]) { byOwner[i.ownerId] = []; owners.push(i.ownerId); }
        byOwner[i.ownerId].push(i);
    });
    const out = [];
    for (let round = 0; out.length < list.length; round++) {
        owners.forEach(o => { if (byOwner[o][round]) out.push(byOwner[o][round]); });
    }
    return out;
}

function bqRenderShowcase() {
    const box = document.getElementById('bqShowcase');
    if (!box) return;
    const list = currentUser && (currentUser.role === 'member' || (CLOUD && isAdmin(currentUser))) ? bqShowItems() : [];
    setHidden('bqShowcase', list.length === 0);
    setHidden('bqShowcaseA', list.length === 0);
    const ids = list.map(i => [i.id, i.title, i.ownerId, i.price, i.qty, i.photo ? i.photo.length : 0].join(':')).join('|');
    const changed = ids !== bqShowIds;
    bqShowList = list;
    if (!list.length) {
        bqStopShow();
        bqShowIds = '';
        ['', 'A'].forEach(sfx => {
            const el = document.getElementById('bqSlide' + sfx);
            const dots = document.getElementById('bqDots' + sfx);
            if (el) el.innerHTML = '';
            if (dots) dots.innerHTML = '';
        });
        return;
    }
    if (changed) {
        bqShowIds = ids;
        bqShowDraw();
    }
    if (!bqShowTimer && list.length > 1) {
        bqShowTimer = setInterval(() => {
            if (!bqShowPaused) bqShowAdvance();
        }, 3500);
    }
    if (list.length < 2) bqStopShow();
}

function bqStopShow() {
    if (bqShowTimer) { clearInterval(bqShowTimer); bqShowTimer = null; }
}
function bqPause(on) { bqShowPaused = !!on; }

function bqShowAdvance() {
    ['', 'A'].forEach(sfx => {
        const el = document.getElementById('bqSlide' + sfx);
        const viewport = el && el.querySelector('.bq-show-viewport');
        if (!viewport) return;
        const card = viewport.querySelector('.bq-show-card');
        const step = card ? card.getBoundingClientRect().width + 12 : 232;
        const end = viewport.scrollWidth - viewport.clientWidth;
        if (end <= 4 || viewport.scrollLeft >= end - step / 2) {
            viewport.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            viewport.scrollBy({ left: step, behavior: 'smooth' });
        }
    });
}

function bqShowGo(n) {
    if (!bqShowList.length) return;
    const target = bqShowList[((n % bqShowList.length) + bqShowList.length) % bqShowList.length];
    if (!target) return;
    ['', 'A'].forEach(sfx => {
        const el = document.getElementById('bqSlide' + sfx);
        const card = el && el.querySelector('[data-bq-item="' + String(target.id).replace(/"/g, '') + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    });
}

function bqShowDraw() {
    ['', 'A'].forEach(sfx => {
        bqShowDrawIn(document.getElementById('bqSlide' + sfx), document.getElementById('bqDots' + sfx), sfx);
    });
}

function bqShowDrawIn(el, dots, sfx) {
    if (!el) return;
    const go = sfx === 'A' ? "showTab('boutique')" : "showMemberTab('boutique');bqShowSub('catalogue')";
    const items = bqShowList.map(i =>
        '<article class="bq-show-card" data-bq-item="' + escapeHtml(i.id) + '" role="button" tabindex="0" aria-label="Voir le catalogue : ' + escapeHtml(i.title || 'Article') + '" onclick="' + go + '" onkeydown="if(event.keyCode===13||event.keyCode===32){event.preventDefault();' + go + '}">' +
            '<div class="bq-show-photo">' + bqImg(i.photo, 150) + '</div>' +
            '<div class="bq-show-info">' +
                '<div class="bq-show-title">' + escapeHtml(i.title || 'Article sans titre') + '</div>' +
                '<div class="bq-show-owner">' + escapeHtml(i.shopName || 'Boutique') + '</div>' +
                '<div class="bq-show-member">' + escapeHtml(i.ownerName || 'Membre') + '</div>' +
                (i.desc ? '<div class="bq-show-desc">' + escapeHtml(i.desc) + '</div>' : '') +
                '<div class="bq-show-price">' + fmt(i.price, i.devise) + '</div>' +
                '<div class="bq-show-stock">Disponible : ' + Math.max(0, Number(i.qty) || 0) + '</div>' +
            '</div></article>'
    ).join('');
    el.innerHTML = '<div class="bq-show-viewport" aria-label="Articles des boutiques des membres"><div class="bq-show-track">' + items + '</div></div>';
    const viewport = el.querySelector('.bq-show-viewport');
    if (viewport) {
        viewport.addEventListener('mouseenter', () => bqPause(true));
        viewport.addEventListener('mouseleave', () => bqPause(false));
        viewport.addEventListener('touchstart', () => bqPause(true), { passive: true });
        viewport.addEventListener('touchend', () => bqPause(false), { passive: true });
        viewport.addEventListener('focusin', () => bqPause(true));
        viewport.addEventListener('focusout', () => bqPause(false));
    }
    if (dots) {
        const shops = new Set(bqShowList.map(i => i.ownerId)).size;
        dots.innerHTML = '<span class="bq-show-count">' + bqShowList.length + ' article(s) · ' + shops + ' vendeur(s) · faites défiler pour tout voir</span>';
    }
}

(function () {
    const st = document.createElement('style');
    st.textContent =
        '.bq-show-viewport{width:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:thin;padding:2px 2px 9px;}' +
        '.bq-show-track{display:flex;align-items:stretch;gap:12px;width:max-content;min-width:100%;}' +
        '.bq-show-card{box-sizing:border-box;display:flex;flex-direction:column;flex:0 0 220px;width:220px;max-width:78vw;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--card-bg,#fff);scroll-snap-align:start;cursor:pointer;transition:box-shadow .18s,transform .18s;}' +
        '.bq-show-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.10);transform:translateY(-2px);}' +
        '.bq-show-card:focus-visible{outline:2px solid var(--primary);outline-offset:2px;}' +
        '.bq-show-photo{height:132px;display:flex;align-items:center;justify-content:center;background:var(--bg,#f8fafc);overflow:hidden;}' +
        '.bq-show-photo img{width:100%;height:100%;object-fit:cover;}' +
        '.bq-show-info{padding:10px;display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}' +
        '.bq-show-title{font-weight:750;font-size:.96rem;line-height:1.3;overflow-wrap:anywhere;}' +
        '.bq-show-owner{font-size:.82rem;font-weight:650;color:var(--primary);overflow-wrap:anywhere;}' +
        '.bq-show-member,.bq-show-desc,.bq-show-stock{font-size:.78rem;color:var(--text-muted);overflow-wrap:anywhere;}' +
        '.bq-show-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.2em;}' +
        '.bq-show-price{font-size:1rem;font-weight:800;color:var(--primary);margin-top:auto;padding-top:5px;}' +
        '.bq-show-count{font-size:.78rem;color:var(--text-muted);}' +
        '.bq-show-viewport::-webkit-scrollbar{height:6px;}.bq-show-viewport::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:8px;}' +
        '@media(max-width:480px){.bq-show-card{flex-basis:190px;width:190px;}.bq-show-photo{height:112px;}}' +
        '@media(prefers-reduced-motion:reduce){.bq-show-card{transition:none;}}';
    document.head.appendChild(st);
})();

// ================= Contacter le vendeur : accord direct, sans passer par l'épargne ni la base =================
function bqContact(id) {
    const it = bqItems.find(x => x.id === id);
    if (!it) return;
    const shop = bqShops.find(s => s.id === it.ownerId);
    const contact = shop && shop.contact ? String(shop.contact) : '';
    let num = typeof waNumber === 'function' ? waNumber(contact) : ''; if (num.length < 8 || num.length > 15) num = '';
    const msg = 'Bonjour ' + (it.ownerName || '') + ', je suis intéressé(e) par « ' + it.title + ' » (' + fmt(it.price, it.devise) + ') vu dans la boutique AVEC LA SAGESSE.';
    let m = document.getElementById('bqContactBox');
    if (!m) {
        m = document.createElement('div');
        m.id = 'bqContactBox';
        m.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2500;display:flex;align-items:center;justify-content:center;padding:16px;';
        m.onclick = e => { if (e.target === m) m.style.display = 'none'; };
        document.body.appendChild(m);
    }
    m.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
        '<h3 style="margin:0 0 4px;font-size:1.05rem;">Contacter ' + escapeHtml(it.ownerName || 'le vendeur') + '</h3>' +
        '<p style="margin:0 0 10px;font-size:0.9rem;"><strong>' + escapeHtml(it.title) + '</strong> · ' + fmt(it.price, it.devise) + '<br><span style="color:var(--text-muted);">' + escapeHtml(it.shopName || '') + '</span></p>' +
        (contact ? '<p style="margin:0 0 12px;font-size:0.95rem;"><i class="fa-solid fa-address-book"></i> ' + escapeHtml(contact) + '</p>' : '<p style="margin:0 0 12px;font-size:0.9rem;color:var(--danger);">Le vendeur n\'a pas indiqué de contact. Passez plutôt par « Payer avec mon épargne », ou demandez-lui son numéro.</p>') +
        (num ? '<a class="btn" style="display:block;text-align:center;text-decoration:none;background:#128c7e;margin-bottom:8px;" target="_blank" rel="noopener" href="https://wa.me/' + num + '?text=' + encodeURIComponent(msg) + '"><i class="fa-brands fa-whatsapp"></i> Écrire sur WhatsApp</a>' +
            '<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px;" href="tel:+' + num + '"><i class="fa-solid fa-phone"></i> Appeler</a>' : '') +
        '<p style="font-size:0.8rem;color:var(--text-muted);margin:6px 0 12px;">Vous vous mettez d\'accord directement avec le vendeur et échangez la marchandise vous-mêmes. L\'AVEC n\'intervient pas : aucun montant n\'est prélevé sur l\'épargne, il n\'y a pas de commission, mais aussi aucune garantie.</p>' +
        '<button type="button" class="btn-small" style="width:100%;" onclick="document.getElementById(\'bqContactBox\').style.display=\'none\'">Fermer</button></div>';
    m.style.display = 'flex';
}
