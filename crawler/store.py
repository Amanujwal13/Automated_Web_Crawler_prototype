from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import sqlite3
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    output_dir TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS urls (
    run_id TEXT NOT NULL REFERENCES runs(id),
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    record TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, url)
);
"""


def get_connection(db_path: Path | str = "crawl.db") -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.executescript(SCHEMA)
    return conn


def generate_run_id() -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = secrets.token_hex(2)
    return f"{now_str}-{suffix}"


def create_run(output_dir: Path | str, db_path: Path | str = "crawl.db") -> str:
    run_id = generate_run_id()
    created_at = datetime.now(timezone.utc).isoformat()
    out_str = str(Path(output_dir))
    with get_connection(db_path) as conn:
        conn.execute(
            "INSERT INTO runs (id, created_at, output_dir) VALUES (?, ?, ?);",
            (run_id, created_at, out_str),
        )
    return run_id


def add_urls(run_id: str, urls: list[str], db_path: Path | str = "crawl.db") -> None:
    with get_connection(db_path) as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO urls (run_id, url, status) VALUES (?, ?, 'pending');",
            [(run_id, u) for u in urls],
        )


def pending(run_id: str, db_path: Path | str = "crawl.db") -> list[str]:
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            "SELECT url FROM urls WHERE run_id = ? AND status = 'pending' ORDER BY rowid ASC;",
            (run_id,),
        )
        return [row[0] for row in cursor.fetchall()]


def mark_done(
    run_id: str,
    url: str,
    record: dict[str, Any] | str,
    db_path: Path | str = "crawl.db",
) -> None:
    rec_str = record if isinstance(record, str) else json.dumps(record, ensure_ascii=False)
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE urls
            SET status = 'done',
                record = ?,
                error = NULL,
                attempts = attempts + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = ? AND url = ?;
            """,
            (rec_str, run_id, url),
        )


def mark_blocked(
    run_id: str,
    url: str,
    error: str,
    db_path: Path | str = "crawl.db",
) -> None:
    truncated_error = str(error)[:500]
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE urls
            SET status = 'blocked',
                error = ?,
                attempts = attempts + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = ? AND url = ?;
            """,
            (truncated_error, run_id, url),
        )


def mark_failed(
    run_id: str,
    url: str,
    error: str,
    db_path: Path | str = "crawl.db",
) -> None:
    truncated_error = str(error)[:500]
    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE urls
            SET status = 'failed',
                error = ?,
                attempts = attempts + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = ? AND url = ?;
            """,
            (truncated_error, run_id, url),
        )


def records(run_id: str, db_path: Path | str = "crawl.db") -> list[dict[str, Any]]:
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            "SELECT record FROM urls WHERE run_id = ? AND status = 'done' AND record IS NOT NULL ORDER BY rowid ASC;",
            (run_id,),
        )
        results: list[dict[str, Any]] = []
        for (rec_str,) in cursor.fetchall():
            try:
                results.append(json.loads(rec_str))
            except json.JSONDecodeError:
                continue
        return results
