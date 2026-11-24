# Migration V7 — compatibilité des anciennes banques V6

## Cause et changement

Une première variante du schéma V6 ne contenait pas `bank_items.available`.
La présence de la migration 6 ne suffisait donc pas à garantir le schéma attendu
par `get_daily_plan` / `get_error_journal` (`dailyPlan` / `journal`).

`openDatabase` applique désormais une migration **additive 7**, sans rejouer V6 :

- si `available` manque, ajout `INTEGER NOT NULL DEFAULT 0 CHECK(available IN (0,1))` ;
- passage à 1 uniquement pour les items référencés par une séance publiée, un
  snapshot de pratique historique ou une tentative de contexte `practice` ;
- les brouillons seuls et les items sans preuve d'exposition restent à 0 ;
- si la colonne existe déjà, aucune valeur n'est recalculée : un item masqué reste
  masqué, même s'il figure dans une séance publiée. Les créations autonomes déjà
  disponibles restent disponibles ;
- les nouvelles créations via l'API de banque continuent à fournir explicitement
  leur disponibilité. Le schéma V6 actuel des bases neuves (défaut 1) est conservé.

Ni les IDs, ni les versions, ni les réponses, ni les dates de séances et de
révision ne sont réécrits. La migration et son inscription sont dans la même
transaction `BEGIN IMMEDIATE`. Le contrôle des clés étrangères précède le commit.
Une erreur annule aussi l'ajout de colonne ; la version reste inchangée.

## Sauvegarde et restauration

Avant toute migration d'une base déjà versionnée qui n'a pas encore V7,
`VACUUM INTO` crée un snapshot SQLite cohérent, incluant les écritures WAL déjà
validées. Le fichier est réservé exclusivement avec le mode `0600` **avant**
d'écrire des données. Un échec de sauvegarde empêche le démarrage de la migration.

- Depuis V6 : `<base>.before-availability-<horodatage>-<uuid>.sqlite`.
- Depuis une version antérieure : nom existant `before-bank`, une seule sauvegarde
  couvrant l'ensemble de la montée de version.
- Base neuve : pas de sauvegarde préalable inutile.
- Réouverture après migration réussie : pas de nouvelle sauvegarde ni réimport.

Pour restaurer, arrêter **tous** les lecteurs et écrivains de cette base, conserver
séparément la base courante et ses éventuels fichiers `-wal` / `-shm`, puis copier
la sauvegarde vers un **nouveau chemin**, sans fichiers auxiliaires préexistants.
Contrôler ce fichier avec SQLite brut (`PRAGMA integrity_check`,
`PRAGMA foreign_key_check`, `SELECT MAX(version) FROM schema_migrations`) avant de
le sélectionner. Ne pas appeler `openDatabase` pour inspecter la version restaurée :
il la migrerait à nouveau. Ne pas copier une base active avec son WAL séparément.

## Vérification isolée

Les fixtures sont entièrement synthétiques ; aucune donnée personnelle n'est
nécessaire. Elles couvrent V6 ancienne et actuelle, brouillons, séances publiées,
pratique historique, création autonome, réponses et calendrier, sauvegarde avec
connexion WAL encore ouverte, restauration, répétabilité, échec après `ALTER TABLE`
et refus des références invalides.

```sh
sh scripts/node.sh --import tsx --test tests/availability-migration.test.ts tests/bank-migration.test.ts
npm test
npm run test:mcp
npx tsc --noEmit --incremental false
npm run lint
```

Les tests MCP démarrent uniquement leur sous-processus stdio isolé, pas le serveur
web de production. Les répertoires SQLite de test sont supprimés en fin de test.
