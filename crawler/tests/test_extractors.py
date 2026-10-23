from __future__ import annotations

import json
from pathlib import Path
import pytest

from cleaner import clean_html
from extractors import ExtractionError, extract_record
from profiles import load_profile


def test_extract_record_matches_fixture_expected_json() -> None:
    current_dir = Path(__file__).parent
    fixtures_dir = current_dir / "fixtures"
    html_path = fixtures_dir / "book_1.html"
    expected_path = fixtures_dir / "book_1.expected.json"

    raw_html = html_path.read_text(encoding="utf-8")
    expected = json.loads(expected_path.read_text(encoding="utf-8"))

    profile_path = current_dir.parent / "profiles" / "books.yaml"
    profile = load_profile(profile_path)

    cleaned = clean_html(raw_html)
    record = extract_record(
        cleaned_html=cleaned.html,
        profile=profile,
        source_url=expected["source_url"],
        final_url=expected["final_url"],
        fetched_at=expected["fetched_at"],
    )

    assert record == expected


def test_extract_record_raises_on_missing_required_field() -> None:
    current_dir = Path(__file__).parent
    profile_path = current_dir.parent / "profiles" / "books.yaml"
    profile = load_profile(profile_path)

    # HTML missing the required title (div.product_main h1)
    incomplete_html = """
    <html>
      <body>
        <div class="product_main">
          <p class="price_color">£10.00</p>
          <p class="availability">In stock</p>
        </div>
      </body>
    </html>
    """
    cleaned = clean_html(incomplete_html)
    with pytest.raises(ExtractionError, match="Missing required field 'title'"):
        extract_record(
            cleaned_html=cleaned.html,
            profile=profile,
            source_url="https://books.toscrape.com/test",
            final_url="https://books.toscrape.com/test",
        )
