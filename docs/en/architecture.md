# Architecture

[English](../en/architecture.md) | [简体中文](../zh/architecture.md)

This document describes the structure of PyiTOL Studio (Electron edition): process layout, data flow, module responsibilities, and the contracts between them.

## Overview

PyiTOL Studio is a three-process desktop app:

```
┌────────────────────┐   IPC (contextBridge)   ┌────────────────────┐
│  Renderer process  │ ◄─────────────────────► │  Main process      │
│  React 18 SPA      │   window.pyitol (typed) │  Node.js           │
└────────────────────┘                         └─────────┬──────────┘
                                                         │ stdio
                                                         │ line-delimited JSON-RPC
                                               ┌─────────▼──────────┐
                                               │  Python sidecar    │
                                               │  pyitol engine +   │
                                               │  pyitolstudio      │
                                               │  adapter layer     │
                                               └────────────────────┘
```

- **Renderer** never touches Node, the filesystem, or the network directly. All privileged operations go through the preload bridge.
- **Main process** owns the `BrowserWindow`, native dialogs, settings persistence, the application menu, the auto-updater, and the sidecar lifecycle.
- **Python sidecar** is the only place where the `pyitol` engine runs. It is a stateless-per-request line-delimited JSON-RPC server on stdio.

## Source layout

```
PyiTOL-Studio-Electron/
├─ src/
│  ├─ main/              Electron main process
│  │  ├─ index.ts        entry: window creation, CSP, lifecycle, IPC wiring
│  │  ├─ sidecar.ts      SidecarManager: spawn, JSON-RPC, restart policy
│  │  ├─ ipc-project.ts  .pyitolproj open/save, example project, recents
│  │  ├─ ipc-files.ts    file pickers, read/write, type detection
│  │  ├─ ipc-upload.ts   long-running upload with progress forwarding
│  │  ├─ menu.ts         application menu (zh/en), command forwarding
│  │  ├─ store.ts        JSON settings store (userData/settings.json)
│  │  └─ updater.ts      electron-updater wrapper (production only)
│  ├─ preload/
│  │  └─ index.ts        contextBridge → window.pyitol (typed PreloadApi)
│  ├─ renderer/
│  │  └─ src/
│  │     ├─ App.tsx      top-level routing (welcome / workbench)
│  │     ├─ components/  workbench, wizard, command palette, welcome, ui
│  │     ├─ stores/      Zustand stores (project, ui)
│  │     ├─ i18n/        i18next zh/en tables (hot-switch)
│  │     ├─ lib/         theme, validation, syntax highlighting
│  │     └─ hooks/       dialog, menu commands, keyboard shortcuts
│  └─ shared/
│     └─ types.ts        single source of truth for IPC + RPC contracts
├─ resources/
│  ├─ sidecar/
│  │  ├─ sidecar_main.py       Python sidecar entry (dev)
│  │  ├─ pyitol-sidecar.spec   PyInstaller spec (onedir)
│  │  └─ dist/                 built bundle (extraResources at package time)
│  └─ samples/                 example project + tree (extraResources)
├─ tests/
│  ├─ smoke_roundtrip.py Python sidecar roundtrip test
│  ├─ unit/              Node unit tests (sidecar race conditions)
│  └─ e2e/               Playwright smoke specs
├─ electron-builder.yml  packaging configuration
└─ electron.vite.config.ts  build pipeline (main/preload/renderer)
```

## Renderer

- **React 18** with **Tailwind CSS v4** and **Zustand** for state.
- Two top-level screens: the **Welcome page** (new/open project, example project, recent projects) and the **Workbench** (three panels: left rail of template units, center table + live template preview, right inspector).
- **i18next** with `zh`/`en` tables; language hot-switches at runtime and is persisted in settings (`ui/language`). The native menu is rebuilt with matching labels.
- State is held in two Zustand stores: `project` (units, tree path, dirty flag) and `ui` (theme, language, panel visibility).
- All engine access goes through `window.pyitol.sidecar.call(method, params)`.

## Main process

### Window & security baseline

`src/main/index.ts` creates a `BrowserWindow` with:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- CSP injected on every response; in dev it additionally allows `localhost` connect-src and inline scripts for Vite HMR
- `setWindowOpenHandler` denies all in-app window creation; `https://` links open in the system browser
- hiddenInset title bar (macOS traffic lights at a custom position)

### Unsaved-changes guard

The renderer sets a dirty flag through IPC (`set-dirty` / `check-dirty-sync`). On window close, the main process intercepts, shows a native Save/Discard/Cancel dialog, and on "Save" forwards the `save-project` menu command to the renderer before closing.

### SidecarManager (`src/main/sidecar.ts`)

Responsibilities:

1. **Path resolution** — dev: the sibling project's `.build-venv` Python (fallback `python3`), running `resources/sidecar/sidecar_main.py`; production: the PyInstaller onedir executable under `process.resourcesPath/sidecar/`.
2. **Spawn + handshake** — sends `handshake {client, version}` and stores `engine_version`, `pyitol_version`, `pid`.
3. **Request/response correlation** — each call gets a numeric id; responses are matched by id; `progress` notifications are forwarded as events.
4. **Timeouts** — 5 minutes per call (long uploads).
5. **Crash handling** — on exit, reject all pending calls; auto-restart with exponential backoff (0.5 s, 1 s, 2 s), up to 3 attempts; emit `crash` when the limit is reached. Concurrent `start()` calls share one spawn promise, so a burst of calls never spawns a second sidecar.
6. **Dispose** — on app quit: cancel restart timers, reject pending calls, `SIGTERM` the process.

### IPC handler groups

| Module           | Channels                                                                                                                                                       | Notes                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ipc-project.ts` | `project:new/open/save/save-as/load-example/recent/add-recent/clear-recent`                                                                                    | `.pyitolproj` v1, byte-compatible with the PySide6 edition; recents trimmed to 10, non-existent paths filtered                                         |
| `ipc-files.ts`   | `files:pick-tree/pick-template/pick-data/pick-directory/read/write/export-template/detect-type/get-temp-dir/join-path`                                         | all file access is user-initiated via native dialogs; `detect-type` sniffs content (Newick ends with `;` with parens; templates start with `DATASET_`) |
| `ipc-upload.ts`  | `upload:run`, `upload:progress`, `upload:cancel`                                                                                                               | forwards sidecar `progress` events tagged with a request id; cancellation is best-effort (engine-level abort is not implemented)                       |
| `index.ts`       | `sidecar:call`, `sidecar:progress/crash`, `sidecar:engine-version`, `settings:*`, `platform:*`, `clipboard:*`, `menu:command`, `set-dirty`, `check-dirty-sync` | generic plumbing                                                                                                                                       |

See [IPC reference](ipc-reference.md) for the full channel list.

### Settings store (`src/main/store.ts`)

A thin synchronous JSON store at `userData/settings.json`. Keys in use: `ui/theme`, `ui/language`, `app/dirty`, `project/currentPath`, `project/recent`.

### Menu (`src/main/menu.ts`)

Built from the saved language. Every command is forwarded to the renderer as a `menu:command` event with a `MenuCommand` id (see `src/shared/types.ts`); the renderer owns execution. Theme radio items call `nativeTheme.themeSource` and rebuild the menu.

### Updater (`src/main/updater.ts`)

`electron-updater` wrapper, initialized only when `app.isPackaged`. Without a `publish` section in `electron-builder.yml`, the build contains no `app-update.yml` and the updater stays silently disabled.

## Python sidecar

`resources/sidecar/sidecar_main.py` is the only Python entry point. It:

- reads line-delimited JSON-RPC requests from stdin,
- dispatches through the `pyitolstudio` adapter layer (`registry`, `form_idl`, `generator_bridge`, `learner_bridge`, `tree_bridge`, `client_bridge`),
- writes line-delimited JSON-RPC responses to stdout (progress notifications have no `id`),
- logs tracebacks to stderr only (stdout is protocol-only).

Methods: `handshake`, `list_template_types`, `build_form_idl`, `generate_template`, `learn_from_file`, `tree_leaf_ids`, `export_template_file`, `upload`. See [Sidecar protocol](sidecar-protocol.md) for message formats.

### Packaging

`pyitol-sidecar.spec` builds an **onedir** bundle (fast startup, no per-launch self-extraction). `electron-builder.yml` copies `resources/sidecar/dist` and `resources/samples` into the app bundle as `extraResources`, so production resolves sidecar and sample paths via `process.resourcesPath`.

## Data flow examples

**Generate preview:** renderer collects form state → `sidecar.call('generate_template', {unit})` → main forwards over stdio → adapter `generate_template_text` + `validate_separator_line` → `{text, warnings}` back through the same chain.

**Import (learn) a template file:** native file dialog returns a path → `sidecar.call('learn_from_file', {path})` → adapter `learner_bridge` → `LearnedUnit[]` → renderer fills the form and adds a unit to the project.

**Upload to iTOL:** `upload:run` IPC → sidecar `upload` → `client_bridge.upload_and_export` exports templates and calls the iTOL API → `UploadResult {tree_id, files}`; progress notifications stream back to the renderer dialog.

**Project save:** renderer serializes project state → `project.save(data)` → main writes `JSON.stringify(data, null, 2)` to the current path (first save prompts via `save-as` and stores `project/currentPath`).

## Key invariants

1. The renderer has no Node/Electron API access — everything goes through the typed preload bridge.
2. stdout of the sidecar carries only protocol lines; diagnostics go to stderr.
3. `.pyitolproj` v1 stays byte-level compatible with the PySide6 edition.
4. `src/shared/types.ts` is the single source of truth for all IPC/RPC contracts; neither side may drift from it.
5. All paths shown to native dialogs; the renderer never constructs privileged file paths itself.
