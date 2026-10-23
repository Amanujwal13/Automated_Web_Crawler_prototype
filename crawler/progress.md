# Stage 1 Implementation Progress

This document tracks every milestone completed for the **Web Crawler Prototype (Stage 1)**, detailing architectural decisions, module deliverables, test verifications, and git commit history.

---

## Milestone 1: Environment Setup & Project Scaffolding
- **Objective**: Establish the isolated project environment and lock dependencies.
- **Deliverables**:
  - `crawler/.gitignore`: Excluded `.pytest_cache/`, `crawl.db`, `output/`, and Python cache artifacts.
  - `crawler/requirements.txt`: Pinned exact versions for all required packages:
    - `playwright==1.49.1`
    - `beautifulsoup4==4.12.3`
    - `lxml==5.3.0`
    - `pydantic==2.10.4`
    - `pyyaml==6.0.2`
    - `pytest==8.3.4`
  - `crawler/config.yaml`: Baseline runtime configuration matching the specification.
  - Git repository initialization (`git init`) and Playwright Chromium headless binaries installed (`python3 -m playwright install --with-deps chromium`).
- **Commit**: `chore: initialize crawler repository and dependencies` (`e40aa19`)

---

## Milestone 2: Configuration & Profile Modules
- **Objective**: Provide fail-fast configuration parsing and domain extraction profile loading with dynamic schema creation.
- **Deliverables**:
  - `crawler/config.py`:
    - Strict validation dataclasses: `Config`, `ViewportConfig`, and `CleanConfig`.
    - Validates key presence and types; reports exact missing keys or type errors.
  - `crawler/profiles/books.yaml`:
    - Declares selector and table extraction rules for `books.toscrape.com` (`title`, `price`, `upc`, `availability`).
  - `crawler/profiles.py`:
    - `load_profile(path)`: Rejects unknown keys reporting the file name.
    - `matches_domain(host)`: Case-insensitive domain and subdomain matching with leading `www.` stripped.
    - Dynamic Pydantic model creation via `pydantic.create_model` enforcing required and optional string fields.
- **Verification**: Verified configuration loader and profile domain matching script.
- **Commit**: `feat: implement configuration loader and domain profile matching` (`f51df7f`)

---

## Milestone 3: Network Safety & Compliance Modules
- **Objective**: Enforce SSRF protection, length bounds, and polite robots.txt compliance.
- **Deliverables**:
  - `crawler/urlcheck.py`:
    - Enforces length bounds (≤ 2048 characters) and HTTP/HTTPS schemes only.
    - Resolves hostnames via `socket.getaddrinfo` and checks all resolved IP addresses with the `ipaddress` module against loopback, private, link-local, multicast, reserved, and unspecified ranges.
    - Raises `UrlRejected(reason)` on any violation.
  - `crawler/robots.py`:
    - `is_allowed(url, user_agent)`: Cached per `scheme://netloc` using `urllib.robotparser.RobotFileParser`.
    - Handles status codes according to spec: HTTP 401/403 treated as disallowed, 404 as allowed, connection/timeout errors as disallowed.
  - `crawler/tests/test_urlcheck.py`: 16 offline unit tests covering public URLs, bad schemes, length limits, and private/loopback IPv4/IPv6 IPs with mocked DNS.
  - `crawler/tests/test_robots.py`: 6 offline unit tests covering allowed, disallowed, 404, 401, 403, and caching behaviors.
- **Verification**: 22 tests passed offline in `pytest`.
- **Commit**: `feat: implement URL validation with SSRF safety and robots compliance parser` (`c8a1897`)

---

## Milestone 4: Cleaner & Extractor Modules with Live Fixtures
- **Objective**: Clean noise tags, extract structured book records, and validate against verified live fixture data.
- **Deliverables**:
  - `crawler/tests/fixtures/book_1.html`: Live fixture captured directly from `books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`.
  - `crawler/tests/fixtures/book_1.expected.json`: Ground truth verification file matching extracted selector and table row values.
  - `crawler/cleaner.py`:
    - `clean_html(html, strip_tags)`: Strips `script`, `style`, `svg`, `noscript`, `nav`, and `footer` tags using BeautifulSoup with the `lxml` parser.
    - Collapses extra blank lines and returns `CleanedPage(html, text)`.
  - `crawler/extractors.py`:
    - `extract_record(cleaned_html, profile, source_url, final_url, fetched_at)`: Executes CSS selectors (`text` or HTML attribute) and `table_row` matching.
    - Raises `ExtractionError` on missing required fields.
    - Appends provenance metadata: `source_url`, `final_url`, `domain`, and ISO 8601 UTC `fetched_at`.
  - `crawler/tests/test_cleaner.py`: Verifies tag stripping and text preservation.
  - `crawler/tests/test_extractors.py`: Verifies exact match against `book_1.expected.json` and `ExtractionError` triggers.
- **Verification**: Full test suite grew to 25 passing tests in `pytest`.
- **Commit**: `feat: implement HTML cleaner, selector extractor, and verified fixtures` (`3864e5b`)

---

## Milestone 5: Persistent SQLite Storage & JSON Exporter
- **Objective**: Provide resumable runs and atomic dataset export.
- **Deliverables**:
  - `crawler/store.py`:
    - Initialized schema with `runs` and `urls` tables supporting Stage 1 and Stage 2 without future migration.
    - Run ID generation (`YYYYMMDD-HHMMSS-xxxx`).
    - Functions: `create_run`, `add_urls` (`INSERT OR IGNORE`), `pending`, `mark_done`, `mark_blocked`, `mark_failed` (500-character error truncation), and `records`.
    - Fully parameterized SQL statements.
  - `crawler/exporters.py`:
    - `export_json(records, output_dir, overwrite)`: Writes `output/<run_id>/data.json` with UTF-8 encoding, `indent=2`, and `ensure_ascii=False`.
    - Prevents overwriting fresh run folders; exports `[]` for empty runs.
  - `crawler/tests/test_store.py`: 4 tests verifying table creation, status transitions, resumption query filters, and SQL injection safety.
  - `crawler/tests/test_exporters.py`: 3 tests verifying valid JSON, UTF-8 integrity, empty list export, and overwrite protection.
- **Verification**: Full test suite reached 32 passing tests in `pytest`.
- **Commit**: `feat: implement SQLite persistent storage and JSON exporter with unit tests` (`2119a97`)

---

## Milestone 6: Headless Fetcher, Sequential Pipeline & CLI
- **Objective**: Orchestrate the full end-to-end pipeline under strict sequential and memory constraints.
- **Deliverables**:
  - `crawler/fetcher.py`:
    - Playwright Chromium headless runner using fresh browser contexts per URL.
    - Aborts network requests for `image`, `media`, and `font` via `page.route`.
    - Navigates with `wait_until="domcontentloaded"` and configured timeout.
    - Closes browser context strictly inside a `finally` block before returning `FetchResult`.
    - Runs redirect destination validation via `validate_url` and raises `FetchBlocked` on HTTP 403 or `FetchFailed` on HTTP 429.
  - `crawler/main.py`:
    - CLI supporting batch mode (`--urls <file>`) and resume mode (`--resume <run_id>`).
    - Sequential loop: `validate_url` -> `is_allowed` -> `fetch_html` -> `gc.collect()` -> `clean_html` -> `extract_record` -> SQLite update -> `sleep(request_delay_seconds)`.
    - Per-URL error isolation (`try/except`).
    - Writes dual log output to console and `output/<run_id>/run.log`.
    - Exports completed records to `output/<run_id>/data.json`.
    - Exit codes: `0` (success with records), `1` (0 records), `2` (invalid arguments or configuration).
  - `crawler/urls.txt`: Seed list of 5 book URLs from `books.toscrape.com`.
  - `crawler/README.md`: Concise operational documentation.
- **Commit**: `feat: implement Playwright fetcher, sequential CLI pipeline, urls.txt, and README` (`a7b7a3f`)

---

## Milestone 7: Live Verification & Resume Hardening
- **Objective**: Execute end-to-end crawl against live `books.toscrape.com` and verify resume functionality.
- **Verification**:
  - Live execution of `python main.py --urls urls.txt` crawled all 5 books sequentially and exported `output/20261023-120154-0432/data.json` with 5 structured records.
  - Executed `python main.py --resume 20261023-120154-0432`, verifying 0 pending URLs and clean re-export handling.
  - All 32 offline unit tests pass with 100% success rate.
- **Commit**: `fix: allow resumed runs to re-export updated datasets` (`e217f5f`)

---

## Milestone 8: Full-Stack Web Interaction Interface
- **Objective**: Build an interactive web control console allowing users to operate the crawler, inspect records, monitor live execution logs, and run tests.
- **Deliverables**:
  - `crawler/api_bridge.py`: Python CLI bridge querying SQLite runs, detail items, and executing pytest with structured JSON output.
  - `server.ts`: Express full-stack server mounting Vite middleware in dev and exposing `/api/status`, `/api/runs`, `/api/runs/:id`, `/api/runs/:id/log`, `/api/runs/:id/data`, `/api/crawl`, `/api/resume`, and `/api/tests/run`.
  - `src/App.tsx`: Interactive single-page dashboard featuring:
    - **Crawl Console**: Interactive URL queue input, preset book selectors, live terminal with colorized status tags (`[DONE]`, `[BLOCKED]`, `[FAILED]`), and real-time execution monitoring.
    - **Extracted Records Explorer**: Searchable and filterable dataset view displaying book titles, prices, UPC codes, availability, provenance links, and 1-click JSON copy/export.
    - **Run History Hub**: SQLite runs table showing timestamps, completion stats, and 1-click run resumption.
    - **Test Suite Runner**: Interactive 32-test offline unit test runner displaying real-time pytest diagnostics.
    - **Rules & Safety Inspector**: Visual display of `books.yaml` CSS selectors and compliance policies.
  - Synchronized `metadata.json` and `index.html` with application name and descriptions.
- **Commit**: `feat: add api_bridge and update progress.md with milestone 8` (`8d07ded`)

---

## Milestone 9: Dedicated Extraction Bar, Local Drive Download & Purple Palette
- **Objective**: Refine web interaction ergonomics with an instant URL paste bar, local drive download triggers, and cohesive branded color palette.
- **Deliverables**:
  - **Prominent Extraction Bar**:
    - High-visibility header bar allowing users to paste single or multi-line links from `books.toscrape.com`.
    - Integrated 1-click **Paste Link** (clipboard API), input clear button, and quick-select preset chips.
    - Prominent **Extract Data** CTA with real-time URL counter.
  - **Local Drive Direct Download**:
    - High-contrast **Download Local File** action in the header and dataset explorer.
    - Generates client-side blob download saving `books_extracted_<id>.json` directly to the user's local Downloads folder.
    - Secondary CSV download option (`books_extracted_<id>.csv`) for spreadsheet inspection.
    - Floating completion toast notification on download.
  - **Branded Purple Palette**:
    - Integrated standard color tones:
      - Deep Royal Plum: `#4C2365` (borders, cards, dark contrasts)
      - Medium Amethyst: `#7F5D99` (primary buttons, active tabs, progress bars)
      - Soft Lilac: `#9E7EB5` (subtitles, secondary labels, icons)
      - Light Lavender: `#C4A4DA` (badges, highlights, crisp text accents)
- **Commit**: `feat: add prominent paste bar, local download buttons, and purple palette` (`cd2444d`)

---

## Milestone 10: JSON Fetch Protection & Warm Cream Palette Integration
- **Objective**: Fix SPA HTML fallthrough error on API routes and apply `#EBE2CC` warm cream styling across the web frontend.
- **Root Cause & Fix for Fetch Error**:
  - *Root Cause*: Undefined or 404 API calls fell through Express into `vite.middlewares` with `appType: 'spa'`, which rewrote non-file requests to `index.html` (`<!doctype html>`). Calling `.json()` on this HTML caused `SyntaxError: Unexpected token '<'`.
  - *Fix*:
    1. Added `app.all('/api/*', ...)` in `server.ts` before Vite middleware, strictly returning structured 404 JSON.
    2. Implemented `safeJsonFetch` in `src/App.tsx` verifying `content-type: application/json` before parsing.
    3. Added domain scope indicator in the UI explaining that Stage 1 expects `books.toscrape.com`.
- **Styling Deliverables**:
  - Integrated `#EBE2CC` (warm parchment cream) in `src/index.css` (`--color-brand-cream: #EBE2CC`).
  - Applied `#EBE2CC` to header titles, extraction bar labels, preset chips, book card titles, prices, UPC codes, and action buttons.
- **Commit**: `fix: guard /api routes with 404 JSON handler and integrate #EBE2CC color palette` (`e8e3666`)

---

## Milestone 11: Comprehensive Root README Documentation
- **Objective**: Provide comprehensive root-level project documentation bridging the Web Studio, API architecture, and crawler backend.
- **Deliverables**:
  - `README.md` (root directory):
    - Full-stack project overview with target scope boundaries (`books.toscrape.com`).
    - Color palette reference (`#4C2365`, `#7F5D99`, `#9E7EB5`, `#C4A4DA`, `#EBE2CC`).
    - Web Interaction features guide (extraction bar, local drive download, live logs, test runner).
    - Setup & installation instructions for Node.js and Python.
    - CLI execution commands (`--urls`, `--resume`, and exit code definitions).
    - Offline test suite breakdown across all 32 unit tests.
    - Complete directory file tree mapping root and `crawler/` files.
- **Commit**: `docs: add comprehensive root README.md documentation`

---

## Git Commit History Summary

| Commit Hash | Commit Type | Message |
|-------------|-------------|---------|
| `e40aa19` | `chore` | `initialize crawler repository and dependencies` |
| `f51df7f` | `feat` | `implement configuration loader and domain profile matching` |
| `c8a1897` | `feat` | `implement URL validation with SSRF safety and robots compliance parser` |
| `3864e5b` | `feat` | `implement HTML cleaner, selector extractor, and verified fixtures` |
| `2119a97` | `feat` | `implement SQLite persistent storage and JSON exporter with unit tests` |
| `a7b7a3f` | `feat` | `implement Playwright fetcher, sequential CLI pipeline, urls.txt, and README` |
| `e217f5f` | `fix` | `allow resumed runs to re-export updated datasets` |
| `ce61636` | `docs` | `add progress.md tracking all completed Stage 1 steps and milestones` |
| `8d07ded` | `feat` | `add api_bridge and update progress.md with milestone 8` |
| `cd2444d` | `feat` | `add prominent paste bar, local download buttons, and purple palette` |
| `e8e3666` | `fix` | `guard /api routes with 404 JSON handler and integrate #EBE2CC color palette` |
| `HEAD`    | `docs` | `add comprehensive root README.md documentation` |
