# Italiano Lab V2B — Mon niveau et leçons de progression

**Mon niveau** présente les notions travaillées dans les séances et en entraînement libre. Chaque notion indique le constat, sa raison, la date de la preuve la plus récente et un accès au retour ou à la tentative. Le travail avec aide et les auto-évaluations apparaissent à part. Le carnet d’erreurs et l’historique des corrections restent accessibles depuis le bilan.

## Règles de preuve

| Statut | Condition |
| --- | --- |
| Pas encore évalué | L’activité enregistrée ne fournit aucune preuve indépendante exploitable. |
| En cours d’évaluation | Les preuves sont isolées, discordantes ou anciennes. |
| À consolider | La notion remplit la règle V1 d’erreur récurrente, ou une erreur ciblée récente est apparue après une paire de réussites admissible. |
| Réussi sans aide récemment | Deux réussites sur des énoncés et items distincts dans les 30 derniers jours civils à Rome, dont une production corrigée avec une observation `strength` explicite. Aucune erreur ciblée ne suit la plus ancienne des deux. |

La fenêtre comprend aujourd’hui et les 29 jours précédents. La date est celle de la production. Une observation `error` prévaut sur une observation positive pour la même notion dans la même réponse, même avec un verdict global correct. Une nouvelle paire de réussites postérieure aux anciens écarts rétablit le constat positif.

Pour les résultats automatiques, le bilan retient les trous et les exercices de remise en ordre associés à une seule notion dans la version présentée. Les QCM, cartes mémoire, items à plusieurs notions, réponses en attente, essais aidés, reformulations et verdicts neutralisés restent en dehors des preuves indépendantes. L’app compare les énoncés normalisés et les identifiants stables. Le professeur vérifie les paraphrases ou changements superficiels lors du choix d’une leçon.

## Contrats

| Point d’entrée | Contrat |
| --- | --- |
| `GET /api/notion-progress` | `notionId` et `offset` facultatifs. Renvoie la date à Rome, les notions travaillées avec leurs statuts, activités et preuves publiques, puis `nextOffset`. La projection est en lecture seule. |
| `GET /api/attempt-detail?id=…` | Renvoie l’énoncé public, la réponse de l’élève et son état. Les corrections écrites passent par le détail existant de la correction. |
| `list_notion_progress` | MCP paginé par `notionId`, `limit` et `offset`. Les preuves comprennent l’identifiant de tentative, la version de l’item, le contexte et, si applicable, l’observation interne du professeur. Un statut `recent_success` fournit aussi une paire `prerequisiteEvidenceIds`. |
| `create_proactive_lesson` | Le motif `remediation` est utilisé si `kind` est omis. Pour `kind: "next_step"`, fournir `notionId` pour la cible, `prerequisiteNotionId` pour le prérequis distinct, les identifiants de preuve et une raison qui explique le lien pédagogique. |
| `publish_proactive_lesson` | Le serveur revérifie les preuves du prérequis, les exercices du J0 et la disponibilité de la place. Les preuves sont aussi revérifiées au démarrage. Une leçon déjà commencée reste accessible après rectification. |

Le professeur choisit la notion suivante. Le démarrage explicite, le J0 et les cinq jalons utilisent le parcours V1. Les [consignes versionnées du professeur](../automation/correct-prof.md) décrivent le choix et la relecture de la proposition.

## Migration et mise en service

V13 ajoute `item_version_notions` et `proactive_lesson_prerequisites`. La migration fige les étiquettes des versions courantes déjà connues. Pour une ancienne version dont les étiquettes exactes n’étaient pas conservées, le bilan dispose des observations explicites enregistrées. Le serveur fige ensuite les étiquettes à chaque création ou révision d’item.

Sur une base V12, SQLite crée une sauvegarde privée `.before-notion-progress-…sqlite` avant migration. Après validation, démarrer le build sous Node 24 et vérifier les schémas du MCP avec `tools/list` avant d’installer les consignes. Les tests utilisent des bases et un dossier de build isolés. Une restauration complète associe le code précédent à sa sauvegarde SQLite, en conservant une copie séparée de la base V13.

## Vérifications

| Commande | Résultat |
| --- | --- |
| `npm test` | 61 tests réussis. Le bilan, la fenêtre de Rome, l’éligibilité des leçons et la migration V12 → V13 sont couverts. |
| `npm run test:mcp` | Le bilan paginé et les nouveaux champs facultatifs sont vérifiés via stdio. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Build isolé et contrôle TypeScript réussis. |
| `ITALIANO_TEST_PORT=3227 npm run test:browser:isolated` | 19 tests réussis, dont le parcours des deux modes jusqu’au bilan, à la publication MCP et au J0 d’une leçon de progression. |
