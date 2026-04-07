#!/usr/bin/env python3
"""
CDR Fast Ingestor — ingestion CDR vers Elasticsearch, orientée débit + stabilité cluster.

Points clés pour ne pas perturber Elasticsearch:
- Backpressure avec file bornée entre parsing et indexation.
- Taille bulk plafonnée en nb de docs ET en octets (évite les payloads massifs).
- Concurrence bulk limitée (workers) pour protéger les thread pools ES.
- Retry exponentiel avec jitter, en priorisant 429/503/5xx.
- Pause adaptative quand le cluster est en statut RED.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import json
import logging
import multiprocessing
import os
import random
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from queue import Empty, Queue

CDR_COLUMNS = [
    "seq_num",
    "type_appel",
    "statut_appel",
    "cause_liberation",
    "facturation",
    "start_date",
    "start_time",
    "duree_sec",
    "end_date",
    "end_time",
    "numero_appelant",
    "numero_appele",
    "imsi_appelant",
    "imei_appelant",
    "cgi",
    "route_reseau",
    "device_id",
    "fichier_source",
]

RETRYABLE_HTTP_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="CDR Fast Ingestor (safe mode for Elasticsearch)")
    p.add_argument("--input-dir", required=True, help="Répertoire d'entrée")
    p.add_argument("--es-host", default="http://localhost:9200")
    p.add_argument("--es-index", default="cdr-realtime-events")
    p.add_argument("--failed-dir", default="/var/cdr/failed")
    p.add_argument("--workers", type=int, default=max(1, min(4, multiprocessing.cpu_count() // 2 or 1)))
    p.add_argument("--batch-size", type=int, default=200, help="Fichiers par lot de parsing")
    p.add_argument("--bulk-size", type=int, default=2000, help="Docs max par requête bulk")
    p.add_argument("--bulk-max-bytes", type=int, default=5_000_000, help="Taille max NDJSON par bulk")
    p.add_argument("--max-queue-batches", type=int, default=8, help="Backpressure queue batches")
    p.add_argument("--poll-interval", type=float, default=0.5)
    p.add_argument("--stats-interval", type=int, default=10)
    p.add_argument("--request-timeout", type=int, default=30)
    p.add_argument("--max-retries", type=int, default=5)
    p.add_argument("--retry-base-delay", type=float, default=0.8)
    p.add_argument("--cluster-health-interval", type=int, default=10)
    p.add_argument("--cluster-red-pause", type=float, default=2.0)
    p.add_argument("--no-delete", action="store_true")
    p.add_argument("--log-level", default="INFO")
    return p.parse_args()


def setup_logging(level: str) -> logging.Logger:
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO), format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger("cdr_ingest_fast")


class Stats:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.docs_indexed = 0
        self.docs_failed = 0
        self.docs_retried = 0
        self.docs_saved = 0
        self.files_ok = 0
        self.files_err = 0
        self.files_del = 0
        self.start_time = time.monotonic()
        self._window = deque(maxlen=60)

    def record(self, docs_ok: int = 0, docs_failed: int = 0, docs_retried: int = 0, docs_saved: int = 0,
               files_ok: int = 0, files_err: int = 0, files_del: int = 0) -> None:
        with self._lock:
            self.docs_indexed += docs_ok
            self.docs_failed += docs_failed
            self.docs_retried += docs_retried
            self.docs_saved += docs_saved
            self.files_ok += files_ok
            self.files_err += files_err
            self.files_del += files_del
            self._window.append((time.monotonic(), docs_ok))

    def throughput(self) -> float:
        with self._lock:
            if len(self._window) < 2:
                return 0.0
            t0, _ = self._window[0]
            t1, _ = self._window[-1]
            total = sum(n for _, n in self._window)
            return total / (t1 - t0) if t1 > t0 else 0.0

    def report(self, logger: logging.Logger) -> None:
        elapsed = time.monotonic() - self.start_time
        avg = self.docs_indexed / elapsed if elapsed > 0 else 0.0
        logger.info(
            "📊 docs=%s | retries=%s | failed=%s | saved=%s | files=%s ok / %s err / %s del | ⚡ %.0f docs/s (glissant) | 📈 %.0f docs/s (moyen)",
            f"{self.docs_indexed:,}",
            f"{self.docs_retried:,}",
            f"{self.docs_failed:,}",
            f"{self.docs_saved:,}",
            f"{self.files_ok:,}",
            f"{self.files_err:,}",
            f"{self.files_del:,}",
            self.throughput(),
            avg,
        )


class ClusterState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.status = "unknown"

    def set_status(self, status: str) -> None:
        with self._lock:
            self.status = status

    def get_status(self) -> str:
        with self._lock:
            return self.status


def _safe_int(val: str | int | None, default: int = 0) -> int:
    try:
        return int(str(val).strip())
    except (TypeError, ValueError):
        return default


def _safe_date(val: str | None) -> str | None:
    v = (val or "").strip()
    if len(v) == 10 and v[4] == "-" and v[7] == "-":
        return v + "T00:00:00.000Z"
    return None


def _make_id(row: dict[str, str]) -> str:
    key = (
        f"{row.get('fichier_source', '')}|{row.get('seq_num', '')}|{row.get('start_date', '')}|"
        f"{row.get('start_time', '')}|{row.get('numero_appelant', '')}|{row.get('numero_appele', '')}"
    )
    return hashlib.sha1(key.encode()).hexdigest()


def _parse_file(filepath: str) -> list[tuple[str, dict[str, object]]]:
    docs: list[tuple[str, dict[str, object]]] = []
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"

    with open(filepath, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter="|")
        for raw in reader:
            if not raw or all(c.strip() == "" for c in raw):
                continue
            row = dict(zip(CDR_COLUMNS, [c.strip() for c in raw]))
            doc = {
                "id": row.get("seq_num", ""),
                "seq_number": row.get("seq_num", ""),
                "type_appel": row.get("type_appel", ""),
                "statut_appel": row.get("statut_appel", ""),
                "cause_liberation": row.get("cause_liberation", ""),
                "facturation": row.get("facturation", ""),
                "date_debut": _safe_date(row.get("start_date", "")),
                "heure_debut": row.get("start_time", ""),
                "duree_sec": _safe_int(row.get("duree_sec")),
                "date_fin": _safe_date(row.get("end_date", "")),
                "heure_fin": row.get("end_time", ""),
                "numero_appelant": row.get("numero_appelant", ""),
                "numero_appele": row.get("numero_appele", ""),
                "imsi_appelant": row.get("imsi_appelant", ""),
                "imei_appelant": row.get("imei_appelant", ""),
                "cgi": row.get("cgi", ""),
                "route_reseau": row.get("route_reseau", ""),
                "device_id": row.get("device_id", ""),
                "fichier_source": row.get("fichier_source", ""),
                "inserted_at": None,
                "call_timestamp": now_iso,
                "duration_seconds": _safe_int(row.get("duree_sec")),
                "latitude": None,
                "longitude": None,
                "azimut": "",
                "nom_bts": "",
            }
            docs.append((_make_id(row), doc))
    return docs


def _build_ndjson(es_index: str, docs: list[tuple[str, dict[str, object]]]) -> bytes:
    lines: list[str] = []
    for doc_id, doc in docs:
        lines.append(json.dumps({"index": {"_index": es_index, "_id": doc_id}}, ensure_ascii=False))
        lines.append(json.dumps(doc, ensure_ascii=False))
    return ("\n".join(lines) + "\n").encode("utf-8")


def _bulk_request(es_host: str, body: bytes, timeout: int) -> dict[str, object]:
    req = urllib.request.Request(
        f"{es_host.rstrip('/')}/_bulk",
        data=body,
        headers={"Content-Type": "application/x-ndjson"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _bulk_once(es_host: str, es_index: str, docs: list[tuple[str, dict[str, object]]], timeout: int) -> tuple[int, list[tuple[str, dict[str, object]]], bool]:
    """Retourne (ok_count, failed_docs, has_retryable_error)."""
    payload = _build_ndjson(es_index, docs)
    result = _bulk_request(es_host, payload, timeout)
    ok_count = 0
    failed_docs: list[tuple[str, dict[str, object]]] = []
    has_retryable = False

    for idx, item in enumerate(result.get("items", [])):
        op = item.get("index", {})
        status = int(op.get("status", 0))
        if 200 <= status < 300:
            ok_count += 1
            continue

        if status in RETRYABLE_HTTP_CODES:
            failed_docs.append(docs[idx])
            has_retryable = True
            continue

        error = op.get("error", {})
        err_type = error.get("type", "unknown")
        err_reason = str(error.get("reason", ""))[:120]
        sys.stderr.write(f"[ES DROP] HTTP {status} | {err_type}: {err_reason}\n")

    return ok_count, failed_docs, has_retryable


def _bulk_with_retry(es_host: str, es_index: str, failed_dir: str, docs: list[tuple[str, dict[str, object]]],
                     max_retries: int, base_delay: float, timeout: int) -> tuple[int, int, int]:
    docs_ok = 0
    docs_retried = 0
    remaining = docs

    for attempt in range(max_retries):
        try:
            ok, retryable_failed, has_retryable = _bulk_once(es_host, es_index, remaining, timeout)
            docs_ok += ok
            if not retryable_failed:
                return docs_ok, docs_retried, 0

            docs_retried += len(retryable_failed)
            remaining = retryable_failed
            if attempt < max_retries - 1 and has_retryable:
                delay = min(30.0, base_delay * (2 ** attempt)) * (1 + random.random() * 0.25)
                time.sleep(delay)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == max_retries - 1:
                sys.stderr.write(f"[BULK FAIL] retries épuisés: {exc}\n")
                break
            delay = min(30.0, base_delay * (2 ** attempt)) * (1 + random.random() * 0.25)
            time.sleep(delay)

    os.makedirs(failed_dir, exist_ok=True)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    out_path = os.path.join(failed_dir, f"failed_{ts}.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter="|")
        for _, doc in remaining:
            writer.writerow([
                doc.get("seq_number", ""), doc.get("type_appel", ""), doc.get("statut_appel", ""),
                doc.get("cause_liberation", ""), doc.get("facturation", ""), (doc.get("date_debut") or "")[:10],
                doc.get("heure_debut", ""), doc.get("duree_sec", ""), (doc.get("date_fin") or "")[:10],
                doc.get("heure_fin", ""), doc.get("numero_appelant", ""), doc.get("numero_appele", ""),
                doc.get("imsi_appelant", ""), doc.get("imei_appelant", ""), doc.get("cgi", ""),
                doc.get("route_reseau", ""), doc.get("device_id", ""), doc.get("fichier_source", ""),
            ])
    sys.stderr.write(f"[SAVED] {len(remaining)} docs → {out_path}\n")
    return docs_ok, docs_retried, len(remaining)


def split_docs(docs: list[tuple[str, dict[str, object]]], max_docs: int, max_bytes: int, es_index: str) -> list[list[tuple[str, dict[str, object]]]]:
    batches: list[list[tuple[str, dict[str, object]]]] = []
    current: list[tuple[str, dict[str, object]]] = []
    current_bytes = 0

    for item in docs:
        est_bytes = len(json.dumps({"index": {"_index": es_index, "_id": item[0]}}, ensure_ascii=False))
        est_bytes += len(json.dumps(item[1], ensure_ascii=False)) + 2
        if current and (len(current) >= max_docs or current_bytes + est_bytes > max_bytes):
            batches.append(current)
            current = []
            current_bytes = 0
        current.append(item)
        current_bytes += est_bytes

    if current:
        batches.append(current)
    return batches


class DirectoryWatcher(threading.Thread):
    def __init__(self, input_dir: str, file_queue: Queue[str], poll_interval: float, logger: logging.Logger):
        super().__init__(daemon=True)
        self.input_dir = Path(input_dir)
        self.file_queue = file_queue
        self.poll_interval = poll_interval
        self.logger = logger
        self._stop_event = threading.Event()
        self._seen: set[str] = set()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        self.logger.info("👁  Watch %s (poll=%.2fs)", self.input_dir, self.poll_interval)
        while not self._stop_event.is_set():
            try:
                files = [p for p in self.input_dir.iterdir() if p.is_file() and "csv" in p.name.lower()]
                current = {str(p) for p in files}
                for path in sorted(current - self._seen):
                    self.file_queue.put(path)
                self._seen = current
            except Exception as exc:
                self.logger.warning("Erreur watcher: %s", exc)
            self._stop_event.wait(self.poll_interval)


def health_monitor(es_host: str, state: ClusterState, stop_event: threading.Event,
                   interval: int, logger: logging.Logger) -> None:
    while not stop_event.is_set():
        try:
            with urllib.request.urlopen(f"{es_host.rstrip('/')}/_cluster/health", timeout=5) as r:
                data = json.loads(r.read())
            status = str(data.get("status", "unknown"))
            state.set_status(status)
        except Exception as exc:
            logger.warning("Health check ES échoué: %s", exc)
            state.set_status("unknown")
        stop_event.wait(interval)


def process_files_to_docs(batch: list[str], delete_on_success: bool) -> tuple[list[tuple[str, dict[str, object]]], int, int, int]:
    docs: list[tuple[str, dict[str, object]]] = []
    files_ok = files_err = files_del = 0
    for filepath in batch:
        try:
            file_docs = _parse_file(filepath)
            if not file_docs:
                raise ValueError("Aucune ligne valide")
            docs.extend(file_docs)
            files_ok += 1
            if delete_on_success:
                os.unlink(filepath)
                files_del += 1
        except Exception as exc:
            files_err += 1
            sys.stderr.write(f"[FILE ERR] {filepath}: {exc}\n")
    return docs, files_ok, files_err, files_del


def main() -> None:
    args = parse_args()
    logger = setup_logging(args.log_level)
    stats = Stats()
    stop_event = threading.Event()
    cluster_state = ClusterState()

    os.makedirs(args.failed_dir, exist_ok=True)

    def shutdown_handler(_sig, _frame):
        logger.info("⛔ Arrêt demandé")
        stop_event.set()

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    file_queue: Queue[str] = Queue()
    docs_queue: Queue[list[tuple[str, dict[str, object]]]] = Queue(maxsize=max(1, args.max_queue_batches))

    watcher = DirectoryWatcher(args.input_dir, file_queue, args.poll_interval, logger)
    watcher.start()

    threading.Thread(
        target=health_monitor,
        args=(args.es_host, cluster_state, stop_event, args.cluster_health_interval, logger),
        daemon=True,
    ).start()

    def stats_loop() -> None:
        while not stop_event.is_set():
            stop_event.wait(args.stats_interval)
            stats.report(logger)

    threading.Thread(target=stats_loop, daemon=True).start()

    parse_pool = ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8)))
    bulk_pool = ThreadPoolExecutor(max_workers=max(1, args.workers))

    parse_futures = set()
    bulk_futures = set()

    delete_on_success = not args.no_delete
    logger.info(
        "🚀 Démarrage | workers=%s | batch=%s files | bulk=%s docs/%s bytes | queue=%s",
        args.workers,
        args.batch_size,
        args.bulk_size,
        f"{args.bulk_max_bytes:,}",
        args.max_queue_batches,
    )

    while not stop_event.is_set() or not file_queue.empty() or parse_futures or not docs_queue.empty() or bulk_futures:
        batch: list[str] = []
        try:
            while len(batch) < args.batch_size:
                batch.append(file_queue.get(timeout=0.05))
        except Empty:
            pass

        if batch:
            parse_futures.add(parse_pool.submit(process_files_to_docs, batch, delete_on_success))

        done_parse = {f for f in parse_futures if f.done()}
        for fut in done_parse:
            parse_futures.remove(fut)
            docs, files_ok, files_err, files_del = fut.result()
            stats.record(files_ok=files_ok, files_err=files_err, files_del=files_del)
            if docs:
                for chunk in split_docs(docs, args.bulk_size, args.bulk_max_bytes, args.es_index):
                    docs_queue.put(chunk)

        while not docs_queue.empty() and len(bulk_futures) < max(1, args.workers):
            if cluster_state.get_status() == "red":
                time.sleep(args.cluster_red_pause)
                break
            chunk = docs_queue.get()
            bulk_futures.add(
                bulk_pool.submit(
                    _bulk_with_retry,
                    args.es_host,
                    args.es_index,
                    args.failed_dir,
                    chunk,
                    args.max_retries,
                    args.retry_base_delay,
                    args.request_timeout,
                )
            )

        done_bulk = {f for f in bulk_futures if f.done()}
        for fut in done_bulk:
            bulk_futures.remove(fut)
            ok, retried, saved = fut.result()
            stats.record(docs_ok=ok, docs_retried=retried, docs_saved=saved, docs_failed=saved)

        if not batch and not done_parse and not done_bulk:
            time.sleep(0.02)

    parse_pool.shutdown(wait=True)
    bulk_pool.shutdown(wait=True)
    watcher.stop()
    stats.report(logger)
    logger.info("✅ Arrêt propre")


if __name__ == "__main__":
    main()
