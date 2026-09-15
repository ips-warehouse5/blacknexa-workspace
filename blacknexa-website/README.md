# BlackNexa — Website

Production Next.js rebuild of the BlackNexa marketing site, based on the
`blacknexa-site.html` design reference. SSR-first (App Router + Server
Components), with Client Components limited to genuinely interactive
pieces (mobile menu, theme toggle, forms, FAQ accordion, referral copy
button, scroll-reveal).

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4, driven by centralized design tokens (`src/styles/tokens.css`)
- `next/font` for Spectral (serif) + Work Sans (sans)

## Getting started

```bash
yarn install
yarn dev
```

Open http://localhost:3000.

> npm installs are blocked by this environment's script policy; use
> `yarn` for all dependency management here.

## Theming

- **Default:** Dark mode, Warm Gold accent.
- **Alternate:** Light mode, Signal Blue accent.

Theme is applied via `data-theme="dark" | "light"` on `<html>`, set
before first paint by an inline script (`src/lib/theme.ts`) to avoid a
flash of the wrong theme, and persisted to `localStorage`. All theme
color tokens live in `src/styles/tokens.css`; components never
hardcode theme-specific colors.

## Project structure

```
src/
  app/            routes: /, /contact, /privacy, /terms, /disclaimer, sitemap, robots
  components/
    layout/       header, footer, mobile menu
    theme/        theme provider + toggle
    sections/     one component per homepage section
    forms/        waitlist + contact forms (client)
    legal/        shared legal document layout
    ui/           button, container, section heading, logo, image placeholder
    icons/        single Icon component, path data by name
  data/           site content (nav, features, faq, news, legal) — no invented content
  lib/            theme bootstrap script
  styles/         design tokens
```

## Content & assets

All copy is taken directly from the supplied `blacknexa-site.html`.
Where the source design referenced imagery or video that was not
supplied, this build renders a clearly labeled `ImagePlaceholder`
instead of inventing or substituting stock/brand assets.

The News section ships with an empty `newsArticles` array and renders
the documented empty state; see `src/data/news.ts` for the shape ready
for the future News API.

## Integration points

Search for `TODO:` to find every place a real backend call needs to
replace a mocked one:

- `src/components/forms/waitlist-form.tsx` — waitlist signup
- `src/components/forms/contact-form.tsx` — contact submission
- `src/data/news.ts` — news feed

## Environment

Copy `.env.example` to `.env.local` before wiring up real API
endpoints.
