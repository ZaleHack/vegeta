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

### Variables d'environnement recherche / synchronisation

- `USE_ELASTICSEARCH` : active la recherche distribuée (true par défaut).
- `ELASTICSEARCH_URL` : URL du cluster Elasticsearch ciblé.
- `ELASTICSEARCH_DEFAULT_INDEX` : index global utilisé lorsque `tables-catalog.js` ne définit pas explicitement `sync.elasticsearchIndex`.
- `ELASTICSEARCH_CACHE_TTL_MS` : durée de vie du cache mémoire des requêtes (`60000` ms par défaut).
- `SYNC_BATCH_SIZE` : taille des lots pour l'indexation initiale (full load).
- `SYNC_INCREMENTAL_BATCH_SIZE` : nombre d'évènements CDC traités par `sync:incremental`.
- `SYNC_INCREMENTAL_POLL_MS` : période de scrutation (en ms) du worker incrémental intégré.
- `ENABLE_INCREMENTAL_SYNC` : si `true`, démarre le worker incrémental en même temps que `npm run server`.

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

## Scripts utiles

- `npm run build` : génère la version de production du front-end.
- `npm run lint` : exécute les vérifications lint/formatting.
- `node server/scripts/init-database.js` : crée les tables nécessaires si elles n'existent pas.
- `node server/scripts/create-search-indexes.js` : crée les index SQL sur toutes les colonnes recherchées.
- `node server/scripts/sync-all.js` : synchronise les données pour la recherche (chargement complet).
- `npm run sync:incremental` : traite le journal d'évènements `autres.search_sync_events` et pousse les deltas vers Elasticsearch.
- `npm run search:setup-triggers` : installe/renouvelle les triggers MySQL qui alimentent la table de queue `search_sync_events`.
- `npm run search:bootstrap` : enchaîne la création des index SQL et la synchronisation Elasticsearch.
- `npm run search:verify` : compare le volume de documents entre MySQL et Elasticsearch pour toutes les tables synchronisées.

### Indexation initiale Elasticsearch

`USE_ELASTICSEARCH` est désormais activé par défaut lors du démarrage du serveur. Vérifiez simplement que `ELASTICSEARCH_URL` pointe vers votre cluster Elasticsearch (la valeur par défaut `http://localhost:9200` est utilisée si rien n'est renseigné). Après avoir configuré votre cluster et défini les variables d'environnement nécessaires (`SYNC_BATCH_SIZE`, `SYNC_INCREMENTAL_BATCH_SIZE`, etc.), exécutez :

```bash
npm run search:bootstrap
```

Les scripts créent les index SQL sur toutes les colonnes déclarées `searchable`, puis lisent les tables référencées dans `server/config/tables-catalog.js` (dont `autres.profiles`) pour alimenter les index Elasticsearch (`profiles`, `global_search`, etc.) en purgant les index si besoin. Assurez-vous que la base MySQL contient les données à indexer avant de lancer cette opération.

### Synchronisation incrémentale

1. Exécuter `npm run search:setup-triggers` pour créer/mettre à jour les triggers MySQL qui alimentent `autres.search_sync_events`.
2. Lancer `npm run sync:incremental` ponctuellement (ou planifier un cron) pour vider la file d'évènements et répercuter les modifications côté Elasticsearch. En production, vous pouvez démarrer le worker intégré en exportant `ENABLE_INCREMENTAL_SYNC=true` avant `npm run server` : le service `IncrementalSyncService` lira automatiquement les évènements et les poussera vers Elasticsearch.
3. Ajuster si besoin `SYNC_INCREMENTAL_BATCH_SIZE` (nombre d'évènements traités par lot) et `SYNC_INCREMENTAL_POLL_MS` (période du worker interne) dans vos variables d'environnement.

Pour valider l'état de la synchronisation, exécutez `npm run search:verify`. Le script compare les comptes de documents entre MySQL et Elasticsearch et échoue si une divergence est détectée.

### Diagnostic : « Elasticsearch indisponible. Bascule sur le moteur de recherche local pour les CDR. »

Ce message est émis par `server/services/CdrService.js` lorsque la création ou la vérification de l'index CDR échoue avec une `ConnectionError`. Dans ce cas, le service désactive `USE_ELASTICSEARCH` pour la session courante et repasse automatiquement sur le moteur de recherche local afin de garantir la continuité de service.【F:server/services/CdrService.js†L120-L137】【F:server/services/ElasticSearchService.js†L41-L60】

Pour résoudre le problème :

- Vérifiez que l'URL définie par `ELASTICSEARCH_URL` pointe vers une instance Elasticsearch accessible (par défaut `http://localhost:9200`).
- Assurez-vous que l'instance est démarrée et accepte les connexions (testez avec `curl $ELASTICSEARCH_URL`).
- Par défaut, les vérifications de santé attendent jusqu'à 5 secondes (`ELASTICSEARCH_HEALTHCHECK_TIMEOUT_MS=5000`).
  Augmentez cette valeur si votre cluster met plus de temps à répondre pendant son démarrage.
- Si Elasticsearch est volontairement inactif, laissez `USE_ELASTICSEARCH=false` dans votre configuration pour éviter le message de bascule.

Une fois la connexion rétablie, redémarrez le serveur Node.js pour réactiver automatiquement la recherche Elasticsearch.

## Tests

Une suite de tests automatisés n'est pas fournie. Utilisez le lint et les tests manuels fonctionnels avant toute mise en production.
