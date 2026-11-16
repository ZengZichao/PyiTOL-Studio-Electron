#!/usr/bin/env python3
"""Smoke test: generate → learn roundtrip through the sidecar.

Runs the sidecar process, sends a generate_template call, writes the
result to a temp file, then sends a learn_from_file call on that file,
and verifies the learned unit matches the original.

Usage:
    python3 tests/smoke_roundtrip.py

Exit code 0 = pass, non-zero = fail.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent.resolve()
SIDECAR_SCRIPT = HERE.parent / "resources" / "sidecar" / "sidecar_main.py"

# Ensure the adapter layer is importable
STUDIO_SRC = HERE.parent.parent / "PyiTOL-Studio-项目代码" / "src"
if STUDIO_SRC.is_dir():
    sys.path.insert(0, str(STUDIO_SRC))


def send(proc: subprocess.Popen, method: str, params: dict) -> dict:
    """Send one JSON-RPC request, return the parsed response."""
    import threading

    req = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    line = json.dumps(req) + "\n"
    assert proc.stdin is not None
    proc.stdin.write(line)
    proc.stdin.flush()

    assert proc.stdout is not None
    resp_line = proc.stdout.readline()
    if not resp_line:
        # Check stderr
        assert proc.stderr is not None
        err = proc.stderr.read()
        raise RuntimeError(f"Sidecar returned empty response. stderr: {err}")
    return json.loads(resp_line)


def main() -> int:
    # Start sidecar
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    proc = subprocess.Popen(
        [sys.executable, str(SIDECAR_SCRIPT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    try:
        # 1. Handshake
        resp = send(proc, "handshake", {"client": "test", "version": "0.0.0"})
        assert "result" in resp, f"Handshake failed: {resp}"
        print(f"✓ Handshake: engine={resp['result']['engine_version']}")

        # 2. list_template_types
        resp = send(proc, "list_template_types", {})
        assert "result" in resp, f"list_template_types failed: {resp}"
        types = resp["result"]
        print(f"✓ list_template_types: {len(types)} types registered")
        assert len(types) >= 20, f"Expected ≥20 types, got {len(types)}"

        # 3. build_form_idl for dataset_colorstrip
        resp = send(proc, "build_form_idl", {"type": "dataset_colorstrip", "locale": "en"})
        assert "result" in resp, f"build_form_idl failed: {resp}"
        idl = resp["result"]
        print(f"✓ build_form_idl: {len(idl['fields'])} fields for dataset_colorstrip")

        # 4. generate_template
        unit = {
            "type_name": "dataset_colorstrip",
            "label": "Test Strip",
            "color": "#002fa7",
            "separator": "TAB",
            "columns": ["id", "value", "color"],
            "data_rows": [
                {"id": "Ailuropoda", "value": "1", "color": "#002fa7"},
                {"id": "Homo_sapiens", "value": "2", "color": "#2e5cff"},
                {"id": "Mus_musculus", "value": "4", "color": "#8aa4ff"},
            ],
            "parameters": {"COLOR_BRANCHES": "1"},
            "legend": {},
            "template_name": "Test Strip",
        }
        resp = send(proc, "generate_template", {"unit": unit})
        assert "result" in resp, f"generate_template failed: {resp}"
        text = resp["result"]["text"]
        print(f"✓ generate_template: {len(text)} chars")
        assert "DATASET_COLORSTRIP" in text
        assert "Ailuropoda" in text

        # 5. Write to temp file and learn_from_file (roundtrip)
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as f:
            f.write(text)
            temp_path = f.name

        try:
            resp = send(proc, "learn_from_file", {"path": temp_path})
            assert "result" in resp, f"learn_from_file failed: {resp}"
            learned = resp["result"]
            print(f"✓ learn_from_file: {len(learned)} units parsed")
            assert len(learned) == 1
            lu = learned[0]
            assert lu["type_name"] == "dataset_colorstrip"
            assert lu["label"] == "Test Strip"
            assert lu["separator"] == "TAB"
            assert len(lu["data_rows"]) == 3
            assert lu["data_rows"][0]["id"] == "Ailuropoda"
            print(f"✓ Roundtrip verified: type={lu['type_name']}, label={lu['label']}")

        finally:
            os.unlink(temp_path)

        # 6. tree_leaf_ids
        example_tree = HERE.parent / "resources" / "samples" / "example_tree.nwk"
        if example_tree.exists():
            resp = send(proc, "tree_leaf_ids", {"path": str(example_tree)})
            assert "result" in resp, f"tree_leaf_ids failed: {resp}"
            leaf_ids = resp["result"]["leaf_ids"]
            print(f"✓ tree_leaf_ids: {len(leaf_ids) if leaf_ids else 0} leaves")
            if leaf_ids:
                assert "Ailuropoda" in leaf_ids
                assert "Homo_sapiens" in leaf_ids

        print("\n✅ All smoke tests passed!")
        return 0

    except AssertionError as e:
        print(f"\n❌ Assertion failed: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
