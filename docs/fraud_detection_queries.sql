-- Fraud detection queries for CDR identity anomaly detection.
-- Each query restricts the analysis to the most recent 30 days using the inserted_at column
-- to leverage time-based filtering in Elasticsearch indices and MySQL alike.

-- 1. IMSI seen with multiple IMEIs (possible SIM swap into another device)
SELECT
    c.imsi_appelant AS imsi,
    COUNT(DISTINCT c.imei_appelant) AS distinct_imeis,
    GROUP_CONCAT(DISTINCT c.imei_appelant ORDER BY c.imei_appelant SEPARATOR ', ') AS imei_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_temps_reel AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY c.imsi_appelant
HAVING COUNT(DISTINCT c.imei_appelant) > 1
ORDER BY COUNT(DISTINCT c.imei_appelant) DESC, occurrence_count DESC;

-- 2. IMEI reused by multiple MSISDNs (potential number swapping on the same handset)
SELECT
    c.imei_appelant AS imei,
    COUNT(DISTINCT c.numero_appelant) AS distinct_msisdns,
    GROUP_CONCAT(DISTINCT c.numero_appelant ORDER BY c.numero_appelant SEPARATOR ', ') AS msisdn_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_temps_reel AS c
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY c.imei_appelant
HAVING COUNT(DISTINCT c.numero_appelant) > 1
ORDER BY COUNT(DISTINCT c.numero_appelant) DESC, occurrence_count DESC;

-- 3. IMSI mapped to multiple MSISDNs (multi-number usage or SIM rotation)
SELECT
    c.imsi_appelant AS imsi,
    COUNT(DISTINCT c.numero_appelant) AS distinct_msisdns,
    GROUP_CONCAT(DISTINCT c.numero_appelant ORDER BY c.numero_appelant SEPARATOR ', ') AS msisdn_list,
    MIN(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS first_usage,
    MAX(STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s')) AS last_usage,
    COUNT(*) AS occurrence_count
FROM cdr_temps_reel AS c
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
    c.date_debut,
    c.heure_debut,
    c.date_fin,
    c.heure_fin,
    c.duree_sec,
    c.numero_appelant,
    c.imsi_appelant,
    c.imei_appelant,
    c.numero_appele,
    c.cgi,
    COALESCE(r2.LONGITUDE, r3.LONGITUDE, r4.LONGITUDE, r5.LONGITUDE) AS longitude,
    COALESCE(r2.LATITUDE, r3.LATITUDE, r4.LATITUDE, r5.LATITUDE) AS latitude,
    COALESCE(r2.AZIMUT, r3.AZIMUT, r4.AZIMUT, r5.AZIMUT) AS azimut,
    COALESCE(r2.NOM_BTS, r3.NOM_BTS, r4.NOM_BTS, r5.NOM_BTS) AS nom_bts,
    c.inserted_at
FROM cdr_temps_reel AS c
LEFT JOIN bts_orange.`2g` AS r2 ON r2.CGI = c.cgi
LEFT JOIN bts_orange.`3g` AS r3 ON r3.CGI = c.cgi AND r2.CGI IS NULL
LEFT JOIN bts_orange.`4g` AS r4 ON r4.CGI = c.cgi AND r2.CGI IS NULL AND r3.CGI IS NULL
LEFT JOIN bts_orange.`5g` AS r5
  ON r5.CGI = c.cgi AND r2.CGI IS NULL AND r3.CGI IS NULL AND r4.CGI IS NULL
WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND (
        ( @target_imsi IS NOT NULL AND c.imsi_appelant = @target_imsi )
     OR ( @target_imei IS NOT NULL AND c.imei_appelant = @target_imei )
      )
ORDER BY STR_TO_DATE(CONCAT(c.date_debut, ' ', c.heure_debut), '%Y-%m-%d %H:%i:%s') ASC,
         c.id ASC;
