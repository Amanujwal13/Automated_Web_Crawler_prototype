from __future__ import annotations

import socket
from unittest.mock import patch
import pytest

from urlcheck import UrlRejected, validate_url


def test_accepts_public_https_urls() -> None:
    # Public IP for books.toscrape.com
    mock_addr = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("104.21.32.1", 443))]
    with patch("socket.getaddrinfo", return_value=mock_addr):
        # Should not raise
        validate_url("https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html")
        validate_url("http://books.toscrape.com/index.html")


@pytest.mark.parametrize(
    "bad_url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file.txt",
        "javascript:alert(1)",
        "gopher://example.com",
    ],
)
def test_rejects_non_http_schemes(bad_url: str) -> None:
    with pytest.raises(UrlRejected, match="must be http or https"):
        validate_url(bad_url)


def test_rejects_over_length_url() -> None:
    long_url = "https://books.toscrape.com/" + ("a" * 2050)
    with pytest.raises(UrlRejected, match="exceeds maximum length"):
        validate_url(long_url)


@pytest.mark.parametrize(
    "ip_str",
    [
        "127.0.0.1",
        "10.0.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "224.0.0.1",
    ],
)
def test_rejects_disallowed_ipv4_directly(ip_str: str) -> None:
    mock_addr = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip_str, 80))]
    with patch("socket.getaddrinfo", return_value=mock_addr):
        with pytest.raises(UrlRejected):
            validate_url(f"http://{ip_str}/test")


@pytest.mark.parametrize(
    "ipv6_str",
    [
        "::1",
        "fe80::1",
    ],
)
def test_rejects_disallowed_ipv6_directly(ipv6_str: str) -> None:
    mock_addr = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", (ipv6_str, 80, 0, 0))]
    with patch("socket.getaddrinfo", return_value=mock_addr):
        with pytest.raises(UrlRejected):
            validate_url(f"http://[{ipv6_str}]/test")


def test_rejects_unbracketed_ipv6() -> None:
    with pytest.raises(UrlRejected):
        validate_url("http://fe80::1/test")


def test_rejects_localhost_hostname() -> None:
    mock_addr = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
    with patch("socket.getaddrinfo", return_value=mock_addr):
        with pytest.raises(UrlRejected, match="loopback address"):
            validate_url("http://localhost/test")


def test_rejects_unresolvable_hostname() -> None:
    with patch("socket.getaddrinfo", side_effect=socket.gaierror("Name or service not known")):
        with pytest.raises(UrlRejected, match="Failed to resolve host"):
            validate_url("https://nonexistent-domain-xyz123.com/")
