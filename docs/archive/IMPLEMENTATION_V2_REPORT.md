# V2 — rapport de validation final

## Réalisé
Application Next.js/shadcn locale avec SQLite partagé par backend et MCP stdio officiel. Trois formats : flashcard auto-évaluée, texte à trous auto-corrigé avec variantes explicites et accents conservés, réponse libre en attente du professeur. Séances brouillon/publication, dates Europe/Rome et distinction futures/dues, correction ciblée par tentative, historique et reprise après rechargement, anti-double soumission, échéances de flashcards, vocabulaire/import et migration V1 explicite sans effacement localStorage. Base par défaut data/italiano.sqlite, WAL, FK, transactions et permissions locales. Aucun profil Hermes, vault ou cron modifié.

## Vérifications réellement exécutées par Hermes sous Node 22.12
- npm run lint : réussi après dernière correction.
- npx tsc --noEmit : réussi après dernière correction.
- npm test : 7 tests réussis.
- npm run test:mcp : initialize/list/create/publish/pending/feedback/readback avec transport SDK stdio réel, réussi.
- npm run build -- --webpack : réussi.
- npm run test:browser:isolated : 4/4 réussis sous Chromium, base temporaire isolée. Révision vocabulaire/recherche/import et persistance ; absence de débordement mobile ; création/publication prof par MCP, réponse via UI/HTTP, correction par MCP, relecture dans UI et reprise ; démo trois types et séances futures.
- Un défaut de contrôle Origin a été trouvé par les vrais tests navigateur : Next utilisait localhost en URL interne alors que le navigateur était sur 127.0.0.1. Corrigé par comparaison stricte à Host local autorisé (localhost ou 127.0.0.1), sans désactiver le rejet cross-origin. La suite complète est passée ensuite.
- Le serveur utilisateur V2 est démarré sur http://127.0.0.1:3211, base par défaut, pas une DB de test. GET /api/sessions 200 (démo 3 exercices), GET /api/vocabulary 200 (18 expressions). La lecture directe de la couche métier retrouve l'ID exact de séance renvoyé par HTTP : app et MCP partagent bien la base par défaut sans override de test.

## Limites et activation restantes
Le MCP est prêt mais NON installé sur le profil prof-italien. Aucune routine quotidienne activée ; aucune promesse de génération/correction automatique avant ce raccordement. Documentation et lanceur scripts/mcp.sh fournis. SQLite natif expérimental nécessite le flag inclus dans scripts npm et lanceur. App locale mono-utilisateur, aucun compte ou cloud. Prononciation dépend d'une voix italienne appareil, pas de reconnaissance vocale ni correction IA dans le navigateur. Intervalles fixes simples, pas FSRS. Huit vulnérabilités modérées de développement constatées à l'installation précédente, pas de correction majeure automatique. Tests navigateur isolés ne polluent pas les données utilisateur. Pas de commit/push ni déploiement.
