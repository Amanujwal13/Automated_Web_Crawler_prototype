# Web Crawler Prototype (Stage 1)

A robust, sequential, rule-based web crawler targeting `books.toscrape.com`.

## Scope

- **Target Site**: `books.toscrape.com`
- **Record Type**: `Book` (`title`, `price`, `upc`, `availability`)
- **Pipeline**: Headless Chromium (Playwright) -> BeautifulSoup cleaning -> CSS/table rule extraction -> SQLite state persistence -> JSON export.
- **Excluded**: Concurrency, proxies, generic unknown extraction, and LLM/AI APIs (reserved for Stage 2).

## Prerequisites

- Python 3.10+
- Install dependencies:
  ```bash
  pip install -r requirements.txt
  playwright install chromium
  ```

## Usage

### Batch Run
To crawl a file containing a list of URLs:
```bash
python main.py --urls urls.txt
```

### Resume an Interrupted Run
To resume pending URLs from an earlier run:
```bash
python main.py --resume 20261023-113001-a1b2
```

### Exit Codes
- `0`: At least one record was successfully produced and exported.
- `1`: Crawl finished with 0 valid records.
- `2`: Invalid command-line arguments or invalid configuration.

## Output Layout

Runs are stored under `output/<run_id>/`:
```
output/20261023-113001-a1b2/
├── data.json      # Array of extracted book records (UTF-8, formatted JSON)
└── run.log        # Timestamped log matching console output
```
Run metadata and per-URL state transitions are stored in `crawl.db` (SQLite).

## Adding a Second Profile

1. Create a new YAML profile in `profiles/<name>.yaml`:
   ```yaml
   name: articles
   domains: [example.com]
   record_type: Article
   fields:
     headline:
       selector: "h1.article-title"
       attr: text
       required: true
     author:
       selector: "span.byline"
       attr: text
       required: false
     publication_date:
       table_row: "Date"
       required: false
   ```
2. Update `config.yaml` to set `profile: profiles/<name>.yaml`.

## Compliance & Network Safety

- **robots.txt**: Checks `robots.txt` before fetching each URL. HTTP 401/403 blocks URLs; 404 permits crawling.
- **Politeness Delay**: Enforces `request_delay_seconds` (default: 3.0s) between successive URL fetches.
- **SSRF Protection**: Resolves target hostnames and rejects private, loopback, link-local, multicast, and reserved addresses.
- **Resource Filtering**: Aborts network requests for images, fonts, and media to minimize bandwidth and memory consumption.
