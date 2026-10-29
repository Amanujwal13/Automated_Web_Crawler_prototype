from __future__ import annotations

from pathlib import Path
import pytest
import yaml

from config import Config, load_config


def test_load_valid_config(tmp_path: Path) -> None:
    cfg_data = {
        "db_path": "test.db",
        "output_root": "out",
        "profile": "profiles/books.yaml",
        "request_delay_seconds": 1.5,
        "page_timeout_seconds": 15,
        "user_agent": "TestBot/1.0",
        "viewport": {"width": 1024, "height": 768},
        "block_resource_types": ["image", "media"],
        "clean": {"strip_tags": ["script", "style"]},
    }
    cfg_file = tmp_path / "valid_config.yaml"
    cfg_file.write_text(yaml.dump(cfg_data), encoding="utf-8")

    cfg = load_config(cfg_file)
    assert isinstance(cfg, Config)
    assert cfg.request_delay_seconds == 1.5
    assert cfg.viewport.width == 1024
    assert cfg.viewport.height == 768
    assert "image" in cfg.block_resource_types
    assert "script" in cfg.clean.strip_tags


def test_load_config_missing_required_key(tmp_path: Path) -> None:
    cfg_data = {
        "db_path": "test.db",
        # missing output_root
        "profile": "profiles/books.yaml",
        "request_delay_seconds": 1.5,
        "page_timeout_seconds": 15,
        "user_agent": "TestBot/1.0",
        "viewport": {"width": 1024, "height": 768},
        "block_resource_types": [],
        "clean": {"strip_tags": []},
    }
    cfg_file = tmp_path / "invalid_config.yaml"
    cfg_file.write_text(yaml.dump(cfg_data), encoding="utf-8")

    with pytest.raises(KeyError, match="Missing required config key"):
        load_config(cfg_file)


def test_load_config_invalid_viewport(tmp_path: Path) -> None:
    cfg_data = {
        "db_path": "test.db",
        "output_root": "out",
        "profile": "profiles/books.yaml",
        "request_delay_seconds": 1.0,
        "page_timeout_seconds": 10,
        "user_agent": "TestBot/1.0",
        "viewport": {"width": -50, "height": 768},  # non-positive width
        "block_resource_types": [],
        "clean": {"strip_tags": []},
    }
    cfg_file = tmp_path / "bad_viewport.yaml"
    cfg_file.write_text(yaml.dump(cfg_data), encoding="utf-8")

    with pytest.raises(ValueError, match="must be positive"):
        load_config(cfg_file)
