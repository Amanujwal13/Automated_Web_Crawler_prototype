from __future__ import annotations

from dataclasses import dataclass
from bs4 import BeautifulSoup

DEFAULT_STRIP_TAGS = ["script", "style", "svg", "noscript", "nav", "footer"]


@dataclass(frozen=True)
class CleanedPage:
    html: str
    text: str


def clean_html(html: str, strip_tags: list[str] | None = None) -> CleanedPage:
    tags_to_strip = [t.lower() for t in (strip_tags or DEFAULT_STRIP_TAGS)]
    soup = BeautifulSoup(html, "lxml")

    for tag_name in tags_to_strip:
        for element in soup.find_all(tag_name):
            element.decompose()

    # Collapse blank lines in visible text
    raw_text = soup.get_text()
    collapsed_lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    cleaned_text = "\n".join(collapsed_lines)

    cleaned_html = str(soup)
    return CleanedPage(html=cleaned_html, text=cleaned_text)
