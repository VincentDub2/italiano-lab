Les manques V2 sont implémentés : les séances retrouvent leurs dernières tentatives après rechargement, empêchent les doubles soumissions et permettent une nouvelle tentative explicite. Les séances sont réparties entre dates dues et futures selon Europe/Rome, avec leur source Démonstration ou Professeur visible.

Les flashcards de séance enregistrent désormais leur échéance et apparaissent dans le résumé d’apprentissage lorsqu’elles sont dues. Les scripts npm concernés activent SQLite expérimental, et le chemin de base par défaut est résolu depuis le projet.

Vérifications réussies sous Node 24 : **7 tests métier**, test MCP réel, lint, TypeScript et build webpack. Les quatre scénarios Playwright sont détectés. Le parent peut les lancer sur son serveur 3211 avec la même valeur isolée de `ITALIANO_DB_PATH`, ou utiliser `npm run test:browser:isolated` après le build ; les commandes sont documentées dans [README.md](../../README.md).

Les tests navigateur n’ont pas été exécutés ici : leur exécution est laissée au parent comme demandé. La compatibilité Node 22.12 des modifications reste à confirmer par celui-ci.