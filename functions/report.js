/**
 * Rapport mensuel PDF de WEBSERVICES FIN, construit côté serveur (bibliothèque pdf-lib, sans navigateur).
 * buildPdf(PDFLib, { members, requests, claims, weekly, now }) -> Uint8Array
 * `now` : Date ; le rapport couvre le mois civil précédent (activité) et la situation à la date du jour.
 */
(function (exports) {
'use strict';
const A4 = [841.89, 595.28];
const C = { navy: [0.118, 0.227, 0.541], blue: [0.145, 0.388, 0.922], ink: [0.122, 0.161, 0.216], grey: [0.42, 0.45, 0.5], band: [0.957, 0.969, 0.984], line: [0.85, 0.88, 0.925],
  green: [0.063, 0.725, 0.506], amber: [0.961, 0.62, 0.043], red: [0.937, 0.267, 0.267], violet: [0.545, 0.361, 0.965], white: [1, 1, 1] };
const OP_LABELS = { epargne: "Versement d'épargne", credit: 'Crédit accordé', retrait: "Retrait d'épargne", remboursement: 'Remboursement', social: 'Cotisation cas sociaux', aide: 'Aide cas social', prolongation: 'Échéance prolongée', occ: 'Cotisation occasionnelle', remise: 'Somme remise (cas social)', correction: 'Correction' };

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const devOf = x => (x && x.devise === 'FC' ? 'FC' : 'USD');
function fmt(v, d) {
  v = round2(v);
  if (d !== 'FC') return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') .replace(/^/, v < 0 ? '-' : '') + ' FC';
}
const creditRemaining = c => Math.max(0, round2((Number(c.amount) || 0) - (Number(c.repaid) || 0)));
const outstanding = (m, d) => round2((m.credits || []).filter(c => devOf(c) === d).reduce((s, c) => s + creditRemaining(c), 0));
const sav = (m, d) => Number(d === 'FC' ? m.epargneFC : m.epargne) || 0;
const frDate = iso => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Seuls les caractères du jeu WinAnsi sont dessinables avec les polices standard
const safe = s => String(s === null || s === undefined ? '' : s).replace(/[  ]/g, ' ').replace(/[^ -~¡-ÿ–—‘’“”•€…]/g, '?').replace(/[\r\n]+/g, ' ');

function weekIndex(iso) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || !p[0]) return null;
  return Math.floor((Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000) + 3) / 7);
}
function socialInfo(m, todayIso, weekly) {
  const paidWeeks = (m.social || []).reduce((t, x) => t + (Number(x.weeks) || 0), 0);
  const paid = round2((m.social || []).reduce((t, x) => t + (Number(x.amount) || 0), 0));
  const aid = round2((m.socialAid || []).reduce((t, x) => t + (Number(x.amount) || 0), 0));
  const a = weekIndex(m.socialSince), b = weekIndex(todayIso);
  const due = a === null || b === null ? 0 : Math.max(0, b - a + 1);
  const arrears = due - paidWeeks;
  let text = !m.socialSince ? 'Début à définir' : arrears > 0 ? arrears + ' sem. en retard' : arrears < 0 ? (-arrears) + ' sem. d\'avance' : 'À jour';
  return { paid, aid, arrears, text, late: !!m.socialSince && arrears > 0, amountLate: arrears > 0 ? round2(arrears * weekly) : 0 };
}

function buildPdf(PDFLib, input) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const members = input.members || [], requests = input.requests || [], claims = input.claims || [], weekly = Number(input.weekly) > 0 ? Number(input.weekly) : 1000;
  const now = input.now || new Date();
  const ORG = safe(String(input.org || 'WEBSERVICES FIN').slice(0, 60));
  const local = new Date(now.getTime() + 2 * 3600000);                       // heure de Lubumbashi (UTC+2)
  const iso = d => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  const today = iso(local);
  const prev = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (input.current ? 0 : 1), 1));
  const monthKey = prev.getUTCFullYear() + '-' + String(prev.getUTCMonth() + 1).padStart(2, '0');
  const monthLabel = MONTHS[prev.getUTCMonth()] + ' ' + prev.getUTCFullYear();
  const in30 = iso(new Date(local.getTime() + 30 * 86400000));

  const all = [];
  members.forEach(m => (m.credits || []).forEach(c => all.push({ m, c })));
  const st = c => creditRemaining(c) === 0 ? 'Remboursé' : (c.dueDate && c.dueDate < today ? 'En retard' : 'En cours');
  const cnt = { 'Remboursé': 0, 'En cours': 0, 'En retard': 0 };
  all.forEach(x => { cnt[st(x.c)]++; });
  const sum = (list, f) => round2(list.reduce((t, x) => t + (Number(f(x)) || 0), 0));
  const si = members.map(m => socialInfo(m, today, weekly));
  const fundPaid = round2(si.reduce((t, x) => t + x.paid, 0)), fundAid = round2(si.reduce((t, x) => t + x.aid, 0));

  return (async () => {
    const pdf = await PDFDocument.create();
    pdf.setTitle('Rapport ' + ORG + ' - ' + monthLabel); pdf.setAuthor(ORG); pdf.setCreator(ORG); pdf.setProducer(ORG);
    const F = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold), I = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const col = c => rgb(c[0], c[1], c[2]);
    const W = A4[0], H = A4[1], M = 34;
    let page, y, pageNo = 0;
    const pages = [];
    const newPage = () => { page = pdf.addPage(A4); pages.push(page); pageNo++; y = H - M; return page; };
    const wid = (t, size, font) => (font || F).widthOfTextAtSize(safe(t), size);
    const fit = (t, size, maxW, font) => { t = safe(t); if (wid(t, size, font) <= maxW) return t; while (t.length > 1 && wid(t + '...', size, font) > maxW) t = t.slice(0, -1); return t + '...'; };
    const text = (t, x, yy, size, o) => { o = o || {}; const font = o.bold ? B : (o.italic ? I : F); let s = safe(t); let xx = x; if (o.align === 'right') xx = x - wid(s, size, font); else if (o.align === 'center') xx = x - wid(s, size, font) / 2; page.drawText(s, { x: xx, y: yy, size, font, color: col(o.color || C.ink) }); };
    const rect = (x, yy, w, h, c, o) => page.drawRectangle(Object.assign({ x, y: yy, width: w, height: h, color: col(c) }, o || {}));
    const banner = (title, sub) => {
      rect(M, y - 34, W - 2 * M, 34, C.navy); text(title, M + 12, y - 23, 17, { bold: true, color: C.white });
      if (sub) text(sub, W - M - 12, y - 22, 9.5, { align: 'right', color: [0.85, 0.9, 1] });
      y -= 48;
    };
    const section = (t) => { text(t, M, y - 10, 12, { bold: true, color: C.navy }); page.drawLine({ start: { x: M, y: y - 15 }, end: { x: W - M, y: y - 15 }, thickness: 1, color: col(C.blue) }); y -= 26; };
    const ensure = (h, title, sub) => { if (y - h < M + 14) { newPage(); banner(title || 'Rapport mensuel', sub || monthLabel); } };
    const tone = t => { const x = String(t).toLowerCase(); if (/retard|refus|pas d.acc/.test(x)) return [0.996, 0.886, 0.886]; if (/rembours|approuv|trait|actif|à jour|avance/.test(x)) return [0.82, 0.98, 0.9]; if (/cours|attente|ouverte|début/.test(x)) return [0.996, 0.953, 0.78]; return null; };
    // tableau : cols [{h, w, a:'l'|'r'|'c', st:true}], rows [[...]], total [...]
    function table(cols, rows, o) {
      o = o || {};
      const tw = W - 2 * M, sw = cols.reduce((t, c) => t + c.w, 0), ws = cols.map(c => c.w / sw * tw), rh = 17, size = 8.5;
      const head = () => { rect(M, y - rh - 3, tw, rh + 3, C.blue); let x = M; cols.forEach((c, i) => { text(fit(c.h, 8.5, ws[i] - 8, B), x + ws[i] / 2, y - 13, 8.5, { bold: true, color: C.white, align: 'center' }); x += ws[i]; }); y -= rh + 3; };
      if (!rows.length) { text(o.empty || 'Aucune donnée pour le moment.', M, y - 12, 10, { italic: true, color: C.grey }); y -= 24; return; }
      ensure(rh * 3 + 20, o.title, o.sub); head();
      rows.concat(o.total ? [o.total] : []).forEach((r, ri) => {
        const isTot = o.total && ri === rows.length;
        if (y - rh < M + 12) { newPage(); banner(o.title || 'Rapport mensuel', o.sub || monthLabel); head(); }
        rect(M, y - rh, tw, rh, isTot ? [0.878, 0.906, 1] : (ri % 2 ? C.band : C.white));
        let x = M;
        r.forEach((v, i) => {
          const c = cols[i], t = c.st && !isTot ? tone(v) : null;
          if (t) rect(x + 1, y - rh + 1, ws[i] - 2, rh - 2, t);
          const opt = { bold: isTot || (c.st && !!t), color: isTot ? C.navy : C.ink };
          const s = fit(v, size, ws[i] - 8, opt.bold ? B : F);
          if (c.a === 'r') text(s, x + ws[i] - 4, y - 12, size, Object.assign({ align: 'right' }, opt));
          else if (c.a === 'c' || c.st) text(s, x + ws[i] / 2, y - 12, size, Object.assign({ align: 'center' }, opt));
          else text(s, x + 4, y - 12, size, opt);
          x += ws[i];
        });
        page.drawLine({ start: { x: M, y: y - rh }, end: { x: M + tw, y: y - rh }, thickness: 0.4, color: col(C.line) });
        y -= rh;
      });
      y -= 12;
    }
    const kpi = (x, yy, w, label, value, sub, c) => {
      rect(x, yy - 52, w, 52, C.band); rect(x, yy - 3, w, 3, c);
      text(label, x + w / 2, yy - 16, 7.5, { bold: true, color: C.grey, align: 'center' });
      text(fit(value, 14, w - 8, B), x + w / 2, yy - 34, 14, { bold: true, color: c, align: 'center' });
      if (sub) text(fit(sub, 7.5, w - 8), x + w / 2, yy - 46, 7.5, { color: C.grey, align: 'center' });
    };

    // ---------- Page 1 : synthèse ----------
    newPage();
    rect(M, y - 62, W - 2 * M, 62, C.navy);
    const lg = await embedLogo(pdf, input.logo); let lx = M + 16;
    if (lg) { const lh = 46, lw = Math.min(120, lh * lg.width / lg.height); page.drawImage(lg, { x: M + 8, y: y - 54, width: lw, height: lh }); lx = M + 8 + lw + 10; }
    text(ORG, lx, y - 28, 24, { bold: true, color: C.white });
    text((input.current ? 'Rapport : ' : 'Rapport mensuel : ') + monthLabel, lx, y - 48, 12, { color: [0.85, 0.9, 1] });
    text('Situation au ' + frDate(today), W - M - 16, y - 28, 11, { align: 'right', color: C.white });
    text(input.current ? 'Document PDF non modifiable' : 'Généré automatiquement', W - M - 16, y - 46, 9, { align: 'right', color: [0.85, 0.9, 1] });
    y -= 78;
    const kw = (W - 2 * M - 4 * 8) / 5;
    const late = all.filter(x => st(x.c) === 'En retard');
    const k = [
      ['MEMBRES', String(members.length), members.filter(m => outstanding(m, 'USD') + outstanding(m, 'FC') > 0).length + ' avec un crédit en cours', C.blue],
      ['ÉPARGNE ($)', fmt(sum(members, m => sav(m, 'USD')), 'USD'), '', C.green],
      ['ÉPARGNE (FC)', fmt(sum(members, m => sav(m, 'FC')), 'FC'), '', C.green],
      ['CRÉDITS EN COURS ($)', fmt(sum(members, m => outstanding(m, 'USD')), 'USD'), cnt['En retard'] + ' crédit(s) en retard', C.amber],
      ['CRÉDITS EN COURS (FC)', fmt(sum(members, m => outstanding(m, 'FC')), 'FC'), '', C.amber],
      ['FONDS CAS SOCIAUX', fmt(fundPaid - fundAid, 'FC'), 'cotisé ' + fmt(fundPaid, 'FC'), C.violet],
      ['INTÉRÊTS PRÉVUS ($ · FC)', fmt(sum(all.filter(x => devOf(x.c) === 'USD'), x => x.c.interet), 'USD'), fmt(sum(all.filter(x => devOf(x.c) === 'FC'), x => x.c.interet), 'FC'), C.blue],
      ['REMBOURSÉ ($ · FC)', fmt(sum(all.filter(x => devOf(x.c) === 'USD'), x => x.c.repaid), 'USD'), fmt(sum(all.filter(x => devOf(x.c) === 'FC'), x => x.c.repaid), 'FC'), C.green],
      ['DEMANDES EN ATTENTE', String(requests.filter(r => r.status === 'en attente').length), '', C.amber],
      ['RÉCLAMATIONS OUVERTES', String(claims.filter(c => c.status !== 'traitée').length), '', C.red]
    ];
    k.forEach((it, i) => kpi(M + (i % 5) * (kw + 8), y - Math.floor(i / 5) * 62, kw, it[0], it[1], it[2], it[3]));
    y -= 2 * 62 + 8;
    // graphiques : statut des crédits (barres) et épargne des 8 premiers
    const gw = (W - 2 * M - 14) / 2, gy = y;
    rect(M, gy - 190, gw, 190, C.white, { borderColor: col(C.line), borderWidth: 0.8 });
    text('Statut des crédits', M + 10, gy - 16, 10.5, { bold: true, color: C.navy });
    const sc = [['Remboursé', C.green], ['En cours', C.amber], ['En retard', C.red]], smax = Math.max(1, cnt['Remboursé'], cnt['En cours'], cnt['En retard']);
    sc.forEach((s, i) => { const bw = (cnt[s[0]] / smax) * (gw - 140); text(s[0], M + 14, gy - 52 - i * 40, 9.5); rect(M + 84, gy - 58 - i * 40, Math.max(bw, 2), 18, s[1]); text(String(cnt[s[0]]), M + 90 + bw, gy - 52 - i * 40, 10, { bold: true }); });
    const gx = M + gw + 14;
    rect(gx, gy - 190, gw, 190, C.white, { borderColor: col(C.line), borderWidth: 0.8 });
    text('Épargne en dollars : 8 premiers membres', gx + 10, gy - 16, 10.5, { bold: true, color: C.navy });
    const top = members.filter(m => sav(m, 'USD') > 0).sort((a, b) => sav(b, 'USD') - sav(a, 'USD')).slice(0, 8), tmax = Math.max(1, ...top.map(m => sav(m, 'USD')));
    if (!top.length) text('Aucune épargne en dollars.', gx + 14, gy - 50, 9, { italic: true, color: C.grey });
    top.forEach((m, i) => { const bw = (sav(m, 'USD') / tmax) * (gw - 190); text(fit(m.name, 8.5, 100), gx + 12, gy - 40 - i * 18, 8.5); rect(gx + 116, gy - 45 - i * 18, Math.max(bw, 2), 11, C.blue); text(fmt(sav(m, 'USD'), 'USD'), gx + 120 + bw, gy - 40 - i * 18, 8, { bold: true }); });
    y = gy - 206;

    // ---------- Activité du mois ----------
    newPage(); banner('Activité de ' + monthLabel, 'Situation au ' + frDate(today));
    const ops = [];
    members.forEach(m => (m.history || []).forEach(h => { if (String(h.date).slice(0, 7) === monthKey && h.note !== 'Épargne initiale') ops.push({ m, h }); }));
    section(ops.length + ' opération(s) enregistrée(s) en ' + monthLabel);
    const byType = {};
    ops.forEach(o => { const t = OP_LABELS[o.h.type] || 'Autre', d = devOf(o.h); (byType[t] = byType[t] || { n: 0, USD: 0, FC: 0 }); byType[t].n++; byType[t][d] += Math.abs(Number(o.h.amount) || 0); });
    table([{ h: 'Opération', w: 4 }, { h: 'Nombre', w: 1.2, a: 'r' }, { h: 'Total en dollars', w: 2, a: 'r' }, { h: 'Total en francs', w: 2, a: 'r' }],
      Object.keys(byType).sort((a, b) => byType[b].n - byType[a].n).map(t => [t, byType[t].n, fmt(byType[t].USD, 'USD'), fmt(byType[t].FC, 'FC')]), { empty: 'Aucune opération ce mois-ci.', title: 'Activité de ' + monthLabel });
    section('Dernières opérations du mois');
    table([{ h: 'Date', w: 1.3, a: 'c' }, { h: 'Membre', w: 3 }, { h: 'Opération', w: 3 }, { h: 'Montant', w: 2, a: 'r' }, { h: 'Détail', w: 5 }],
      ops.sort((a, b) => String(b.h.date).localeCompare(String(a.h.date))).slice(0, 60).map(o => [frDate(o.h.date), o.m.name, OP_LABELS[o.h.type] || 'Opération', fmt(Math.abs(Number(o.h.amount) || 0), devOf(o.h)), o.h.note || '']), { empty: 'Aucune opération.', title: 'Activité de ' + monthLabel });

    // ---------- Crédits à surveiller ----------
    ensure(120, 'Crédits à surveiller'); if (y < H - M - 60) { newPage(); banner('Crédits à surveiller', 'Situation au ' + frDate(today)); }
    section('Crédits en retard (' + late.length + ')');
    table([{ h: 'Membre', w: 3 }, { h: 'Accordé le', w: 1.4, a: 'c' }, { h: 'Échéance', w: 1.4, a: 'c' }, { h: 'Montant', w: 1.8, a: 'r' }, { h: 'Remboursé', w: 1.8, a: 'r' }, { h: 'Reste', w: 1.8, a: 'r' }, { h: 'Retard', w: 1.4, a: 'c' }],
      late.sort((a, b) => String(a.c.dueDate).localeCompare(String(b.c.dueDate))).map(x => { const d = devOf(x.c), days = Math.round((Date.parse(today) - Date.parse(x.c.dueDate)) / 86400000); return [x.m.name, frDate(x.c.date), frDate(x.c.dueDate), fmt(x.c.amount, d), fmt(x.c.repaid, d), fmt(creditRemaining(x.c), d), days + ' j']; }),
      { empty: 'Aucun crédit en retard.', title: 'Crédits à surveiller' });
    const soon = all.filter(x => creditRemaining(x.c) > 0 && x.c.dueDate >= today && x.c.dueDate <= in30);
    section('Échéances dans les 30 prochains jours (' + soon.length + ')');
    table([{ h: 'Membre', w: 3 }, { h: 'Échéance', w: 1.4, a: 'c' }, { h: 'Reste à rembourser', w: 2, a: 'r' }, { h: 'Téléphone', w: 2 }],
      soon.sort((a, b) => String(a.c.dueDate).localeCompare(String(b.c.dueDate))).map(x => [x.m.name, frDate(x.c.dueDate), fmt(creditRemaining(x.c), devOf(x.c)), x.m.phone || '']), { empty: 'Aucune échéance proche.', title: 'Crédits à surveiller' });

    // ---------- Membres ----------
    newPage(); banner('Membres', members.length + ' membre(s)');
    table([{ h: 'ID', w: 1.2, a: 'c' }, { h: 'Nom', w: 3.2 }, { h: 'Épargne ($)', w: 1.7, a: 'r' }, { h: 'Épargne (FC)', w: 1.9, a: 'r' }, { h: 'Crédit ($)', w: 1.7, a: 'r' }, { h: 'Crédit (FC)', w: 1.9, a: 'r' }, { h: 'Crédit', w: 1.5, st: true }, { h: 'Cas sociaux', w: 2.2, st: true }],
      members.map((m, i) => { const cr = m.credits || [], s = cr.some(c => creditRemaining(c) > 0 && c.dueDate && c.dueDate < today) ? 'En retard' : (cr.some(c => creditRemaining(c) > 0) ? 'En cours' : (cr.length ? 'Remboursé' : 'Aucun')); return [m.id, m.name, fmt(sav(m, 'USD'), 'USD'), fmt(sav(m, 'FC'), 'FC'), fmt(outstanding(m, 'USD'), 'USD'), fmt(outstanding(m, 'FC'), 'FC'), s, si[i].text]; }),
      { title: 'Membres', sub: monthLabel, total: ['Total', '', fmt(sum(members, m => sav(m, 'USD')), 'USD'), fmt(sum(members, m => sav(m, 'FC')), 'FC'), fmt(sum(members, m => outstanding(m, 'USD')), 'USD'), fmt(sum(members, m => outstanding(m, 'FC')), 'FC'), '', ''] });

    // ---------- Cas sociaux + à traiter ----------
    ensure(200, 'Cas sociaux et points à traiter'); if (y < H - M - 80) { newPage(); banner('Cas sociaux et points à traiter', monthLabel); }
    section('Cas sociaux : cotisation ' + fmt(weekly, 'FC') + ' par semaine · cotisé ' + fmt(fundPaid, 'FC') + ' · aides ' + fmt(fundAid, 'FC') + ' · solde ' + fmt(fundPaid - fundAid, 'FC'));
    const lateS = members.map((m, i) => ({ m, s: si[i] })).filter(x => x.s.late).sort((a, b) => b.s.arrears - a.s.arrears);
    table([{ h: 'Membre en retard de cotisation', w: 4 }, { h: 'Semaines de retard', w: 2, a: 'r' }, { h: 'Montant dû', w: 2, a: 'r' }], lateS.map(x => [x.m.name, x.s.arrears, fmt(x.s.amountLate, 'FC')]), { empty: 'Tous les membres sont à jour.', title: 'Cas sociaux' });
    section('Demandes en attente (' + requests.filter(r => r.status === 'en attente').length + ')');
    const nm = id => { const m = members.find(x => x.id === id); return m ? m.name : id; };
    table([{ h: 'Date', w: 1.3, a: 'c' }, { h: 'Membre', w: 3 }, { h: 'Demande', w: 2.4 }, { h: 'Montant', w: 2, a: 'r' }, { h: 'Précision', w: 4 }],
      requests.filter(r => r.status === 'en attente').map(r => [frDate(r.date), nm(r.memberId), r.type === 'credit' ? 'Demande de crédit' : "Retrait d'épargne", fmt(r.amount, devOf(r)), r.note || '']), { empty: 'Aucune demande en attente.', title: 'Points à traiter' });
    section('Réclamations ouvertes (' + claims.filter(c => c.status !== 'traitée').length + ')');
    table([{ h: 'Date', w: 1.3, a: 'c' }, { h: 'Membre', w: 3 }, { h: 'Objet', w: 3 }, { h: 'Message', w: 6 }],
      claims.filter(c => c.status !== 'traitée').map(c => [frDate(c.date), nm(c.memberId), c.subject || '', c.message || '']), { empty: 'Aucune réclamation ouverte.', title: 'Points à traiter' });

    // ---------- Sous-groupes ----------
    const groups = input.groups || [];
    if (groups.length) {
      ensure(160, 'Sous-groupes'); if (y < H - M - 60) { newPage(); banner('Sous-groupes', monthLabel); }
      section('Sous-groupes (' + groups.length + ')');
      const gl = groups.map(g => ({ g, list: members.filter(m => m.groupId === g.id) }));
      table([{ h: 'Groupe', w: 3 }, { h: 'Chef de groupe', w: 3 }, { h: 'Membres', w: 1.2, a: 'r' }, { h: 'Épargne ($)', w: 1.8, a: 'r' }, { h: 'Épargne (FC)', w: 2, a: 'r' }, { h: 'Crédit ($)', w: 1.8, a: 'r' }, { h: 'Crédit (FC)', w: 2, a: 'r' }],
        gl.map(x => [x.g.name, x.g.leaderName || x.g.id, x.list.length, fmt(sum(x.list, m => sav(m, 'USD')), 'USD'), fmt(sum(x.list, m => sav(m, 'FC')), 'FC'), fmt(sum(x.list, m => outstanding(m, 'USD')), 'USD'), fmt(sum(x.list, m => outstanding(m, 'FC')), 'FC')]),
        { title: 'Sous-groupes' });
    }

    // pied de page sur chaque page
    pages.forEach((p, i) => {
      p.drawText(safe(ORG + ' · Rapport mensuel · ' + monthLabel), { x: M, y: 16, size: 7.5, font: F, color: col(C.grey) });
      const t = 'Page ' + (i + 1) + ' / ' + pages.length; p.drawText(t, { x: W - M - F.widthOfTextAtSize(t, 7.5), y: 16, size: 7.5, font: F, color: col(C.grey) });
    });
    return { bytes: await pdf.save(), monthLabel, monthKey };
  })();
}

// Logo (JPEG en data URL) : incorporé dans le PDF s'il est valide, sinon ignoré
async function embedLogo(pdf, dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  try {
    const bin = typeof atob === 'function' ? atob(m[1]) : Buffer.from(m[1], 'base64').toString('binary');
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return await pdf.embedJpg(u);
  } catch (e) { return null; }
}

/**
 * Relevé de compte d'un membre : buildStatement(PDFLib, { member, org, logo, now }) -> { bytes, fileName }
 * Document à plat (aucun champ modifiable), signé d'une référence et de la date de génération.
 */
function buildStatement(PDFLib, input) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const m = input.member || {}, ORG = safe(String(input.org || 'WEBSERVICES FIN').slice(0, 60));
  const now = input.now || new Date();
  const local = new Date(now.getTime() + 2 * 3600000);
  const todayIso = local.getUTCFullYear() + '-' + String(local.getUTCMonth() + 1).padStart(2, '0') + '-' + String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0') + ':' + String(local.getUTCMinutes()).padStart(2, '0');
  const ref = 'REL-' + safe(m.id || 'X') + '-' + todayIso.replace(/-/g, '') + '-' + hh.replace(':', '');
  return (async () => {
    const pdf = await PDFDocument.create();
    pdf.setTitle('Relevé de compte - ' + safe(m.name) + ' - ' + frDate(todayIso)); pdf.setAuthor(ORG); pdf.setCreator(ORG); pdf.setProducer(ORG); pdf.setSubject(ref);
    const F = await pdf.embedFont(StandardFonts.Helvetica), B = await pdf.embedFont(StandardFonts.HelveticaBold), I = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const col = c => rgb(c[0], c[1], c[2]);
    const W = 595.28, H = 841.89, M = 36, pages = [];
    let page, y;
    const wid = (t, s, f) => (f || F).widthOfTextAtSize(safe(t), s);
    const fit = (t, s, mw, f) => { t = safe(t); if (wid(t, s, f) <= mw) return t; while (t.length > 1 && wid(t + '...', s, f) > mw) t = t.slice(0, -1); return t + '...'; };
    const text = (t, x, yy, s, o) => { o = o || {}; const f = o.bold ? B : (o.italic ? I : F); const v = safe(t); let xx = x; if (o.align === 'right') xx = x - wid(v, s, f); else if (o.align === 'center') xx = x - wid(v, s, f) / 2; page.drawText(v, { x: xx, y: yy, size: s, font: f, color: col(o.color || C.ink) }); };
    const rect = (x, yy, w, h, c, o) => page.drawRectangle(Object.assign({ x, y: yy, width: w, height: h, color: col(c) }, o || {}));
    const lg = await embedLogo(pdf, input.logo);
    const newPage = (first) => {
      page = pdf.addPage([W, H]); pages.push(page); y = H - M;
      if (first) {
        rect(M, y - 64, W - 2 * M, 64, C.navy); let lx = M + 14;
        if (lg) { const lh = 46, lw = Math.min(110, lh * lg.width / lg.height); page.drawImage(lg, { x: M + 8, y: y - 55, width: lw, height: lh }); lx = M + 8 + lw + 10; }
        text(ORG, lx, y - 28, 20, { bold: true, color: C.white });
        text('Relevé de compte', lx, y - 48, 12, { color: [0.85, 0.9, 1] });
        text('Édité le ' + frDate(todayIso) + ' à ' + hh, W - M - 14, y - 28, 9.5, { align: 'right', color: C.white });
        text('Réf. ' + ref, W - M - 14, y - 46, 8.5, { align: 'right', color: [0.85, 0.9, 1] });
        y -= 82;
      } else { text(ORG + ' · Relevé de ' + (m.name || ''), M, y - 8, 9, { color: C.grey }); y -= 26; }
    };
    const section = t => { text(t, M, y - 10, 12, { bold: true, color: C.navy }); page.drawLine({ start: { x: M, y: y - 15 }, end: { x: W - M, y: y - 15 }, thickness: 1, color: col(C.blue) }); y -= 28; };
    function table(cols, rows, empty) {
      const tw = W - 2 * M, sw = cols.reduce((t, c) => t + c.w, 0), ws = cols.map(c => c.w / sw * tw), rh = 17;
      const head = () => { rect(M, y - rh - 3, tw, rh + 3, C.blue); let x = M; cols.forEach((c, i) => { text(fit(c.h, 8.5, ws[i] - 8, B), x + ws[i] / 2, y - 13, 8.5, { bold: true, color: C.white, align: 'center' }); x += ws[i]; }); y -= rh + 3; };
      if (!rows.length) { text(empty, M, y - 12, 9.5, { italic: true, color: C.grey }); y -= 26; return; }
      if (y - rh * 3 < M + 20) newPage(false);
      head();
      rows.forEach((r, ri) => {
        if (y - rh < M + 22) { newPage(false); head(); }
        rect(M, y - rh, tw, rh, ri % 2 ? C.band : C.white);
        let x = M;
        r.forEach((v, i) => { const c = cols[i], s = fit(v, 8.5, ws[i] - 8); if (c.a === 'r') text(s, x + ws[i] - 4, y - 12, 8.5, { align: 'right' }); else if (c.a === 'c') text(s, x + ws[i] / 2, y - 12, 8.5, { align: 'center' }); else text(s, x + 4, y - 12, 8.5); x += ws[i]; });
        page.drawLine({ start: { x: M, y: y - rh }, end: { x: W - M, y: y - rh }, thickness: 0.4, color: col(C.line) });
        y -= rh;
      });
      y -= 14;
    }
    newPage(true);
    text(m.name || '', M, y - 10, 15, { bold: true }); text('Identifiant : ' + (m.id || '') + (m.phone ? '   ·   Tél. : ' + m.phone : ''), M, y - 26, 9.5, { color: C.grey }); y -= 44;
    // synthèse
    const credits = m.credits || [];
    const kw = (W - 2 * M - 3 * 8) / 4;
    [['ÉPARGNE ($)', fmt(sav(m, 'USD'), 'USD'), C.green], ['ÉPARGNE (FC)', fmt(sav(m, 'FC'), 'FC'), C.green], ['CRÉDIT À REMBOURSER ($)', fmt(outstanding(m, 'USD'), 'USD'), C.amber], ['CRÉDIT À REMBOURSER (FC)', fmt(outstanding(m, 'FC'), 'FC'), C.amber]].forEach((k, i) => {
      const x = M + i * (kw + 8); rect(x, y - 50, kw, 50, C.band); rect(x, y - 3, kw, 3, k[2]);
      text(k[0], x + kw / 2, y - 16, 7, { bold: true, color: C.grey, align: 'center' }); text(fit(k[1], 13, kw - 8, B), x + kw / 2, y - 37, 13, { bold: true, color: k[2], align: 'center' });
    });
    y -= 68;
    section('Crédits (' + credits.length + ')');
    const stOf = c => creditRemaining(c) === 0 ? 'Remboursé' : (c.dueDate && c.dueDate < todayIso ? 'En retard' : 'En cours');
    table([{ h: 'Accordé le', w: 1.5, a: 'c' }, { h: 'Montant', w: 1.7, a: 'r' }, { h: 'Intérêt', w: 1.4, a: 'r' }, { h: 'Remboursé', w: 1.7, a: 'r' }, { h: 'Reste', w: 1.7, a: 'r' }, { h: 'Échéance', w: 1.5, a: 'c' }, { h: 'Statut', w: 1.4, a: 'c' }],
      credits.map(c => { const d = devOf(c); return [frDate(c.date), fmt(c.amount, d), fmt(c.interet || 0, d), fmt(c.repaid || 0, d), fmt(creditRemaining(c), d), frDate(c.dueDate), stOf(c)]; }), 'Aucun crédit enregistré.');
    const hist = (m.history || []).slice().reverse();
    section('Mouvements (' + hist.length + ')');
    table([{ h: 'Date', w: 1.4, a: 'c' }, { h: 'Opération', w: 3 }, { h: 'Montant', w: 1.8, a: 'r' }, { h: 'Détail', w: 4 }],
      hist.map(h => { const a = Number(h.amount) || 0, d = devOf(h); return [frDate(h.date), OP_LABELS[h.type] || 'Opération', h.type === 'correction' ? (a > 0 ? '+' : '-') + fmt(Math.abs(a), d) : fmt(a, d), h.note || '']; }), 'Aucune opération enregistrée.');
    y -= 4;
    if (y - 40 < M + 22) newPage(false);
    text('Ce relevé est un document PDF à plat, généré par l\'application le ' + frDate(todayIso) + ' à ' + hh + '. Il fait foi à cette date.', M, y - 8, 8, { italic: true, color: C.grey });
    pages.forEach((p, i) => {
      p.drawText(safe(ORG + ' · Relevé de compte · ' + ref), { x: M, y: 16, size: 7.5, font: F, color: col(C.grey) });
      const t = 'Page ' + (i + 1) + ' / ' + pages.length; p.drawText(t, { x: W - M - F.widthOfTextAtSize(t, 7.5), y: 16, size: 7.5, font: F, color: col(C.grey) });
    });
    return { bytes: await pdf.save(), fileName: 'releve-' + safe(m.id || 'membre') + '-' + todayIso + '.pdf', ref };
  })();
}
exports.buildPdf = buildPdf; exports.buildStatement = buildStatement;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.AvecPdf = {}));
