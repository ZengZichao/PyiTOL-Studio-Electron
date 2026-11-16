# Testing Guide

[English](../en/testing.md) | [简体中文](../zh/testing.md)

The three test layers of PyiTOL Studio, what each covers, and how to run them.

## Test layers

| Layer                       | Location                      | Runner                | Requires                                               |
| --------------------------- | ----------------------------- | --------------------- | ------------------------------------------------------ |
| Sidecar protocol smoke test | `tests/smoke_roundtrip.py`    | plain Python          | a Python env with `pyitol` + `pyitolstudio` importable |
| Sidecar race regression     | `tests/unit/sidecar-race.cjs` | `npm run test:race`   | a packaged app in `dist/` (from `npm run build:mac`)   |
| E2E smoke                   | `tests/e2e/smoke.spec.ts`     | `npx playwright test` | compiled app in `out/` (`npm run build`)               |

## 1. Sidecar roundtrip smoke test

```bash
python3 tests/smoke_roundtrip.py
```

Spawns `resources/sidecar/sidecar_main.py` as a subprocess and walks the full protocol:

1. `handshake` — asserts an engine version comes back
2. `list_template_types` — asserts ≥ 20 registered types
3. `build_form_idl` for `dataset_colorstrip`
4. `generate_template` — asserts the text contains the header and data rows
5. writes the generated text to a temp file and `learn_from_file` — asserts the learned unit matches the original (type, label, separator, 3 data rows) — the **roundtrip** guarantee
6. `tree_leaf_ids` on `resources/samples/example_tree.nwk`

Exit code 0 = pass. This is the fastest check that the Python side is healthy; run it whenever the engine, adapter, or sidecar changes.

## 2. Sidecar race regression (`npm run test:race`)

`tests/unit/sidecar-race.cjs` bundles the real `src/main/sidecar.ts` with esbuild (stubbing `electron`, instrumenting `child_process`) and drives `SidecarManager` against the **packaged onedir sidecar binary**. It covers the startup race that once spawned two sidecar processes:

1. concurrent `start()` calls spawn exactly one process;
2. a `start()` arriving during a scheduled restart waits for it instead of spawning again;
3. `dispose()` cancels a scheduled restart (no zombie respawn).

```bash
npm run build:mac    # first: package the app (the test launches dist/mac-arm64/…)
npm run test:race
```

## 3. Playwright E2E smoke

`tests/e2e/smoke.spec.ts` launches the compiled Electron app via `_electron.launch` (with `ELECTRON_RUN_AS_NODE` scrubbed from the environment) and exercises the UI:

- app window loads without renderer errors,
- command palette opens (synthetic ⌘K keydown),
- basic workbench interactions.

`playwright.config.ts` pins `workers: 1` (Electron tests must run sequentially), retries once, captures screenshots on failure and traces on first retry.

```bash
npm run build          # compile out/
npx playwright test
```

## Static checks

```bash
npm run typecheck   # strict TypeScript, node + web tsconfigs — must be zero errors
npm run lint        # ESLint flat config
npm run format      # Prettier check/write
```

## When to run what

| Change                                    | Run                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| Renderer UI                               | `npm run typecheck && npx playwright test`                                      |
| IPC handlers / preload / sidecar manager  | `npm run typecheck && npm run test:race`                                        |
| Python engine / adapter / sidecar_main.py | `python3 tests/smoke_roundtrip.py`                                              |
| Packaging config / electron-builder.yml   | `npm run build:mac` + the [post-build checklist](build.md#post-build-checklist) |
| Before every release                      | all of the above                                                                |

## Writing new tests

- **Protocol behavior** → extend `tests/smoke_roundtrip.py` (add a step before the final return).
- **SidecarManager lifecycle** → extend `tests/unit/sidecar-race.cjs` (it stubs `electron`; keep the bundle approach).
- **User-visible flows** → extend `tests/e2e/smoke.spec.ts`; prefer synthetic DOM events (`page.evaluate` + `KeyboardEvent`) over OS-level key injection, and remember `workers: 1`.
