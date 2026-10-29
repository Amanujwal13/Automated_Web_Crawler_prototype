from __future__ import annotations

from pathlib import Path
from store import add_urls, create_run, mark_failed, pending, retry_failed


def test_retry_failed_resets_failed_urls_to_pending(tmp_path: Path):
    db_file = tmp_path / "test_retry.db"
    run_id = create_run(tmp_path / "out", db_path=db_file)
    urls = ["https://example.com/1", "https://example.com/2"]
    add_urls(run_id, urls, db_path=db_file)

    # Fail one URL
    mark_failed(run_id, "https://example.com/1", "Connection timeout", db_path=db_file)

    # Initially only https://example.com/2 is pending
    assert pending(run_id, db_path=db_file) == ["https://example.com/2"]

    # Trigger retry_failed
    count = retry_failed(run_id, db_path=db_file)
    assert count == 1

    # Both URLs are now pending again
    assert set(pending(run_id, db_path=db_file)) == {"https://example.com/1", "https://example.com/2"}
