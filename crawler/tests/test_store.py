from __future__ import annotations

from pathlib import Path
import sqlite3
import pytest

from store import (
    add_urls,
    create_run,
    get_connection,
    mark_blocked,
    mark_done,
    mark_failed,
    pending,
    records,
)


@pytest.fixture
def test_db(tmp_path: Path) -> Path:
    return tmp_path / "test_crawl.db"


def test_create_run_and_schema_initialization(test_db: Path, tmp_path: Path) -> None:
    out_dir = tmp_path / "output_1"
    run_id = create_run(out_dir, db_path=test_db)
    assert run_id is not None
    assert "-" in run_id

    # Verify runs table row
    with get_connection(test_db) as conn:
        cursor = conn.execute("SELECT id, output_dir FROM runs WHERE id = ?;", (run_id,))
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == run_id
        assert row[1] == str(out_dir)


def test_add_urls_and_pending(test_db: Path, tmp_path: Path) -> None:
    run_id = create_run(tmp_path / "out", db_path=test_db)
    urls = [
        "https://books.toscrape.com/catalogue/book1.html",
        "https://books.toscrape.com/catalogue/book2.html",
        "https://books.toscrape.com/catalogue/book3.html",
    ]
    add_urls(run_id, urls, db_path=test_db)

    # Adding duplicates should be ignored due to INSERT OR IGNORE
    add_urls(run_id, urls[:1], db_path=test_db)

    pending_urls = pending(run_id, db_path=test_db)
    assert pending_urls == urls


def test_status_transitions_and_resume_pending(test_db: Path, tmp_path: Path) -> None:
    run_id = create_run(tmp_path / "out", db_path=test_db)
    u1 = "https://books.toscrape.com/catalogue/book1.html"
    u2 = "https://books.toscrape.com/catalogue/book2.html"
    u3 = "https://books.toscrape.com/catalogue/book3.html"
    add_urls(run_id, [u1, u2, u3], db_path=test_db)

    # Transition u1 to done
    rec1 = {"title": "Book 1", "price": "£10.00"}
    mark_done(run_id, u1, rec1, db_path=test_db)

    # Transition u2 to blocked
    mark_blocked(run_id, u2, "Robots disallowed", db_path=test_db)

    # Transition u3 to failed with error > 500 chars to verify truncation
    long_error = "x" * 600
    mark_failed(run_id, u3, long_error, db_path=test_db)

    # Verify pending returns only uncompleted URLs (should be empty now)
    assert pending(run_id, db_path=test_db) == []

    # Verify records returns done records
    done_records = records(run_id, db_path=test_db)
    assert len(done_records) == 1
    assert done_records[0]["title"] == "Book 1"

    # Verify error truncation in database
    with get_connection(test_db) as conn:
        cursor = conn.execute("SELECT error FROM urls WHERE run_id = ? AND url = ?;", (run_id, u3))
        err = cursor.fetchone()[0]
        assert len(err) == 500


def test_sql_injection_safety_parameterized(test_db: Path, tmp_path: Path) -> None:
    run_id = create_run(tmp_path / "out", db_path=test_db)
    malicious_url = "https://books.toscrape.com/'; DROP TABLE urls; --"
    add_urls(run_id, [malicious_url], db_path=test_db)

    pending_urls = pending(run_id, db_path=test_db)
    assert malicious_url in pending_urls

    # Table should still exist intact
    with get_connection(test_db) as conn:
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='urls';")
        assert cursor.fetchone() is not None
