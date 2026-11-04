# packages/scheduling — Scheduling

Hosts, availability, calendars and bookings. A native engine with no runtime dependency on Cal.com:
pure logic (`engine/`) was ported from it with its test cases, and orchestration rewritten.

## The double-booking guarantee

`scheduling_claim_no_overlap` (a custom migration: drizzle can't declare it) refuses two claims of a host that
overlap in both occupied and live time. **It is the only enforcement**; slot lists and re-checks just avoid asking
it questions it would refuse.

- Only `claims.ts` writes claims. `DO NOTHING` means a lost slot leaves the transaction usable. `live_until` comes
  from the same SQL clock as `live_from`: an expiry passed in and already past raises `22000`, not a conflict.
- `occupied` is the booking plus its buffers (`occupiedRange`). Neighbours' buffers add up.
- An expired hold's live range has ended, so it blocks nobody. **No correctness depends on a sweeper**.
  `expireDueBookings` only tidies up and tells customers.
- Converting a hold sets `live_from` to now, or two dead holds on one slot would conflict.
- **Lock order is fixed**: hosts and memberships (sorted), limit buckets (sorted), the group session, then claims by
  host. Unsorted collective bookings deadlocked about half the time on real Postgres. Bookers take `key share` on
  memberships, because the fairness counter's update would deadlock with `share`; a removal takes `update`.
- Limits count live claims under a bucket's row lock, and capacity counts seats under the session's. No counters to
  drift. A hold is a `held` booking, so conversion is one compare-and-set on one row.
- Anything that retries in a savepoint goes through `inSavepoint` (`claims.ts`), never drizzle's nested `transaction`:
  that one rolls back without releasing, so each failed attempt nests deeper and keeps a transaction id lock until
  commit. On a 500-host pool that ran Postgres out of lock table (`53200`), which is shared by the whole server.
- A group session has one claim, and every change to it happens under the session's lock, conversions included:
  firm while a seat is confirmed, otherwise as long as the latest live reservation, gone with the last live seat. A
  conversion counts the other seats first, because an expired hold's seat may have been taken. An expired approval
  gives up its seat like an expired hold.
- `deleteHost` refuses while a `held` or `pending_approval` booking has that host, expired or not. The cascade takes the
  host's `scheduling_booking_host` and claim rows together, so a collective booking can't tell afterwards that it lost
  one: a conversion can only catch a booking with no hosts at all.

An audit in `test/bookings.test.ts` checks every live booking holds exactly one claim per host.

## Routing

`candidatesOf` (`availability.ts`) is the one answer to who could take a booking, for slots, search, booking and moving
a booking: named hosts, plus a pool's `host_filter` matches right now, narrowed by `attributes`, and it never falls back
to someone who doesn't match. A row in `scheduling_event_type_host` with `assigned = false` only counts bookings for a
host a filter found, and never makes them a member. A host taken off `hosts` by name stays out whatever the filter says.
A pool's `required` hosts need a member: if narrowing leaves none, nobody's offered, rather than the required host alone.
A booker session's `attributes` come from the customer's server and are encrypted, since with an attendee they can say
what someone needs; the browser never sees them or sends its own.

## Slots

`isBookable` is the one definition of "can this be booked": listing and booking both call it, so they can't disagree.
The grid depends only on the zone and step, never on `now`, a window or busy time.

Time is computed **only in Bun services** (api, worker), with `engine/time.ts`: runtimes ship different tz data, and
`PUBLISHED_TRANSITIONS` covers what they may not carry yet. Node 22 and Bun 1.4.2 disagreed by an hour on Vancouver
when this was written. Never compute slots in the dashboard or with SQL's `AT TIME ZONE`: the dashboard's preview
embeds the booker. Local dates (overrides, limits) never pass through `Date`.

## Calendars

- `CalendarClient` can't return a title: no method reads anything but busy intervals, and `scheduling_busy_interval`
  has no column for it. Google's scopes are least privilege, and Graph's `$select` is what keeps titles out, since it
  has no narrower read scope. CalDAV objects arrive whole: `ical.ts` parses times and drops the rest.
- **A calendar that errored is left out of `fetchBusy`'s result, and never reads as free**. Cal.com's CalDAV adapter
  got this wrong for a deleted calendar. `calendarVerdict` decides how long old data is trusted.
- **A CalDAV read with anything missing is a failed read**: an object that can't be parsed, a failed `propstat`, a
  truncated or cut-off multistatus. Time is unknowable there. A rule that's only expensive (too dense, impossible,
  malformed) has a known start and end, so it's expanded up to `MAX_CYCLES_PER_EVENT`/`MAX_OCCURRENCES_PER_EVENT` and
  the rest of its span counts as busy: one odd event shouldn't stale a whole calendar. Spending
  `MAX_CYCLES_PER_READ` fails the read, so a hostile server can only hide its own host. Expansion is synchronous, and
  `ical.js` can loop forever inside `next()` (`FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30`), so `ical.ts` counts cycles by
  wrapping `check_contracting_rules`: re-check that when bumping the pinned version.
- A push only sets `dirty_at`. The leased `scheduling-calendar-sync` loop reads, fenced on `last_fetch_started_at`, so
  a slow older fetch can't overwrite a newer one.
- `scheduling_calendar_event` is desired state: the worker converges on the latest, so create, move and cancel can't
  reorder. A key makes a retry after a lost answer harmless (Google's client-chosen `id`, Graph's extended property
  plus `transactionId`, CalDAV's `If-None-Match`, Zoom's `agenda` marker); iCalUID doesn't do this on Google.
  `createEvent` leaves the event as asked even if a lost attempt made it, since the booking may have moved since, and
  a row with no `provider_event_id` is cancelled with `deleteEventByKey`.
- A write's `lease_until` is its fencing token (`stillHeld`): each row renews before its request, and only the holder
  records anything. Fencing can't recall a request on the wire, so a worker that finds it lost the row after sending
  bumps `desired_version` (`redrive`), and the row is written again from the latest state. Requests time out well
  inside the lease (`requestTimeoutMs`). What's left: a worker that dies with a request in flight can't re-drive, so
  that request can land last unnoticed, and CalDAV's 15 s timeout only covers an idle socket.
- A ledger row belongs to a booking or a group session, never a seat: a session has one event, from its first confirmed
  seat to its last, and news about it (`location_ready`, `external_conflict`, `calendar_write_failed`) goes to each
  confirmed seat. `scheduling_group_session.location` is where a session meets and `meeting_url` the link a provider
  made, gone with the event; a seat's own `location` is never read (`withSessionLocation`, `group-sessions.ts`), and
  since others see it, a booker's browser or an attendee's own number can't fill it in. A session's event that was
  deleted comes back as a new row, because its key can't be used twice.
- `freeBusy` carries no identity, so our own events are subtracted at read time. Limit, documented for customers: a
  foreign event wholly inside a booking's written event can't be detected.
- Host-supplied CalDAV URLs go through `pinnedDavTransport` (public addresses only, pinned against rebinding). Every
  URL a server names, in a redirect or a discovery answer, is checked in `send` before credentials go on it: the host's
  own origin, or between iCloud's `caldav` and `pNN-caldav` hosts (`isICloudCalDav`). That rule never skips the transport.
- Credentials use `encryptSecret` with `WEBHOOK_SECRETS_KEY`, never `SCHEDULING_DATA_KEYS`; `reencryptWebhookSecrets`
  covers them. A refresh writes back under a row lock unless the row now holds a different refresh token (compared
  decrypted, since a re-encryption changes the ciphertext and not the token, and a one-time token just used can't be
  asked for again). A consent's `encrypted_code_verifier` uses the same ring and isn't covered: it lasts 10 minutes, so
  a consent in progress when an old key leaves just starts over.
- Coss.com never auto-cancels: an external conflict or a host editing an event is flagged, with a webhook.
- Zoom (`calendar/zoom.ts`) is a write-only calendar: a connection has one hidden calendar row, never read for busy
  times and never a `write_target`, and a booking's meeting is a row in the same ledger, so retries, moves and cancels
  are the same code. Zoom has no idempotency key, so `createEvent` looks for its own meeting first, by a hash of the
  key in its `agenda` (never by title and time, which would adopt someone else's meeting), listing `type=scheduled`,
  since `upcoming` is reported to drop `agenda`. Its refresh tokens
  work once and expire unused, so `clientFor` re-reads after a refused refresh and `refreshIdleZoomConnections` keeps
  idle ones alive. `notZoomMeeting()` keeps these rows out of what's subtracted from busy times. Losing Zoom never hides
  a host. The app's deauthorization event comes to `POST /scheduling/zoom/events`.

A Meet or Teams link becomes a `link` location on the booking, stored with `conference` (stripped from the wire), so a
new host gets a meeting of their own (`locationForNewHost`). A browser only chooses among an event type's `locations`
(`locationFromBrowser`): it can't supply its own link or address.

## Sessions and the client API

`sessions.ts`: a token (`cossch_`) stored only as a sha256, in the URL's fragment then an `Authorization` header, never
a cookie, path or query. A manage link says what it can do, expires, and stops on cancel: unlike Cal.com's booking
`uid`, which was a permanent credential. `apps/api/src/routes/scheduling-client.ts` is what browsers call, including
coss.com's own pages (`apps/scheduling`), so there's no private endpoint. Preflights are open because the bearer token
is the only authority; real requests are checked against `allowed_origins`. What a session returns is narrowed: an
attendee sees times, never other hosts.

## Personal data

- Attendee contact details and answers, and a booker session's fixed attendee, are encrypted with
  `SCHEDULING_DATA_KEYS`. Only `email_hmac` is searchable. A new column on this ring goes in
  `SCHEDULING_DATA_KEY_COLUMNS` and `reencryptSchedulingData` (a test compares the list with the database).
- Answers come back only from `getBooking`: never lists, webhooks, logs, emails or calendars. The dashboard's iOS
  routes map bookings to name or uid only (`scheduling/wire.ts` under `apps/web/src/app/api/mobile/v1`).
- Webhooks and log lines carry ids, times and statuses. `request-log.ts` keeps no bodies of these routes.
- Host calendar events are private, titled "Appointment", with no attendees.
- `redactExpiredBookings` erases details 90 days after a booking ends, `purgeExpiredBookings` the row at 395;
  `eraseAttendee` on request, which also ends booker sessions fixed to them (found by `attendee_uid`). Periods live in
  `@coss/retention`.

## Notifications

`notifications.ts` resolves policy once, into outbox rows in the deciding transaction: core code never branches on it.
Rows hold no content; a row's rendered at send time and dropped if stale. A change that keeps a booking's time but
bumps its version (a location, a meeting link) calls `carryReminders`, or its reminder would look stale. Booking emails use `@coss/email-layout` with
no customer HTML and no links but the manage link, and pass `screeningExempt`: per-email screening would send patients'
names to the AI Gateway. In exchange, text a customer controls is screened at setup (`screening.ts`) and can't hold a
link. Never add a free-form field to these emails without screening it. SMS goes through `@coss/sms`, so it's sampled
as usual: keep names out of it.

Branding only applies under the customer's own `email_from`: `renderMessage` puts their name or logo and accent in
`html`, and `cossHtml`, what coss.com's address sends, has none of them. `scheduling_logo` holds a PNG or JPEG checked
by its bytes (`parseLogo`), never SVG. Emails carry it inline (`cid:`) and pages get it as a data URL from `/session`:
neither loads a remote image, since a request per open would say who's whose patient. A logo can't be screened like
text, and it can't hold a link.

## Billing

One `scheduling.bookings` unit per confirmed booking, series occurrence or group session, guarded by a compare-and-set
on `usage_recorded_at` (`recordUsage` doesn't dedupe). `reserve` runs after a host has won. Holds and pending approvals
aren't charged; reschedules are free; cancelled stays charged.

## Testing

`test/bookings.test.ts` races on real Postgres. `test/engine-differential.test.ts` compares `buildAvailability` with
fixtures generated from Cal.com's `buildDateRanges`; the one intended difference is that Cal.com's overrides can spill
outside the requested window. `FakeGoogleCalendarApi` (`./testing`) echoes writes back as busy, as the real one does.

`bun run --cwd apps/worker scheduling:load` (`--hosts 500 --days 14 --concurrency 32 --bookings 500 --existing 20 --busy
10 --searches 30 --races 20 --big-table-rows 5000`, `--sandbox`, `--capped`) measures search, slots and booking on the
test database: the package's own functions, in one process, with no API and no provider calls. By default a live
environment on the Pro plan; `--capped` adds a usage cap, which makes every booking update one quota row. Pool size:
`DATABASE_POOL_MAX`. It exits 1 if a race didn't have the winners it should or anything failed unexpectedly, and prints
`EXPLAIN (ANALYZE, BUFFERS)` of the statements the hot paths really sent, flagging selective sequential scans of big
tables. A pool tries its top candidate, then reads who could still take the slot and tries only them, so a slot nobody can
take costs one attempt and one read rather than an attempt per host. A series on a pool of more than three reads first
too: everyone free for all of it, or with `skip` the three with the fewest conflicts. Loops over hosts call `takeTurn`,
since slots are computed on the API's one thread.

`bun run db:seed` adds demo hosts, event types and bookings around today to `acme`'s environments
(`scripts/seed.ts`).

## Going live

Live in production at `cossbook.com` (README, "Scheduling's hosted pages"). Without `SCHEDULING_DATA_KEYS` in a stage
secret, Scheduling is off there: the API answers 503 `scheduling_unavailable`, the worker's loops don't run and the
dashboard's pages don't exist. Rotating the key: README, "Rotating `SCHEDULING_DATA_KEYS`" (`bun run
scheduling:reencrypt`). Still to do:

1. Zoom's app review. The app "coss.com" is in Cal.com's Zoom developer account, separate from Cal.com's own, and
   production runs its Production credentials. Until it's approved, only reviewers and that Zoom account can consent.
2. A BAA before any customer holds PHI. The Terms prohibit it without a written agreement, and
   HIPAA mode (`packages/compliance/AGENTS.md`) is what such a customer gets.
- The dashboard reads one booking through `getBookingOverview`, which never returns answers (only `getBooking` does). Its `lookupKey` is the API's `RISK_HASH_KEY`, because `email_hmac` is searched with it.
