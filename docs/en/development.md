# Development Guide

[English](../en/development.md) | [简体中文](../zh/development.md)

Everyday workflows for developing PyiTOL Studio: environment setup, commands, conventions, and recipes for common changes.

## Prerequisites

- Node.js ≥ 20, npm
- Python ≥ 3.10
- A working Python environment with `pyitol` (engine) and `pyitolstudio` (adapter) importable — see the [README](../../README.md#python-environment-setup). In development the sidecar prefers the sibling project's virtualenv at `../PyiTOL-Studio-项目代码/.build-venv/bin/python`, falling back to `python3` on `PATH`.

## Commands

| Command                            | What it does                                                       |
| ---------------------------------- | ------------------------------------------------------------------ |
| `npm install`                      | install JS dependencies                                            |
| `npm run dev`                      | electron-vite dev server with HMR; spawns Electron and the sidecar |
| `npm run build`                    | compile main + preload + renderer into `out/`                      |
| `npm run typecheck`                | strict TypeScript over both node and web tsconfigs                 |
| `npm run lint`                     | ESLint                                                             |
| `npm run format`                   | Prettier write                                                     |
| `npm run test:race`                | unit test for sidecar start/restart race conditions                |
| `npm run build:mac`                | production build + electron-builder dmg/zip (arm64)                |
| `python3 tests/smoke_roundtrip.py` | sidecar protocol roundtrip smoke test                              |

## Project conventions

- **TypeScript strict mode**; `npm run typecheck` must pass with zero errors before merging.
- **Contracts live in `src/shared/types.ts`.** When you change an IPC channel or an RPC method, update the types first, then both sides.
- **Style:** Prettier (`.prettierrc.yaml`), ESLint flat config (`eslint.config.ts`). Import order: external packages, then relative.
- **No hardcoded UI strings in components.** Add keys to `src/renderer/src/i18n/index.ts` (both `zh` and `en` tables; keys mirror the PySide6 i18n.py). Use i18next interpolation `{{name}}`, not positional placeholders.
- **Renderer purity:** components never import `electron`, `fs`, `path`, or `child_process`. They use `window.pyitol` only.
- **State:** project data in the `project` Zustand store; panel/theme/language in `ui`. Set the dirty flag (`window.pyitol.dirty.set(true)`) on every mutation.

## Recipes

### Add an IPC channel

1. Define the channel's payload/result types in `src/shared/types.ts` and extend `PreloadApi`.
2. Implement the handler in the matching `src/main/ipc-*.ts` (or `index.ts` for plumbing).
3. Expose it in `src/preload/index.ts`.
4. Add an entry to the [IPC reference](ipc-reference.md) (both languages).
5. `npm run typecheck`.

### Add an engine capability (new RPC method)

1. Add the method name to `RpcMethod` in `src/shared/types.ts`.
2. Implement `_<method>(params)` and register it in `_METHODS` in `resources/sidecar/sidecar_main.py`; heavy imports go inside the handler (lazy) so startup stays fast.
3. Extend `tests/smoke_roundtrip.py` with a roundtrip check where applicable.
4. Document it in the [sidecar protocol](sidecar-protocol.md) (both languages).

### Add a template type

Template types come from the adapter registry (`pyitolstudio.adapter.registry`), not from the Electron app. Register the type in the adapter layer; the workbench, wizard and inspector pick it up via `list_template_types` and `build_form_idl`. Nothing to change in this repository unless UI grouping (`group`, `priority`, `wizard_supported`) changes.

### Add UI strings

1. Add the key with identical spelling to both tables in `src/renderer/src/i18n/index.ts`.
2. Interpolation uses `{{name}}`; never concatenate translated fragments — add a whole-sentence key instead (plurals/word order differ between zh and en).
3. Menu labels are separate: edit `src/main/menu.ts`'s `zh ? ... : ...` pairs if the command appears in the native menu.

### Debug the sidecar

- stderr of the sidecar is logged by the main process as `[sidecar:stderr] …`; open Electron from a terminal (`npm run dev`) to see it.
- To exercise the protocol without the UI: `python3 resources/sidecar/sidecar_main.py` and paste a JSON-RPC line, e.g.
  `{"jsonrpc":"2.0","id":1,"method":"handshake","params":{"client":"cli","version":"0"}}`
- To run against a specific engine state, use the smoke test as a template (`tests/smoke_roundtrip.py`).

### Debug the renderer

- DevTools: View → Developer Tools (dev builds only).
- CSP blocks remote resources by design; if you need a local font/image, put it under `src/renderer/src/assets` and import it.

## Release flow

See [Build & release](build.md). Short version: rebuild the sidecar bundle → `npm run build:mac` → verify the dmg launches and generates/learns a template → tag.

## Documentation rules

Every user- or developer-facing document exists in both English and Simplified Chinese, as a filename-matched pair under `docs/en/` and `docs/zh/`, cross-linked at the top. When you change behavior documented here, update both language versions in the same change. See [docs index](../index.md).
