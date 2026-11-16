# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository hygiene: `LICENSE`, `CITATION.cff`, `CONTRIBUTING.md`,
  `SECURITY.md`, `DESIGN.md`, `.pre-commit-config.yaml`, and CI workflows
  under `.github/`.
- `lint`, `format`, `format:check`, and `test:e2e` npm scripts, matching the
  commands already documented in `docs/en/development.md` and
  `docs/en/testing.md`.

### Fixed

- **Dependencies**: removed the unused `@tanstack/react-table` /
  `@tanstack/react-virtual` entries that had drifted into
  `package-lock.json` without being declared in `package.json`; upgraded
  `i18next` to `^26.2.0` so it satisfies the `react-i18next@17` peer
  requirement and `npm ci` resolves cleanly.
- **Repository**: added `.gitignore` coverage for Playwright output
  (`test-results/`, `playwright-report/`), local tooling (`docs/.mimosa/`),
  and secrets (`.env`, `*.key`, `.itolapi.key`); removed the stray
  592 KB `index.js` bundle that was never referenced by any config.
- **Style**: applied Prettier across the repository so `npm run
format:check` passes.

## [0.3.0] - 2026-11-16

### Added

- Electron + React + TypeScript rewrite of PyiTOL Studio (the former
  PySide6 edition remains available separately).
- Welcome page, three-panel workbench (rail / table + preview / inspector),
  template wizard, command palette (⌘K), and bilingual (zh/en) UI with
  hot-switching.
- Python sidecar over stdio JSON-RPC: the `pyitol` engine is packaged as a
  PyInstaller onedir bundle and reused for template generation, learning,
  and iTOL upload.
- Packaging for macOS (arm64) with signed/notarized dmg + zip via
  electron-builder, plus electron-updater support.
- Documentation set in English and Simplified Chinese (architecture,
  sidecar protocol, IPC reference, development, testing, build, design
  system).
