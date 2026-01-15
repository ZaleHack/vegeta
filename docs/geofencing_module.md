# Module de géorepérage (Geofencing) pour CDR temps réel

Ce document décrit l'implémentation initiale du module de géorepérage pour la plateforme SORA : schéma SQL, API REST et logique de détection côté serveur.

## 1) Schéma SQL (MySQL)

Les tables sont créées automatiquement par `server/config/database.js` lors du démarrage du serveur :

- `autres.antennes_cgi`
- `autres.zones_geofencing`
- `autres.cdr_geolocalisations`
- `autres.alertes_geofencing`
- `autres.regles_alertes_zones`

### `autres.antennes_cgi`
Table de mapping CGI → coordonnées GPS.

| Champ | Type | Description |
| --- | --- | --- |
| cgi | VARCHAR(100) | CGI normalisé (unique) |
| latitude / longitude | DECIMAL(10,6) | Coordonnées GPS |
| rayon_couverture_m | INT | Rayon estimé (mètres) |
| operateur / technologie | VARCHAR | Métadonnées radio |
| actif | TINYINT(1) | Statut actif |

### `autres.zones_geofencing`
Définition des zones (polygone/cercle) en JSON.

- `coordonnees_geo` (JSON) accepte les formats suivants :
  - **Polygone** :
    ```json
    {
      "type": "polygon",
      "coordinates": [[-17.45, 14.69], [-17.46, 14.70], [-17.47, 14.69]]
    }
    ```
  - **Cercle** :
    ```json
    {
      "type": "circle",
      "center": {"lat": 14.69, "lng": -17.45},
      "radius_m": 500
    }
    ```

### `autres.cdr_geolocalisations`
Historique de la détection géographique associée à un enregistrement CDR temps réel.

### `autres.alertes_geofencing`
Journal des alertes générées par zone ou par règle.

### `autres.regles_alertes_zones`
Règles JSON pour filtrer les alertes (type d'appel, durée, numéros, etc.).

## 2) API REST

Les routes sont exposées via `/api/geofencing/*`.

### Antennes

- `GET /api/geofencing/antennes`
  - Query: `search`, `page`, `limit`
- `POST /api/geofencing/antennes`
  - Body (exemple):
    ```json
    {
      "cgi": "624-02-12345-67890",
      "latitude": 14.6901,
      "longitude": -17.4467,
      "rayon_couverture_m": 500,
      "operateur": "Orange",
      "technologie": "4G",
      "actif": true
    }
    ```
- `GET /api/geofencing/antennes/:id`
- `PUT /api/geofencing/antennes/:id`
- `DELETE /api/geofencing/antennes/:id`

### Zones

- `GET /api/geofencing/zones`
  - Query: `search`, `type`, `actif`, `page`, `limit`
- `POST /api/geofencing/zones`
  - Body (exemple):
    ```json
    {
      "nom": "Zone Centre-Ville",
      "type": "commercial",
      "coordonnees_geo": {
        "type": "polygon",
        "coordinates": [[-17.45, 14.69], [-17.46, 14.70], [-17.47, 14.69]]
      },
      "couleur_carte": "#FF9800",
      "alerte_appel_entrant": true,
      "alerte_appel_sortant": true,
      "actif": true
    }
    ```
- `GET /api/geofencing/zones/:id`
- `PUT /api/geofencing/zones/:id`
- `DELETE /api/geofencing/zones/:id`

### Règles d'alerte

- `GET /api/geofencing/regles`
  - Query: `zoneId`, `actif`
- `POST /api/geofencing/regles`
  - Body (exemple):
    ```json
    {
      "zone_id": 1,
      "nom_regle": "Appels sortants > 60s",
      "conditions": {"type_appel": ["sortant"], "duree_min": 60},
      "declencheurs": ["appel_depuis_zone"],
      "destinataires": ["email1@example.com"],
      "message_template": "Appel {numero} depuis {zone} ({duree}s)",
      "priorite": "warning",
      "actif": true
    }
    ```
- `PUT /api/geofencing/regles/:id`
- `DELETE /api/geofencing/regles/:id`

### Alertes

- `GET /api/geofencing/alertes`
  - Query: `zoneId`, `status`, `page`, `limit`
- `PUT /api/geofencing/alertes/:id/status`
  - Body: `{ "status": "lu" }`

### Détection ponctuelle

- `POST /api/geofencing/detect`
  - Body (exemples):
    - Détection sur un CDR existant:
      ```json
      { "cdr_id": 123 }
      ```
    - Détection à partir d'un CGI:
      ```json
      { "cgi": "624-02-12345-67890" }
      ```
    - Détection à partir de coordonnées:
      ```json
      { "latitude": 14.69, "longitude": -17.45 }
      ```

La détection :
1. Résout le CGI → antenne (si possible)
2. Détermine les zones actives contenant le point
3. Insère un enregistrement dans `cdr_geolocalisations` si un `cdr_id` est fourni
4. Déclenche les alertes automatiques selon la configuration de zone/règles

## 3) Logique de géolocalisation

L'algorithme côté serveur effectue les opérations suivantes :

1. Résolution du CGI → coordonnées GPS via `autres.antennes_cgi`
2. Test **point-in-polygon** ou **point-in-circle** contre les zones actives
3. Enregistrement de la géolocalisation + précision estimée
4. Évaluation des alertes (flags de zone + règles JSON)

> **Note**: La précision est estimée en prenant le minimum entre le rayon de couverture de l'antenne et la distance au centre géométrique de la zone.
