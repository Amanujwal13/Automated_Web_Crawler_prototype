# Web Crawler Prototype (Stage 1) Implementation Plan

Stage 1 builds a robust, sequential, rule-based command-line web crawler targeting `books.toscrape.com`. It establishes a clean pipeline—validating URLs, checking robots compliance, fetching headless rendered pages with Chromium, stripping noise, extracting book records using CSS selectors, persisting runs and records in SQLite, and exporting clean JSON datasets.

## User Review & Critical Decisions

> [!IMPORTANT]
> The implementation will proceed **module-by-module**. Before creating or editing code for each part, we will request your confirmation. Each completed module will be verified with dedicated unit tests in `pytest` and committed to git with a clear commit message.

- **Confirmed Specification**: Guided strictly by `crawler_prototype_prompt.md`. Stage 1 strictly excludes LLMs/AI APIs, UI/Streamlit, concurrency, and unknown site extraction.
- **Codebase Location**: `crawler/` directory with its own isolated git repository.
- **Execution Strategy**: Part-by-part progression with explicit user sign-off before executing each milestone.
- **Fixture Data**: Live fixture `tests/fixtures/book_1.html` captured strictly from `books.toscrape.com` and matched with verified `book_1.expected.json`.

---

## 1. Overview & Core Concept

- **What It Does**: A CLI utility that ingests a list of URLs (or resumes an existing run), sequentially processes each URL through validation, robots compliance, and headless fetch, executes aggressive garbage collection, parses the DOM, extracts book metadata (title, price, UPC, availability), records execution status into SQLite, and outputs structured JSON.
- **Target Audience & Purpose**: Senior engineers requiring a deterministic, auditable baseline for scraping workflows that can be extended in Stage 2 with AI fallback and generic extraction without breaking interfaces.
- **Key Value**: Fail-safe sequential execution with zero memory leaks, strict SSRF/network protection, parameter-driven SQLite resumption, and 100% offline test coverage.

---

## 2. CLI Workflow & Execution Interface

Since Stage 1 explicitly prohibits UI or Streamlit tools, the user experience centers around an ergonomic terminal interface and transparent run logging:

```
$ python main.py --urls urls.txt
[2026-10-23 11:30:01] RUN-20261023-113001-a1b2 started
[2026-10-23 11:30:02] [VALIDATE]  https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html -> OK
[2026-10-23 11:30:02] [ROBOTS]    robots.txt allowed
[2026-10-23 11:30:05] [FETCH]     200 OK (Chromium headless, 1280x800)
[2026-10-23 11:30:05] [CLEAN]     Stripped 6 noise tags, text condensed
[2026-10-23 11:30:05] [EXTRACT]   Book: 'A Light in the Attic' (UPC: a897fe39b1053632)
[2026-10-23 11:30:05] [STORE]     Saved to SQLite (status: done)
...
[2026-10-23 11:30:20] Run completed: 5 done, 0 blocked, 0 failed.
[2026-10-23 11:30:20] Data exported to output/20261023-113001-a1b2/data.json
```

- **Resumption Flow**: `python main.py --resume 20261023-113001-a1b2` queries SQLite for pending/interrupted URLs and resumes seamlessly without re-fetching completed items.
- **File Artifacts per Run**:
  - `output/<run_id>/run.log`: Timestamped diagnostic trail identical to terminal logs.
  - `output/<run_id>/data.json`: Pretty-printed UTF-8 JSON array of all successfully extracted records.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Sequential Lifecycle with Explicit Browser Teardown**
  - *Chosen Approach*: Open a Chromium page context per URL, extract raw HTML, immediately close the page and browser context in a `finally` block, trigger `gc.collect()`, and only then hand the string to BeautifulSoup.
  - *Why*: Eliminates memory leaks and browser zombie processes when running batch jobs over hundreds of pages.
  - *Alternatives Considered*: Reusing browser contexts or concurrent pooling (rejected per Stage 1 hard constraints).

- **Decision 2: Strict SSRF & Address Space Rejection in URL Validation**
  - *Chosen Approach*: Parse URLs with `urllib.parse`, check length (<2048 chars), resolve DNS via `socket.getaddrinfo`, and validate all resolved IPs using Python's `ipaddress` module against private, loopback, link-local, multicast, and reserved CIDR blocks.
  - *Why*: Protects local infrastructure and cloud metadata services from server-side request forgery even if malformed seeds are provided.

- **Decision 3: Schema-Forward SQLite Database**
  - *Chosen Approach*: Provision the exact `runs` and `urls` schema required for both Stage 1 and Stage 2 upfront, using parameterized queries and run IDs formatted as `YYYYMMDD-HHMMSS-xxxx`.
  - *Why*: Ensures Stage 2 can operate directly against Stage 1 databases without schema migrations.

---

## 4. Technical Architecture & Sequential Pipeline

### System Architecture Diagram

```
                ┌─────────────────────────────────────────────────────────┐
                │                       main.py                           │
                │     CLI flags: --urls <file>  |  --resume <run_id>      │
                └───────────────────────────┬─────────────────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────┐
                                │     config.py        │
                                │   (config.yaml)      │
                                └───────────┬──────────┘
                                            │
               ┌────────────────────────────┼─────────────────────────────┐
               ▼                            ▼                             ▼
       ┌───────────────┐            ┌───────────────┐             ┌───────────────┐
       │   store.py    │            │  profiles.py  │             │   robots.py   │
       │ SQLite (runs, │            │ (books.yaml & │             │ Cached parser │
       │     urls)     │            │  Pydantic)    │             │   per host    │
       └───────┬───────┘            └───────┬───────┘             └───────┬───────┘
               │                            │                             │
               │                            │                             │
    ┌──────────┴────────────────────────────┴─────────────────────────────┴──────────┐
    │                               Sequential Run Loop                              │
    │                                                                                │
    │  1. urlcheck.py ────> validate_url (SSRF checks, DNS resolution)               │
    │  2. robots.py   ────> is_allowed check                                         │
    │  3. fetcher.py  ────> Playwright Chromium (block images/media/fonts)           │
    │  4. Browser Context Closed ──> gc.collect()                                    │
    │  5. cleaner.py  ────> BeautifulSoup + lxml (strip script/style/nav/footer)     │
    │  6. extractors.py ──> CSS selector & table_row extraction                      │
    │  7. store.py    ────> mark_done / mark_blocked / mark_failed                   │
    │  8. Delay       ────> wait request_delay_seconds                               │
    └───────────────────────────────────────┬────────────────────────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │     exporters.py      │
                                │   output/<id>/data.   │
                                │         json          │
                                └───────────────────────┘
```

### Module Breakdown & Step-by-Step Implementation Sequence

Each step will be confirmed with you before code creation or modification:

1. **Step 1: Environment Setup & Project Scaffolding**
   - Initialize `crawler/` directory and local git repository.
   - Create pinned `requirements.txt` (`playwright`, `beautifulsoup4`, `lxml`, `pydantic`, `pyyaml`, `pytest`).
   - Install dependencies and install Playwright Chromium browser binaries.
   - Create initial `.gitignore` and `config.yaml`.

2. **Step 2: Configuration & Profile Modules**
   - `config.py`: Dataclass parsing and validating `config.yaml` with strict key/type checks.
   - `profiles/books.yaml`: Field definitions for title, price, UPC, availability.
   - `profiles.py`: Domain matcher and dynamic Pydantic model generator via `pydantic.create_model`.

3. **Step 3: Network Safety & Compliance Modules**
   - `urlcheck.py`: RFC-compliant URL parser, scheme verification, length bounds (<2048), DNS resolver, and IP address safety validator.
   - `robots.py`: Cached `urllib.robotparser` wrapper respecting HTTP 401/403/404 conventions.
   - Unit tests: `tests/test_urlcheck.py` and `tests/test_robots.py` (fully offline with mocked DNS and robots responses).

4. **Step 4: Cleaner & Extractor Modules with Verified Fixtures**
   - Live fixture download: Save authentic page from `books.toscrape.com` to `tests/fixtures/book_1.html` and define `tests/fixtures/book_1.expected.json`.
   - `cleaner.py`: HTML cleaner removing specified tags and condensing visible text.
   - `extractors.py`: CSS selector and `table_row` extractor enforcing required fields and metadata attribution (`source_url`, `final_url`, `domain`, `fetched_at`).
   - Unit tests: `tests/test_cleaner.py` and `tests/test_extractors.py`.

5. **Step 5: Storage & Export Modules**
   - `store.py`: SQLite engine handling `runs` and `urls` tables, parameterized queries, run ID generation (`YYYYMMDD-HHMMSS-xxxx`), status transitions, and error truncation.
   - `exporters.py`: Atomic JSON serialization to `output/<run_id>/data.json`.
   - Unit tests: `tests/test_store.py` and `tests/test_exporters.py`.

6. **Step 6: Headless Fetcher & CLI Pipeline**
   - `fetcher.py`: Playwright async scraper with route aborting for blocked resource types (`image`, `media`, `font`), redirect validation, and status classification (403 blocked, 429 failed).
   - `main.py`: Full CLI orchestration supporting `--urls` and `--resume`, error isolation per URL, run logging, and standard exit codes (0 = records produced, 1 = none produced, 2 = argument/config error).
   - `urls.txt`: Sample test target seed list containing live book URLs from `books.toscrape.com`.
   - `README.md`: Concise operator documentation.

7. **Step 7: Verification & Git Commit Checkpoints**
   - Run complete offline `pytest` suite ensuring 100% pass rate.
   - Run live end-to-end sample crawl on `books.toscrape.com` to verify SQLite records and generated `data.json`.
