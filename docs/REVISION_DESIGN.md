# Banque d’items et révision espacée

Conception issue de la proposition discutée le 14 novembre 2026. Les règles pédagogiques Q1 à Q22 ont été confirmées pendant l’entretien. La synthèse a ensuite été confirmée et l’implémentation autorisée. Le résultat vérifié et les limites sont consignés dans [le bilan](IMPLEMENTATION_REVISION_REPORT.md).

## Décisions confirmées

- La séance quotidienne vise un budget d’environ 35 minutes. Si les révisions dues dépassent ce budget, les difficultés prioritaires sont sélectionnées, le reste est reporté et le retard reste visible. L’ajout automatique de nouveautés ne doit pas aggraver l’accumulation.
- Le professeur peut introduire une nouvelle notion malgré des erreurs encore actives. Les échéances guident sa sélection sans lui retirer la possibilité de justifier un autre choix pédagogique.
- Le statut « Consolidé » porte d’abord sur un item. Les résultats par notion et les réussites sur des variantes constituent des informations distinctes ; les conditions d’une consolidation de notion restent à définir séparément.
- L’exercice regroupe les items. Une erreur concerne une tentative sur un item, et le suivi de révision concerne cet item. Les tentatives successives sont conservées.
- La révision peut sélectionner un item isolé, avec sa consigne et le contexte nécessaire. Les autres items de l’exercice gardent leurs propres échéances ; un texte commun reste accessible sans imposer de répondre aux autres questions.
- Un item devient « Consolidé » après trois réussites sans aide à trois échéances distinctes. Une réussite juste après correction ne compte pas dans ces trois réussites. Une nouvelle erreur fait repasser l’item « À retravailler ».
- Le travail effectué en entraînement libre compte dans le budget quotidien suggéré d’environ 35 minutes. Le professeur en tient compte pour éviter d’ajouter automatiquement une séance complète le même jour. Cette règle est retenue comme point de départ ajustable et ne limite pas la pratique volontaire.
- Les intervalles successifs sont de 1, 3, 7, 14 puis 30 jours calendaires Europe/Rome, avec un plafond de 30 jours. Ils sont calculés depuis la tentative effective ; une révision tardive décale la suivante sans empiler les échéances manquées. Exemple : erreur à J0, révisions réussies sans aide à J1, J4 et J11, consolidation à J11 et prochaine échéance à J25.
- Après une erreur et sa correction, l’item peut être reproposé après trois autres items, au maximum une fois automatiquement dans cette séance. Si la séance est trop courte, la révision est reportée au lendemain. Cet essai après correction est conservé mais ne fait pas progresser la consolidation.
- Pour une construction de phrase, la reformulation volontaire est proposée dès que la correction est disponible, y compris dans une séance d’un seul item. Elle est liée à la tentative corrigée et comptée comme assistée. Les indices sont révélés progressivement et comptabilisés par tentative.
- Une réponse incorrecte ou partiellement correcte remet à zéro la série de trois réussites et ramène la prochaine révision au lendemain. L’item repasse « À retravailler » ; l’historique conserve la distinction entre résultat incorrect et partiellement correct.
- La progression est limitée à une réussite par item et par jour Europe/Rome, tous modes confondus. Une réussite ne fait progresser la consolidation que sans indice utilisé pour cette tentative et sans correction de cet item consultée le même jour. Le passage d’un mode à l’autre ne contourne pas cette règle.
- Une réponse libre en attente de correction est conservée avec un état explicite. Elle ne compte ni comme réussite ni comme erreur, ne modifie pas la consolidation et suspend la répétition automatique de l’item pendant l’attente. Le verdict du professeur est rattaché à cette tentative précise avant de programmer la suite.
- Une auto-évaluation de flashcard reste enregistrée et consultable mais ne fait pas progresser le compteur des trois réussites ni ne repousse l’échéance de consolidation. Le mode « Traduire », avec réponse saisie et vérifiée sans aide, peut faire progresser ce suivi.
- Une variante possède son propre historique et son propre suivi. Sa réussite apporte une information sur la notion sans effacer les erreurs de l’item d’origine ni valider automatiquement celui-ci ; elle peut compléter sa révision.
- Pour une réponse libre corrigée tardivement, un résultat correct programme l’échéance depuis la réponse initiale ; une échéance déjà dépassée rend l’item dû. Un résultat incorrect ou partiel programme la prochaine révision au lendemain de la mise à disposition de la correction. Les dates de réponse et de correction restent distinctes.
- Le budget quotidien est estimé à partir des items effectués : 15 secondes par flashcard, 30 secondes par QCM, trou ou traduction, et 3 minutes par réponse libre. Ces durées sont ajustables ; le temps d’ouverture d’un onglet ne constitue pas une mesure de travail et le budget ne bloque pas la pratique volontaire. Les durées flashcard, trou et traduction ont été corrigées par l’utilisateur ; celle des QCM reste à la valeur proposée.
- Si le professeur reconnaît qu’un corrigé était erroné, son effet sur le suivi peut être neutralisé. Le verdict initial et sa rectification restent consultables ; la rectification ne crée pas de réussite indépendante fictive.
- Si un item d’une séance déjà publiée est réussi en entraînement libre le même jour et que sa prochaine échéance est future, l’élève peut le passer avec la mention « Déjà révisé aujourd’hui ». Le contenu publié reste intact, aucune tentative supplémentaire n’est inventée et une nouvelle tentative volontaire reste possible.
- Si le travail quotidien suggéré a déjà été effectué, la routine du professeur peut terminer sans nouvelle séance avec le résultat explicite « Objectif quotidien déjà rempli ». C’est une exception à l’exigence de publication systématique ; si une publication nécessaire échoue, le résultat reste un échec.
- Les états pédagogiques visibles sont « À évaluer » (aucun résultat vérifié), « À retravailler » (erreur sans réussite indépendante depuis), « En consolidation » (réussite indépendante sans atteindre le seuil) et « Consolidé » (trois réussites aux échéances prévues). « Révision due » et « En attente de correction » sont des indications distinctes ; une réponse en attente ne change pas l’état pédagogique précédent.
- Une première réponse correcte et indépendante à un item nouveau le place « En consolidation » avec une première échéance le lendemain. Cette première réponse ne compte pas parmi les trois réussites espacées : celles-ci sont attendues à J1, J4 et J11 si le calendrier est suivi.
- La migration conserve toutes les anciennes réponses et corrections. Quand l’usage d’une aide n’était pas enregistré, il reste inconnu et aucune réussite indépendante n’est créditée. Les erreurs connues alimentent le carnet ; les réussites restent visibles sans créer de consolidation non démontrée. Aucun ancien item n’est fusionné automatiquement, même en présence de doublons.
- Une nouvelle version qui change réellement la tâche ou la réponse attendue repart « À évaluer », tout en conservant les versions précédentes et leur historique. Une simple coquille conserve le suivi. Une rectification de corrigé erroné suit le mécanisme historisé de neutralisation décrit plus haut.

## Architecture proposée

Conserver Next.js, SQLite et le serveur MCP existants. Le vocabulaire est défini dans [GLOSSARY.md](../GLOSSARY.md) ; les noms historiques des tables et des champs publics peuvent être conservés pour assurer la compatibilité.

| Élément | Responsabilité |
| --- | --- |
| Notion | Identité pédagogique stable, libellé et liens explicites avec les items. |
| Exercice de banque | Regroupement ordonné d’items, consigne et contexte commun ; distinct d’une séance. |
| Item de banque | Identité stable de la question, liens vers les notions et, le cas échéant, l’item d’origine d’une variante. |
| Version d’item | Énoncé, consigne et contexte nécessaires, type, choix, réponses acceptées et explication figés pour restituer la question exacte. |
| Composition de séance ou de série | Occurrences ordonnées des versions sélectionnées, regroupées en exercices ; permet de sélectionner un sous-ensemble d’items. |
| Tentative commune | Réponse enregistrée, item et version, contexte professeur ou libre, dates, résultat et informations sur l’aide avant la soumission. |
| Correction et rectification | Verdicts rattachés à une tentative ; une rectification ajoute une trace au lieu d’effacer le verdict initial. |
| Suivi de révision | État, palier, série de réussites, prochaine date et éventuelle attente de correction pour l’élève et la version pédagogique de l’item. |

### Préserver les contrats existants

- Réutiliser les lignes actuelles de `exercises` comme occurrences de séance figées, en leur ajoutant les références à la banque et à la version. Conserver leurs identifiants et `group_id` ; ne pas renommer globalement tous les champs `exercise_id` pour ce chantier.
- Conserver les snapshots de `practice_questions`. Leur ajouter les références de banque sans reconstruire leur contenu depuis la version courante.
- Remplacer les deux chemins de stockage des réponses par un historique commun, en préservant les identifiants et la provenance de toutes les tentatives existantes. Les adaptateurs API et MCP continuent de servir les contrats historiques pendant cette évolution.
- Supprimer la restriction d’une seule tentative par item et série. Plusieurs réponses successives sont possibles, chacune avec sa propre identité ; une répétition réseau avec le même identifiant reste une seule tentative.
- Conserver les outils MCP existants. Ajouter les opérations nécessaires pour chercher les items par notion, lire erreurs et révisions dues, créer un exercice ou une variante, composer et modifier un brouillon à partir de références, et rectifier un verdict. Les détails des schémas doivent suivre les formes déjà présentes dans le projet.
- Une création ou mutation rejouée avec la même clé et le même contenu retourne le même résultat ; une clé réutilisée pour une autre demande est refusée. Après publication, relire la séance et vérifier son état effectif.
- Les mutations professeur restent réservées au MCP. Préserver les contrôles d’origine des routes élève et la dissimulation des corrigés avant réponse ou révélation.

### Un seul calcul du suivi

Le serveur possède une fonction déterministe de révision, appelée par les deux modes dans la même transaction que l’enregistrement de la tentative ou du verdict. Les règles reçoivent une date explicite pour être testées sans attendre plusieurs jours. Les instants sont conservés en UTC et les échéances en dates civiles Europe/Rome ; ajouter un jour civil ne signifie pas ajouter systématiquement 24 heures.

La première réponse indépendante correcte lance le palier de 1 jour sans créditer de réussite espacée. Les trois échéances suivantes réussies donnent successivement les intervalles de 3, 7 et 14 jours ; les réussites suivantes donnent 30 jours, puis restent à 30 jours. Une erreur ou réponse partielle remet la série à zéro et l’intervalle à 1 jour, sous réserve de la règle spécifique aux corrections différées.

Une réussite assistée reste une tentative d’entraînement : elle ne fait pas avancer le palier, ne crédite pas la série et ne repousse pas l’échéance déjà fixée au lendemain après une erreur. Une tentative volontaire anticipée ne fait pas avancer le palier réservé aux révisions à échéance. Une réponse incorrecte reste prise en compte même en pratique volontaire.

L’application conserve les révélations de correction et les aides utilisées entre les modes et les rechargements. L’éligibilité d’une tentative est figée selon les informations disponibles **avant sa soumission** : afficher le corrigé après une bonne réponse n’invalide pas rétroactivement celle-ci. Ne pas prétendre détecter une consultation extérieure ni reconstituer les aides inconnues de l’ancien historique.

Un changement pédagogique ouvre un nouveau cycle pour la nouvelle version ; les anciennes tentatives ne font pas progresser ce cycle. Une coquille peut conserver explicitement le cycle existant. Une rectification neutralise le verdict erroné et recalcule ses conséquences sans attribuer de réussite indépendante par défaut.

### Carnet, sélection et budget

Le carnet est une vue de l’historique et du suivi : une entrée par item concerné, avec les tentatives erronées ou partielles, leur correction, la dernière erreur, l’état et la prochaine date. Les tentatives restent toutes consultables ; les items consolidés quittent les urgences mais pas l’historique. Prévoir les filtres notion, date et état, ainsi que le lancement d’une révision sur la sélection.

Les deux modes partagent les priorités : révisions dues, erreurs actives et difficultés récurrentes, consolidation et variantes, puis nouveautés en quantité limitée par le budget restant. L’état « À retravailler » ne contourne pas à lui seul une échéance future ; le nouvel essai après correction constitue la répétition immédiate prévue. Le professeur garde sa latitude pédagogique et crée du contenu lorsque la banque ne suffit pas.

Le budget suggéré est estimé à partir des tentatives effectuées le jour local et de leur mode : 15 secondes pour une auto-évaluation de flashcard, 30 secondes pour un QCM, un trou ou une traduction, 3 minutes pour une réponse libre. La traduction d’une flashcard vaut donc 30 secondes. Un appel idempotent rejoué, une révélation seule et un item passé parce que déjà révisé n’ajoutent pas de travail fictif. Une véritable nouvelle tentative constitue du travail, même si elle est assistée ou en attente de correction.

Les séances publiées restent figées. Leur affichage peut indiquer qu’un item a déjà été révisé aujourd’hui et permettre de le passer sans inventer de réponse dans cette séance. Si le budget quotidien suggéré est déjà rempli, la routine dispose du résultat vérifiable « Objectif quotidien déjà rempli », distinct d’une publication réussie et d’un échec technique.

## Plan de migration et d’implémentation

### 1. Sauvegarder et caractériser

- Avant toute migration réelle, arrêter les processus qui utilisent SQLite et sauvegarder le dossier de données entier avec la version du code correspondante. SQLite est actuellement en mode WAL : une copie isolée du seul fichier principal à chaud n’est pas une sauvegarde cohérente.
- Travailler d’abord sur une copie isolée avec `ITALIANO_DB_PATH`. Relever les nombres et identifiants de séances, items, tentatives, séries, snapshots et corrections ; comparer leur contenu après migration.
- Vérifier les versions de schéma et les clés étrangères. Ne pas ouvrir la base personnelle pour une suite de tests.

### 2. Introduire les identités et les versions

- Créer les entités de banque et leurs références sans supprimer les données historiques. Un ancien item de séance donne un item de banque distinct, avec sa version initiale et son identifiant d’origine traçable ; les groupes explicites donnent les exercices correspondants.
- Relier les snapshots de pratique à leur `question_id` d’origine quand ce lien existe. Des snapshots différents restent des versions historiques distinctes : ne pas les remplacer par l’énoncé ou le corrigé courant.
- Conserver les anciens objectifs textuels. Ne pas leur inventer une notion précise lorsqu’ils sont absents ou ambigus ; le professeur peut compléter les liens pédagogiques.
- Ne pas dédupliquer les anciens items par similarité ou par hash. Le professeur réutilise ensuite explicitement les identités de banque dans les nouvelles séances.

### 3. Unifier les tentatives sans réécrire le passé

- Copier ou transformer transactionnellement les deux historiques vers le stockage commun, en conservant les identifiants, dates, réponses enregistrées, verdicts, corrections, contextes et références de version. Vérifier qu’aucune ligne source n’est perdue ou importée deux fois.
- Les QCM de séance stockent l’identifiant original du choix, tandis que ceux de pratique stockent son index sous forme de chaîne. Conserver la valeur brute et résoudre le choix avec le snapshot et le mode d’origine ; ne pas convertir toutes les réponses selon une règle unique.
- Les anciens validateurs appliquent déjà `.trim()` : les espaces périphériques perdus ne peuvent pas être récupérés. Les nouvelles tentatives doivent conserver la réponse saisie et utiliser une valeur séparée pour la validation et la comparaison.
- L’ancien `elapsed_ms` est le temps écoulé depuis le début de la série, pauses incluses. Le conserver comme donnée historique, sans l’assimiler à un temps actif individuel ni l’utiliser pour créditer le budget.
- L’aide historique reste « inconnue ». Importer les erreurs et les réponses en attente, sans déduire de réussite indépendante ni de consolidation. Les anciens succès sont visibles mais ne suffisent pas à qualifier le nouveau cycle ; l’affichage doit expliquer cette réévaluation. Pour ces items, « À évaluer » signifie qu’aucun résultat vérifié admissible au nouveau cycle n’est encore disponible, et non que l’ancien historique est vide.
- Les échéances initiales calculées à la migration doivent être identifiées comme telles, avec la date d’import. Ne pas les présenter comme d’anciennes échéances effectivement observées ; les erreurs anciennes admissibles à la révision sont sélectionnées selon le budget, sans tout imposer le premier jour.

### 4. Brancher les deux modes et le professeur

- Implémenter le calcul commun, le suivi persistant des aides, les réponses multiples, les corrections différées et les rectifications.
- Brancher le carnet, la sélection ciblée et les indications de progression dans les composants existants. Utiliser les utilitaires Tailwind dans le JSX conformément à `AGENTS.md`.
- Étendre les outils MCP et la gestion des brouillons en conservant les signatures historiques compatibles. Adapter les fixtures et tests dépendant de la sélection par groupes entiers, de la déduplication automatique et de la réponse unique par série.
- Ajouter les révisions d’items calculées par l’application aux écrans existants. Le calendrier thématique Hermes reste une source distincte en lecture seule ; ses dates ne doivent pas devenir une deuxième autorité pour les échéances d’items.
- Fournir séparément les modifications à apporter aux routines Hermes : sélection depuis la banque, budget commun, résultat « Objectif quotidien déjà rempli », publication idempotente et vérification du livrable. Ne modifier ni profils ni crons pendant ce chantier.

### 5. Vérifier puis basculer

- Exécuter le parcours complet sur la copie isolée, puis vérifier qu’une seconde ouverture ou migration ne crée aucun doublon. Comparer les données historiques et exécuter les contrôles de clés étrangères et d’intégrité SQLite.
- Faire la sauvegarde finale à l’arrêt, migrer, puis redémarrer l’application et le MCP avec la même version du code et la même base. Vérifier les anciennes séances et une nouvelle tentative avant de considérer la bascule terminée.
- En cas d’échec avant remise en service, restaurer ensemble le code et la sauvegarde cohérente. Si de nouvelles données ont déjà été créées après bascule, les préserver avant restauration : un retour à la sauvegarde seule les perdrait.

## Validation prévue

Réutiliser les suites existantes de base de données, exercices groupés, QCM, API, MCP et navigateur. Les commandes du projet sont `npm test`, `npm run test:mcp`, `npm run lint`, `npx tsc --noEmit`, `npm run build -- --webpack` et la suite navigateur isolée documentée dans le README.

Les tests de règles utilisent une horloge contrôlée. Le navigateur vérifie réellement le parcours élève et la visibilité des résultats ; il ne remplace pas les tests de dates et de migration.

- Parcours initial : erreur, carnet avec réponse et correction, nouvel essai après trois autres items, réussite assistée sans progression, réussites indépendantes à J1/J4/J11, consolidation, maintien de l’historique, puis rechute.
- Première réponse correcte à un item nouveau : échéance à J1 et zéro réussite espacée créditée à J0.
- Réponses multiples sans écrasement, répétition réseau idempotente et refus d’une même clé pour des contenus différents.
- Même item dans les deux modes, révélation persistante entre onglets ou rechargements, au plus une progression par jour et passage d’un item publié sans tentative inventée.
- Variante indépendante, nouvelles versions pédagogiques et coquilles sans mélange des historiques.
- Réponse libre en attente, correction tardive correcte ou incorrecte, rectification d’un verdict et neutralisation de ses conséquences.
- Dates Europe/Rome, changement d’heure, échéances dépassées, paliers plafonnés à 30 jours, et absence de répétition automatique avant échéance.
- Budget avec les durées validées, pratique libre déjà effectuée et routine sans publication lorsque l’objectif est rempli.
- Migration répétable conservant identifiants, snapshots, réponses QCM des deux modes et corrections ; aides inconnues sans consolidation inventée ; restauration vérifiée.
- Routes élève conservant leurs protections et ne révélant pas les corrigés avant la réponse ou la révélation autorisée.

## Limites et suites exclues

Pas de badge automatique de maîtrise d’une notion dans cette première version : les résultats par notion et sur les variantes restent consultables. Pas de nouvel algorithme adaptatif, de déduplication sémantique automatique, de mesure de présence dans l’onglet ni de détection d’une aide extérieure. Les imports de vocabulaire et leurs auto-évaluations historiques sont conservés ; ils ne deviennent pas des réussites objectives par conversion implicite.

Les détails internes de noms de tables ou de fonctions peuvent être ajustés pendant l’implémentation sans modifier les règles confirmées. Toute impossibilité de préserver les données ou les contrats doit être signalée avant une migration réelle.

## État de la vérification

L’implémentation et ses vérifications sont décrites dans [IMPLEMENTATION_REVISION_REPORT.md](IMPLEMENTATION_REVISION_REPORT.md). Les étapes de migration ci-dessus restent des consignes de bascule : les tests ont utilisé des bases isolées, sans déclencher la migration de la base personnelle ni modifier les profils ou crons Hermes.

## État initial constaté avant implémentation

Le code distingue déjà les items par leur identifiant et regroupe ceux d’un exercice avec `group_id`, mais emploie aussi le nom `exercises` pour les items. La sélection initiale de l’entraînement libre reprenait des groupes entiers : elle peut donc faire revenir des items réussis avec un item en difficulté.

La routine quotidienne documentée dans `automation/daily-prof.md` demande actuellement 32 items pour 20 à 30 minutes. Son adaptation au budget retenu devra être fournie séparément ; aucun profil ni cron Hermes n’est modifié pendant cet entretien.

Fichiers examinés : [schéma et migrations](../src/server/database.mjs), [séances et corrections](../src/server/domain.ts), [entraînement libre](../src/server/practice.ts), [outils professeur](../src/server/mcp.ts), [routes élève](../src/app/api/%5Baction%5D/route.ts). La décision sur l’identité et les versions est conservée dans [ADR 0001](adr/0001-identite-et-historique-des-items.md).
