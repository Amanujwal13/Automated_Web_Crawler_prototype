# Books Crawler Studio (Stage 1)

**Books Crawler Studio** is an interactive, rule-based web crawling application and operational dashboard tailored for [`books.toscrape.com`](https://books.toscrape.com). It combines a high-reliability Python crawler engine with a modern full-stack web interface for live execution, monitoring, dataset exploration, and direct local downloads.

---

## 🎨 Theme & Color Palette

The interface is styled using a distinguished royal plum and parchment aesthetic:
- **`#4C2365` (Deep Royal Plum)**: Card headers, dark surface borders, and tag containers.
- **`#7F5D99` (Medium Amethyst)**: Primary action buttons, active navigation tabs, and progress bars.
- **`#9E7EB5` (Soft Lilac)**: Subtitles, secondary text, and icon highlights.
- **`#C4A4DA` (Light Lavender)**: Badges, pill accents, and highlight borders.
- **`#EBE2CC` (Warm Cream / Parchment)**: Main title headings, extraction bar labels, preset chips, and book titles.

---

## 🚀 Key Features

### 1. Web Interaction Studio
- **Prominent URL Extraction Bar**: Paste single or batch URLs directly with 1-click clipboard paste, input clearing, and quick-select preset chips.
- **Local Drive Downloads**: High-visibility download triggers in the header and dataset views saving extracted records directly as `books_extracted_<run_id>.json` or `books_extracted_<run_id>.csv` to your computer.
- **Live Terminal Monitor**: Real-time terminal log viewer mirroring `crawler/run.log` with color-coded status badges (`[DONE]`, `[BLOCKED]`, `[FAILED]`).
- **Extracted Records Explorer**: Searchable and filterable dataset cards with book titles, prices, UPC codes, availability, provenance links, and 1-click JSON copying.
- **Run History & Resumption**: Full history stored in SQLite (`crawl.db`) with 1-click resumption for interrupted runs.
- **Interactive Test Suite**: Run all 32 unit tests directly from the UI with real-time pass/fail diagnostic outputs.

### 2. Python Crawler Engine (`crawler/`)
- **Headless Chromium Execution**: Playwright headless browser with isolated contexts per URL.
- **Strict SSRF Protection**: Resolves hostnames via `socket.getaddrinfo` and rejects private, loopback, link-local, multicast, and non-HTTP/HTTPS URLs.
- **Polite Robots Compliance**: Queries and caches `robots.txt` per host (treats 401/403 as disallowed, 404 as allowed).
- **Resource Filtering**: Automatically aborts requests for images, fonts, and media to minimize bandwidth and memory usage.
- **Memory Discipline**: Teardown of browser contexts inside a `finally` block followed by explicit `gc.collect()` before extraction.
- **Persistent State**: SQLite storage (`crawl.db`) with `runs` and `urls` tables supporting atomic state transitions.

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher
- **Python**: v3.10 or higher
- **Playwright Chromium**: Headless browser binaries

---

## ⚙️ Installation & Setup

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Install Python dependencies**:
   ```bash
   python3 -m pip install -r crawler/requirements.txt
   ```

3. **Install Playwright Chromium**:
   ```bash
   python3 -m playwright install --with-deps chromium
   ```

---

## 🖥️ Running the Application

### Option A: Interactive Web Studio (Recommended)
Start the unified full-stack development server:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### Option B: Command Line (CLI)

#### 1. Batch Crawl
Crawl a list of URLs from a file:
```bash
cd crawler
python3 main.py --urls urls.txt
```

#### 2. Resume an Interrupted Run
Resume pending URLs from a specific run ID:
```bash
cd crawler
python3 main.py --resume 20261023-120154-0432
```

#### 3. Exit Codes
- `0`: Success (at least one valid record was extracted).
- `1`: Completed with 0 records extracted.
- `2`: Invalid command-line arguments or configuration errors.

---

## 🧪 Testing

Execute the comprehensive 32-test offline unit test suite:
```bash
cd crawler
python3 -m pytest -v
```

### Test Coverage Overview:
- `tests/test_urlcheck.py` (16 tests): Public HTTPS verification, SSRF blocking (loopback, private IPv4/IPv6, link-local, multicast), invalid schemes, and length bounds.
- `tests/test_robots.py` (6 tests): Allowed/disallowed parsing, 404 permitted, 401/403 blocked, and host caching.
- `tests/test_cleaner.py` (1 test): Stripping script, style, nav, footer, svg tags while preserving visible text.
- `tests/test_extractors.py` (2 tests): Verifies extractions against live fixture `book_1.html` and ground truth `book_1.expected.json`, plus missing field exceptions.
- `tests/test_store.py` (4 tests): SQLite schema initialization, status transitions, resumption query filters, and SQL injection safety.
- `tests/test_exporters.py` (3 tests): Valid UTF-8 JSON formatting, empty array export, and overwrite protections.

---

## 📁 Project Structure

```
├── README.md                 # Root project documentation
├── package.json              # Web app scripts and dependencies
├── server.ts                 # Express full-stack API server + Vite middleware
├── metadata.json             # App metadata and permissions
├── index.html                # HTML entry point with synchronized metadata
├── src/
│   ├── App.tsx               # Interactive Web Studio frontend dashboard
│   ├── main.tsx              # React entry point
│   └── index.css             # Tailwind CSS v4 styling & purple/cream theme
└── crawler/
    ├── README.md             # Crawler engine operational guide
    ├── progress.md           # Milestone-by-milestone progress tracking log
    ├── main.py               # CLI entry point and sequential pipeline
    ├── api_bridge.py         # JSON bridge between Express and crawler SQLite/pytest
    ├── config.py             # Dataclass configuration loader with strict validation
    ├── config.yaml           # Runtime parameters (delays, timeouts, user-agent)
    ├── fetcher.py            # Headless Playwright fetcher with resource blocking
    ├── cleaner.py            # BeautifulSoup + lxml HTML sanitization
    ├── extractors.py         # Rule-based field extractor with provenance metadata
    ├── profiles.py           # Domain profile matcher and dynamic Pydantic model builder
    ├── store.py              # SQLite storage layer with parameterized queries
    ├── exporters.py          # Atomic JSON and CSV dataset exporter
    ├── requirements.txt      # Pinned Python package dependencies
    ├── urls.txt              # Sample target seed URLs for books.toscrape.com
    ├── profiles/
    │   └── books.yaml        # Field rules for books.toscrape.com
    └── tests/
        ├── fixtures/
        │   ├── book_1.html          # Authentic page fixture from books.toscrape.com
        │   └── book_1.expected.json # Ground truth verified record
        ├── test_cleaner.py
        ├── test_exporters.py
        ├── test_extractors.py
        ├── test_robots.py
        ├── test_store.py
        └── test_urlcheck.py
```

---

## 🔒 Stage 1 Scope & Boundary

- **Target Site**: Exclusively configured for `books.toscrape.com`.
- **Extraction Mechanism**: Rule-based CSS selectors and HTML table row labels (`title`, `price`, `upc`, `availability`).
- **Out of Scope (Reserved for Stage 2)**: Generic multi-site heuristic extractors and AI/LLM fallback models.
