# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary reader is a developer evaluating coss.com: an engineer, usually with a product already in production, comparing it against Resend, SendGrid, Postmark, Twilio, Svix, DocuSign, Cal.com Platform or similar. They want to see the product working and the shape of its API, then sign up or open the docs. Coding agents read the same facts through the Markdown twins and `/llms.txt`, so the visible pages do not have to carry every detail.

## Product Purpose

coss.com is a unified developer platform for the application layer: one API key and one SDK for transactional and marketing email, inboxes for AI agents, SMS, one-time codes, e-signatures, forms, scheduling, webhooks for a customer's own users, and risk checks with rate limiting. Success on the marketing site is a developer understanding what a product does within seconds, believing it by seeing it work, and signing up or reaching the docs.

## Positioning

Every product runs on the same key, the same SDK, the same signed webhooks, the same logs and the same bill, so the next product needs no new setup. Adding a channel means another method, not another vendor. The platform is open source (AGPL; the SDK, MCP server and CLI are MIT) and built by the team behind Cal.com.

## Operating Context

The reader moves between the site, the docs, their editor and a coding agent. Development keys (`coss_test_`) work with every API, record every message and event, and deliver nothing, so trying a product costs nothing. Agents are handed one prompt (`AGENT_PROMPT`), which stays quotable from the site.

## Capabilities and Constraints

- Sell only what is live: metadata, catalog, nav and rate tables name only products customers can use in production. Sign's pages stay published by decision.
- Prices, limits and allowances are never typed; they come from `@coss/billing/catalog` and helpers. Limits and retry numbers match the code.
- SDK calls in samples are real methods, and samples are Twoslash-checked in the build.
- Every page has a Markdown twin for agents and FAQ text in FAQPage JSON-LD. Long-form detail may live in the docs and the twins instead of the visible page.
- Static pages, served from CloudFront. No env, cookies or headers in pages. No third-party script origins (CSP); fonts are self-hosted.
- Comparison pages state competitors' facts as checked against their own pages, with sources and no win/loss styling.

## Brand Commitments

- The name is `coss.com`, written that way, and its wordmark.
- Voice: assertive and authoritative. Every product is written as shipped; nothing is marked as coming soon. "New" is the only product badge.

## Evidence on Hand

- Real: the API and SDK themselves, real event names and statuses, the published price catalog, the published limits, the open source repository, the dashboard, the MCP server and CLI, and the comparison pages' sourced facts.
- Customers named on the home page, supplied by the user on 2026-11-04: Cal.com, T3 Code, Fusial, Ledington and A.Team, under "coss.com is used by". Logos come from each company's own site; each company's permission is not confirmed yet.
- Absent, and not to be fabricated: other customer names, testimonials, case studies, sending volumes, deliverability figures, uptime figures and benchmarks. Demo data is allowed in the product demos; by the user's decision it carries no label, so it must stay obviously sample data (example.com addresses, Acme).

## Product Principles

- Show the product working before describing it.
- One key is the argument: every page should make the shared platform felt, not just stated.
- Say less on the page; link to the docs for the rest. Exhaustive detail belongs to docs and agents.
- Every claim traces back to the code or the catalog.
