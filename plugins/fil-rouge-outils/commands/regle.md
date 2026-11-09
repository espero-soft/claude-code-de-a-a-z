---
description: Vérifie si une règle métier du cahier des charges (R1 à R6) est bien couverte par le code et les tests
argument-hint: <numéro de règle, ex. R3>
allowed-tools: Read, Grep, Glob, Bash(npx vitest run:*)
---

Règle demandée : **$ARGUMENTS**

Si l'argument est vide ou ne correspond à aucune règle du tableau « Règles métier » de `CLAUDE.md`, dis-le en une ligne, liste les règles existantes (R1, R2...) et arrête-toi. Accepte `3`, `r3` ou `R3` comme la même règle.

Sinon, dans cet ordre :

1. **Relis la règle** dans le tableau « Règles métier » de `CLAUDE.md` : son texte exact et ce que la colonne « Codée ? » affirme (fonctions, fichiers). Ne te fie pas à cette colonne : elle est à vérifier.
2. **Trouve le code** qui l'applique : cherche dans `src/` le numéro de la règle (les commentaires y renvoient, ex. « R3 ») et les fonctions citées dans le tableau. Vérifie qu'elles existent toujours et qu'elles sont réellement appelées dans le flux (Server Action `actions.ts`, `src/lib/`), pas seulement définies.
3. **Trouve les tests** qui la couvrent dans les `*.test.ts` : par le numéro de règle, par le nom des fonctions, par le contenu des cas. Lance seulement ces fichiers avec `npx vitest run <fichiers>` pour savoir s'ils passent.
4. **Compare** le texte de la règle aux cas testés : chaque partie de la règle (ex. pour R1 : le minimum d'une heure ET les tranches de 30 minutes) a-t-elle au moins un test, y compris les cas limites ?

Ne corrige rien et ne modifie aucun fichier : tu constates seulement.

Réponds ensuite en **quelques lignes** (cinq au plus), en français, sans titre :

- `Règle :` le numéro et le texte exact.
- `Code :` les fonctions qui l'appliquent, avec `chemin:ligne`, et où elles sont appelées ; ou « aucun ».
- `Tests :` les fichiers et le nombre de cas qui la visent, et s'ils passent.
- `Trous :` les parties de la règle sans test ou sans code, ou un écart avec ce qu'affirme `CLAUDE.md` ; « aucun » sinon.
- `Verdict :` « bien couverte », « en partie couverte » ou « non couverte », en une phrase.

N'utilise ni tiret cadratin ni demi-cadratin dans la réponse.
