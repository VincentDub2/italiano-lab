# Changements Hermes à appliquer séparément

Aucun profil, cron, script de détecteur ou canal de notification n’est modifié par cette implémentation. Les horaires et jobs décrits dans l’ancienne documentation n’ont pas été revérifiés sur Hermes pendant ce chantier.

## Profil professeur et liste d’outils

Redémarrer le serveur MCP avec le nouveau code et redécouvrir `tools/list`. Garder les huit outils historiques et autoriser les huit outils supplémentaires : `search_bank`, `create_bank_exercise`, `compose_session`, `update_draft`, `revise_item`, `rectify_feedback`, `get_daily_plan`, `get_error_journal`. L’application et le MCP doivent viser la même base locale ; ne pas configurer le chemin de la base temporaire des tests dans le profil.

Remplacer les consignes quotidiennes de génération intégrale par [daily-prof-bank.md](../automation/daily-prof-bank.md). Le fichier [daily-prof.md](../automation/daily-prof.md) est conservé comme ancienne consigne et ne doit plus servir de modèle de volume fixe après bascule.

Pour les constructions de phrases, recharger les schémas MCP et la consigne [correct-prof.md](../automation/correct-prof.md). Les mêmes outils acceptent désormais le type `sentence` et les retours par réplique. Le [contrat de création et de correction](PROF_INTEGRATION.md#construction-de-phrases) donne les champs et les cinq formats.

Le profil doit distinguer trois résultats : séance publiée et relue, objectif quotidien déjà rempli d’après le serveur, ou échec. La seule production d’un message final ne valide pas une publication. Les clés quotidiennes restent `italiano-daily-YYYY-MM-DD` ; chaque autre mutation possède une clé stable distincte.

## Corrections et détecteur

Garder le traitement des réponses en attente, puis relire chaque tentative après `submit_feedback`. Le professeur peut maintenant recevoir une réponse libre issue de l’entraînement libre : la cible reste l’identifiant de tentative donné par le serveur.

Ajouter la consigne suivante : « Un verdict déjà enregistré ne s’écrase pas. Si le corrigé est erroné, utiliser `rectify_feedback`, relire `get_attempt` et vérifier `neutralized=true`. Le verdict initial reste consultable et aucune réussite indépendante n’est inventée. »

Le détecteur documenté ne relance actuellement pas un lot dont les IDs sont inchangés après un échec de l’agent. Lors de son adaptation séparée, ne considérer le lot comme traité qu’après relecture des résultats attendus ; conserver les IDs non traités pour un nouvel essai, et garder le rattrapage quotidien. Une correction réussie d’une partie du lot ne doit pas masquer un échec sur le reste.

## Calendrier et vérification après installation

Ne plus écrire les échéances d’items dans `revisions.json` : elles sont calculées par l’application. Le calendrier thématique existant demeure distinct et lu sans modification.

Sur un jeu de test isolé, vérifier que le professeur réutilise un item connu avec `compose_session`, modifie seulement un brouillon, publie et relit le résultat. Vérifier aussi le résultat sans publication lorsque `get_daily_plan.outcome` vaut `daily_complete`, et une erreur de publication réellement signalée. Ces vérifications d’installation Hermes restent à effectuer après application des consignes ; les tests MCP locaux sont déjà décrits dans le bilan d’implémentation.

Pour vérifier les phrases, publier un item guidé, révéler un indice et soumettre une phrase valide qui diffère de l’exemple privé. Vérifier la réponse en attente, le verdict lu avec `get_attempt` puis les deux tentatives après reformulation. Pour un dialogue, vérifier aussi que le retour contient une explication pour chaque réplique.
