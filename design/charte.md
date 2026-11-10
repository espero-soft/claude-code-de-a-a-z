# Réunéa : charte graphique

Réunéa (nom provisoire, retenu le 10 nov.) est le centre d'affaires fictif du projet fil rouge de la formation « Claude Code de A à Z ». On y réserve une salle de réunion à l'heure, on paie en ligne, et on se réunit. Quatre salles : L'Atelier (4 personnes), Horizon (8), Salle du Conseil (12), Agora (20). Ouvert du lundi au vendredi, de 8 h à 20 h.

Cette charte sert de base aux maquettes du formateur, puis au travail de Claude Code sur l'application (module 11 : design soigné). Le but : une application propre et vraiment utilisable, hors formation.

## Ce que l'application ne montre jamais

Les maquettes inspirent le style, pas le contenu. Les prix, capacités, salles et statuts viennent de la base. Aucune promesse que l'application ne tient pas (pas d'e-mail de confirmation), aucun menu sans page derrière, aucune coordonnée inventée.

## Personnalité

Professionnelle, chaleureuse, sans complication. Un centre d'affaires haut de gamme mais accessible : on comprend tout du premier coup d'œil.

- **Simple** : une action principale par écran (« Réserver », « Payer »).
- **Rassurante** : le prix, les horaires et les règles sont toujours visibles avant de payer.
- **Honnête** : aucun prix ou délai caché ; une erreur dit ce qui ne va pas et comment corriger.

## Ton des textes

- Vouvoiement, phrases courtes, verbes d'action : « Réserver cette salle », « Payer 150,00 € ».
- Les erreurs expliquent et proposent : « Le centre ferme à 20 h. Choisissez une heure de fin plus tôt. »
- Les heures s'écrivent « 14 h », « 14 h 30 », les plages « de 14 h à 16 h ». Les prix « 75,00 € / heure ».
- Jamais de tiret long dans un texte : deux-points, virgules ou parenthèses à la place.

## Couleurs

Palette « marine et cuivre ». Tous les couples texte et fond respectent au moins 4,5 pour 1 (WCAG AA).

| Jeton | Valeur | Usage |
|---|---|---|
| `marine` | #1B3A5C | En-tête, titres, bouton principal (texte blanc, 11,6 pour 1) |
| `cuivre` | #A8501A | Prix, bouton d'action Réserver ou Payer (texte blanc, 5,5 pour 1) |
| `fond` | #F7F5F0 | Fond de page |
| `surface` | #FFFFFF | Cartes, formulaires |
| `encre` | #1F2937 | Texte principal |
| `encre-douce` | #5B6472 | Texte secondaire |
| `succes` | #15803D | Confirmée |
| `attente` | #B45309 | En attente de paiement |
| `erreur` | #B91C1C | Annulée, erreur |

Règles :
- Le **cuivre est rare** : il désigne l'action qui fait avancer (réserver, payer) et le prix. Jamais plus d'un bouton cuivre par écran.
- Le **marine structure** : en-tête, titres, bouton principal quand il n'y a pas d'achat.
- Les couleurs d'état ne servent qu'aux statuts et aux messages ; elles sont toujours accompagnées d'un mot (« Confirmée »), jamais seules.

## Typographie

Deux familles (Google Fonts) : **Playfair Display** pour les titres (serif élégant, 600 à 700), **Manrope** pour toute l'interface (texte en 400, boutons et étiquettes en 600 à 700, étiquettes en capitales espacées).

| Style | Taille | Usage |
|---|---|---|
| `affiche` | 56 px | Titre de l'accueil (Playfair Display) |
| `titre-1` | 40 px | Titre de page (Playfair Display) |
| `titre-2` | 28 px | Titre de section (Playfair Display) |
| `titre-3` | 20 px | Nom de salle sur une carte (Playfair Display) |
| `corps` | 16 px | Texte courant |
| `petit` | 14 px | Aides de champ, dates |
| `etiquette` | 12 px | Sur-titres, badges |

Sur mobile, `affiche` passe à 36 px et `titre-1` à 30 px.

## Espaces, arrondis, ombres

- Grille de 4 px : `espace-2` dans les boutons, `espace-4` entre les champs, `espace-6` dans les cartes, `espace-10` entre les sections.
- Arrondis : `arrondi-s` pour les champs, `arrondi-m` pour les cartes, `arrondi-l` pour les grandes cartes de salle, `arrondi-pilule` pour les boutons et badges.
- Une seule ombre, `ombre-carte`, douce et teintée de marine.

## Composants à prévoir

- **Bouton** : principal (marine), action (cuivre), secondaire (contour marine), désactivé, en cours (« Envoi… »). Hauteur 48 px, pilule.
- **Champ** : libellé au-dessus, aide en `encre-douce` dessous, erreur en `erreur` avec une icône et une phrase.
- **Carte de salle** : photo en haut, nom, capacité, équipements en badges `cuivre-clair`, prix en cuivre, bouton Réserver.
- **Badge de statut** : pilule, couleur d'état, mot écrit.
- **Encadré** : information (`marine-clair`), alerte (`attente`), erreur (`erreur`).
- **En-tête** : logo à gauche, navigation à droite, menu sur mobile. **Pied de page** marine : logo, navigation, horaires, et la seule mention « Centre de démonstration : projet de formation ». Aucune adresse, aucun téléphone, aucun e-mail.

## Iconographie et images

- Icônes au trait, épaisseur 1,5 à 2 px, coins arrondis (par exemple la famille Lucide), en `marine` ou `encre-douce`.
- Photos des salles : lumineuses, réelles, cadrées à l'horizontale (3 pour 2), sans personnes au premier plan.
- Logo : monogramme R architectural et logo horizontal « Réunéa » (en cours de production). Les brouillons « Mezzanine » ne sont pas utilisés.
- Photos des salles : images générées, reprises seulement après extraction en fichiers séparés et contrôle de leur cohérence (bonne salle, bonne capacité, rien d'inventé à l'écran).

## Accessibilité

- Contraste minimal 4,5 pour 1 pour tout texte (vérifié pour chaque couple de cette charte).
- Zone cliquable de 44 px au moins ; focus visible (anneau `cuivre` de 3 px).
- Un statut n'est jamais indiqué par la couleur seule.
