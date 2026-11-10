# Plan de refonte graphique (module 11)

Sources lues : `design/LISEZMOI.md`, `design/charte.md`, `design/tokens.json`, les 7 images de `design/maquettes/`, les 3 de `design/logo/`, les 4 photos de `design/photos/`. Comparées avec les pages de `src/app/` et la base (`dev.db`).

## Données de référence (base, 10 nov.)

Ce sont elles, et non les maquettes, qui font foi pour tout contenu affiché.

| Salle | Capacité | Prix / heure | Équipements en base | Photo en base |
|---|---|---|---|---|
| L'Atelier | 4 | 25,00 € | Écran, Tableau blanc | aucune (`photo` vide) |
| Horizon | 8 | 40,00 € | Écran, Visio, Tableau blanc | aucune |
| Salle du Conseil | 12 | 60,00 € | Écran, Visio, Machine à café | aucune |
| Agora | 20 | 75,00 € | Vidéoprojecteur, Visio, Micro, Paperboard | aucune |

- Ordre d'affichage du code : par capacité croissante (Atelier, Horizon, Conseil, Agora).
- Statuts de réservation : `EN_ATTENTE`, `CONFIRMEE`, `ANNULEE`. Tickets : catégorie (réservation, paiement, annulation, autre), urgence (basse, normale, haute), statut (`A_TRAITER`, `VALIDE`), `aTransmettre`.
- Pages existantes : `/`, `/salles`, `/salles/[id]`, `/salles/[id]/reserver`, `/reservations/[id]`, `/aide`, `/admin/tickets` (développement seulement), 404 des salles. Rien d'autre.
- Contrôle des photos (`design/photos/`, 1920 × 1080) : chacune correspond à sa salle. Atelier : 4 fauteuils, écran, tableau blanc. Horizon : environ 8 sièges, écran, caméra de visio, tableau blanc. Conseil : 12 sièges, écran, caméra, machine à café. Agora : tables en U, une vingtaine de chaises, vidéoprojecteur, caméra, micro, paperboard (on y voit aussi un écran mural, absent de la base : écart mineur, acceptable sur une photo, à ne pas lister en équipement).

## 1. Ce qu'on reprend des maquettes

### Identité et fondations

| Élément | Détail | Où |
|---|---|---|
| Palette marine et cuivre | Jetons de `tokens.json` déclarés en variables Tailwind 4 (`@theme` dans `globals.css`) : `marine`, `marine-fonce`, `marine-clair`, `cuivre`, `cuivre-fonce`, `cuivre-clair`, `fond`, `surface`, `bordure`, `encre`, `encre-douce`, `succes`, `attente`, `erreur`. Remplace tous les `orange-*` et `slate-*` actuels. | `globals.css`, toutes les pages |
| Typographie | Playfair Display (titres, 600 à 700) et Manrope (interface), via `next/font/google`, à la place de Geist. Échelle `affiche` 56 / `titre-1` 40 / `titre-2` 28 / `titre-3` 20, réduite sur mobile (36 et 30). Sur-titres en capitales espacées 12 px. | `layout.tsx`, `globals.css` |
| Fond blanc cassé, cartes blanches | `fond` #F7F5F0 pour la page, `surface` pour cartes et formulaires, bordure `bordure`, ombre unique `ombre-carte`. | toutes les pages |
| Arrondis | `arrondi-s` champs, `arrondi-m` cartes et encadrés, `arrondi-l` grandes cartes de salle, pilule pour boutons et badges. | toutes les pages |
| Logo horizontal « R ǀ RÉUNÉA, Centre de démonstration » | Dans l'en-tête et le pied de page. | `Navigation.tsx`, nouveau pied de page |
| Monogramme R sur carré marine | Comme favicon (planche de marque). | `src/app/icon.png` (remplace `favicon.ico`) |
| Icônes au trait | Style Lucide des maquettes (calendrier, horloge, personnes, étiquette de prix, carte bancaire, info) devant les métadonnées et dans les encadrés. | toutes les pages |

### En-tête et pied de page

- **En-tête marine** pleine largeur : logo à gauche, liens à droite, lien actif souligné de cuivre (maquette accueil). Sur mobile, bouton « menu » (hamburger) qui déplie les liens. Liens : ceux qui existent déjà (Accueil, Nos salles, Aide, et Tickets en développement).
- **Pied de page marine** (version de la maquette mobile 02) : logo, liens de navigation existants, horaires « Du lundi au vendredi, de 8 h à 20 h », et la mention « Centre de démonstration : projet de formation ». Rien d'autre.

### Accueil (`/`, aujourd'hui une page de démarrage du module 2)

- **Bandeau d'accroche** en deux colonnes (texte à gauche, photo à droite ; empilé sur mobile) : titre `affiche` « Un espace à la hauteur de vos idées », sous-titre, un seul bouton cuivre « Découvrir nos salles » vers `/salles`.
- **Bande d'atouts** à icônes, limitée aux atouts vrais : réservation simple et rapide, salles équipées, paiement en ligne sécurisé, cadre professionnel.
- **Section « Nos salles de réunion »** : 4 cartes à photo, nom, extrait de description, capacité et prix, lues en base (même requête que `/salles`).
- **« Réservez en 3 étapes »** : pastilles numérotées cuivre reliées par un trait. Étapes conformes au vrai parcours : 1. Choisissez la salle, 2. Indiquez la date et le créneau, 3. Payez en ligne sous 15 minutes, et la salle est à vous.
- **Bandeau horaires** marine en bas de page : icône calendrier, « Du lundi au vendredi, de 8 h à 20 h ».

### Liste des salles (`/salles`)

- **Carte de salle** de la maquette 03 : photo 3:2 en haut, nom en `titre-3`, « Jusqu'à N personnes » avec icône, équipements en badges `cuivre-clair`, prix en cuivre « 25,00 € / heure ». La carte entière reste cliquable (lien étiré actuel conservé).
- Grille 4 colonnes sur grand écran, 2 sur tablette, 1 sur mobile.
- Sur mobile, la carte à photo pleine largeur avec nom en surimpression et flèche (maquette 04), **complétée** du prix et de la capacité sous la photo.

### Fiche salle (`/salles/[id]`)

- Mise en page de la maquette 03 : fil d'Ariane (Accueil > Nos salles > Horizon), grande photo à gauche, colonne d'infos à droite (nom `titre-1`, capacité, prix cuivre en grand, description, « Équipements inclus » en badges avec icône), un seul bouton cuivre « Réserver cette salle ».
- Sur mobile (maquette 04) : lien retour « ← Nos salles », trait cuivre sous le titre, pastilles prix et capacité, liste d'équipements cochés, bouton pleine largeur.

### Formulaire (`/salles/[id]/reserver`)

- Titre « Réserver Horizon » avec trait cuivre, formulaire dans une carte blanche.
- Champs de la maquette : libellé au-dessus, icône dans le champ (calendrier, horloge, personne, enveloppe), date seule puis début et fin côte à côte (empilés sur mobile).
- **Heures en liste déroulante** de 30 en 30 minutes (8 h à 19 h pour le début, 9 h à 20 h pour la fin), affichées « 9 h », « 9 h 30 » : c'est la forme des maquettes, et elle évite la plupart des erreurs R1 et R2. La validation serveur (`validerReservation`) reste la seule autorité.
- **Champ en erreur** : bordure `erreur`, icône d'alerte, phrase sous le champ (maquettes 03 et 05), relié par `aria-describedby` comme aujourd'hui.
- **Bouton en cours** : « Envoi en cours… » avec indicateur tournant, bouton désactivé (déjà présent, à habiller).

### Statut de réservation (`/reservations/[id]`)

- **Icône d'état ronde** au-dessus du titre (sablier ou carte en attente, coche verte confirmée, croix rouge annulée), titre `titre-1` centré, badge de statut pilule avec mot écrit.
- **En attente** : encadré `attente` « À payer avant 14 h 32 » (heure limite réelle, `createdAt` + 15 min), carte « Détail de la réservation » à icônes, montant en cuivre avec son calcul « 40,00 € / heure × 2 h » (R5, lu en base), bouton cuivre de paiement pleine largeur.
- **Confirmée** : badge « Paiement reçu », carte récapitulative avec photo de la salle, bouton « Voir toutes les salles ».
- **Annulée** : badge `erreur`, explication, bouton « Choisir un autre créneau » vers `/salles/[id]/reserver` de la même salle (lien utile, absent aujourd'hui).

### Aide (`/aide`)

- Titre « Règles de réservation » avec trait cuivre, chaque règle dans une rangée bordée avec icône à gauche (style des maquettes 03 et 04). Contenu inchangé : les 6 règles R1 à R6.

### 404 salle (`salles/not-found.tsx`)

- Mise en page de la maquette 05 : grand « 404 » en Playfair Display pâle, titre « Salle introuvable », texte, bouton « Voir toutes les salles » avec flèche.

### Administration des tickets (`/admin/tickets`)

- Carte par ticket en deux zones (maquette 05) : à gauche badges (statut « À traiter » / « Validé », urgence avec icône, catégorie) et date de réception ; à droite résumé en titre, message du client repliable, brouillon dans un encadré.
- Couleurs des badges ramenées à la palette : urgence haute `erreur`, normale `attente`, basse neutre ; « Conseiller requis » en `marine-clair` (le violet actuel sort de la charte).

### Composants communs (planche « Système de design »)

À créer une fois dans `src/components/` puis réutiliser : `Bouton` (principal marine, action cuivre, secondaire contour marine, désactivé, en cours), `Champ`, `Badge` de statut (couleur + icône + mot), `Encadre` (information `marine-clair`, alerte `attente`, erreur `erreur`), `CarteSalle`, `EnTete`, `PiedDePage`, `Logo`.

## 2. Écarts à ne pas reprendre

### Contenu inventé ou faux

| Écart dans la maquette | Où | Raison | À la place |
|---|---|---|---|
| Adresse « 12, rue de la République 75003 Paris », téléphone « 01 42 78 56 90 », « contact@reunea.fr » | 01 (pied de page) | Coordonnées inventées : Réunéa n'a ni adresse, ni téléphone, ni e-mail (LISEZMOI, charte). | Mention « Centre de démonstration : projet de formation ». |
| Icônes LinkedIn, Instagram, YouTube | 02 (pied de page) | Comptes inexistants. | Rien. |
| « Emplacement central et accessible » | 01 (atouts) | Aucune adresse : promesse invérifiable. | « Paiement en ligne sécurisé » (Stripe, réel). |
| « Salles équipées et connectées », Wi-Fi | 02, 03, 04 | Aucun Wi-Fi en base. | « Salles équipées ». |
| Équipements Wi-Fi, Wi-Fi haut débit, Sonorisation, Système audio, Modulable, Écran HD / 4K, Visioconférence (caméra + micro), Climatisation | 03, 04 | Absents de la base, ou libellés différents. | Les noms exacts de la table `Equipement` (Écran, Visio, Tableau blanc, Vidéoprojecteur, Micro, Paperboard, Machine à café). |
| Descriptions des salles (« Idéale pour vos ateliers… », « Notre salle prestigieuse… ») | 01, 03 | Textes de maquette, différents de la base. | `Salle.description`. |
| Prix sans centimes « 25 € / heure », montant « 80 € » | 01 à 04 | La charte écrit « 75,00 € / heure » ; la liste actuelle affiche aussi sans centimes, la fiche avec. | Toujours deux décimales, un seul formateur partagé. |
| Ordre Atelier, Horizon, Agora, Conseil | 01, 02 | Le code trie par capacité (Conseil 12 avant Agora 20). | Ordre de la requête (capacité croissante). |
| « Salle Rivoli », « 10 personnes, Équipement complet » | 05 (tickets, carte exemple) | Salle inexistante. | Les 4 salles de la base. |
| « Cabinet Lemaire & Associés », « Agence Monceau » | 05 (tickets) | Un ticket n'a qu'un e-mail, pas de nom de client. | `ticket.email`. |
| Numéros « #T-2847 », « #T-2831 » | 05 (tickets) | Les identifiants sont des cuid, pas des numéros. | Pas de numéro affiché (ou date de réception). |
| « Urgence : Élevée » | 05 (tickets) | Les valeurs sont haute, normale, basse. | « Urgence haute ». |
| Dates « 15 mars 2025 », « 14 mars 2025 », « Mardi 18 mars 2025 », « 12 mars 2025 » | 03, 04, 05 | Dates passées : un tel créneau est refusé (R4). | Dates réelles ; le champ date garde `min` = aujourd'hui. |
| Tagline « Salles de réunion · Bureaux privatifs · Espaces événementiels », « autres espaces de travail, réunion et événement » | 05 (en-tête de planche, 404) | Le centre ne loue que des salles de réunion. | « Découvrez nos autres salles de réunion. » |
| Photo d'accroche avec « RÉUNÉA » sur l'écran mural ; photos des cartes mobiles (Agora en rangées face à un écran) | 01, 02 | Images générées dans la maquette, non extraites ni contrôlées ; l'Agora y est différente de la vraie. | Les 4 fichiers de `design/photos/` (contrôlés, voir plus haut), par exemple `salle-du-conseil.jpg` pour l'accroche. |

### Promesses que l'application ne tient pas

| Écart | Où | Raison | À la place |
|---|---|---|---|
| « Un e-mail de confirmation avec tous les détails vient de vous être envoyé » | 05 (confirmée) | Aucun e-mail n'est envoyé (charte : « pas d'e-mail de confirmation »). | « Votre paiement a bien été reçu : la salle vous est réservée. » (texte actuel). |
| « Confirmez votre réservation : et recevez votre confirmation en un instant » | 02 (étapes) | La réservation est confirmée par le paiement, pas par un clic, et rien n'est « reçu ». | Étape 3 « Payez en ligne sous 15 minutes ». |
| « Aucun montant ne vous a été débité » | 05 (annulée) | Faux quand un paiement arrivé trop tard ou sur un créneau pris est encaissé puis remboursé. | Texte actuel : « Si un paiement a été prélevé, il vous est remboursé. » |
| « Nous comprenons que vos plans puissent évoluer » | 05 (annulée) | Le client ne peut pas annuler ; l'annulation vient de R6 ou de R3. | Cause réelle (délai dépassé ou créneau pris). |
| Encadré « Besoin d'aide ? Notre équipe reste à votre disposition » | 05 (annulée) | Aucun moyen de contacter une équipe. | Lien vers `/aide`. |
| « Le créneau sélectionné est bientôt complet » | 05 (alertes) | Notion inexistante : une salle n'a qu'une réservation par créneau (R3). | Exemples d'alertes réels (créneau déjà réservé, paiement non vérifié). |
| Compte à rebours « 15 minutes pour finaliser le paiement » | 03 (en attente) | Le délai court depuis la création, pas depuis l'affichage : après un rechargement il reste moins de 15 min. | Heure limite exacte « À payer avant 14 h 32 ». |
| « Participants : 4 personnes » | 05 (confirmée) | Le nombre de participants n'est pas saisi ; 4 est la capacité. | « Jusqu'à 4 personnes » ou rien. |
| « Montant : 25,00 € / heure » | 05 (confirmée) | C'est le prix horaire, pas le montant payé. | `montantTotalCentimes`, avec son calcul. |
| Coche verte « champ valide » sur le nom | 03 (formulaire) | La validation est faite par le serveur à l'envoi ; une coche avant envoi affirmerait une validité non vérifiée. | Pas d'état « valide », seulement les erreurs renvoyées. |

### Menus et pages qui n'existent pas

| Écart | Où | Raison |
|---|---|---|
| « Réservations », « Mon compte », icône de compte | 03, 05 | Pas de connexion ni de liste de réservations. |
| « Services », « Tarifs », « À propos », « Qui sommes-nous ? », « Nos engagements », « Contact » | 01, 02, 05 | Aucune page derrière (charte : aucun menu sans page). |
| « Clients », « Administration », cloche de notifications | 05 (admin) | Seule la page Tickets existe, sans notifications. |
| Filtres « Tous les statuts », « Toutes les urgences » | 05 (tickets) | Non codés ; une commande inerte trompe. Le tri actuel (`ordonnerTickets`) suffit. |
| Brouillon modifiable dans une zone de saisie | 05 (tickets) | Le brouillon se valide tel quel, il n'est pas éditable. |
| Galerie de 4 vignettes | 03 (fiche) | Une seule photo par salle. |
| Accordéons « Modification et annulation », « Capacité et usage », « Équipements et assistance », « Accessibilité et accueil », « Bonnes pratiques » | 03, 04 (aide) | Thèmes sans contenu réel (ni modification ni annulation par le client). L'aide garde les 6 règles R1 à R6. |

### Entorses à la charte

| Écart | Où | Raison | À la place |
|---|---|---|---|
| Trois boutons cuivre à l'accueil (en-tête « Réserver une salle », « Découvrir nos salles », bandeau « Réserver une salle ») | 01 | « Jamais plus d'un bouton cuivre par écran ». De plus, on ne réserve pas sans choisir une salle : ces boutons mèneraient tous à `/salles`. | Un seul cuivre (« Découvrir nos salles ») ; pas de bouton dans l'en-tête ; bandeau horaires sans bouton, ou bouton secondaire. |
| Un bouton cuivre « Réserver » par carte (4 sur la liste) | 03 | Même règle. | Carte cliquable, bouton secondaire (contour marine) ou simple flèche ; le prix reste en cuivre. |
| « Bouton principal » en cuivre | 05 (planche) | La charte réserve le principal au marine, le cuivre à l'action d'achat. | Principal marine, action cuivre. |
| « Valider le brouillon » en cuivre | 05 (tickets) | Pas d'achat : bouton principal marine. | Marine. |
| Police « Inter (ou équivalent) » | 05 (planche) | La charte impose Manrope. | Manrope. |
| Plages horaires écrites avec un tiret entre les deux heures (8 h et 20 h dans le bandeau ; 09:00 et 11:00, 14 h 00 et 17 h 00 dans les récapitulatifs) | 01 à 05 | Plages « de 8 h à 20 h », heures « 9 h », « 14 h 30 », sans tiret. L'application affiche aujourd'hui « 09:00 » : à corriger aussi. | Un formateur d'heure « 9 h » / « 9 h 30 » partagé. |
| « Payer maintenant » | 03, 04 | La charte veut le montant dans le bouton. | « Payer 80,00 € ». |
| Carrousel de salles à points sur mobile | 02 | Cache 3 salles sur 4 et demande du JavaScript pour peu de gain ; la maquette 04 empile déjà les cartes. | Cartes empilées. |
| Cartes mobiles sans prix ni capacité (nom seul sur la photo) | 04 (liste) | Charte « rassurante » : le prix est toujours visible. | Prix et capacité sous la photo. |
| Formulaire sans rappel des règles ni du prix | 03, 04 | Même raison ; le formulaire actuel les affiche. | Garder prix horaire et rappel « lundi au vendredi, de 8 h à 20 h, au moins 1 h par tranches de 30 min ». |
| Icône d'écran devant le prix | 01 (cartes) | Icône sans rapport. | Icône d'étiquette de prix (comme en 04) ou aucune. |
| Badges de statut à fond pâle et texte coloré (« En attente » orange sur crème) | 05 | Contraste à vérifier : la charte ne garantit 4,5:1 que pour texte blanc sur couleur d'état, ou couleur d'état sur blanc. | Vérifier chaque couple ; sinon texte blanc sur `succes`, `attente`, `erreur`. |
| Bouton « Envoi en cours » gris bleu pâle | 04 | Contraste texte faible. | Bouton désactivé lisible (≥ 4,5:1). |

## 3. Points d'attention pour la mise en œuvre

- **Photos** : `Salle.photo` est vide pour les 4 salles et le dossier `public/` n'existe pas. Il faudra copier `design/photos/*.jpg` dans `public/salles/` (en les réduisant, 1920 × 1080 c'est lourd pour une carte) et renseigner `photo` dans `prisma/seed.ts`. Afficher avec `next/image`, cadrage 3:2 (`object-cover`), texte alternatif décrivant la salle. Prévoir un rendu sans photo (champ facultatif).
- **Logo sur fond marine** : le logo horizontal fourni est en marine, donc invisible sur l'en-tête marine. La variante claire n'existe que sur la planche (pas de fichier). Recréer le logo en SVG (monogramme + texte Playfair) en deux couleurs, ou produire une variante blanche.
- **Thème sombre** : la charte ne définit qu'un thème clair ; retirer le bloc `prefers-color-scheme: dark` de `globals.css`.
- **Accessibilité** : anneau de focus cuivre 3 px sur tous les éléments interactifs, zones cliquables d'au moins 44 px (bouton menu mobile compris), statuts toujours écrits en toutes lettres.
- **Ne pas toucher** : la logique métier (`src/lib/`), les Server Actions, le schéma Cache Components (`<Suspense>` + `connection()`), le proxy des 404, les versions figées de `package.json` (les polices passent par `next/font`, sans nouvelle dépendance ; les icônes peuvent être des SVG en ligne pour éviter d'ajouter Lucide).
- **Tests e2e** : les tests Playwright de `e2e/` s'appuient sur des libellés et des rôles : lien de navigation « Salles », bouton « Envoyer la demande », titre « Demande de réservation enregistrée », lien « Réserver Horizon », libellés des champs. Renommer « Salles » en « Nos salles », passer les heures en liste déroulante (`selectOption` au lieu de `fill`) ou changer un titre impose de mettre à jour ces tests dans le même changement.
