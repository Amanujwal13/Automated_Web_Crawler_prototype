from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import subprocess
import sys


from store import get_connection


def get_db_connection() -> sqlite3.Connection:
    db_path = Path(__file__).parent / "crawl.db"
    conn = get_connection(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def list_runs() -> list[dict]:
    try:
        conn = get_db_connection()
    except Exception as e:
        return []

    cursor = conn.cursor()
    cursor.execute("SELECT id, created_at, output_dir FROM runs ORDER BY created_at DESC;")
    runs = []
    for row in cursor.fetchall():
        run_id = row["id"]
        # Count statuses for this run
        c_stats = conn.cursor()
        c_stats.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_cnt,
                SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_cnt,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_cnt,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_cnt
            FROM urls WHERE run_id = ?;
            """,
            (run_id,),
        )
        stats = c_stats.fetchone()

        runs.append({
            "id": run_id,
            "created_at": row["created_at"],
            "output_dir": row["output_dir"],
            "total": stats["total"] if stats else 0,
            "done": stats["done_cnt"] or 0,
            "blocked": stats["blocked_cnt"] or 0,
            "failed": stats["failed_cnt"] or 0,
            "pending": stats["pending_cnt"] or 0,
        })
    conn.close()
    return runs


def get_run_detail(run_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, created_at, output_dir FROM runs WHERE id = ?;", (run_id,))
    run_row = cursor.fetchone()
    if not run_row:
        conn.close()
        return {"error": f"Run '{run_id}' not found"}

    cursor.execute(
        "SELECT url, status, error, record, attempts, updated_at FROM urls WHERE run_id = ? ORDER BY rowid ASC;",
        (run_id,),
    )
    urls = []
    records = []
    for r in cursor.fetchall():
        record_obj = None
        if r["record"]:
            try:
                record_obj = json.loads(r["record"])
                records.append(record_obj)
            except Exception:
                pass

        urls.append({
            "url": r["url"],
            "status": r["status"],
            "error": r["error"],
            "record": record_obj,
            "attempts": r["attempts"],
            "updated_at": r["updated_at"],
        })

    # Read data.json if available
    out_dir = Path(run_row["output_dir"])
    data_file = out_dir / "data.json"
    exported_data = None
    if data_file.exists():
        try:
            exported_data = json.loads(data_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    conn.close()
    return {
        "id": run_row["id"],
        "created_at": run_row["created_at"],
        "output_dir": run_row["output_dir"],
        "urls": urls,
        "records": exported_data if exported_data is not None else records,
    }


def run_tests() -> dict:
    cwd = Path(__file__).parent
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-v", "--tb=short"],
        cwd=str(cwd),
        capture_output=True,
        text=True,
    )
    return {
        "exit_code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "passed": result.returncode == 0,
    }


def list_profiles() -> list[dict]:
    from profiles import load_profiles_dir
    p_dir = Path(__file__).parent / "profiles"
    loaded = load_profiles_dir(p_dir)
    return [
        {
            "name": p.name,
            "domains": p.domains,
            "record_type": p.record_type,
            "fields": {
                fname: {
                    "selector": rule.selector,
                    "attr": rule.attr,
                    "table_row": rule.table_row,
                    "required": rule.required,
                }
                for fname, rule in p.fields.items()
            },
            "source_file": p.source_path.name,
        }
        for p in loaded
    ]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing action"}))
        sys.exit(1)

    action = sys.argv[1]
    if action == "runs":
        print(json.dumps(list_runs()))
    elif action == "run-detail" and len(sys.argv) >= 3:
        print(json.dumps(get_run_detail(sys.argv[2])))
    elif action == "run-tests":
        print(json.dumps(run_tests()))
    elif action == "profiles":
        print(json.dumps(list_profiles()))
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))
