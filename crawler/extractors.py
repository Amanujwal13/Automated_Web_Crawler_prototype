from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from profiles import FieldRule, Profile
from generic_extractor import extract_generic_record
from llm_client import LLMClient


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
    use_llm: bool = False,
    llm_client: Optional[LLMClient] = None,
) -> dict[str, Any]:
    """
    Extracts structured data according to a YAML profile (Stage 1 contract).
    In Stage 2, if use_llm is True and a required field is missing, attempts LLM fallback.
    """
    soup = BeautifulSoup(cleaned_html, "lxml")
    record: dict[str, Any] = {}
    missing_required: list[str] = []

    for field_name, rule in profile.fields.items():
        value = _extract_field_value(soup, rule)
        if not value and rule.required:
            missing_required.append(field_name)
        record[field_name] = value

    # Stage 2 LLM Fallback for profile extraction
    if missing_required and use_llm:
        client = llm_client or LLMClient()
        if client.is_available():
            text_content = soup.get_text(separator=" ", strip=True)
            llm_results = client.extract_fields(text_content, missing_required)
            for field in list(missing_required):
                if llm_results.get(field):
                    record[field] = str(llm_results[field]).strip()
                    missing_required.remove(field)

    if missing_required:
        raise ExtractionError(f"Missing required field '{missing_required[0]}' in extracted record")

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


def extract_auto(
    cleaned_html: str,
    profile: Optional[Profile] = None,
    source_url: str = "",
    final_url: str = "",
    fetched_at: str | None = None,
    use_llm: bool = False,
    llm_client: Optional[LLMClient] = None,
) -> dict[str, Any]:
    """
    Stage 2 automated extractor:
    - If a matching profile is provided, extracts according to profile rules.
    - If no profile is provided (arbitrary website), applies generic heuristic extraction
      and optional LLM enrichment.
    """
    if profile is not None:
        return extract_record(
            cleaned_html=cleaned_html,
            profile=profile,
            source_url=source_url,
            final_url=final_url,
            fetched_at=fetched_at,
            use_llm=use_llm,
            llm_client=llm_client,
        )

    # Generic extraction for arbitrary domains
    generic = extract_generic_record(
        soup_or_html=cleaned_html,
        source_url=source_url,
        final_url=final_url,
        fetched_at=fetched_at,
    )

    if use_llm and (not generic.get("title") or not generic.get("summary")):
        client = llm_client or LLMClient()
        if client.is_available():
            soup = BeautifulSoup(cleaned_html, "lxml")
            text = soup.get_text(separator=" ", strip=True)
            missing = []
            if not generic.get("title"):
                missing.append("title")
            if not generic.get("summary"):
                missing.append("summary")
            llm_res = client.extract_fields(text, missing)
            if llm_res.get("title"):
                generic["title"] = str(llm_res["title"]).strip()
            if llm_res.get("summary"):
                generic["summary"] = str(llm_res["summary"]).strip()
            generic["llm_enriched"] = True

    return generic
