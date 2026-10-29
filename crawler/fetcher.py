from __future__ import annotations

import asyncio
from dataclasses import dataclass
from playwright.async_api import async_playwright
from config import Config
from urlcheck import UrlRejected, validate_url


class FetchBlocked(Exception):
    """Raised when server responds with 403 Forbidden or blocks access."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class FetchFailed(Exception):
    """Raised when page fetch fails or receives a 429 Rate Limit."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class FetchResult:
    html: str
    final_url: str
    status: int


async def fetch_html(
    url: str,
    config: Config,
    scroll: bool = False,
    max_retries_429: int = 1,
) -> FetchResult:
    blocked_types = set(config.block_resource_types)
    timeout_ms = config.page_timeout_seconds * 1000
    viewport_dict = {"width": config.viewport.width, "height": config.viewport.height}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(
                user_agent=config.user_agent,
                viewport=viewport_dict,
            )
            page = await context.new_page()

            async def route_filter(route):
                if route.request.resource_type in blocked_types:
                    await route.abort()
                else:
                    await route.continue_()

            await page.route("**/*", route_filter)

            response = None
            attempt = 0
            while attempt <= max_retries_429:
                try:
                    response = await page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=timeout_ms,
                    )
                except Exception as exc:
                    if "net::ERR_" in str(exc) or "Timeout" in str(exc):
                        raise FetchFailed(f"Navigation error for {url}: {exc}")
                    raise

                if response is not None and response.status == 429 and attempt < max_retries_429:
                    attempt += 1
                    await asyncio.sleep(2.0 * attempt)
                    continue
                break

            if response is None:
                raise FetchFailed(f"Navigation to {url} produced no HTTP response")

            status = response.status
            final_url = page.url

            # Validate final redirect destination for network safety
            validate_url(final_url)

            if status == 403:
                raise FetchBlocked(f"HTTP 403 Forbidden received from {url}")
            if status == 429:
                raise FetchFailed(f"HTTP 429 Rate Limit received from {url}; crawler backoff exhausted")
            if status >= 400:
                raise FetchFailed(f"HTTP {status} error received from {url}")

            # Stage 2 Dynamic Scrolling if requested
            if scroll:
                try:
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2);")
                    await page.wait_for_timeout(300)
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                    await page.wait_for_timeout(300)
                except Exception:
                    pass

            html = await page.content()
            return FetchResult(html=html, final_url=final_url, status=status)
        finally:
            await browser.close()
