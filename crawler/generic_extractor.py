"""
generic_extractor.py - Stage 2 Heuristic Extractor for Non-Profile Domains.

Provides robust rule-free extraction for arbitrary websites (articles, blogs, news, documents):
- Title discovery: OpenGraph og:title -> meta title -> article h1 -> first h1 -> title tag.
- Author / Byline discovery: meta author -> rel=author -> byline classes.
- Publication date discovery: article:published_time -> meta date -> <time datetime>.
- Main content discovery: Paragraph text density scoring over containers.
- Summary discovery: og:description -> meta description -> leading text preview.
- Table discovery: HTML <table> tags parsed into structured headers and rows.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup, Tag
from urllib.parse import urlparse


def _normalize_space(text: str) -> str:
    """Collapses whitespace runs and strips edges."""
    return re.sub(r"\s+", " ", text or "").strip()


def extract_tables(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """
    Parses all <table> elements into structured JSON objects.
    Returns a list of tables with caption, headers, and rows.
    """
    extracted_tables: List[Dict[str, Any]] = []

    for idx, table in enumerate(soup.find_all("table")):
        caption_tag = table.find("caption")
        caption = _normalize_space(caption_tag.get_text()) if caption_tag else f"Table {idx + 1}"

        # Headers
        headers: List[str] = []
        thead = table.find("thead")
        header_rows = thead.find_all("tr") if thead else []
        if not header_rows:
            first_tr = table.find("tr")
            if first_tr and first_tr.find_all("th"):
                header_rows = [first_tr]

        if header_rows:
            th_cells = header_rows[0].find_all(["th", "td"])
            headers = [_normalize_space(cell.get_text()) for cell in th_cells]

        # Data Rows
        rows: List[List[str]] = []
        tbody = table.find("tbody") or table
        for tr in tbody.find_all("tr"):
            if tr in header_rows:
                continue
            cells = tr.find_all(["td", "th"])
            if not cells:
                continue
            row_data = [_normalize_space(cell.get_text()) for cell in cells]
            if any(row_data):
                rows.append(row_data)

        if headers or rows:
            extracted_tables.append({
                "table_id": idx + 1,
                "caption": caption,
                "headers": headers,
                "row_count": len(rows),
                "rows": rows,
            })

    return extracted_tables


def extract_generic_record(
    soup_or_html: Any,
    source_url: str,
    final_url: str,
    fetched_at: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extracts structured generic content from cleaned HTML using DOM heuristics.
    """
    if isinstance(soup_or_html, BeautifulSoup):
        soup = soup_or_html
    else:
        soup = BeautifulSoup(str(soup_or_html), "lxml")

    # 1. Title Discovery
    title = ""
    og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
    if og_title and og_title.get("content"):
        title = _normalize_space(og_title["content"])

    if not title:
        meta_title = soup.find("meta", attrs={"name": "twitter:title"})
        if meta_title and meta_title.get("content"):
            title = _normalize_space(meta_title["content"])

    if not title:
        article = soup.find("article")
        if article:
            h1 = article.find("h1")
            if h1:
                title = _normalize_space(h1.get_text())

    if not title:
        first_h1 = soup.find("h1")
        if first_h1:
            title = _normalize_space(first_h1.get_text())

    if not title and soup.title:
        title = _normalize_space(soup.title.get_text())

    # 2. Author / Byline Discovery
    byline = ""
    author_meta = soup.find("meta", attrs={"name": "author"}) or soup.find("meta", property="article:author")
    if author_meta and author_meta.get("content"):
        byline = _normalize_space(author_meta["content"])

    if not byline:
        rel_author = soup.find(attrs={"rel": "author"})
        if rel_author:
            byline = _normalize_space(rel_author.get_text())

    if not byline:
        byline_el = soup.find(class_=re.compile(r"(byline|author|writer)", re.I))
        if byline_el:
            byline = _normalize_space(byline_el.get_text())

    # 3. Publication Date Discovery
    published_at = ""
    time_meta = (
        soup.find("meta", property="article:published_time")
        or soup.find("meta", attrs={"name": "publish-date"})
        or soup.find("meta", attrs={"name": "date"})
    )
    if time_meta and time_meta.get("content"):
        published_at = _normalize_space(time_meta["content"])

    if not published_at:
        time_tag = soup.find("time")
        if time_tag:
            published_at = _normalize_space(time_tag.get("datetime") or time_tag.get_text())

    # 4. Summary / Description
    summary = ""
    desc_meta = (
        soup.find("meta", property="og:description")
        or soup.find("meta", attrs={"name": "description"})
        or soup.find("meta", attrs={"name": "twitter:description"})
    )
    if desc_meta and desc_meta.get("content"):
        summary = _normalize_space(desc_meta["content"])

    # 5. Main Body Content (Density Heuristic)
    # Target containers likely to hold body text
    candidates = soup.find_all(["article", "main", "div", "section"])
    best_candidate: Optional[Tag] = None
    best_score = -1

    for container in candidates:
        paragraphs = container.find_all("p", recursive=False)
        if not paragraphs:
            paragraphs = container.find_all("p")
        
        # Calculate paragraph text length
        p_text_length = sum(len(_normalize_space(p.get_text())) for p in paragraphs)
        if p_text_length > best_score:
            best_score = p_text_length
            best_candidate = container

    main_text = ""
    if best_candidate and best_score > 40:
        p_list = [_normalize_space(p.get_text()) for p in best_candidate.find_all("p") if len(_normalize_space(p.get_text())) > 20]
        main_text = "\n\n".join(p_list)
    elif soup.body:
        # Fallback to visible body paragraphs
        p_list = [_normalize_space(p.get_text()) for p in soup.body.find_all("p") if len(_normalize_space(p.get_text())) > 20]
        main_text = "\n\n".join(p_list)

    if not summary and main_text:
        summary = main_text[:280] + ("..." if len(main_text) > 280 else "")

    # 6. Tables
    tables = extract_tables(soup)

    # Provenance
    parsed_domain = urlparse(final_url or source_url).netloc.lower()
    if parsed_domain.startswith("www."):
        parsed_domain = parsed_domain[4:]

    timestamp = fetched_at or datetime.now(timezone.utc).isoformat()

    return {
        "title": title or "Untitled Document",
        "byline": byline or None,
        "published_at": published_at or None,
        "summary": summary or None,
        "main_text": main_text or None,
        "tables": tables,
        "table_count": len(tables),
        "source_url": source_url,
        "final_url": final_url or source_url,
        "domain": parsed_domain,
        "fetched_at": timestamp,
        "extraction_mode": "generic_heuristic",
    }
