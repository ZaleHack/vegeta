# Enrichissement des CDR avec les coordonnées radio

Cette note décrit deux approches pour enrichir la table `cdr_temps_reel` avec les colonnes `longitude`, `latitude`, `azimut` et `nom_bts` en se basant sur la valeur de `cgi`.

## 1. Mise à jour SQL massive

La solution SQL effectue un `UPDATE` sur la table principale en s'appuyant sur des jointures conditionnelles avec les tables radio 2G, 3G, 4G et 5G. Elle détecte automatiquement la technologie en vérifiant la présence du `cgi` dans chaque table.

```sql
WITH source AS (
    SELECT
        c.id,
        COALESCE(r2.longitude, r3.longitude, r4.longitude, r5.longitude) AS longitude,
        COALESCE(r2.latitude,  r3.latitude,  r4.latitude,  r5.latitude ) AS latitude,
        COALESCE(r2.azimut,    r3.azimut,    r4.azimut,    r5.azimut   ) AS azimut,
        COALESCE(r2.nom_bts,   r3.nom_bts,   r4.nom_bts,   r5.nom_bts  ) AS nom_bts
    FROM cdr_temps_reel c
    LEFT JOIN radio_2g r2 ON c.cgi = r2.cgi
    LEFT JOIN radio_3g r3 ON c.cgi = r3.cgi AND r2.cgi IS NULL
    LEFT JOIN radio_4g r4 ON c.cgi = r4.cgi AND r2.cgi IS NULL AND r3.cgi IS NULL
    LEFT JOIN radio_5g r5 ON c.cgi = r5.cgi AND r2.cgi IS NULL AND r3.cgi IS NULL AND r4.cgi IS NULL
)
UPDATE cdr_temps_reel AS c
SET
    longitude = s.longitude,
    latitude  = s.latitude,
    azimut    = s.azimut,
    nom_bts   = s.nom_bts
FROM source AS s
WHERE c.id = s.id
  AND (s.longitude IS NOT NULL OR s.latitude IS NOT NULL OR s.azimut IS NOT NULL OR s.nom_bts IS NOT NULL);
```

### Remarques
- La clause `COALESCE` permet de sélectionner les coordonnées provenant de la première table où le `cgi` est trouvé.
- Les conditions supplémentaires dans les jointures (`AND r2.cgi IS NULL`, etc.) empêchent de récupérer les coordonnées d'une technologie supérieure lorsque le `cgi` existe déjà dans une technologie inférieure.
- Ajouter une condition `WHERE c.longitude IS NULL OR c.nom_bts IS NULL` permet d'éviter une écriture inutile des lignes déjà enrichies.
- Étendre la requête pour inclure `nom_bts` permet de compléter également l'identifiant du site lorsqu'il est disponible dans les tables radio.

## 2. Enrichissement Python en temps réel

Le module [`server/scripts/cdr_enrichment.py`](../server/scripts/cdr_enrichment.py) illustre l'intégration de l'enrichissement dans un watcher qui ingère en continu des CDR. Il maintient un cache en mémoire par `cgi` afin d'éviter des requêtes répétées sur les tables radio.

### Points clés
- `CgiCache` enregistre les coordonnées déjà résolues et expose une méthode `invalidate` pour rafraîchir le cache si nécessaire.
- `CdrEnricher.resolve_coordinates` interroge successivement les tables 2G/3G/4G/5G en une seule requête SQL (`UNION ALL`) et met automatiquement en cache le résultat.
- `CdrEnricher.enrich` peut être alimenté par un flux de CDR décodés et complète chaque `payload` avec `longitude`, `latitude` et `azimut` lorsque les données sont disponibles.
- `CdrEnricher.bulk_insert` utilise `execute_batch` afin d'insérer ou de mettre à jour les lignes de `cdr_temps_reel` par lot, limitant les allers-retours réseau.
- La fonction utilitaire `process_batch` montre comment instancier l'enricher et traiter une rafale de CDR dans le watcher existant.

### Bonnes pratiques
- Invalider le cache après une mise à jour des tables radio ou prévoir une durée d'expiration.
- Pré-charger les cellules les plus sollicitées pour minimiser les latences au démarrage.
- Adapter la requête `INSERT`/`UPDATE` à la structure exacte de `cdr_temps_reel`.
- Surveiller les temps de réponse de la base : si nécessaire, déporter les tables radio dans Redis ou un cache local partagé.

## 3. Script Node.js prêt à l'emploi

Le script [`server/scripts/enrich-realtime-cdr.js`](../server/scripts/enrich-realtime-cdr.js) offre une troisième option clé en
main, directement intégrée à la plateforme Node.js. Il s'appuie sur la méthode `RealtimeCdrService.enrichMissingCoordinates`
qui réutilise la logique de détection automatique des tables 2G/3G/4G/5G.

```bash
npm run cdr:enrich -- --batch-size=2000 --limit=10000
```

### Points forts
- Détection automatique des tables radio disponibles (y compris avec les schémas `bts_orange` ou `autres`).
- Mise à jour par lots avec gestion d'un mode `--dry-run` pour simuler l'enrichissement sans écrire en base.
- Journalisation détaillée (`--quiet` pour la réduire) indiquant le nombre de lignes enrichies et le dernier identifiant traité.

### Paramètres utiles
- `--batch-size=` pour contrôler la taille des lots (défaut : 1000).
- `--limit=` pour borner le nombre de lignes mises à jour.
- `--dry-run` pour vérifier la correspondance CGI → coordonnées sans modifier `cdr_temps_reel`.
- `--quiet` pour limiter la sortie console au résumé final.
