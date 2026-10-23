from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import yaml


@dataclass(frozen=True)
class ViewportConfig:
    width: int
    height: int


@dataclass(frozen=True)
class CleanConfig:
    strip_tags: list[str]


@dataclass(frozen=True)
class Config:
    db_path: Path
    output_root: Path
    profile: Path
    request_delay_seconds: float
    page_timeout_seconds: int
    user_agent: str
    viewport: ViewportConfig
    block_resource_types: list[str]
    clean: CleanConfig


def _validate_type(value: Any, expected_type: type | tuple[type, ...], field_name: str) -> None:
    if not isinstance(value, expected_type):
        expected_names = (
            ", ".join(t.__name__ for t in expected_type)
            if isinstance(expected_type, tuple)
            else expected_type.__name__
        )
        raise TypeError(
            f"Config field '{field_name}' must be of type {expected_names}, got {type(value).__name__}"
        )


def _parse_viewport(raw: Any) -> ViewportConfig:
    _validate_type(raw, dict, "viewport")
    for key in ("width", "height"):
        if key not in raw:
            raise KeyError(f"Missing required viewport key: '{key}'")
        _validate_type(raw[key], int, f"viewport.{key}")
        if raw[key] <= 0:
            raise ValueError(f"viewport.{key} must be positive, got {raw[key]}")
    return ViewportConfig(width=raw["width"], height=raw["height"])


def _parse_clean(raw: Any) -> CleanConfig:
    _validate_type(raw, dict, "clean")
    if "strip_tags" not in raw:
        raise KeyError("Missing required clean key: 'strip_tags'")
    tags = raw["strip_tags"]
    _validate_type(tags, list, "clean.strip_tags")
    for tag in tags:
        _validate_type(tag, str, "clean.strip_tags item")
    return CleanConfig(strip_tags=[t.strip().lower() for t in tags])


def load_config(config_path: Path | str = "config.yaml") -> Config:
    path = Path(config_path)
    if not path.is_file():
        raise FileNotFoundError(f"Configuration file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"Configuration file {path} must contain a YAML mapping")

    required_keys = [
        "db_path",
        "output_root",
        "profile",
        "request_delay_seconds",
        "page_timeout_seconds",
        "user_agent",
        "viewport",
        "block_resource_types",
        "clean",
    ]
    for key in required_keys:
        if key not in data:
            raise KeyError(f"Missing required config key: '{key}'")

    _validate_type(data["db_path"], str, "db_path")
    _validate_type(data["output_root"], str, "output_root")
    _validate_type(data["profile"], str, "profile")
    _validate_type(data["request_delay_seconds"], (int, float), "request_delay_seconds")
    _validate_type(data["page_timeout_seconds"], (int, float), "page_timeout_seconds")
    _validate_type(data["user_agent"], str, "user_agent")
    _validate_type(data["block_resource_types"], list, "block_resource_types")
    for item in data["block_resource_types"]:
        _validate_type(item, str, "block_resource_types item")

    viewport = _parse_viewport(data["viewport"])
    clean = _parse_clean(data["clean"])

    return Config(
        db_path=Path(data["db_path"]),
        output_root=Path(data["output_root"]),
        profile=Path(data["profile"]),
        request_delay_seconds=float(data["request_delay_seconds"]),
        page_timeout_seconds=int(data["page_timeout_seconds"]),
        user_agent=str(data["user_agent"]),
        viewport=viewport,
        block_resource_types=[str(x) for x in data["block_resource_types"]],
        clean=clean,
    )
