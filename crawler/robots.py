from __future__ import annotations

import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


_CACHE_LOCK = threading.Lock()
_ROBOTS_CACHE: dict[str, tuple[RobotFileParser | bool, float]] = {}
DEFAULT_TTL_SECONDS = 3600.0


def _get_robots_url(parsed_url) -> str:
    scheme = parsed_url.scheme or "http"
    netloc = parsed_url.netloc
    return f"{scheme}://{netloc}/robots.txt"


def _fetch_robot_parser(robots_url: str, user_agent: str) -> RobotFileParser | bool:
    req = urllib.request.Request(robots_url, headers={"User-Agent": user_agent})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            rp = RobotFileParser()
            rp.parse(content.splitlines())
            return rp
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return False  # Disallowed
        if e.code == 404:
            return True  # Allowed
        return False  # Disallowed on other errors
    except Exception:
        return False  # Disallowed on connection/timeout error


def is_allowed(url: str, user_agent: str, ttl_seconds: float = DEFAULT_TTL_SECONDS) -> bool:
    parsed = urlparse(url)
    key = f"{parsed.scheme}://{parsed.netloc}"
    now = time.time()

    with _CACHE_LOCK:
        if key in _ROBOTS_CACHE:
            cached_val, ts = _ROBOTS_CACHE[key]
            if (now - ts) < ttl_seconds:
                if isinstance(cached_val, bool):
                    return cached_val
                return cached_val.can_fetch(user_agent, url)

    # Fetch outside lock to prevent blocking during network I/O
    robots_url = _get_robots_url(parsed)
    parser = _fetch_robot_parser(robots_url, user_agent)

    with _CACHE_LOCK:
        _ROBOTS_CACHE[key] = (parser, now)

    if isinstance(parser, bool):
        return parser

    return parser.can_fetch(user_agent, url)


def clear_robots_cache() -> None:
    with _CACHE_LOCK:
        _ROBOTS_CACHE.clear()
