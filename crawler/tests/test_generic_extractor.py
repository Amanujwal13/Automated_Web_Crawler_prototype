from __future__ import annotations

from generic_extractor import extract_generic_record, extract_tables
from bs4 import BeautifulSoup


def test_generic_extractor_finds_metadata_and_paragraphs():
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta property="og:title" content="Breaking News: Autonomous Crawlers Emerge">
        <meta name="author" content="Jane Doe">
        <meta property="article:published_time" content="2026-10-29T10:00:00Z">
        <meta property="og:description" content="A comprehensive analysis of next-generation crawlers.">
    </head>
    <body>
        <article>
            <h1>Breaking News: Autonomous Crawlers Emerge</h1>
            <p>Autonomous crawlers have revolutionized structured web data extraction across the globe.</p>
            <p>Engineers report extraordinary throughput gains and unprecedented resilience against layout mutations.</p>
        </article>
    </body>
    </html>
    """
    record = extract_generic_record(
        soup_or_html=html,
        source_url="https://example.com/news/article-1",
        final_url="https://example.com/news/article-1",
    )

    assert record["title"] == "Breaking News: Autonomous Crawlers Emerge"
    assert record["byline"] == "Jane Doe"
    assert record["published_at"] == "2026-10-29T10:00:00Z"
    assert "Autonomous crawlers" in record["main_text"]
    assert "comprehensive analysis" in record["summary"]
    assert record["domain"] == "example.com"
    assert record["extraction_mode"] == "generic_heuristic"


def test_extract_tables_parses_headers_and_rows():
    html = """
    <table>
        <caption>Financial Metrics</caption>
        <thead>
            <tr><th>Quarter</th><th>Revenue</th><th>Growth</th></tr>
        </thead>
        <tbody>
            <tr><td>Q1 2026</td><td>$10M</td><td>+15%</td></tr>
            <tr><td>Q2 2026</td><td>$14M</td><td>+40%</td></tr>
        </tbody>
    </table>
    """
    soup = BeautifulSoup(html, "lxml")
    tables = extract_tables(soup)

    assert len(tables) == 1
    tbl = tables[0]
    assert tbl["caption"] == "Financial Metrics"
    assert tbl["headers"] == ["Quarter", "Revenue", "Growth"]
    assert tbl["row_count"] == 2
    assert tbl["rows"][0] == ["Q1 2026", "$10M", "+15%"]
    assert tbl["rows"][1] == ["Q2 2026", "$14M", "+40%"]
