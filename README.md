# AVEC-LA-SAGESSE

Application web de gestion d'une AVEC : épargne, crédits et remboursements des membres.

- **Administrateur** : enregistre les membres, les versements, les crédits et les remboursements ; traite les demandes (crédit / retrait) et les réclamations ; peut corriger les chiffres.
- **Membre** : se connecte avec son identifiant (son ID, par exemple `MBR-003`) et un mot de passe par défaut qu'il change à sa première connexion. Il consulte seulement son épargne, ses crédits et son historique, envoie des demandes de crédit ou de retrait, et des réclamations.

## Devises et cas sociaux

- Deux devises : **dollars ($)** et **francs congolais (FC)**, chacune avec son épargne, ses crédits (plafond 3x, intérêt 10 %) et ses totaux. Aucune conversion n'est faite.
- Le tableau de bord affiche l'**argent en caisse** en dollars et en francs (estimation : épargne + intérêts − crédits à rembourser ; en francs on ajoute le fonds cas sociaux).
- **Cas sociaux** : chaque membre cotise chaque semaine (1 000 FC par défaut, montant modifiable par l'accès total dans l'onglet « Cas sociaux »; semaines du lundi au dimanche). Cet onglet enregistre les cotisations, signale les retards et enregistre les aides versées (déduites du fonds).
- **Cotisations occasionnelles** : pour un membre en difficulté, l'admin ouvre une collecte en fixant la part de chaque membre (identique pour tous, une seule part par membre), enregistre les versements (espèces ou prélevés sur l'épargne en FC), voit qui a versé ou non, et remet la somme au bénéficiaire.
- **Annonces** : l'équipe publie des messages (onglet « Annonces ») que tous les membres lisent en haut de leur compte ; une annonce peut être marquée « importante ».
- **Prolongation d'échéance** : bouton calendrier sur chaque crédit non soldé (on choisit la nouvelle date dans un calendrier) ; l'historique garde la trace.
- **Fiche détaillée d'un membre** : en cliquant sur son nom (ou « Détails »), l'équipe voit ses comptes en $ et FC, son profil, ses crédits, tous ses mouvements, ses cas sociaux, ses réclamations et ses demandes. Le membre complète lui-même son profil (adresse, profession, personne à prévenir…) dans son compte.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | L'application |
| `firebase-config.js` | Clé du projet Firebase (à compléter) |
| `firebase-adapter.js` | Connexion et synchronisation avec Firebase |
| `firestore.rules` | Règles de sécurité de la base (à publier dans Firebase) |
| `GUIDE-FIREBASE.md` | Installation pas à pas côté Firebase |
| `GUIDE-WHATSAPP-AUTO.md` | Envoi automatique des messages WhatsApp (Meta + Cloud Function) |
| `functions/` , `firebase.json` | Programme d’envoi automatique (à déployer avec `firebase deploy --only functions`) |

## Mode local et mode en ligne

Tant que `firebase-config.js` n'est pas rempli, l'application fonctionne en **mode local** : les données restent dans le navigateur de l'appareil.
Une fois Firebase configuré (voir `GUIDE-FIREBASE.md`), l'administrateur et les membres se connectent depuis n'importe quel appareil et voient les mêmes données en temps réel.

- **WhatsApp** : boutons verts (fiche membre, liste, mouvements, annonces) qui ouvrent WhatsApp avec le message déjà écrit (situation, rappel de remboursement, confirmation d'opération, annonce). Vous appuyez sur « Envoyer » depuis votre propre WhatsApp ; les numéros locaux commençant par 0 sont convertis en +243.
- **Diffusion WhatsApp** (onglet Annonces) : un message pour tous les membres qui ont un numéro, envoyé un par un avec « Envoyer au suivant » ({prénom} est remplacé), ou « Copier les numéros » pour créer un groupe.
- **Espace membre en onglets** : Accueil, Mes crédits, Demandes, Réclamations, Mon compte (profil + mot de passe côte à côte).
- **Photo de profil** : le membre choisit sa photo dans « Mon compte » (réduite à 200 px dans le navigateur, gardée dans sa fiche de profil). Elle apparaît dans son accueil et dans la liste et la fiche côté administrateur. Republier firestore.rules.
- **Agrandir la photo** : un clic sur une photo l'ouvre en grand (membre, administrateur ou poste de l'équipe) ; Échap ou un clic à côté la ferme.
- **Galerie** (administrateur) : onglet qui rassemble les photos de profil avec le nom du membre en titre, agrandissement au clic, téléchargement de chaque photo sous le nom du membre (ex. Bahati_Alain.jpg).
- **Inscriptions en ligne** : sous-onglet « Inscriptions » de l'onglet Membres (pastille rouge sur Membres) avec un lien à partager (adresse du site suivie de ?inscription). La personne remplit son identité (et une photo facultative) sans compte ; l'administrateur accepte (le membre est créé avec son profil et sa photo, ses accès partent par WhatsApp) ou refuse. Republier firestore.rules.
- **Mot de passe par défaut automatique** : « avec » + numéro du membre sur 4 chiffres (MBR-011 → avec0011), proposé dans le formulaire « Nouveau membre » et utilisé à l'acceptation d'une inscription. Le membre doit le changer à sa première connexion.
- **Envoi WhatsApp manuel ou automatique** (onglet Annonces, carte « Envoi WhatsApp », accès total) : en « Manuel », les boutons ouvrent WhatsApp (gratuit) ; en « Automatique », les messages sont déposés dans la file `whatsappQueue` et envoyés par une Cloud Function via l'API WhatsApp Cloud de Meta (confirmation automatique de chaque opération, diffusion à tous, suivi Envoyé/Échec avec réessai). Installation unique dans `GUIDE-WHATSAPP-AUTO.md` ; en attendant, rester en Manuel. Republier firestore.rules.
