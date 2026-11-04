# packages/scheduling — Scheduling

Hosts, availability, calendars and bookings. A native engine with no runtime dependency on Cal.com:
pure logic (`engine/`) was ported from it with its test cases, and orchestration rewritten.

## Languages

What booking emails and texts say lives in `i18n.ts`, so adding a sentence means adding it to every catalog (the type
fails otherwise). Only our words are translated, never a title or brand. Reply `STOP` stays in English in every
language, since that's the keyword carriers act on. The hosted pages are still English only.

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
- **Lock order is fixed**: an attendee's advisory locks (`checkAttendeeLimit`, sorted), hosts and memberships (sorted),
  limit buckets (sorted), the group session, then claims by host. Unsorted collective bookings deadlocked about half the time on real Postgres. Bookers take `key share` on
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

## Out of office

`out-of-office.ts`: time a host is away, one row per host. `HostInputs.away` keeps them from being offered, and
`isBookable` checks it before the calendar's verdict, so the reason's honest, and before the session branch, so a
running session can't be joined; `joinGroupSession` checks it too, since a join with live seats never calls
`isBookable`. **It only touches an existing booking if it's asked to** (`existing_bookings: "reassign"`, which starts a
run; see "Moving many"). Otherwise it reports them as conflicts (`listOutOfOfficeConflicts`, and a count-only email to
the host unless they did it themselves). Accepted: confirming a hold or approving a request
that was already there skips the check, and those bookings show up as conflicts.

- A write takes `for no key update` on the host row, and bookers hold `share`, so a booking either commits first and
  is a conflict, or sees the entry. It takes the rows of whoever's covering too, since a booking with them holds theirs
  and not the principal's, and it reads their cover again once it does (`coverAsItStands`), for the same people it was found through.
- `reason` can say someone's on medical leave, so it stays out of webhooks, logs, calendars and anything a booker sees
  (`slotLost` hides that a host is out of office, too). Notes are encrypted; `public_message` is what bookers read,
  screened, with no links.
- Deleting is soft: the ledger row that removes its calendar event belongs to the entry, and a hard delete would
  cascade it away and orphan the event. Notes and the message go at once; the row goes within 30 days. A holiday's
  deleted row stays as its tombstone.
- Whole dates resolve to instants once, in the host's zone then: moving zones later doesn't move them, and the dates
  are only kept for showing back. `all_day` says so on the wire.
- The calendar block is a ledger row with a third kind of owner (`out_of_office_id`), titled "Out of office", which
  `flagExternalConflicts` subtracts like any event of ours, and `checkHostEditedEvents` ignores.

Delegates (`scheduling_out_of_office_delegate`) are new-booking candidates only: `candidatesOf`'s last step adds them,
sets `coverage`, and `HostInputs.onlyWithin` keeps them to meetings that touch the principal's time away, in `isBookable`,
so slots and booking can't disagree. Each caller of `loadHostInputs` passes it through (`hostInputOf`, `ClaimPlan.coverage`).

- `candidatesOf` asks nothing about time but "hasn't ended yet": a principal has to be a candidate themselves
  (routing narrowing applies to them first), and a delegate must match a pool's filter and the narrowed attributes and
  not be removed by name. Required hosts have no delegates, and it isn't transitive.
- A delegate ranks at `max(own ratio, principal's ratio)`: their own low count would otherwise make them take everything.
- A group has one host, but picks them by time, in `createOne`: the first of its host and their delegates who can take it.
  Coverage is checked on every join, like being away.
- `levelReturningHost` raises a pool member's `fair_units` to the lowest peer's ratio when an entry ends, once
  (`fairness_leveled_at`), never downward, and not while another entry has them away.

Holiday calendars (`holidays.ts`) turn a country's holidays or a customer's feed into ordinary entries, `source: holiday`,
one per host and day, in the host's zone. `source_key` (`<calendar>:<host>:<date>`, unique per environment) is how a sync
knows what's there; a deleted row keeps it as a tombstone, so someone opting out of a date isn't given it back. A date
that's gone from the feed, or a host who's left, clears its key as well, since nobody chose that.

- A failed, partial or empty read keeps what's there. `holidaysFromIcs` only takes whole days, and treats what it can't
  understand as a failed read. A country's list is shared (`scheduling_public_holiday`, no organization), since requests
  for it say nothing about anyone. It's read from Google's public ICS URL, which is unofficial.
- A feed's URL can hold a token: `WEBHOOK_SECRETS_KEY` and `reencryptWebhookSecrets`, never a log or a response, and
  `last_error` can't name it. It goes through `pinnedDavTransport` (public addresses, pinned), a 3xx is a failed read, and
  sandbox environments don't read them.
- Names are unscreened, so entries carry `public_holiday` and no name: never in an email, a calendar event, or anything
  a booker sees.

## Reassigning

`reassign.ts`: a booking goes to another host, keeping its id and time, for every kind. The target is claimed **before**
the source lets go (`releaseHostClaim`), under `retryingDeadlocks`, so a lost race leaves the booking as it was. The
source only takes `key share`, with no status check, since leaving a disabled host is how someone gets offboarded.

- `isBookable`'s `skip` is how a booking that exists doesn't answer the grid, notice and window again, and how overrides
  work. Nothing can skip `already_claimed`, and the exclusion constraint has the last word anyway.
- A hold or request keeps what's left of its time (`claimRemainingSeconds`, from the same SQL clock, rounded down),
  never more: under a second is `hold_expired`, not a claim whose range would raise `22000`. It's read after the target's
  locks, since waiting for them comes out of that time.
- `auto` keeps to what the booking was routed with. A pool's booking that can't say (`encrypted_attributes` is null)
  refuses `auto`, rather than guessing nothing narrowed it; someone naming a host knows who they're choosing.
- A group session has one host, so a seat's reassignment moves all of it. Seats lock before the session, since cancelling
  takes them in that order, and they're read again once locked. A target's old session row with no live claim is in the
  way only of `scheduling_group_session_slot_unique`, and is cleared; one with a claim is a real conflict.
- One that's started changes for the record only: no claim, calendar, count or notice. `auditClaims` looks at future
  bookings for this reason.
- `reason_code` and `note` go nowhere but the booking's history. The note's encrypted (`encrypted_note`, not `details`,
  which outlives the attendee's data) and goes with their details, and isn't written about someone already erased, as a
  queued run's would be otherwise.
- Host emails address `hostId`, and only those joining and leaving hear: a co-host has nothing new to know. Each hears
  what's changed since they last heard: going A to B to C tells A and C and not B, and going back to A tells nobody.

## Moving many

`reassignments.ts`: a run is a row and its items, and each booking goes through `reassignBooking` in its own transaction,
so one that can't move never holds up the rest. **It never cancels a booking**: one nobody can take stays, and its item
says `no_candidate`.

- Creating a run only inserts its row. The worker's `scheduling-reassignments` loop works out the items once: an item's
  FK takes `key share` on a booking, and doing that under out of office's hold on the host would deadlock with a
  reschedule, which takes the booking and then the host. `reassignment-row.ts` is what out of office calls, and imports
  only the database, since `out-of-office.ts` is imported by `bookings.ts`, whose internals `reassign.ts` destructures
  when it loads: importing `reassign.ts` from there is an import cycle that crashes.
- A run is leased (`lease_until`, `for update skip locked`), and renewing the lease before each item is the fence: a
  worker that lost it, or a run that's been cancelled, stops. A move's outcome is written by `onMoved`, in the move's own
  transaction, so a report can't disagree with what happened, and a crash in between can't leave a booking moved and
  its item pending. It only writes over `pending`, like any other outcome, and a move that finds the item decided rolls
  back: that's what stops a worker that lost its lease while waiting on a lock, since nothing can tell it.
- A preview simulates: it adds what it's proposed to each host's claims and limits, and to a pool's counts, so two
  bookings can't be promised one free hour. It uses `isBookable` and `candidatesOf` per booking's routing, like the run,
  and promises nothing: the run decides again.
- A session counts once, as `min(id)` of its seats: never page bookings and dedupe afterwards, or a big session eats the
  limit. The 5,000 cap counts the same way, and it's on what's asked for: a run an entry starts takes everything in it.
- Hosts get one `reassignment_summary` email per run, with counts read at send time, and `quietHosts` keeps per-booking
  ones away, so a digest carries no calendar cancellations; `notify.hosts: "each"` does, one per seat of a session,
  since each seat's invitation has a UID of its own. Each booking's event type has its say over a digest, as over a
  booking moved by itself: what it silences is neither counted nor a reason to send one. Attendees still hear per booking. Each booking's history gets its own copy of the note; the run's is
  cleared when it finishes, and only exists for that long.
- `existing_bookings: "reassign"` delays the conflicts email by 15 minutes, since it counts what's left when it's sent.
  Changing an entry's notes doesn't start another run; changing its times does.

## Slots

`isBookable` is the one definition of "can this be booked": listing and booking both call it, so they can't disagree.
The grid depends only on the zone and step, never on `now`, a window or busy time.

Time is computed **only in Bun services** (api, worker), with `engine/time.ts`: runtimes ship different tz data, and
`PUBLISHED_TRANSITIONS` covers what they may not carry yet. Node 22 and Bun 1.4.2 disagreed by an hour on Vancouver
when this was written. Never compute slots in the dashboard or with SQL's `AT TIME ZONE`: the dashboard's preview
embeds the booker. Local dates (overrides, limits) never pass through `Date`.

The booking path computes slots, so the dashboard (Node) never calls `createBooking` or `rescheduleBooking`. It opens the
hosted page in a tab through a session with `createdByUserId` (`openBookerAction`, `openBookingManagerAction`), and that
session acts as the member (`sessionActor`), past attendees' cutoffs. A manage session made this way lasts an hour.
`listRescheduleSlots` answers where a booking can move the way `rescheduleBooking` checks it: its own hosts (none disabled
or taken off the event type), length and buffers, with its own claims left out. Change them together.
Reassigning, its candidates, a run's preview and out of office's dates all work out time too, so the dashboard opens the
team page for them (`openTeamPageAction`), and a test refuses them in its code (`apps/web/test/scheduling-bun-only.test.ts`).
Starting a run from there happens on that page as well; undoing or cancelling one, and deleting an entry, only write rows
and the worker does the rest, so they stay in the dashboard.
A new event type field goes in the dashboard's form too
(`apps/web/src/lib/scheduling-edit.ts`, `event-type-form.tsx`), or typecheck fails on the test fixtures there.

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

A Meet or Teams link becomes a `link` location on the booking, stored with `conference` and `conference_host_id` (both
stripped from the wire), so when a host leaves, the link only resets if the meeting was theirs (`locationWithoutHost`).
A Zoom meeting's owner is its ledger row (`meetingOwnerOf`), and it keeps running the meeting however hosts sort. Links
older than `conference_host_id` have no known owner, so they reset. Co-hosts each ask for a Meet at creation, and only
the first answer becomes the booking's link: a co-host's event can hold its own unused conference, though its location
text is rewritten to the booking's. A browser only chooses among an event type's `locations` (`locationFromBrowser`):
it can't supply its own link or address.

A booking's ledger row can come back when a host leaves and returns, and its `key_generation` makes a key not yet used
(`eventKey`). Removing an event (`setCalendarState` with `absent`) goes by the ledger's rows, not today's write target,
so an event on a calendar that's stopped being one still goes. Slots for moving a booking come from the hosts it has
(`listRescheduleSlots`), never `candidatesOf`, which answers who'd take a new one.

### Delegation

`calendar/delegation.ts`, `delegation-failures.ts`, `delegation-tokens.ts` (no database). An admin authorizes a domain
once, and every host on it gets their calendar with no consent screen.

- **It takes a plan with `calendarDelegation`** (Scale and above, through an injected `PlanGate`) to create, update or
  verify one, in every environment, since a sandbox's delegation reaches real calendars. Deleting never does, a
  self-serve downgrade is refused while one exists, and the worker doesn't check: an organization that loses the
  feature through a contract keeps what's connected, as a log drain keeps delivering.
- **Credentials are the customer's own**: a service account from their Cloud project, or a single-tenant Entra app. The
  provider confines either to that Workspace or tenant, so there's no domain ownership check. That argument only holds
  for customer-owned credentials: a coss.com-owned service account shared between customers would let any customer
  claim another's domain, so that needs a client ID per delegation first. A pasted key's `token_uri` is ignored, since
  it could send the signed assertion anywhere.
- **A delegated connection is an ordinary connection** (`delegation_id` set), so sync, writes, channels and
  availability don't branch: only `clientFor` does. `encrypted_credentials` caches its access token (`refreshToken:
  null`), per mailbox. A delegation's credentials go only in `scheduling_calendar_delegation`, through `encryptSecret`.
- **The mailbox is stamped when a host connects** (`accountId`), and `email` changing later moves nothing, since it's
  "never an identity". Otherwise old events are orphaned, and a new connection has no write target. A host has one
  delegated mailbox, even if their email moves to another delegation's domain. Only `calendar_account` moves it
  (`releaseOldMailbox`, `hosts.ts`), refused while bookings are live or a write that may have reached the provider is still owed, under the host's lock. `hostStillWants` takes that
  lock and the delegation's before anything fetched is committed, and re-reads both: a mailbox changed or
  `match_host_email` turned off during the provider calls has to win. Locks: host, then delegation, then connections;
  a bulk flip takes the delegation, then connections, so nothing may lock a delegation after a connection. `match_host_email`
  trusts `host.email`, which the docs warn about: a customer taking emails from end users must turn it off.
- **`runDueCalendarDelegations`** connects a batch per run. `connectHost` fetches everything first (calendars, a
  channel, the first read) and commits it all in one transaction, so a host goes from no calendar to a verified one,
  never hidden or empty. A push can't find a channel that isn't stored yet, so the calendar is read once more straight
  after. Before activating it takes the delegation's row `FOR SHARE`, or it could land just after a bulk flip to
  `delegation_failing` and escape the outage. Delegations are claimed one at a time, and a lease is fenced. A delegation with hosts left runs again at once, walking
  them with a cursor that moves past every host it tried, however that went, so hosts that keep failing can't hold up
  the ones behind them; `nudgeDelegations` asks for a run
  when a host is created or changed.
- **Taking over an OAuth row** matches only on the account, keeping calendars, write target and ledger. A calendar in
  common proves nothing: a personal account can subscribe to a work calendar, and would get the wrong credentials. Never revoke the old token: Google's revoke drops all of the project's tokens for that person,
  which could be another host's. `saveConnection` leaves a delegated row alone, or a host's consent would replace the
  delegation's token, and its upsert checks that again under its own lock, since a takeover in progress isn't visible
  before it. `markNeedsReauth` re-reads the row, so a late failure of the old tokens does nothing.
- **Losing access**: every `auth` failure goes through `handleAccessLost`. Any refusal may be old, from a request already on its way,
  so nothing acts on one without asking again: before anything flips the credentials stored now are tried, and the flip
  is conditional on them still being stored; before a mailbox is marked, it's asked again too, and the same goes for
  that mark.
  Refused credentials flip every connection to `delegation_failing` in one update (compare-and-set on the delegation: one webhook, log line and owner email), so
  every `status = 'active'` filter works with no join in the availability path, and one update brings them back. On
  the wire that status is `needs_reauth`. One mailbox gone only marks that connection, with no email to the host, who
  can't fix it, and only after that mailbox has been asked again with today's credentials. Graph's 403 can't say which,
  so `probeDelegation` asks about up to three mailboxes: a person leaving
  must not hide everyone, including when they're the verified one. With no other mailbox to ask it can't tell, and
  counts as the delegation's, so someone hears. An inconclusive probe changes nothing and backs off.
- **Tokens outlive a revocation** by up to an hour: Google's and Entra's tokens aren't recalled. A delegated client
  raises `auth` for what a revocation looks like (Graph's inner `$batch` 401/403, Google's `insufficientPermissions`),
  or it'd pass as a failed read or a permanent write failure.
- **A mailbox never reached still hides its host**: its connection gets a stand-in calendar row, since availability reads
  health through calendars and with none the host reads as free. `connectHost` replaces it, and gives it a write target
  if it turns out to be the primary. An email correction releases such a connection (`releaseUnreachedMailbox`): it
  has no events, and it's the only mailbox change that doesn't need `calendar_account`. `reached_at` is what says it was
  never reached: `verified_at` isn't, since toggling `read_busy` clears it.
  The same goes for hosts it hasn't connected when access is lost, or who are added during an outage
  (`hideUnconnectedHosts`), who are tried again as soon as it's back. A stand-in isn't shown on the wire or selectable.
- **Deleting** is `deleting`, then the worker, within a run's budget: each connection released (details scrubbed,
  channels stopped), then removed with the host locked `FOR UPDATE`, or a booking reading its write target would hit a foreign key. Hosts stay bookable with no conflict
  check (the dialog and docs say so), as with any disconnect.
- Bookers' live check and sync need no changes. Provider behaviour the fakes can't prove (granular scopes under
  domain-wide delegation, Graph ids matching between `/me` and `/users/{id}`, app-only subscriptions and Teams links)
  needs checking against a real Workspace and tenant when any of this changes.

## Team pages

`manager.ts`: a `manager` session reaches the hosts it names, or those matching `manager_host_filter` on every request
(`managedHosts`). There's no team table: who manages whom is the customer's to say, when they mint one. An empty filter
is refused at minting, since `{}` matches everyone. The exception is `createDashboardSession`: a dashboard member who opens
this page reaches every host of the environment, for an hour, acting as themselves, and it's in the audit log. The API
asks on every request whether they can still change Scheduling (`memberStillHolds`), since leaving an organization doesn't
end a session.

- It's checked before anything's read, and **again with the booking locked** (`fromHosts`, `toHosts` in `reassign.ts`):
  until then, a booking may have moved to someone out of reach. Someone else's looks like it doesn't exist.
- Bookings it reads are `ManagedBooking`: when, what and who's hosting. It never calls `toBookingObject` for a response,
  and `getBooking` only to check hosts, since a lead's job is cover and not the attendee.
- A run from a team page says who each goes to (`checkManagedRun`), since `otherwise: auto` could reach another team, and
  the worker has no session to ask. Its entries can't start a run either, by asking or by moving an entry that was made to
  (`startsNoRun`, a host's page too): moving bookings is its own step.
- A migration adding an enum value and using it in a check runs in one transaction, where a literal of the new value is
  refused (`55P04`): that's why `scheduling_session_scope` says `kind::text = 'manager'`.

`settings.host_reassignment` is `off` by default: with `eligible`, hosts can give their own bookings to someone free who
takes that event type, seeing names only, with no overrides, and being told no more than that someone can't (`namesOnly`).

A `link`, `phone` or `in_person` location left blank takes the value of the booked host's `locations`, once a host has
won (`withHostLocation`), and stays blank if they have none: nobody loses availability over it. It's stored with
`fromHost` (stripped from the wire, like `conference`), so a move to another host never keeps the old host's office. A
booking is a snapshot: editing a host only reaches new bookings. Hosts set these themselves from their page, and they
land in attendees' emails, so `hosts.ts` refuses links in addresses and screens new addresses and URLs; a phone number
is E.164, with no room to say anything. An event type's own locations get the same checks when set. Links must be
https, but a booking can hold an older one, so `Where` (`apps/scheduling`) never puts anything but a web link in an `href`.

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
- `scheduling_booking.encrypted_attributes` keeps what a booking was routed with, for choosing another host later. Null
  means that can't be known (booked before it existed, or erased or redacted), never "nothing narrowed it", which is
  an encrypted `{}`. It goes with the attendee's details: on redaction and on `eraseAttendee`.
- Answers come back only from `getBooking`: never lists, webhooks, logs, emails or calendars. The dashboard's iOS
  routes map bookings to name or uid only (`scheduling/wire.ts` under `apps/web/src/app/api/mobile/v1`).
- Webhooks and log lines carry ids, times and statuses. `request-log.ts` keeps no bodies of these routes.
- Host calendar events are private, titled "Appointment", with no attendees, unless the event type's
  `host_calendar_details` is `full`: then `calendar/details.ts` adds its title, and who's coming to the title and
  description. Nobody's ever invited through a provider (Graph can't be stopped from emailing them), answers never go
  there, a group session's event has only the title, and Zoom stays neutral (`detailedEvent`, `writes.ts`). HIPAA mode
  refuses `full` at setup, and is read again at each write.
- A provider's copy of someone's details has to go when ours does. `details_written` marks a row whose event may say
  more than "Appointment", and `scrub_pending` says details have to come off it.
- `detailsToSend` takes `FOR SHARE` on the organization and the attendee rows, then sets the mark, in one transaction:
  a plain read wouldn't wait for an uncommitted erasure or HIPAA enablement, and would send what they're removing. So
  erasures and redaction change the attendee rows **before** calling `rewriteDetailedEvents`, in one transaction, and
  `enableHipaaMode` updates the organization's row before its rewrite. The ledger row is locked last, or these deadlock.
- A write clears both flags only if `desired_version` hasn't moved since it started (`clearedUnlessNewer`), and a stale
  writer that sent details sets both again (`redrive`). A row with `scrub_pending` never gives up: it retries with capped
  backoff and reports to Sentry once, until the write lands or the provider says the event is gone. Never work out
  "is this a cleanup?" from what the event will say: erasing the attendee leaves a guest in the description.
- `description` is left out of writes to an event that never held details, so what a host wrote there stays.
- Known limit: disconnecting and deleting a delegation scrub what they can within a budget before access goes
  (`scrubDetailedEvents`, which can't stop either), and deleting a host, moving a delegated host's `calendar_account`
  or a host revoking access at the provider scrubs nothing. Those copies are
  out of reach, and the docs say so.
- A guest is a `scheduling_attendee` with `role = 'guest'`, only an email and optional name, and the attendee's zone and
  locale; `participants` lists the attendee first. The event type's `max_guests` (default 0, never on `group`) allows
  them, since each is an address someone typed that we then email. So in live environments they're only emailed from the
  customer's own `email_from`, never coss.com's, even when it stops being verified (`ownSenderOnly`). They get no manage link and no SMS, and hear nothing until a booking's
  confirmed (`guestsAreTold`, `notifications.ts`). Their emails say nothing the booker wrote. The booker
  and manage pages and the iOS app see only the attendee; a host's portal sees everyone on their own bookings. With no `uid`, a guest is erased by address (`POST /scheduling/attendees/erase`):
  never put the address in a path or the audit log.
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

`reminders.ts` is what a `reminders` list means, at the event type (which replaces the environment's) or the
environment; `null` everywhere is the old one reminder a day before, on `notifications.reminder`'s channels, keyed
`reminder`. Each rule makes rows, `started` and `ended` are rows every confirmed booking gets, and these rules hold:

- A rule's row names its rule and is timed from `anchor_at`, the moment as it was when queued. That, not the booking's
  `version`, is what makes it stale: a location or a no-show bumps the version and moves nothing. A row with no
  `anchor_at` came from a task older than this, mid-deploy, and keeps the version check.
- The dedupe key names the rule, timing and moment, so planning is safe to repeat (`reconcileReminders`, also run by
  the `scheduling-reminder-sync` loop when a list changes). A conflict revives a row only if it was `superseded` or
  `stale`: a booking moved away and back gets its reminder back, and nothing `sent` goes twice.
- **A rule is read again when its row is due** (`ruleVerdict`, `addEditedTargets`), so a row takes its rule's current
  words, timing and recipients and a removal needs no rebuild. Only a new rule needs rows made for existing bookings,
  and only for ones that haven't ended. A row never assumes the walk has run: it may not have, and it reaches only some
  bookings. The keys make the two safe together.
- **Customer words never leave under coss.com's address.** `subject`, `message` and `button` need `email_from`, and
  `coss*` on `SchedulingEmail` are always fixed copy, which is what the fallback sends. That also caps what coss.com
  pays for: without `email_from`, at most two rules send email (`withinCossAllowance`, checked at save and when due).
- `attendee_name` is what a booker typed, aimed at an address they chose: `safeName` renders one with a link in it as
  nothing. Answers are never variables. `sms_message` can't use names. `reminder-copy.ts` is client-safe, so the
  dashboard's preview runs the same code as the worker.
- A reminder's standard words, labels and values follow the recipient's language like any other message's
  (`standardSubject`, `standardLead`, `timeUntil`), and a fixed address takes the first host's. What a customer wrote
  has one version, in whatever language they wrote it.
- A `button` or `email_to` is checked against the injected `verifiedAddress` in live environments, and refused without
  one. A button's URL takes only `{{booking_id}}`, so what's sent is what was checked.
- A webhook row reports and finishes in one transaction, booking locked first like every other writer of these rows, so
  two workers can't both report. A webhook is never dropped for being late; an email or text is (`too_late`).
- `email_attendee` reaches guests too, on the same terms as other mail (`guestsAreTold`, `ownSenderOnly`): only from the customer's
  own address, with no manage link, and not for what isn't about them (a request, a no-show).
- What became of every row is public (`listBookingNotifications`) and never says who it went to.

Branding only applies under the customer's own `email_from`: `renderMessage` puts their name or logo and accent in
`html`, and `cossHtml`, what coss.com's address sends, has none of them. `scheduling_logo` holds a PNG or JPEG checked
by its bytes (`parseLogo`), never SVG. Emails carry it inline (`cid:`) and pages get it as a data URL from `/session`:
neither loads a remote image, since a request per open would say who's whose patient. A logo can't be screened like
text, and it can't hold a link.

## Billing

One `scheduling.bookings` unit per confirmed booking, series occurrence or group session, guarded by a compare-and-set
on `usage_recorded_at` (`recordUsage` doesn't dedupe). `reserve` runs after a host has won. Holds and pending approvals
aren't charged; reschedules are free; cancelled stays charged.

`scheduling.hosts` is one unit per day a live host exists (`next_fee_at`, its presence is what makes a host live for
the plan's count): on creation (reserved like a new inbox: past a capped plan's allowance it's refused), then
`chargeDueHostFees` (the worker's `scheduling-host-fees`, which also gives a date to any live host without one, such as
one an older task made during a rollout), and `deleteHost` charges what's due (those two only ever write
off past the allowance). Nothing is recorded before `meterPricedFrom` (2027-01-01): hosts wait with `next_fee_at` at that date.

## Plans and holds

`plan.ts`. **Live only**: sandbox has everything on every plan, so a team builds first and meets the plan at go-live.
Injected as `SchedulingDeps.plans`; without it nothing is enforced. What the plan decides:

- `schedulingHosts` (`createHost`, across live environments, under an advisory lock). Free and Pro stop; Scale has no
  limit and is charged past what it includes.
- `schedulingHolds` (`createHold`), `schedulingHostPortal` (`createHostSession` from the API only: a dashboard member's
  own look passes no gate, and host invitation emails stay on every plan), `schedulingRouting` (`host_filter`, and
  `attributes` at the API's routes, never in `book()`: a session's were checked when it was made).
- `schedulingGroupSeats` (growing a `capacity`) and `schedulingSearchHosts` (`maxHosts`: a search looks at that many and
  says `has_more`, it never fails).
- `schedulingWhiteLabel` (`coss_attribution` in the client API's `/session`).
- `scheduling.slots.second` (`limitSchedulingSlots` in the API): live slot lists and searches per organization.

Using a feature reads the plan in effect (`requireLiveFeature`, `currentLimit`): a scheduled downgrade changes nothing
until it applies. Setting up something that outlives the request (`requireLiveFeatureToCreate`, `requireCapacity`) is also
checked against the plan to come, like every creation in billing.

Gates take a connection of their own, so they never run inside a transaction: holding one connection while waiting for
another stalls the pool under load. They run before it, and `gateNewRequest` skips a retry of a key still in its window (an expired key makes something
new, so it meets the plan).

A person on a hosted page never meets a plan gate (Free's booking allowance aside): a session's attributes aren't
checked again. Never gate the double-booking guarantee, calendars or series. A filter or a group size that exists keeps working whatever the plan; a downgrade is refused only for live
`host_filter`s (the dashboard's preflight).

`refuseNewBookingWhileHeld`, once the row is known to be new so a retry still answers with what it made: a billing hold
or the project's budget stops new live bookings, holds and series (402; new hosts too, `refuseNewHostWhileHeld`), and
the booker's page says only that the account can't take bookings. Confirming a hold and approving keep working: the
customer may have taken payment for them.

## Testing

`test/bookings.test.ts` races on real Postgres. `test/engine-differential.test.ts` compares `buildAvailability` with
fixtures generated from Cal.com's `buildDateRanges`; the one intended difference is that Cal.com's overrides can spill
outside the requested window. `FakeGoogleCalendarApi` (`./testing`) echoes writes back as busy, as the real one does, and checks a service account's
signature (`testServiceAccount`); `FakeGraphApi` only answers `/users/{mailbox}` paths, so a client left on `/me` shows.

`bun run --cwd apps/worker scheduling:load` (`--hosts 500 --days 14 --concurrency 32 --bookings 500 --existing 20 --busy
10 --away 2 --searches 30 --races 20 --big-table-rows 5000`, `--sandbox`, `--capped`) measures search, slots and booking on the
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
