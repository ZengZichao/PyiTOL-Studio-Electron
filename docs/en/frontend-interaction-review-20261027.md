[English](../en/frontend-interaction-review-20261027.md) | **简体中文**

# PyiTOL Studio Frontend Design & Interaction Logic Review Report (Interaction Focus)

> **Status update (2026-10-27)**: all issues listed in this report have been fixed — see [frontend-fix-report-20261027.md](frontend-fix-report-20261027.md).

- **Review date**: 2026-10-27
- **Scope**: current workspace code of `PyiTOL-Studio-Electron` (Electron 45 + React 18 + Zustand + Tailwind v4 + i18next)
- **Method**: file-by-file manual read-through of the entire frontend source (≈4,600 lines of renderer, 217 lines of preload, ≈500 lines of interaction-related main-process code), cross-checked against i18n keys, built CSS, IPC contracts and E2E tests
- **Code changes**: this is a read-only review; **no code was modified**
- **File conflict note**: this report's filename is independent of the parallel review task's `docs/zh/frontend-design-review.md` (that report was completed at 10-26 20:31, before subsequent rounds of code changes); the two do not overwrite each other. Divergences are listed in §10.

---

## Table of Contents

1. [Overall conclusion](#1-overall-conclusion)
2. [P0 — Broken functionality (must fix immediately)](#2-p0--broken-functionality)
3. [P1 — Core interaction defects](#3-p1--core-interaction-defects)
4. [P2 — Consistency and correctness issues](#4-p2--consistency-and-correctness-issues)
5. [P3 — Accessibility and details](#5-p3--accessibility-and-details)
6. [Security focus](#6-security-focus)
7. [Interaction architecture assessment](#7-interaction-architecture-assessment)
8. [Internationalization (i18n) focus](#8-internationalization-i18n-focus)
9. [What is done well (keep it)](#9-what-is-done-well-keep-it)
10. [Relationship to and divergences from the existing report](#10-relationship-to-and-divergences-from-the-existing-report)
11. [Fix priority roadmap](#11-fix-priority-roadmap)

---

## 1. Overall conclusion

The frontend architecture is clear overall: a two-store split (project / UI), a typed preload bridge, a complete design-token system, dual themes and bilingual UI, and the security baseline (contextIsolation / sandbox / CSP) properly enforced. **The interaction skeleton is healthy.**

However, walking the "real user operation paths" reveals: **two main entry paths are broken** (drag-and-drop import completely fails; the close-with-save path has a data-loss race), **four menu/panel commands are dead or no-ops** (Import Template ⌘I, Export Template ⌘E, recent projects, upload cancel), and **the error feedback system is missing wholesale** — about 10 `catch` blocks swallow errors silently, leaving users with no feedback on failed imports, failed exports, or opening a corrupt project (i18n ships a full set of `app.status_*` feedback strings, but the renderer has no status-bar component to carry them).

**Per-dimension scoring** (5-point scale):

| Dimension                      | Score | Summary                                                                                                        |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| Visual design system           | 4.0   | Complete tokens, aligned dual themes, restrained and consistent; a few hardcoded colors and positioning errors |
| Interaction logic completeness | 2.0   | Multiple main paths broken or no-op; destructive operations lack confirmation/undo                             |
| Feedback and error handling    | 1.5   | Systematic silent error swallowing; no toast/status bar to carry feedback                                      |
| Accessibility                  | 3.0   | Dialog ARIA and focus traps excellent; table editing unreachable by keyboard                                   |
| State management and data flow | 4.0   | Clean two-store split; debounce/race guards written correctly                                                  |
| Security baseline              | 4.5   | Sandbox/CSP/external-link interception in place; file read/write lacks least-privilege constraints             |

---

## 2. P0 — Broken functionality

### P0-1 Drag-and-drop import completely fails (`File.path` has been removed)

**Location**: `src/renderer/src/App.tsx:153-157`

```ts
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  // @ts-expect-error — Electron extends File with .path
  const filePath: string | undefined = file.path
  if (!filePath) continue
```

This project depends on `electron ^45.0.0` (package.json). `File.path` has been **removed since Electron 32** (replaced by `webUtils.getPathForFile()`). On the current version, `file.path` is always `undefined` and the loop `continue`s for every file — **dropping a .pyitolproj / .nwk / template file onto the window does nothing**, not even an error message.

Meanwhile the welcome page still advertises the feature explicitly: `src/renderer/src/components/welcome/WelcomePage.tsx:167` ("Drag a Newick tree or iTOL template file into the window to start"), and the drop overlay still appears (`App.tsx:253-280`) — the user sees "Release to import files", lets go, and nothing happens.

**Fix direction**: expose path resolution in preload via `webUtils.getPathForFile(file)` (`webUtils` is available in preload under sandbox), or handle the file-drop channel on the main-process side via `will-navigate` / `webContents`.

### P0-2 The close-window "Save" path has a data-loss race

**Location**: `src/main/index.ts:90-118`

```ts
if (choice === 0) {
  // Save then close — send save command to renderer
  mainWindow?.webContents.send('menu:command', 'save-project')
  // After save, close
  setTimeout(() => {
    forceClose = true
    mainWindow?.close()
  }, 500)
}
```

After clicking "Save", the main process sends a command to the renderer and then **unconditionally force-closes the window after a fixed 500 ms**. Two real scenarios lose data:

1. A project never saved before (no `project/currentPath`): the renderer pops the "Save As" native dialog waiting for user input — before the user finishes, the 500 ms timer fires and the window is force-closed, interrupting the save and losing changes.
2. The user clicks "Cancel" in the save dialog: `project:save` / `save-project-as` returns `null` (`useMenuCommands.ts:48-53` only calls `markClean` when `savedPath` is non-null), but the main process still force-closes after 500 ms — the user explicitly cancelled the save, yet the app closes **without re-confirming**.

**Fix direction**: after saving, the renderer reports the result back (e.g. `ipcRenderer.send('save-finished', ok)`), and the main process closes/cancels only upon receiving the report; a cancelled save should return to the "not closed" state. See also P2-7: the confirmation dialog copy is hardcoded English.

---

## 3. P1 — Core interaction defects

### P1-1 After opening a project via drag-and-drop, ⌘S silently fails

**Location chain**: `App.tsx:160-167` → `stores/project.ts:70-80` → `hooks/useMenuCommands.ts:46-53` → `main/ipc-project.ts:87-99`

When a `.pyitolproj` is opened by drag-and-drop, the renderer calls `setProject(data, filePath)` (the renderer remembers the path); but the main process's `project:save` only honors **`project/currentPath` in the main-process store** — that key is written only on dialog open (`project:open`) and save-as; the drag-drop path is never written. So:

- `useMenuCommands.ts:48-50`: `filePath` non-null → takes the `saveProject` branch (not `saveProjectAs`);
- `ipc-project.ts:88-91`: main-process `currentPath` is `null` → **returns `null` immediately**;
- `useMenuCommands.ts:51-53`: `savedPath` is `null` → no `markClean`, **no fallback to save-as, no error**.

Result: pressing ⌘S on a drag-drop-opened project **does nothing**, with no dirty-state backstop (the P0-2 dialog only appears on close — and the save never succeeds anyway). This is the direct consequence of two split "save-path contracts" (renderer `filePath` vs main-process `currentPath`).

### P1-2 The "Recent projects" list is always empty

**Location**: `preload/index.ts:63-65`, `main/ipc-project.ts:153-170`, `welcome/WelcomePage.tsx:19-21`

The full `project:add-recent` chain exists (preload → main → store), but **no caller exists anywhere in the project** (a global grep only hits the definition). The welcome page's "Recent projects" section therefore always shows "no recent projects yet". Likewise `project:clear-recent` has no entry point. A pipeline was built but never connected to water.

### P1-3 Menu "Import Template ⌘I" / "Export Template ⌘E" are dead commands

**Location**: `hooks/useMenuCommands.ts:109-117`

```ts
case 'export-template':
  window.dispatchEvent(new CustomEvent('workbench-export'))
  break
case 'import-template':
  window.dispatchEvent(new CustomEvent('workbench-import'))
  break
```

The `workbench-export` / `workbench-import` events have **no listeners in any component** (grep across the project finds only these two dispatch sites). Clicking File → Import Template… (⌘I) or Command → Export Current Template… (⌘E) in the main menu does nothing. Note the Workbench's own toolbar export takes a different, real path (`handleExport` at `Workbench.tsx:194-207`) — the capability exists; only the menu commands aren't wired.

### P1-4 "Cancel upload" is fake, and the UI flips to error afterwards

**Location**: `main/ipc-upload.ts:32-36`, `UploadDialog.tsx:137-141`, `129-131`, `preload/index.ts:176-185`

- The main process `upload:cancel` handler is a **no-op** (the comment admits "we just let it finish"): the Python-side upload keeps running and progress messages keep arriving.
- The renderer's `handleCancel` immediately calls `setState('idle')` and clears the progress bar, looking cancelled;
- but preload's abort listener rejects with `Error('Aborted')`, and `handleUpload`'s catch then fires asynchronously → `setState('error')` — the UI turns into a red "Failed: Aborted" **after the user clicked cancel**. The user observes: running → cancelled (idle) → suddenly failed.

At minimum, pick one of three: implement real engine-level cancellation; or silently discard late results after cancel (keeping the AbortController race guard, like the preview panel does); or honestly display "cancel requested; task continues in background".

### P1-5 Command palette "Delete unit" deletes without confirmation

**Location**: `CommandPalette.tsx:93-98`

```ts
commands.push([
  `${t('ctx.delete_unit')}: ${unit.label || unit.type_name}`,
  () => {
    removeUnit(unit.unit_id)
    setOpen(false)
  }
])
```

The left unit list's delete has a `window.confirm` confirmation (`Workbench.tsx:579-584`), while the same operation in the command palette **deletes on Enter** — deleting a unit that may contain large amounts of data, with no undo. The two behaviors are inconsistent, and the destructive action sits on the most accident-prone path: search + Enter.

### P1-6 Data-table destructive operations have no undo

**Location**: `Workbench.tsx:605-626` (paste replaces whole table), `724-736` (same via paste-TSV button), `873-883` (clear all data)

- `handlePaste` **replaces the entire table** (`columns` + `data_rows`) with clipboard content (the i18n string `table.paste_hint` does say "replaces the whole table" — partial informed consent), but there is no undo stack;
- right-click "Clear all data" has a single `window.confirm`; once confirmed the data is unrecoverable;
- the Edit → Undo/Redo menu items are Electron native roles that only affect text inputs — useless for table data — yet users will plausibly press ⌘Z expecting recovery.
- There is no row-level or cell-level history anywhere. Recommend keeping at least a one-step in-memory snapshot for "replace table / clear / delete row" to support ⌘Z, or a recoverable confirmation dialog before the action.

### P1-7 Error feedback is systemically missing (≈10 silent catches)

| Location                 | Scenario                            | What the user sees                                                                            |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `App.tsx:168-170`        | drag-drop project open fails        | nothing                                                                                       |
| `App.tsx:187-189`        | template learn_from_file fails      | nothing                                                                                       |
| `Workbench.tsx:204-206`  | template export file write fails    | nothing (incl. permissions/disk full)                                                         |
| `WelcomePage.tsx:51-53`  | recent project file corrupt/moved   | nothing (although `project:recent` filters non-existent paths, corrupt JSON still lands here) |
| `CommandPalette.tsx:42`  | list_template_types fails           | the palette's "template types" group silently disappears                                      |
| `WizardDialog.tsx:88`    | same                                | the type list shows "no results" instead of an error                                          |
| `UploadDialog.tsx:93-95` | per-unit temp template export fails | **silently skipped**, upload continues; if all fail, an empty template set is uploaded        |
| `Workbench.tsx:177`      | leaf-id parsing fails               | only "leaf count unknown" — acceptable, but no reason                                         |

i18n ships the full set of `app.status_open_failed` / `app.status_export_failed` / `app.status_import_failed` feedback strings (`i18n/index.ts:17-44`) — the old PySide6 edition had a status bar. **The Electron edition deleted the status-bar component without adding a toast**, leaving those keys dead. Adding a lightweight toast/status-bar component to carry them uniformly is also the cheapest path to fixing most of this section.

---

## 4. P2 — Consistency and correctness issues

### P2-1 The IDL cache ignores locale; form labels don't update after a language switch

**Location**: `Workbench.tsx:147-164`, `stores/project.ts:151-152`

`idlCache` is keyed by `type_name` and fetched with `locale: language`. After the user switches language:

- the Workbench inspector hits the cache, **field labels stay in the old language** until restart;
- the Wizard refetches when `language` changes (`WizardDialog.tsx:102-129`, dependency array includes `language`) — the two behaviors diverge.

Fix: key the cache `` `${type_name}:${locale}` `` or clear it on language switch.

### P2-2 `color_list` validation and the widget disagree on the separator

**Location**: `lib/validate.ts:43-50` vs `inspector/IdlWidget.tsx:173-174`

The widget supports comma-separated lists when `field.range === 'comma'`; the validator **always splits on whitespace**. For comma-separated fields, valid input (`#ff0000,#00ff00`) is flagged as a `field_color_list` error, the inspector's top banner says "N parameters need fixing", and no amount of editing in the UI clears it (the widget's own output fails validation). Also the error interpolation `{{value}}` stuffs the entire string into the message — comma strings get especially long.

### P2-3 Parsing translated text with `split('·')` to extract the leaf count

**Location**: `Workbench.tsx:479-484`

```ts
leafIds
  ? `${leafIds.size} ${t('nav.tree_meta', { count: leafIds.size }).split('·')[0].trim()}`
```

`nav.tree_meta` is `'{{count}} 个叶节点 · Newick'` (zh) and `'{{count}} leaf nodes · Newick'` (en). Slicing a translated string by a delimiter to compose new copy silently breaks as soon as the copy changes (drop "· Newick" or switch delimiters). It should be a separate key (e.g. `nav.tree_leaf_count`). The `nav.tree_match` usage at line 488 in the same file is fine.

### P2-4 TreeCard title misuses the "annotation units" copy

**Location**: `Workbench.tsx:469-472`

The tree file card (tree path / leaf count / change-tree button) has the bold title `t('nav.units_caption')` = "Annotation units". The UnitList right below it is the actual unit list, and UnitList itself has no title. The user sees two sections, the first labeled "annotation units" while containing tree info. The tree card needs its own key (e.g. `nav.tree_card_title`).

### P2-5 The preview debounce has a "run once more after finishing" redundant RPC

**Location**: `Workbench.tsx:126` + `129-144`

`generatePreview`'s `useCallback` dependencies include `previewText`; the debounce effect's dependencies include `generatePreview`. So: edit → 300 ms later generate → `setPreview` changes `previewText` → `generatePreview` identity changes → the effect re-runs → **schedules another 300 ms timer and generates again** → the second result equals the first (string primitives compare equal; zustand doesn't re-render) → the loop terminates. Net effect: **every edit triggers two `generate_template` RPCs, the second purely redundant**. Remove `previewText` from `generatePreview`'s dependencies (the function doesn't read it — it only checks "is there a value" for the loading flag; use a ref or a functional check instead).

### P2-6 `AbortSignal` is not forwarded to the main process; "cancel" only stops UI updates

**Location**: `preload/index.ts:26-28`, `main/index.ts:162-165`, `Workbench.tsx:92-126`

Preload sends `opts` (including `signal`) to `sidecar:call`; the main-process handler signature only accepts `(method, params)` — **opts is dropped**. So the Workbench preview's `AbortController` never interrupts the underlying RPC: during rapid consecutive edits, stale `generate_template` calls still queue and execute in the sidecar; their results are merely discarded by the `previewAbortRef.current === ac` guard. The `err.name === 'AbortError'` branch at `Workbench.tsx:116` is actually **unreachable**. The current race guard preserves correctness, but pick one: forward `AbortSignal` through the main process (`ipcMain.handle` cancellation semantics need custom implementation), or remove the misleading opts/branch.

### P2-7 The main-process close-confirmation dialog is hardcoded English

**Location**: `main/index.ts:95-103`

Buttons `['Save', 'Discard', 'Cancel']`, title and body are all English. The application menu is fully localized by `ui/language` (`menu.ts`) — this most critical data-safety dialog is the lone exception; Chinese users see a jarring English dialog at quit.

### P2-8 AboutDialog close button is anchored to the wrong element

**Location**: `AboutDialog.tsx:38-45`

The close button is `absolute top-2 right-2`, but its parent card `motion.div` lacks `position: relative` — the nearest positioned ancestor is the outermost `fixed inset-0` overlay. **The X button actually renders at the window's top-right corner, not the dialog card's**; on wide screens it sits far from the card and looks like a window-level close. Add `relative` to the card.

### P2-9 Large-table "virtualization" in name only + hardcoded English truncation notice

**Location**: `Workbench.tsx:698-700`, `834-837`

The comment says "Virtualized rendering: cap visible rows and use windowing"; the implementation is just `rows.slice(0, 5000)`. Beyond 5000 rows the tail is invisible and uneditable, and the notice `"Showing {MAX_RENDER} of {rows.length} rows"` is hardcoded English (not via i18n). Moreover, `@tanstack/react-virtual` and `@tanstack/react-table` are installed in package.json with **zero renderer references** (no grep hits) — either deliver virtualization, or remove the dependencies and rename honestly.

### P2-10 Multiple guard gaps in the upload dialog

**Location**: `UploadDialog.tsx:425-433`, `83-96`, `117-125`

- The "Upload & Export" button is disabled only by `!treePath`: **uploading with zero templates selected is possible** (the engine may tolerate it, but the UI should block or at least hint, using the existing `upload.no_units_msg` copy);
- per-unit temp-template export failures are silently skipped (see P1-7 table);
- API-key cleanup merely does `writeFile(keyPath, '')` — **the plaintext key file still exists in the system temp directory** (a 0-byte shell) until the OS cleans it; failures are swallowed. Recommend deleting the file when upload completes (add a `deleteFile` to the `files` channel), or passing the key to the sidecar via an environment variable.

### P2-11 The Wizard data-parse effect's column inference is fragile

**Location**: `WizardDialog.tsx:145-173`

After pasting data, "does the first row equal `columns` item-by-item" decides whether to adopt user headers. When the separator changes (e.g. TAB → COMMA), `parseLine` changes trigger a re-parse; the first row may be split into a single column and overwrite `columns`, and step 2's `canNext` (which depends on `columns.length > 0`) still lets the user through until generation fails at step 4. Also `wizard.bad_columns`, `wizard.sep_conflict` and other validation copy are ready but **wired to nothing** (no grep hits). Validate column counts and separator conflicts at step 2 using the existing copy.

---

## 5. P3 — Accessibility and details

1. **Table cells unreachable by keyboard** (`Workbench.tsx:820-826`): editing requires double-clicking a `<span>`; cells have no `tabIndex`, no Enter-to-edit, no ARIA. Keyboard-only users cannot edit any data. The paste entry (`onPaste` on the container) also requires focus to be inside the table container.
2. **UnitList delete button visible only on hover yet always focusable** (`Workbench.tsx:576-587`): `opacity-0 group-hover:opacity-100` without `:focus` handling — when Tab-focus reaches it, it stays invisible (an invisible focusable control is a WCAG violation).
3. **Splitter keyboard adjustment is a no-op** (`Workbench.tsx:283`, `300-301`, `322-323`): all three Splitters pass `onResize={() => {}}`, and `Splitter.tsx:94-100`'s arrow-key logic only calls `onResize`. `aria-valuenow` reports the stale value; keyboard users see a focus ring but cannot move anything.
4. **Status dots distinguished by color alone**: the table's status column has a `title` (`Workbench.tsx:795`) — acceptable; but the unit list's color dots (`Workbench.tsx:563-566`) have no text alternative, so color-blind users cannot tell units apart by shape.
5. **Synchronous IPC across the startup path**: `settings:get` (`preload/index.ts:114-116`, called twice on app mount, `App.tsx:56-61`), `check-dirty-sync`, `files:get-temp-dir`, `files:join-path`, `sidecar:engine-version` are all `sendSync` and block the renderer main thread. `sidecar.engineVersion()` has no caller anywhere (dead API). Migrate to async incrementally.
6. **The Wizard's "discard confirmation" sub-dialog doesn't use `useDialog`** (`WizardDialog.tsx:664-686`): Esc does nothing, no focus trap, the "Discard" button lacks `autoFocus` (for a dangerous action the default focus should land on "Cancel" to be safe).
7. **Wizard step indicator has no ARIA** (`WizardDialog.tsx:308-337`): add `aria-current="step"`. The i18n keys `wizard.finish`, `wizard.hint_select`, `wizard.params_hint`, `inspector.expand_all/collapse_all/copy_params/compact` etc. currently have no consumers (dead keys — clean up or wire up).
8. **Native `window.confirm` × 3** clashes stylistically with the custom dialogs (the macOS-native dialogs are tolerable, but coexisting with the Wizard's in-app discard confirmation makes two paradigms).
9. **Path display splits on `/`** (`Workbench.tsx:475`): fine for the macOS primary target, but `split('/')` will show full paths on a future Windows port. Sink `path.basename` semantics into the main process.
10. **CommandPalette increments `runningIndex` during render** (`CommandPalette.tsx:165`, `227-229`): correctness relies on the iteration order of `Object.entries(grouped)` and `flatItems` (`Object.values`) matching exactly — an implicit contract; precompute an index map. The current implementation is correct (reset from −1 each render); noted as code quality only.
11. **Store stubs and dead code**: `project.ts:134-141` `toggleUnitHidden` is a placeholder with suspicious behavior (it force-resets `isDirty` to false when run); `reorderUnits` and `updateProjectName` have no callers.

---

## 6. Security focus

**Done well** (keep it):

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`main/index.ts:50-58`);
- CSP declared twice (HTML meta + response-header injection), locked to `'self'` in production (`index.html:6`, `main/index.ts:62-73`); dev-mode `unsafe-eval` is limited to the dev server — acceptable;
- `setWindowOpenHandler` only allows `https://` to the system browser, everything else `deny` (`main/index.ts:76-81`); `platform:open-external` validates likewise (`main/index.ts:189-193`);
- the renderer's only HTML injection point, `highlightItolTemplate` (`lib/highlight.ts:15-20`), **escapes before highlighting** — no XSS;
- preload exposes only the typed API through `contextBridge`; no `executeJavaScript`-style escape hatches.

**Needs tightening**:

1. **`files:read` / `files:write` have no path constraints** (`ipc-files.ts:73-85`): the renderer can read/write any path on disk. Today the renderer only loads local content and CSP is locked, so the exploitation prerequisite (XSS) is closed — this is defense-in-depth level risk. But note: the leftover i18n key `app.status_bad_path` ("Invalid path: target contains a .. traversal segment, rejected") shows the old edition validated paths and the Electron edition does not — at minimum whitelist `files:write` (dialog-chosen paths and the system temp directory only), restoring the old defensive semantics.
2. **API key written in plaintext to the temp directory** (see P2-10): readable until a crash or manual cleanup.
3. **`upload:cancel` is an empty implementation** (see P1-4) with a resource dimension: the upload keeps occupying the network until it ends naturally.

---

## 7. Interaction architecture assessment

**Strengths**:

- **Clean two-store split** (`stores/project.ts` document state vs `stores/ui.ts` view state), all side effects concentrated in component-level hooks, `unitToSpec` as the single adapter from project model → RPC payload. Boundaries are clear.
- **The preview generation race guard is written correctly** (double check `previewAbortRef.current === ac`), combined with 300 ms debounce the interaction feels smooth (apart from P2-5's redundant second call).
- **`useDialog` is a high-quality primitive**: focus trap + Esc + initial focus + focus restore + scroll lock, reused by all four dialogs; CommandPalette fully implements the combobox/listbox ARIA pattern (`aria-activedescendant`, `data-selected`, scroll-following) — rare in desktop Electron apps.
- **Engine-connection backoff retry** (`App.tsx:68-107`, linear backoff capped at 3 s + re-subscribe on crash events) is the right design for PyInstaller cold starts, and the E2E asserts it.
- **Menu commands converge via the `menu-command` custom event and IPC into one handler**, with a comment explicitly warning about recursion risk (`useMenuCommands.ts:6-17`) — good design awareness; but as P1-3 shows, the "connecting water to the pipes" work at the convergence layer is unfinished.

**Structural risks**:

- **The same capability has two contracts**: save path (renderer `filePath` vs main `currentPath`), theme (renderer `applyThemeClass` vs main `nativeTheme.themeSource` + `applyTheme` double-write), language (renderer `i18n.changeLanguage` vs main `store.get` + `rebuildMenu`). Each works today, but any change on one side easily produces P1-1-style "single-sided memory" bugs. Write "who is the source of truth" into an ADR and converge to one side.
- **The missing feedback channel is an architectural hole**: it isn't a few forgotten catches — there is no UI primitive to carry feedback at all. Add a toast/status bar first, then wire sites one by one; cheaper than sprinkling `alert`s point-by-point.

---

## 8. Internationalization (i18n) focus

- **Key scale and alignment**: zh / en each **287 keys, fully aligned** (measured counts match), `fallbackLng: 'en'`, hot-switch via `i18n.changeLanguage` + `<html lang>` sync (`App.tsx:48-52`) — correctly implemented.
- **The main problem is "defaultValue fallback" creating mixed-language UI**: the following keys are missing from the zh dictionary and fall back to English `defaultValue`s, so **the Chinese UI pops English copy**:
  - `ctx.delete_confirm` (`Workbench.tsx:581`, delete confirmation)
  - `table.ctx_clear_confirm` (`Workbench.tsx:875`)
  - `inspector.reset_all_confirm` (`Workbench.tsx:1048`)
  - `common.select_all` / `common.deselect_all` (`UploadDialog.tsx:338`)
  - `cmd.no_results` (`CommandPalette.tsx:210`, `WizardDialog.tsx:369`)
  - `inspector.idl_failed` (`WizardDialog.tsx:554`)
  - `update.downloading_auto` (`UpdateNotification.tsx:67`)

  Recommend a CI static check that "every renderer `t(` key ⊆ dictionary keys" to clear these in one sweep.

- **Dead keys in bulk**: the whole `app.status_*` family (≈20 keys), `wizard.finish/hint_select/params_hint/bad_columns/sep_conflict`, `inspector.expand_all/collapse_all/copy_params/compact*`, `nav.hide_unit/show_unit/hidden_summary`, `config.*`, `about.*`, `fd.*`, `fd.select_key` etc. These are old-edition feature copy; wiring or deleting them needs one decision (`app.status_*` is exactly the ready-made corpus for P1-7's status bar).
- The main-process menu is fully localized (`menu.ts`), with the close-confirmation dialog as the exception (P2-7).

---

## 9. What is done well (keep it)

1. **Design token system**: the `@theme` semantic colors + `.dark` override structure in `globals.css` is clear; in the current build output the spacing classes `p-sm` / `mt-xs` / `gap-xs` etc. **are all generated**; `prefers-reduced-motion` global fallback, themed scrollbars, `:focus-visible` rings, drag regions (`drag-region`/`no-drag`) and layered `user-select` are mature desktop details.
2. **Security baseline**: see §6 — good standing among comparable Electron projects.
3. **`useDialog` + CommandPalette accessibility** (see §7).
4. **i18n bilingual, 287 keys fully aligned**, unified `{{...}}` interpolation.
5. **E2E smoke test** covers welcome → workbench → command palette → engine handshake end to end, with stable test hooks via custom events (and the hook's design intent documented in `useMenuCommands.ts`).
6. **Global ErrorBoundary** with a recovery button catches renderer white screens.
7. **Immutable-update discipline in document state** is good: every store update is a shallow-copy spread; no in-place mutation observed.

---

## 10. Relationship to and divergences from the existing report

The parallel task produced `docs/zh/frontend-design-review.md` (10-26 20:31). This report is an **independent re-review** after it; the two files are independent and do not overwrite each other. Notable divergences:

| Item                            | Existing report (10-26)           | This report's findings (10-27 code & build output)                                                                                                                                |
| ------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing utilities               | P0 "29 class names / 0 generated" | **Generated**: in `out/renderer/assets/index-Cab0j139.css` (built 10-27 01:08), `p-sm`, `mt-xs`, `gap-xs`, `px-sm`, `mb-xl` etc. all hit                                          |
| Traffic lights over the toolbar | P0                                | Current code leaves an 80 px safe area at `Workbench.tsx:377` (`paddingLeft: 80`; needs on-device verification)                                                                   |
| Splitter stale-closure failure  | P0                                | Current code adds the `onResizeAbsolute` absolute mode (`Splitter.tsx:50-53`) specifically to fix this; the keyboard path still has the empty-function problem (this report P3-3) |
| Menu command infinite recursion | P0                                | Current handler no longer re-dispatches events; recursion risk removed; but **⌘I / ⌘E are dead commands** (this report P1-3)                                                      |

The two reports complement each other: the existing one focuses on visual/layout/tokens, this one on interaction paths, data-flow contracts and feedback. Recommend merging this report's §2-§3 with the still-valid parts of the existing report into one schedule.

---

## 11. Fix priority roadmap

**Batch 1 (user data & main paths, 1-2 days)**

1. P0-1: wire `webUtils.getPathForFile` in preload, fix drag-drop import, add failure feedback;
2. P0-2: change close-with-save to a "renderer reports completion" protocol; abolish the 500 ms timed force close;
3. P1-1: unify the save-path contract (write main-process `currentPath` on drag-drop open, or let `project:save` accept a renderer-provided path); a failed ⌘S must be visible.

**Batch 2 (turn fake features into real ones, 2-3 days)** 4. P1-3: wire up or remove the ⌘I / ⌘E menu items; 5. P1-2: call `add-recent` after `open-project` / `save-as` / successful drag-drop open; add a "clear recents" entry on the welcome page; 6. P1-4: land one of the three upload-cancel options (true cancel / silently swallow results / honest notice); 7. P1-7: add a Toast/status-bar component consuming the ready-made `app.status_*` copy, and replace silent catches site by site.

**Batch 3 (consistency & guards, 3-5 days)** 8. P1-5 / P1-6: confirm before command-palette delete; one-step undo snapshots for table replace/clear; 9. P2-1 / P2-2 / P2-3 / P2-4: locale-aware IDL cache, align color_list validation, remove `split('·')`, dedicated TreeCard title key; 10. P2-6 / P2-5: forward AbortSignal or delete the misleading branch; remove the redundant second preview RPC; 11. P2-7 / P2-8 / P2-9 / P2-10: localize the close dialog, `relative` on AboutDialog, i18n the table truncation notice, upload-dialog guards and key-file deletion.

**Batch 4 (accessibility & cleanup)** 12. All of §5: table keyboard editing, focus visibility, Splitter keyboard wiring, dead-key cleanup (with the CI key-check script).

---

_Reviewer: ZCode (interaction focus). All line numbers refer to the 2026-10-27 workspace code; this report modified no source code._
