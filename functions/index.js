/**
 * AVEC LA SAGESSE : envoi automatique des messages WhatsApp.
 *
 * L'application dépose chaque message dans la collection Firestore « whatsappQueue » (statut « pending »).
 * Cette fonction se déclenche à chaque nouveau message, l'envoie par l'API officielle WhatsApp Cloud de Meta,
 * puis note le résultat dans le même document : sent / failed / cancelled.
 *
 * Réglages lus dans Firestore (document settings/whatsapp, modifié depuis l'onglet Annonces de l'application) :
 *   mode      'manual' | 'auto'  (en « manual », rien n'est envoyé : le message est marqué « cancelled »)
 *   template  nom du modèle approuvé par Meta (vide = message texte libre, possible seulement dans les 24 h après
 *             un message du membre)
 *   lang      langue du modèle (fr)
 *
 * Secrets et paramètres : voir GUIDE-WHATSAPP-AUTO.md.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const PDFLib = require('pdf-lib');
const { buildPdf } = require('./report');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');        // jeton d'accès permanent Meta
const PHONE_ID = defineString('WHATSAPP_PHONE_ID', { default: '' });            // identifiant du numéro WhatsApp Business
const API_VERSION = defineString('WHATSAPP_API_VERSION', { default: 'v23.0' });
const DAILY_LIMIT = defineInt('WHATSAPP_DAILY_LIMIT', { default: 300 });
const RESEND_KEY = defineSecret('RESEND_API_KEY');             // clé du service d'envoi d'e-mails (Resend)
const REPORT_FROM = defineString('REPORT_FROM', { default: 'AVEC LA SAGESSE <onboarding@resend.dev>' });

// Un paramètre de modèle ne peut pas contenir de retour à la ligne ni de longues suites d'espaces
function toTemplateText(text) {
  return String(text || '')
    .replace(/\s*\n+\s*/g, ' | ')
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim()
    .slice(0, 1000);
}

function buildPayload(to, text, settings) {
  const template = String(settings.template || '').trim();
  if (template) {
    return {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: template,
        language: { code: String(settings.lang || 'fr') },
        components: [{ type: 'body', parameters: [{ type: 'text', text: toTemplateText(text) }] }]
      }
    };
  }
  return { messaging_product: 'whatsapp', to: to, type: 'text', text: { preview_url: false, body: String(text).slice(0, 1000) } };
}

async function sentToday() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const snap = await db.collection('whatsappQueue').where('sentAt', '>=', admin.firestore.Timestamp.fromDate(start)).count().get();
  return snap.data().count;
}

exports.sendWhatsapp = onDocumentCreated(
  { document: 'whatsappQueue/{id}', secrets: [WHATSAPP_TOKEN], memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (event) => {
    const ref = event.data.ref;
    const data = event.data.data();
    if (!data || data.status !== 'pending') return;

    // Verrouillage : un seul traitement par message (jamais d'envoi en double)
    const locked = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get('status') !== 'pending') return false;
      tx.update(ref, { status: 'sending' });
      return true;
    });
    if (!locked) return;

    const finish = (patch) => ref.update(Object.assign({ finishedAt: admin.firestore.FieldValue.serverTimestamp() }, patch));

    try {
      const settingsSnap = await db.doc('settings/whatsapp').get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (settings.mode !== 'auto') {
        await finish({ status: 'cancelled', error: "Envoi automatique désactivé (mode manuel)." });
        return;
      }
      const to = String(data.to || '');
      if (!/^[0-9]{8,15}$/.test(to)) {
        await finish({ status: 'failed', error: 'Numéro invalide.' });
        return;
      }
      if ((await sentToday()) >= DAILY_LIMIT.value()) {
        await finish({ status: 'failed', error: 'Limite journalière atteinte (' + DAILY_LIMIT.value() + ' messages). Réessayez demain.' });
        return;
      }

      const url = 'https://graph.facebook.com/' + API_VERSION.value() + '/' + PHONE_ID.value() + '/messages';
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + WHATSAPP_TOKEN.value(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(to, data.text, settings))
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.messages && body.messages[0]) {
        await finish({ status: 'sent', waId: body.messages[0].id, sentAt: admin.firestore.FieldValue.serverTimestamp(), error: admin.firestore.FieldValue.delete() });
      } else {
        const e = body.error || {};
        const msg = '(' + res.status + (e.code ? '/' + e.code : '') + ') ' + (e.error_user_msg || e.message || 'Erreur Meta');
        logger.warn('Envoi WhatsApp refusé', { id: ref.id, status: res.status, code: e.code, message: e.message });
        await finish({ status: 'failed', error: msg.slice(0, 300) });
      }
    } catch (err) {
      logger.error('Envoi WhatsApp impossible', { id: ref.id, err: String(err) });
      await finish({ status: 'failed', error: String(err && err.message || err).slice(0, 300) });
    }
  }
);


// =====================================================================================================
// Rapport mensuel par e-mail (PDF en pièce jointe) pour l'administrateur
//   settings/report : { enabled, to }  (réglé depuis l'onglet Équipe de l'application)
//   Envoi automatique le 1er de chaque mois à 7 h (heure de Lubumbashi), ou à la demande (reportRequests).
// =====================================================================================================
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function readAll(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function sendMonthlyReport() {
  const st = await db.doc('settings/report').get();
  const settings = st.exists ? st.data() : {};
  const to = String(settings.to || '').trim();
  if (!EMAIL_RE.test(to)) throw new Error("Aucune adresse e-mail valide pour le rapport (onglet Équipe).");
  const [members, requests, claims, social, orgDoc] = await Promise.all([readAll('members'), readAll('requests'), readAll('claims'), db.doc('settings/social').get(), db.doc('settings/org').get()]);
  const org = (orgDoc.exists && String(orgDoc.data().name || '').trim()) || 'AVEC LA SAGESSE';
  const weekly = social.exists ? Number(social.data().weekly) : 1000;
  const r = await buildPdf(PDFLib, { members, requests, claims, weekly, org, now: new Date() });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_KEY.value(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REPORT_FROM.value(),
      to: [to],
      subject: org + ' : rapport de ' + r.monthLabel,
      html: '<p>Bonjour,</p><p>Veuillez trouver en pièce jointe le rapport mensuel de « ' + org.replace(/[<>&]/g, '') + ' » pour <strong>' + r.monthLabel + '</strong> (situation des membres, crédits, opérations du mois, cas sociaux, points à traiter).</p><p>Message envoyé automatiquement.</p>',
      attachments: [{ filename: 'rapport-avec-' + r.monthKey + '.pdf', content: Buffer.from(r.bytes).toString('base64') }]
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('(' + res.status + ') ' + (body.message || body.name || 'Refus du service e-mail'));
  return { to: to, month: r.monthLabel, id: body.id };
}

async function noteReportResult(ok, info) {
  const patch = { lastAt: admin.firestore.FieldValue.serverTimestamp(), lastStatus: ok ? 'sent' : 'failed' };
  patch.lastError = ok ? '' : String(info).slice(0, 300);
  await db.doc('settings/report').set(patch, { merge: true });
}

exports.monthlyReport = onSchedule(
  { schedule: '0 7 1 * *', timeZone: 'Africa/Lubumbashi', secrets: [RESEND_KEY], memory: '512MiB', timeoutSeconds: 180 },
  async () => {
    const st = await db.doc('settings/report').get();
    if (!st.exists || st.data().enabled !== true) { logger.info('Rapport mensuel désactivé'); return; }
    try { await sendMonthlyReport(); await noteReportResult(true); }
    catch (err) { logger.error('Rapport mensuel impossible', { err: String(err) }); await noteReportResult(false, (err && err.message) || err); }
  }
);

exports.reportNow = onDocumentCreated(
  { document: 'reportRequests/{id}', secrets: [RESEND_KEY], memory: '512MiB', timeoutSeconds: 180, maxInstances: 2 },
  async (event) => {
    const ref = event.data.ref;
    const data = event.data.data();
    if (!data || data.status !== 'pending') return;
    const locked = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get('status') !== 'pending') return false;
      tx.update(ref, { status: 'sending' });
      return true;
    });
    if (!locked) return;
    try {
      const info = await sendMonthlyReport();
      await ref.update({ status: 'sent', finishedAt: admin.firestore.FieldValue.serverTimestamp() });
      await noteReportResult(true, info);
    } catch (err) {
      logger.error('Rapport à la demande impossible', { err: String(err) });
      const msg = String((err && err.message) || err).slice(0, 300);
      await ref.update({ status: 'failed', error: msg, finishedAt: admin.firestore.FieldValue.serverTimestamp() });
      await noteReportResult(false, msg);
    }
  }
);
