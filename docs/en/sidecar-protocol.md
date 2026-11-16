# Sidecar JSON-RPC Protocol

[English](../en/sidecar-protocol.md) | [简体中文](../zh/sidecar-protocol.md)

This document specifies the wire protocol between the Electron main process and the Python sidecar. The authoritative TypeScript definitions live in `src/shared/types.ts`; the Python dispatcher is `resources/sidecar/sidecar_main.py`.

## Transport

- **Channel:** the sidecar process's stdin/stdout, one JSON document per line (`\n`-delimited).
- **Encoding:** UTF-8; Python runs with `PYTHONUNBUFFERED=1` and `PYTHONIOENCODING=utf-8`.
- **stdout is protocol-only.** Engine debug output goes to stderr, where the main process logs it. Non-JSON lines on stdout are silently ignored.
- **Timeout:** each request waits at most 5 minutes (300 000 ms) before the main process rejects the pending call.

## Message shapes

Request:

```json
{"jsonrpc":"2.0","id":1,"method":"generate_template","params":{...}}
```

Successful response:

```json
{"jsonrpc":"2.0","id":1,"result":{...}}
```

Error response:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "...", "data": "<traceback>" } }
```

Progress notification (no `id`, matches the request id it belongs to via `params.id`):

```json
{
  "jsonrpc": "2.0",
  "method": "progress",
  "params": { "id": 1, "message": "Uploading…", "percent": 42 }
}
```

Parse-error reply (unparseable input line, `id` is `null`):

```json
{ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error: ..." } }
```

Invalid-request reply (no `method` field):

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32600, "message": "Invalid request" } }
```

Method-not-found reply:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32601, "message": "Method not found: foo" } }
```

## Error codes

| Code     | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `-32700` | Parse error — the line was not valid JSON                                |
| `-32600` | Invalid request — missing `method`                                       |
| `-32601` | Method not found                                                         |
| `-32603` | Internal error — the handler raised; `data` carries the Python traceback |

## Methods

### `handshake`

Sent once immediately after spawn. Params: `{ "client": string, "version": string }`.

Result:

```json
{
  "engine_version": "1.2.0", // pyitol engine version (best effort)
  "pyitol_version": "0.3.0", // pyitolstudio adapter version
  "pid": 4242
}
```

### `list_template_types`

Params: `{}`. Returns `TemplateTypeInfo[]`:

```json
[
  {
    "type_name": "DATASET_SIMPLEBAR",
    "header": "DATASET_SIMPLEBAR",
    "required_columns": ["ID", "VALUE"],
    "no_label_color": false,
    "group": "datasets", // datasets | tree | metadata | extensions
    "group_label": "Datasets",
    "wizard_supported": true,
    "priority": 10
  }
]
```

### `build_form_idl`

Params: `{ "type": string, "locale": "zh" | "en" }` (sets the adapter translator locale). Returns a `FormIdl` describing the parameter form: `fields` (flat, each a `FieldSpec` with key, widget type, default, required, group, choices, ranges, hints), `groups` (ordered, expandable sections), `data_columns`, `data_column_labels`, `data_columns_dynamic`, `separator_choices`.

Widget types: `text`, `int`, `float`, `color`, `bool`, `choice`, `color_list`, `text_list`.

### `generate_template`

Params: `{ "unit": UnitSpec }` where `UnitSpec` is:

```json
{
  "type_name": "DATASET_SIMPLEBAR",
  "label": "Consistency",
  "color": "#dd4477",
  "separator": "TAB",
  "columns": ["ID", "VALUE"],
  "data_rows": [{ "ID": "leaf_1", "VALUE": "0.83" }],
  "parameters": { "DATASET_LABEL": "Consistency" },
  "legend": {},
  "template_name": "Consistency"
}
```

Result: `{ "text": string, "warnings": string[] }` — the template text plus separator-line validation warnings.

### `learn_from_file`

Params: `{ "path": string }`. Parses an existing iTOL template file and returns `LearnedUnit[]` (same shape as `UnitSpec` plus `header` and `source_file`). This powers "import template" / "learn from file".

### `tree_leaf_ids`

Params: `{ "path": string }`. Result: `{ "leaf_ids": string[] | null }` — sorted leaf ids of a Newick tree, or `null` when the file cannot be parsed as a tree.

### `export_template_file`

Params: `{ "unit": UnitSpec, "path": string }`. Writes the generated template text to `path`. Result: `{ "path": string }`.

### `upload`

Params:

```json
{
  "tree_file": "/path/to/tree.nwk",
  "template_files": ["/tmp/a.txt"],
  "output_dir": "/tmp/itol-out",
  "fmt": "svg",
  "api_key_file": "/path/to/key.txt", // or null
  "project_name": "My tree", // or null
  "force": false
}
```

Result: `{ "tree_id": string, "files": { "<name>": "<url>" } }`. This is the long-running call that emits `progress` notifications; the main process tags and forwards them to the renderer's upload dialog.

## Main-process behaviour

- Calls are correlated by a monotonically increasing numeric id (`nextId`).
- A crashed sidecar is restarted with exponential backoff (0.5 s, 1 s, 2 s; max 3 attempts). Concurrent `start()` calls share one spawn promise, so a burst of calls never spawns a second process. Pending calls at crash time are rejected with `Sidecar exited (code=…, signal=…)`.
- `dispose()` on app quit cancels restart timers, rejects pending calls, and sends `SIGTERM`.
