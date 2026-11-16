[English](../en/frontend-design-review-v2-20261027.md) | **简体中文**

# PyiTOL Studio Frontend Design Review Report (v2)

> **Status update (2026-10-27)**: all issues listed in this report have been fixed — see [frontend-fix-report-20261027.md](frontend-fix-report-20261027.md).

> Project: PyiTOL Studio (Electron desktop app, macOS-first)
> Version: 0.3.0 (package.json)
> Review date: 2026-10-27
> Review scope: `src/renderer` (React 18 + Tailwind v4 + Zustand), `src/preload`, the window/menu/IPC layer of `src/main` directly affecting frontend experience, built CSS, and the current state of E2E tests
> Review nature: **Read-only diagnosis**. This report modified or deleted no source files; the first-round report now lives at `docs/zh/frontend-design-review.md` (2026-10-26), kept unchanged — this file is its sequel.
> Review method: line-by-line walkthrough of all 33 frontend source files (≈4,500 lines of renderer + 1,200 lines of main/preload/shared) + cross-check against built CSS + WCAG 2.x contrast recalculation + full `tsc --noEmit` type check + comparison of Playwright results with build output

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [Verification of fixes from the previous report (10-26)](#2-verification-of-fixes-from-the-previous-report-10-26)
3. [Scoring](#3-scoring)
4. [P0 issues (blockers)](#4-p0-issues-blockers)
5. [P1 issues](#5-p1-issues)
6. [P2 issues](#6-p2-issues)
7. [P3 issues](#7-p3-issues)
8. [What is done well (keep it)](#8-what-is-done-well-keep-it)
9. [Per-file issue index](#9-per-file-issue-index)
10. [Fix roadmap (suggested order)](#10-fix-roadmap-suggested-order)

---

## 1. Executive summary

Since the last review (10-26), the code went through **a large-scale, high-quality round of fixes**: 4 of the previous round's 5 P0s are confirmed fixed, the design-token system has been rebuilt wholesale, and accessibility rose from "zero coverage" to "trunk coverage". **At the design-system level the project has moved from "broken" to "usable and quite disciplined".**

But the current version has a striking characteristic: **the framework is fixed, the wiring is unfinished**. Several newly fixed or original features are only "half done" — the dispatch side was fixed and the consumer is missing; the UI exists and the data source is unconnected; the component was written and the parameter is never passed. This produced a new batch of P0/P1s:

- **Drag-and-drop import fails wholesale on Electron 45** (`File.path` has been removed; the code still relies on it);
- **The `AbortSignal` carried by `sidecar:call` cannot be serialized through IPC** (suspected to make every preview request throw; needs runtime verification);
- **The events dispatched by menu ⌘E (Export Template) / ⌘I (Import Template) have no listeners** — clicking does nothing;
- **Menu ⌘R (Generate Preview) only sets loading to true** without triggering any generation; the preview pane can be stuck at "loading";
- **The error marker for a failed IDL load is written into the cache, but the inspector UI never reads it** — on failure it still shows "loading" forever;
- **The "Recent projects" list is always empty** — the read side exists; the write side (`addRecentProject`) is never called by any code;
- **The close-time "Save" path has a 500 ms race** that, for never-saved projects, destroys the window past the dialog;
- **The E2E suite is all red**: the test launches `out/main/index.js` while the build output is actually `out/main/index.cjs` — all 11 cases time out.

**Overall verdict: this was a commendable refactor — the UI skeleton and design system now meet the bar; the next center of gravity should shift from "writing components" to "end-to-end wiring and real-runtime verification".**

---

## 2. Verification of fixes from the previous report (10-26)

| Old ID                                       | Old issue                                                                                     | Status                                               | Evidence                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAY-01                                       | Spacing tokens under the wrong `--space-*` namespace; 29 classes / 190 usages all ungenerated | ✅ **Fixed**                                         | `globals.css:123-131` tokens moved into `@theme`'s `--spacing-*`; built output `out/renderer/assets/index-Cab0j139.css:970-1057` verified to contain `.p-sm{padding:var(--spacing-sm)}`, `.gap-xs`, `.px-sm`, `.py-xs` etc.                                             |
| MAC-01                                       | Traffic lights over the toolbar; window not draggable                                         | ✅ **Fixed**                                         | `Workbench.tsx:377` toolbar `paddingLeft: 80` safe area + `drag-region`; `globals.css:273-279` defines `.drag-region/.no-drag`, applied on all toolbar buttons                                                                                                          |
| FLW-01                                       | Menu command infinite recursion                                                               | ✅ **Fixed** (but created new issues, see P1-2/P1-3) | `useMenuCommands.ts` comments explicitly forbid re-dispatch; handlers call store actions directly instead of re-emitting IPC commands as same-named events                                                                                                              |
| FLW-02                                       | Wizard search writing a Promise into state → white screen                                     | ✅ **Fixed**                                         | `WizardDialog.tsx:52-53,92-99` controlled `typeQuery` + separate `allTypes` master list + `useMemo` filtering + empty/loading states; `main.tsx:9` mounts an ErrorBoundary                                                                                              |
| CMP-01                                       | Splitter closure capturing stale width                                                        | ✅ **Fixed**                                         | `Splitter.tsx:50-57` absolute-width mode (`startSize + total delta`) + `setPointerCapture` + enlarged hit area                                                                                                                                                          |
| FLW-03                                       | Unprotected data-loss paths                                                                   | 🟡 **Mostly fixed**                                  | Delete unit / clear data / reset parameters / wizard close all confirm; `isDirty` wired into the close interceptor (`main/index.ts:90-118`). **Remaining**: paste-overwrites-table has no confirmation (P1-6); save-on-close has a race (P1-5)                          |
| TKN-01                                       | `@theme` self-reference                                                                       | ✅ **Fixed**                                         | `globals.css:22-141` all real values; comments explicitly forbid `--x: var(--x)`                                                                                                                                                                                        |
| TKN-02                                       | Dark theme defects (white-on-white, undefined chip, hardcoded light backgrounds)              | ✅ **Fixed**                                         | `.dark` completes `--color-surface-chip` and 19 other tokens; `.btn-utility` foreground now uses `--color-canvas`; semantic danger/success/warning/accent-surface all have dark values                                                                                  |
| Sub-par contrast                             | ink-subtle 4.29 / error red 4.13 etc., 6 failing pairs                                        | 🟡 **Greatly improved, 2 borderline**                | Light ink-subtle #6e6e73→**5.07:1**✅, danger #c92a2a→**5.46:1**✅; dark accent #4d74ff→**≈4.21:1**, warning #b6650a→**≈4.34:1** — still slightly below 4.5 for 12 px small text (see P2-8)                                                                             |
| ARIA coverage 0                              | no role/dialog/switch/separator                                                               | ✅ **Fixed (trunk)**                                 | All four dialogs have `role="dialog" aria-modal`; command palette has combobox/listbox/option/activedescendant; switches have `role="switch" aria-checked`; splitters have `role="separator"`; labels have `htmlFor`; update notification has `role="status" aria-live` |
| Fake virtualization + idle deps              | slice(10000); tanstack unused                                                                 | ❌ **Unfixed** (cap lowered to 5000)                 | `Workbench.tsx:699-700`; `@tanstack/react-table` and `@tanstack/react-virtual` have 0 references project-wide                                                                                                                                                           |
| All-English menu                             | native menu not localized                                                                     | ✅ **Fixed**                                         | `menu.ts` fully bilingual zh/en + `rebuildMenu()` + radio checked states + DevTools visible only in dev                                                                                                                                                                 |
| ⌘R colliding with reload                     | possible data loss                                                                            | ✅ **Fixed**                                         | `role:'reload'` removed from the View menu; but ⌘R is now a no-op command (new issue P1-2 of the interaction report / P1-2 here)                                                                                                                                        |
| Global `user-select: none` blocking copy     | data not copyable                                                                             | ✅ **Fixed**                                         | `globals.css:218-227` restores `user-select: text` for pre/code/td/th/input/textarea/[data-selectable]                                                                                                                                                                  |
| Upload dialog plaintext key in /tmp          | hardcoded `/tmp`, never deleted                                                               | 🟡 **Partially fixed**                               | now `os.tmpdir()` + timestamped filename; overwritten with an empty string on success. **Remaining**: failure path skips cleanup and overwrite ≠ deletion (P1-7); copy still says "not stored", contradicting the implementation                                        |
| 17 px touch density                          | 7 control heights, marketing-page type sizes                                                  | ✅ **Fixed**                                         | base 13 px, caption 12 / fine-print 11; button min-height 32, toolbar 44, table rows ≈36 px — desktop-tool density                                                                                                                                                      |
| No error boundary                            | render crash = white screen                                                                   | ✅ **Fixed**                                         | `components/ui/ErrorBoundary.tsx` + mounted in `main.tsx`; offers a Reload recovery UI                                                                                                                                                                                  |
| `<html lang>` fixed to en on language switch | screen-reader language wrong                                                                  | ✅ **Fixed**                                         | `App.tsx:51` `document.documentElement.lang = language`                                                                                                                                                                                                                 |

**Summary: of the 22 legacy issues, 15 confirmed fixed, 3 partially fixed, 4 unfixed/downgraded.**

---

## 3. Scoring

| Dimension                 | Last round |  This round | Notes                                                                                                                     |
| ------------------------- | ---------: | ----------: | ------------------------------------------------------------------------------------------------------------------------- |
| Design-system usability   |        1.5 |     **4.5** | all tokens in `@theme`, generation verified in build output; semantic colors/shadows/focus rings/motion fallback complete |
| Layout & rhythm           |        1.0 |     **4.0** | spacing system genuinely works; density unified at desktop spec; center pane too narrow at min width remains              |
| Visual consistency        |        2.0 |     **4.0** | radii/shadows/button four-states unified; ~280 inline-style patches remain                                                |
| Dark theme                |        2.0 |     **4.5** | token-level dual themes; two small-text contrast pairs borderline                                                         |
| Interaction feedback      |        1.5 |     **3.5** | button hover/disabled complete; but save/export success still has no toast feedback                                       |
| State design              |        1.5 |     **3.0** | empty/loading/confirmations filled in; IDL failure state unconsumed by UI and ⌘R fake-loading are new holes               |
| Accessibility             |        1.0 |     **3.5** | ARIA trunk coverage, focus traps, reduced-motion; splitter keyboard operation is a no-op                                  |
| Desktop platform fit      |        1.5 |     **4.0** | drag regions, safe areas, menu localization, close protection; ⌘⇧W convention violation remains                           |
| Internationalization      |        2.0 |     **3.0** | menu/dynamic lang fixed; 8 key confirmation strings missing zh entries, some hardcoded English remains                    |
| Performance & engineering |        2.0 |     **2.5** | preview debounce + race protection added; fake virtualization, all-red E2E, 280 inline styles untouched                   |
| **Overall**               |    **1.7** | **3.6 / 5** | design system and platform fit meet the bar; feature wiring and runtime verification are the current weaknesses           |

---

## 4. P0 issues (blockers)

### P0-1 `sidecar:call` passes an `AbortSignal`; IPC serialization must fail (suspected; needs runtime verification)

**Location**: `src/preload/index.ts:22-28`, `src/renderer/src/components/workbench/Workbench.tsx:106-110`

preload's `sidecar.call` passes `{ signal: ac.signal }` verbatim into `ipcRenderer.invoke('sidecar:call', method, params, opts)`. Electron's `invoke` arguments go through structured clone, and **`AbortSignal` is not cloneable** — any call carrying it throws `Error: An object could not be cloned` on the renderer side; the request never reaches the main process.

The Workbench's `generatePreview` is the **only** caller that passes a signal, and it passes one on every preview. If this analysis holds, **the preview feature is unusable in all scenarios** (the preview pane shows "generation failed: An object could not be cloned"). This report derives the conclusion from static analysis with high confidence, but as the app could not be run, it is marked "suspected".

**Secondary issue**: even if it did not throw, the main-process `ipcMain.handle('sidecar:call', (…, method, params) => …)` only accepts three arguments — the fourth `opts` is ignored. Abort capability was never implemented in the main process at all; the signal is sent to no one.

**Recommendation**: do not pass the signal object through `sidecar.call`; instead send a `sidecar:cancel` channel message + discard stale responses by request id in the main process, or implement real cancellation there.

### P0-2 Drag-and-drop import fails wholesale on Electron 45

**Location**: `src/renderer/src/App.tsx:153-157`

```tsx
// @ts-expect-error — Electron extends File with .path
const filePath: string | undefined = file.path
```

`File.path` has been removed since Electron 32 (the installed version is Electron 45); the correct API is `webUtils.getPathForFile(file)` in preload. Today every file yields `undefined` and is silently skipped with `continue` — **dropping any file does nothing**, with no error message.

Meanwhile the product promises this feature in two places: the welcome page's "Drag a Newick tree or iTOL template file into the window to start" (i18n `welcome.drop_hint`) and the drop overlay's "Release to import files". **A promised feature is entirely non-functional, with no failure feedback.**

**Recommendation**: expose `getPathForFile(file: File)` in preload (backed by `webUtils.getPathForFile`); give a visible failure message for unresolvable paths/unsupported types (the current four `catch {}` blocks are all silent).

### P0-3 E2E suite all red: entry filename mismatch

**Location**: `tests/e2e/smoke.spec.ts:25`, `package.json:3`, build output

The smoke test launches the app at `out/main/index.js`, but `electron.vite.config.ts` outputs `entryFileNames: '[name].cjs'` — the actual artifact is `out/main/index.cjs` (verified with `ls`). Result: `beforeAll` times out after 60 s, and `test-results/.last-run.json` records **all 11 cases failed**.

This means the project currently has **not a single green frontend automation guard**, which is also why runtime problems like P0-1/P0-2 went undetected for so long.

**Recommendation**: change the launch path to `out/main/index.cjs`; then restore E2E as a CI gate, prioritizing cases for "preview generation, drag-drop import, ⌘E/⌘R menus" (exactly this report's P0s).

---

## 5. P1 issues

### P1-1 The events dispatched by menu ⌘E / ⌘I have no listeners; the commands do nothing

**Location**: `src/renderer/src/hooks/useMenuCommands.ts:112,116`

The previous round's infinite-recursion fix took the "dispatch to different event names" approach:

```ts
case 'export-template':
  window.dispatchEvent(new CustomEvent('workbench-export'))
  break
case 'import-template':
  window.dispatchEvent(new CustomEvent('workbench-import'))
  break
```

But a project-wide search confirms `workbench-export` / `workbench-import` have **no addEventListener anywhere** (only these two dispatches). So:

- menu `Command > Export Current Template…` (⌘E) → nothing;
- menu `File > Import Template…` (⌘I) → nothing.

(The toolbar's export button uses `Workbench.handleExport` locally and is unaffected — which is precisely the proof that `useMenuCommands` should call the same store action / callback as the button, instead of inventing an event no one listens to.)

### P1-2 Menu ⌘R (Generate Preview) only sets loading, triggers no generation, and can wedge the preview pane on "loading"

**Location**: `useMenuCommands.ts:104-108`, `Workbench.tsx:927-934`

```ts
case 'generate-preview':
  useProjectStore.getState().setPreviewLoading(true)
  break
```

It calls no generation logic. Two outcomes:

- Preview already has text: `previewLoading` is set true but the screen changes nothing (`PreviewPanel` only shows loading when `loading && !text`); the user thinks it refreshed while nothing happened;
- Preview is empty (e.g. just switched to a unit with invalid parameters, or a previous generation failed): the preview pane **stays on "loading" forever** until some parameter edit triggers a debounced recompute. The toolbar refresh button (`handlePreviewRefresh`) calls the Workbench's internal `generatePreview` and works — the same action has a dual implementation where "the button works, the menu doesn't".

### P1-3 A failed IDL load writes an `_error` marker the inspector never reads; it still shows "loading" forever

**Location**: `Workbench.tsx:159-163` (write) vs `Workbench.tsx:1112-1117` (consume)

The catch branch does write an empty IDL with `_error: true` into the cache (the fix for last round's "failures swallowed"), **but**:

1. the `FormIdl` type has no `_error` field; it is smuggled in via `as FormIdl`;
2. `InspectorPanel`'s empty-state check is only `groups.length === 0 → show common.loading`, with no `_error` branch.

Net effect identical to last round: after a sidecar failure/timeout the inspector shows "loading" forever, and because the error result is in `idlCache`, **switching away and back never retries**.

### P1-4 "Recent projects" is always empty: the write side is never called

**Location**: `src/renderer/src` globally (0 call sites)

`window.pyitol.project.addRecentProject` / `clearRecentProjects` are implemented in preload (`index.ts:63-67`) and the main process (`ipc-project.ts:153-170`), but the renderer never calls them. The welcome page's "Recent projects" section (`WelcomePage.tsx:128-163`) therefore always reads an empty array and always shows "no recent projects". After a successful open/save-as, `addRecentProject(path, name, unitCount)` should be called — this wire does not exist.

### P1-5 The close-window "Save" path's 500 ms race destroys the window past saving

**Location**: `src/main/index.ts:104-111`

```ts
if (choice === 0) {
  mainWindow?.webContents.send('menu:command', 'save-project')
  setTimeout(() => {
    forceClose = true
    mainWindow?.close()
  }, 500)
}
```

For projects **with a known path**, saving is a synchronous file write, usually done within 500 ms — it survives by luck. For a **never-saved** project, `save-project` falls through to `saveProjectAs` in the renderer → the system save dialog opens — the user may stay there for minutes. After 500 ms, `forceClose = true` unconditionally triggers `mainWindow.close()`: the user is still at the save dialog while the main window is destroyed; choosing save or cancel afterwards is meaningless. The user explicitly chose "Save" and the data is lost anyway.

**Recommendation**: the renderer notifies the main process when the save flow truly ends (success/cancel), and only then does the main process decide to close; or at minimum, do not close when save-as is cancelled.

### P1-6 Table paste still unconditionally replaces whole columns and rows

**Location**: `Workbench.tsx:605-626` (container onPaste) and `:721-739` ("Paste TSV" button)

Pressing ⌘V in the table area or clicking "Paste TSV" directly makes the clipboard's first row the new column header and replaces `columns` and `data_rows` wholesale — no preview, no confirmation, no undo. One accidental ⌘V can wipe an entire hand-entered table (the remnant of last round's FLW-03).

**Recommendation**: at least add a confirmation ("Replace current K rows with N rows × M columns?"); mid-term, offer an append/replace choice + an undo stack.

### P1-7 The upload API key cleanup is not in `finally`; the failure path leaves plaintext behind; copy contradicts implementation

**Location**: `UploadDialog.tsx:99-125`

- After the key is written to `os.tmpdir()/pyitol_api_key_<ts>.txt`, only the **success** branch overwrites it with an empty string; the `catch` branch (upload failed) skips cleanup entirely — the plaintext key stays in the temp directory permanently. Overwriting with an empty string is not deleting the file either.
- i18n `upload.key_hint` (zh) says the key "is only passed to the local Python engine, **not stored**" — directly contradicting an implementation that writes it to a temp file on disk.

**Recommendation**: move cleanup into `finally` and perform a real deletion; make the copy truthful ("written only to the system temp directory, removed after upload"), or avoid disk entirely via an in-memory/secure channel.

---

## 6. P2 issues

### Functionality & state

| #    | Issue                                                                  | Location                                           | Notes                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | Switching language wipes the wizard's entered parameters and columns   | `WizardDialog.tsx:102-129`                         | The IDL fetch effect depends on `language`; a switch refetches, and the success callback unconditionally does `setColumns(required_columns)` + `setParameters(defaults)`, silently resetting data entered at steps 1/2                                              |
| P2-2 | Fake virtualization (slice 5000) + two tanstack deps with 0 references | `Workbench.tsx:699-700`, `package.json:21-22`      | Carried over; 5,000 rows × N columns still produces tens of thousands of DOM nodes. Either adopt `@tanstack/react-virtual` or remove the deps and label the cap honestly                                                                                            |
| P2-3 | Command palette "delete unit" bypasses confirmation                    | `CommandPalette.tsx:92-98`                         | The unit list's delete has `window.confirm`; the same command in the ⌘K palette calls `removeUnit` directly — one destructive action, two paths, two levels of protection                                                                                           |
| P2-4 | Upload "cancel" doesn't actually cancel                                | `ipc-upload.ts:32-36` (main-process no-op)         | The frontend abort only rejects the promise and returns the UI to idle while the sidecar upload keeps running in the background and may write files. The code comment admits it, but the UI never tells the user "cancel did not take effect"                       |
| P2-5 | Comma-separated color lists always fail validation                     | `lib/validate.ts:43-49` vs `IdlWidget.tsx:172-174` | The widget writes back comma-joined when `range==='comma'`, but validation splits only on `/\s+/` → `"#fff000,#00ff00"` fails as a whole and the field stays red. Validation must match the widget's separator semantics                                            |
| P2-6 | No "stale data" indicator during preview recompute                     | `Workbench.tsx:99-102`                             | Loading shows only when `!text`; while text exists, during debounce + recompute (up to 300 ms + IPC) the old content carries no marker — the user may copy an outdated template                                                                                     |
| P2-7 | At the 900 px minimum window the center pane is ~250 px                | `main/index.ts:44`, `Workbench.tsx` layout         | Carried over: 280+5+360+5=650, leaving the data table mostly unusable; still no "auto-collapse inspector at narrow width" logic                                                                                                                                     |
| P2-8 | Dark accent and warning borderline for 12 px small text                | `globals.css:166,178`                              | Measured #4d74ff/#1d1d1f ≈ **4.21:1**, #b6650a/#ffffff ≈ **4.34:1**, both below 4.5. Currently used for the syntax-highlight section (12 px, 600) and dark links/highlight headings; brighten one step (e.g. #6b8bff / #d9832e) or restrict to ≥14 px at weight 600 |

### Internationalization

| #     | Issue                                                                        | Location                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-9  | 8 user-visible strings lack zh entries; the Chinese UI falls back to English | `ctx.delete_confirm`, `table.ctx_clear_confirm`, `inspector.reset_all_confirm`, `inspector.idl_failed`, `cmd.no_results`, `common.select_all`, `common.deselect_all`, `update.downloading_auto` — all fall back to `defaultValue: 'English'` with no definition in the i18n tables; Chinese users see English at **delete confirmations, clear confirmations, select-all** and other key moments |
| P2-10 | Hardcoded English remains                                                    | unit list `{n} rows` (Workbench:572), inspector header `rows` (:1074), upload dialog `({n} rows)` (UploadDialog:361), "Showing N of M rows" (Workbench:836)                                                                                                                                                                                                                                      |
| P2-11 | Regex surgery on `table.footer_count` to compose counts                      | `WizardDialog.tsx:466` `t(...).replace(/.*\//, '')` + hardcoded `columns`; should be a standalone key `{rows} 行 · {cols} 列`. Also `Workbench.tsx:482` does `.split('·')[0]` on `nav.tree_meta` — same disease (carried over)                                                                                                                                                                   |
| P2-12 | i18n dead keys: 26 `app.status_*` strings defined and never used             | `i18n/index.ts` — the status bar still doesn't exist, so these "saved/exported/imported" feedback strings all sit idle, while save/export success has **no UI feedback at all**                                                                                                                                                                                                                  |

### Accessibility

| #     | Issue                                          | Location                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-13 | Splitter keyboard operation is a no-op         | `Splitter.tsx:94-100` supports ←/→/↑/↓ and calls `onResize(±8)`, but all three Workbench sites pass `onResize={() => {}}` (:283,:301,:322) — `role="separator"` + `tabIndex=0` + `aria-valuenow` are all present while arrow keys do nothing |
| P2-14 | Unit delete button invisible to the keyboard   | `Workbench.tsx:577` `opacity-0 group-hover:opacity-100` — when Tab reaches the delete button it is still transparent (no `group-focus-within`); keyboard users operate an invisible button                                                   |
| P2-15 | ErrorBoundary recovery UI is hardcoded English | `ErrorBoundary.tsx:53,79` "Something went wrong"/"Reload"; and with only one root boundary, an error inside a dialog unmounts the whole app                                                                                                  |

---

## 7. P3 issues

| #     | Issue                                                                                                                                                        | Location                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| P3-1  | `btn-secondary` / `btn-utility` / `input-search` component classes have zero usages (dead code)                                                              | `globals.css:330-388,443-458`                                                                                                |
| P3-2  | `reorderUnits` (0 calls, no drag-sort UI) and `toggleUnitHidden` (empty implementation whose `set({ isDirty: false })` **wrongly clears the dirty flag**)    | `stores/project.ts:125-141`                                                                                                  |
| P3-3  | `watchSystemTheme` is defined, referenced once, and unused by any call chain; theme listening is re-implemented inside App                                   | `lib/theme.ts:19-24`                                                                                                         |
| P3-4  | Window title fixed to "PyiTOL Studio" — no project name or dirty marker; `index.html:2` `lang="en"` is rewritten at runtime, flashing English on first frame | `index.html`, `App.tsx:55-63` (settings restore runs in a first-frame effect; Chinese users see brief English on cold start) |
| P3-5  | ⌘⇧W as the wizard shortcut violates the macOS "close all windows" convention                                                                                 | `menu.ts:38`, `useKeyboardShortcuts.ts:21`                                                                                   |
| P3-6  | The close-confirmation dialog (Save/Discard/Cancel and all copy) is hardcoded English                                                                        | `main/index.ts:95-103`                                                                                                       |
| P3-7  | The sidecar dev path hardcodes this machine's absolute path `.build-venv/bin/python`; on another machine it falls back to system python3                     | `sidecar.ts:31-33`                                                                                                           |
| P3-8  | ~280 inline `style={{…}}` across the renderer; theme values rescued by `var(--*)`, but hover/density overrides still need inline patches                     | various components (Workbench 75, UploadDialog 40, Wizard 63…)                                                               |
| P3-9  | StrictMode double-runs effects in dev → handshake/IDL requests fire twice (guarded by abort/cache; only wasteful)                                            | `main.tsx:8`                                                                                                                 |
| P3-10 | Startup `backgroundColor: '#1d1d1f'` is a black flash for light-theme users (the inverse of last round's white flash)                                        | `main/index.ts:49`                                                                                                           |
| P3-11 | `onPaste` is attached to the empty-state table container — a non-focusable div — so the handler is unreachable                                               | `Workbench.tsx:630`                                                                                                          |
| P3-12 | The wizard's color text fields feed generation without validation; invalid values are only caught by sidecar errors                                          | `WizardDialog.tsx:539-545`                                                                                                   |

---

## 8. What is done well (keep it)

1. **The rebuilt design-token system is high quality**: all utility tokens are in `@theme` with rules documented in comments ("no self-references"; ":root holds plain variables"), and the build output verifies the classes really generate — last round's most fatal systemic failure is eradicated.
2. **Dual themes complete**: 19 semantic colors + shadows + focus rings + scrollbars + `color-scheme` + `accent-color`, all in light/dark pairs; syntax highlighting has theme pairs too (`.dark .hl-value-color`).
3. **Dialog infrastructure unified on `useDialog`**: focus trap, Esc, initial focus, focus restore, scroll lock — all four dialogs reuse it; the right abstraction layer.
4. **The command palette is the app's best-accessibility component**: combobox/listbox/option/activedescendant, keyboard navigation + `scrollIntoView`, group aria-labels — a model for other list components.
5. **The preview pipeline's debounce + AbortController race protection + stale-discard** pattern is correct (the problem is only at the IPC serialization layer, see P0-1).
6. **Destructive-operation confirmations are mostly in place**: delete unit, clear data, reset parameters, wizard discard (including the `confirmDiscard` secondary confirmation).
7. **macOS adaptation is in place**: 80 px traffic-light safe area, drag/no-drag system, bilingual native menu + radio checked states + rebuild, DevTools dev-only, external links always to the system browser.
8. **Security baseline stable**: contextIsolation/sandbox/CSP/external-link control/`shell.openExternal` https-only; the highlighter escapes before injecting — no XSS surface via `dangerouslySetInnerHTML`.
9. **`tsc --noEmit` (web + node) passes in full**; the type chain (shared → preload → renderer) is well maintained.

---

## 9. Per-file issue index

| File                                       | Location             | Issue                                                                                    | Severity        |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| `preload/index.ts`                         | 22-28                | signal passed through IPC is uncloneable; main process implements no cancellation either | **P0-1**        |
| `renderer/App.tsx`                         | 153-157              | `File.path` removed in Electron 45; drag-drop import fails                               | **P0-2**        |
| `renderer/App.tsx`                         | 168-192              | four `catch {}` in drag-drop silently fail, no user feedback                             | P2              |
| `tests/e2e/smoke.spec.ts`                  | 25                   | launch path `index.js` ≠ artifact `index.cjs`; 11 cases all red                          | **P0-3**        |
| `hooks/useMenuCommands.ts`                 | 109-121              | ⌘E/⌘I events unheard; ⌘R only sets loading                                               | **P1-1/2**      |
| `renderer/Workbench.tsx`                   | 159-163 vs 1112-1117 | `_error` marker written but unconsumed → eternal loading                                 | **P1-3**        |
| `renderer/Workbench.tsx`                   | 605-626, 721-739     | paste replaces the whole table without confirmation                                      | P1-6            |
| `renderer/Workbench.tsx`                   | 283,301,322          | splitter `onResize` empty; keyboard adjustment a no-op                                   | P2-13           |
| `renderer/Workbench.tsx`                   | 699-700              | slice(5000) fake virtualization                                                          | P2-2            |
| `renderer/Workbench.tsx`                   | 577                  | delete button invisible to keyboard                                                      | P2-14           |
| `renderer/Workbench.tsx`                   | 572,836,1074         | hardcoded "rows"/"Showing…"                                                              | P2-10           |
| `renderer/WelcomePage.tsx`                 | 128-163              | recent projects always empty (write side missing)                                        | **P1-4**        |
| `renderer/WizardDialog.tsx`                | 102-129              | language switch resets entered parameters/columns                                        | P2-1            |
| `renderer/WizardDialog.tsx`                | 466                  | footer_count regex string surgery                                                        | P2-11           |
| `renderer/UploadDialog.tsx`                | 99-125               | key cleanup not in finally; overwrite ≠ delete; copy contradicts                         | **P1-7**        |
| `renderer/UploadDialog.tsx`                | 361                  | hardcoded "(N rows)"                                                                     | P2-10           |
| `renderer/CommandPalette.tsx`              | 92-98                | palette deletes unit without confirmation                                                | P2-3            |
| `renderer/components/ui/Splitter.tsx`      | 94-100               | keyboard callbacks depend on callers; currently all no-ops                               | P2-13           |
| `renderer/components/ui/ErrorBoundary.tsx` | 53,79                | recovery UI hardcoded English                                                            | P2-15           |
| `renderer/lib/validate.ts`                 | 43-49                | color_list splits on whitespace only, conflicting with comma write-back                  | P2-5            |
| `renderer/stores/project.ts`               | 125-141              | reorder dead code; toggleHidden wrongly clears the dirty flag                            | P3-2            |
| `renderer/styles/globals.css`              | 330-388,443-458      | three dead component classes                                                             | P3-1            |
| `renderer/styles/globals.css`              | 166,178              | dark accent/warning small-text contrast borderline                                       | P2-8            |
| `renderer/i18n/index.ts`                   | —                    | 8 missing keys + 26 dead status keys                                                     | P2-9/12         |
| `main/index.ts`                            | 90-118               | close-save 500 ms race; dialog hardcoded English                                         | **P1-5** / P3-6 |
| `main/index.ts`                            | 44,49                | minWidth 900 squeezes the center pane; black flash on light theme                        | P2-7 / P3-10    |
| `main/menu.ts`                             | 38                   | ⌘⇧W convention violation                                                                 | P3-5            |
| `main/sidecar.ts`                          | 31-33                | dev path hardcodes this machine's absolute path                                          | P3-7            |
| `main/ipc-upload.ts`                       | 32-36                | cancel is a no-op and the UI doesn't say so                                              | P2-4            |

---

## 10. Fix roadmap (suggested order)

### Step 1: make "runtime truth" visible (half a day)

1. Fix `tests/e2e/smoke.spec.ts`'s launch path → `out/main/index.cjs`, restoring the 11 cases to green (P0-3).
2. Manually run the core paths once: preview generation, drag-drop import, ⌘E/⌘I/⌘R — confirming the real behavior of P0-1/P0-2/P1-1/P1-2 one by one.

### Step 2: finish the wiring (1–2 days)

3. Change `sidecar.call` cancellation to "cancel channel + request id"; stop passing AbortSignal through (P0-1).
4. Add `webUtils.getPathForFile` in preload; give visible failure feedback for dropped files (P0-2).
5. `useMenuCommands`' export/import/generate-preview should reuse the Workbench's same-named callbacks (lifted to the store or a shared hook); delete the unheard custom events (P1-1/2).
6. `InspectorPanel` consumes `_error`: show the error + a retry button, and support cache invalidation and refetch (P1-3).
7. Call `addRecentProject` after successful open/save-as (P1-4).
8. Close flow: the renderer notifies the main process once saving truly finishes, then the window closes; a cancelled save-as stays in the app (P1-5).

### Step 3: close the data and key risks (1 day)

9. Add confirmation to paste-replace (P1-6); key cleanup into finally + real deletion + fixed copy (P1-7).
10. Add confirmation to command-palette delete (P2-3); preserve wizard state across language switches (P2-1).

### Step 4: consistency & polish (per iteration)

11. Add the 8 missing i18n keys, clean up hardcoded English and string surgery, and wire the 26 `app.status_*` strings to a simple status bar/toast (P2-9/10/11/12).
12. Connect the splitter's keyboard callbacks to real resizes; make the delete button visible via `group-focus-within` (P2-13/14).
13. Adopt `@tanstack/react-virtual` or remove both tanstack deps (P2-2); align the validator's separator semantics with the widget (P2-5).
14. Clean up dead code (P3-1/2/3); bind the window title to the project name and dirty flag (P3-4).

---

**End of report.**

> Note: this report is based on the current workspace source, build output (`out/renderer/assets/index-Cab0j139.css`, built 2026-10-27 01:08), `tsc --noEmit` output and `test-results/.last-run.json`. Except for P0-1, marked "needs runtime verification", every conclusion has file and line evidence. No source code was modified during the review.
