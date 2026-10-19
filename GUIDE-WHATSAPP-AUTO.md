# Envoi automatique des messages WhatsApp

L'application sait envoyer les messages WhatsApp de deux façons. Vous choisissez dans l'onglet **Annonces**, carte **« Envoi WhatsApp : manuel ou automatique »** (réglage réservé à l'accès total) :

| Mode | Ce qui se passe | Coût |
| --- | --- | --- |
| **Manuel** (par défaut) | WhatsApp s'ouvre avec le message prêt, vous appuyez sur « Envoyer ». | Gratuit |
| **Automatique** | Le message part tout seul, sans ouvrir WhatsApp, avec l'API officielle de Meta. | Facturé par Meta au message (voir plus bas) + plan Firebase Blaze |

Le mode manuel marche toujours, sans rien installer. Le mode automatique ne marche qu'après l'installation ci-dessous, à faire **une seule fois**. Tant qu'elle n'est pas faite, restez en « Manuel ».

## Comment ça marche

1. En mode automatique, chaque bouton WhatsApp de l'application dépose le message dans une file d'envoi de la base de données (collection `whatsappQueue`).
2. Un petit programme hébergé par Firebase (dossier `functions/`) voit le nouveau message et l'envoie à Meta.
3. Le résultat (Envoyé, Échec avec la raison) s'affiche dans la « File d'envoi automatique » de la carte. Un bouton permet de réessayer un échec.

Ce que l'automatique ajoute :
- **Confirmation automatique de chaque opération** (versement, crédit, remboursement, retrait, cotisation) au membre concerné, case à cocher dans la carte.
- **Diffusion à tous** : bouton « Envoyer automatiquement à tous » (onglet Annonces) et bouton « Partager sur WhatsApp » d'une annonce, qui part à tous les membres ayant un numéro.
- Les accès des nouveaux membres (mot de passe) restent toujours en manuel : un mot de passe n'est jamais gardé dans la file.

Garde-fous : un message ne part jamais en double, le mode manuel annule les envois en attente, et le programme refuse d'envoyer plus de 300 messages par jour (réglable).

## Ce qu'il faut préparer

- Un **numéro de téléphone dédié** à l'AVEC, qui n'est pas utilisé dans l'application WhatsApp ou WhatsApp Business normale (un numéro enregistré dans l'API ne peut plus servir dans l'appli).
- Un compte **Meta Business** (business.facebook.com), avec vérification de l'entreprise si Meta la demande.
- Une **carte bancaire** acceptée par Meta (facturation des messages) et par Google (plan Blaze).
- L'accès au projet Firebase **AVEC LA SAGESSE**.

## Coût

- **Meta** : un tarif par message, qui dépend du pays et du type de message (de l'ordre de 0,004 à 0,01 $ pour un message de notification dans les pays voisins ; tarif exact de la RDC à vérifier sur la grille de Meta : developers.facebook.com/docs/whatsapp/pricing). Depuis le 1er octobre 2026, des messages de service gratuits sont prévus chaque mois (1 000 par numéro, selon les informations publiées). Pour 100 membres et quelques messages par mois, on parle de quelques dollars au plus.
- **Firebase** : le plan **Blaze** (paiement à l'usage) est obligatoire pour les fonctions. Il garde un quota gratuit ; à cette échelle, la facture attendue est de 0 à quelques centimes. Dans la console Firebase, ouvrez **Utilisation et facturation > Détails et réglages** et fixez un **budget d'alerte** (par exemple 5 $) pour être prévenu.

## Installation pas à pas

### A. Meta : obtenir l'accès WhatsApp
1. Allez sur **developers.facebook.com**, connectez-vous, **Mes applications > Créer une application**, type **Entreprise**, et associez votre compte Meta Business.
2. Dans l'application, ajoutez le produit **WhatsApp** et ouvrez **Configuration de l'API**.
3. **Ajoutez votre numéro** dédié et validez-le par le code reçu par SMS ou appel.
4. Notez le **Phone number ID** (« Identifiant du numéro de téléphone »). Ce n'est pas le numéro lui-même.
5. Créez un **jeton permanent** : dans Meta Business > **Paramètres de l'entreprise > Utilisateurs > Utilisateurs système**, créez un utilisateur système (rôle Admin), ajoutez-lui l'application, puis **Générer un jeton** avec les autorisations `whatsapp_business_messaging` et `whatsapp_business_management`, sans expiration. **Copiez le jeton et gardez-le secret** : il permet d'envoyer des messages en votre nom.
6. Ajoutez un **moyen de paiement** dans les paramètres WhatsApp Business (compte WhatsApp Business > Paiement).

### B. Meta : créer le modèle de message
Meta n'autorise l'envoi d'un premier message à un membre que par un **modèle approuvé**. Un seul modèle suffit : l'application y glisse le texte de chaque message.

1. **WhatsApp Manager > Modèles de messages > Créer un modèle**.
2. Catégorie : **Utilité** (Utility). Nom : `avec_notification` (en minuscules). Langue : **Français**.
3. Texte du corps (une seule variable `{{1}}`, avec du texte avant et après) :

   `AVEC LA SAGESSE vous informe : {{1}} Merci de votre confiance.`

4. Exemple de valeur pour `{{1}}` : `Confirmation : Versement d'épargne de $50 le 19/10/2026.`
5. Envoyez pour approbation (quelques minutes à quelques jours). Si Meta refuse, modifiez légèrement le texte fixe (ajoutez une phrase avant la variable), puis reportez le nouveau nom dans l'application (étape D, « Réglages avancés »).

Les retours à la ligne des messages sont remplacés par « | » dans le modèle, car Meta n'accepte pas de saut de ligne dans une variable.

### C. Firebase : installer le programme d'envoi
Le plus simple est d'utiliser **Google Cloud Shell**, un terminal dans le navigateur (rien à installer).

1. Dans la console Firebase, **Utilisation et facturation** : passez le projet au plan **Blaze**.
2. Ouvrez **shell.cloud.google.com** (connecté avec le même compte Google que Firebase).
3. Tapez ces commandes, une par une :

   ```
   git clone https://github.com/weundeprince6-droid/avec-la-sagesse
   cd avec-la-sagesse
   npm install -g firebase-tools
   firebase login --no-localhost
   firebase use avec-la-sagesse
   cd functions && npm install && cd ..
   ```

4. Enregistrez le jeton secret (collez-le quand il est demandé) :

   ```
   firebase functions:secrets:set WHATSAPP_TOKEN
   ```

5. Créez le fichier de réglages (remplacez 123456789 par votre Phone number ID) :

   ```
   echo "WHATSAPP_PHONE_ID=123456789" > functions/.env
   ```

6. Déployez **uniquement les fonctions** (ne lancez jamais `firebase deploy` sans `--only functions` : cela pourrait écraser vos règles de sécurité) :

   ```
   firebase deploy --only functions
   ```

   Si Firebase demande d'activer des services (Cloud Build, Artifact Registry, Eventarc), répondez oui.

### D. Publier les nouvelles règles
Dans la console Firebase > Firestore > **Règles**, collez le contenu à jour de `firestore.rules` (remplacez `votre-email@exemple.com` par votre e-mail d'administrateur), puis **Publier**. Elles ajoutent le réglage `settings/whatsapp` et la file `whatsappQueue`.

### E. Activer dans l'application
1. Actualisez la page (Ctrl+F5), connectez-vous en administrateur, onglet **Annonces**.
2. Dans la carte **Envoi WhatsApp**, choisissez **Automatique**. Si votre modèle ne s'appelle pas `avec_notification`, ouvrez **Réglages avancés** et corrigez le nom.
3. **Enregistrer le réglage**.
4. **Faites d'abord un essai sur votre propre numéro** : ajoutez-vous comme membre (ou utilisez votre fiche), cliquez sur « Envoyer la situation » et regardez la file d'envoi : le statut doit passer à **Envoyé**.

## En cas de problème

| Statut dans la file | Cause probable |
| --- | --- |
| Échec `(401/190)` | Jeton Meta invalide ou expiré : recréez un jeton permanent et refaites l'étape C.4, puis redéployez. |
| Échec `(404/…)` ou `(400/…)` sur le numéro | Le Phone number ID dans `functions/.env` est faux. |
| Échec `(…/132001)` | Le modèle n'existe pas ou n'est pas encore approuvé, ou son nom/langue ne correspond pas au réglage. |
| Échec `(…/131030)` | En mode test Meta, seuls les numéros ajoutés à la liste autorisée peuvent recevoir des messages. |
| Échec `(…/131047)` | Message libre envoyé hors de la fenêtre de 24 h : indiquez le nom du modèle dans « Réglages avancés ». |
| Échec `(…/131026)` | Le numéro du membre n'a pas WhatsApp ou est injoignable. |
| Échec « Limite journalière atteinte » | Plus de 300 messages aujourd'hui. Pour changer, mettez `WHATSAPP_DAILY_LIMIT=500` dans `functions/.env` et redéployez. |
| Annulé | Le mode était repassé en manuel au moment de l'envoi. |
| Reste « En attente » | Le programme n'est pas déployé ou a une erreur : voir **Firebase > Functions > Journaux**. |

## Revenir en arrière
Choisissez **Manuel** dans la carte : plus rien ne part automatiquement et les boutons ouvrent de nouveau WhatsApp. Pour ne plus rien payer, repassez aussi le projet au plan Spark.
