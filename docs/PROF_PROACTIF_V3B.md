# Italiano Lab V3B — Comparer deux mini-bilans écrits

**Comparaisons de bilans** est accessible dans **Mon niveau** et **Bilans**. Chaque comparaison affiche une notion, les deux situations, les sources datées et le constat du prof pour chaque critère. Les deux retours corrigés restent accessibles.

## Comparabilité et attribution

Le prof vérifie que la compétence, la difficulté et les critères communs sont comparables dans deux situations réellement distinctes. Le serveur exige deux bilans corrigés dans l’ordre, les mêmes notions cibles et la même succession de formats, avec ou sans texte-support aux mêmes positions. Il rejette les contextes identiques après normalisation. Les contrôles d’énoncés inédits s’appliquent dès la publication de chaque bilan V3A.

La comparaison porte sur une seule notion commune à la fois. Le prof associe des critères des deux retours à cette notion et désigne, de chaque côté, une tâche déjà citée pour les constats observés. Les tâches associées occupent la même position. Les productions écrites sont admissibles. Un trou ou une remise en ordre est admissible dans un bilan à cible unique. Les QCM ne constituent pas des preuves par critère. Un constat « Non observé » conserve le motif publié, réponse manquante ou critère non testé.

Le constat comparé est **Observé dans les deux contextes** lorsque les deux observations confirment le critère, **À consolider** lorsque les deux observations sont disponibles et que l’une signale une difficulté et **Preuve insuffisante** lorsqu’un des deux retours ne permet pas de conclure. Les constats V3B sont consultables par notion, dans une section dédiée. Les statuts V2 et les prérequis de leçon restent calculés à partir des preuves de séance et d’entraînement. Une comparaison ne change ni le budget de pratique ni les échéances.

## Contrats

| Point d’entrée | Contrat |
| --- | --- |
| `publish_assessment_comparison` | MCP avec `requestId`, `notionId`, `firstAssessmentId`, `secondAssessmentId`, `firstContext`, `secondContext`, `rationale` publique et `criteria`. Chaque association fournit `firstPosition` et `secondPosition` à partir de zéro, avec `firstTaskId` et `secondTaskId` pour les côtés observés. Retourne `id` et `publishedAt`. |
| `list_assessment_comparisons` | MCP en lecture seule. Filtres `notionId`, `comparisonId`, `offset`, `limit` facultatifs. |
| `GET /api/assessment-comparisons` | Projection élève en lecture seule et sans cache. Paramètres facultatifs `notionId`, `comparisonId` et `offset`. Renvoie les observations et les références publiques aux bilans, avec `nextOffset`. |

Une paire peut être publiée une fois par notion. Rejouer la même demande avec la même clé reproduit son reçu. À la publication, les constats affichés sont figés à partir des retours corrigés. Les réponses, les modèles et les grilles privées restent dans les surfaces d’origine.

## Migration et activation

La migration SQLite V15 ajoute `assessment_comparisons` et conserve les bilans V3A déjà corrigés. Une base V14 est sauvegardée dans un fichier privé `.before-assessment-comparisons-…sqlite` avant migration. Pour restaurer V14, arrêter les processus, conserver une copie des données V15 et reprendre le code et la sauvegarde V14 ensemble.

Après validation du build et des deux outils via le lanceur Node 24, installer l’annexe versionnée dans le profil `prof-italien` existant. La publication d’une comparaison utilise la routine existante et peut aussi se faire à la demande. [Consigne professeur](../automation/assessment-prof.md)


## Vérifications

| Commande | Résultat |
| --- | --- |
| `npm test` | 71 tests réussis, dont la migration V14 → V15, l’attribution par tâche et l’isolation des preuves V2. |
| `npm run test:mcp` | Suite d’intégration stdio réussie. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Build de production et vérification TypeScript réussis sous Node 24. |
| `ITALIANO_TEST_PORT=3227 npm run test:browser:isolated` | 22 tests réussis. Le parcours V3B crée et corrige deux bilans, publie leur comparaison via le vrai MCP et vérifie les sources sur mobile. |
