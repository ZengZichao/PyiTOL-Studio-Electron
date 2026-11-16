# Contributing to PyiTOL Studio

Thank you for your interest in contributing to PyiTOL Studio!

## Getting Started

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Start the development server (Electron + Vite with HMR):
   ```bash
   npm run dev
   ```

## Development Setup

**Prerequisites:**

- Node.js >= 20
- Python >= 3.10 with the `pyitol` engine and `pyitolstudio` adapter
  installed (only needed for the sidecar / packaging workflow)
- macOS 12+ (primary target; arm64)

**Setup steps:**

```bash
git clone https://github.com/ZengZichao/PyiTOL-Studio.git
cd PyiTOL-Studio
npm ci
npm run dev
```

## Quality Gates

Run these before opening a pull request:

```bash
npm run typecheck      # strict TypeScript over node + web tsconfigs
npm run lint           # ESLint (flat config)
npm run format:check   # Prettier
npm run test:race      # sidecar start/restart race regression (needs dist/)
npm run test:e2e       # Playwright Electron smoke test (needs npm run build)
```

`npm run typecheck` must pass with zero errors before merging. New code
should be formatted with Prettier (`.prettierrc.yaml`) and linted with the
flat config in `eslint.config.ts`.

## Project Layout

- `src/main` — Electron main process (window, menu, IPC, sidecar manager)
- `src/preload` — contextBridge API exposed to the renderer
- `src/renderer` — React 18 + Tailwind v4 UI
- `src/shared` — types shared between main and renderer
- `resources/sidecar` — Python sidecar entry point and PyInstaller spec
- `docs/en` / `docs/zh` — bilingual documentation

See [docs/en/development.md](docs/en/development.md) for the full guide and
[docs/en/architecture.md](docs/en/architecture.md) for the system design.

## Pull Requests

- Keep changes focused; one concern per pull request.
- Update the bilingual docs when behaviour changes.
- Add or update tests for regressions.
- Describe the user-visible effect in the pull request body.

## Reporting Issues

Use the GitHub issue tracker. For security reports, see
[SECURITY.md](SECURITY.md) instead.
