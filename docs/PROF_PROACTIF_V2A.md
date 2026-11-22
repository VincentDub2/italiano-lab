# Italiano Lab V2A — Aujourd’hui

**À faire maintenant** affiche une action directement accessible et sa raison. Les corrections, les leçons et les activités disponibles restent accessibles sous la carte. **Révisions prévues** distingue les séances prêtes, les jalons en attente de correction, ceux qu’un jalon précédent retient et les rappels externes dont la couverture reste à confirmer.

## Priorité et reprise

1. Révision du jour avec au moins un exercice lié prêt dans une séance publiée. Le lien ouvre directement la première occurrence prête.
2. Dernière séance ou leçon commencée à laquelle il reste un exercice actionnable. En cas d’égalité, l’identifiant départage les activités.
3. Retour à lire dans les sept derniers jours civils de Rome, aujourd’hui compris. Les retours qui débloquent un exercice ou une leçon passent en premier.
4. Séance du professeur publiée, à la date du jour ou dans les six jours civils précédents. Les séances plus anciennes restent visibles dans l’historique.
5. Leçon conseillée encore démarrable, avec la raison rédigée par le professeur.
6. Entraînement ciblé selon le budget et la banque disponibles, ou « Rien d’obligatoire pour aujourd’hui ».

La navigation principale propose **Aujourd’hui**, **Mes leçons**, **S’entraîner** et **Mon niveau**. Mon niveau donne accès aux corrections et au carnet d’erreurs. Les chemins directs `/seances/[id]?item=…`, `/corrections/[id]` et `/lecons/[id]` permettent la reprise après rechargement.

## Contrats et migration

| Contrat | Comportement |
| --- | --- |
| `GET /api/today` | Renvoie la date à Rome, l’action principale ou `null`, les actions secondaires, les révisions prévues et les avis. Les actions exposent leur type et leurs identifiants internes, avec un titre et une raison. La lecture est sans effet sur la progression. |
| `GET /api/correction?id=…` | Renvoie la tentative exacte, son retour public, la version courante et l’état de lecture. |
| `POST /api/correction-read` | Enregistre explicitement la lecture pour `{attemptId,version}`. Le rejeu est sans effet. Une nouvelle rectification reste à lire. |

La migration V12 ajoute la table `correction_reads`. Une base V11 reçoit une sauvegarde `.before-correction-reads-…sqlite`. Les anciens retours demeurent consultables et la migration ne leur attribue aucun accusé de lecture. Les anciens contrats MCP et calendrier sont conservés.

## Mise en service

Après validation, utiliser le build V2A sous Node 24. L’application applique la migration à la première ouverture de SQLite. Pour un retour à la version précédente, arrêter les processus qui utilisent la base et préserver une copie de la base V12 avant de restaurer le code et la sauvegarde antérieurs. Les vérifications ci-dessous utilisent une base SQLite isolée, hors du serveur et du profil opérationnels.

## Vérifications

| Commande | Résultat |
| --- | --- |
| `npm test` | 55 tests réussis, dont la priorité des actions, l’accusé de lecture par version, la fenêtre de rattrapage et la migration V11 → V12. |
| `npm run test:mcp` | Contrats existants vérifiés avec le lanceur MCP stdio. |
| `npm run lint` | Réussi. |
| `npm run build -- --webpack` | Build de production et TypeScript réussis dans un dossier de build isolé. |
| `ITALIANO_TEST_PORT=3227 npm run test:browser:isolated` | 18 tests réussis. Le parcours réel vérifie le J1 prioritaire face à une correction et une leçon, le lien vers l’exercice, le démarrage au clavier, la reprise après rechargement et la lecture après rectification. |
