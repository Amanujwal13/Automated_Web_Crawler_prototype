from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import gc
from pathlib import Path
import sys
import time
from typing import TextIO

from cleaner import clean_html
from config import Config, load_config
from exporters import export_json
from extractors import ExtractionError, extract_record
from fetcher import FetchBlocked, FetchFailed, fetch_html
from profiles import Profile, load_profile
from robots import is_allowed
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
from urlcheck import UrlRejected, validate_url


def log_message(msg: str, log_file: TextIO | None = None) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_iso}] {msg}"
    print(formatted)
    if log_file:
        log_file.write(formatted + "\n")
        log_file.flush()


def _process_url(
    url: str,
    run_id: str,
    config: Config,
    profile: Profile,
    db_path: Path,
    log_file: TextIO,
) -> bool:
    try:
        # 1. URL validation
        validate_url(url)

        # 2. Check robots.txt
        if not is_allowed(url, config.user_agent):
            msg = f"[BLOCKED] {url} -> Disallowed by robots.txt"
            mark_blocked(run_id, url, "Disallowed by robots.txt", db_path=db_path)
            log_message(msg, log_file)
            return False

        # 3. Fetch HTML in headless browser
        fetch_res = asyncio.run(fetch_html(url, config))

        # 4. Browser is closed inside fetch_html; enforce garbage collection
        gc.collect()

        # 5. Clean HTML
        cleaned = clean_html(fetch_res.html, config.clean.strip_tags)

        # 6. Extract record
        record = extract_record(
            cleaned_html=cleaned.html,
            profile=profile,
            source_url=url,
            final_url=fetch_res.final_url,
        )

        # 7. Save to SQLite
        mark_done(run_id, url, record, db_path=db_path)
        title = record.get("title", "Untitled")
        log_message(f"[DONE] {url} -> Extracted: '{title}'", log_file)
        return True

    except FetchBlocked as e:
        mark_blocked(run_id, url, str(e), db_path=db_path)
        log_message(f"[BLOCKED] {url} -> {e}", log_file)
        return False
    except (UrlRejected, FetchFailed, ExtractionError) as e:
        mark_failed(run_id, url, str(e), db_path=db_path)
        log_message(f"[FAILED] {url} -> {e}", log_file)
        return False
    except Exception as e:
        mark_failed(run_id, url, f"Unexpected error: {e}", db_path=db_path)
        log_message(f"[FAILED] {url} -> Unexpected error: {e}", log_file)
        return False


def _get_existing_run_output_dir(run_id: str, db_path: Path) -> Path:
    with get_connection(db_path) as conn:
        cursor = conn.execute("SELECT output_dir FROM runs WHERE id = ?;", (run_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Run ID '{run_id}' not found in database {db_path}")
        return Path(row[0])


def main() -> int:
    parser = argparse.ArgumentParser(description="Web Crawler Prototype (Stage 1)")
    parser.add_argument("--urls", type=str, help="Path to file containing URLs to crawl")
    parser.add_argument("--resume", type=str, help="Run ID to resume crawling")
    parser.add_argument("--config", type=str, default="config.yaml", help="Path to config.yaml")

    args = parser.parse_args()

    if (args.urls is None and args.resume is None) or (args.urls and args.resume):
        print("Error: Specify exactly one of --urls or --resume.", file=sys.stderr)
        return 2

    try:
        config = load_config(args.config)
        profile = load_profile(config.profile)
    except Exception as e:
        print(f"Configuration or profile error: {e}", file=sys.stderr)
        return 2

    db_path = config.db_path

    if args.urls:
        urls_file = Path(args.urls)
        if not urls_file.is_file():
            print(f"Error: URLs file not found: {urls_file}", file=sys.stderr)
            return 2
        url_list = [line.strip() for line in urls_file.read_text(encoding="utf-8").splitlines()]
        url_list = [u for u in url_list if u and not u.startswith("#")]
        if not url_list:
            print(f"Error: URLs file {urls_file} contains no valid URLs.", file=sys.stderr)
            return 2

        # Create fresh run
        run_output_dir = config.output_root / "temp_placeholder"
        run_id = create_run(run_output_dir, db_path=db_path)
        actual_output_dir = config.output_root / run_id
        # Update output_dir for run
        with get_connection(db_path) as conn:
            conn.execute("UPDATE runs SET output_dir = ? WHERE id = ?;", (str(actual_output_dir), run_id))
        add_urls(run_id, url_list, db_path=db_path)
    else:
        run_id = str(args.resume)
        try:
            actual_output_dir = _get_existing_run_output_dir(run_id, db_path)
        except Exception as e:
            print(f"Error loading resume run: {e}", file=sys.stderr)
            return 2

    actual_output_dir.mkdir(parents=True, exist_ok=True)
    log_file_path = actual_output_dir / "run.log"

    with log_file_path.open("a", encoding="utf-8") as log_file:
        log_message(f"Starting run '{run_id}' with output directory: {actual_output_dir}", log_file)
        pending_urls = pending(run_id, db_path=db_path)
        log_message(f"Found {len(pending_urls)} pending URLs to process", log_file)

        for i, url in enumerate(pending_urls):
            _process_url(url, run_id, config, profile, db_path, log_file)
            if i < len(pending_urls) - 1 and config.request_delay_seconds > 0:
                time.sleep(config.request_delay_seconds)

    is_resumed = bool(args.resume)
    done_records = records(run_id, db_path=db_path)
    if done_records:
        export_file = export_json(done_records, actual_output_dir, overwrite=is_resumed)
        print(f"Run completed. Exported {len(done_records)} records to: {export_file}")
        return 0
    else:
        # Write valid empty array if no records were produced
        export_file = export_json([], actual_output_dir, overwrite=is_resumed)
        print(f"Run completed with 0 records. Exported empty dataset to: {export_file}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
