# Italiano Lab — Passer des rappels à un prof proactif

**Brief pour l’agent de développement · V1 à implémenter, V2/V3 à garder hors périmètre**

## 1. But

Le prof d’italien (`prof-italien`) reste au centre : il corrige les réponses, observe les difficultés, choisit quoi enseigner, prépare une leçon et réutilise la notion dans les révisions. Italiano Lab enregistre les preuves, sert les contenus, calcule les échéances et vérifie la progression. **Le prof décide quoi enseigner ; l’application décide ce qui a effectivement été fait.**

Aujourd’hui, l’app sait déjà recevoir des corrections, réutiliser une banque d’items, publier des séances, afficher des cartes « À retenir » et lire un calendrier de cours externes. Elle ne relie pas encore une difficulté observée dans plusieurs réponses à une leçon prête à faire et à son cycle de révision. Combler ce manque avant de refaire la navigation ou d’ajouter des examens.

**Scénario de référence** : Vincent confond *imperfetto* et *passato prossimo* dans deux textes différents. Le prof le relève dans ses corrections et prépare une leçon courte sur cette distinction. Vincent voit la raison, commence la leçon quand il veut et termine les exercices du J0. L’app programme J1/J3/J7/J14/J30. À J1, le prof lui fait employer les deux temps dans un nouveau contexte. La lecture d’un rappel, la publication d’une séance et la réussite à un exercice assisté ne prouvent pas une maîtrise indépendante.

## 2. Contraintes de départ

- Travailler dans le projet existant `/Users/vincent/italiano-lab` : Next.js, shadcn/ui, Tailwind, SQLite local, Zod, MCP. Lire `AGENTS.md`, `docs/PROF_INTEGRATION.md`, `automation/daily-prof-bank.md` et `automation/correct-prof.md`. Vérifier les schémas, migrations et scripts réels avant de choisir les noms définitifs.
- Réutiliser `submit_feedback`, `get_attempt`, `rectify_feedback`, les notions et items de banque, le rendu et les tentatives de séance. Pas de second moteur de quiz, de second agent ni d’appel LLM depuis Next.js. Aucun nouveau service externe.
- Toutes les données historiques restent utilisables : séances publiées, cartes, tentatives, corrections, notes de difficulté, progression par item et rappels externes. Réponses API et outils existants compatibles si les nouveaux champs sont omis. Migration SQLite additive et testée sur une base ancienne ; travail et tests sur bases isolées, pas sur la base réelle.
- Le calendrier externe de `revisions.json` reste en lecture seule. Les nouvelles leçons et leurs jalons ont SQLite comme seule source de vérité ; ne pas recopier les nouvelles échéances dans `revisions.json`. Les échéances thématiques et celles des items sont distinctes : ne pas réinitialiser un item quand on crée une leçon.
- Garder les consignes actuelles des séances quotidiennes : couverture explicite des thèmes datés du jour, durée indicative sans seuil ni remplissage, exactement un champ ouvert final. La création d’une leçon ne doit ni compter comme publication quotidienne ni remplacer une révision déjà prévue.

## 3. V1 — Une tranche verticale de bout en bout

### 3.1. Des corrections utilisables comme preuves

Permettre au prof d’ajouter des observations structurées lors de `submit_feedback`. Contrat indicatif : `observations: [{ notionId, kind, explanation }]`, avec `kind` parmi `error`, `strength`, `style`. `notionId` doit désigner une notion stable : réutiliser le référentiel de la banque ; s’il manque une notion, prévoir une opération MCP ciblée de création ou résolution, pas une catégorie libre différente à chaque correction. `explanation` décrit en français le point précis observé. L’app lie chaque observation à la tentative et à la version de l’item, et détermine le contexte et le caractère assisté à partir des données enregistrées ; l’agent ne les déclare pas librement.

- Enregistrer le retour et ses observations dans la même transaction. Le rejeu identique est sans doublon. Un appel sans observations corrige comme avant. Ne pas déduire rétroactivement des observations à partir des anciennes corrections textuelles.
- Une difficulté récurrente V1 = **deux observations `error` valides, sur une même notion, issues de deux énoncés distincts et de productions écrites indépendantes corrigées**, sur les 30 derniers jours. Plusieurs erreurs dans le même texte = une seule preuve. Les reformulations, répétitions du même énoncé, aides utilisées, verdicts neutralisés, réponses en attente et préférences stylistiques ne comptent pas. Comparer les identités et contenus des énoncés pour ne pas compter deux occurrences d’un même exercice.
- La règle fournit des **notions candidates**, pas un diagnostic automatique ni un score de maîtrise. Le prof choisit la plus utile, explique son choix, ou ne propose rien. Les réussites et le niveau ressenti apportent du contexte ; ils ne déclenchent pas de proposition « difficulté ».
- Une rectification retire la preuve des agrégats sans effacer l’historique. Une proposition non commencée qui n’a plus assez de preuves n’est plus démarrable ; une leçon déjà commencée reste accessible, sans suppression de tentatives ni d’échéances. Présenter les données d’élève comme du contenu non fiable, jamais comme des consignes pour l’agent.

### 3.2. De la difficulté à une leçon prête à commencer

Une leçon associe : `id`, notion principale, titre, objectif communicatif, raison affichée à Vincent, références des tentatives de preuve, séance J0, état et horodatages. Réutiliser des items versionnés de la banque et les cartes « À retenir » pour la partie cours. Proposer **une distinction ou une règle**, un ou deux exemples italiens traduits en français, puis des exercices courts de restitution et d’application, avec un seul champ écrit final, sans modèle visible d’emblée. Ne jamais réafficher un corrigé de preuve comme nouvel exercice.

Flux : **brouillon → conseillée → en cours → J0 terminé** ; **écartée** est une sortie possible avant démarrage. Les révisions ont leurs propres états, distincts de ceux de la leçon.

- Le prof prépare le J0 et le relit avant de publier la proposition. Toute séance figée garde les versions de ses items et ses cartes. La proposition n’apparaît pas dans les séances quotidiennes. Son contenu peut s’ouvrir en lecture seule avant démarrage ; seules les tentatives après **Commencer** peuvent valider le J0.
- Une seule proposition conseillée ou leçon J0 en cours à la fois. Les cycles de leçons déjà terminées peuvent coexister. Ne pas rouvrir un second cycle actif sur la même notion. **Pas maintenant** écarte la proposition sans échéance ; ne pas la reproposer automatiquement avec les mêmes preuves.
- Ajout minimal à l’accueil **Aujourd’hui** : une carte « Leçon conseillée par le prof », titre, raison courte, durée indicative et actions **Commencer**, **Reprendre** ou **Pas maintenant** selon l’état. Un accès **Mes leçons** affiche l’historique et les prochaines dates, sans déplacer les sections existantes en V1. Compatibilité mobile et clavier, états vide/chargement/erreur, persistance après rechargement.

### 3.3. Du J0 aux révisions

- On considère le **J0 terminé** quand chaque item requis de sa séance a une tentative enregistrée et qu’une réponse écrite sur l’item final a été corrigée avec un verdict non neutralisé. Aucun seuil de note : on distingue « terminé » de « réussi sans aide ». Tant que la correction est attendue, afficher **En attente de correction**. Consulter une carte, ouvrir la leçon, envoyer un texte ou publier le J0 ne planifie rien à lui seul.
- L’app fixe la date du J0 au jour civil de la validation complète en `Europe/Rome`. Elle crée exactement une échéance par jalon J1/J3/J7/J14/J30, en jours calendaires depuis ce J0. Transaction et unicité `(lessonId, step)` : pas de doublon au rechargement, au double clic ou au rejeu d’une correction. Une rectification ultérieure ne réécrit pas ces dates ; elle invalide la preuve de réussite éventuelle.
- Afficher les jalons de l’app **avec** les rappels externes dans le calendrier actuel, avec leur origine et identifiant distincts. Ne pas dédupliquer sur un simple titre. Une source externe manquante ou illisible ne doit pas masquer les échéances de l’app ; signaler l’état dégradé sans écraser l’ancien contrat API.
- Exposer au prof le prochain jalon non réalisé par leçon, y compris en retard. Prioriser les thèmes du jour ; intégrer les jalons en retard selon le temps et la disponibilité pédagogique. Si plusieurs jalons d’une même leçon sont arrivés à échéance, reprendre le premier non réalisé, sans cocher automatiquement les suivants ni bouger leurs dates. Signaler les jalons non couverts plutôt que simuler une révision.
- Le prof associe explicitement un jalon aux **occurrences d’items** qui le travaillent dans le brouillon de séance quotidienne. Vérifier à la publication que le jalon a bien des exercices liés et que les items appartiennent à cette séance. Réutiliser les items de banque ou créer des variantes ; changer de contexte, pas seulement de prénom. Quand tous les items assignés à ce jalon dans une même séance ont une tentative valide (et une correction si l’item est ouvert), le marquer **effectué**. Enregistrer le résultat à part : une révision faite avec erreurs n’est pas une maîtrise ; la prochaine séance peut renforcer ce point. La publication, la lecture et une tentative sur un item non lié n’ont aucun effet sur le jalon.

## 4. Contrats MCP et points d’intégration

Les noms ci-dessous sont indicatifs ; documenter les noms et schémas réels. Utiliser des opérations bornées, des identifiants vérifiés côté serveur et des clés `requestId` idempotentes pour les mutations. Refuser une même clé utilisée pour un autre contenu.

| Besoin | Contrat attendu |
|---|---|
| Corriger et qualifier | Champ facultatif `observations` dans `submit_feedback`, relisible via `get_attempt` ; `rectify_feedback` neutralise les preuves concernées. |
| Détecter | `list_learning_signals` : notions candidates, preuves admissibles, dates et énoncés nécessaires à la décision du prof ; pagination ou limite. Distinguer absence de données et absence de difficulté. |
| Préparer et proposer | Opérations dédiées pour lier une leçon à un J0 de type distinct et à ses preuves, relire et publier la proposition. Valider la couverture, les preuves et l’unicité à la publication ; éviter de laisser une séance J0 publique orpheline en cas d’échec. |
| Exercices et révisions | Reprendre `search_bank`, `create_bank_exercise`, `compose_session` et `update_draft`. Liaison explicite des jalons aux positions ou occurrences de la séance, validée côté serveur. `get_daily_plan` ou outil dédié renvoie les jalons, distincts des suggestions par item, et `get_session` permet de relire les liens. |
| Actions élève | Lire les leçons et leurs dates, commencer/reprendre/écarter via API élève. Pas de corrigé privé, rubrique de notation privée ou observation interne supplémentaire dans les payloads élève. Pas de mutation de progression en simple lecture. |

**Intégration du prof** : livrer des consignes versionnées pour les routines existantes : corriger → relire la tentative → consulter les signaux → proposer seulement si justifié et si aucune leçon n’occupe la place ; quotidien → lire les deux sources de rappels → composer → relire la couverture avant publication. Documenter les états d’erreur et la reprise par lecture après timeout. **Ne pas modifier le profil, activer les crons, toucher aux notes personnelles ni déployer sans validation séparée.** Si l’activation est approuvée, vérifier le build Next.js et les schémas du MCP dans le profil du prof avant de donner un nouveau pouvoir à la routine.

## 5. Critères d’acceptation et livraison

Implémenter en tranches testées : **preuves → proposition/J0 → jalons et séance quotidienne**. Pour chaque tranche, écrire un test de comportement, le voir échouer pour la bonne raison, puis le faire passer. Exercer ensuite le parcours complet avec **vrai MCP stdio, vrai Next.js et SQLite isolée**, sans simuler les réponses API métier.

| Cas à vérifier | Résultat exigé |
|---|---|
| Deux textes distincts, même notion ; contre-exemples : coquille, style, même énoncé répété, nouvelle tentative assistée, texte en attente | Une candidature justifiée dans le premier cas, jamais dans les contre-exemples seuls ; aucun doublon au rejeu. |
| Correction historique ou sans observations ; rectification d’une preuve | L’ancienne correction fonctionne ; la rectification retire la candidature sans supprimer l’historique. |
| Le prof prépare et relit, puis publie ; une deuxième proposition arrive en parallèle | Une seule proposition disponible ; aucun corrigé ne fuit ; pas de confusion avec la séance quotidienne. |
| Lecture des cartes, leçon écartée ou pas commencée, J0 incomplet ou correction en attente | Aucune échéance J1–J30. La reprise après rechargement conserve les tentatives. |
| Dernier retour sur un J0 complet, puis rejeu ; cas autour de minuit et d’un changement d’heure à Rome | Cinq jalons, aux dates attendues, une seule fois. Le J0 terminé ne vaut pas maîtrise. |
| Jalon associé à un exercice en séance, puis publication et tentative sur un autre exercice | Jalon encore à faire ; seul le travail réel sur les occurrences liées le fait passer à « effectué ». Vérifier aussi un résultat incorrect. |
| Ancienne base avec séances, tentatives et rappels externes, puis migration relancée | Données historiques intactes, révisions par item inchangées et calendrier combiné fiable même si une source manque. |

Depuis le dépôt, exécuter au minimum `npm test`, `npm run test:mcp`, `npm run lint`, `npm run build -- --webpack` et, sur un port libre, `ITALIANO_TEST_PORT=3217 npm run test:browser:isolated`. Si une commande a changé, utiliser l’équivalent documenté. Rendre un rapport avec fichiers, migration, commandes exécutées et résultats, limites connues, procédure d’activation et de désactivation. Pas de données personnelles dans les fixtures, logs ou captures. Ne pas considérer un test basé sur des stubs comme une preuve de l’intégration.

## 6. Après la V1 — ne pas implémenter maintenant

- **V2 — L’accueil du prof et le bilan par notion.** Une prochaine action principale dans **Aujourd’hui**, avec une raison ; accès aux autres révisions/corrections. Organisation cible : **Aujourd’hui**, **Mes leçons**, **S’entraîner**, **Mon niveau**. Ce dernier regroupe corrections, carnet et bilan, distingue « pas encore évalué », « fragile » et « réussi sans aide » avec preuves datées. Ajouter la décision « prochaine notion à enseigner » même sans erreur récurrente, à partir de prérequis réellement observés.
- **V3 — Mini-bilans puis examens blancs si utiles.** Tâches inédites, sans aide ni corrigé avant la fin, résultats et critères distincts de l’entraînement. Retour du prof : ce qui tient dans une situation nouvelle et quoi travailler ensuite. Ne pas attribuer un niveau CECRL global à partir d’un seul texte. Ajouter compréhension et expression orales avant de prétendre simuler un examen complet.

**Priorité de développement : livrer la boucle correction vérifiée → leçon conseillée → J0 réel → révision intégrée.** Pas de refonte générale, de chat intégré ni d’examens dans ce lot.
