---
version: 1
slug: "src-app-home-products-slug-page-tsx"
primary_target: "src/app/(home)/products/[slug]/page.tsx"
related_targets: ["src/app/(home)/page.tsx"]
---

Scope: coss.com's marketing surfaces in apps/site: home, /products, all 18 product pages, solutions, compare, pricing, about, changelog, contact, status, tools, legal, shared header and footer. Docs, kloq and Shipyard keep their own look.
Mode: Persuade.
Audience: a developer evaluating coss.com against Resend, Twilio, Svix and similar. Action: sign up or read the docs after seeing the product work.
Proof: the real API, SDK calls, event names, statuses, limits and catalog prices. Demo data carries no label, by the user's decision. Customer names on the home page were supplied by the user (permission to be confirmed before launch); no testimonials or benchmarks exist.
Constraints: copy may be cut hard; detail stays in the docs and the .md twins. Prices and limits are never typed by hand outside the catalog's components. Static pages. No eyebrows above headings.
Quality bar: Stripe, Linear and Resend.
Later decisions by the user (2026-11-04): old title structure, no "illustrative" sentence, Shipyard and kloq off the home page, one vendor told as onboarding, subprocessor, bill and diagnostics.
Decisions: the user took the standing exit (category standard) with the steer "play it straight but use the COSS UI with the tweaks we use in the app to make it more tactile". The sketch's dark and violet palette was overruled: colour matches the app (light and dark follow the system, neutral surfaces, hue only for status and product tiles).

## Direction contract

THESIS: The API-company product page, played straight and executed at Stripe, Linear and Resend's level. The product is on the page, working. It refuses the old ruled catalog: isometric boxes, hairline sheets and rows of text cells.

OWN-WORLD: The dashboard's own finish on coss ui: lit top edges, keycap outline buttons, shaded wells, raised tab indicators, muted trays holding raised cards, pill badges, Cal Sans and Paper Mono. Neutral surfaces in both themes; hue only from status dots and the app's product tiles.

STORY: The visitor sees what the product does in seconds, watches it run, sees that it shares one key with every other product, then signs up or opens the docs. Short copy; depth lives in docs.

FIRST VIEWPORT: Breadcrumb on inner pages. A large Cal Sans headline on the left and, on the right, its one sentence with the sign-up button and an outline action, as on the old site (the user preferred this to a centred hero). Content is on the header's width. The stage rises into the fold, with customer logos under it on the home page: checked SDK code on the left with its call in the product's colour, the product's real interface on the right.

FORM: Category standard, chosen by the user over the roll's assigned direction. Signature interaction: the demos animate on their own when they come into view or their tab opens, with statuses moving on as events arrive; there is no Send button, since the message in the sample has already been sent. The home stage's tabs switch product while the key stays the same. Motion grammar: the dashboard's rise and pop, one beat per event. seed:646d9aa531900c47

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
