# PWA design system (native parity)

**Source of truth:** `apps/mobile` (read-only reference). PWA tokens are duplicated in `apps/pwa/src/design-system/`.

## Token files

| File | Purpose |
| --- | --- |
| `src/design-system/palette.ts` | Hex palette (light + dark) — mirrors `apps/mobile/src/theme/palette.js` |
| `src/design-system/tokens.css` | RGB channel CSS variables for Tailwind + `.dark` |
| `src/design-system/layout.ts` | Radius, spacing, z-index, overlay scrim |
| `src/styles/index.css` | Tailwind `@theme` semantic colors + `shadow-card` / `shadow-raised` |
| `src/theme/ThemeProvider.tsx` | Resolves light/dark; exposes `useColors()` / `getColors()` |

## UI kit (native reference → PWA)

| Native (`apps/mobile/src/components/ui/`) | PWA |
| --- | --- |
| `Button.tsx` | `ui/Button.tsx` |
| `TextField.tsx` | `ui/TextField.tsx` |
| `Card.tsx` | `ui/Card.tsx` |
| `Badge.tsx` | `ui/Badge.tsx` |
| `Header.tsx` | `ui/Header.tsx` |
| `StateView.tsx` | `ui/StateView.tsx` |
| `ToastProvider.tsx` | `ui/ToastProvider.tsx` (top placement, 3500ms) |
| `IconButton.tsx` | `ui/IconButton.tsx` |
| Bottom sheets (gorhom) | `ui/BottomSheet.tsx` |

Notification inbox chips use `getColors()` via `features/notifications/presentation.ts` (same mapping as native).

## shadcn/ui

PWA wraps [shadcn/ui](https://ui.shadcn.com) on Active tokens (`components.json`).

- Primitive: `src/components/ui/primitives/button.tsx`
- Adapter: `src/components/ui/Button.tsx`
- Auth CTAs: `src/components/auth/AuthFooterButton.tsx`

Shadcn semantics (`--primary`, `--background`, …) are defined in `tokens.css` and exposed via `index.css` `@theme`.

## Remaining screen-level gaps

See `docs/design-parity.md` — conversation bubbles, request-flow sheets, profile catalogue, wallet locked-funds sheet, etc. still use page-level markup until ported to shared components.
