# Italiano Lab V3A — Mini-bilans écrits

Dans **Mon niveau → Bilans**, une proposition affiche son objectif, sa durée estimée, sa raison et les critères publics. L’élève choisit de commencer ou de refuser. Le brouillon des réponses est conservé au fur et à mesure. Le rendu exige une réponse complète par tâche ou « Je ne sais pas ». Le retour du prof paraît en une fois avec les résultats par tâche, les observations par critère et une prochaine action.

## Contrats MCP

Le lanceur stdio est `/bin/sh scripts/mcp.sh` sous Node 24. Les schémas complets sont disponibles via `tools/list`.

| Outil | Entrée et résultat |
| --- | --- |
| `save_assessment_draft` | `requestId`, titre `title`, `objective`, `reason`, `estimatedMinutes`, un ou deux `notionIds` connus, `criteria` et `tasks` ordonnés. Un `assessmentId` remplace un brouillon existant. Retourne `assessmentId` et `revision`. |
| `list_assessments` | Filtres facultatifs `status`, `limit` et `offset`. Retourne `assessments` et `nextOffset`. Utiliser `status: "submitted"` pour la file de correction. |
| `get_assessment` | `assessmentId`. Retourne les métadonnées, la révision, les définitions et la grille. Après rendu, les tâches contiennent les réponses exactes et des suggestions de correction pour les tâches fermées. Après abandon, les réponses enregistrées restent lisibles par le prof. |
| `propose_assessment` | `assessmentId`, `requestId` et `revision` relue. Fige le contenu et occupe la place de proposition ou de travail en cours. |
| `publish_assessment_result` | `assessmentId`, `requestId` et `report`. Publie une seule fois le retour complet sur un bilan rendu. |

Chaque critère de brouillon contient `label` public et `rubric` privé. Le bilan comprend de deux à huit tâches. Chaque tâche fournit `type`, `instruction`, `content`, éventuellement `support` visible et `explanation` privée.

| Tâche | Définition privée |
| --- | --- |
| `cloze` | `answer: { accepted: [...] }` |
| `questionnaire` | `choices: [{ value, label }, …]` et `answer: { value }`. Les identifiants professeur restent privés. |
| `sentence` | `sentence: { format: "word_order", tokens, orders }`. Les ordres valides utilisent les positions de mots à partir de zéro. |
| `free_text` | `answer: { criteria, example? }`. Une seule production par bilan, en dernière position. |

À la publication, le serveur compare les énoncés normalisés, y compris les versions historiques de la banque, et les mots de tâches de remise en ordre. Les bilans dont les tâches ont été ouvertes entrent aussi dans la comparaison. La relecture du professeur vérifie que la situation sollicite réellement une réutilisation.

Le `report` contient `strengths`, `fragile`, `nextAction: { description, lessonId? }`, un retour par `taskId` avec `verdict`, `explanation` et éventuellement `correction`, puis un résultat par critère avec `position`, `status`, `explanation`, `taskIds` et éventuellement `reason`. Les statuts de critère sont `observed_without_help`, `needs_work` et `not_observed`. Ce dernier exige `no_answer` ou `not_tested`. Une action avec `lessonId` doit pointer vers une leçon élève disponible. Le résultat publié est immuable dans cette version.

## Contrats élèves

| Point d’entrée | Contrat |
| --- | --- |
| `GET /api/assessments` | Résumés des bilans accessibles et de l’historique, en lecture seule. |
| `GET /api/assessment?id=…` | Aperçu public, tâches et brouillons pendant le travail, statut du rendu en attente, ou résultat complet après publication. Un brouillon prof est introuvable côté élève. Les réponses sont conservées pour les bilans abandonnés. |
| `POST /api/assessment-action` | JSON de même origine locale. Fournir `assessmentId`, `requestId` et `action`. Pour `save`, ajouter `revision`, `taskId`, et `response`. Pour `submit` et `close`, ajouter `revision`. Le serveur renvoie l’état et la révision confirmés. |

Une `response` vaut `{ kind: "answer", value }`, `{ kind: "unknown" }` ou `null` pour effacer le brouillon de cette tâche. Les valeurs sont du texte, la position du choix QCM sous forme de chaîne à partir de `"0"`, ou les positions des mots. Une remise en ordre partielle peut être sauvegardée. Les clés de mutation de toutes les surfaces sont stables. Rejouer la même requête reproduit son reçu. Une clé déjà utilisée pour un autre contenu est rejetée. Une révision élève périmée déclenche une actualisation avant toute nouvelle mutation.

Après `draft → offered → in_progress → submitted → reviewed`, l’élève retrouve le détail à `/mon-niveau/bilans/[id]`. Les sorties alternatives sont `dismissed` depuis `offered` et `abandoned` depuis `in_progress`. SQLite sérialise les mutations. Le rendu vérifie l’ensemble des réponses, change l’état et fige la remise dans une seule transaction. En attente, l’élève peut vérifier si le retour est prêt. Le prof reprend le rendu dans sa file jusqu’à la publication.

## Migration et activation

V14 ajoute cinq tables liées pour les bilans, leurs notions, leurs tâches, leurs réponses et leurs résultats. L’ouverture d’une base V13 crée une sauvegarde privée `.before-assessments-…sqlite` qui inclut les écritures du WAL, puis applique la migration dans une transaction. La pratique, le budget quotidien, les preuves V2, les séances et les jalons gardent leur propre suivi.

Après validation de la version, sauvegarder les données, lancer le build et le MCP sous Node 24, puis vérifier les nouveaux outils et le parcours sur une base isolée. Pour activer la correction dans Hermes, installer [la consigne de correction existante mise à jour](../automation/correct-prof.md) avec [son annexe mini-bilans](../automation/assessment-prof.md) dans le profil `prof-italien`. La routine utilise son créneau existant. Pour restaurer V13, arrêter les processus, conserver une copie cohérente de la base V14 et de ses données, puis associer le code V13 à la sauvegarde antérieure à V14.

## Vérifications

| Commande | Résultat |
| --- | --- |
| `npm test` | 67 tests réussis, dont la migration V13 vers V14 et l’isolation des preuves V2. |
| `npm run test:mcp` | Suite d’intégration stdio réussie. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Build de production isolé sous Node 24 et vérification TypeScript réussis. |
| `ITALIANO_TEST_PORT=3227 npm run test:browser:isolated` | 20 tests réussis. Le parcours V3A relie le vrai MCP, Next.js et SQLite, vérifie la reprise et le conflit entre deux onglets, puis contrôle les réponses réseau avant et après le retour. |
