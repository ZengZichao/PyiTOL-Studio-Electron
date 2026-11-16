# DESIGN.md — Design Authority

This document is the single design authority for PyiTOL Studio. It records
the visual grammar and the decisions that derive from it; the detailed,
token-level specification lives in
[docs/en/design-system.md](docs/en/design-system.md) (简体中文：
[docs/zh/design-system.md](docs/zh/design-system.md)).

## Provenance

The system derives from Apple's human-interface design language, with four
explicit overrides agreed for this product:

1. **Brand colour** — International Klein Blue (`#002FA7` light / `#2e5cff`
   dark) replaces the system blue as the single accent.
2. **Monochrome tree mark** — the app icon / tree mark is single-colour, no
   gradients.
3. **Dual themes** — light and dark are first-class, not an inversion of one
   another.
4. **Desktop density** — control metrics target mouse/keyboard use, not
   touch.

## Principles

- **One accent colour.** No second brand colour, no gradients, no coloured
  chrome. Semantic colours are reserved for status.
- **System-native type.** System font stack (SF Pro on macOS); no bundled
  webfonts. Tabular numerals in tables, monospace for template text and
  Newick content.
- **Token-driven.** Colour, spacing, and radii come from Tailwind v4
  `@theme` tokens in `src/renderer/src/styles/globals.css`; hardcoded values
  in components are a review finding.
- **Borders over shadows** for separation on chrome; shadows are reserved
  for floating layers (context menu, command palette, toasts).
- **Accessible by default.** Semantic HTML first, ARIA only where semantics
  are insufficient; full keyboard reachability; visible focus rings; text
  pairs meet WCAG 2.x AA (4.5:1 normal, 3:1 large); never convey state by
  colour alone.

## States

Every async surface defines empty / loading / error / success states. Every
button style has hover / active / focus-visible. Dialogs trap focus, close
on Esc, and restore focus on close.

## Reference

The per-file audit of where the implementation diverges from this document
is [docs/en/frontend-design-review.md](docs/en/frontend-design-review.md);
its roadmap section is the fix order.
