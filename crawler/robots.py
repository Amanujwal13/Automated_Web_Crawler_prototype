from __future__ import annotations

import urllib.error
import urllib.request
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


_ROBOTS_CACHE: dict[str, RobotFileParser | bool] = {}


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


def is_allowed(url: str, user_agent: str) -> bool:
    parsed = urlparse(url)
    key = f"{parsed.scheme}://{parsed.netloc}"

    if key not in _ROBOTS_CACHE:
        robots_url = _get_robots_url(parsed)
        _ROBOTS_CACHE[key] = _fetch_robot_parser(robots_url, user_agent)

    cached = _ROBOTS_CACHE[key]
    if isinstance(cached, bool):
        return cached

    return cached.can_fetch(user_agent, url)


def clear_robots_cache() -> None:
    _ROBOTS_CACHE.clear()
