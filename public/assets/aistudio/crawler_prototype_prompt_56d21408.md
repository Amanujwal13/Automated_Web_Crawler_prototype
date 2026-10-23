# Web Crawler: Prototype Code Generation Prompt (Stage 1)

Copy everything below the line into your AI coding assistant. This stage builds a small, working, rule-based crawler for one practice site. Stage 2 (the full v3 design) is built on top of this code afterward, so the module names and interfaces below are fixed on purpose. Do not rename them.

---

## ROLE

You are a senior Python engineer. Build a small, readable, well-tested command-line crawler. Favor simple code. Do not add features that are not listed here.

## GOAL OF THIS STAGE

Prove the core pipeline end to end on one site: fetch a page in a headless browser, clean the HTML, extract fields with CSS selectors, save progress in SQLite, and export JSON. Everything beyond that is out of scope for this stage.

## SCOPE

**In scope**

- One site: `books.toscrape.com` (a practice site built for scraping)
- One record type: `Book` (title, price, upc, availability)
- Rule-based extraction only (BeautifulSoup with the `lxml` parser)
- Single-process, sequential pipeline
- Resumable runs with SQLite
- URL validation, robots.txt checks, and a request delay
- JSON export

**Out of scope for this stage (do not build)**

- LLM or any AI API
- Generic extraction for unknown sites
- CSV, Excel, and per-table exports
- Single-link command-line mode (batch file only)
- Stealth plugins, proxies, concurrency, scrolling
- Streamlit or any UI

## HARD CONSTRAINTS

- **Sequential only.** One browser at a time. The browser context must be fully closed before any HTML is passed to the extractor.
- **Memory.** Call `gc.collect()` after the browser is closed and before extraction. Do not keep HTML in memory after its record is saved.
- **Compliance.** Check robots.txt before each fetch, and wait `request_delay_seconds` between requests. Do not solve CAPTCHAs.
- **Network safety.** Reject non-HTTP(S) URLs and any URL whose host resolves to a loopback, private, link-local, or reserved address.

## PROJECT STRUCTURE

Generate exactly these files. The names and public functions are the contract for Stage 2.

```
crawler/
├── main.py             # CLI entry point and sequential pipeline
├── config.py           # Loads config.yaml into a dataclass with validation
├── config.yaml
├── profiles/
│   └── books.yaml      # Field rules for books.toscrape.com
├── urlcheck.py         # validate_url(url) -> None or raises UrlRejected
├── robots.py           # is_allowed(url, user_agent) -> bool, cached per host
├── fetcher.py          # async fetch_html(url, config) -> FetchResult
├── cleaner.py          # clean_html(html) -> CleanedPage
├── profiles.py         # load_profile(path) -> Profile
├── extractors.py       # extract_record(cleaned_html, profile) -> dict
├── store.py            # SQLite store with run_id from the start
├── exporters.py        # export_json(records, output_dir) -> path
├── requirements.txt
├── README.md
├── urls.txt
└── tests/
    ├── fixtures/
    │   ├── book_1.html
    │   └── book_1.expected.json
    ├── test_urlcheck.py
    ├── test_cleaner.py
    ├── test_extractors.py
    ├── test_store.py
    ├── test_robots.py
    └── test_exporters.py
```

## CONFIGURATION (`config.yaml`)

```yaml
db_path: crawl.db
output_root: output
profile: profiles/books.yaml
request_delay_seconds: 3.0
page_timeout_seconds: 30
user_agent: "CrawlerPrototype/0.1 (+contact: your-email-here)"
viewport: {width: 1280, height: 800}
block_resource_types: [image, media, font]
clean:
  strip_tags: [script, style, svg, noscript, nav, footer]
```

`config.py` must validate every key and fail fast with a clear message on a missing key or wrong type.

## PROFILE (`profiles/books.yaml`)

```yaml
name: books
domains: [books.toscrape.com]
record_type: Book
fields:
  title:
    selector: "div.product_main h1"
    attr: text
    required: true
  price:
    selector: "p.price_color"
    attr: text
    required: false
  upc:
    table_row: "UPC"
    required: false
  availability:
    selector: "p.availability"
    attr: text
    required: false
```

Supported rules: `selector` with `attr` set to `text` or an HTML attribute name, `table_row` (returns the `td` paired with a `th` label), and `required`. `profiles.py` rejects unknown rule keys and reports the file name.

## MODULE BEHAVIOR

**`urlcheck.py`**
- `validate_url(url)` accepts only `http` and `https` with a host name, and rejects URLs longer than 2048 characters.
- Resolve the host with `socket.getaddrinfo` and reject the URL if any address is loopback, private, link-local, multicast, reserved, or unspecified (use the `ipaddress` module).
- Raise `UrlRejected(reason)` on failure. Never fetch a rejected URL.

**`robots.py`**
- Use `urllib.robotparser`, with one cached parser per scheme and host.
- A 401 or 403 response for `robots.txt` means disallowed. A 404 means allowed. Any other error means disallowed.

**`fetcher.py`**
- Use `playwright.async_api` with headless Chromium and a fresh context per URL.
- Apply the configured user agent and viewport.
- Install a `page.route` handler that aborts requests whose type is in `block_resource_types`. Allow everything else, including CSS and JavaScript.
- Navigate with `wait_until="domcontentloaded"` and the configured timeout.
- Return `FetchResult(html, final_url, status)`. Close the browser in a `finally` block before returning.
- Call `validate_url` on the final URL after redirects. Raise `UrlRejected` if it fails.
- On HTTP 403, raise an error that marks the URL `blocked`. On HTTP 429, raise an error that marks the URL `failed` with a note about rate limiting. Do not retry in this stage.

**`cleaner.py`**
- Parse with BeautifulSoup and `lxml`.
- Remove the tags listed in `clean.strip_tags`.
- Return `CleanedPage(html, text)`, where `text` is the visible text with blank lines collapsed.

**`profiles.py`**
- Match a profile by host, with any leading `www.` removed, against `domains`. Match exact domains and their subdomains only.
- Build the record model from the profile with `pydantic.create_model`. Required fields are non-optional, others default to `None`. All values are strings.

**`extractors.py`**
- `extract_record(cleaned_html, profile)` applies each field rule to the HTML and returns a dictionary.
- Raise `ExtractionError` if a required field is missing. Do not guess, and do not call any model.
- Add `source_url`, `final_url`, `domain`, and `fetched_at` (ISO 8601 UTC) to every record.

**`store.py`**
- Create the schema on first use. Include `run_id` now, so the Stage 2 version can reuse the database without migration:

```sql
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    output_dir TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS urls (
    run_id TEXT NOT NULL REFERENCES runs(id),
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | done | blocked | failed
    error TEXT,
    record TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, url)
);
```

- Functions: `create_run(output_dir) -> run_id`, `add_urls(run_id, urls)` using `INSERT OR IGNORE`, `pending(run_id)`, `mark_done`, `mark_blocked`, `mark_failed`, `records(run_id)`.
- Truncate error messages to 500 characters. Use parameterized queries only.
- Run IDs use the format `YYYYMMDD-HHMMSS-xxxx`, where `xxxx` is a random suffix.

**`exporters.py`**
- `export_json(records, output_dir)` creates the folder with `pathlib` and writes `data.json` with `indent=2` and `ensure_ascii=False`.
- Never overwrite an existing run folder. Return the path written.
- Write a valid empty array when there are no records.

**`main.py`**
- Command line: `python main.py --urls urls.txt` (batch) or `python main.py --resume RUN_ID`.
- Pipeline per URL, sequentially: validate, check robots, fetch, call `gc.collect()`, clean, extract, save the record or the error. Wait `request_delay_seconds` between URLs.
- Wrap each URL in its own `try`/`except`. One failure must not stop the run.
- Write one line per URL to `output/<run_id>/run.log`, and print the same line to the console.
- After the loop, export the `done` records to `output/<run_id>/data.json` and print the folder path.
- Exit code 0 if at least one record was produced, 1 if none were, 2 for invalid arguments or configuration.

## TESTS

Use pytest. Tests must not use the network or a browser.

- `test_urlcheck.py`: accepts public https URLs; rejects `file:`, `ftp:`, `localhost`, `127.0.0.1`, `10.0.0.1`, `192.168.1.1`, `169.254.169.254`, and over-length URLs. Mock DNS for host-name cases.
- `test_cleaner.py`: scripts, navigation, and footers are removed; visible text is kept.
- `test_extractors.py`: the fixture produces exactly `book_1.expected.json`; a missing required field raises `ExtractionError`.
- `test_store.py`: run creation, status transitions, resume returns only pending rows, and inserts are parameterized.
- `test_robots.py`: allowed, disallowed, 404, and 403 cases, using a mocked parser.
- `test_exporters.py`: JSON output is valid, UTF-8, and an empty run produces `[]`.

Include the fixture files. Save `book_1.html` from the live page, and write `book_1.expected.json` from values verified in a browser.

## README

Generate a README with: scope, prerequisites (Python 3.10+, `pip install -r requirements.txt`, `playwright install chromium`), how to run the batch and resume commands, the output layout, how to add a second profile, and the compliance notes. Keep it short.

## OUTPUT RULES

- Provide every file in full. No placeholders, no `TODO`, no `...`.
- Type-hint all functions. Keep functions under about 40 lines.
- Pin every dependency in `requirements.txt`: `playwright`, `beautifulsoup4`, `lxml`, `pydantic`, `pyyaml`, and `pytest`.
- Use `pathlib` for all paths.
- Before finishing, check that the browser closes before extraction, `gc.collect()` runs between fetch and extraction, every URL passes validation and robots.txt, and the tests run offline.

---

## STAGE 2: BUILD THE FULL VERSION ON TOP (run after the prototype passes)

Do not rewrite the prototype. Extend it to match `crawler_generation_prompt_v3.md`, using these rules:

1. Keep the file names, function names, and the `runs`/`urls` schema. Add new modules alongside them instead of replacing them.
2. Add `llm_client.py` and the LLM fallback in `extractors.py`. Keep the API key in an environment variable, never in code, and keep the fallback disabled by default.
3. Add generic extraction for domains without a profile, with the record fields listed in v3.
4. Add the single-link command (`python main.py <url> ...`) and the `--llm`, `--no-llm`, and `--retry-failed` flags.
5. Add CSV and Excel export, the `tables/` folder, `summary.txt`, and per-table sheets, in the layout v3 describes.
6. Add the network-safety rules and redirect checks from v3 to every request the browser makes.
7. Add the optional scroll step and the 429 backoff from v3.
8. Keep all Stage 1 tests passing, and add tests for each new module.

After Stage 2, record in `docs/changes.md` which Stage 1 decisions were changed and why. This is the list of lessons you asked for.
