# coss.com design: the parts catalog

The landing page is laid out like an engineering parts catalog. Each coss.com product is a **part** with a
catalog entry. The page sells the platform by what it saves a customer (one vendor instead of four), not by listing its features. Agents get one copyable line (`CopyPrompt`) that
points them at the manual.

## Fixed constraints

- **Grayscale only.** Colours come from the coss ui tokens (`--foreground`, `--background`, `--border`,
  `--muted*`) or are mixed from them. Never add a hue. Light and dark both work through the tokens.
- **Type and wordmark are the site's:** Cal Sans and Paper Mono from `@coss/ui/fonts` (set in
  `src/app/layout.tsx`), and the `coss.com` wordmark of `SiteHeader`. The landing page adds no font. Mono is
  for code, SDK names, part numbers and measured values only.
- **Controls are coss ui:** `Button`, `Tabs`, `Toggle`, `Badge`, `Kbd`. Don't hand-roll a control that
  coss ui already has.

## The sheet

- The page is one ruled sheet between `SiteShell`'s rails (`max-w-[1440px]`: the `container` width plus
  the rails' offset), and every section closes with `border-b`. Cells inside a section are separated by hairlines (`border-r` / `border-t`), never by gaps
  or cards.
- Section heads (`SectionHead`) put the heading in columns 1–5 and the description in columns 7–12. There
  are no eyebrows or kickers above headings.
- `.drafting-grid` (a dot grid) sits behind drawings and the closing call to action only.
- `.leader` draws the dotted rule between a spec label and its value.

## Drawings (`src/components/home/iso.tsx`)

- Drawings are isometric line art in catalog units (x runs lower right, y lower left, z up). Faces are
  filled with `--iso-top` / `--iso-left` / `--iso-right` and stroked 1 px in `currentColor` with
  `non-scaling-stroke`.
- Flat artwork (a part's engraved mark, the text on its sides) is drawn in 2D and mapped onto a face with
  `onTop` / `onLeft` / `onRight`.
- Every product is drawn the same way: solid line, seated in its socket.
- The hero is the platform plate (`platform-assembly.tsx`): products seated along the front, the shared
  platform pieces behind, one level leader per row to its name. No title block or per-part callouts.

## Motion

There is one moment: the hero's blocks drop into their sockets one after another, back to front
(`.assembly-seat` with a staggered delay, exponential ease-out, skipped when `prefers-reduced-motion`
is set). Don't add entrance animations to other sections.

Shipyard's page (`/shipyard`) is the exception: its drawings (`src/components/shipyard/drawings.tsx`)
drop in part by part when they scroll into view, lift on hover, and carry Shipyard's one amber lamp; all of it
stops under `prefers-reduced-motion`.

## Copy

- **Assertive and authoritative.** coss.com is the foundation apps are built on: write every product as
  shipped and never mark what's built against what's coming (no "soon", "planned" or "in stock"
  labels, badges or line styles). "New" is the only product badge.
- Numbers (limits, retries, timeouts) are copied from the source, and SDK calls named in code samples
  and the agent prompt are real methods.
- The agent prompt (`AGENT_PROMPT`) names only real URLs, the real package and real key prefixes.
- The agent session on the page is labelled as illustrative.
