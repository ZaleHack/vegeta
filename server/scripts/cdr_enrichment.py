"""Tools to enrich CDR rows with radio coordinates based on CGI."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Iterator, Optional, Tuple, Callable

import psycopg2
from psycopg2 import extras
from psycopg2.extensions import connection as Connection


@dataclass(frozen=True)
class CellCoordinates:
    longitude: Optional[float]
    latitude: Optional[float]
    azimut: Optional[float]
    nom_bts: Optional[str]


class CgiCache:
    """In-memory cache for CGI lookups."""

    def __init__(self) -> None:
        self._cache: Dict[str, Optional[CellCoordinates]] = {}

    def get(self, cgi: str) -> Optional[CellCoordinates]:
        return self._cache.get(cgi)

    def put(self, cgi: str, coords: Optional[CellCoordinates]) -> None:
        self._cache[cgi] = coords

    def invalidate(self, cgi: Optional[str] = None) -> None:
        if cgi is None:
            self._cache.clear()
        else:
            self._cache.pop(cgi, None)


class CdrEnricher:
    """Enrich CDR rows by resolving CGI to coordinates."""

    CGI_QUERY = """
        SELECT longitude, latitude, azimut, nom_bts
        FROM (
            SELECT longitude, latitude, azimut, nom_bts, 1 AS priority
            FROM radio_2g WHERE cgi = %(cgi)s
            UNION ALL
            SELECT longitude, latitude, azimut, nom_bts, 2 AS priority
            FROM radio_3g WHERE cgi = %(cgi)s
            UNION ALL
            SELECT longitude, latitude, azimut, nom_bts, 3 AS priority
            FROM radio_4g WHERE cgi = %(cgi)s
            UNION ALL
            SELECT longitude, latitude, azimut, nom_bts, 4 AS priority
            FROM radio_5g WHERE cgi = %(cgi)s
        ) AS candidates
        ORDER BY priority
        LIMIT 1
    """

    def __init__(self, connection_factory: Callable[[], Connection]) -> None:
        self._connection_factory = connection_factory
        self._cache = CgiCache()

    def _get_connection(self) -> Connection:
        return self._connection_factory()

    def resolve_coordinates(self, cgi: str) -> Optional[CellCoordinates]:
        cached = self._cache.get(cgi)
        if cached is not None:
            return cached

        with self._get_connection() as conn, conn.cursor(cursor_factory=extras.RealDictCursor) as cursor:
            cursor.execute(self.CGI_QUERY, {"cgi": cgi})
            row = cursor.fetchone()

        coords = (
            CellCoordinates(
                row["longitude"],
                row["latitude"],
                row["azimut"],
                row.get("nom_bts")
            )
            if row
            else None
        )
        self._cache.put(cgi, coords)
        return coords

    def enrich(self, rows: Iterable[Tuple[int, str, dict]]) -> Iterator[Tuple[int, str, dict]]:
        for cdr_id, cgi, payload in rows:
            coords = self.resolve_coordinates(cgi)
            if coords:
                payload.update(
                    longitude=coords.longitude,
                    latitude=coords.latitude,
                    azimut=coords.azimut,
                    nom_bts=coords.nom_bts,
                )
            yield cdr_id, cgi, payload

    def bulk_insert(self, rows: Iterable[Tuple[int, str, dict]]) -> None:
        insert_query = """
            INSERT INTO cdr_temps_reel (id, cgi, payload, longitude, latitude, azimut, nom_bts)
            VALUES (%(id)s, %(cgi)s, %(payload)s, %(longitude)s, %(latitude)s, %(azimut)s, %(nom_bts)s)
            ON CONFLICT (id) DO UPDATE
            SET longitude = EXCLUDED.longitude,
                latitude  = EXCLUDED.latitude,
                azimut    = EXCLUDED.azimut,
                nom_bts   = EXCLUDED.nom_bts
        """

        with self._get_connection() as conn, conn.cursor() as cursor:
            extras.execute_batch(
                cursor,
                insert_query,
                [
                    {
                        "id": cdr_id,
                        "cgi": cgi,
                        "payload": payload,
                        "longitude": payload.get("longitude"),
                        "latitude": payload.get("latitude"),
                        "azimut": payload.get("azimut"),
                        "nom_bts": payload.get("nom_bts"),
                    }
                    for cdr_id, cgi, payload in rows
                ],
                page_size=1000,
            )
            conn.commit()


def make_enricher(dsn: str) -> CdrEnricher:
    def connection_factory() -> Connection:
        return psycopg2.connect(dsn)

    return CdrEnricher(connection_factory)


def process_batch(dsn: str, batch: Iterable[Tuple[int, str, dict]]) -> None:
    enricher = make_enricher(dsn)
    enriched_rows = list(enricher.enrich(batch))
    if enriched_rows:
        enricher.bulk_insert(enriched_rows)
