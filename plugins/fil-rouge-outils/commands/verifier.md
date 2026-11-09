---
description: Lance le lint puis les tests, et résume le résultat en trois lignes
allowed-tools: Bash(npm run lint), Bash(npm test)
---

Vérifie l'état du projet, dans cet ordre :

1. Lance `npm run lint`.
2. Lance `npm test`, même si le lint a échoué (on veut l'état complet).

Ne corrige rien et ne modifie aucun fichier : tu constates seulement.

Réponds ensuite en **exactement trois lignes**, en français, sans titre ni texte autour :

- Ligne 1, `Lint :` OK, ou le nombre d'erreurs et d'avertissements, avec le premier fichier concerné (`chemin:ligne`).
- Ligne 2, `Tests :` nombre de tests qui passent sur le total ; en cas d'échec, le nom du premier test en échec et son fichier.
- Ligne 3, `Verdict :` « tout passe » ou ce qui casse, en une phrase, avec la piste la plus probable.

N'utilise ni tiret cadratin ni demi-cadratin dans la réponse.
