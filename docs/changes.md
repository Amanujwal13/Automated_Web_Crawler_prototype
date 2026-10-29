# Stage 1 to Stage 2 Evolution & Lessons Learned

This document records the architectural and design decisions transitioned from **Stage 1 (Practice Prototype)** to **Stage 2 (Production Full-Stack Crawler)**, explaining the technical rationale, trade-offs, and lessons learned.

---

## 1. Summary of Architectural Changes

| Area | Stage 1 Decision | Stage 2 Evolution | Technical Rationale & Trade-off |
|---|---|---|---|
| **Target Sites** | Strictly `books.toscrape.com` only | Dual-mode: Profile-based + Universal Web Extraction (`generic_extractor.py`) | Stage 1 proved deterministic rules against one practice site. Stage 2 enables universal extraction for news, blogs, and arbitrary web articles using paragraph density heuristics without requiring manual selector maintenance. |
| **Extraction Fallback** | Hard fail on missing required fields (`ExtractionError`) | Optional Gemini LLM Fallback (`llm_client.py` using `gemini-3.8-flash`) | When layout shifts or unstructured DOM mutations break rule selectors, the optional `--llm` flag queries Gemini to salvage required fields, preventing dropped records. |
| **Export Formats** | Flat JSON array (`data.json`) only | JSON (`data.json`), CSV (`data.csv`), Multi-Sheet Excel (`data.xlsx`), and `summary.txt` | Business and data analysis workflows require tabular spreadsheets. Stage 2 exports structured multi-sheet Excel workbooks with dedicated sheets for Records, Extracted HTML Tables, and Metadata. |
| **CLI Arguments** | Batch `--urls` or `--resume` only | Single/Multi positional CLI URLs (`python main.py <url> ...`), `--llm`, `--retry-failed`, and `--scroll` | Direct single-link terminal testing eliminates the friction of creating temporary seed text files for one-off crawls. |
| **Resumption Control** | Only resumed `pending` URLs | Added `--retry-failed` flag | Allows users to re-attempt transient network or rate-limited failures without having to wipe the SQLite database or start a new run ID. |
| **Dynamic Content** | Single static `domcontentloaded` fetch | Optional incremental scroll (`--scroll`) | Modern JS single-page applications and blogs lazy-load content and tables below the viewport fold. Gentle window scrolling forces layout hydration before cleaning. |
| **Process Model** | New event loop per URL | Single asynchronous event loop `asyncio.run(async_main())` | Eliminated event loop teardown overhead and resolved runtime errors on Python 3.10+ event loops. |
| **Progress & Auditing**| Static markdown log | Interactive Live Task Checklist synced across `progress.md`, REST API (`/api/tasks/checklist`), and UI | Provides end-to-end transparency, letting users inspect which tasks have been completed at every point of the project lifecycle. |

---

## 2. Key Lessons Learned

1. **Schema Future-Proofing Saved Migrations**:
   By designing the `runs` and `urls` SQLite schema in Stage 1 with `run_id`, `attempts`, and flexible text fields upfront, Stage 2 was deployed without requiring database migrations or breaking existing database records.

2. **Heuristics Before LLMs**:
   Placing heuristic extraction (OpenGraph tags, HTML5 `<article>`, `<time>`, paragraph density scoring) *ahead* of LLM calls reduced API cost and latency to zero for standard web pages, reserving LLM queries strictly for edge cases where heuristics fail.

3. **Atomic Export Protection**:
   Exporting all 4 formats (JSON, CSV, Excel, summary) atomically inside a dedicated export coordinator (`exporters.py::export_all`) prevents corrupted or half-written datasets when a user terminates a crawl early.
