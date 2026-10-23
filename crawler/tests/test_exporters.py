from __future__ import annotations

import json
from pathlib import Path
import pytest

from exporters import export_json


def test_export_json_valid_and_utf8(tmp_path: Path) -> None:
    sample_records = [
        {
            "title": "A Light in the Attic",
            "price": "£51.77",
            "availability": "In stock (22 available)",
            "unicode_check": "Café München ñ 🚀",
        }
    ]

    out_dir = tmp_path / "run_output"
    written_path = export_json(sample_records, out_dir)

    assert written_path.exists()
    assert written_path.name == "data.json"

    raw_text = written_path.read_text(encoding="utf-8")
    assert "£51.77" in raw_text
    assert "Café München ñ 🚀" in raw_text

    loaded = json.loads(raw_text)
    assert loaded == sample_records


def test_export_json_empty_array(tmp_path: Path) -> None:
    out_dir = tmp_path / "empty_output"
    written_path = export_json([], out_dir)

    assert written_path.exists()
    raw_text = written_path.read_text(encoding="utf-8")
    loaded = json.loads(raw_text)
    assert loaded == []


def test_export_json_refuses_overwrite(tmp_path: Path) -> None:
    out_dir = tmp_path / "duplicate_output"
    export_json([{"id": 1}], out_dir)

    with pytest.raises(FileExistsError, match="refusing to overwrite"):
        export_json([{"id": 2}], out_dir)
