import { PRODUCTS } from "@/components/home/parts";
import { CALENDAR } from "./calendar";
import { SHIPYARD } from "./shipyard";

/** The about page's copy, shared with `/about.md`. */

export const ABOUT_TITLE = "One API for everything above your database.";

export const ABOUT_LEDE = {
  before:
    "Supabase does God's work for developers: it took Postgres, the hardest part of every stack to run well, and turned it into something you get by signing up.",
  strong: "coss.com does the same for everything that sits above the database.",
  after: "Email, SMS, inboxes, scheduling: one API key, one SDK, one bill.",
};

/** Products of the platform beyond the catalog's parts, in the same shape. */
export const ABOUT_PRODUCTS = [
  ...PRODUCTS,
  {
    id: "hooks",
    name: "Hooks",
    call: "coss.hooks",
    summary:
      "Webhooks as a service: send a message once, coss.com delivers it to every endpoint your customers registered.",
  },
  {
    id: "risk",
    name: "Risk",
    call: "coss.risk",
    summary:
      "Whether a sign-up, login or other event looks like abuse, and why, with rate limiting for your own endpoints.",
  },
] as const;

export const ABOUT_SECTIONS = [
  {
    id: "data-layer",
    title: "What Supabase did for the data layer",
    paragraphs: [
      "Before Supabase, a new product started with a week of plumbing: a database to host, back up and upgrade, auth to bolt on, files to put somewhere, a way to push changes to the browser. Supabase folded all of that into a project URL and an API key, kept Postgres at the centre, and open-sourced the lot. The data layer became a solved problem.",
      "We're fans. coss.com itself runs on Postgres, and we have no plans to host yours. Keep your database where it is: Supabase, Neon, RDS, a box under your desk.",
    ],
  },
  {
    id: "application-layer",
    title: "What's left once the database is solved",
    paragraphs: [
      "A working product still has to reach people. It sends a receipt, texts a verification code, gives an agent an inbox, books a meeting. Each of those has been a separate vendor: its own account, key, dashboard, webhook format, retry rules, rate limits, invoice and compliance paperwork. Four vendors to ship one product, and four places to look when something doesn't arrive.",
      "That is the application layer, and it is what coss.com is for. Not the data under your app, but everything your app does with it.",
    ],
  },
  {
    id: "one-vendor",
    title: "One vendor for the application layer",
    paragraphs: [
      "Every coss.com product is built the same way: one key, one SDK namespace, the same webhooks, logs, rate limits, idempotency and API versioning. Learn one and you know them all.",
    ],
    products: true,
    closing:
      "Behind the products sit the pieces every one of them needs: verified domains, receiving, suppressions, DMARC and reputation, delivery logs and drains, signed webhooks, audit log, metered billing. Those are built once and shared, not reinvented per product.",
  },
  {
    id: "open",
    title: "Open source, built for agents",
    paragraphs: [
      "The platform is open source under the AGPL, with an MIT SDK, MCP server and CLI, so what you build on stays inspectable and yours to run. The docs are written so a coding agent can wire a product in from one prompt, and so can you.",
      `coss.com is built by the team behind Cal.com. ${SHIPYARD.name} and ${CALENDAR.name} come from the same shop.`,
    ],
    actions: true,
  },
] as const;
