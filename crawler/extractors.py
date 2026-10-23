from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from profiles import FieldRule, Profile


class ExtractionError(Exception):
    """Raised when record extraction fails, e.g. a required field is missing."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _extract_field_value(soup: BeautifulSoup, rule: FieldRule) -> str | None:
    if rule.selector:
        element = soup.select_one(rule.selector)
        if element is None:
            return None
        if rule.attr == "text":
            val = element.get_text(strip=True)
            return val if val else None
        attr_val = element.get(rule.attr)
        if attr_val is None:
            return None
        return str(attr_val).strip()

    if rule.table_row:
        target_label = rule.table_row.strip().lower()
        for row in soup.find_all("tr"):
            th = row.find("th")
            td = row.find("td")
            if th and td and th.get_text(strip=True).lower() == target_label:
                val = td.get_text(strip=True)
                return val if val else None
        return None

    return None


def extract_record(
    cleaned_html: str,
    profile: Profile,
    source_url: str = "",
    final_url: str = "",
    fetched_at: str | None = None,
) -> dict[str, Any]:
    soup = BeautifulSoup(cleaned_html, "lxml")
    record: dict[str, Any] = {}

    for field_name, rule in profile.fields.items():
        value = _extract_field_value(soup, rule)
        if rule.required and not value:
            raise ExtractionError(f"Missing required field '{field_name}' in extracted record")
        record[field_name] = value

    effective_url = final_url or source_url
    domain = urlparse(effective_url).hostname or ""
    if domain.startswith("www."):
        domain = domain[4:]

    timestamp = fetched_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    record["source_url"] = source_url
    record["final_url"] = final_url or source_url
    record["domain"] = domain
    record["fetched_at"] = timestamp

    # Validate against profile's dynamic Pydantic model
    validated = profile.model(**record)
    return validated.model_dump()
