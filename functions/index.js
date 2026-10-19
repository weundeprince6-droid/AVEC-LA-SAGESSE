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
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');        // jeton d'accès permanent Meta
const PHONE_ID = defineString('WHATSAPP_PHONE_ID');            // identifiant du numéro WhatsApp Business
const API_VERSION = defineString('WHATSAPP_API_VERSION', { default: 'v23.0' });
const DAILY_LIMIT = defineInt('WHATSAPP_DAILY_LIMIT', { default: 300 });

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
