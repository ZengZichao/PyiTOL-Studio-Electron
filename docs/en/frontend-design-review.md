**English** | [简体中文](../zh/frontend-design-review.md)

# PyiTOL Studio Frontend Design Review Report

> **Status update (2026-10-27)**: all issues listed in this report have been fixed — see [frontend-fix-report-20261027.md](frontend-fix-report-20261027.md).

> Project: PyiTOL Studio (Electron desktop app, macOS-first)
> Version: 0.3.0
> Review date: 2026-10-26
> Review scope: `src/renderer` (React + Tailwind v4), the Electron window and menu layer, and the built CSS bundle
> Review nature: **Read-only diagnostic**. This report contains no code changes; no source files were modified or deleted.
> Review method: Line-by-line source walkthrough + verification against the built CSS bundle + WCAG 2.x contrast calculations + macOS/Electron platform convention checks

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [Review scope, method & scoring](#2-review-scope-method--scoring)
3. [P0 blocker issues (must fix first)](#3-p0-blocker-issues-must-fix-first)
4. [Layout & spacing system](#4-layout--spacing-system)
5. [Design tokens & theme system](#5-design-tokens--theme-system)
6. [Visual hierarchy, density & brand language](#6-visual-hierarchy-density--brand-language)
7. [Component & pattern consistency](#7-component--pattern-consistency)
8. [Interaction flows & state design](#8-interaction-flows--state-design)
9. [Accessibility](#9-accessibility)
10. [macOS / Electron desktop adaptation](#10-macos--electron-desktop-adaptation)
11. [Internationalization & copy](#11-internationalization--copy)
12. [Performance & frontend engineering (experience-related)](#12-performance--frontend-engineering-experience-related)
13. [Per-file issue index](#13-per-file-issue-index)
14. [Improvement roadmap](#14-improvement-roadmap)
15. [Design system recommendations (target state)](#15-design-system-recommendations-target-state)
16. [Appendix](#16-appendix)

---

## 1. Executive summary

PyiTOL Studio's interface problems are **not a matter of aesthetics — the design system fails wholesale at compile time, desktop platform adaptation is missing, and key interactions contain functional defects.** The combination of the three makes the interface render as "a webpage with no padding opened inside Electron" rather than a macOS research data tool.

### 1.1 The five most critical findings

| #   | Finding                                                                                                                     | Severity | One-line evidence                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **The entire spacing system never took effect**: 29 spacing class names, 190 usages, none of them exist in the compiled CSS | P0       | `--space-*` was written into `:root`, but Tailwind only recognizes the `--spacing-*` namespace; the build output contains no `.p-sm` / `.px-sm` / `.gap-xs`                          |
| 2   | **The macOS title bar and toolbar overlap, and the window cannot be dragged**                                               | P0       | `titleBarStyle: 'hiddenInset'` + `trafficLightPosition {x:16,y:16}`; the toolbar's first button starts at x≈0, and there is no `-webkit-app-region` anywhere in the project          |
| 3   | **Four menu commands trigger infinite recursion**                                                                           | P0       | `generate-preview` / `export-template` / `import-template` / `show-about` are re-dispatched in `useMenuCommands` as a same-named `menu-command` event, forming synchronous recursion |
| 4   | **Splitter dragging on three panels is effectively unusable**                                                               | P0       | `Splitter` captures the stale `onResize` in a closure at `mousedown`; every increment is added onto the old width from the drag start point, so panels only nudge                    |
| 5   | **Multiple unprotected data-loss paths exist**                                                                              | P0       | `isDirty` is never consumed by the UI, window close has no interception, and deleting units / clearing data / whole-table paste have neither confirmation nor undo                   |

### 1.2 Other high-frequency issues (P1)

- In the dark theme, `.btn-utility` renders **white text on a white background** (contrast 1.00:1), and `--color-surface-chip` is not defined in `.dark`.
- In the light theme, `text-ink-subtle` (#7a7a7a) reaches only **3.94:1** on the parchment background, yet is used extensively for 12px explanatory text; in the dark theme the brand blue #2e5cff reaches only **3.28:1** on #1d1d1f.
- **ARIA coverage in the renderer DOM is 0**: no `role="dialog"`, no focus trap, no `aria-live`, form labels lack `htmlFor`, and color is the only carrier of information in the status column.
- **The 12px `--text-fine-print` size has a line-height of 1.0**, which clips both Chinese and English text.
- The main data table claims to be "virtualized" but actually renders everything with `rows.slice(0, 10000)`; `@tanstack/react-virtual` and `@tanstack/react-table` are installed but never used.
- The wizard's type search box writes a `Promise` into the `types` state; clearing the input triggers `types.filter is not a function`, and with no Error Boundary the screen goes blank.
- The upload dialog writes the API Key in plaintext to `/tmp/pyitol_api_key.txt` without ever deleting it, while the UI copy claims it is "never stored".
- The native menus are all English, inconsistent with a UI that can switch to Chinese; `<html lang>` is permanently `en`.

### 1.3 What is done well (keep it)

- The token-first architectural intent is clear: light/dark themes, brand colors, type scale, radii and spacing are all explicitly modeled, with design provenance and prohibitions documented in comments.
- The icon system uniformly uses `lucide-react`, with largely consistent stroke widths and semantics.
- i18n key coverage for core flows is high (674 entries), with runtime hot-switching supported.
- The product thinking is professional: leaf-node ID validation, template syntax highlighting, the four-zone "wizard + checklist + data table + preview" layout, a command palette, and keyboard shortcuts are all the correct skeleton for a research tool.
- The Electron security baseline is in place: `contextIsolation` / `sandbox` / `nodeIntegration: false` / CSP / external links open externally.

**Overall verdict: the skeleton is professional, the skin is broken, and the details were never validated against desktop usage.**

---

## 2. Review scope, method & scoring

### 2.1 Files reviewed

| Layer               | File                                                             |     Lines | Notes                                                              |
| ------------------- | ---------------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| Design system       | `src/renderer/src/styles/globals.css`                            |       518 | Tokens + component classes                                         |
| App shell           | `src/renderer/src/App.tsx`                                       |       176 | View switching, drag overlay                                       |
| Main workbench      | `src/renderer/src/components/workbench/Workbench.tsx`            |      1113 | Toolbar / tree card / unit list / data table / preview / inspector |
| Wizard              | `src/renderer/src/components/wizard/WizardDialog.tsx`            |       591 | Four-step wizard                                                   |
| Welcome page        | `src/renderer/src/components/welcome/WelcomePage.tsx`            |       233 | First screen                                                       |
| Command palette     | `src/renderer/src/components/command-palette/CommandPalette.tsx` |       260 | ⌘K                                                                 |
| Upload              | `src/renderer/src/components/workbench/UploadDialog.tsx`         |       405 | iTOL upload                                                        |
| Inspector widgets   | `src/renderer/src/components/inspector/IdlWidget.tsx`            |       284 | IDL dynamic form                                                   |
| Splitter            | `src/renderer/src/components/ui/Splitter.tsx`                    |        66 | Panel sizing                                                       |
| Update notification | `src/renderer/src/components/ui/UpdateNotification.tsx`          |       117 | Toast                                                              |
| Shell               | `src/main/index.ts` / `src/main/menu.ts`                         | 232 / 147 | Window, menus                                                      |
| Build output        | `out/renderer/assets/index-1_xhN5jD.css`                         |     26 KB | Used to verify which class names were actually generated           |

### 2.2 Method

1. **Static source walkthrough**: examined layout, states, interactions, copy and keyboard paths component by component.
2. **Reverse lookup in the build output**: extracted 119 unique class names from `className`, searched each one in the built CSS, and confirmed which class names were "written but never generated". This was the most critical step of this review — it turned "spacing looks missing" into "spacing was written but discarded by the compiler".
3. **Contrast calculation**: computed key foreground/background combinations from both themes one by one using the WCAG 2.x relative luminance formula (two decimal places retained).
4. **Platform convention checks**: against macOS HIG and Electron `titleBarStyle` / menu / accelerator behavior.
5. **State matrix reasoning**: for each primary screen, reasoned through the five states of empty / loading / error / partial success / destructive action.

### 2.3 Severity definitions

| Level  | Definition                                                                                                | When to fix     |
| ------ | --------------------------------------------------------------------------------------------------------- | --------------- |
| **P0** | Blocks core tasks, causes data loss, breaks the UI wholesale, or inevitably produces a white screen/crash | Immediately     |
| **P1** | Severely damages usability/accessibility/trust; users will clearly notice                                 | This iteration  |
| **P2** | Consistency, efficiency and maintainability issues; affects professional polish                           | Next iteration  |
| **P3** | Polish items, convention deviations, documentation issues                                                 | When convenient |

### 2.4 Scoring (5-point scale)

| Dimension                         |       Score | Basis of judgment                                                                                                              |
| --------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------ |
| Design system usability           |         1.5 | Tokens exist, but the spacing/type-size/radius namespaces are all not wired into Tailwind, so they cannot actually be consumed |
| Layout & rhythm                   |         1.0 | All spacing classes broken; panels and dialogs hug the edges                                                                   |
| Visual consistency                |         2.0 | Unified color system, but radii/shadows/button heights each do their own thing                                                 |
| Dark theme                        |         2.0 | A complete mapping exists, but there is white-on-white text, hardcoded light surfaces, and insufficient contrast               |
| Interaction feedback              |         1.5 | No hover on buttons, selected-state contrast 1.04:1, no feedback on save/export                                                |
| State design                      |         1.5 | No skeletons, errors swallowed, IDL failure shows "Loading" forever, warnings are counts only                                  |
| Accessibility                     |         1.0 | ARIA coverage is 0, keyboard paths incomplete, contrast fails in many places                                                   |
| Desktop platform adaptation       |         1.5 | Traffic lights overlap, no drag region, all-English menus, shortcut conflicts                                                  |
| Internationalization              |         2.0 | Main flows complete, but hardcoded English and a missing language attribute                                                    |
| Professional data-tool density    |         2.0 | 17px body text + 44px controls; density closer to a marketing page than a research tool                                        |
| Performance & engineering support |         2.0 | Full render of 10k rows, no error boundaries, oversized components, idle dependencies                                          |
| **Overall**                       | **1.7 / 5** | Correct skeleton, systematically distorted implementation                                                                      |

---

## 3. P0 blocker issues (must fix first)

### LAY-01 The spacing system fails wholesale (29 class names / 190 usages / 0 generated)

**Symptom**

`globals.css:163-170` defines:

```
--space-xxs / --space-xs / --space-sm / --space-md / --space-lg / --space-xl / --space-xxl / --space-section
```

But Tailwind v4's spacing namespace is `--spacing-*` (default `--spacing: 0.25rem`). `--space-*` belongs to no namespace Tailwind recognizes, so `p-sm`, `px-sm`, `py-xs`, `gap-xs`, `mt-xxs`, `mb-lg` and the like are **all never generated**.

**Evidence**

```bash
# used in the source
grep -o "\.p-sm{" out/renderer/assets/index-1_xhN5jD.css   # no output
grep -o -- "--spacing-sm" out/renderer/assets/index-1_xhN5jD.css  # no output
```

Static statistics (extracted from `className` → reverse-checked in the built CSS):

| Class name                | Usage count | Generated? |
| ------------------------- | ----------: | ---------- |
| `gap-xs`                  |          35 | No         |
| `px-sm`                   |          25 | No         |
| `py-xs`                   |          20 | No         |
| `gap-xxs`                 |          15 | No         |
| `mb-sm`                   |          11 | No         |
| `mb-xs`                   |          10 | No         |
| `mt-xxs`                  |           9 | No         |
| `mt-xs` / `p-sm` / `p-lg` |   7 / 7 / 7 | No         |
| Remaining 19              | 44 in total | No         |

In total **29 spacing class names, 190 usages, none generated**. In addition, `bottom-sm` and `right-sm` are also missing (see 7.8 Update notification).

**Concrete consequences (all directly visible in the UI)**

- Toolbar `px-sm` broken → left/right padding is 0, and the first button hugs the window's left edge.
- Panel `p-sm` broken → the tree card, inspector, table and preview all hug the edges.
- Dialog `px-lg py-sm` broken → the title and bottom buttons press against the card edges.
- Table cells `px-sm py-xs` broken → zero gap between text and column boundaries; numeric columns squeeze together.
- All `gap-*` broken → no spacing between icon and label, between toolbar buttons, or inside button groups.
- Welcome page `mt-xxl` / `gap-lg` broken → the three entry cards touch each other, and "Recent projects" presses against the hero visual.
- Command palette `pt-xxl` broken → the overlay hugs the window's top edge instead of sinking 48px as designed.

**Why this is the most severe**

This is not "one missing padding somewhere" — it is **all spatial relationships across the interface collapsing to zero at once**. Any subsequent color, radius or shadow polish will be masked by this underlying failure.

**Recommendations**

- Move the spacing tokens into a Tailwind-recognized namespace (`@theme { --spacing-xs: ... }`), or switch to arbitrary-value syntax.
- Add a "used classes ⊆ generated classes" check in CI to prevent silent loss from recurring.
- Establish a 4/8 grid: 4, 8, 12, 16, 24, 32, 48; do not keep values like 17px that break the rhythm.

---

### MAC-01 Traffic lights sit on top of the toolbar, and the window cannot be dragged

**Symptom**

- `src/main/index.ts:47-48`:

```ts
titleBarStyle: 'hiddenInset',
trafficLightPosition: { x: 16, y: 16 },
```

- The toolbar is 44px tall (`Workbench.tsx:329-332`); after `px-sm` fails, the first button starts at x=0 (`Workbench.tsx:334`).
- On macOS the traffic lights occupy roughly x=16–72, y=16–30, **directly overlapping** the "Show/collapse left panel" button at the top-left.
- A project-wide search for `app-region` / `WebkitAppRegion` finds **0 occurrences**. `hiddenInset` hides the native title bar, but no drag region is declared anywhere, so the 44px toolbar cannot drag the window.

**Consequences**

- Visually: the top-left corner shows buttons stacked on top of buttons — this is the user's first impression of the app's professionalism.
- Functionally: users can barely move the window (only via external means such as Mission Control).

**Recommendations**

- Reserve a traffic-light safe zone of ≥ 80px on the left of the toolbar (`padding-left: 88px`), or put the brand/title in that area.
- Declare `-webkit-app-region: drag` on the toolbar's blank areas, and `no-drag` on every clickable element.
- Align the traffic-light position with the 44px bar height (vertically centered, usually y≈15–16, but x must be designed together with content avoidance).

---

### FLW-01 Menu commands recurse infinitely (⌘R / ⌘E / Import / About)

**Symptom**

`src/renderer/src/hooks/useMenuCommands.ts:94-100`:

```ts
case 'generate-preview':
case 'export-template':
case 'import-template':
case 'show-about':
  window.dispatchEvent(new CustomEvent('menu-command', { detail: command }))
  break
```

The same file registers at `:108-114`:

```ts
window.addEventListener('menu-command', windowHandler)
```

`windowHandler` feeds the detail back into `handleCommand`. So:

`menu:command` → `handleCommand` → `dispatchEvent('menu-command')` → `windowHandler` → `handleCommand` → … synchronous recursion.

**Trigger paths**

- Menu `Command > Generate Preview` (`Cmd+R`, `menu.ts:123`)
- Menu `Command > Export Current Template…` (`Cmd+E`, `menu.ts:124`)
- Menu `File > Import Template…` (`Cmd+I`, `menu.ts:31`)
- Menu `Help > About` (`menu.ts:135`)
- The "Generate preview / Export current template" entries in the command palette (`CommandPalette.tsx:80-81`)

**Consequences**

These commands arriving from the main process cause a stack overflow / freeze in the renderer; the user experiences "clicked a menu item and it hangs".

**Recommendations**

- Events exist only for "cross-component notification"; the IPC entry point and window events must not forward the same command to each other.
- Build a single command bus for the renderer: IPC → store action, or window event → store action; the two must never loop back into each other.
- Also implement the actual UI for `import-template` and `show-about` (currently there is neither an import dialog nor an About panel).

---

### FLW-02 Wizard type search causes a white screen

**Symptom**

`WizardDialog.tsx:291-299`:

```tsx
onChange={(e) => {
  const q = e.target.value.toLowerCase()
  const filtered = types.filter(...)
  setTypes(types.length > 0
    ? (e.target.value ? filtered : window.pyitol.sidecar.call('list_template_types', {})) as TemplateTypeInfo[]
    : types)
}}
```

**Problem chain**

1. The input is not a controlled component (no `value`).
2. On clearing the input, `e.target.value` is falsy → the **Promise** returned by `sidecar.call(...)` is assigned to `types`.
3. The next render executes `types.filter(...)` (`:307`) → `TypeError: types.filter is not a function`.
4. `main.tsx` has no Error Boundary → React unmounts the entire tree → **white screen**.
5. Even without crashing, every keystroke filters "the previous filtered result", so backspace can never restore the full set.

**Recommendations**

- Controlled input + a separate `query` state; filtering always based on the complete `allTypes`.
- Add an Error Boundary (at minimum wrapping the three dialogs) and provide "reload the interface".
- Give the search box a clear button and an empty-result state.

---

### CMP-01 Splitter drag is broken (closure captures stale width)

**Symptom**

`Splitter.tsx:17-45` creates `onMove` at `mousedown`, which calls the **`onResize` captured in that moment's closure**. `Workbench.tsx:239-242` passes in:

```tsx
onResize={(delta) => setLeftRailWidth(leftRailWidth + delta)}
```

`leftRailWidth` is the constant from the moment the drag began. `startPos` updates on every move, so `delta` is an **increment**; adding the increment onto the old start yields:

```
final width ≈ W0 + the increment of the last move
```

rather than `W0 + total displacement`. The user drags 100px, the panel moves a few pixels, then "sticks".

The same pattern appears in:

- Left rail: `Workbench.tsx:239-242`
- Inspector: `Workbench.tsx:274-277`
- Vertical split: `Workbench.tsx:252-258`

**Consequences**

Sizing in the three-column layout is effectively unusable — and this is one of the core interactions of a desktop workbench.

**Recommendations**

- Record `startWidth` at drag start and compute the absolute width as `startWidth + (currentX - startX)`.
- Use `pointerdown/pointermove/pointerup` + `setPointerCapture` to avoid losing events when the mouse leaves the window.
- Add keyboard resizing (`role="separator"` + arrow keys) and double-click reset.

---

### FLW-03 Multiple unprotected data-loss paths

| Path                | Location                   | Current state                                                                             |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Close window        | `src/main/index.ts`        | No `close` interception; `isDirty` is never read by the UI                                |
| Delete comment unit | `Workbench.tsx:525-535`    | Trash icon appears on hover; a single click deletes immediately, no confirmation, no undo |
| Clear entire table  | `Workbench.tsx:820-827`    | Context-menu "Clear data" executes immediately                                            |
| Paste TSV           | `Workbench.tsx:552-573`    | Pasting anywhere in the table **replaces all columns and rows**                           |
| Close wizard        | `WizardDialog.tsx:221-230` | Clicking the overlay closes immediately, all four steps of input lost                     |
| Reset inspector     | `Workbench.tsx:1004-1013`  | "Reset to defaults" wipes all parameters in one click                                     |

Meanwhile, i18n already contains `app.unsaved_title / msg / save / discard / cancel` (`i18n/index.ts:34-38`), but **no code uses them**. This means the design intent exists, while the protection mechanism was never implemented.

**Recommendations**

- Consume "dirty state" uniformly: `•` in the window title, the save button showing an enabled state, and a three-way-choice dialog on close.
- Uniformly require confirmation (or an undoable Toast) for every destructive action.
- Change table paste to "paste into the selected region / append", with a preview confirmation.

---

## 4. Layout & spacing system

### 4.1 Token namespace mismatch (root cause)

| Token category | Defined at                                            | Tailwind expects             | Result                                                                                                                     |
| -------------- | ----------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Spacing        | `--space-*` (`globals.css:163`)                       | `--spacing-*`                | No spacing classes generated                                                                                               |
| Type sizes     | `--text-body` etc. (`globals.css:91-151`, in `:root`) | `--text-*` inside `@theme`   | `text-body` / `text-caption` and similar classes do not exist; only inline `fontSize` is possible                          |
| Radii          | `--radius-*` (`globals.css:153-160`, in `:root`)      | `--radius-*` inside `@theme` | `rounded-sm/md/lg` fall back to Tailwind defaults (4/6/8px) — same names as the tokens' 8/11/18px but **different values** |
| Colors         | `--color-*` inside `@theme`                           | Matches                      | Mostly usable (but self-referencing, see TKN-01)                                                                           |

**Consequence**: the same interface simultaneously contains two radius scales, two type scales, and zero spacing scales. `rounded-sm` is 4px (Tailwind) while `--radius-sm` is 8px (token); `card` is 18px; `btn-pearl` is 11px; `btn-primary` is 9999px. **Four radius tiers with no pattern**.

### 4.2 Density: touch-screen controls on a mouse-driven tool

| Element                                                          |                        Height |   Font size | Assessment                                                       |
| ---------------------------------------------------------------- | ----------------------------: | ----------: | ---------------------------------------------------------------- |
| Global body text                                                 |                             — | 17px / 1.47 | Marketing-page body spec; too large for a desktop tool           |
| Table header action button                                       |                          26px |        12px | Height tier 1                                                    |
| Table inline editor / update-notification button                 |                          28px |   14 / 12px | Height tier 2                                                    |
| Context menu item                                                |                          32px |        14px | Height tier 3                                                    |
| Command palette row                                              |                          36px |        14px | Height tier 4                                                    |
| Wizard search box                                                |                          38px |        14px | Height tier 5 (inline override)                                  |
| `.btn-primary` / `.btn-pearl` / toolbar buttons / unit-list rows |                          44px |   17 / 14px | Height tier 6; a 44px button inside a 44px toolbar, 1px overflow |
| Toolbar itself                                                   |                          44px |           — | macOS toolbars are usually 38–44, but buttons should be 28–32    |
| Table rows                                                       | intended ≈36px / actual ≈20px |   14px mono | With `py-xs` broken, row height is only the text height          |
| Wizard type cards                                                |                         ≥60px |     14/12px | Height tier 7                                                    |

**That makes 7 control heights (26 / 28 / 32 / 36 / 38 / 44 / 60) and 5 active font sizes (10 / 12 / 14 / 17 / 21)**. A professional desktop tool should have 2–3 control heights (e.g. 24 / 28 / 32) and 2–3 type sizes (11 / 12 / 13).

### 4.3 Concrete screen-level consequences

| Screen          | Broken point                   | Result                                                                                |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Toolbar         | missing `px-sm`, 44px buttons  | hugs the left edge, overlaps the traffic lights, buttons squeezed into a row of icons |
| Left panel      | missing `p-sm` / `gap-*`       | tree info, search box and list all glued together vertically                          |
| Data table      | missing `px-sm py-xs`          | column text pressed against borders, numeric columns impossible to scan               |
| Inspector       | missing `p-sm` / `gap-xs`      | group titles press into fields, error messages press into the next field              |
| Preview         | missing `p-sm`                 | code hugs the edges, losing the "code panel" breathing room                           |
| Dialogs         | missing `px-lg py-sm` / `p-lg` | title, body and bottom buttons all hug the edges                                      |
| Welcome page    | missing `mt-xxl` / `gap-lg`    | entry cards touch each other, Recent projects presses against the hero visual         |
| Command palette | missing `pt-xxl`               | the overlay hugs the top, and the backdrop's "sunk" feel disappears                   |

### 4.4 Layout at minimum window size

`minWidth: 900` (`main/index.ts:44`). At 900px:

```
Left rail 280 + splitter 5 + inspector 360 + splitter 5 = 650
Middle data area left with 250px
```

250px must hold "# / Status / N data columns" — the table is basically unusable. The design should define:

- < 1100px auto-collapse the inspector;
- < 980px auto-collapse the left rail;
- After collapsing, provide an obvious restore affordance (currently only a toolbar icon).
- Do not use `md:` responsive breakpoints (`WizardDialog.tsx:263`): desktop window width is not the same concept as "device breakpoints"; use container queries or JS width observation.

### 4.5 Touch targets vs desktop targets

44px buttons are **too large** for mouse use; they only make sense on touch screens. What matters more on desktop:

- A hierarchical difference between "spacing inside a button group" and "spacing between groups" horizontally;
- Icon buttons at 24–28px suffice, but need a hover background and tooltip;
- Inputs at 28–32px suffice, and table inline editors 22–24px.

Currently 44px is applied uniformly to all controls, then patched locally with inline `minHeight: 26/28/32/38`, producing "seven heights in one interface".

---

## 5. Design tokens & theme system

### 5.1 TKN-01 `@theme` self-reference and duplicate definitions

`globals.css:7-23`:

```css
@theme {
  --color-canvas: var(--color-canvas);
  --color-parchment: var(--color-canvas-parchment);
  ...
}
```

The build output indeed contains a sequence of three same-name declarations:

```css
--color-canvas: var(--color-canvas); /* @theme, inside layer theme */
--color-canvas: #fff; /* :root, unlayered */
--color-canvas: #1d1d1f; /* .dark, unlayered */
```

**It works today, but only "by accident"**: unlayered styles outrank `@layer theme`, so the latter two override the self-reference. The moment someone "cleans up the duplicate definitions", `bg-canvas` instantly becomes an invalid value. This is a classic design-system landmine.

**Same-family issue**: `--color-ink-muted: var(--color-ink-muted-80)` is "an alias pointing to another alias" — the longer the chain, the more fragile.

**Recommendation**: put only real values, or only aliases, inside `@theme` (pick one), and do not redefine the same variables in `:root`; establish token linting (forbid `--x: var(--x)`).

### 5.2 TKN-02 Dark theme defects

| Problem                                                          | Evidence                                                                                                              | Impact                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.btn-utility` white on white                                    | `globals.css:340-341` uses `--color-ink` (dark is #fff) as background and `--color-body-on-dark` (#fff) as foreground | Contrast **1.00:1**, text completely invisible (the variant is currently unused — a latent defect) |
| `--color-surface-chip` defined only for light (`globals.css:59`) | `.dark` never overrides it                                                                                            | In dark mode the switch-off track stays #d2d2d7, 11.17:1 against the canvas — far too glaring      |
| Hardcoded light surfaces                                         | `rgba(0,47,167,0.06)` (inspector banner, wizard selected bar, upload progress), `rgba(229,62,62,0.08)` (error bar)    | In dark mode the blue/red tints still mix against white, producing washed-out grayish light blocks |
| Drag overlay                                                     | `App.tsx:151` `rgba(0,47,167,0.1)` + blur                                                                             | In dark mode the whole screen washes blue-white, breaking dark consistency                         |
| Upload success icon background                                   | `UploadDialog.tsx:182` `rgba(0,122,255,0.1)`                                                                          | Uses iOS blue, not the same hue as the brand IKB blue                                              |

### 5.3 TKN-03 Missing semantic colors, scattered hardcoded colors

The design system declares "do not introduce a second accent color", yet the code contains:

| Color                                         | Purpose                       | Occurrences |
| --------------------------------------------- | ----------------------------- | ----------: |
| `#e53e3e`                                     | danger/error text             |           7 |
| `rgba(229, 62, 62, …)`                        | error banner background       |           3 |
| `rgba(0, 47, 167, …)`                         | brand-blue light surface      |           4 |
| `rgba(0, 122, 255, …)`                        | upload success background     |           1 |
| `rgba(0,0,0,…)` / `0 4px 16px` / `0 8px 32px` | shadows                       |           6 |
| `#e8590c` / `#c2255c`                         | syntax highlighting           |           2 |
| `#fff`                                        | wizard step number foreground |           1 |
| `#000000`                                     | color-input fallback          |           2 |

A whole set of semantic tokens is missing: `--color-danger`, `--color-danger-surface`, `--color-success`, `--color-warning`, `--color-info`, `--shadow-1..3`, `--color-accent-surface`. Without them, dark/high-contrast themes cannot switch as a whole.

**Semantic conflict**: table status dots use "brand blue" for matched, red for missing, gray for unchecked (`Workbench.tsx:602-606`). Brand blue simultaneously carries four meanings — "clickable / selected / link / success". The semantics are overloaded.

### 5.4 Measured contrast (WCAG 2.x)

#### Light theme

| Foreground | Background | Ratio | Used for                          | Pass?                                  |
| ---------- | ---------- | ----: | --------------------------------- | -------------------------------------- |
| `#1d1d1f`  | `#ffffff`  | 16.83 | body text                         | ✅                                     |
| `#7a7a7a`  | `#ffffff`  |  4.29 | 12px explanatory text             | ❌ (<4.5)                              |
| `#7a7a7a`  | `#f5f5f7`  |  3.94 | welcome page / table-header notes | ❌                                     |
| `#7a7a7a`  | `#fafafc`  |  4.12 | list subtitles                    | ❌                                     |
| `#002fa7`  | `#ffffff`  | 10.69 | brand / links                     | ✅                                     |
| `#e53e3e`  | `#ffffff`  |  4.13 | error text                        | ❌ (12px)                              |
| `#e53e3e`  | `#f5f5f7`  |  3.79 | error text                        | ❌                                     |
| `#e8590c`  | `#ffffff`  |  3.58 | syntax-highlight section          | ❌ (12px)                              |
| `#c2255c`  | `#ffffff`  |  5.66 | highlighted color values          | ✅                                     |
| `#e0e0e0`  | `#ffffff`  |  1.32 | dividers / card borders           | ❌ (UI boundaries need 3:1)            |
| `#f0f0f0`  | `#ffffff`  |  1.14 | `.btn-pearl` border               | ❌ (button boundary indistinguishable) |
| `#fafafc`  | `#ffffff`  |  1.04 | selected/hover background         | ❌ (nearly invisible)                  |

#### Dark theme

| Foreground | Background |    Ratio | Used for                             | Pass?          |
| ---------- | ---------- | -------: | ------------------------------------ | -------------- |
| `#ffffff`  | `#1d1d1f`  |    16.83 | body text                            | ✅             |
| `#86868b`  | `#1d1d1f`  |     4.65 | secondary text                       | ✅             |
| `#86868b`  | `#272729`  |     4.12 | secondary text inside panels         | ❌             |
| `#2e5cff`  | `#1d1d1f`  | **3.28** | brand-blue text / highlighted header | ❌ (12px text) |
| `#2e5cff`  | `#2a2a2c`  | **2.79** | links inside cards                   | ❌             |
| `#2e5cff`  | `#272729`  | **2.90** | welcome-page links                   | ❌             |
| `#e8590c`  | `#2a2a2c`  |     4.00 | syntax-highlight section             | ❌             |
| `#c2255c`  | `#2a2a2c`  | **2.53** | highlighted color values             | ❌             |
| `#e53e3e`  | `#1d1d1f`  |     4.08 | error text                           | ❌ (12px)      |
| `#38383a`  | `#1d1d1f`  |     1.44 | borders                              | ❌             |
| `#2a2a2c`  | `#1d1d1f`  |     1.17 | card/selected background             | ❌             |
| `#ffffff`  | `#ffffff`  |     1.00 | `.btn-utility`                       | ❌ (invisible) |

**Conclusion**: `text-ink-subtle` and the brand blue **cannot be used safely for 12px text in either theme** — yet they happen to be the colors most used for explanatory text and syntax highlighting. `bg-pearl` as a "selected/hover" background is below 1.2:1 in both themes, i.e. no feedback at all.

**Worse still**: lists hosted in a `.card` container, such as the command palette, resolve both `--color-bg-card` and `bg-pearl` to `#2a2a2c` in dark mode (**1.00:1**). In other words, in the dark theme the command palette's keyboard-selected item is **completely invisible**; only the caret in the input field shows.

### 5.5 Native controls and `color-scheme`

- Neither `index.html` nor the CSS declares `color-scheme: light dark`.
- Result: in dark mode, native `checkbox`es, `select` dropdowns, `input[type=color]` popups and scrollbars still render light.
- No `accent-color` is set: checkboxes use Chromium's default blue, inconsistent with the IKB brand color (`UploadDialog.tsx:291-297`, `313-318`).

### 5.6 Shadows and elevation

- The only token is `--shadow-product`, with a comment stating it is "for product images only" — but do the components use it? No. The components instead use 3 hardcoded shadows plus Tailwind `shadow-md`.
- The dark theme has no corresponding shadow values; the same `rgba(0,0,0,0.12)` on #1d1d1f is nearly invisible, so overlays lack separation from the background.
- `z-index` has no system: `z-40` (context-menu overlay), `z-50` (three dialogs + update notification), `z-[60]` (drag overlay). The update notification and the dialogs share 50, so which one is on top depends on DOM order.

---

## 6. Visual hierarchy, density & brand language

### 6.1 Design provenance vs product form mismatch

`globals.css:26-37` states explicitly: the design system derives from Apple marketing-page guidelines (`DESIGN.md`), listing "desktop tool density: caption(14px) + monospace data font". Yet the actual base size is **17px** (`globals.css:244`), buttons are **44px touch-spec**, card radius is **18px**, and the primary button is a **fully-rounded pill**.

This language suits:

- Product website, purchase page, brand launch pages;
- Low-frequency, browse-oriented interfaces.

It does not suit:

- A high-frequency research workbench centered on the keyboard and data editing;
- Desktop tools used side by side with Finder / Preview / VS Code / RStudio.

**Visual consequence**: "webpage feel" overpowers "app feel": large type, large whitespace, large radii, pill buttons, and a lack of compact table and toolbar language.

### 6.2 Hierarchy and whitespace

- With spacing at zero, hierarchy can only be told apart by font size and borders; but the active sizes are only 12/14/17 (10 and 21 appear only locally), with no intermediate steps such as 11/13 — so "headings aren't heavy enough, body text isn't light enough".
- Card borders #e0e0e0 (1.32:1) nearly merge with the background; card boundaries can only rely on shadows, which appear in just two overlays.
- The whole app has almost no notion of "grouping containers" (section/panel): toolbar, table header and inspector groups are all bare elements stacked directly.

### 6.3 Radii, borders and shapes

| Element             | Radius                 | Problem                                                                                                            |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.card`             | 18px                   | dialogs, context menus and Toast all use it; 32px-tall menu items inside an 18px outer frame are out of proportion |
| `.btn-primary`      | 9999px                 | pill button; conflicts with the 11px secondary button's shape language when placed side by side                    |
| `.btn-pearl`        | 11px                   | a third shape                                                                                                      |
| `input-field`       | 8px                    | a fourth                                                                                                           |
| `rounded-sm` banner | 4px (Tailwind default) | a fifth, and same name as the token `--radius-sm: 8px` but a different value                                       |

### 6.4 Icons

- Sizes mixed: 11 / 12 / 13 / 14 / 16 / 18 / 24 / 28.
- 14px icons use the default `strokeWidth=2`, looking heavy next to 12px text; the toolbar's 14px icons are too small inside 44px buttons.
- Icon buttons have no hover background, only the native `title` tooltip (≈1s delay) — a high discovery cost.
- Some icons carry "status" (e.g. the ⚠ text glyph) rather than vector icons; cross-platform font rendering is inconsistent.

### 6.5 Welcome page

- The structure is a marketing-style hero: 64px logo → 34px title → 17px subtitle → three 240×140 cards → recent projects.
- Problems:
  - Recent projects sits under `mt-xxl` (flush against it once broken), carrying less weight than the three "New" cards; for returning users, recent projects is the primary path.
  - There is no "return to the welcome page" affordance: once in the workbench, this page is unreachable.
  - The cards only have `active:scale-95`, with no hover lift/stroke, so mouse users get no feedback.
  - The drag-drop copy promises "drop to begin", but dropping only opens a file picker (see FLW-05).
  - The default language is `en` (`i18n/index.ts:667`), so Chinese users see an English first screen on launch.

### 6.6 Syntax-highlight palette

| Class             | Light          | Dark               | Problem                                    |
| ----------------- | -------------- | ------------------ | ------------------------------------------ |
| `.hl-header`      | brand blue     | brand blue #2e5cff | dark 3.28:1, fails at 12px                 |
| `.hl-section`     | #e8590c        | #e8590c            | light 3.58, dark 4.00 on cards — both fail |
| `.hl-value-color` | #c2255c        | #c2255c            | dark 2.53, fails badly                     |
| `.hl-comment`     | #7a7a7a italic | #86868b            | light 4.29, slightly below AA              |

And the highlighting has no "theme pair" concept (one hardcoded palette for light, unchanged for dark), which shows it is scattered colors, not tokens.

---

## 7. Component & pattern consistency

### 7.1 Buttons: 4 defined, 2 used, none have hover

| Variant          | Defined               | Used   | Problem                               |
| ---------------- | --------------------- | ------ | ------------------------------------- |
| `.btn-primary`   | `globals.css:294-311` | yes    | no `:hover`; `:active` scales to 0.95 |
| `.btn-secondary` | `globals.css:317-336` | **no** | dead code                             |
| `.btn-utility`   | `globals.css:339-359` | **no** | dark-mode white on white (latent)     |
| `.btn-pearl`     | `globals.css:362-382` | yes    | border 1.14:1, no hover, 44px tall    |

**Shared problems**

- All four variants transition only `transform`; there is no hover transition for `background-color` / `border-color` / `box-shadow`.
- No `:disabled` styles; callers patch with inline `opacity: 0.5` (`WizardDialog.tsx:573`, `UploadDialog.tsx:392`); the disabled state has no cursor change and no reason hint.
- No distinction between `:focus-visible` and `:hover`; focus rings get clipped by `overflow: auto` containers.
- Button height is patched locally with inline `minHeight` (26/28/32/38/44); the variants themselves cannot express density.

### 7.2 Data table: the core screen with the most concentrated problems

| Problem                                         | Evidence                                                                                                                          | Impact                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Fake virtualization**                         | `Workbench.tsx:646-647` `rows.slice(0, 10000)`; the comment says "simple virtualization"                                          | 10k rows × N columns = hundreds of thousands of DOM nodes; scrolling and editing lag  |
| **Idle dependencies**                           | `@tanstack/react-table`, `@tanstack/react-virtual` in `package.json:10-11`, 0 references project-wide                             | sorting/filtering/column width/virtual scrolling all missing                          |
| **No sort/filter/column width**                 | the header is only static `th`                                                                                                    | research data cannot be sorted per column, missing IDs cannot be filtered             |
| **Zero cell padding**                           | `Workbench.tsx:746` `px-sm py-xs` (not generated)                                                                                 | text hugs the edges; numeric columns cannot be scanned                                |
| **Weak editing model**                          | editing only via double-click (`:769`); no Tab/arrow-key cell navigation, no row selection; Enter/Esc only work inside the editor | keyboard users cannot edit; expert users are slow                                     |
| **Paste overwrites the whole table**            | `:552-573`                                                                                                                        | pasting anywhere replaces `columns` and `data_rows`, with no confirmation             |
| **Status conveyed by color only**               | `:734-744` 8px dot + `title`                                                                                                      | color-blind/screen-reader users cannot learn the match status                         |
| **Status-color semantics overloaded**           | matched uses brand blue (`:603`)                                                                                                  | conflated with "selected/clickable"                                                   |
| **Row keys are indices**                        | `:723` `key={i}`                                                                                                                  | after insert/delete, edit focus can point at the wrong cell                           |
| **Switching units leaves editing state behind** | `editing` is component-local state                                                                                                | after switching units it may still point at the old row/column                        |
| **Horizontal scrolling loses the first column** | only `thead` is sticky top                                                                                                        | with wide tables the ID column scrolls out of view, making cross-reference impossible |

**This table is the product's "work surface", yet today it is merely a `<table>` that can display text** — lacking the sorting, filtering, column control, batch selection, virtual scrolling and keyboard operation a data tool should have.

### 7.3 Dialogs: no roles, no focus management, no Esc

The three dialogs (wizard, upload, command palette) all lack:

| Capability                              | Current state                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `role="dialog"` / `aria-modal`          | none                                                                                                             |
| `aria-labelledby` pointing at the title | none                                                                                                             |
| Initial focus                           | only the command palette auto-focuses its input; wizard/upload do not                                            |
| Focus trap                              | none; Tab can escape into the background interface                                                               |
| Focus restore after close               | none                                                                                                             |
| `Esc` to close                          | command palette only (and only while the input has focus)                                                        |
| Overlay click to close                  | yes, and it **does not check whether input already exists**                                                      |
| Stacking management                     | all three dialogs are `z-50`; `⌘K` can open the command palette on top of the wizard                             |
| Scroll locking                          | no explicit scroll lock; the root container has `overflow:hidden`, but focus can still reach background controls |

**Wizard overlay-close** (`WizardDialog.tsx:221-230`) is especially dangerous: a user who has filled in three steps loses everything with a single mis-click on the overlay, with no confirmation.

### 7.4 Command palette

- The selected state uses `bg-pearl` (light 1.04:1 / dark 1.00:1) → **when moving up/down with the keyboard, the selected item is nearly invisible**.
- No `role="combobox"/"listbox"/"option"`, no `aria-activedescendant`.
- The list has no "scroll into view" logic; beyond 6 items, keyboard selection moves out of the viewport.
- The input has `outline-none` (`:179`); there is no focus indicator anywhere in the panel.
- Choosing a "template type" entry only opens the wizard, **without preselecting that type** (`:62-70`); the user must search again inside the wizard.
- Empty results show hardcoded English "No results" (`:189-190`).
- Group order depends on object key order; the relative order of types/units/commands is unstable.

### 7.5 Inspector

- **IDL request failures are swallowed** (`Workbench.tsx:121-123`); afterwards `groups.length === 0` forever shows `common.loading` (`:1056-1060`) — the user sees "Loading" that never ends.
- Form labels are not associated with controls via `htmlFor/id` (`IdlWidget.tsx:26-47`; none of the `<label>` elements has `htmlFor`), so clicking a label does not focus it, and screen readers do not announce field names.
- Field errors render as 12px red text below (`:1094-1101`), not linked via `aria-describedby`, and contrast 4.13 fails.
- The validation banner does not use semantic colors: passing shows a light brand-blue surface, failing a light red surface, but the text remains default-colored with no icon (`:1039-1051`).
- "Reset to defaults" sits at the right of the title as a small borderless text button (`:1004-1013`), wiping all parameters in one click with no confirmation.
- Any parameter change immediately triggers preview recomputation (`Workbench.tsx:102-106`), with no debounce; every keystroke sends an IPC.
- `field.hint` is stuffed into the label row (`IdlWidget.tsx:30-34`); long hints squeeze the label, with no tooltip/wrapping strategy.

### 7.6 Switches and list controls

- The switch is a `<button>` + an absolutely positioned dot (`IdlWidget.tsx:55-78`): no `role="switch"`, no `aria-checked`, no accessible name; the off-track color is defined for the light theme only.
- `color_list` is written space-joined, but reading accepts comma separation (`field.range === 'comma'`), while **writing back always uses spaces** (`:181`, `:199`) — comma-format fields get silently rewritten.
- The same applies to `text_list`: reading accepts commas/newlines, writing back always uses `\n` (`:242`, `:252`).
- The native `input[type=color]` is 36×36 (`:129-136`); placed next to 44px inputs the baselines do not align; in dark mode the native color picker is still light.
- The number-input spin buttons are hidden globally (`globals.css:513-517`), making fine value adjustment harder in research contexts, with no +/- replacement control.

### 7.7 Splitter

- The hit area is only 5px (`Splitter.tsx:48-56`), with no extended hot zone; the mouse struggles to catch it.
- No `role="separator"`, `aria-orientation`, `aria-valuenow`; not keyboard operable.
- No double-click reset, no snapping, no min/max hints.
- `hover:bg-accent/20` relies on Tailwind's opacity syntax, but 20% brand blue is nearly invisible in dark mode.

### 7.8 Update notification (Toast)

- `UpdateNotification.tsx:34` uses `bottom-sm right-sm`; both classes are not generated → **positioning fails entirely**, and the element appears in static flow at the lower-left/document position instead of the bottom-right corner.
- `status === 'available'` shows only "new version available" and a close button. The main process has already set `autoDownload = true` and will subsequently enter the downloading state, so the missing download button is acceptable in itself; the real problem is **there is no statement that it is downloading automatically**, and once the user clicks X, `dismissed` stays true forever, so the later "download complete, restart to install" notification is never shown either (`UpdateNotification.tsx:10-22`).
- No `role="status"` / `aria-live`; progress changes are never announced to screen readers.
- There is no Toast system: save, export, delete, and import success/failure get no transient feedback whatsoever.

### 7.9 Empty / loading / error state matrix

| Screen     | Empty                                                | Loading                                                                      | Error                                                | Partial success                        |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Unit list  | wrong copy ("No unit selected", `Workbench.tsx:479`) | none                                                                         | none                                                 | —                                      |
| Data table | has CTA (acceptable)                                 | no skeleton                                                                  | none                                                 | status dot (color only)                |
| Preview    | has placeholder                                      | Loading only when `!text`; during recompute old text stays with no indicator | failure appears as `# 生成失败` text inside the code | warnings show only a count, no details |
| Inspector  | has copy                                             | permanent Loading on failure                                                 | swallowed                                            | field-level red text                   |
| Wizard     | has                                                  | text Loading                                                                 | has banner                                           | —                                      |
| Upload     | has                                                  | progress bar                                                                 | has banner                                           | success page                           |
| Update     | —                                                    | has                                                                          | has                                                  | —                                      |

**The gaps concentrate on**: error details, retry actions, skeletons/progress, and actionable lists for partial success.

---

## 8. Interaction flows & state design

### FLW-04 Preview recompute: no debounce, no race protection, no visible progress

`Workbench.tsx:81-106`:

- `generatePreview` fires whenever `selectedUnit` changes; but `updateUnit` replaces the `units` array and the `selectedUnit` object reference on every parameter/cell edit.
- Therefore **every single keystroke** issues a sidecar call.
- `previewLoading` shows only when `loading && !text` (`:872-880`); recomputation over existing text gives no indication at all.
- Multiple async calls may return out of order; a later-issued call returning first leaves the preview inconsistent with the current parameters.

### FLW-05 Drag-and-drop import is a "fake implementation"

`App.tsx:82-96`: dropping files does not read them; instead it `dispatchEvent('menu-command', 'open-project')` opens a file picker. Yet the overlay copy promises "Drop files to import" (`:165`), and the welcome page also says "drop into the window to begin" (i18n `welcome.drop_hint`). **The promise and the behavior disagree**, and the dropped files are discarded.

In addition, `handleDragLeave` tests `e.relatedTarget === null`; dragging across child elements can flicker the overlay repeatedly or leave it stuck.

### FLW-06 Wizard flow

| Problem                                  | Location                                                                                                                                     | Notes                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Search crashes                           | `WizardDialog.tsx:291-299`                                                                                                                   | see FLW-02                                                                                                  |
| "Import CSV" actually parses only by TAB | `:113` `line.split('\t')` + button copy `wizard.import_csv`                                                                                  | choosing a `.csv` file fails to parse or the whole line becomes one column                                  |
| Separator choice does not affect parsing | `:428-441` only writes the `separator` state; data is still split by TAB                                                                     | choosing COMMA makes the preview and the table disagree                                                     |
| Header row ignored                       | `:115-117` the pasted header is adopted only when `columns.length === 0`; but `columns` has already been initialized from `required_columns` | user-supplied headers never take effect; columns misalign                                                   |
| Step indicators same color               | `:255` `i === step` and `i < step` are both brand color                                                                                      | current vs completed step can only be told apart by the check icon                                          |
| Step labels hidden                       | `:263` `hidden md:inline`                                                                                                                    | below 768px window width only numbered dots remain (minWidth is 900, but this is still the wrong direction) |
| Next-step gate too strict                | `:208-212` requires `columns.length > 0 && dataRows.length > 0`                                                                              | types that need no data rows are wrongly blocked from advancing                                             |
| Color inputs unvalidated                 | `:469-480` the text box accepts any string                                                                                                   | invalid colors get passed to the engine                                                                     |
| Preview height chain broken              | `:518` `height: '100%'` but inside a `p-lg` container (height auto)                                                                          | the preview area does not fill; long content relies on outer scrolling                                      |

### FLW-07 Upload dialog

| Problem                                      | Location                                                                 | Notes                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| API Key written to disk in plaintext         | `UploadDialog.tsx:86-88` writes `/tmp/pyitol_api_key.txt`, never deletes | directly contradicts the copy "never stored" (`i18n:593`); `/tmp` does not exist on Windows |
| Template temp file at a fixed path           | `:71` `/tmp/pyitol_template_${unit_id}.txt`                              | multi-instance/multi-user conflicts, leftover files                                         |
| Directory picker uses the file-picker API    | `:42-44` `pickDataFile()` then extracts the directory                    | users are forced to pick a file first just to "pick a directory"                            |
| Upload allowed without a template            | `:389-397` enablement checks only `treePath`                             | may upload only the tree while the user believes annotations are included                   |
| No select-all/invert                         | `:303-335`                                                               | with many units, checkboxes must be ticked one by one                                       |
| Close button gives no feedback while running | `:133-136` directly returns                                              | clicking does nothing; users think the button is broken                                     |
| Success page lacks "copy link"               | `:194-200`                                                               | can only open the external link                                                             |

### FLW-08 Save and feedback

- The toolbar "Save" button is always enabled and does not reflect dirty state.
- Save/Save As/Export success shows no Toast; export failures are swallowed by `catch {}` (`Workbench.tsx:164-166`).
- The window title is fixed as "PyiTOL Studio" (`index.html:7`); it shows neither the project name nor a dirty marker.
- There is no status bar; all 26 `app.status_*` strings in i18n are unused.
- There is no "Save As" button; it is only reachable via the menu `⌘⇧S`.
- There is no "Recent projects" menu item (the File menu has only New/Open/Save).

### FLW-09 Destructive operations at a glance

| Operation                 | Confirm                   | Undo | Hint                                                                               |
| ------------------------- | ------------------------- | ---- | ---------------------------------------------------------------------------------- |
| Delete unit               | ❌                        | ❌   | hover-only icon                                                                    |
| Clear data                | ❌                        | ❌   | context menu                                                                       |
| Paste-overwrite           | ❌                        | ❌   | none                                                                               |
| Wizard close              | ❌                        | ❌   | overlay click closes instantly                                                     |
| Reset all parameters      | ❌                        | ❌   | small text button                                                                  |
| Table / parameter undo    | —                         | ❌   | the Edit menu's Undo only works on text inputs; data operations have no undo stack |
| Close window              | ❌                        | ❌   | `isDirty` unused                                                                   |
| Upload (overwrite remote) | only the `force` checkbox | ❌   | copy exists but is off by default                                                  |

---

## 9. Accessibility

### 9.1 Semantics and ARIA: renderer coverage is 0

Search results: `aria-*`, `role=`, `tabIndex` in `src/renderer` are **all 0 occurrences**.

Missing list:

- No `role="dialog"` / `aria-modal` / `aria-labelledby` (three dialogs).
- No `role="switch"` / `aria-checked` (switches).
- No `role="separator"` / `aria-orientation` / `aria-valuenow` (splitter).
- No `role="menu"` / `menuitem` (context menu).
- No `role="combobox"` / `listbox` / `option` / `aria-activedescendant` (command palette).
- No `aria-live` (update progress, validation results, upload progress, Toast).
- No `aria-invalid` / `aria-describedby` (field errors).
- No `aria-label` (icon buttons rely only on `title`, which can serve as an accessible-name fallback, but the tooltip is slow and not keyboard-triggerable).
- No `scope="col"` (table headers).
- No `aria-current` / `aria-selected` (list selection).

### 9.2 Keyboard accessibility

| Screen          | Available keyboard operations                       | Gaps                                                           |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Toolbar         | Tab-focusable                                       | no shortcut hints; buttons only have title                     |
| Unit list       | Tab reaches the delete button (but it is invisible) | no up/down selection, no Enter to open                         |
| Data table      | nearly unusable                                     | cells not focusable, no Tab navigation, no Enter to edit       |
| Inspector       | Tab reaches controls                                | labels do not focus controls; switches lack keyboard semantics |
| Splitter        | ❌                                                  | mouse only                                                     |
| Context menu    | ❌                                                  | cannot select by keyboard once open                            |
| Command palette | ↑↓ + Enter                                          | no global Esc, no scroll-follow, no screen-reader semantics    |
| Dialogs         | ❌                                                  | no Esc, no focus trap, no initial focus                        |

### 9.3 Contrast

See 5.4. **Conclusion: six color categories fail — explanatory text, error text, dark-theme brand blue, selected/hover backgrounds, button borders, and syntax highlighting** — covering large amounts of on-screen text.

### 9.4 Text selection

`globals.css:251` sets `user-select: none` on `html, body`, and never restores `user-select: text` for data areas.

Consequences:

- Users cannot copy leaf-node IDs, table cells, preview code snippets, or error messages.
- Table cells nevertheless set `cursor: text` (`Workbench.tsx:768`) — **the caret implies selectable, but it is not**.
- Only the "copy full preview" button can copy the whole block; partial copying is impossible.
- Electron's default menu Copy / Select All has no effect on these areas.

### 9.5 Motion

- No `prefers-reduced-motion` adaptation anywhere in the app.
- View switching has a 250ms full-page scale (`App.tsx:117-135`), dialogs have a 200ms scale, and buttons have an active scale.
- This is unfriendly to vestibular-sensitive users; it also slows down high-frequency switching.
- Animation curves are inconsistent: CSS `0.15s ease`, Framer default spring/ease, `0.2s`, `0.25s` all mixed.

### 9.6 Language and screen readers

- `<html lang="en">` is fixed (`index.html:2`) and does not update when switching to Chinese.
- Chinese text will be read by an English speech engine; it also affects font fallback and line breaking.
- Numbers/units have no `lang` markup (e.g. `Å`, `px`).
- Mixed Chinese/English uses negative letter-spacing (global `-0.374px`); CJK glyphs get squeezed.

### 9.7 Other

- No skip navigation/landmarks (`main` / `nav` / `aside`).
- No `prefers-contrast` / `forced-colors` adaptation.
- The focus ring's `outline-offset: 2px` gets clipped inside `overflow: auto` containers (table, inspector, lists).
- Icon status (⚠) uses text glyphs; screen readers say "warning" but the color semantics are lost.

---

## 10. macOS / Electron desktop adaptation

### 10.1 Electron's "native feel" trade-offs on macOS

Electron renders with Chromium and naturally feels closer to a "webpage" than to AppKit. The remedy is not pixel mimicry but adopting platform conventions:

- Native traffic lights + an explicit drag region + a safe zone aligned to the bar height;
- 28–32px toolbars and controls, a 13px base type size, system fonts;
- Native menus, system accent color, system scrollbars and selection color, `color-scheme`;
- Document-window semantics: title showing file name and dirty state, recent files, restore, preferences (⌘,).

The current implementation does the opposite: **the window chrome ignores the platform while the content area uses marketing-page type sizes and pill buttons** — losing both the "native feel" and the "polished web feel".

### 10.2 Baseline check as a Workbench desktop prototype

Per Stark's desktop prototype taxonomy, this product is a **Workbench**: document window + toolbar + sidebar + main work area + inspector, emphasizing a stable toolbar, keyboard-first operation, visible document state, and layout persistence. Checked item by item:

| Baseline capability                         | Current state                                                                         | Verdict |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| Document window semantics                   | a single window works, but the title does not reflect the document                    | Partial |
| Stable, clearly grouped toolbar             | 11 icon-only buttons, no text grouping                                                | Partial |
| Sidebar + content + inspector               | all three columns present, collapsible                                                | ✅      |
| Document state (name / dirty marker / save) | none                                                                                  | ❌      |
| Undo / redo                                 | the Edit menu has the role, but table/parameter edits are not wired to app-level undo | ❌      |
| Layout persistence                          | widths/collapse state never saved to disk                                             | ❌      |
| Keyboard-first                              | command palette and global shortcuts exist; table/list/splitter do not                | Partial |
| Recent files / crash recovery               | only the welcome page has recent projects; no File > Recent, no recovery              | Partial |
| Native menus & platform conventions         | all-English, `⌘R` conflict, no preferences                                            | ❌      |
| Density & native controls                   | touch density; native controls unthemed                                               | ❌      |

**Conclusion: the three-column workbench structure is right, but the three main lines a desktop workbench needs — document lifecycle, keyboard/undo, layout persistence — are all missing.**

### 10.3 Concrete platform defects

| Problem                               | Evidence                                                                                                     | Impact                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Traffic lights overlap the toolbar    | `main/index.ts:47-48` + `Workbench.tsx:329-334`                                                              | misalignment on first paint                             |
| No window drag region                 | no `-webkit-app-region` project-wide                                                                         | window cannot be moved                                  |
| Startup white flash                   | `backgroundColor: '#ffffff'` (`:49`)                                                                         | white-then-black in dark mode                           |
| Native menus all English              | `menu.ts:23-143`                                                                                             | Chinese UI + English menus                              |
| Language menu has no selected state   | `menu.ts:89-107`                                                                                             | current language unknown                                |
| Appearance menu selected state stale  | `menu.ts:55-88` `checked` computed only at build time                                                        | toggling via the toolbar does not update the menu check |
| `⌘R` conflict                         | View `role:'reload'` defaults to `⌘R`, and the Command menu also assigns `⌘R` to `generate-preview` (`:123`) | may reload the app and lose unsaved data                |
| `⌘⇧W` violation                       | the wizard uses `⌘⇧W` (`:30`)                                                                                | the macOS convention is "close all windows"             |
| No preferences                        | no `⌘,`, no Settings window                                                                                  | theme/language only reachable by cycling in the toolbar |
| No "Open Recent"                      | the File menu lacks Recent                                                                                   | a basic desktop convention is missing                   |
| No window title state                 | `index.html:7` fixed title                                                                                   | project name/dirty state invisible                      |
| DevTools/Reload exposed in production | `menu.ts:109-110`                                                                                            | accidental-trigger risk                                 |
| Directory-picking API misused         | `UploadDialog.tsx:42-44`                                                                                     | awkward interaction                                     |
| `/tmp` hardcoded                      | `UploadDialog.tsx:71,86`                                                                                     | unusable on Windows; multi-instance conflicts           |
| About panel missing                   | `show-about` unhandled and recursive                                                                         | menu item dead/hangs                                    |
| Menu item text has a leading space    | `menu.ts:137` `' iTOL Website'`                                                                              | typographic blemish                                     |

---

## 11. Internationalization & copy

### 11.1 Hardcoded English (still English in the Chinese UI)

| Copy                              | Location                                         |
| --------------------------------- | ------------------------------------------------ |
| `⚠ Engine disconnected`           | `Workbench.tsx:355`                              |
| `⚠ Python engine not connected`   | `WelcomePage.tsx:86`                             |
| `Drop files to import`            | `App.tsx:165`                                    |
| `No results`                      | `CommandPalette.tsx:190`                         |
| `preview.txt`                     | `WizardDialog.tsx:536`                           |
| `Showing {n} of {m} rows`         | `Workbench.tsx:783`                              |
| `{n} rows` / `{n} columns`        | `Workbench.tsx:521,1017`; `WizardDialog.tsx:401` |
| `{n} warning(s)`                  | `Workbench.tsx:888`                              |
| `#`, `Status`                     | table header (`Workbench.tsx:702-706`)           |
| All menu labels                   | `menu.ts`                                        |
| `TAB / COMMA / SEMICOLON / SPACE` | technical values; may remain                     |

### 11.2 Copy that contradicts the implementation

- `upload.key_hint`: `"Key is passed only to the local Python engine, never stored"` — in fact written to `/tmp` and never deleted.
- The drag hint promises "drop to begin"; in fact it opens a file picker.
- `nav.tree_meta` does string surgery with `t(...).split('·')[0]` (`Workbench.tsx:431`); any translation change breaks it.

### 11.3 Plurals, concatenation and word order

- `warning(s)`, `{count} rows` do not use i18n plural forms.
- `t('tb.theme') + ': ' + t('theme.light')` (`CommandPalette.tsx:82-84`) builds menu items by string concatenation; languages with a different word order will break.
- Many unused keys: `app.unsaved_*`, `app.status_*`, `ctx.*`, `inspector.expand_all/collapse_all/compact`, and more.

### 11.4 Chinese typography

- The global negative letter-spacing (`-0.374px`) applies to all languages.
- `--text-fine-print: 12px` has a line-height of `1.0` (`globals.css:141-143`); Chinese glyphs get clipped top and bottom, especially pinyin/Latin letters with diacritics.
- `--text-micro: 10px` (`:145-147`) is used for command-palette group titles and kbd — below the desktop readability floor.
- No Chinese punctuation squeezing / line-start-end avoidance rules; tables and buttons have no max-width or ellipsis strategy, so longer Chinese labels overflow easily (currently mostly handled by inline `truncate`, but that exists only in the unit list).
- Mixed font weights: when Chinese lacks a 600 weight, the browser synthesizes fake bold, which looks dirty.

---

## 12. Performance & frontend engineering (experience-related)

| Problem                          | Evidence                                                                                               | Experience impact                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Full render of 10k rows          | `Workbench.tsx:646-647`                                                                                | large projects lag when scrolling/editing                                   |
| Parameter keystrokes trigger IPC | `Workbench.tsx:102-106`                                                                                | one preview generation per key; input latency                               |
| Preview race                     | no request id/abort                                                                                    | stale results overwrite fresh ones                                          |
| No Error Boundary                | `main.tsx:6-10`                                                                                        | any render error produces a white screen                                    |
| Giant component                  | `Workbench.tsx` 1113 lines, containing 7 inner components                                              | coupled state, broad re-render scope                                        |
| 202 inline styles                | across the renderer                                                                                    | not reusable, cannot cover hover/focus, theme switching requires code edits |
| Idle dependencies                | `@tanstack/react-table`, `@tanstack/react-virtual`                                                     | larger bundle, capability not delivered                                     |
| Dead code                        | `btn-secondary`, `btn-utility`, `input-search`, `watchSystemTheme`, `reorderUnits`, `toggleUnitHidden` | cognitive load and misuse risk                                              |
| Bundle size                      | JS on disk 778 KB (uncompressed)                                                                       | first-parse cost; acceptable on desktop but optimizable                     |
| StrictMode double-invocation     | `main.tsx:7`                                                                                           | duplicate IPC requests in development                                       |
| Test gap                         | only E2E copy assertions                                                                               | no visual regression, no a11y tests, no component tests                     |

---

## 13. Per-file issue index

| File                       | Lines     | Issue                                                                                                    | Level       |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| `styles/globals.css`       | 7-23      | `@theme` self-references `--color-canvas`                                                                | P1          |
| `styles/globals.css`       | 26-37     | design provenance points to an external absolute path, not reproducible                                  | P3          |
| `styles/globals.css`       | 91-151    | type-size tokens not placed in `@theme`; `text-*` classes do not exist                                   | P1          |
| `styles/globals.css`       | 141-147   | 12px line-height 1.0; 10px micro size                                                                    | P2          |
| `styles/globals.css`       | 153-160   | radius tokens share names with Tailwind but different values                                             | P2          |
| `styles/globals.css`       | 163-170   | spacing tokens in the wrong namespace → all fail                                                         | **P0**      |
| `styles/globals.css`       | 239-252   | 17px body text; global `user-select: none`                                                               | P1          |
| `styles/globals.css`       | 294-382   | 4 button variants, only 2 used; no hover                                                                 | P1          |
| `styles/globals.css`       | 339-359   | `.btn-utility` dark-mode white on white                                                                  | P1 (latent) |
| `styles/globals.css`       | 368       | `.btn-pearl` border 1.14:1                                                                               | P2          |
| `styles/globals.css`       | 486-510   | highlight colors hardcoded, dark-mode contrast insufficient                                              | P2          |
| `styles/globals.css`       | 513-517   | number spinners hidden                                                                                   | P3          |
| `App.tsx`                  | 82-96     | drop does not read files, opens the picker instead                                                       | P1          |
| `App.tsx`                  | 146-173   | overlay hardcodes a light background; language read bypasses the subscription                            | P2          |
| `App.tsx`                  | 117-135   | full-page scale transition, no reduced-motion                                                            | P2          |
| `Workbench.tsx`            | 121-123   | IDL failure swallowed                                                                                    | P1          |
| `Workbench.tsx`            | 239-258   | splitter callbacks use a stale width                                                                     | **P0**      |
| `Workbench.tsx`            | 329-334   | toolbar hugs the left edge, traffic-light overlap                                                        | **P0**      |
| `Workbench.tsx`            | 503-506   | selected state `bg-pearl` 1.04:1                                                                         | P1          |
| `Workbench.tsx`            | 525-535   | unit deletion unconfirmed; hover-only                                                                    | P1          |
| `Workbench.tsx`            | 552-573   | paste overwrites the whole table                                                                         | P1          |
| `Workbench.tsx`            | 646-647   | fake virtualization of 10000 rows                                                                        | P1          |
| `Workbench.tsx`            | 723,746   | index as key; zero cell padding                                                                          | P1/P2       |
| `Workbench.tsx`            | 734-744   | status by color only                                                                                     | P1          |
| `Workbench.tsx`            | 789-831   | context menu not clamped to the viewport, no keyboard semantics                                          | P2          |
| `Workbench.tsx`            | 872-880   | recompute unindicated; errors mixed into preview text                                                    | P2          |
| `Workbench.tsx`            | 887-889   | warnings count only                                                                                      | P1          |
| `Workbench.tsx`            | 1004-1013 | full reset unconfirmed                                                                                   | P2          |
| `Workbench.tsx`            | 1039-1051 | banner hardcodes a light background                                                                      | P2          |
| `Workbench.tsx`            | 1056-1060 | IDL failure shows Loading forever                                                                        | P1          |
| `WizardDialog.tsx`         | 221-230   | overlay click discards all input                                                                         | P0          |
| `WizardDialog.tsx`         | 291-299   | search writes a Promise → white screen                                                                   | **P0**      |
| `WizardDialog.tsx`         | 113-117   | CSV parsed by TAB in practice; header ignored                                                            | P1          |
| `WizardDialog.tsx`         | 208-212   | no data rows blocks Next                                                                                 | P2          |
| `WizardDialog.tsx`         | 255       | current/completed step same color                                                                        | P2          |
| `WizardDialog.tsx`         | 428-441   | separator choice does not affect parsing                                                                 | P1          |
| `WizardDialog.tsx`         | 518       | preview height chain broken                                                                              | P2          |
| `CommandPalette.tsx`       | 159       | `pt-xxl` not generated; overlay hugs the top                                                             | P1          |
| `CommandPalette.tsx`       | 179-185   | input lacks a focus indicator                                                                            | P2          |
| `CommandPalette.tsx`       | 211-218   | selected state 1.04:1                                                                                    | P1          |
| `CommandPalette.tsx`       | 62-70     | choosing a type does not preselect                                                                       | P2          |
| `UploadDialog.tsx`         | 42-44     | file-picker API used to pick a directory                                                                 | P2          |
| `UploadDialog.tsx`         | 71,86-88  | `/tmp` plaintext key, never deleted                                                                      | P1          |
| `UploadDialog.tsx`         | 181-184   | non-brand blue success surface                                                                           | P3          |
| `UploadDialog.tsx`         | 291-318   | native checkboxes without `accent-color`                                                                 | P2          |
| `IdlWidget.tsx`            | 26-47     | labels without `htmlFor`                                                                                 | P1          |
| `IdlWidget.tsx`            | 55-78     | switch without role/aria; off state light-only                                                           | P1          |
| `IdlWidget.tsx`            | 167-268   | list write-back separator inconsistent with reading                                                      | P2          |
| `Splitter.tsx`             | 23-29     | closure stale value → drag broken                                                                        | **P0**      |
| `Splitter.tsx`             | 48-56     | 5px hot zone, no keyboard semantics                                                                      | P2          |
| `UpdateNotification.tsx`   | 34        | `bottom-sm/right-sm` not generated → positioning fails                                                   | P1          |
| `UpdateNotification.tsx`   | 10-22     | available state does not mention auto-download; after dismissal the download-complete notice never shows | P2          |
| `hooks/useMenuCommands.ts` | 94-114    | event and IPC loop → infinite recursion                                                                  | **P0**      |
| `main/index.ts`            | 47-49     | traffic-light overlap + no drag region + white startup background                                        | **P0**      |
| `main/menu.ts`             | 109-110   | Reload/DevTools exposed in production                                                                    | P2          |
| `main/menu.ts`             | 123       | `⌘R` conflicts with reload                                                                               | P1          |
| `main/menu.ts`             | 23-143    | menus all English                                                                                        | P1          |
| `main/menu.ts`             | 55-107    | menu selected state never updates                                                                        | P2          |
| `index.html`               | 2         | `lang="en"` fixed                                                                                        | P2          |
| `index.html`               | 6         | allows `style-src 'unsafe-inline'` (forced by inline styles)                                             | P3          |
| `stores/project.ts`        | 134-141   | `toggleUnitHidden` empty implementation                                                                  | P3          |
| `stores/ui.ts`             | 3,57-59   | comment claims "layout persistence" but nothing is persisted                                             | P2          |

---

## 14. Improvement roadmap

> Suggested order only; nothing was implemented in this review.

### Stage 0: make the interface "look as designed again" (P0)

1. Fix the spacing token namespace so the 190 spacings actually take effect; this is the precondition for every visual judgment.
2. Fix the `@theme` self-references and the type-size/radius namespaces, eliminating the "two scales".
3. Fix the three dialogs' focus/Esc/overlay-close policy; at minimum add an "abandon input" confirmation to the wizard.
4. Fix splitter dragging (absolute width + pointer capture).
5. Fix the menu command loop; complete `import-template` / `show-about` or remove the menu items.
6. Fix the wizard search's Promise write + add an Error Boundary.
7. macOS: reserve the traffic-light safe zone, declare the drag region, fix the `⌘R` conflict.
8. Add unsaved-data protection: window-close interception, a dirty marker in the title, confirmation for destructive operations.

### Stage 1: build a usable desktop design system (P1)

- Rewrite the density tokens: 13px base, four type sizes 11/12/13/15, three control heights 24/28/32, radii 6/10px, spacing 4/8/12/16/24.
- Complete the semantic palette: `danger / warning / success / info / accent-surface` + light/dark pairs; clean up the 8 hardcoded colors.
- Give buttons all four states: hover / focus-visible / disabled / loading; delete or implement the unused variants.
- Unify inputs, switches and checkboxes at 28–32px, and add `accent-color` and `color-scheme`.
- Change selected/hover backgrounds to neutrals ≥1.3:1 (or an 8–12% brand tint); raise explanatory text to ≥4.5:1.
- Rebuild the table: adopt `@tanstack/react-table` + `react-virtual`; add sorting/filtering/column width/frozen first column/keyboard editing.
- Unify dialogs into one component: focus trap, initial focus, Esc, `aria-modal`, scroll lock.
- Command palette selected state, scroll-follow, `aria-activedescendant`.
- Complete the state matrix: error details + retry, preview progress, warning details, Toasts.

### Stage 2: professional tool efficiency (P2)

- Unit-list keyboard navigation, drag-to-reorder (the store already has `reorderUnits`).
- Inspector: label association, field-error association, compact mode (i18n already has the `compact` key), search-match highlighting.
- Toolbar: icon + label or group overflow menu; theme/language as stateful menus.
- Welcome page: front-load recent projects, add a way back, missing-file states, remove-recent-item action.
- Menu localization, Open Recent, preferences (⌘,), About panel.
- Chinese typography: dynamic `lang` updates, zero CJK letter-spacing, line-height ≥1.5 for 12px.
- Remove `user-select: none`; restore selection/copying in data areas.

### Stage 3: polish and engineering assurance (P3)

- Unify shadows/elevation/animation curves; add `prefers-reduced-motion`.
- Bundle or clearly fall back fonts (do not pretend SF on Windows).
- Visual regression tests (Playwright screenshot diff) + axe accessibility scans + class-generation checks.
- Split `Workbench.tsx`; extract the table/preview/inspector/toolbar into separate components and hooks.

---

## 15. Design system recommendations (target state)

### 15.1 Desktop density tokens (suggested values)

| Category         | Token                                      | Suggested values                                                |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Type sizes       | `--text-2xs` / `xs` / `sm` / `base` / `lg` | 10 / 11 / 12 / 13 / 15                                          |
| Line heights     | matching                                   | 1.4 / 1.45 / 1.5 / 1.5 / 1.4                                    |
| Control heights  | `--control-sm/md/lg`                       | 24 / 28 / 32                                                    |
| Spacing          | `--spacing-1..6`                           | 4 / 8 / 12 / 16 / 24 / 32                                       |
| Radii            | `--radius-xs/sm/md/lg`                     | 4 / 6 / 8 / 10                                                  |
| Borders          | `--border-hairline/strong`                 | 1px `#d9d9de` / `#c7c7cc` (light); `#3a3a3c` / `#48484a` (dark) |
| Selected surface | `--surface-selected`                       | 8% brand (light) / 16% (dark), or neutral `#e8e8ed` / `#3a3a3c` |
| Shadows          | `--shadow-1/2/3`                           | three levels 1/2/8px; dark uses strokes + lower opacity         |

> Note: type-size, spacing and radius tokens **must be written inside `@theme`** for the `text-*` / `p-*` / `rounded-*` utility classes to be generated; written in `:root` they remain plain variables (which is exactly why the current setup fails).

### 15.2 Component contract (required for every component)

| State         | Requirement                                                              |
| ------------- | ------------------------------------------------------------------------ |
| default       | border/surface distinguishable (≥3:1 against non-interactive background) |
| hover         | background or border change, 150ms                                       |
| focus-visible | 2px ring + 2px offset, not clipped by ancestors                          |
| active        | slight scale or darken                                                   |
| disabled      | reduced contrast + `cursor: not-allowed` + reason tooltip                |
| loading       | local spinner; duplicate submission forbidden                            |
| error         | semantic color + icon + retry                                            |
| selected      | distinguishable from hover, ≥1.3:1                                       |
| empty         | explanation + primary action                                             |

### 15.3 State matrix (must be completed per page)

Each page must define at least: `empty`, `loading`, `error`, `partial`, `stale`, `destructive`.

### 15.4 Accessibility baseline (WCAG 2.1 AA)

- Text contrast ≥4.5:1 (especially 12px); UI boundaries ≥3:1.
- Fully keyboard reachable; focus visible; dialog focus trap and restore.
- Form labels associated; errors via `aria-describedby`; status via `aria-live`.
- Color never the sole carrier of information (add text/icons to the status column).
- `prefers-reduced-motion` and `prefers-contrast` adaptation.
- A dynamic `lang` attribute.

### 15.5 Design-system governance

- Tokens may be defined exactly once, inside `@theme`; forbid `--x: var(--x)`.
- CI check: every class name used in the source must exist in the build output.
- No hardcoded colors/shadows/type sizes inside components; enforce with ESLint rules or custom Stylelint rules.
- Token changes must update both light and dark sets and re-run the contrast script.

---

## 16. Appendix

### Appendix A: Reproduction commands

**A.1 Verify whether spacing classes were generated**

```bash
# both commands should print nothing; any output means the corresponding class/variable was generated
grep -o "\.p-sm{" out/renderer/assets/index-1_xhN5jD.css
grep -o -- "--spacing-sm" out/renderer/assets/index-1_xhN5jD.css
```

**A.2 Class-name reverse-lookup script (used in this review)**

```js
import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync('out/renderer/assets/index-1_xhN5jD.css', 'utf8')
const files = [](function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) walk(p)
    else if (/\.(tsx|ts)$/.test(f.name)) files.push(p)
  }
})('src/renderer/src')

const used = new Set()
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g
  let m
  while ((m = re.exec(src))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    for (const token of raw.split(/\s+/)) if (token) used.add(token)
  }
}

const escape = t => t.replace(/[:/\[\].%(),#!]/g, c => '\\' + c)
for (const token of used) {
  if (!css.includes('.' + escape(token))) console.log('MISSING', token)
}
```

**A.3 Contrast calculation**

```js
const lin = c => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const L = hex => {
  /* 0.2126R + 0.7152G + 0.0722B */
}
const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05)
```

### Appendix B: complete list of non-generated spacing class names

| Class name | Count | Class name  | Count |
| ---------- | ----: | ----------- | ----: |
| `gap-xs`   |    35 | `px-sm`     |    25 |
| `py-xs`    |    20 | `gap-xxs`   |    15 |
| `mb-sm`    |    11 | `mb-xs`     |    10 |
| `mt-xxs`   |     9 | `mt-xs`     |     7 |
| `p-sm`     |     7 | `p-lg`      |     7 |
| `py-xxs`   |     5 | `px-lg`     |     5 |
| `py-sm`    |     5 | `mr-xxs`    |     4 |
| `px-xs`    |     4 | `mt-sm`     |     4 |
| `gap-sm`   |     3 | `mx-xs`     |     3 |
| `mt-lg`    |     2 | `mt-xxl`    |     2 |
| `pt-xxl`   |     1 | `mb-xl`     |     1 |
| `gap-lg`   |     1 | `pt-sm`     |     1 |
| `mb-lg`    |     1 | `py-lg`     |     1 |
| `p-xs`     |     1 | `my-xxs`    |     1 |
| `mx-sm`    |     1 | `bottom-sm` |     1 |
| `right-sm` |     1 | —           |     — |

Total: **31 class names / 192 usages** (29 spacing classes, 190 usages + 2 positioning classes, 2 usages).

### Appendix C: hardcoded color inventory

| Value                                                       | Where it appears (examples)                                                        | Replace with                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| `#e53e3e`                                                   | table missing status, preview warnings, field errors, upload errors, update errors | `--color-danger`                    |
| `rgba(229, 62, 62, 0.08)`                                   | inspector banner, wizard error, upload error                                       | `--color-danger-surface`            |
| `rgba(0, 47, 167, 0.06)`                                    | inspector banner, wizard selected bar, upload progress                             | `--color-accent-surface`            |
| `rgba(0, 47, 167, 0.1)`                                     | drag overlay                                                                       | `--color-accent-surface-strong`     |
| `rgba(0, 122, 255, 0.1)`                                    | upload success icon background                                                     | `--color-accent-surface`            |
| `#e8590c` / `#c2255c`                                       | syntax highlighting                                                                | highlight tokens (light/dark pairs) |
| `#ffffff`                                                   | wizard step numbers                                                                | `--color-on-primary`                |
| `#000000`                                                   | color-input fallback                                                               | `--color-ink` or a neutral color    |
| `0 4px 16px rgba(0,0,0,.12)` / `0 8px 32px rgba(0,0,0,.16)` | context menu, command palette, Toast                                               | `--shadow-2` / `--shadow-3`         |

### Appendix D: Glossary

- **Token**: the smallest unit of a design variable, such as a color, type size, spacing, radius or shadow.
- **Namespace**: in Tailwind v4, the token prefix that decides whether a family of utility classes is generated, e.g. `--color-*`, `--spacing-*`, `--text-*`, `--radius-*`.
- **P0/P1/P2/P3**: see 2.3.
- **Fake virtualization**: truncating the data volume without windowed rendering; the DOM node count still scales with the data volume.

---

**End of report.**

> Note: this report is based on static analysis of the source code and build output; the app was not run and no code was modified. For next steps, follow the Stage 0 order in Section 14 item by item; after each fix, re-run the Appendix A scripts to regression-check class generation and contrast.
