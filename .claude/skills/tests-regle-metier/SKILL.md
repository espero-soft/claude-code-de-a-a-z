---
name: tests-regle-metier
description: Écrit ou complète les tests Vitest d'une règle métier du cahier des charges (R1 à R6) en suivant les conventions du projet. À utiliser quand on demande d'ajouter, d'écrire, de compléter ou de corriger des tests pour une règle (« teste R3 », « ajoute un cas limite à R1 », « il manque des tests sur R6 »), ou après avoir codé une règle dans src/lib/. Ne pas utiliser pour seulement vérifier la couverture d'une règle (commande /regle) ni pour lancer les tests (commande /verifier).
argument-hint: <numéro de règle, ex. R3>
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npx vitest run:*), Bash(npm test), Bash(npm run lint)
---

# Tests d'une règle métier

Règle demandée : **$ARGUMENTS** (accepter `3`, `r3` ou `R3`). Si elle est absente ou ne figure pas dans le tableau « Règles métier » de `CLAUDE.md`, le dire, lister les règles existantes et s'arrêter.

## Démarche

1. **Relire la règle** : texte exact dans le tableau « Règles métier » de `CLAUDE.md`. Découper ce texte en parties testables (ex. R1 : minimum d'une heure ET tranches de 30 minutes ; R2 : jours ouvrés ET plage 8 h à 20 h).
2. **Trouver le code** : chercher le numéro de règle dans `src/` (les commentaires y renvoient) et les fonctions citées dans le tableau. Ne pas se fier à la colonne « Codée ? » : vérifier dans le code.
   - Si la règle n'a pas encore de fonction pure, ne pas l'inventer en silence : proposer sa signature (pure, `maintenant` injecté si elle dépend de l'heure) et demander avant de l'écrire.
3. **Lire les tests existants** de cette fonction pour ne pas dupliquer de cas et reprendre leurs aides (`saisie`, `erreurs`, `reservation`, `h`...).
4. **Lister les cas** avant d'écrire, pour chaque partie de la règle :
   - un cas nominal accepté ;
   - un cas refusé ;
   - **les bornes, des deux côtés** : la valeur limite exacte et la valeur juste au-delà (ex. R6 : 14 min 59 s, 15 min pile, 15 min 1 s ; R2 : 8 h à 9 h accepté, 7 h 30 refusé) ;
   - les cas que la règle exclut implicitement (autre salle, autre statut, créneaux contigus pour R3).
   Lire les mots du texte au pied de la lettre (« plus de » est strict, « au minimum » est inclusif) et l'écrire en commentaire au-dessus du test de borne.
5. **Écrire les tests** selon les conventions ci-dessous.
6. **Lancer seulement les fichiers touchés** : `npx vitest run src/lib/<fichier>.test.ts`, puis `npm run lint`. Si un test échoue, déterminer si c'est le test ou le code qui a tort au regard du texte de la règle ; ne jamais affaiblir un test pour le faire passer. Si c'est le code, le signaler plutôt que le corriger sans accord.
7. Si la colonne « Codée ? » de `CLAUDE.md` devient fausse, le signaler (ne pas la modifier sans accord).

## Conventions (tirées des tests existants)

**Emplacement et imports**
- Fichier `src/lib/<module>.test.ts` à côté du module testé, sans base ni Next.
- `import { describe, expect, it } from "vitest";` (`vi` seulement pour un faux client Prisma) ; importer le module par chemin relatif `./<module>`, les types avec `type`.

**Nommage, tout en français**
- `describe("<fonction> (R<n>)", ...)`, ou, dans un fichier qui couvre plusieurs règles, un `describe` imbriqué au texte court de la règle : `describe("R1 : au moins 1 heure, par tranches de 30 minutes", ...)`.
- `it("<verbe au présent> ...")` décrivant le comportement : « refuse le samedi et le dimanche », « accepte les bornes : 8 h à 9 h et 19 h à 20 h », « n'expire pas une réservation déjà annulée », « ignore une réservation annulée ».
- Heures écrites à la française dans les noms et commentaires : `8 h`, `9 h 30`.

**Dates déterministes**
- Jamais `new Date()` sans argument ni l'heure réelle : `maintenant` est toujours injecté.
- Dates de référence en novembre 2026 : « maintenant » = lundi 9 novembre 2026, 10 h à Paris (`new Date("2026-11-09T09:00:00Z")`), demande type le mardi 10 novembre 2026.
- Instants en **UTC explicite** (`Z`) quand seule une durée ou une comparaison compte ; en `+01:00` (heure d'hiver de Paris) quand l'heure affichée compte. Jamais de date sans fuseau : le résultat dépendrait de la machine.
- Toute saisie utilisateur (date + heure) passe par `heureDeParis` côté code ; les tests attendent donc l'instant UTC correspondant (9 h à Paris en novembre = `08:00Z`).
- Commenter chaque constante de date avec son jour et son heure lisibles : `// Mardi 10 novembre 2026, de 9 h à 11 h : une demande valide.`

**Fabriques de données**
- Une fabrique qui renvoie un cas valide par défaut et accepte des changements partiels, pour que chaque test ne montre que ce qui diffère :
  ```ts
  function saisie(changements: Partial<SaisieReservation> = {}): SaisieReservation {
    return { date: "2026-11-10", heureDebut: "09:00", heureFin: "11:00", /* ... */ ...changements };
  }
  ```
- Petites aides lisibles : `const h = (heure: string) => new Date(\`2026-11-10T${heure}:00Z\`);`, `creneau("09:00", "11:00")`, `apres(15, 1)`.
- Pour un résultat `{ ok: false, erreurs }`, une aide `erreurs(changements)` qui lève une erreur si la demande a été acceptée, puis vérifier le message **exact** du champ concerné (`toBe("Le centre ferme à 20 h.")`) ; `toMatch(/.../)` seulement si le message varie.

**Montants et base**
- Montants en centimes entiers (`const PRIX = 4000; // 40 € de l'heure`), jamais de décimales.
- Requête Prisma : faux client avec `vi.fn().mockResolvedValue(...)`, typé via `Parameters<typeof fonction>[0]`, et vérifier **le `where` envoyé** (pas seulement le résultat, qu'une fonction pure peut refiltrer). Voir `src/lib/conflit-confirme.test.ts`.

**Style**
- Un comportement par `it` ; plusieurs `expect` seulement pour les variantes du même cas (les deux sens d'un chevauchement, samedi et dimanche).
- Comparer les objets par `toEqual`, l'identité d'une réservation renvoyée par `toBe`, les absences par `toBeNull()`.
- Commentaire en tête de fichier ou de `describe` rappelant la règle en une ligne, et commentaire sur chaque borne non évidente.

## Fichiers modèles

- `src/lib/reservation.test.ts` : R1, R2, R4 (fabrique `saisie`, aide `erreurs`, messages exacts, `MAINTENANT`).
- `src/lib/chevauchement.test.ts` et `src/lib/conflit-confirme.test.ts` : R3 (fonction pure puis requête avec faux client).
- `src/lib/montant.test.ts` : R5.
- `src/lib/expiration.test.ts` : R6 (bornes à la seconde, statuts exclus).

## Compte rendu

En quelques lignes : fichier(s) modifié(s), cas ajoutés regroupés par partie de la règle, résultat de `npx vitest run` et du lint, et tout écart constaté entre le texte de la règle, le code et `CLAUDE.md`.
