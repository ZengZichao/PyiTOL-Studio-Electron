# Design System

[English](../en/design-system.md) | [简体中文](../zh/design-system.md)

The visual grammar of PyiTOL Studio: color, typography, spacing, elevation, and component conventions. The frontend design review report ([en](frontend-design-review.md) / [zh](frontend-design-review.md)) audits how far the implementation currently adheres to it.

## Design authority

The system derives from the Apple DESIGN.md, with four explicit overrides agreed for this product:

1. **Brand colour** — International Klein Blue replaces the system blue as the single accent.
2. **Monochrome tree mark** — the app icon/tree mark is single-colour, no gradients.
3. **Dual themes** — light and dark are first-class, not an inversion of one another.
4. **Desktop density** — control metrics target mouse/keyboard use, not touch.

## Colour

| Token         | Light                                        | Dark            | Use                                      |
| ------------- | -------------------------------------------- | --------------- | ---------------------------------------- |
| Accent        | `#002FA7` (IKB)                              | `#2e5cff`       | primary actions, selection, focus, links |
| Ink           | near-black                                   | near-white      | primary text                             |
| Secondary ink | —                                            | —               | captions, metadata                       |
| Surface       | white / light gray steps                     | dark gray steps | window, cards, panels                    |
| Semantic      | success / warning / danger (see review §5.3) |                 | status only                              |

Rules:

- **One accent colour.** No second brand colour, no gradients, no coloured chrome.
- Semantic colours are reserved for status; never use the accent to signal error or success.
- All colors must come from theme tokens (Tailwind v4 `@theme` variables) — hardcoded hex values in components are a review finding (TKN-03).

## Typography

- System font stack (`-apple-system`, SF Pro on macOS) — no bundled webfonts.
- Sizes come from the token scale (`--text-*`); avoid ad-hoc px values.
- Tabular numerals for table cells; monospace stack for template text and Newick content.

## Spacing & shape

- Spacing uses the Tailwind v4 token namespace (`--spacing-*`). The review (LAY-01) documents that utility generation for this namespace is currently broken — values must be generated from tokens, not magic numbers.
- Radii: small controls get the small radius token; cards and dialogs the large one. No mixed radii inside one component.
- Borders over shadows for separation on chrome; shadows are reserved for floating layers (context menu, command palette, toasts — `--shadow-2` / `--shadow-3`).

## Themes

- Three modes: `light`, `dark`, `system` (follows `nativeTheme`, changes pushed to the renderer via `platform:theme-changed`).
- `color-scheme` must be set so native controls (inputs, scrollbars, dialogs) match the active theme (review §5.5).
- Contrast: text pairs should meet WCAG 2.x AA (4.5:1 normal text, 3:1 large text); the review §5.4 contains the measured values per token pair.

## Components

- **Buttons** — one primary style (accent fill), one secondary (quiet), icon buttons; every style needs hover/active/focus-visible states (review §7.1).
- **Dialogs** — `role="dialog"`, `aria-modal`, focus trap, Esc to cancel, restore focus on close (review §7.3).
- **Data table** — the core screen: row height and padding follow desktop density, numeric columns right-aligned, sticky header (review §7.2).
- **Command palette (⌘K)** — fuzzy filter, keyboard-first, Esc closes.
- **Toasts / status** — transient feedback appears in the status bar or a toast; errors are dismissible and copyable.
- **States** — every async surface defines empty / loading / error / success (review §7.9 matrix).

## Accessibility baseline

- Semantic HTML first; ARIA only where semantics are insufficient (review §9.1: current renderer ARIA coverage is 0).
- Full keyboard reachability; visible focus rings on the accent colour.
- Do not convey state by colour alone.

## Reference implementation notes

- Theme tokens live in `src/renderer/src/styles/globals.css` (Tailwind v4 `@theme`).
- The per-file audit of where the implementation currently diverges is [the design review report](frontend-design-review.md); its §14 roadmap is the fix order.
