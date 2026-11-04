/**
 * The free tools.
 *
 * Each one is a thin page over a function kloq already exports and already
 * tests — no separate implementation to drift. They exist because the
 * underlying problems (what does this RRULE mean, what easing does this spring
 * make, what did the parser understand) are annoying far outside the calendar
 * niche, and a page that solves one earns its own audience.
 */

export interface Tool {
  slug: string;
  /** the tool's own name, used as the h1 and in schema.org */
  name: string;
  /** two or three words, for a line that lists every tool */
  short: string;
  /** the <title>, written for a searcher who has never heard of kloq */
  title: string;
  description: string;
  /** the line under the h1 */
  lede: string;
  /** the kloq export it is built on, shown so the page proves its own claim */
  built: string;
  /** where the same thing is documented */
  docs: string;
  /** OG card tint */
  color: "violet" | "blue" | "emerald" | "amber" | "sky";
  /** the card's detail line */
  detail: string;
}

export const TOOLS: Tool[] = [
  {
    slug: "spring-easing",
    name: "Spring to CSS linear() converter",
    short: "spring easing",
    title: "Spring to CSS linear() generator — free easing tool",
    description:
      "Tune a damped spring and get a CSS linear() easing you can paste. Real spring motion in plain CSS, with no animation library at runtime.",
    lede: "cubic-bezier() cannot overshoot, so it cannot describe a spring. linear() can: sample the spring once, and the curve rides along in a stylesheet with no physics engine at runtime. Drag the sliders, watch the block, copy the value.",
    built: "springLinear() and springSamples() from kloq/lib/springs",
    docs: "/kloq/docs/design-mode",
    color: "violet",
    detail: "stiffness · damping · samples → one CSS value",
  },
  {
    slug: "rrule",
    name: "RRULE explainer",
    short: "RRULE explainer",
    title: "RRULE explainer — decode an RFC 5545 recurrence rule",
    description:
      "Paste an iCalendar RRULE and get it in plain English plus its next occurrences. Handles FREQ, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT and UNTIL.",
    lede: "FREQ=MONTHLY;BYDAY=-1FR is a sentence written for a parser, not a person. Paste one in and get the sentence back in English, with the dates it actually produces.",
    built: "parseRRule(), describeRRule() and expandRecurrence() from kloq",
    docs: "/kloq/docs/recurrence",
    color: "emerald",
    detail: "RFC 5545 in, plain English and real dates out",
  },
  {
    slug: "quick-add",
    name: "Natural-language date parser",
    short: "date parser",
    title: "Natural-language date parser — see what it understood",
    description:
      "Type a sentence and watch the parser underline the phrases it consumed — the date, the time, the duration, the people, the location — with the title left over.",
    lede: "Most natural-language date parsers hand you a result and leave you guessing which words they used. This one reports the exact source offsets of every phrase it consumed, so the input can underline itself while you type.",
    built: "parseQuickAdd() from kloq/lib/quick-add",
    docs: "/kloq/docs/quick-add",
    color: "amber",
    detail: "a sentence in, an event and its source offsets out",
  },
  {
    slug: "rrule-builder",
    name: "RRULE builder",
    short: "RRULE builder",
    title: "RRULE generator — build an RFC 5545 recurrence rule",
    description:
      "Pick a frequency, the days, and how it ends; get a valid RRULE string, the sentence it means, and the dates it produces. No iCalendar spec required.",
    lede: "Writing an RRULE by hand means reading RFC 5545 to find out that the last Friday of the month is BYDAY=-1FR. Pick it from a menu instead, and watch the rule and the dates it produces update as you go.",
    built: "serializeRRule(), describeRRule() and presetsFor() from kloq",
    docs: "/kloq/docs/recurrence",
    color: "blue",
    detail: "controls in, a valid RRULE out",
  },
  {
    slug: "timezones",
    name: "Time zone overlap map",
    short: "zone map",
    title: "Time zone meeting planner — find the overlapping hours",
    description:
      "A day-and-night map of your team's time zones on one timeline. See where working hours overlap and which hour to put the meeting in.",
    lede: "Not a map of the world — a map of the day. Each row is one zone's clock across your day, midnight to midnight, on a shared timeline, so night steps across the rows the way a terminator sweeps a globe, and the hours when everyone is at work are the ones worth booking.",
    built: "the zone layer from kloq — zoneOffsetMinutes(), zoneAbbr() and formatInZone()",
    docs: "/kloq/docs/time-zones",
    color: "sky",
    detail: "day, night, and the hours everyone is at work",
  },
];

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);

/** The tool a page is about; its slug is spelled in the page, so a miss is a programming error. */
export function toolOf(slug: string): Tool {
  const tool = toolBySlug(slug);
  if (!tool) throw new Error(`Unknown tool "${slug}"`);
  return tool;
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** "five", or "Five" to open a sentence; digits past ten. */
export function countWord(n: number, capital = false) {
  const word = NUMBER_WORDS[n] ?? String(n);
  return capital ? word[0].toUpperCase() + word.slice(1) : word;
}
