# Italiano Lab

Application locale de révision d’italien, en français. Les 18 expressions fournies et la séance initiale sont des **démonstrations**. Les données, la banque d’items et les résultats sont conservés dans SQLite ; aucune synchronisation Obsidian, connexion à un vault, correction IA, compte ou service distant n’existe.

## Démarrage

Le serveur, le MCP et les tests utilisent Node.js 24. Avec nvm, lancez les commandes suivantes depuis la racine du projet.

```sh
nvm install
nvm use
npm install
npm run dev
```

Ouvrir l’adresse locale indiquée par Next.js. Les vérifications sont `npm test`, `npm run lint`, `npx tsc --noEmit` et `npm run build`. Voir [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) pour les résultats réellement obtenus dans cet environnement.

## Utilisation

Dans Réviser, choisir les cartes dues ou toutes les cartes. Révéler la réponse puis choisir une note ; les touches espace et 1–4 fonctionnent hors des contrôles. Les intervalles sont fixes : 10 minutes, 1 jour, 3 jours et 7 jours. Ce n’est pas FSRS. Les difficultés correspondent aux dernières notes À revoir ou Difficile. Le son dépend d’une voix italienne installée sur l’appareil.

Dans Aujourd’hui, chaque nouvel exercice peut regrouper plusieurs items sous une consigne commune. Répondez directement dans les phrases à trous ; chaque item garde sa correction et ses tentatives. Les cartes mémoire proposent deux modes en carrousel : retourner la carte puis choisir « À revoir » ou « Je savais », ou saisir la traduction italienne et la faire vérifier. Le type Questionnaire propose aussi des QCM question par question, avec correction immédiate, nouvelles tentatives et reprise des résultats enregistrés. Une séance « Les goûts · Questionnaire » permet de l’essayer. La progression compte les items travaillés. Le format de création MCP est décrit dans [l’intégration professeur](docs/PROF_INTEGRATION.md#exercices-à-plusieurs-items).

Les résultats et imports sont conservés dans SQLite. La progression V1 en `localStorage` peut être importée explicitement depuis Sources.

Les constructions de phrases sont accessibles dans les séances du professeur et l’entraînement libre. Les mots à remettre dans l’ordre sont vérifiés à l’envoi. Le professeur corrige les phrases guidées, les transformations, les réponses en situation et les mini-dialogues. Après correction, « Reformuler » ouvre une nouvelle tentative reliée à la précédente. [Création et correction via MCP](docs/PROF_INTEGRATION.md#construction-de-phrases)

## Import Markdown

Dans Sources, télécharger l’exemple ou choisir un fichier `.md`. Un frontmatter YAML est facultatif et ignoré. Chaque section `## expression italienne` doit contenir ces quatre champs :

```md
---
titre: Au marché
---

## Un chilo di pomodori
- Français: Un kilo de tomates
- Exemple: Vorrei un chilo di pomodori.
- Traduction: Je voudrais un kilo de tomates.
- Thème: Quotidien
```

Le fichier est validé en entier avant ajout ; les expressions italiennes déjà présentes sont ignorées sans modifier leur progression. Le nom du fichier est conservé comme source. L’import est manuel : aucun accès direct au disque ou au vault n’est réalisé.

## Banque, carnet et révision espacée

Le menu « Carnet d’erreurs » retrouve les réponses incorrectes ou partielles, leur correction et toutes les tentatives. L’entraînement libre et les séances du professeur partagent les identités d’items et le suivi. Les intervalles sont 1, 3, 7, 14 puis 30 jours ; une réussite juste après correction ne consolide pas l’item. Trois réussites indépendantes aux échéances prévues permettent le statut « Consolidé ».

Le budget quotidien suggéré est d’environ 35 minutes, tous modes réunis : 15 s par auto-évaluation de flashcard, 30 s par QCM/trou/traduction et 3 min par réponse libre. Le mode Réviser historique reste disponible pour le vocabulaire importé et ses auto-évaluations ; il ne crédite pas automatiquement la consolidation des items.

Les migrations sont transactionnelles. La version 6 a introduit le suivi partagé, et la version 8 ajoute le suivi des indices et des reformulations. SQLite crée une sauvegarde cohérente avant la migration d’une base déjà versionnée, par exemple `.before-sentences-…sqlite` depuis la version 7. Pour la bascule, arrêter l’application et le MCP, sauvegarder `data` et l’ancien code, puis redémarrer les deux avec la même version. En cas de restauration, préserver aussi les données créées depuis la sauvegarde.

Voir [le fonctionnement et la migration](docs/ENTRAINEMENT_LIBRE.md), [le bilan de validation](docs/IMPLEMENTATION_REVISION_REPORT.md) et [les changements Hermes à appliquer séparément](docs/HERMES_BANK_CHANGES.md). Les profils et crons ne sont pas modifiés par ce chantier.

## Exécution locale

Depuis ce dossier, lancez `npm run build -- --webpack`, puis `npm run start -- --hostname 127.0.0.1 --port 3211` sous Node.js 24. Ne pas exposer le serveur au réseau. La base est `/Users/vincent/italiano-lab/data/italiano.sqlite` ; `ITALIANO_DB_PATH` permet de choisir un fichier isolé. Le chemin par défaut est résolu depuis la racine du projet, indépendamment du répertoire courant.

Dans Sources, le bouton « Importer mon ancienne progression » copie explicitement les données V1 valides sans effacer localStorage et sans remplacer les révisions déjà présentes. Les nouvelles données utilisent SQLite. La séance de démonstration est créée une fois lors du chargement des séances.

Pour sauvegarder : arrêter tous les processus utilisant la base, puis copier le dossier `data` entier. Pour restaurer, arrêter ces processus et remplacer ce dossier par une copie de sauvegarde cohérente. Ne pas copier uniquement le fichier principal pendant que SQLite est ouvert.

Tests : `npm test`, `npm run test:mcp`. Après `npm run build -- --webpack`, `npm run test:browser:isolated` démarre un serveur sur 3211 et utilise une base temporaire supprimée à la fin ; le port doit être libre. Si 3211 est occupé, utiliser `ITALIANO_TEST_PORT=3212 npm run test:browser:isolated`. Pour un serveur 3211 déjà démarré par le parent, lancer `ITALIANO_DB_PATH=/chemin/absolu/base-isolee.sqlite npm run test:browser` avec exactement la même valeur que pour le serveur. Les tests navigateur modifient cette base : ne jamais utiliser la base personnelle. Voir [l'intégration professeur](docs/PROF_INTEGRATION.md). L’état du profil et de la planification Hermes n’a pas été revérifié pendant cette implémentation.

## Rappels thématiques

La page Aujourd’hui affiche le calendrier en lecture seule depuis `/Users/vincent/.hermes/profiles/prof-italien/revisions.json`, séparément des séances publiées. Les dates sont interprétées comme des dates civiles à Rome ; les rappels échus restent affichés sans présumer qu’ils ont été réalisés. Un fichier absent, vide de rappels ou invalide est signalé. Le serveur doit avoir accès en lecture à ce fichier local ; après modification du code, reconstruire et redémarrer le serveur pour rendre cette section disponible. Aucun fichier Hermes ni calendrier n’est modifié.

## Entraînement libre

Le menu et `/entrainement` ouvrent la même interface. La série suggérée privilégie les items dus et respecte le budget restant ; au plus cinq items encore à évaluer sont ajoutés. La pratique volontaire permet d’aller plus loin, sans repousser artificiellement les échéances. Chaque réponse reste une nouvelle tentative et la reprise retrouve les réponses sauvegardées.

Le professeur peut chercher et créer du contenu dans la banque, composer une séance par références, modifier un brouillon puis publier après relecture. Une modification pédagogique crée une nouvelle version et un nouveau cycle ; les questions déjà présentées restent figées. Les nouveaux outils et contrats sont décrits dans [l’intégration professeur](docs/PROF_INTEGRATION.md).
