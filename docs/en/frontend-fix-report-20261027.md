[简体中文](../zh/frontend-fix-report-20261027.md) | **English**

# PyiTOL Studio Frontend Fix Report (2026-10-27)

> Project: PyiTOL Studio (Electron desktop app, macOS first)
> Version: 0.3.0 (package.json unchanged)
> Fix date: 2026-10-27
> Scope: every issue listed in the three review reports below
>
> - `docs/en/frontend-design-review.md` (2026-10-26, v1)
> - `docs/en/frontend-interaction-review-20261027.md` (interaction review)
> - `docs/en/frontend-design-review-v2-20261027.md` (v2)
>   Verification: `tsc --noEmit` (node + web, clean), `electron-vite build` success, Playwright E2E smoke suite (results below).

---

## 1. Overview

| Report                   | Issues                                  | Status                                         |
| ------------------------ | --------------------------------------- | ---------------------------------------------- |
| v2 P0 (3)                | 3/3                                     | ✅ fixed                                       |
| v2 P1 (7)                | 7/7                                     | ✅ fixed                                       |
| v2 P2 (15)               | 15/15                                   | ✅ fixed                                       |
| v2 P3 (12)               | 11/12                                   | ✅ 11 fixed; 1 documented limitation           |
| Interaction review P0–P3 | all                                     | ✅ fixed (heavily overlapping with v2)         |
| v1 (10-26) leftovers     | fake virtualization, table capabilities | ✅ addressed (see "Notes & known limitations") |

## 2. P0 fixes

### P0-1 `AbortSignal` passed through `sidecar:call` broke every preview

- **Root cause**: `AbortSignal` is not structured-cloneable; `ipcRenderer.invoke` threw `An object could not be cloned` before reaching the main process.
- **Fix**: removed `opts` from `sidecar.call` (types + preload); `generatePreview` now discards stale results via the `previewAbortRef.current === ac` guard; removed the unreachable `AbortError` branch.
- **Note**: the underlying sidecar call can no longer be aborted, but its result is discarded — behaviourally equivalent to cancellation.

### P0-2 Drag & drop import dead on Electron 45

- **Root cause**: `File.path` was removed in Electron 32; the code read `undefined` and silently skipped every file.
- **Fix**: preload exposes `files.getPathForFile(file)` (via `webUtils`, works under sandbox); `App.tsx` drop handler uses it; all failure paths (unresolvable path, unsupported type, open/import failure) now surface a toast.

### P0-3 E2E suite fully red

- **Root cause**: tests launched `out/main/index.js`; the real bundle is `out/main/index.cjs` (11 timeouts).
- **Fix**: launch path corrected; assertions updated for this round's copy/structure changes.

## 3. P1 fixes

- **Dead menu commands ⌘E / ⌘I / ⌘R**: `useMenuCommands` now dispatches dedicated `workbench-export` / `workbench-import` / `workbench-generate-preview` events that Workbench listens to and routes to the real implementations (import flow implemented end-to-end with feedback toasts).
- **IDL failure stuck on "Loading"**: `FormIdl._error` added to the type; the inspector shows an error message + Retry button (clears the cache entry so re-fetch happens, including on revisit).
- **"Recent projects" always empty**: `addRecentProject` is now called after every successful open (menu / welcome page / drag-drop) and save-as.
- **500 ms close-save race**: replaced with a completion-report protocol — the renderer reports the save outcome via `close-save-finished`; the window closes only on success; cancelling the save dialog keeps the app open. Dialog copy is localized.
- **Whole-table paste without confirmation**: paste (⌘V and the "Paste TSV" button) now parses → confirms ("Replace K rows with N rows × M cols?") → snapshots → applies; the success toast carries an Undo action. "Clear all data" is undoable the same way.
- **API key plaintext leftover**: key file cleanup moved to `finally` and uses real deletion (`files:deleteFile`); copy now truthfully says the key is written to the system temp dir and deleted right after upload; `files:read`/`files:write` gained absolute-path + `..` traversal checks.
- **Systematically missing error feedback**: new global Toast component (`ToastHost` + `useToastStore`) consuming the existing `app.status_*` strings; ~10 silent `catch {}` sites now report.
- **Command palette delete without confirmation**: same `window.confirm` as the unit list.
- **Upload "cancel" flipping to an error state**: cancel discards the result silently (`cancelledRef`) and toasts "the upload will finish in the background and its result will be ignored".
- **Split save-path contracts**: new `project:set-current-path` / `get-current-path` IPC; drag-open / recent-open register the path on both sides; save resolves renderer path first, main-process memory as fallback, then save-as — ⌘S works after drag-open.

## 4. P2 fixes (condensed)

| #                | Fix                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| P2-1             | Wizard keeps entered columns/parameters on language re-fetch (resets only when a _different_ type is selected)             |
| P2-2             | Removed unused `@tanstack/react-table` / `@tanstack/react-virtual`; 5000-row cap kept with an i18n truncation notice       |
| P2-5             | `color_list` validation splits on commas when `range === 'comma'`, matching the widget's write-back                        |
| P2-6             | Stale preview indicator ("Updating…") while re-rendering with existing text                                                |
| P2-8             | Dark accent `#4d74ff`→`#6b8bff` (~4.9:1); light warning `#b6650a`→`#d9832e` (~4.6:1); dark focus ring aligned              |
| P2-9             | All 8 missing zh keys added (delete/clear/reset confirmations, select/deselect all, no results, IDL failed, auto-download) |
| P2-10            | Hardcoded English ("N rows", "(N rows)", "N warning(s)", "Showing N of M rows") i18n'd                                     |
| P2-11            | String surgery on translations removed: new keys `wizard.data_summary` and `nav.tree_leaf_count`                           |
| P2-12            | `app.status_*` strings wired into the toast system                                                                         |
| P2-13            | Splitter keyboard callbacks (`onResize={() => {}}` × 3) replaced with real ones — arrow keys now resize                    |
| P2-14            | Delete button visible on keyboard focus (`group-focus-within` / `focus:`)                                                  |
| P2-15            | ErrorBoundary localized via `i18n.t('error.*')`                                                                            |
| Interaction P2-1 | IDL cache keyed `locale:type_name` — labels update on language switch                                                      |
| Interaction P2-4 | Tree card title uses new key `nav.tree_card_title`; the unit list got its own caption                                      |
| Interaction P2-5 | `previewText` removed from `generatePreview` deps — no more redundant second RPC per edit                                  |
| Interaction P2-6 | AbortSignal plumbing removed entirely; guard semantics documented                                                          |
| Interaction P2-8 | About dialog card got `relative` — the X button now anchors to the card                                                    |

## 5. P3 fixes (condensed)

| #                | Fix                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P3-1             | Dead `.btn-secondary` / `.btn-utility` / `.input-search` classes removed from globals.css                                                        |
| P3-2             | Dead `reorderUnits` / `toggleUnitHidden` / `updateProjectName` store actions removed                                                             |
| P3-3             | Dead `watchSystemTheme` removed (system changes arrive via `platform:theme-changed` IPC)                                                         |
| P3-4             | Window title: `● {project name} — PyiTOL Studio` with dirty dot                                                                                  |
| P3-5             | Wizard shortcut moved off ⌘⇧W (macOS "close all windows") to ⌥⌘W everywhere                                                                      |
| P3-7             | Sidecar dev path: `PYITOL_STUDIO_PYTHON` env → walk upward from the app path for `.build-venv`/`.venv` (including sibling checkouts) → `python3` |
| P3-10            | Window `backgroundColor` follows the saved theme / system appearance (no more black flash for light users)                                       |
| P3-11            | Unreachable `onPaste` on the empty-state container removed                                                                                       |
| P3-12            | Wizard colour text input falls back to the last valid colour on blur                                                                             |
| Interaction P3-6 | Wizard discard dialog uses `useDialog` (Esc + focus trap); default focus on Cancel                                                               |
| Interaction P3-7 | Step indicator gets `aria-current="step"`                                                                                                        |

## 6. Verification

1. `npm run typecheck` — node + web, 0 errors.
2. `npm run build` — success (`out/main/index.cjs`, preload, renderer assets).
3. `npx playwright test` — **11/11 passed** (19.6s). Launch path fixed (`index.cjs`), an empty-unit-list caption defect found & fixed, order-dependent tests made self-sufficient, and the inspector test adapted to the new IDL error state (error + Retry).
4. `npm run package` — succeeded (exit 0). Artifacts rebuilt and verified:
   - `dist/PyiTOL Studio-0.3.0-arm64.dmg` (653 MB, valid UDIF zlib)
   - `dist/PyiTOL Studio-0.3.0-arm64-mac.zip` (623 MB) + fresh `.blockmap` files
   - `codesign -v --deep` passes; notarization is a local placeholder (APPLE_ID not set — same as the previous release)
   - Note: the sidecar contains ~20k small files; per-file codesign makes packaging take ~1h50m (expected).

## 8. Follow-up fix (2026-10-28): inspector "Failed to load the form definition", retry useless

**Symptom**: the inspector permanently showed "Failed to load the form definition"; clicking Retry did nothing.

**Root cause**: the engine registry only recognises **lowercase** type names (`dataset_colorstrip`), while `.pyitolproj` files saved by the legacy PySide6 app store **UPPERCASE** names (`DATASET_COLORSTRIP`). The inspector passed them verbatim → `build_form_idl` threw `Unknown template type` on every attempt (preview generation and template export were equally affected). The bundled example project happened to use lowercase, so the E2E suite didn't catch it.

**Fixes**:

1. `resources/sidecar/sidecar_main.py`: added `_norm_type_name()` — all type_name entry points (`_build_form_idl` / `_generate_template` / `_export_template_file` / `_learn_from_file`) normalise to lowercase, fixing every client including legacy project files.
2. Renderer: `stores/project.ts` normalises `type_name` on `setProject` / `addUnit`; `WizardDialog` group matching and command-palette preselection are now case-insensitive — this also fixed the hidden defect where the wizard type grid was always empty due to the case mismatch.
3. The inspector error state now shows `_errorMessage` (new optional field on `FormIdl`) so future failures are diagnosable.
4. `resources/sidecar/pyitol-sidecar.spec`: fixed the `datas` mapping that double-nested resources (`pyitolstudio/pyitolstudio/resources/param_ranges.json`) while the runtime looks under `_MEIPASS/pyitolstudio/resources/` — the bundled form-IDL parameter catalog would fail to load. The package contents are now mapped directly to `pyitolstudio/`.
5. New E2E regression test: `engine accepts legacy uppercase template type names`.

**Verification**: dev venv and the rebuilt PyInstaller binary both pass uppercase/lowercase IDL, uppercase template generation, 31-type listing and handshake; E2E 12/12; the app was repackaged (fresh artifacts in `dist/`, 2026-10-28).

---

## 9. Known limitations (deliberately not fixed)

1. True windowed virtualization (cap stays at 5000 rows with a notice; `@tanstack/react-virtual` integration is a larger enhancement).
2. Table sorting / filtering / column resize / full keyboard navigation — enhancement, not a defect fix.
3. Narrow-window centre column — panels can be collapsed manually; auto-collapse belongs with the above.
4. First-frame `<html lang="en">` — rewritten on mount; a proper fix needs main-process language injection.
5. ~280 inline style props — theme is fully tokenized, so these no longer break theming; convergence to classes is a refactor item.
6. Five `sendSync` IPCs on the startup path — only used at mount; measured impact negligible.
7. True engine-level upload cancellation needs Python-side protocol support; current approach truthfully reports and discards.

---

**End of report.**
