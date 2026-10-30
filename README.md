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
| `GUIDE-RAPPORT-EMAIL.md` | Rapport mensuel PDF envoyé par e-mail (Cloud Function + Resend) |
| `GUIDE-WHATSAPP-AUTO.md` | Envoi automatique des messages WhatsApp (Meta + Cloud Function) |
| `functions/` , `firebase.json` | Programme d’envoi automatique (à déployer fonction par fonction : `firebase deploy --only functions:NOM`, voir les guides) |

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
- **Rapport Excel** (bouton « Exporter » du bandeau) : classeur .xlsx avec une feuille par onglet (Tableau de bord avec indicateurs et 3 graphiques, Membres, Crédits, Opérations avec graphique, Cas sociaux avec graphique, Collectes, Annonces, Galerie avec les photos, Demandes, Réclamations, et Équipe + Journal pour l'accès total). Mise en forme prête à imprimer (A4 paysage), statuts colorés, totaux, filtres. Construit dans le navigateur avec `report-xlsx.js` et `vendor/jszip.min.js` (JSZip, licence MIT) ; si le chargement échoue, un CSV simplifié est proposé.
- **Rapport PDF** : le bouton « Exporter » ouvre un choix **Excel** ou **PDF**. Le PDF est un rapport mis en page (tableau de bord avec graphiques, puis une page par onglet) généré à partir des données de la base à cet instant ; dans la fenêtre qui s'ouvre, « Enregistrer en PDF / Imprimer » puis choisir « Enregistrer au format PDF » (A4 paysage). Autoriser les fenêtres pop-up pour le site.
- **Rapport mensuel par e-mail** (onglet Équipe, accès total) : un PDF (synthèse et graphiques, activité du mois, crédits en retard et échéances, membres, cas sociaux, points à traiter) est envoyé automatiquement le 1er de chaque mois à 7 h à l'adresse choisie, ou tout de suite avec « Envoyer un rapport maintenant ». Cloud Functions `monthlyReport` et `reportNow` (`functions/report.js`, pdf-lib) + service d'e-mail Resend. Installation unique dans `GUIDE-RAPPORT-EMAIL.md`. Republier firestore.rules.


## Rapport par e-mail sans installation (manuel)
Équipe > « Envoi manuel » > « Préparer l'e-mail avec le rapport PDF » : le PDF s'ouvre (Enregistrer au format PDF), puis Gmail s'ouvre avec le message prêt ; joignez le PDF et envoyez. Gratuit, sans plan Blaze.

## Boutique des membres
Chaque membre peut ouvrir une boutique (onglet « Boutique » de son espace), publier des articles et en acheter chez les autres. Fonctionne en mode en ligne seulement.
- Boutiques et articles sont publiés tout de suite ; l'administrateur peut les masquer (onglet « Boutique »).
- L'acheteur commande ; le vendeur accepte ou refuse ; l'administrateur clique « Conclure la vente ».
- À la conclusion, le prix est prélevé sur l'épargne de l'acheteur, le vendeur reçoit 95 % sur son épargne et 5 % vont à la caisse de l'AVEC (commission). Tout est écrit en une seule opération.
- **Important : republiez `firestore.rules`** (nouvelles collections shops, items, orders), puis Ctrl+F5.
- Pour publier ou remettre en vente un article, le membre doit avoir fait un versement d'épargne dans les 14 derniers jours (règle appliquée par l'application et par `firestore.rules`, via le champ `lastEpargneDay` de la fiche).
- Retrait : après l'approbation, l'administrateur confirme « Argent remis au membre » (onglet Demandes) ; le membre voit « Argent remis le … ».
- Une vente (paiement par l'épargne) ne peut être conclue que si, après le paiement, l'épargne de l'acheteur reste au moins égale au tiers de son crédit en cours (même règle que pour un retrait).
- L'organisation a sa propre boutique (onglet « Boutique » de l'administrateur > « Boutique de l'organisation ») : produits de l'AVEC visibles par tous les membres ; à la conclusion d'une vente, tout le prix va à la caisse de l'AVEC (sans commission).
- Rapport PDF et Excel : un encadré « Commentaires » sous chaque tableau (chiffres clés, points à surveiller, retards, tendances), calculé automatiquement à partir des données (fichier `report-notes.js`).

## Nom et logo de l'organisation
- Le nom (et un logo facultatif) se règlent dans le tableau de bord, carte « Identité de l'organisation » (administrateur à accès total). Ils s'affichent sur la page de connexion, dans les espaces admin et membre, les messages WhatsApp, les rapports PDF/Excel et la boutique.
- À la création du compte administrateur, le champ « Nom de votre organisation » est enregistré à la première connexion ; sans nom, l'application le demande.
- Stockage : document `settings/org` (lisible avant connexion, modifiable par l'administrateur) : republier `firestore.rules`.

## Rapports en PDF uniquement
- Le bouton « Rapport PDF » de l'administrateur télécharge directement un vrai fichier PDF (plus d'Excel ni de fenêtre d'impression). Il est construit dans le navigateur avec `vendor/pdf-lib.min.js` et `functions/report.js` (le même code sert au rapport mensuel du serveur).
- Chaque membre a un bouton « Mon relevé PDF » (carte « Mes Opérations ») : synthèse épargne/crédits, crédits, mouvements, référence unique, date et heure d'édition. PDF à plat, sans champ modifiable.

## Exposition (galerie de l'organisation)
- Onglet « Exposition » côté équipe (publier, masquer, supprimer, modérer les commentaires) et côté membre (voir, aimer ♥, commenter, filtrer Photos / Vidéos / Documents ; pastille pour les nouveautés).
- Sans Firebase Storage (formule gratuite) : 3 photos par publication (réduites automatiquement), vidéo = lien (YouTube intégré dans la page), document = lien ou PDF de 350 Ko maximum.
- Données : collections `posts`, `postLikes`, `postComments` (règles à republier dans `firestore.rules`). Cloud uniquement.
- **Commentaires par photo** : en ouvrant une photo en grand, chaque membre peut la commenter à part (champ `photo` 0 à 2 dans `postComments`) ; un compteur apparaît sur la photo et la liste générale indique « Photo n ». Republier `firestore.rules`.

## Phase 2 : sous-groupes et chefs de groupe
- **Onglet « Groupes »** (équipe) : on crée un groupe en choisissant un membre comme chef (l'identifiant du groupe est celui du chef), on affecte ou retire des membres, on suspend ou dissout un groupe (dissolution : accès total). Totaux par groupe (membres, épargne, crédits, retards) et section « Sous-groupes » dans le rapport PDF.
- **Chef de groupe** : un onglet « Mon groupe » apparaît dans son espace. Il voit les fiches de son groupe, **propose** des versements ou remboursements (rien ne bouge sans validation de l'équipe : bouton Valider / Refuser, enregistré dans le journal) et partage un **lien d'inscription propre** (`?inscription&g=<identifiant du chef>`) ; la demande arrive à l'équipe, qui l'accepte : le nouveau membre entre dans le groupe.
- Les membres restent dans la caisse commune de l'organisation. Le membre d'un groupe voit le nom du groupe et de son chef sous son titre.
- Données : collections `groups` et `groupOps`, champ `groupId` sur la fiche membre et sur la demande d'inscription. **Republier `firestore.rules`.** Cloud uniquement.
- **Rapports de groupe (PDF)** : bouton « Rapport PDF du groupe » pour le chef (son groupe) et « PDF » par groupe pour l'équipe : synthèse, membres, crédits en retard, échéances à 30 jours, propositions du chef.
- **Excel réservé à l'administrateur principal** : le bouton « Excel » du bandeau n'apparaît que pour le compte dont l'e-mail est écrit dans `firestore.rules` (sans fiche d'équipe) ; il contient aussi une feuille « Groupes ». Les autres comptes de l'équipe n'ont que le PDF.
- **Onglets regroupés** : « Membres & groupes », « Demandes & réclamations » et « Galerie & exposition » (barre de petits boutons en haut de chaque onglet pour passer de l'un à l'autre, avec leurs pastilles). Même regroupement « Demandes & réclamations » dans l'espace membre.  Ordre : Tableau de bord, Membres & groupes, Opérations & cas sociaux, Équipe, Boutique, Demandes & réclamations, Annonces & journal, Galerie & exposition. Aussi « Opérations & cas sociaux » et « Annonces & journal » (le journal reste réservé à l'accès total).

## Protection des fichiers de rapport

- **PDF** (rapport, relevé de membre, rapport de groupe) : chiffrés (norme PDF, RC4 128 bits, `functions/pdf-protect.js`). Ils s'ouvrent **sans mot de passe** et s'**impriment**, mais modification, annotation, assemblage et copie du contenu sont refusés sans le mot de passe propriétaire.
- **Excel** (administrateur principal uniquement) : feuilles et structure du classeur protégées par mot de passe ; le filtrage reste possible.
- Le mot de passe est saisi par l'administrateur principal une fois par session (jamais écrit dans le code ni en ligne). Les autres comptes (membres, chefs de groupe, équipe) reçoivent des fichiers protégés par un mot de passe aléatoire : personne ne peut les modifier.
- Limite : c'est une protection de « bonne foi » ; des outils spécialisés peuvent contourner ces restrictions. Pour une preuve infalsifiable, comparer avec la référence imprimée sur le document.

## Chef de groupe : mêmes droits qu'un « poste » sur ses membres

Le chef de groupe n'a plus à faire valider ses opérations : sur les membres de **son** groupe uniquement, il enregistre directement versements d'épargne, retraits, octrois de crédit et remboursements, accepte ou refuse leurs demandes de crédit/retrait et répond à leurs réclamations (comme un poste de l'équipe : il corrige et saisit, mais ne supprime rien). Les opérations sont signées dans l'historique de la fiche (« Par le chef de groupe … »). Un groupe suspendu ne peut plus rien enregistrer.
- Nécessite de **republier `firestore.rules`**. Les demandes/réclamations créées à partir de maintenant portent l'identifiant du groupe (`groupId`) ; celles d'avant restent traitées par l'équipe.
- L'inscription de nouvelles personnes reste validée par l'équipe.

## Espace de gestion du chef de groupe

Dans « Mon groupe », le bouton **Ouvrir mon espace de gestion** donne au chef les onglets de l'équipe : Tableau de bord, Membres (avec inscriptions de son groupe, ajout de membres, accès), Opérations & cas sociaux, Demandes & réclamations, Galerie des membres, rapport PDF. Tout est limité aux membres de son groupe (la base de données applique la même limite). Comme un poste, il ne supprime rien. Le bouton « Mon espace membre » le ramène à son espace personnel.
Non accessibles au chef : Équipe, Boutique, Annonces & journal, Exposition, Excel, identité de l'organisation, groupes.
Les nouveaux membres créés par un chef reçoivent un numéro `MBR-xxxxxx` tiré au hasard (il ne voit pas les autres groupes, donc pas de numérotation continue).
Nécessite de republier `firestore.rules`.

## Relevés de compte : trace dans le journal et copie à l'identique

Quand un membre télécharge son relevé, une ligne « Relevé de compte téléchargé… · réf. REL-… » apparaît dans le **Journal d'activité** de l'administrateur, avec le bouton **Rouvrir ce relevé** : il retélécharge exactement le même fichier (mêmes références, même date, mêmes chiffres du jour). Une copie est conservée dans la collection `statements` (réservée à l'administrateur). Nécessite de republier `firestore.rules`. Pour un relevé avec les chiffres d'aujourd'hui, l'administrateur utilise le relevé du membre comme avant.

## Onglet Groupes et « Gros plan »

L'onglet **Groupes** (équipe) liste les groupes ; **Voir tout** déplie la fiche complète et **Gros plan** fait entrer l'administrateur dans la vue du groupe : tous les onglets (tableau de bord, membres, groupes, opérations, demandes, réclamations, galerie, rapport PDF) ne montrent plus que les membres, demandes, réclamations et inscriptions de ce groupe, comme pour son chef, avec les droits de l'équipe. Le bandeau bleu « Quitter le gros plan » ramène à la vue complète.

## Bordereaux de transaction

Chaque versement d'épargne, retrait, crédit accordé et remboursement saisi par l'équipe, un administrateur ou un chef de groupe ouvre automatiquement un **bordereau PDF (format A5)** à imprimer : référence `BRD-…`, date, membre, opération, montant, soldes après l'opération, auteur, cases de signature. La référence et les soldes sont archivés dans l'historique du membre ; le bouton imprimante (onglet Membres > fiche, et espace du membre) **réimprime** le bordereau (marqué « DUPLICATA », réimpression notée dans le journal). Si le navigateur bloque la fenêtre, le fichier est téléchargé. Les anciennes opérations sans soldes archivés se réimpriment aussi, avec la mention « soldes non disponibles ».
