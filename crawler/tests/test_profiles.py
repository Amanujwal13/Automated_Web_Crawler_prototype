from __future__ import annotations

from pathlib import Path
import pytest
import yaml

from profiles import load_profile


def test_load_profile_domain_matching(tmp_path: Path) -> None:
    data = {
        "name": "books",
        "domains": ["books.toscrape.com"],
        "record_type": "Book",
        "fields": {
            "title": {"selector": "h1", "required": True},
            "price": {"selector": "p.price"},
        },
    }
    p_file = tmp_path / "books.yaml"
    p_file.write_text(yaml.dump(data), encoding="utf-8")

    profile = load_profile(p_file)
    assert profile.name == "books"
    assert profile.matches_domain("books.toscrape.com")
    assert profile.matches_domain("www.books.toscrape.com")
    assert profile.matches_domain("sub.books.toscrape.com")
    assert not profile.matches_domain("notbooks.toscrape.com")
    assert not profile.matches_domain("google.com")


def test_load_profile_rejects_unknown_rule_keys(tmp_path: Path) -> None:
    data = {
        "name": "bad",
        "domains": ["example.com"],
        "record_type": "Item",
        "fields": {
            "title": {"selector": "h1", "invalid_rule_key": "bad"},
        },
    }
    p_file = tmp_path / "bad.yaml"
    p_file.write_text(yaml.dump(data), encoding="utf-8")

    with pytest.raises(ValueError, match="Unknown rule key"):
        load_profile(p_file)


def test_load_profiles_dir_and_find_profile(tmp_path: Path) -> None:
    from profiles import find_profile_for_domain, load_profiles_dir, matches_domain

    assert matches_domain("quotes.toscrape.com", ["quotes.toscrape.com"])
    assert matches_domain("www.quotes.toscrape.com", ["quotes.toscrape.com"])
    assert not matches_domain("evil.com", ["quotes.toscrape.com"])

    p1 = {
        "name": "books",
        "domains": ["books.toscrape.com"],
        "record_type": "Book",
        "fields": {"title": {"selector": "h1", "required": True}},
    }
    p2 = {
        "name": "quotes",
        "domains": ["quotes.toscrape.com"],
        "record_type": "Quote",
        "fields": {"text": {"selector": "span.text", "required": True}},
    }
    (tmp_path / "books.yaml").write_text(yaml.dump(p1), encoding="utf-8")
    (tmp_path / "quotes.yaml").write_text(yaml.dump(p2), encoding="utf-8")

    loaded = load_profiles_dir(tmp_path)
    assert len(loaded) == 2
    names = {p.name for p in loaded}
    assert names == {"books", "quotes"}

    matched_quotes = find_profile_for_domain("quotes.toscrape.com", loaded)
    assert matched_quotes is not None
    assert matched_quotes.name == "quotes"

    matched_books = find_profile_for_domain("books.toscrape.com", loaded)
    assert matched_books is not None
    assert matched_books.name == "books"

    matched_unknown = find_profile_for_domain("wikipedia.org", loaded)
    assert matched_unknown is None
