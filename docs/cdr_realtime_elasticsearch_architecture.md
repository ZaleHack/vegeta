# Architecture recommandée pour la géolocalisation CDR en temps réel (sans dépendance MySQL)

Ce document propose une architecture orientée **streaming** pour remplacer la lecture/écriture directe intensive de `cdr_temps_reel` dans MySQL, tout en exploitant Elasticsearch pour des recherches et agrégations rapides.

## 1) Problème actuel

La table `cdr_temps_reel` reçoit un volume élevé de CDR en continu. L'injection massive crée :

- contention I/O et verrouillage,
- latence de requêtes,
- ralentissements globaux de l'application,
- difficulté à scaler horizontalement.

## 2) Principe de la nouvelle solution

Au lieu d'utiliser MySQL comme point central temps réel :

1. **Ingestion CDR** vers un broker de messages (Kafka / Redpanda / RabbitMQ).
2. **Pipeline de traitement** (normalisation + enrichissement CGI -> coordonnées).
3. **Indexation dans Elasticsearch** (index time-series par jour/semaine).
4. **Consultation géolocalisation** directement sur Elasticsearch (recherche, filtres, cartes, agrégations).
5. **Stockage froid** optionnel (S3/MinIO/objet) pour historique long terme.

> MySQL peut rester pour des métadonnées métiers (utilisateurs, configuration), mais plus pour absorber le flux CDR brut en temps réel.

## 3) Schéma cible (flux)

```text
Sources CDR -> Producer -> Topic/Queue -> Consumers (N instances)
                                   |-> Validation
                                   |-> Enrichissement radio (cache Redis + fallback DB)
                                   |-> Déduplication
                                   '--> Bulk index Elasticsearch

API Recherche/Geo -> Elasticsearch
Archivage périodique -> Object storage / data lake
```

## 4) Modèle d'index Elasticsearch conseillé

### 4.1 Data stream et ILM

- Utiliser un **data stream**: `cdr-realtime`
- Rollover automatique (ex: 30-50 Go ou 1 jour)
- Politique ILM :
  - Hot: 1-7 jours (requêtes intensives)
  - Warm: 30-90 jours
  - Delete: selon conformité (ex: 180 jours)

### 4.2 Mapping de base (exemple)

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "seq_number": { "type": "long" },
      "type_appel": { "type": "keyword" },
      "statut_appel": { "type": "keyword" },
      "cause_liberation": { "type": "keyword" },
      "facturation": { "type": "scaled_float", "scaling_factor": 100 },
      "date_debut": { "type": "date", "format": "yyyy-MM-dd" },
      "heure_debut": { "type": "keyword" },
      "duree_sec": { "type": "integer" },
      "date_fin": { "type": "date", "format": "yyyy-MM-dd" },
      "heure_fin": { "type": "keyword" },
      "numero_appelant": { "type": "keyword" },
      "numero_appele": { "type": "keyword" },
      "imsi_appelant": { "type": "keyword" },
      "imei_appelant": { "type": "keyword" },
      "cgi": { "type": "keyword" },
      "route_reseau": { "type": "keyword" },
      "device_id": { "type": "keyword" },
      "fichier_source": { "type": "keyword" },
      "inserted_at": { "type": "date" },
      "@timestamp": { "type": "date" },
      "location": { "type": "geo_point" },
      "azimut": { "type": "short" },
      "nom_bts": { "type": "keyword" }
    }
  }
}
```

### 4.3 Optimisations importantes

- `keyword` pour champs de filtre exact.
- Éviter `text` sauf besoin de full-text.
- `geo_point` pour carte/heatmap (`location: {lat, lon}`).
- Définir `_id` déterministe (ex: hash `seq_number + numero_appelant + date_debut + heure_debut`) pour éviter les doublons.
- Bulk index (paquets de 1k-5k docs selon charge).

## 5) Enrichissement CGI -> coordonnées sans surcharge

Pour la géolocalisation :

- Maintenir une table/référentiel CGI->(lat,lon,azimut,nom_bts).
- Charger ce référentiel dans **Redis** (ou mémoire locale avec TTL).
- Sur chaque CDR, lookup cache O(1) avant indexation ES.
- Fallback asynchrone si CGI inconnu (file de rattrapage), sans bloquer ingestion.

Résultat : la géolocalisation est produite au moment de l'indexation, et la recherche n'a plus besoin de jointures SQL coûteuses.

## 6) Plan de migration progressif (faible risque)

1. **Étape 0 (shadow mode)**: garder MySQL, ajouter pipeline ES en parallèle.
2. **Étape 1**: basculer lecture API géolocalisation sur ES (read switch).
3. **Étape 2**: limiter inserts MySQL au strict minimum (ou arrêt complet du flux brut).
4. **Étape 3**: backfill historique nécessaire vers ES.
5. **Étape 4**: activer ILM + monitoring + alerting (lag consumer, erreurs bulk, latence).

## 7) Capacity planning minimal

- Broker: partitionner par clé (ex: `numero_appelant` ou `cgi`) pour paralléliser.
- Consumers: autoscaling horizontal sur lag.
- Elasticsearch:
  - au moins 3 nœuds (prod),
  - SSD/NVMe,
  - heap JVM ~50% RAM (max ~31GB par nœud JVM),
  - surveiller `indexing rate`, `refresh`, `merge`, `search latency`.

## 8) API de recherche géolocalisation (idées)

- Recherche par numéro (`numero_appelant` / `numero_appele`) + intervalle temps.
- Carte par `geo_bounding_box` + `date histogram`.
- Dernière position connue (tri desc sur `@timestamp`).
- Trajectoire (tri temporel + agrégation par cellule CGI).

## 9) Sécurité & conformité

- Chiffrement TLS entre services.
- Contrôle d'accès index par rôle.
- Pseudonymisation/tokenisation MSISDN/IMSI/IMEI si exigée.
- Politique de rétention stricte alignée réglementaire.

## 10) Stack recommandée (concrète)

- **Broker**: Kafka (ou Redpanda)
- **Traitement**: service Node.js/Java/Python consumer (batch + retry + DLQ)
- **Cache CGI**: Redis
- **Recherche**: Elasticsearch + Kibana/OpenSearch Dashboards
- **Monitoring**: Prometheus + Grafana + alertes sur lag et bulk failures

## 11) Pourquoi ce design sera plus rapide

- Découplage ingestion/stockage/recherche.
- Écritures append-oriented dans ES via bulk au lieu de contention SQL.
- Requêtes geo natives (`geo_point`, agrégations) beaucoup plus adaptées au cas d'usage CDR cartographique.
- Scalabilité horizontale naturelle des consumers et du cluster ES.

---

Si besoin, une prochaine étape peut fournir :

1) un template Elasticsearch prêt à déployer,
2) un consumer d'ingestion Node.js (bulk index + retry + DLQ),
3) un plan de migration SQL -> ES avec indicateurs de succès (latence p95, throughput, taux d'échec).
