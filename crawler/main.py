from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import gc
from pathlib import Path
import sys
from typing import TextIO
from urllib.parse import urlparse

from cleaner import clean_html
from config import Config, load_config
from exporters import export_all, export_json
from extractors import ExtractionError, extract_auto
from fetcher import FetchBlocked, FetchFailed, fetch_html
from llm_client import LLMClient
from profiles import (
    Profile,
    find_profile_for_domain,
    load_profile,
    load_profiles_dir,
    matches_domain,
)
from robots import is_allowed
from store import (
    add_urls,
    create_run,
    generate_run_id,
    get_connection,
    mark_blocked,
    mark_done,
    mark_failed,
    pending,
    records,
    retry_failed,
)
from urlcheck import UrlRejected, validate_url


def log_message(msg: str, log_file: TextIO | None = None) -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_iso}] {msg}"
    print(formatted)
    if log_file:
        log_file.write(formatted + "\n")
        log_file.flush()


async def _async_process_url(
    url: str,
    run_id: str,
    config: Config,
    profile: Profile | None,
    db_path: Path,
    log_file: TextIO,
    use_llm: bool = False,
    scroll: bool = False,
    llm_client: LLMClient | None = None,
    profiles: list[Profile] | None = None,
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

        # 3. Fetch HTML in headless browser asynchronously
        fetch_res = await fetch_html(url, config, scroll=scroll)

        # 4. Enforce memory isolation
        gc.collect()

        # 5. Clean HTML
        cleaned = clean_html(fetch_res.html, config.clean.strip_tags)

        # 6. Check if target URL matches profile domains
        target_host = urlparse(fetch_res.final_url or url).hostname or ""
        matched_profile = None
        if profiles:
            matched_profile = find_profile_for_domain(target_host, profiles)
        if not matched_profile and profile and profile.matches_domain(target_host):
            matched_profile = profile

        active_profile = matched_profile
        mode_label = f"PROFILE:{active_profile.name.upper()}" if active_profile else "GENERIC"

        # 7. Extract record
        record = extract_auto(
            cleaned_html=cleaned.html,
            profile=active_profile,
            source_url=url,
            final_url=fetch_res.final_url,
            use_llm=use_llm,
            llm_client=llm_client,
        )

        # 8. Save to SQLite
        mark_done(run_id, url, record, db_path=db_path)
        title = record.get("title", "Untitled")
        tables_cnt = len(record.get("tables", []))
        table_info = f" ({tables_cnt} tables)" if tables_cnt > 0 else ""
        log_message(f"[DONE] [{mode_label}] {url} -> Extracted: '{title}'{table_info}", log_file)
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


async def async_main(args: argparse.Namespace) -> int:
    try:
        config = load_config(args.config)
        profile = load_profile(config.profile)
        # Discover and load all profile configs in the profiles directory
        prof_file = Path(config.profile)
        profiles_dir = prof_file.parent if prof_file.is_file() else Path("profiles")
        available_profiles = load_profiles_dir(profiles_dir)
        if not any(p.name == profile.name for p in available_profiles):
            available_profiles.insert(0, profile)
    except Exception as e:
        print(f"Configuration or profile error: {e}", file=sys.stderr)
        return 2

    db_path = config.db_path
    use_llm = bool(getattr(args, "llm", False))
    scroll = bool(getattr(args, "scroll", False))
    llm_client = LLMClient() if use_llm else None

    # Handle URL inputs: direct positional URLs, --urls file, or --resume
    raw_urls = getattr(args, "url_args", None) or []
    if args.urls:
        urls_file = Path(args.urls)
        if not urls_file.is_file():
            print(f"Error: URLs file not found: {urls_file}", file=sys.stderr)
            return 2
        lines = [line.strip() for line in urls_file.read_text(encoding="utf-8").splitlines()]
        raw_urls.extend([u for u in lines if u and not u.startswith("#")])

    if raw_urls:
        url_list = list(dict.fromkeys(raw_urls))  # deduplicate preserving order
        run_id = generate_run_id()
        actual_output_dir = config.output_root / run_id
        create_run(actual_output_dir, db_path=db_path, run_id=run_id)
        add_urls(run_id, url_list, db_path=db_path)
    elif args.resume:
        run_id = str(args.resume)
        try:
            actual_output_dir = _get_existing_run_output_dir(run_id, db_path)
        except Exception as e:
            print(f"Error loading resume run: {e}", file=sys.stderr)
            return 2

        if getattr(args, "retry_failed", False):
            reset_count = retry_failed(run_id, db_path=db_path)
            if reset_count > 0:
                print(f"Reset {reset_count} previously failed URLs back to pending.")
    else:
        print("Error: Specify either URLs, --urls <file>, or --resume <run_id>.", file=sys.stderr)
        return 2

    actual_output_dir.mkdir(parents=True, exist_ok=True)
    log_file_path = actual_output_dir / "run.log"

    with log_file_path.open("a", encoding="utf-8") as log_file:
        mode_desc = f"[LLM: {'ENABLED' if use_llm else 'DISABLED'}, Scroll: {'ON' if scroll else 'OFF'}]"
        log_message(f"Starting Stage 2 run '{run_id}' {mode_desc} -> {actual_output_dir}", log_file)
        pending_urls = pending(run_id, db_path=db_path)
        log_message(f"Found {len(pending_urls)} pending URLs to process", log_file)

        for i, url in enumerate(pending_urls):
            await _async_process_url(
                url=url,
                run_id=run_id,
                config=config,
                profile=profile,
                db_path=db_path,
                log_file=log_file,
                use_llm=use_llm,
                scroll=scroll,
                llm_client=llm_client,
                profiles=available_profiles,
            )
            if i < len(pending_urls) - 1 and config.request_delay_seconds > 0:
                await asyncio.sleep(config.request_delay_seconds)

    is_resumed = bool(args.resume)
    done_records = records(run_id, db_path=db_path)

    # Multi-format exports (JSON, CSV, Excel, summary)
    export_all(done_records, actual_output_dir, run_id, overwrite=is_resumed)

    if done_records:
        print(f"Stage 2 run completed. Exported {len(done_records)} records to: {actual_output_dir}")
        return 0
    else:
        print(f"Stage 2 run completed with 0 records. Exported empty dataset to: {actual_output_dir}")
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Web Crawler Studio (Stage 2)")
    parser.add_argument("url_args", nargs="*", help="Optional single or multiple target URLs directly from CLI")
    parser.add_argument("--urls", type=str, help="Path to file containing URLs to crawl")
    parser.add_argument("--resume", type=str, help="Run ID to resume crawling")
    parser.add_argument("--config", type=str, default="config.yaml", help="Path to config.yaml")
    parser.add_argument("--llm", action="store_true", default=False, help="Enable optional Gemini LLM fallback")
    parser.add_argument("--no-llm", action="store_false", dest="llm", help="Explicitly disable LLM fallback (default)")
    parser.add_argument("--retry-failed", action="store_true", default=False, help="Retry previously failed URLs on resume")
    parser.add_argument("--scroll", action="store_true", default=False, help="Perform dynamic page scrolling for lazy content")

    args = parser.parse_args()

    has_urls = bool(args.url_args) or bool(args.urls)
    has_resume = bool(args.resume)

    if (not has_urls and not has_resume) or (has_urls and has_resume):
        print("Error: Specify either URLs/--urls, or --resume (not both).", file=sys.stderr)
        return 2

    return asyncio.run(async_main(args))


if __name__ == "__main__":
    sys.exit(main())
