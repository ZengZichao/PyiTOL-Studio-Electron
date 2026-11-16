#!/usr/bin/env python3
"""PyiTOL Studio — Python sidecar (stdio JSON-RPC server).

This script is the *only* Python entry point for the Electron edition.
It reads line-delimited JSON-RPC requests from stdin, dispatches them
through the adapter layer (which wraps the pyitol engine), and writes
line-delimited JSON-RPC responses to stdout.

Development mode:
    python3 resources/sidecar/sidecar_main.py

Production mode (PyInstaller single-file):
    pyitol-sidecar  (bundled in resources/sidecar/dist/)

Protocol:
    Request:  {"jsonrpc":"2.0","id":1,"method":"handshake","params":{...}}
    Response: {"jsonrpc":"2.0","id":1,"result":{...}}
    Error:    {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"..."}}
    Progress: {"jsonrpc":"2.0","method":"progress","params":{"id":1,"message":"..."}}
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any

# Ensure the adapter layer is importable when running from source.
# In PyInstaller mode, everything is frozen and on sys.path already.
_HERE = os.path.dirname(os.path.abspath(__file__))
_STUDIO_SRC = os.path.join(_HERE, "..", "..", "src")
if os.path.isdir(_STUDIO_SRC):
    sys.path.insert(0, _STUDIO_SRC)

# Also check the old project structure for dev mode
_OLD_STUDIO = os.path.join(
    os.path.dirname(_HERE), "..", "..",
    "PyiTOL-Studio-项目代码", "src"
)
if os.path.isdir(_OLD_STUDIO):
    sys.path.insert(0, _OLD_STUDIO)


def _engine_version() -> str:
    """Best-effort engine version string."""
    try:
        from pyitol import __version__ as v  # type: ignore
        return v
    except Exception:
        try:
            from importlib.metadata import version
            return version("pyitol")
        except Exception:
            return "unknown"


def _pyitol_studio_version() -> str:
    try:
        from pyitolstudio import __version__ as v  # type: ignore
        return v
    except Exception:
        try:
            from importlib.metadata import version
            return version("pyitol-studio")
        except Exception:
            return "0.3.0-dev"


# ---------------------------------------------------------------------------
# RPC method implementations
# ---------------------------------------------------------------------------

def _norm_type_name(type_name: Any) -> str:
    """Normalize a template type name to the registry's canonical lowercase form.

    Legacy .pyitolproj files (and older app versions) store UPPERCASE names like
    "DATASET_COLORSTRIP", while the engine registry only knows lowercase keys —
    without normalization every engine call for such units fails with
    "Unknown template type".
    """
    return str(type_name or "").strip().lower()


def _handshake(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "engine_version": _engine_version(),
        "pyitol_version": _pyitol_studio_version(),
        "pid": os.getpid(),
    }


def _list_template_types(params: dict[str, Any]) -> list[dict[str, Any]]:
    from pyitolstudio.adapter.registry import list_template_types

    infos = list_template_types()
    return [
        {
            "type_name": i.type_name,
            "header": i.header,
            "required_columns": list(i.required_columns),
            "no_label_color": i.no_label_color,
            "group": i.group,
            "group_label": i.group_label,
            "wizard_supported": i.wizard_supported,
            "priority": i.priority,
        }
        for i in infos
    ]


def _build_form_idl(params: dict[str, Any]) -> dict[str, Any]:
    from pyitolstudio.adapter.form_idl import build_form_idl
    from pyitolstudio.i18n import translator

    type_name = _norm_type_name(params.get("type"))
    locale = params.get("locale", "en")
    translator().set_locale(locale)
    return build_form_idl(type_name)


def _generate_template(params: dict[str, Any]) -> dict[str, Any]:
    from pyitolstudio.adapter.generator_bridge import (
        UnitSpec,
        generate_template_text,
        validate_separator_line,
    )

    unit_data = params["unit"]
    spec = UnitSpec(
        type_name=_norm_type_name(unit_data.get("type_name")),
        label=unit_data.get("label", ""),
        color=unit_data.get("color", "#dd4477"),
        separator=unit_data.get("separator", "TAB"),
        columns=list(unit_data.get("columns", [])),
        data_rows=[dict(r) for r in unit_data.get("data_rows", [])],
        parameters=dict(unit_data.get("parameters", {})),
        legend=dict(unit_data.get("legend", {})),
        template_name=unit_data.get("template_name", unit_data.get("label", "")),
    )
    text = generate_template_text(spec)
    warnings = validate_separator_line(text)
    return {"text": text, "warnings": warnings}


def _learn_from_file(params: dict[str, Any]) -> list[dict[str, Any]]:
    from pyitolstudio.adapter.learner_bridge import learn_from_file

    path = params["path"]
    units = learn_from_file(path)
    return [
        {
            "type_name": _norm_type_name(u.type_name),
            "header": u.header,
            "separator": u.separator,
            "label": u.label,
            "color": u.color,
            "columns": list(u.columns),
            "data_rows": [dict(r) for r in u.data_rows],
            "parameters": dict(u.parameters),
            "legend": dict(u.legend),
            "source_file": u.source_file,
        }
        for u in units
    ]


def _tree_leaf_ids(params: dict[str, Any]) -> dict[str, Any]:
    from pyitolstudio.adapter.tree_bridge import tree_leaf_ids

    path = params["path"]
    ids = tree_leaf_ids(path)
    return {"leaf_ids": sorted(ids) if ids else None}


def _export_template_file(params: dict[str, Any]) -> dict[str, Any]:
    from pyitolstudio.adapter.generator_bridge import UnitSpec, export_template_file

    unit_data = params["unit"]
    out_path = params["path"]
    spec = UnitSpec(
        type_name=_norm_type_name(unit_data.get("type_name")),
        label=unit_data.get("label", ""),
        color=unit_data.get("color", "#dd4477"),
        separator=unit_data.get("separator", "TAB"),
        columns=list(unit_data.get("columns", [])),
        data_rows=[dict(r) for r in unit_data.get("data_rows", [])],
        parameters=dict(unit_data.get("parameters", {})),
        legend=dict(unit_data.get("legend", {})),
        template_name=unit_data.get("template_name", unit_data.get("label", "")),
    )
    result_path = export_template_file(spec, out_path)
    return {"path": str(result_path)}


def _upload(params: dict[str, Any]) -> dict[str, Any]:
    from pyitolstudio.adapter.client_bridge import upload_and_export

    result = upload_and_export(
        tree_file=params["tree_file"],
        template_files=list(params.get("template_files", [])),
        output_dir=params["output_dir"],
        fmt=params.get("fmt", "svg"),
        api_key_file=params.get("api_key_file"),
        project_name=params.get("project_name"),
        force=params.get("force", False),
    )
    return result


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------

_METHODS = {
    "handshake": _handshake,
    "list_template_types": _list_template_types,
    "build_form_idl": _build_form_idl,
    "generate_template": _generate_template,
    "learn_from_file": _learn_from_file,
    "tree_leaf_ids": _tree_leaf_ids,
    "export_template_file": _export_template_file,
    "upload": _upload,
}


# ---------------------------------------------------------------------------
# JSON-RPC stdio loop
# ---------------------------------------------------------------------------

def _send(obj: dict[str, Any]) -> None:
    """Write one JSON object as a single line to stdout."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _handle_request(req: dict[str, Any]) -> None:
    """Process one JSON-RPC request and send the response."""
    req_id = req.get("id")
    method = req.get("method", "")
    params = req.get("params", {})

    handler = _METHODS.get(method)
    if handler is None:
        _send({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        })
        return

    try:
        result = handler(params if isinstance(params, dict) else {})
        _send({"jsonrpc": "2.0", "id": req_id, "result": result})
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        _send({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": -32603,
                "message": str(exc) or exc.__class__.__name__,
                "data": traceback.format_exc(),
            },
        })


def main() -> int:
    """Read line-delimited JSON-RPC from stdin, dispatch, write to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            _send({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {exc}"},
            })
            continue

        if not isinstance(req, dict) or "method" not in req:
            _send({
                "jsonrpc": "2.0",
                "id": req.get("id") if isinstance(req, dict) else None,
                "error": {"code": -32600, "message": "Invalid request"},
            })
            continue

        _handle_request(req)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
