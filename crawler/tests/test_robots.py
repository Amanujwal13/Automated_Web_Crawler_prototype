from __future__ import annotations

import io
import urllib.error
from unittest.mock import MagicMock, patch
import pytest

from robots import clear_robots_cache, is_allowed


@pytest.fixture(autouse=True)
def clean_cache():
    clear_robots_cache()
    yield
    clear_robots_cache()


def test_robots_allowed() -> None:
    robots_txt = """
User-agent: *
Disallow: /admin/
Allow: /catalogue/
"""
    mock_resp = MagicMock()
    mock_resp.read.return_value = robots_txt.encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        allowed = is_allowed(
            "https://books.toscrape.com/catalogue/book_1.html",
            "CrawlerPrototype/0.1",
        )
        assert allowed is True


def test_robots_disallowed() -> None:
    robots_txt = """
User-agent: *
Disallow: /private/
"""
    mock_resp = MagicMock()
    mock_resp.read.return_value = robots_txt.encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        allowed = is_allowed(
            "https://books.toscrape.com/private/secret.html",
            "CrawlerPrototype/0.1",
        )
        assert allowed is False


def test_robots_404_allowed() -> None:
    # 404 means no robots.txt -> allowed
    err = urllib.error.HTTPError(
        url="https://books.toscrape.com/robots.txt",
        code=404,
        msg="Not Found",
        hdrs={},
        fp=io.BytesIO(b""),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        allowed = is_allowed(
            "https://books.toscrape.com/catalogue/book.html",
            "CrawlerPrototype/0.1",
        )
        assert allowed is True


@pytest.mark.parametrize("status_code", [401, 403])
def test_robots_auth_errors_disallowed(status_code: int) -> None:
    # 401 and 403 mean disallowed
    err = urllib.error.HTTPError(
        url="https://books.toscrape.com/robots.txt",
        code=status_code,
        msg="Access Denied",
        hdrs={},
        fp=io.BytesIO(b""),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        allowed = is_allowed(
            "https://books.toscrape.com/catalogue/book.html",
            "CrawlerPrototype/0.1",
        )
        assert allowed is False


def test_robots_caching_per_host() -> None:
    robots_txt = "User-agent: *\nDisallow: /"
    mock_resp = MagicMock()
    mock_resp.read.return_value = robots_txt.encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        is_allowed("https://books.toscrape.com/page1.html", "CrawlerBot")
        is_allowed("https://books.toscrape.com/page2.html", "CrawlerBot")
        assert mock_urlopen.call_count == 1
