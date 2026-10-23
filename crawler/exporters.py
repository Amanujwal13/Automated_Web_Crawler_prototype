from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def export_json(
    records: list[dict[str, Any]],
    output_dir: Path | str,
    overwrite: bool = False,
) -> Path:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    target_file = out_dir / "data.json"
    if target_file.exists() and not overwrite:
        raise FileExistsError(f"Export target already exists; refusing to overwrite: {target_file}")

    serialized = json.dumps(records, indent=2, ensure_ascii=False) + "\n"
    target_file.write_text(serialized, encoding="utf-8")
    return target_file
