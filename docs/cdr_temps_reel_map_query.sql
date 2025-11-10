--
-- Requête de jointure entre cdr_temps_reel et les tables radio BTS (2G/3G/4G/5G)
-- pour préparer l'affichage cartographique. La jointure compare la colonne cgi
-- (minuscule) de cdr_temps_reel avec la colonne CGI (majuscule) de chaque table
-- bts_orange et retourne les coordonnées et le nom du site associés au premier
-- match trouvé.
--
SELECT
    c.id,
    c.date_debut,
    c.heure_debut,
    c.numero_appelant,
    c.numero_appele,
    c.type_appel,
    c.cgi,
    COALESCE(r2.NOM_BTS, r3.NOM_BTS, r4.NOM_BTS, r5.NOM_BTS) AS nom_bts,
    COALESCE(r2.LONGITUDE, r3.LONGITUDE, r4.LONGITUDE, r5.LONGITUDE) AS longitude,
    COALESCE(r2.LATITUDE, r3.LATITUDE, r4.LATITUDE, r5.LATITUDE) AS latitude,
    COALESCE(r2.AZIMUT, r3.AZIMUT, r4.AZIMUT, r5.AZIMUT) AS azimut,
    c.inserted_at
FROM bts_orange.cdr_temps_reel AS c
LEFT JOIN bts_orange.`2g` AS r2
  ON LOWER(r2.CGI) = LOWER(c.cgi)
LEFT JOIN bts_orange.`3g` AS r3
  ON LOWER(r3.CGI) = LOWER(c.cgi)
 AND r2.CGI IS NULL
LEFT JOIN bts_orange.`4g` AS r4
  ON LOWER(r4.CGI) = LOWER(c.cgi)
 AND r2.CGI IS NULL
 AND r3.CGI IS NULL
LEFT JOIN bts_orange.`5g` AS r5
  ON LOWER(r5.CGI) = LOWER(c.cgi)
 AND r2.CGI IS NULL
 AND r3.CGI IS NULL
 AND r4.CGI IS NULL
-- Filtrer sur la période ou les identifiants souhaités selon le cas d'usage.
-- Exemple :
-- WHERE c.inserted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY c.date_debut ASC, c.heure_debut ASC, c.id ASC;
