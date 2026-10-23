from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import pydantic
import yaml


ALLOWED_RULE_KEYS = {"selector", "attr", "table_row", "required"}


@dataclass(frozen=True)
class FieldRule:
    name: str
    required: bool
    selector: str | None = None
    attr: str = "text"
    table_row: str | None = None


@dataclass(frozen=True)
class Profile:
    name: str
    domains: list[str]
    record_type: str
    fields: dict[str, FieldRule]
    model: type[pydantic.BaseModel]
    source_path: Path

    def matches_domain(self, host: str) -> bool:
        clean_host = host.lower().strip()
        if clean_host.startswith("www."):
            clean_host = clean_host[4:]
        for domain in self.domains:
            target = domain.lower().strip()
            if target.startswith("www."):
                target = target[4:]
            if clean_host == target or clean_host.endswith(f".{target}"):
                return True
        return False


def _parse_field_rule(field_name: str, raw: Any, file_name: str) -> FieldRule:
    if not isinstance(raw, dict):
        raise ValueError(f"Field '{field_name}' in {file_name} must be a dictionary")

    unknown_keys = set(raw.keys()) - ALLOWED_RULE_KEYS
    if unknown_keys:
        raise ValueError(
            f"Unknown rule key(s) {sorted(unknown_keys)} in field '{field_name}' of profile {file_name}"
        )

    selector = raw.get("selector")
    table_row = raw.get("table_row")
    if not selector and not table_row:
        raise ValueError(
            f"Field '{field_name}' in {file_name} must define either 'selector' or 'table_row'"
        )

    attr = str(raw.get("attr", "text"))
    required = bool(raw.get("required", False))

    return FieldRule(
        name=field_name,
        required=required,
        selector=str(selector) if selector else None,
        attr=attr,
        table_row=str(table_row) if table_row else None,
    )


def load_profile(path: Path | str) -> Profile:
    profile_path = Path(path)
    if not profile_path.is_file():
        raise FileNotFoundError(f"Profile file not found: {profile_path}")

    with profile_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"Profile {profile_path.name} must be a YAML dictionary")

    for key in ("name", "domains", "record_type", "fields"):
        if key not in data:
            raise KeyError(f"Missing required key '{key}' in profile {profile_path.name}")

    fields_dict: dict[str, FieldRule] = {}
    pydantic_fields: dict[str, Any] = {}

    for f_name, f_raw in data["fields"].items():
        rule = _parse_field_rule(f_name, f_raw, profile_path.name)
        fields_dict[f_name] = rule
        if rule.required:
            pydantic_fields[f_name] = (str, ...)
        else:
            pydantic_fields[f_name] = (str | None, None)

    # Base metadata fields present on all records
    pydantic_fields["source_url"] = (str, ...)
    pydantic_fields["final_url"] = (str, ...)
    pydantic_fields["domain"] = (str, ...)
    pydantic_fields["fetched_at"] = (str, ...)

    model = pydantic.create_model(data["record_type"], **pydantic_fields)

    return Profile(
        name=str(data["name"]),
        domains=[str(d) for d in data["domains"]],
        record_type=str(data["record_type"]),
        fields=fields_dict,
        model=model,
        source_path=profile_path,
    )
