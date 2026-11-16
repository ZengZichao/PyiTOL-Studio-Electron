# PyiTOL Studio (Electron Edition)

[English](README.md) | [简体中文](README.zh-CN.md)

**Repository:** [github.com/ZengZichao/PyiTOL-Studio-Electron](https://github.com/ZengZichao/PyiTOL-Studio-Electron) · Engine: [PyiTOL](https://github.com/ZengZichao/PyiTOL)

[![DOI](https://zenodo.org/badge/24277234.svg)](https://doi.org/10.5281/zenodo.24277234)

Desktop workbench for [iTOL](https://itol.embl.de) annotation templates — rebuilt with Electron, React, and a Python sidecar.

PyiTOL Studio lets you compose, validate, preview and upload iTOL annotation templates (datasets, tree decorations, metadata, extensions) from a native desktop app, with a Python engine doing the template generation, parsing ("learning") and iTOL upload behind the scenes.

## Documentation

All documentation exists in both English and Simplified Chinese.

| Document                      | English                                                                | 简体中文                                                               |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Getting started (this file)   | [README.md](README.md)                                                 | [README.zh-CN.md](README.zh-CN.md)                                     |
| Architecture                  | [docs/en/architecture.md](docs/en/architecture.md)                     | [docs/zh/architecture.md](docs/zh/architecture.md)                     |
| Sidecar JSON-RPC protocol     | [docs/en/sidecar-protocol.md](docs/en/sidecar-protocol.md)             | [docs/zh/sidecar-protocol.md](docs/zh/sidecar-protocol.md)             |
| IPC reference                 | [docs/en/ipc-reference.md](docs/en/ipc-reference.md)                   | [docs/zh/ipc-reference.md](docs/zh/ipc-reference.md)                   |
| Development guide             | [docs/en/development.md](docs/en/development.md)                       | [docs/zh/development.md](docs/zh/development.md)                       |
| Testing guide                 | [docs/en/testing.md](docs/en/testing.md)                               | [docs/zh/testing.md](docs/zh/testing.md)                               |
| Build & release               | [docs/en/build.md](docs/en/build.md)                                   | [docs/zh/build.md](docs/zh/build.md)                                   |
| Design system                 | [docs/en/design-system.md](docs/en/design-system.md)                   | [docs/zh/design-system.md](docs/zh/design-system.md)                   |
| Frontend design review report | [docs/en/frontend-design-review.md](docs/en/frontend-design-review.md) | [docs/zh/frontend-design-review.md](docs/zh/frontend-design-review.md) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                     │
│  ├─ BrowserWindow (sandbox, contextIsolation)        │
│  ├─ SidecarManager (stdio JSON-RPC)                  │
│  └─ IPC handlers (project, files, upload, settings)  │
├─────────────────────────────────────────────────────┤
│  Preload (contextBridge → window.pyitol)             │
├─────────────────────────────────────────────────────┤
│  Renderer (React 18 + Tailwind v4 + Zustand)         │
│  ├─ Welcome page                                     │
│  ├─ Workbench (3-panel: rail / table+preview / insp) │
│  ├─ Template wizard                                  │
│  ├─ Command palette (⌘K)                             │
│  └─ i18next (zh/en hot-switch)                       │
├─────────────────────────────────────────────────────┤
│  Python Sidecar (PyInstaller onedir bundle)          │
│  ├─ stdio JSON-RPC server                            │
│  ├─ adapter layer (registry, form_idl, bridges)      │
│  └─ pyitol engine (generator, learner, tree, API)    │
└─────────────────────────────────────────────────────┘
```

See [Architecture](docs/en/architecture.md) for details, and [Sidecar protocol](docs/en/sidecar-protocol.md) for the JSON-RPC wire format.

## Prerequisites

- **Node.js** ≥ 20 (for Electron + Vite)
- **Python** ≥ 3.10 with the `pyitol` engine and `pyitolstudio` adapter installed
- **macOS** 12+ (primary target; arm64)

### Python environment setup

The sidecar wraps the existing `pyitol` engine and `pyitolstudio` adapter:

```bash
# From the original project directory
cd PyiTOL-Studio-项目代码
python -m venv .build-venv
source .build-venv/bin/activate
pip install -e .
pip install pyitol  # the engine
```

## Development

```bash
# Install JS dependencies
cd PyiTOL-Studio-Electron
npm install

# Start the dev server (spawns Electron + Vite HMR)
npm run dev
```

In development mode, the sidecar is spawned from the venv Python (`python3 resources/sidecar/sidecar_main.py`), so the adapter and engine must be importable from that environment.

### Smoke test (sidecar roundtrip)

```bash
cd PyiTOL-Studio-Electron
python3 tests/smoke_roundtrip.py
```

This verifies: handshake → list_template_types → build_form_idl → generate_template → learn_from_file (roundtrip) → tree_leaf_ids.

### Type checking & linting

```bash
npm run typecheck   # TypeScript strict, zero errors
npm run lint        # ESLint
npm run format      # Prettier
```

## Building

### 1. Build the Python sidecar

```bash
cd resources/sidecar
python -m PyInstaller pyitol-sidecar.spec --noconfirm --distpath dist --workpath build
# Output: resources/sidecar/dist/pyitol-sidecar/  (onedir bundle)
```

The spec builds **onedir** mode: the app starts instantly instead of
self-extracting a ~1 GB single-file bundle into `$TMPDIR` on every launch.

### 2. Build the Electron app

```bash
npm run build      # Compile main + preload + renderer
npm run build:mac  # electron-builder → dmg + zip (arm64)
```

The `dmg` is for manual install. To enable `electron-updater` auto-update,
add a `publish` section (with a real feed URL) to `electron-builder.yml` —
without it the build ships no `app-update.yml` and the updater stays disabled
instead of surfacing network errors on every launch.

### Signing & notarization

Set these environment variables for a release build:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export PYITOL_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run build:mac
```

See [Build & release](docs/en/build.md) for the complete checklist.

## Key Design Decisions

1. **Python sidecar, not native bindings** — the `pyitol` engine stays in Python, packaged as a PyInstaller onedir bundle, communicating via line-delimited JSON-RPC over stdio. This keeps the engine maintainable and cross-platform.

2. **DESIGN.md as the single design authority** — colors, typography, spacing, rounded, and component grammar are all derived from the Apple DESIGN.md, with four explicit overrides (brand colour, monochrome tree mark, dual themes, desktop density).

3. **Single accent colour** — International Klein Blue (`#002FA7` light / `#2e5cff` dark). No second brand colour. No gradients. No shadows on chrome.

4. **`.pyitolproj` v1 byte-level compatible** — the project file format is identical to the PySide6 edition.

5. **Security baseline** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP locked down, preload exposes a typed API.

## Milestones

- **M1** ✅ — Shell + design system + sidecar communication (generate → learn roundtrip)
- **M2** — Three-panel workbench + table + inspector + live preview
- **M3** — Wizard + upload + command palette + bilingual
- **M4** — Welcome page + example project + packaging + auto-update

## License

MIT
