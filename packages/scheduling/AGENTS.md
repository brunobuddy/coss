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

An audit in `test/bookings.test.ts` checks every live booking holds exactly one claim per host.

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
- A push only sets `dirty_at`. The leased `scheduling-calendar-sync` loop reads, fenced on `last_fetch_started_at`, so
  a slow older fetch can't overwrite a newer one.
- `scheduling_calendar_event` is desired state: the worker converges on the latest, so create, move and cancel can't
  reorder, and a key makes a retry after a lost answer harmless (Google's client-chosen `id`, Graph's `transactionId`,
  CalDAV's `If-None-Match`). iCalUID doesn't do this on Google.
- `freeBusy` carries no identity, so our own events are subtracted at read time. Limit, documented for customers: a
  foreign event wholly inside a booking's written event can't be detected.
- Host-supplied CalDAV URLs go through `pinnedDavTransport` (public addresses only, pinned against rebinding, redirects
  re-checked, the password never sent to another origin).
- Credentials use `encryptSecret` with `WEBHOOK_SECRETS_KEY`, never `SCHEDULING_DATA_KEYS`; `reencryptWebhookSecrets`
  covers them. A refresh writes back with a compare-and-set. A consent's `encrypted_code_verifier` uses the same ring
  and isn't covered: it lasts 10 minutes, so a consent in progress when an old key leaves just starts over.
- Coss.com never auto-cancels: an external conflict or a host editing an event is flagged, with a webhook.
- Zoom (`calendar/zoom.ts`) is a write-only calendar: a connection has one hidden calendar row, never read for busy
  times and never a `write_target`, and a booking's meeting is a row in the same ledger, so retries, moves and cancels
  are the same code. Zoom has no idempotency key, so `createEvent` looks for its own meeting first. Its refresh tokens
  work once and expire unused, so `clientFor` re-reads after a refused refresh and `refreshIdleZoomConnections` keeps
  idle ones alive. `notZoomMeeting()` keeps these rows out of what's subtracted from busy times. Losing Zoom never hides
  a host. The app's deauthorization event comes to `POST /scheduling/zoom/events`.

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
- Answers come back only from `getBooking`: never lists, webhooks, logs, emails or calendars.
- Webhooks and log lines carry ids, times and statuses. `request-log.ts` keeps no bodies of these routes.
- Host calendar events are private, titled "Appointment", with no attendees.
- `redactExpiredBookings` erases details 90 days after a booking ends, `purgeExpiredBookings` the row at 395;
  `eraseAttendee` on request, which also ends booker sessions fixed to them (found by `attendee_uid`). Periods live in
  `@coss/retention`.

## Notifications

`notifications.ts` resolves policy once, into outbox rows in the deciding transaction: core code never branches on it.
Rows hold no content; a row's rendered at send time and dropped if stale. Booking emails use `@coss/email-layout` with
no customer HTML and no links but the manage link, and pass `screeningExempt`: per-email screening would send patients'
names to the AI Gateway. In exchange, text a customer controls is screened at setup (`screening.ts`) and can't hold a
link. Never add a free-form field to these emails without screening it. SMS goes through `@coss/sms`, so it's sampled
as usual: keep names out of it.

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

## Going live

Live in production at `cossbook.com` (README, "Scheduling's hosted pages"). Without `SCHEDULING_DATA_KEYS` in a stage
secret, Scheduling is off there: the API answers 503 `scheduling_unavailable`, the worker's loops don't run and the
dashboard's pages don't exist. Rotating the key: README, "Rotating `SCHEDULING_DATA_KEYS`" (`bun run
scheduling:reencrypt`). Still to do:

1. Zoom's app review: until it's approved and `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` and `ZOOM_WEBHOOK_SECRET_TOKEN` are
   set, hosts aren't offered Zoom. Test against a real Zoom account first: only `FakeZoomApi` has run this code.
2. Google OAuth verification (project `coss-scheduling` under coss.com's Google organization: submitted, under review).
   Until it passes, Google's consent screen warns and caps the app at 100 users. Microsoft's app ("coss.com Scheduling"
   in Cal.com's Entra tenant) is publisher-verified; its secret expires in 2028.
3. A BAA before any customer holds PHI. The Terms prohibit it without a written agreement.
