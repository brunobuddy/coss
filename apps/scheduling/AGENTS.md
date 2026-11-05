# apps/scheduling — the hosted scheduling pages

A host's page (`/h/<session>`), the booker (`/b/<session>`) and an attendee's manage page (`/m/<session>`). Next.js 16
(:3005 locally), standalone image, on **a registrable domain of its own**, `cossbook.com` (never under coss.com, which
would make it same-site with the dashboard). Product rules are in `packages/scheduling/AGENTS.md`.

- A thin client of the API's `/scheduling/client/*`: it holds no keys, decrypts nothing and calls no provider, so it
  needs no egress. Its only database read sets `frame-ancestors` (`src/proxy.ts`), from the non-secret session id.
- The token is in the URL's fragment. The page moves it to `sessionStorage` and strips it from the address bar. Never
  add a cookie, or a token in a path or query.
- Connecting Google or Microsoft opens a window, since providers refuse to be framed, and that's why COOP is
  `same-origin-allow-popups`.
- Embedding pages get `postMessage`s (`src/lib/embed.ts`) with ids and statuses only. Keep them in step with
  `packages/sdk/src/scheduling.ts`.
- Times are UTC instants from the API, shown in the browser's zone. This app never works out what's available.
- A page is the customer's: their logo or name (`BrandMark`) and accent (`useAccentColor`, which also picks the text
  color), and nothing of coss.com's but `CossAttribution` ("Scheduling by coss.com", a plain link below the page, on
  plans without `schedulingWhiteLabel`: never an image or anything else that loads). The logo arrives as a data URL in `/session`, so the CSP stays free of other hosts.
- The Google button (`continue-with-google.tsx`) follows Google's branding rules, and its OAuth app passed verification:
  keep the white fill, the `#747775` border, the `#1F1F1F` Google Sans Medium 14/20 text, the padding and the logo. Its
  height and corners match the buttons beside it, which the rules leave open.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
