# Rapport mensuel par e-mail (PDF)

Chaque **1er du mois à 7 h** (heure de Lubumbashi), un rapport PDF est envoyé automatiquement par e-mail à l'administrateur : situation des membres, crédits en retard et échéances à venir, activité du mois écoulé, cas sociaux, demandes et réclamations à traiter. Vous pouvez aussi l'envoyer **tout de suite** avec le bouton « Envoyer un rapport maintenant ».

Le réglage est dans l'application : onglet **Équipe**, carte **« Rapport mensuel par e-mail (PDF) »** (accès total seulement). Il fonctionne après l'installation ci-dessous, à faire **une seule fois**.

## Comment ça marche
Un petit programme hébergé par Firebase (dossier `functions/`) se réveille chaque mois, lit les données de la base, fabrique le PDF et l'envoie par le service d'e-mail **Resend**. L'application elle-même ne peut pas envoyer d'e-mail toute seule : c'est pour cela qu'il faut cette installation.

## Ce qu'il faut
- Le plan **Blaze** de Firebase (paiement à l'usage, carte bancaire requise). À cette échelle (un message par mois), la facture attendue est de 0 à quelques centimes ; fixez quand même un budget d'alerte (par exemple 5 $) dans Firebase > Utilisation et facturation.
- Un compte gratuit sur **resend.com** (3 000 e-mails par mois gratuits). **Créez-le avec l'adresse e-mail qui doit recevoir le rapport.**

## Installation pas à pas

### A. Resend
1. Allez sur **resend.com**, créez un compte avec **votre adresse d'administrateur**.
2. **API Keys > Create API Key** : nom `avec`, permission **Sending access**. **Copiez la clé** (elle commence par `re_`) et gardez-la secrète.

Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte Resend : c'est exactement ce qu'il faut ici (le rapport va à l'administrateur). Pour envoyer à une autre adresse, il faudra vérifier un domaine dans Resend, puis indiquer `REPORT_FROM=WEBSERVICES FIN <rapport@votre-domaine>` dans `functions/.env`.

### B. Firebase : installer le programme
1. Console Firebase : passez le projet au plan **Blaze** (si ce n'est pas déjà fait pour WhatsApp).
2. Ouvrez **shell.cloud.google.com** (avec le même compte Google que Firebase) et tapez, une commande à la fois :

   ```
   git clone https://github.com/weundeprince6-droid/AVEC-LA-SAGESSE
   cd AVEC-LA-SAGESSE
   npm install -g firebase-tools
   firebase login --no-localhost
   firebase use avec-la-sagesse
   cd functions && npm install && cd ..
   firebase functions:secrets:set RESEND_API_KEY
   ```
   (collez la clé `re_…` quand elle est demandée), puis :

   ```
   firebase deploy --only functions:monthlyReport,functions:reportNow
   ```
   Si Firebase demande d'activer des services (Cloud Build, Cloud Scheduler, Artifact Registry, Eventarc), répondez oui. Ne lancez jamais `firebase deploy` sans `--only functions:…` : cela pourrait écraser vos règles de sécurité.

### C. Publier les nouvelles règles
Firebase > Firestore > **Règles** : collez le contenu à jour de `firestore.rules` (remplacez `votre-email@exemple.com` par votre e-mail d'administrateur), puis **Publier**.

### D. Activer dans l'application
1. Ctrl+F5, connectez-vous en administrateur, onglet **Équipe**.
2. Dans la carte « Rapport mensuel par e-mail », saisissez l'adresse, cochez « Envoyer le rapport automatiquement chaque mois », **Enregistrer**.
3. Cliquez sur **Envoyer un rapport maintenant** : au bout d'une à deux minutes, l'e-mail arrive (regardez aussi les courriers indésirables) et l'état « Dernier envoi » passe à **réussi**.

## En cas de problème
| Message dans la carte | Cause probable |
| --- | --- |
| `(403)` ou `(422)` « domain / recipient not verified » | L'adresse n'est pas celle du compte Resend. Utilisez l'adresse du compte, ou vérifiez un domaine. |
| `(401)` clé invalide | Refaites `firebase functions:secrets:set RESEND_API_KEY` avec la bonne clé, puis redéployez. |
| Rien ne se passe après « Envoyer maintenant » | Le programme n'est pas déployé ou a une erreur : Firebase > Functions > Journaux. |
| « Aucune adresse e-mail valide » | Enregistrez d'abord l'adresse (bouton « Enregistrer »). |

## Arrêter
Décochez « Envoyer le rapport automatiquement chaque mois » et enregistrez : rien n'est plus envoyé.
