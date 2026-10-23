from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UrlRejected(Exception):
    """Raised when a URL fails validation or violates network safety constraints."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _is_ip_disallowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    if ip.is_loopback:
        return "loopback address"
    if ip.is_private:
        return "private network address"
    if ip.is_link_local:
        return "link-local address"
    if ip.is_multicast:
        return "multicast address"
    if ip.is_reserved:
        return "reserved address"
    if ip.is_unspecified:
        return "unspecified address"
    return None


def validate_url(url: str) -> None:
    if not isinstance(url, str):
        raise UrlRejected(f"URL must be a string, got {type(url).__name__}")

    if len(url) > 2048:
        raise UrlRejected(f"URL exceeds maximum length of 2048 characters ({len(url)} chars)")

    try:
        parsed = urlparse(url)
    except Exception as e:
        raise UrlRejected(f"Malformed URL: {e}") from e

    if parsed.scheme not in ("http", "https"):
        raise UrlRejected(f"Scheme '{parsed.scheme}' is not allowed; must be http or https")

    try:
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as e:
        raise UrlRejected(f"Invalid host or port in URL: {e}") from e

    if not host:
        raise UrlRejected("URL is missing a valid host name")

    try:
        addr_info = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise UrlRejected(f"Failed to resolve host '{host}': {e}") from e

    if not addr_info:
        raise UrlRejected(f"Host '{host}' resolved to no IP addresses")

    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError as e:
            raise UrlRejected(f"Invalid resolved IP '{ip_str}': {e}") from e

        disallowed_reason = _is_ip_disallowed(ip)
        if disallowed_reason:
            raise UrlRejected(f"Host '{host}' resolved to {disallowed_reason} ({ip_str})")
