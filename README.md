# Plateforme SORA

Ce dépôt contient l'application SORA (interface web et serveur Node.js) utilisée pour la gestion des profils, des demandes d'identification, des recherches transverses et des notifications internes.

## Prérequis

- Node.js 18+
- Une instance MySQL accessible
- (Optionnel) Un cluster ElasticSearch si la recherche temps réel est activée (`USE_ELASTICSEARCH=true`)

## Installation

```bash
npm install
```

Copiez ensuite vos paramètres sensibles (connexion MySQL, clés JWT, etc.) dans un fichier `.env` basé sur `.env.example`.

### Variables d'environnement de sécurité

- `JWT_SECRET` : clé secrète **obligatoire** pour signer les jetons JWT. Utilisez une valeur aléatoire robuste (32 caractères ou plus). En développement, un secret temporaire est généré automatiquement si la variable est absente, mais ne vous reposez pas dessus pour la production.
- `CORS_ALLOWED_ORIGINS` : liste séparée par des virgules des URL autorisées à appeler l'API via CORS. Ajoutez ici les domaines de vos front-ends autorisés.
- `PAYLOAD_ENCRYPTION_KEY` : clé AES-256 encodée en base64 utilisée par l'API pour déchiffrer les requêtes JSON chiffrées par le front.
- `VITE_PAYLOAD_ENCRYPTION_KEY` : copie côté client (toujours préfixée `VITE_`) de la même clé AES-256 encodée en base64 ; elle est injectée par Vite lors du build pour chiffrer les payloads sortants.

### Rotation de la clé de chiffrement des payloads

1. Générer une nouvelle clé aléatoire de 32 octets et l'encoder en base64 :

   ```bash
   openssl rand -base64 32
   ```

2. Mettre à jour simultanément `PAYLOAD_ENCRYPTION_KEY` et `VITE_PAYLOAD_ENCRYPTION_KEY` avec la valeur générée.
3. Redémarrer le serveur et relancer le build du front (`npm run build` ou `npm run dev`) pour prendre en compte la nouvelle clé.
4. Vérifier manuellement une requête critique (ex. `/api/auth/login`) en observant le header `X-Encrypted: aes-gcm` côté client et la bonne réception côté API.

## Lancement

- **API** : `npm run server`
- **Interface web** : `npm run dev`

Les deux commandes peuvent être exécutées en parallèle pendant le développement.

### Debug SQL

Définissez `DB_LOG_QUERIES=true` (ou `1`) dans votre `.env` pour afficher toutes les requêtes MySQL et leurs paramètres dans le terminal lors des appels à l'API.

## Scripts utiles

- `npm run build` : génère la version de production du front-end.
- `npm run lint` : exécute les vérifications lint/formatting.
- `node server/scripts/init-database.js` : crée les tables nécessaires si elles n'existent pas.
- `node server/scripts/create-search-indexes.js` : crée les index SQL sur toutes les colonnes recherchées.
- `node server/scripts/sync-all.js` : synchronise les données pour la recherche.
- `npm run search:bootstrap` : enchaîne la création des index SQL et la synchronisation Elasticsearch.
- `node server/scripts/buildTacDatabase.js [--schedule]` : reconstruit la base TAC locale à partir des sources publiques
  (tacdb.net, dumps GitHub/constructeurs, imeidb.gsmaopen.com) et génère `server/data/tac_db.json` +
  `server/data/tac_db_min.json`. L'option `--schedule` garde le processus vivant et lance un rafraîchissement hebdomadaire.

### Base TAC (IMEI)

Une base TAC locale (`server/data/tac_db.json`) est utilisée pour identifier n'importe quel IMEI à partir de son TAC (8
chiffres). Le script `server/scripts/buildTacDatabase.js` agrège plusieurs sources publiques (API tacdb.net, dumps GitHub,
référentiels constructeurs, imeidb.gsmaopen.com) et fusionne les données en supprimant les doublons. Un historique est conservé
dans `server/data/tac_history/` et une version minifiée pour le front est générée (`tac_db_min.json`).

**Format des entrées**

```json
{
  "12345678": {
    "brand": "",
    "model": "",
    "deviceType": "",
    "generation": "",
    "os": "",
    "releaseYear": 2024,
    "radio": "2G/3G/4G/5G",
    "manufacturer": "",
    "notes": ""
  }
}
```

**Mise à jour de la base**

```bash
# Mise à jour ponctuelle
node server/scripts/buildTacDatabase.js

# Surveillance et reconstruction hebdomadaire (processus long-vivant)
node server/scripts/buildTacDatabase.js --schedule
```

Des routes REST sont exposées :

- `GET /api/tac/:tac` → informations complètes sur une TAC.
- `GET /api/tac/search?brand=Samsung` ou `GET /api/tac/search?model=iPhone%2014` → recherche par marque ou modèle (fuzzy search).

`ImeiService` et `PhoneIdentifierService` consomment directement cette base pour enrichir les réponses IMEI (marque, modèle,
année de sortie, type d'appareil, technologie radio).

### Indexation initiale Elasticsearch

`USE_ELASTICSEARCH` est désormais activé par défaut lors du démarrage du serveur. Vérifiez simplement que `ELASTICSEARCH_URL` pointe vers votre cluster Elasticsearch (la valeur par défaut `http://localhost:9200` est utilisée si rien n'est renseigné). Après avoir configuré votre cluster et défini les variables d'environnement nécessaires (par exemple `SYNC_BATCH_SIZE` pour ajuster la taille des lots), exécutez :

```bash
npm run search:bootstrap
```

Les scripts créent les index SQL sur toutes les colonnes déclarées `searchable`, puis lisent les tables référencées dans `server/config/tables-catalog.js` (dont `autres.profiles`) pour alimenter l'index `profiles` d'Elasticsearch en purgant l'index si besoin. Assurez-vous que la base MySQL contient les données à indexer avant de lancer cette opération.

Par défaut, l'API attend jusqu'à 2 secondes la réponse d'Elasticsearch avant de basculer automatiquement sur le moteur SQL classique. Adaptez ce délai grâce à la variable `ELASTICSEARCH_SEARCH_TIMEOUT_MS` (valeur en millisecondes, définissez `0` pour désactiver la limite) si votre cluster met plus de temps à répondre. Pour éviter qu'une instance hors-ligne ne ralentisse l'application, le client Elasticsearch échoue désormais rapidement (`ELASTICSEARCH_REQUEST_TIMEOUT_MS`, par défaut `2000`) et ne tente pas de multiples reconnections (`ELASTICSEARCH_MAX_RETRIES`, par défaut `0`).

### Diagnostic : « Elasticsearch indisponible. Bascule sur le moteur de recherche local pour les CDR. »

Ce message est émis par `server/services/CdrService.js` lorsque la création ou la vérification de l'index CDR échoue avec une `ConnectionError`. Dans ce cas, le service désactive `USE_ELASTICSEARCH` pour la session courante et repasse automatiquement sur le moteur de recherche local afin de garantir la continuité de service.【F:server/services/CdrService.js†L120-L137】【F:server/services/ElasticSearchService.js†L41-L60】

Pour résoudre le problème :

- Vérifiez que l'URL définie par `ELASTICSEARCH_URL` pointe vers une instance Elasticsearch accessible (par défaut `http://localhost:9200`).
- Assurez-vous que l'instance est démarrée et accepte les connexions (testez avec `curl $ELASTICSEARCH_URL`).
- Par défaut, les vérifications de santé attendent jusqu'à 2 secondes (`ELASTICSEARCH_HEALTHCHECK_TIMEOUT_MS=2000`).
  Ajustez cette valeur si votre cluster met plus de temps à répondre pendant son démarrage.
- Si Elasticsearch est volontairement inactif, laissez `USE_ELASTICSEARCH=false` dans votre configuration pour éviter le message de bascule.

Une fois la connexion rétablie, redémarrez le serveur Node.js pour réactiver automatiquement la recherche Elasticsearch.

### Mise en place complète du flux CDR temps réel vers Elasticsearch

Cette mise en place permet d'utiliser Elasticsearch comme moteur principal pour la géolocalisation CDR temps réel
(`GET /api/cdr/realtime/numbers`, `GET /api/cdr/realtime/monitor`, `GET /api/cdr/realtime/search`) tout en gardant un fallback
SQL si Elasticsearch est indisponible.

1. **Configurer les variables d'environnement**

   ```bash
   USE_ELASTICSEARCH=true
   ELASTICSEARCH_URL=http://localhost:9200
   ELASTICSEARCH_CDR_REALTIME_INDEX=cdr-realtime-events
   REALTIME_CDR_INDEX_BATCH_SIZE=500
   REALTIME_CDR_INDEX_INTERVAL_MS=5000
   ```

2. **Démarrer l'API**

   ```bash
   npm run server
   ```

3. **Indexer l'historique initial de `cdr_temps_reel` vers Elasticsearch**

   ```bash
   npm run cdr:sync:realtime -- --reset --batch-size=2000
   ```

   > `--reset` recrée l'index CDR temps réel avant ingestion. Retirez ce flag pour une synchronisation incrémentale.

4. **Lancer le worker d'indexation continue**

   ```bash
   npm run cdr:worker -- --bootstrap --batch-size=2000
   ```

   - `--bootstrap` : charge d'abord l'existant.
   - ensuite, le worker suit les nouveaux CDR et les pousse en continu vers Elasticsearch.

5. **Vérifier que les endpoints temps réel utilisent bien Elasticsearch**

   - `GET /api/cdr/realtime/numbers?q=...`
   - `GET /api/cdr/realtime/monitor?numbers=...`
   - `GET /api/cdr/realtime/search?phone=...`

   Les routes `numbers` et `monitor` interrogent désormais d'abord Elasticsearch et ne sollicitent MySQL qu'en secours.

### Variante recommandée : ingestion directe depuis des CSV (sans insertion MySQL)

Si votre autre machine réseau génère des CSV décodés puis les supprime après insertion SQL, vous pouvez désormais envoyer
directement ces CSV au serveur applicatif et les indexer dans Elasticsearch, sans passer par `cdr_temps_reel`.

1. Déposer les fichiers `.csv` dans un dossier d'entrée (par défaut `/var/cdr/incoming`).
2. Lancer l'ingestion ponctuelle :

   ```bash
   npm run cdr:ingest:csv -- --input-dir=/var/cdr/incoming --processed-dir=/var/cdr/processed --failed-dir=/var/cdr/failed --batch-size=1000
   ```

3. Lancer en mode continu (watch) :

   ```bash
   npm run cdr:ingest:csv -- --watch --input-dir=/var/cdr/incoming --processed-dir=/var/cdr/processed --failed-dir=/var/cdr/failed --batch-size=1000
   ```

4. Si vous voulez reproduire votre comportement actuel (suppression du CSV après succès) :

   ```bash
   npm run cdr:ingest:csv -- --watch --delete-on-success --input-dir=/var/cdr/incoming
   ```

Le script enrichit automatiquement les coordonnées BTS à partir du CGI quand possible, indexe en bulk dans
`ELASTICSEARCH_CDR_REALTIME_INDEX` (défaut: `cdr-realtime-events`), puis déplace le fichier vers `processed` (ou le supprime
si `--delete-on-success` est activé). En cas d'échec, le fichier est déplacé dans `failed`.

### Cas actuel: fichiers reçus dans `/var/cdr/incoming`

Si vos fichiers CDR arrivent désormais dans `/var/cdr/incoming`, utilisez directement la commande suivante :

```bash
npm run cdr:ingest:incoming
```

Cette commande démarre le watcher continu avec :

- input : `/var/cdr/incoming`
- processed : `/var/cdr/processed`
- failed : `/var/cdr/failed`
- suppression du CSV après succès (`--delete-on-success`)

Vous pouvez donc garder le même comportement que votre ancien flux (suppression du CSV après traitement), mais avec
indexation Elasticsearch au lieu d'une insertion MySQL.

## Tests

Une suite de tests automatisés n'est pas fournie. Utilisez le lint et les tests manuels fonctionnels avant toute mise en production.
