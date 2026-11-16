# PyiTOL Studio Documentation

[English](index.md) | [简体中文](index.zh-CN.md)

All documentation exists in both English and Simplified Chinese as filename-matched pairs (`docs/en/<name>.md` ↔ `docs/zh/<name>.md`).

## Start here

- [README (getting started)](../README.md) / [README（中文）](../README.zh-CN.md) — prerequisites, install, first run.

## Reference

| Document                                     | English                                       | 简体中文                                      |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| Architecture — processes, modules, data flow | [architecture.md](en/architecture.md)         | [architecture.md](zh/architecture.md)         |
| Sidecar JSON-RPC protocol                    | [sidecar-protocol.md](en/sidecar-protocol.md) | [sidecar-protocol.md](zh/sidecar-protocol.md) |
| IPC reference (renderer ↔ main)              | [ipc-reference.md](en/ipc-reference.md)       | [ipc-reference.md](zh/ipc-reference.md)       |
| Design system                                | [design-system.md](en/design-system.md)       | [design-system.md](zh/design-system.md)       |

## Guides

| Document                                           | English                             | 简体中文                            |
| -------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Development guide (commands, conventions, recipes) | [development.md](en/development.md) | [development.md](zh/development.md) |
| Testing guide (three test layers)                  | [testing.md](en/testing.md)         | [testing.md](zh/testing.md)         |
| Build & release (sidecar bundle, dmg, signing)     | [build.md](en/build.md)             | [build.md](zh/build.md)             |

## Reports

| Document                                                             | English                                                                               | 简体中文                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Frontend design review report (audit + roadmap)                      | [frontend-design-review.md](en/frontend-design-review.md)                             | [frontend-design-review.md](zh/frontend-design-review.md)                             |
| Frontend design review v2 (2026-10-27, fix verification + re-review) | [frontend-design-review-v2-20261027.md](en/frontend-design-review-v2-20261027.md)     | [frontend-design-review-v2-20261027.md](zh/frontend-design-review-v2-20261027.md)     |
| Frontend interaction review (2026-10-27, interaction focus)          | [frontend-interaction-review-20261027.md](en/frontend-interaction-review-20261027.md) | [frontend-interaction-review-20261027.md](zh/frontend-interaction-review-20261027.md) |

## Documentation rules

- Every doc exists in both languages, same filename under `docs/en/` and `docs/zh/`, cross-linked at the top of each file.
- When behavior changes, update both language versions in the same change.
- Source code references (`file:line`) are kept identical across both versions.
