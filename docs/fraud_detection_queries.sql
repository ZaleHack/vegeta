-- Fraud detection queries for CDR identity anomaly detection.
-- Each query restricts the analysis to the most recent 30 days using the inserted_at column
-- to leverage time-based filtering in Elasticsearch indices and MySQL alike.

-- 1. IMSI seen with multiple IMEIs (possible SIM swap into another device)
SELECT
    c.imsi_appelant AS imsi,
    COUNT(DISTINCT c.imei_appelant) AS distinct_imeis,
    GROUP_CONCAT(DISTINCT c.imei_appelant ORDER BY c.imei_appelant SEPARATOR ', ') AS imei_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_realtime AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY c.imsi_appelant
HAVING COUNT(DISTINCT c.imei_appelant) > 1
ORDER BY COUNT(DISTINCT c.imei_appelant) DESC, occurrence_count DESC;

-- 2. IMEI reused by multiple MSISDNs (potential number swapping on the same handset)
SELECT
    c.imei_appelant AS imei,
    COUNT(DISTINCT c.numero_appelant) AS distinct_msisdns,
    GROUP_CONCAT(DISTINCT c.numero_appelant ORDER BY c.numero_appelant SEPARATOR ', ') AS msisdn_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_realtime AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY c.imei_appelant
HAVING COUNT(DISTINCT c.numero_appelant) > 1
ORDER BY COUNT(DISTINCT c.numero_appelant) DESC, occurrence_count DESC;

-- 3. IMSI mapped to multiple MSISDNs (multi-number usage or SIM rotation)
SELECT
    c.imsi_appelant AS imsi,
    COUNT(DISTINCT c.numero_appelant) AS distinct_msisdns,
    GROUP_CONCAT(DISTINCT c.numero_appelant ORDER BY c.numero_appelant SEPARATOR ', ') AS msisdn_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_realtime AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY c.imsi_appelant
HAVING COUNT(DISTINCT c.numero_appelant) > 1
ORDER BY COUNT(DISTINCT c.numero_appelant) DESC, occurrence_count DESC;

-- 4. Detailed timeline for a specific IMSI or IMEI to support investigations.
-- Set @target_imsi or @target_imei (leave one NULL) before running this query.
-- Suggested supporting indexes for MySQL and Elasticsearch: inserted_at, imsi_appelant,
-- imei_appelant, numero_appelant to accelerate filtering and aggregations.
SELECT
    c.id,
    c.type_appel,
    c.date_debut_appel,
    c.heure_debut_appel,
    c.date_fin_appel,
    c.heure_fin_appel,
    c.duree_appel,
    c.numero_appelant,
    c.imsi_appelant,
    c.imei_appelant,
    c.numero_appele,
    c.cgi,
    c.longitude,
    c.latitude,
    c.azimut,
    c.nom_bts,
    c.inserted_at
FROM cdr_realtime AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND (
        ( @target_imsi IS NOT NULL AND c.imsi_appelant = @target_imsi )
     OR ( @target_imei IS NOT NULL AND c.imei_appelant = @target_imei )
      )
ORDER BY STR_TO_DATE(CONCAT(c.date_debut_appel, ' ', c.heure_debut_appel), '%Y-%m-%d %H:%i:%s') ASC,
         c.id ASC;
