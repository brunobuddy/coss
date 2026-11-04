---
name: coss.com
description: The dashboard's tactile finish at marketing scale, with the product on the page and working.
colors:
  background: "oklch(100% 0 0)"
  background-dark: "color-mix(in srgb, oklch(14.5% 0 0) 95%, white)"
  foreground: "oklch(26.9% 0 0)"
  foreground-dark: "oklch(97% 0 0)"
  card: "oklch(100% 0 0)"
  card-dark: "color-mix(in srgb, color-mix(in srgb, oklch(14.5% 0 0) 95%, white) 98%, white)"
  muted: "rgb(0 0 0 / 4%)"
  muted-dark: "rgb(255 255 255 / 4%)"
  muted-foreground: "color-mix(in srgb, oklch(55.6% 0 0) 90%, black)"
  muted-foreground-dark: "color-mix(in srgb, oklch(55.6% 0 0) 90%, white)"
  border: "rgb(0 0 0 / 8%)"
  border-dark: "rgb(255 255 255 / 6%)"
  input: "rgb(0 0 0 / 10%)"
  input-dark: "rgb(255 255 255 / 8%)"
  primary: "oklch(26.9% 0 0)"
  primary-dark: "oklch(97% 0 0)"
  primary-foreground: "oklch(98.5% 0 0)"
  primary-foreground-dark: "oklch(26.9% 0 0)"
  ring: "oklch(70.8% 0 0)"
  ring-dark: "oklch(55.6% 0 0)"
  sidebar: "oklch(98.5% 0 0)"
  sidebar-dark: "color-mix(in srgb, oklch(14.5% 0 0) 97%, white)"
  stage-well: "color-mix(in srgb, oklch(26.9% 0 0) 2.5%, transparent)"
  stage-well-dark: "color-mix(in srgb, black 16%, transparent)"
  terminal: "#282a30"
  terminal-text: "#e6e6e6"
  terminal-bright: "#ffffff"
  terminal-dim: "#8b8c91"
  terminal-tool: "#4eba65"
  terminal-mode: "#b1b9f9"
  terminal-band: "rgb(255 255 255 / 8%)"
  terminal-rule: "rgb(255 255 255 / 24%)"
  success: "oklch(69.6% 0.17 162.48)"
  success-foreground: "oklch(50.8% 0.118 165.612)"
  success-foreground-dark: "oklch(76.5% 0.177 163.223)"
  info: "oklch(62.3% 0.214 259.815)"
  info-foreground: "oklch(48.8% 0.243 264.376)"
  info-foreground-dark: "oklch(70.7% 0.165 254.624)"
  warning: "oklch(76.9% 0.188 70.08)"
  warning-foreground: "oklch(55.5% 0.163 48.998)"
  warning-foreground-dark: "oklch(82.8% 0.189 84.429)"
  destructive: "oklch(63.7% 0.237 25.331)"
  destructive-dark: "color-mix(in srgb, oklch(63.7% 0.237 25.331) 90%, white)"
  destructive-foreground: "oklch(50.5% 0.213 27.518)"
  destructive-foreground-dark: "oklch(70.4% 0.191 22.216)"
  tile-email: "oklch(70.5% 0.213 47.604)"
  tile-marketing: "oklch(65.6% 0.241 354.308)"
  tile-inboxes: "oklch(60.6% 0.25 292.717)"
  tile-sms: "oklch(69.6% 0.17 162.48)"
  tile-verify: "oklch(68.5% 0.169 237.323)"
  tile-sign: "oklch(58.5% 0.233 277.117)"
  tile-forms: "oklch(76.9% 0.188 70.08)"
  tile-scheduling: "oklch(62.3% 0.214 259.815)"
  tile-hooks: "oklch(70.4% 0.14 182.503)"
  tile-risk: "oklch(64.5% 0.246 16.439)"
typography:
  display:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  close:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title-small:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.375
  body:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.375
  interface:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label:
    fontFamily: "Cal Sans, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.06em"
  code:
    fontFamily: "Paper Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  value:
    fontFamily: "Paper Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  pill: "9999px"
spacing:
  grid-gap: "12px"
  tray-padding: "20px"
  container-inline: "24px"
  content-width: "1416px"
  band-gap: "56px"
  band-block: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.interface}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.interface}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 20px"
  button-small:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.interface}"
    rounded: "{rounded.lg}"
    height: "28px"
    padding: "0 10px"
  tray:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
  tray-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.tray-padding}"
  stage-code:
    backgroundColor: "{colors.stage-well}"
    textColor: "{colors.foreground}"
    typography: "{typography.code}"
  terminal-panel:
    backgroundColor: "{colors.terminal}"
    textColor: "{colors.terminal-text}"
    typography: "{typography.value}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  badge:
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "18px"
    padding: "0 8px"
  product-tile:
    rounded: "{rounded.xl}"
    size: "48px"
  link-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
---

# Design System: coss.com

## Overview

**Creative North Star: "The Dashboard, at Marketing Scale"**

The marketing pages are the API-company product page played straight, and they sell by showing the product working. The hero sets a large headline on the left and its sentence and actions on the right, over a stage where checked SDK code sits beside the interface it produces. Below it, short claims sit next to small pieces of the real interface, built the way the dashboard builds them. Paragraphs give way to product; detail lives in the docs and the `.md` twins.

The world is the dashboard's own finish on coss ui, shared through one stylesheet so the site and the app feel like one product. Light falls from above: raised things catch it, wells are shaded just inside their top edge, and buttons give a little under the finger. Surfaces are neutral and follow the theme, apart from always-dark terminal panels, and the page gets its life from that tactility rather than from colour. Sections are separated by space and by muted bands, never by a ruled sheet.

This replaces the former parts catalog. Isometric boxes, hairline sheets and rows of text cells are gone from the coss.com marketing pages. Three areas sit outside this file's look: Shipyard keeps its ruled sheet and drawings (including the dot grid, its one amber lamp and its own motion), kloq keeps its brand colour and its own stylesheet, and the docs keep their own layout, code colours and rails while sharing the same finish. Shipyard and kloq have no section on the home page; the footer links to them.

**Key Characteristics:**

- The product is on the page: a tray holding the real interface takes the place of a paragraph.
- Light from above: lit top edges, keycap outline buttons, shaded wells, raised tab indicators.
- Neutral surfaces following the system, with terminal panels always dark; hue only from status and each product's tone.
- Cal Sans carries everything but code and measured values, which are Paper Mono.
- Demos play themselves by CSS, one beat per event; there is nothing to press.

## Colors

A neutral palette from coss ui's tokens, resolved separately for each theme, with two small and meaningful sources of hue. Every token ending in `-dark` is the same role under the `dark` class.

### Primary

- **Graphite** (`primary`): the sign-up button and the `en`-style selected badge. In dark it inverts to near-white, so the primary action is always the heaviest thing in a view without needing a hue.

### Tertiary

- **Status Set** (`success`, `info`, `warning`, `destructive`, each with a `-foreground`): the dots beside statuses and event names, the quiet status badges (the tone at 8% behind its foreground, 16% in dark), and checks such as a vendor review's. Neutral statuses such as `queued` use muted foreground at 56%.
- **Product Tile Tones** (`tile-email` through `tile-risk`): each product's icon tile, matching the dashboard's rail. The tone sits at 12% behind its 600-step icon, with a 20% inset ring; forms uses 14% and 25% with a 700-step icon. Dark uses the 400-step icon. Related products share a tone (inbound email, SMTP and email for platforms are `tile-email`; rate limiting is `tile-risk`). Platform, security, agents and SDKs take the neutral tile, muted with a border ring. The same tone colours the SDK call in a stage's code: the 600 step in light (700 for forms) and the 400 step in dark, over a 12% wash. Neutral-tile products keep the call in the foreground.

### Neutral

- **Page White / Near Black** (`background`): the page and its raised cards.
- **Soft Ink** (`foreground`): headings, body and code, never pure black or white.
- **Lifted Black** (`card`): in dark, cards step up from the page by a sliver of white; in light they match it and rely on their border.
- **Faint Wash** (`muted`): a 4% tint of the theme's opposite. Trays use it at 72%, muted bands at 80%, card insets at 64%, and the footer at 32%.
- **Quiet Ink** (`muted-foreground`): ledes, supporting text, timestamps, table heads.
- **Hairline** (`border`, `input`): alpha borders that hold in both themes. Inputs and outline buttons run slightly heavier than cards.
- **Header Glass** (`sidebar`): the sticky header at 80% with a light blur.
- **Shaded Well** (`stage-well`): the stage's code cell, tinted with foreground in light and shaded with black in dark.
- **Terminal Slate** (`terminal`, `terminal-text`, `terminal-bright`, `terminal-dim`, `terminal-band`, `terminal-rule`): agent sessions, the same in both themes, taken from Claude Code's own look. `terminal-tool` marks tool lines and `terminal-mode` the status line.

### Named Rules

**The Two Sources Rule.** Hue comes only from status and a product's tone, which appears on its tile and on the SDK call in its stage. Nothing else on a marketing page gets a colour, including buttons, links, headings, other code and backgrounds.

**The System Decides Rule.** Light and dark follow the operating system. There is no theme switcher, and every piece must hold in both.

**The Terminal Rule.** A terminal panel is always dark, because it is a terminal. It is the one exception to neutral surfaces following the theme, and to the Two Sources Rule: its window lights, tool dots and mode line are the app's own colours. It is for agent sessions only.

**The Grayscale Comparison Rule.** Comparison pages stay grayscale, with no win or loss colours and no check or cross marks. The other service's column is simply quieter text.

## Typography

**Display Font:** Cal Sans (variable, self-hosted, weights 400 to 700)
**Body Font:** Cal Sans
**Label/Mono Font:** Paper Mono (regular only, self-hosted)

**Character:** Cal Sans sets everything from a 72px headline to a table cell, and its optical axis gives headlines the display drawing, so one family carries the whole page. Paper Mono is reserved for the things a developer would copy or measure.

### Hierarchy

- **Display** (600, fluid from 40px to 72px, 1, -0.02em): the hero's one headline, balanced, on the left 8 of 12 columns.
- **Close** (600, fluid from 36px to 60px, 1.02, -0.015em): the closing call to action, on the left 8 of 12 columns.
- **Headline** (600, 30px rising to 40px at `sm`, 1.1 at the large size): section headings, stacked over their sentence.
- **Title** (600, 24px rising to 30px): the claim on a feature row.
- **Title Small** (600, 20px): the claim on a smaller feature cell.
- **Lede** (400, 18px, 1.375): one sentence beside a heading and the body of a feature row. Pretty-wrapped, and within 36rem in a section's head.
- **Body** (400, 16px, 1.375): card text and FAQ answers.
- **Interface** (500, 14px): tray titles and button labels. Table and dot text runs at the same size in regular weight.
- **Label** (500, 11px, 0.06em, uppercase): table column heads, from the shared finish. It heads columns and nothing else.
- **Code** (Paper Mono, 14px, 1.6): the stage's checked sample, 11px on phones so the call stays on screen.
- **Value** (Paper Mono, 13px): event names, limits, endpoints, DNS records and terminal sessions. Timestamps, SDK calls in tray headers and the agent prompt step down to 12px. Numbers are tabular.

### Named Rules

**The No Eyebrows Rule.** Nothing sits above a heading: no kicker, no eyebrow, no small label in caps or mono. A heading starts its own block. The breadcrumb is real navigation, and it sits above the hero's tile, not against a heading.

**The Copyable Mono Rule.** Mono means code, SDK names, event names, measured values and keys. Prose is never set in it.

## Layout

Marketing pages, the header and the footer line up on one content width (1416px, inset 16px, 24px on the page from `lg`). Sections are `Band`s: one idea with 64px of block padding, 96px from `sm`, and 40px to 56px between the heading and what follows. A run of sections may be set apart with a muted band.

Heads sit on the left, never centred. The hero spans 8 and 4 columns at `lg`: optional tile and headline on the left, the sentence and actions on the right, aligned to the headline's last line, with the stage or another tray below at the full content width. A section's head stacks its sentence directly below the heading, with any link onward inline at the end of the sentence. It has no buttons. The close repeats the hero's 8 and 4 split, with `CopyPrompt` across its full width below. All of them stack below `lg`. Product and solution pages open with a breadcrumb above the hero.

Features use a 12-column grid at `lg`. The first two highlights are rows split 5 and 7, alternating sides, with 48px between columns and 64px to 96px between rows. The rest sit in a two-column grid with the claim under the piece. Grids of cards use a tight 12px gap, and size follows weight where products differ: leading products span 7 and 5 columns rather than filling a uniform grid. The FAQ splits 4 and 8.

The stage stacks below `lg`, code first, and its code and interface both start at the top of their cells. On phones the copy button leaves the code well, and comparison rows become label-then-values blocks.

**The Space Not Rules Rule.** Sections separate by space and muted bands, not by borders or a ruled sheet. Hairlines belong inside a piece of product: table rows, event lists, the stage's divider, the footer of a tray.

## Elevation & Depth

A hybrid: surfaces are nearly flat, with tonal trays and gradients doing most of the work, and real shadows only where something truly lifts. The finish prefers gradients over `box-shadow` for shading, so focus rings stay intact.

### Shadow Vocabulary

- **Stage lift** (`box-shadow: 0 32px 64px -32px rgb(0 0 0 / 24%)`, 64% in dark): the hero's stage. The terminal window casts the same shape at 40%, in both themes.
- **Card rest** (`box-shadow: 0 1px 2px rgb(0 0 0 / 5%)`, plus a 1px inner edge: black at 4% beneath in light, white at 6% on top in dark): trays, cards and outline buttons.
- **Raised thumb** (`box-shadow: 0 1px 2px rgb(0 0 0 / 10%), inset 0 -1px 0 color-mix(in srgb, var(--foreground) 8%, transparent), inset 0 1px 0 rgb(255 255 255 / 70%)`): the selected tab's indicator and switch thumbs.
- **Popup hang** (`box-shadow: 0 16px 40px -12px rgb(0 0 0 / 22%), 0 2px 6px rgb(0 0 0 / 6%), inset 0 1px 0 rgb(255 255 255 / 70%)`): menus, selects, popovers and dialogs.

### Named Rules

**The Light From Above Rule.** Raised things catch light on top and sit on a heavier bottom edge; wells are shaded just inside their top edge. Every new surface picks one of the two and takes it from the shared finish.

**The One Stage Rule.** Only the hero's stage and the terminal window cast the long, soft shadow. Everything below it rests.

## Shapes

Soft, consistent corners derived from one 10px radius. Nesting steps inward: an 18px tray holds a 14px card, which holds 10px buttons and 8px or 6px small controls. Product tiles scale with size (8px, 10px and 14px at 28px, 36px and 48px). Badges are full pills, and status dots are 6px circles. Corners are the only geometry: there is no clipping, silhouette or isometric form on these pages.

## Components

### Buttons

Tactile and confident: they read as keys.

- **Shape:** gently curved (10px), 36px on hero actions, 32px by default, 28px small, taller on touch.
- **Primary:** graphite with a lit top edge, a white gradient from 16% fading out by 55%. The sign-up button is primary, with GitHub first and Google and email in an attached menu. `CopyPromptButton` is the other primary use, on the first step of the agents section.
- **Outline (keycap):** the popover surface shading faintly toward a heavier bottom border. In dark, a soft white lift from the top instead. This is the docs button and every hero's second action.
- **Ghost:** no border or fill until hovered; used for `ShowAll` and tertiary actions.
- **Hover / Focus / Press:** primary drops to 90%, outline takes a faint accent. Focus is a 2px ring, offset by 1px. Every button gives on press (`translateY(0.5px) scale(0.985)` over 150ms), off under reduced motion.

### Chips

- **Badges** are pills at 18px tall with 8px inline padding: neutral outline for `New`, the quiet status tones for states such as `delivered`.

### Cards / Containers

- **Tray:** the frame around every piece of product. An 18px muted frame holds a raised 14px card, with an optional header sitting on the tray (a medium title on the left, quiet meta and action on the right). A `flush` tray runs tables or code edge to edge; otherwise the card pads 16px, 20px from `sm`.
- **Product card:** a card (18px, padding 20px) with the tile, the name, the SDK namespace in mono, one line and a piece of its interface in a muted inset. Without a piece it collapses to a single line of tile, name and arrow.
- **Onward link:** 14px card, one line, arrow nudging 2px on hover, hover tint from the accent.
- **Close:** a tray with no inner card: large heading on the left, sentence, sign-up and pricing on the right, then `CopyPrompt`.
- **Copy prompt:** a 14px card holding `AGENT_PROMPT` on exactly one line, scrolling sideways with its scrollbar hidden and fading over its last 24px, beside an outline Copy button. It appears in the close only.
- **One of each:** four feature cells in a row at `lg`, each a small piece of product over its claim: a vendor review, a subprocessor list, an invoice and logs, in trays of equal height.
- **What your agent gets:** a plain-language list with a hairline between rows: what it is in quiet text, its name in mono at the far end, the whole row a link.

### Navigation

- **Header:** sticky, 64px, on 80% header glass with a light blur and a hairline beneath. Wordmark, mega menu, search and account links. It has no theme switcher.
- **Products menu:** every product by tile and name, reading down three columns, so nobody has to guess a family. The rest of email sits under Email on a hairline, without tiles. What isn't a product (platform, security, logs, domains, solutions) is plain text links along the bottom. Other coss.com projects stay in the footer.
- **Pricing and limits:** one muted band, two trays of one width. The pricing tray is a cell per meter, ruled apart, each leading with its price in Cal Sans 36px, later bands as rows, then what the Free plan includes. Prose stays in the Markdown twin and the docs.
- **Search:** an outline field, 208px wide, with a quiet icon and label and its shortcut in keycaps at the far end. It opens the command menu.
- **Breadcrumb:** small trail at the top of product, solution and comparison pages.
- **Footer:** the crawlable link columns on a 32% muted wash, on the same content width as the page. Shipyard and kloq are reached from here.

### Stage

The signature: checked SDK code beside the product at work, on one tray, split 1.05 to 1 at `lg`. The tray's header carries the SDK call in mono. On the home page, tabs switch product (with neutral icons) while the same key stays on screen, and every panel stays mounted so it is all in the page without script.

**The Neutral Well Rule.** Stage code is neutral in a shaded well: weight comes from the foreground, strings step back to 68%, and keywords and comments to muted foreground. The one exception is the SDK call, marked in each sample and set at weight 600 in the product's tone, because it is the thing to take away. Other syntax colours belong to the docs, not the stage. In dark, the well is shaded with black (16%, with a 22% gradient over its top 0.75rem), as the dashboard shades its wells.

On the home stage, a tab with a short sample (Email, SMS) shows the call's abridged response as formatted JSON under the code, with fields taken from the API reference's own examples. A tab whose sample already fills the well has none.

### Demos and Events

Demos have no controls. They play by CSS on load, when a tab opens, and once more when first scrolled into view (`Play`). `Replay` is events arriving one beat apart (520ms), each rising 6px from nothing over 240ms in reading order. `ProgressBadge` moves a status on with each beat and stays on the last. An event is a status dot, its real name in mono, and a tabular timestamp.

Motion is one vocabulary: things rise a few pixels, fade quickly or pop (260ms), bars fill (620ms) and signatures draw (900ms). Tab panels fade over 200ms. Without script everything is visible, and under reduced motion nothing moves and each demo shows its result.

**The Obvious Sample Rule.** No "Illustrative" label appears on the marketing pages, by the user's decision. Demo data has to read as sample data on sight: example.com addresses, Acme.

### Terminal Panel

An agent session in Claude Code's own layout, as a window that sits directly on the page rather than in a tray: chrome with three lights and a title, the name and path, the prompt on a lighter band, `●` tool and message lines, `⎿` results, `✻ Worked for`, the ruled input with its cursor, and the status line. Lines rise in one at a time. The Investigate section's agent cell uses the same colours and lines in a flush tray. These characters are transcript content copied from that format, not an icon vocabulary; icons elsewhere are SVG. The Claude mascot is never used.

### Customer Logos

Under the home stage, "coss.com is used by" in quiet 14px text, with one-colour logos in muted foreground spread across the full width on a row below it. Logos come from each company's own site with their paths unchanged. A company whose name or logo is live text on its own site is set as text here.

### Facts and ShowAll

Limits are label and value rows in two columns from `md`, with the value in right-aligned mono. Six rows show first, or eight in comparison tables, and the rest stay in the page for crawlers and answer engines.

**The One Collapse Rule.** A long list collapses with `ShowAll`, the single ghost button that opens one everywhere, naming the count ("Show all 12 limits").

### Comparison Table

A flush tray with three plain columns: label, coss.com in foreground, the other service in muted foreground, checked date and sources in the tray's meta.

**The Brief Rule.** A cell over 130 characters needs a hand-written brief that says less and nothing else; its figures come from the cell, and the full text stays in the `.md` twin.

### Product Tile

An icon on its tone at 28px, 36px or 48px. The 48px tile sits above a product page's headline; the smaller ones mark cards and links. It is the only coloured object in most views, and a new product needs one in the visuals catalog.

## Do's and Don'ts

### Do:

- **Do** build marketing pages from the kit: `Band`, `Heading`, `Hero`, `Stage`, `Tray`, `FeatureRow`, `FeatureCell`, `Close`.
- **Do** use coss ui's controls and let the shared finish give them their light; add to `finish.css` rather than restyling a control locally.
- **Do** show a real piece of the interface next to each claim, and keep to a one-sentence lede and 3 to 5 highlights on a product page.
- **Do** keep product copy short, with detail in the docs and the `.md` twins.
- **Do** take prices, limits and allowances from the catalog's components and helpers.
- **Do** name real events, statuses and methods; SDK calls are real and samples are checked in the build.
- **Do** keep `AGENT_PROMPT` to real URLs, the real package and real key prefixes.
- **Do** write in an assertive, authoritative voice, with every product written as shipped.
- **Do** keep demo data obviously sample data (example.com addresses, Acme), because it carries no label.
- **Do** stack a section's sentence directly below its heading, with any link onward inline at the end of the sentence.
- **Do** mark the SDK call in each hero sample so it takes the product's tone.
- **Do** check every new piece in light and dark, and under reduced motion.
- **Do** leave Shipyard's ruled sheet and drawings, kloq's look and the docs' layout and code colours as they are.

### Don't:

- **Don't** add eyebrows or kickers above headings.
- **Don't** build a section head from a title, a floating sentence and a far-right button; the user rejected that pattern.
- **Don't** use before and after comparison tables to make a platform argument; show small pieces of product instead.
- **Don't** use bare identifier chips; say in plain language what each thing gives the reader.
- **Don't** put an "Illustrative" label on demo data, or use the Claude mascot.
- **Don't** add a hue outside status and a product's tone, or hard-code a colour outside the tokens.
- **Don't** colour anything in stage code but the SDK call.
- **Don't** type a price or limit into a showcase.
- **Don't** bring back the old catalog on marketing pages: isometric boxes, drafting grids, hairline sheets or rows of text cells.
- **Don't** let a long list run on; collapse it with `ShowAll`.
- **Don't** use win or loss colours or marks on comparison pages, or leave a long cell without a brief.
- **Don't** mark anything as "soon" or "planned"; "New" is the only product badge.
- **Don't** add customer names beyond those in `PRODUCT.md`, or invent logos, testimonials, volumes, uptime figures or benchmarks to fill a section.
- **Don't** give another element the stage's long shadow, add entrance animation outside the demos, or add a button to play one.
- **Don't** add a theme switcher, or make any panel but a terminal always dark.
