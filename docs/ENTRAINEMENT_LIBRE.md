# Entraînement libre et banque d’items

La banque possède des identifiants stables, indépendants des séances. Un exercice regroupe des items ; chaque item possède ses versions, ses tentatives et son suivi. Les séances et séries conservent la question réellement présentée. Une variante est un autre item, lié à son origine et aux notions concernées.

La sélection se fait par item, avec sa consigne et le contexte nécessaire, sans imposer de refaire tout l’exercice. Les brouillons créés avec l’ancien `create_session` et les démonstrations restent exclus de la banque élève tant qu’ils ne sont pas publiés comme contenu professeur. Un exercice créé directement dans la banque est réutilisable sans dépendre d’une séance ; le rattacher à un brouillon ne doit pas le masquer.

## Parcours élève

Dans Entraînement libre, lancer une série suggérée pour retrouver les révisions dues, puis les difficultés et les nouveautés disponibles dans le budget restant. Les séries suggérées introduisent au maximum cinq items sans échéance. La pratique volontaire permet de refaire des items avant leur échéance ou au-delà du budget ; elle ne fait pas avancer les paliers de consolidation avant la date prévue.

Les trous, QCM et traductions sont vérifiés côté serveur. Les réponses libres attendent le professeur et ne sont pas proposées automatiquement pendant cette attente. Les flashcards conservent un mode Mémoriser dont l’auto-évaluation ne vaut pas réponse vérifiée.

Après une erreur, un nouvel essai automatique est proposé après trois autres items distincts, au maximum une fois dans cette séance ou série. S’il reste trop peu d’items, la prochaine révision reste prévue le lendemain. Une nouvelle tentative n’écrase jamais la précédente. Une reprise après rechargement retrouve les réponses enregistrées.

Le carnet d’erreurs affiche la réponse originale enregistrée, la question présentée, la correction, l’explication, le contexte et l’historique. Les filtres portent sur la notion, la date de l’erreur et l’état. « À suivre » exclut les items consolidés ; « Tout l’historique » les conserve. Une révision des items affichés reste possible. La consultation des corrigés est enregistrée : une réussite qui suit cette consultation le même jour ne prouve pas une consolidation indépendante.

## Règles communes aux deux modes

Les états sont À évaluer, À retravailler, En consolidation et Consolidé. Les mentions « Révision due » et « En attente de correction » sont distinctes de ces états.

Une première réussite indépendante lance une révision à J1 sans créditer de réussite espacée. Les réussites aux échéances J1, J4 et J11 consolident l’item ; les intervalles suivants sont 14 puis 30 jours, plafonnés à 30 jours. Une erreur ou une réponse partielle remet la série à zéro et raccourcit l’échéance à un jour. Les dates sont civiles, en Europe/Rome.

Une réussite indépendante requiert une réponse vérifiée sans aide pour cette tentative ni correction de cet item consultée avant la réponse le même jour. Au maximum une progression par item et par jour, tous modes confondus. Une réussite après correction est enregistrée sans faire avancer le palier. Le professeur ne choisit pas librement les échéances.

Une correction libre tardive correcte programme la suite depuis la date de la réponse ; une échéance dépassée rend l’item dû. Une correction tardive incorrecte ou partielle programme le lendemain de sa mise à disposition. Un verdict erroné peut être neutralisé avec une rectification historisée, sans inventer de réussite.

Le budget suggéré de 35 minutes additionne le travail des deux modes : 15 s par auto-évaluation de flashcard, 30 s par QCM, trou ou traduction, 3 min par réponse libre. Une répétition réseau ne compte pas deux fois et un onglet ouvert ne constitue pas du travail. Si le budget est rempli, la routine peut signaler « Objectif quotidien déjà rempli ». Une séance publiée peut signaler un item déjà révisé aujourd’hui et permettre de le passer sans inventer de tentative.

Les anciennes révisions de vocabulaire importées et leurs notes sont conservées comme suivi mémoire distinct. Elles ne deviennent pas des réussites objectives. Les anciennes aides inconnues restent inconnues ; aucun ancien succès ne crée automatiquement une consolidation.

## Migration et retour arrière

La migration 6 ajoute la banque, les versions, l’historique commun, les révélations de correction et le suivi. Les anciens IDs, réponses, corrections et snapshots sont conservés, sans fusion automatique des items. Les tables `attempts` et `practice_attempts` deviennent des archives historiques ; les nouvelles écritures passent par `learning_attempts`.

Avant la bascule réelle, arrêter l’application et le MCP, sauvegarder le dossier `data` entier et garder le code correspondant. À l’ouverture d’une base déjà versionnée qui n’a pas encore la migration 6, le serveur crée aussi une sauvegarde SQLite cohérente par `VACUUM INTO`, nommée `<base>.before-bank-<date>-<uuid>.sqlite`, avant la transaction. Une migration qui échoue est annulée.

Pour revenir en arrière, arrêter les processus et restaurer ensemble l’ancien code et une sauvegarde cohérente. Ne pas retirer uniquement l’entrée de migration ou des colonnes. Les données créées après la sauvegarde doivent être préservées avant restauration ; la restauration seule ne les conserve pas.

Les QCM historiques stockaient un identifiant de choix en séance et un index en entraînement : les deux valeurs brutes sont conservées et interprétées selon leur snapshot. Les anciens espaces périphériques supprimés par `.trim()` ne peuvent pas être récupérés. Les nouvelles réponses conservent leur saisie brute. L’ancien `elapsed_ms` est conservé sans être interprété comme une durée active individuelle.

Les tests emploient `ITALIANO_DB_PATH` et un serveur isolés. Ne jamais pointer la suite navigateur vers la base personnelle. Voir [le document de conception](archive/REVISION_DESIGN.md), [les changements Hermes séparés](HERMES_BANK_CHANGES.md) et [le bilan](archive/IMPLEMENTATION_REVISION_REPORT.md).
