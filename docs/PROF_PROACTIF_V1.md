# Italiano Lab — Le prof proactif V1

Une correction peut contenir des observations rattachées à une notion de la banque. Deux productions indépendantes sur des énoncés distincts peuvent faire ressortir une difficulté à traiter. Le professeur choisit la notion et conseille une leçon. Dans Aujourd’hui, l’élève peut la consulter, la commencer ou l’écarter. Le J0 est validé après une tentative sur chacun des exercices et une correction non neutralisée du champ final. Si un item est une carte mémoire, son mode traduction fournit la tentative. L’application crée alors cinq échéances à Rome.

## Fichiers principaux

| Zone | Fichiers |
| --- | --- |
| Preuves et notions | [learning-signals.ts](../src/server/learning-signals.ts), [domain.ts](../src/server/domain.ts), [learning.ts](../src/server/learning.ts) |
| Leçons, J0 et jalons | [proactive-lessons.ts](../src/server/proactive-lessons.ts), [proactive-progress.ts](../src/server/proactive-progress.ts), [proactive-revisions.ts](../src/server/proactive-revisions.ts), [bank.ts](../src/server/bank.ts) |
| Migration V11 | [database.mjs](../src/server/database.mjs), [proactive-migration.mjs](../src/server/proactive-migration.mjs) |
| Interface et calendrier | [lessons.tsx](../src/components/lessons.tsx), [sessions.tsx](../src/components/sessions.tsx), [reminders.tsx](../src/components/reminders.tsx), [revision-calendar.ts](../src/server/revision-calendar.ts) |
| Contrats et consignes | [mcp.ts](../src/server/mcp.ts), [correction](../automation/correct-prof.md), [séance quotidienne](../automation/daily-prof-bank.md) |
| Vérifications | [règles V1](../tests/proactive.test.ts), [parcours Next.js et MCP](../tests/proactive-browser.spec.ts), [migration](../tests/availability-migration.test.ts) |

## Contrats MCP

Découvrir les schémas avec `tools/list`. Prévoir une clé `requestId` stable et distincte pour chaque mutation. Le serveur refuse une clé réutilisée pour un contenu différent. `submit_feedback` et `publish_session` acceptent encore les anciens appels sans clé.

| Outil | Entrée et résultat |
| --- | --- |
| `resolve_learning_notion` | `{requestId, name}` renvoie `{id, name}` à partir du libellé exact. Chercher une notion équivalente dans la banque avant de créer un libellé. |
| `submit_feedback` | Champs historiques et `observations?: [{notionId, kind, explanation}]`. Les valeurs de `kind` sont `error`, `strength`, `style` et `typo`. Le retour et les observations sont atomiques. Les observations sont relisibles via `get_attempt`. |
| `list_learning_signals` | `{notionId?, limit?, offset?}` renvoie `state`, `candidates` et `nextOffset`. Les états sont `no_data`, `no_candidate` et `candidates`. Chaque candidature comporte les preuves et les énoncés utiles au choix pédagogique. |
| `create_proactive_lesson` | `{requestId, notionId, evidenceAttemptIds, title, objective, reason, itemIds, reminders}` renvoie `{id, sessionId}`. Le J0 est créé dans la même transaction que son brouillon de leçon. |
| `get_proactive_lesson` | `{lessonId}` renvoie l’état, les preuves et les dates. Relire les exercices et cartes figés via `get_session` avec le `sessionId`. Pour modifier un J0 encore en brouillon, utiliser `update_draft`. |
| `list_proactive_lessons` | `{requestId?, limit?, offset?}` renvoie `activeLesson`, `lessons` et `nextOffset`. Le filtre `requestId` retrouve un brouillon après une réponse réseau incertaine. |
| `publish_proactive_lesson` | `{lessonId, requestId}` conseille un J0 déjà relu. La publication valide les preuves, l’unicité, la carte et les exercices dans une seule transaction. |
| `compose_session` / `update_draft` | `revisionLinks?: [{milestoneId, positions}]`, positions à partir de zéro. `get_session` indique `revision_links` et les IDs des occurrences. Omettre les liens dans `update_draft` conserve les associations sur les mêmes items, même après réordonnancement. Fournir `[]` efface les liens du brouillon. |
| `get_daily_plan` | `revisionMilestones` contient le premier jalon non effectué de chaque leçon. `timing` indique aujourd’hui, en retard ou à venir. `scheduledIn` liste ses séances déjà publiées. `laterDue` liste les étapes arrivées à échéance qui attendent ce premier jalon. Le budget et les suggestions par item suivent leur logique habituelle. |

Les états de leçon sont `draft`, `advised`, `in_progress`, `j0_completed` et `dismissed`. Les API élève sont `GET /api/lessons`, `GET /api/lesson?id=…` et `POST /api/lesson-action` avec `{lessonId, requestId, action}` et `action` à `start` ou `dismiss`. Le contenu du J0 passe par `GET /api/session` et les routes de tentative existantes. Un aperçu conseillé expose les cartes et les consignes publiques. Les observations, les rubriques privées et les références des preuves restent côté professeur.

La route `GET /api/reminders` conserve le contrat du calendrier externe. L’écran utilise `GET /api/revision-calendar`, qui renvoie les deux sources et leur identifiant. Les états externes `missing` et `unreadable` laissent les échéances SQLite visibles. `ITALIANO_REMINDERS_PATH` permet de substituer un fichier isolé pendant les tests.

## Règles et points à préciser dans la spec

- **Indépendance d’une preuve.** La fenêtre couvre aujourd’hui et les 29 jours civils précédents à Rome, selon la soumission. Les tentatives en attente, les aides enregistrées, les reformulations, les verdicts neutralisés ainsi que les observations de réussite, de style ou de coquille sont exclues. Une erreur ciblée peut coexister avec un verdict global correct. Le serveur compare l’identité et le texte normalisé des énoncés, y compris avec les anciennes tentatives. Le professeur vérifie les paraphrases et les changements superficiels avant de proposer une leçon. La spec gagnerait à expliciter cette responsabilité.
- **Validation pédagogique du J0.** Le serveur exige une carte de cours avec un ou deux exemples traduits, au moins un exercice fermé et un seul champ final. La notion principale doit être indiquée sur le champ final et au moins un exercice fermé. Le professeur valide que les activités font réellement mobiliser la distinction. Pour un jalon, les items liés doivent tous porter la notion et au moins un doit être autre qu’une carte.
- **Travail du jour et durée indicative.** Le budget peut être atteint alors qu’un rappel est encore prévu aujourd’hui. Les consignes donnent la priorité aux thèmes du jour lors de la préparation d’une nouvelle séance. Si une séance est déjà publiée, la routine indique les thèmes non couverts. Le professeur vérifie le sens des exercices et la couverture externe avant publication. La consigne quotidienne précédente permettait de s’arrêter dès que le budget était atteint. La priorité des thèmes du jour mérite d’être inscrite dans le contrat de la routine.
- **Rectification après validation.** Rectifier une preuve empêche le démarrage si moins de deux preuves restent admissibles. Une leçon commencée continue. Un J0 déjà validé conserve ses dates. Pour un jalon effectué, la rectification invalide le résultat et conserve la réalisation et la date. Il serait utile de confirmer ce traitement dans la spec.
- **Leçon écartée.** Une nouvelle proposition sur la même notion demande au moins un énoncé de preuve nouveau. Un cycle débuté bloque une nouvelle proposition de la même notion tant qu’il reste un jalon à faire.

## Migration, activation et désactivation

La V11 ajoute les tables d’observations, de leçons, de preuves, de jalons et de liaisons, ainsi que deux index sur les tentatives et les brouillons de phrases. La migration se déclenche à la première ouverture SQLite. Une base V10 reçoit une sauvegarde privée et cohérente `.before-proactive-lessons-…sqlite` avant migration. Les versions de banque, séances existantes, tentatives, corrections et échéances individuelles restent utilisables.

Après validation séparée, sauvegarder le dossier des données à froid, démarrer l’application avec le build V1, puis redémarrer le serveur MCP du profil voulu et vérifier les schémas via `tools/list`. Utiliser les deux consignes versionnées après vérification des droits du profil. En cas de timeout, relire par ID ou clé de création avant de rejouer la même mutation.

Pour suspendre les nouvelles propositions, revenir aux consignes de correction précédentes en gardant l’application V1 pour la consultation et les cycles commencés. Pour revenir entièrement à la version précédente, arrêter l’application et le MCP, conserver une copie de la base V11, puis restaurer ensemble le code et la sauvegarde SQLite antérieurs. Les écritures postérieures à la sauvegarde resteront dans la copie V11.

## Vérifications

Les scénarios utilisent SQLite isolée, des exemples fictifs et, pour l’intégration navigateur, de vrais processus Next.js et MCP stdio. Le profil opérationnel, les crons et la mise en service restent à valider séparément.

| Commande exécutée | Résultat |
| --- | --- |
| `npm test` | 51 tests réussis, dont la migration V10 → V11 rejouée et les règles de preuve, de J0 et de jalon. |
| `npm run test:mcp` | Contrats vérifiés par MCP stdio, y compris les appels historiques et les nouveaux champs facultatifs. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Build de production et vérification TypeScript réussis. |
| `ITALIANO_TEST_PORT=3217 npm run test:browser:isolated` | 17 tests réussis. Le parcours V1 exerce deux processus MCP concurrents, la reprise au clavier sur mobile, minuit et le changement d’heure à Rome, les rappels externes dégradés et le J1 validé par son occurrence liée. |
