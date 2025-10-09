# Cartographie et architecture de la recherche

## Bases de données et tables indexées

| Base | Tables | Colonnes interrogées (principales) |
|------|--------|-------------------------------------|
| `autres` | `profiles` | `first_name`, `last_name`, `phone`, `email`, `comment`, `division_id`, champs additionnels détectés automatiquement (identifiants)【F:server/config/tables-catalog.js†L2-L22】 |
| `esolde` | `mytable` | `matricule`, `nomprenom`, `cni`, `telephone`【F:server/config/tables-catalog.js†L24-L38】 |
| `rhpolice` | `personne_concours` | `prenom`, `nom`, `date_naiss`, `lieu_naiss`, `sexe`, `adresse`, `email`, `telephone`, `cni`, `prenom_pere`, `nom_pere`, `nom_mere`【F:server/config/tables-catalog.js†L40-L57】 |
| `renseignement` | `agentfinance` | `MATRICULE`, `PRENOM`, `NOM`, `CORPS`, `EMPLOI`, `COD_SECTION`, `SECTION`, `COD_CHAPITRE`, `CHAPITRE`, `POSTE`, `DIRECTION`【F:server/config/tables-catalog.js†L59-L74】 |
| `rhgendarmerie` | `personne` | `matricule`, `prenom`, `nom`, `carteidentite`, `tel`, `email`, `adresse`, `pere`, `mere`【F:server/config/tables-catalog.js†L76-L92】 |
| `permis` | `tables` | `NumeroPermis`, `Prenoms`, `Nom`, `Numeropiece`, `Categorie`, `LieuNaissance`, `DateObtention`, `DateNaissance`【F:server/config/tables-catalog.js†L94-L109】 |
| `expresso` | `expresso` | `numero`, `prenom`, `nom`, `cni`, `date_creation`, `datefermeture`【F:server/config/tables-catalog.js†L111-L123】 |
| `elections` | `bambey`, `dagana`, `dakar`, `diourbel`, `fatick`, `guediawaye`, `guinguineo`, … | `numero_electeur`, `prenoms`, `nom`, `CNI`, `lieunaiss`, `datenaiss` (mêmes colonnes pour chaque table départementale)【F:server/config/tables-catalog.js†L125-L216】 |

Les colonnes « searchable » sont enrichies automatiquement par l'API avec les identifiants détectés (`phone`, `cni`, `matricule`, etc.), ce qui permet de couvrir tous les champs susceptibles d'être interrogés par les analystes.【F:server/services/SearchService.js†L401-L451】【F:server/utils/search-helpers.js†L1-L63】

## Schéma d'indexation Elasticsearch

- Les index sont générés à partir du catalogue via `ElasticSearchService.buildIndexDefinition`, qui crée des mappings dynamiques pour chaque colonne SQL (champs `columns.*`) et ajoute des poids (`column_weights`) afin de booster les identifiants (`phone`, `email`, `matricule`, etc.).【F:server/services/ElasticSearchService.js†L210-L316】【F:server/services/ElasticSearchService.js†L320-L399】
- Les documents contiennent :
  - un prévisualisation normalisée (`preview`),
  - les valeurs normalisées (`raw_values`, `full_text`),
  - les suggestions d'autocomplétion (`suggestions`),
  - les valeurs filtrables (`filter_values`) utilisées pour les facettes.【F:server/services/ElasticSearchService.js†L240-L307】【F:server/services/ElasticSearchService.js†L308-L399】
- Les requêtes utilisent un `multi_match` pondéré sur `columns.<colonne>` ainsi que des filtres booléens et des agrégations de facettes. L'autocomplétion est servie via le champ `suggestions` de type `completion`.【F:server/services/ElasticSearchService.js†L954-L1071】

## Pipeline d'indexation

1. **Chargement initial** :
   - `npm run create-indexes` crée les index SQL pour accélérer les requêtes full-text locales.【F:server/scripts/create-search-indexes.js†L43-L93】
   - `npm run sync` lit les tables définies dans `tables-catalog.js` et pousse les documents vers Elasticsearch via `SyncService`. Chaque lot applique le mapping décrit ci-dessus.【F:server/services/SyncService.js†L108-L207】
2. **Capture des changements (CDC)** :
   - La table `autres.search_sync_events` enregistre les inserts/updates/deletes via des triggers générés par `npm run search:setup-triggers`.【F:server/config/database.js†L621-L633】【F:server/scripts/setup-search-triggers.js†L1-L86】
   - Le worker `IncrementalSyncService` lit cette queue et met à jour Elasticsearch (`npm run sync:incremental` ou `ENABLE_INCREMENTAL_SYNC=true`).【F:server/services/IncrementalSyncService.js†L1-L119】【F:server/app.js†L109-L157】
3. **Vérification** : `npm run search:verify` compare les volumes entre MySQL et Elasticsearch et échoue si une divergence est détectée.【F:server/scripts/verify-search-sync.js†L1-L62】

## Fallback SQL

Si Elasticsearch est désactivé ou indisponible, l'API bascule automatiquement sur le moteur SQL local (`SearchService`). Les scores SQL réutilisent les mêmes pondérations pour garantir une pertinence homogène (boosts sur identifiants et champs clés).【F:server/routes/search.js†L31-L96】【F:server/services/SearchService.js†L389-L468】

## Procédures d'exploitation

- **Initialisation** : `npm run search:bootstrap` (index SQL + synchronisation complète).
- **Resynchronisation** : relancer `npm run sync` pour recharger un index, puis `npm run sync:incremental` pour rejouer les changements accumulés.
- **Rollback** : en cas de données corrompues, purger l'index via `SyncService.resetIndex` (appelé automatiquement avant un `sync`) puis réexécuter le chargement initial.【F:server/services/SyncService.js†L150-L199】
- **Monitoring** : surveiller le backlog `autres.search_sync_events` et la santé Elasticsearch (`ElasticSearchService.verifyConnection`). Des métriques à exposer : nombre d'évènements en attente, durée de traitement d'un lot, temps de réponse des recherches, statut du cluster Elasticsearch.【F:server/services/ElasticSearchService.js†L56-L177】【F:server/services/IncrementalSyncService.js†L1-L119】
