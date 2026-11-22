# Bilan — banque d’items, carnet d’erreurs et révision espacée

Implémentation du document de conception et des arbitrages Q1 à Q22, validés le 14 novembre 2026. Aucun ajout de dépendance.

## Fonctionnement livré

- Banque indépendante des séances, avec identité stable des exercices et des items, notions explicites, liens de variantes et versions figées. Composer un brouillon réutilise les identités ; un changement pédagogique ouvre un nouveau cycle et une coquille peut conserver le suivi.
- Historique commun `learning_attempts` pour les séances et l’entraînement libre. Réponses successives sans écrasement, saisie brute conservée pour les nouvelles tentatives, idempotence des requêtes, statut d’aide persisté et distinction entre les contextes.
- Moteur déterministe des révisions : intervalles 1/3/7/14/30 jours civils Europe/Rome, première réussite sans crédit de réussite espacée, trois échéances réussies pour consolider, rechute à un jour, réponses aidées et anticipées sans progression, au plus une progression par jour. Les corrections libres tardives et les attentes sont prises en compte.
- Nouvel essai automatique après trois autres items distincts, au maximum une fois dans la séance ou série. Une réponse après correction reste de l’entraînement. Les séances et séries reprennent les réponses enregistrées après rechargement.
- Carnet accessible dans le menu, avec filtres notion/date/état, question et consigne historiques, choix du QCM, réponse, correction, explication, dates, contexte, aide connue ou inconnue et rectifications. Les items consolidés quittent « À suivre » mais restent dans l’historique ; une révision ciblée des items affichés est possible.
- Budget quotidien commun : 15 s par auto-évaluation de flashcard, 30 s par QCM/trou/traduction et 3 min par réponse libre. La sélection suggérée respecte le budget restant, priorise les échéances et les erreurs récurrentes et introduit au plus cinq items encore à évaluer. La pratique volontaire reste disponible.
- Les items déjà réussis aujourd’hui dans un autre contexte peuvent être passés dans une séance publiée sans tentative fictive. Le résumé quotidien et le résultat `daily_complete` permettent d’éviter une publication supplémentaire quand l’objectif est rempli.
- Huit outils MCP supplémentaires, avec les huit outils historiques conservés : recherche et création dans la banque, composition de séance, édition de brouillon, versionnement, rectification, plan quotidien et carnet professeur. Les relectures vérifient le résultat réel des mutations.
- Contrôles d’origine des routes élève préservés ; mutations professeur réservées au MCP ; corrigés cachés avant réponse ou révélation. Interfaces ajoutées en utilitaires Tailwind, sans modification de `globals.css`.

## Migration et sauvegarde

La migration 6 conserve les anciens IDs, groupes, réponses, corrections et snapshots. Les anciennes tables de tentatives restent des archives ; les nouvelles lectures et écritures utilisent l’historique commun. Aucun item ancien n’est fusionné automatiquement.

Les QCM de séance et de pratique conservent leurs formats de réponse différents, respectivement identifiant de choix et index. L’usage d’aide historique reste inconnu, sans réussite indépendante ni maîtrise inventée. Les anciennes erreurs sont reprises avec un suivi initialisé à la migration ; les anciennes dates de tentative ne sont pas modifiées.

Avant de migrer une base déjà versionnée, le serveur crée par SQLite une sauvegarde cohérente `.before-bank-<date>-<uuid>.sqlite`, avec permissions privées, puis applique la migration dans une transaction. Les tests vérifient le rollback en cas d’erreur, la répétabilité de l’ouverture, l’intégrité, les clés étrangères et la restauration des données V5 depuis cette sauvegarde.

Le code présent avant cette implémentation a aussi été archivé dans `data/backups/code-before-bank-2026-11-14.tar.gz` (sources, tests, documentation, configuration des dépendances). Cet export exclut la base personnelle et ne constitue pas une sauvegarde de ses données.

**La base personnelle n’a pas été migrée pour ces tests et le service personnel n’a pas été redémarré.** Pour la bascule réelle, arrêter application et MCP, sauvegarder le dossier `data` entier avec l’ancien code, puis relancer les deux sur la même base avec la version construite. Une restauration doit associer le code et la base correspondants et préserver les nouvelles données créées après la sauvegarde.

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| `npm test` | 30 tests réussis, aucun ignoré. |
| `npm run test:mcp` | Initialisation MCP, outils historiques, banque, composition, édition du brouillon, publication, réponses, corrections, carnet, rectification et relecture réussis. |
| `npx tsc --noEmit` | Réussi ; la construction finale exécute également TypeScript. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Construction de production réussie. |
| `ITALIANO_TEST_PORT=3218 npm run test:browser:isolated` | 9 tests navigateur réussis, aucun ignoré ; parcours principal sans erreur JavaScript et affichage vérifié de 320 à 1440 px. |

Les tests de dates utilisent une horloge contrôlée et une véritable base SQLite temporaire : erreur, nouvel essai aidé, J1/J4/J11, consolidation, maintien de l’historique, rechute, variante distincte, réponse libre corrigée tardivement et budget rempli. Ils vérifient aussi la préservation des questions anciennes après versionnement et les clés d’idempotence réutilisées à tort.

Les tests navigateur utilisent un serveur de production et une base temporaires, sans pointer vers la base personnelle. Ils vérifient le parcours banque → séance → erreur → trois autres items → nouvel essai après correction → carnet → entraînement libre, une erreur réseau suivie d’un nouvel essai, la reprise, les QCM au clavier, les corrections professeur et les écrans existants. Les largeurs contrôlées vont de 320 à 1440 px. Le scénario principal vérifie l’absence d’erreur JavaScript.

Le navigateur intégré était indisponible dans cette session à cause d’une erreur de configuration de l’outil ; la vérification a utilisé Playwright déjà installé dans le dépôt.

Le test navigateur génère les captures du carnet sur ordinateur et mobile dans le dossier local `artifacts/`.

## Hermes et limites restantes

Les profils, crons et scripts Hermes n’ont pas été modifiés ; aucune notification Discord n’a été envoyée. Les adaptations à appliquer sont dans [HERMES_BANK_CHANGES.md](HERMES_BANK_CHANGES.md), avec les [nouvelles consignes quotidiennes](../automation/daily-prof-bank.md). Leur installation et leur exécution réelle sur Hermes restent à effectuer séparément.

Les durées sont des estimations ajustables, pas une mesure du temps actif. L’application ne détecte pas une aide extérieure. Les espaces déjà supprimés des anciennes réponses sont irrécupérables ; leur valeur enregistrée reste intacte. Les doublons historiques sont conservés volontairement et les notions manquantes restent à renseigner par le professeur. Aucun badge automatique de maîtrise d’une notion n’est attribué.

Le suivi mémoire historique du vocabulaire et ses auto-évaluations sont conservés séparément ; ils ne sont pas convertis en réussites objectives. Les essais avec horloge contrôlée vérifient les intervalles sans prétendre mesurer une rétention pédagogique réelle sur plusieurs semaines. Aucun test de charge multiutilisateur n’a été ajouté à cette application locale mono-élève.
