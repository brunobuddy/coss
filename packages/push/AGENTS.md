# packages/push — push notifications to the iOS app

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Push notifications** (`packages/push`, tables `push_device` (ids `pushdev_`) and `push_notification` (`pushntf_`)):
  the app registers its raw APNs token on its own session (`PUT/PATCH/DELETE /api/mobile/v1/push`, `GET` reads it;
  categories `reputation`, `billing`, `endpoints`, `risk_reviews` per device). A device row has `session_id` → `session`
  **ON DELETE CASCADE**: signing out, revoking the session, password resets, bans and the expired-session purge end
  its pushes — never key devices by user alone. A token is unique (`push_device_token_idx`): registering it takes an
  advisory lock on it and removes its other rows (a re-signed-in or handed-over phone). The app's sign-out also
  unregisters from APNs and, offline, keeps the credential to revoke on a later start. Products call `enqueuePush(tx, …)` in the transaction that decided the event — reputation
  warnings/suspensions (`applyTransition`), failed payments and holds (`enqueueBillingNotification`, `PUSHED`, so
  once per `dedupe_key`), endpoints, Hooks endpoints and log drains disabled for failing, and risk reviews in
  **live** environments (`collapse_key` `risk_review:<env id>`: a pending row absorbs later ones, and the worker sends
  at most one per environment every `PUSH_THROTTLE_MS`). The worker's `push-notifications` loop
  (`runDuePushNotifications`, system-level; lease, backoff, `failed` after 8 attempts) fences every write with the
  claimed `attempt_count`, renews the lease after each device and stops once it lost it; events that coalesced into a
  notification after its claim (`count` grew) get a follow-up notification when it settles. It resolves **at send time**:
  the subject must still be in that state (else `skipped`/`resolved`; older than an hour: `too_old`), the paths use
  current slugs, and the recipients (`pushTargets`) are unexpired, unimpersonated app sessions of unbanned members
  whose role can act on it (`AUDIENCE`) and whom `orgAccess` (`@coss/auth/org-access`, shared with the dashboard)
  lets in — the app would refuse to show anything else. `delivered_device_ids` keeps a retry from sending twice;
  APNs' `Unregistered`/`BadDeviceToken` deletes the device. The text passes through Apple: organization, project and
  environment names and counts only — never free-form text (descriptions, application names), addresses, URLs,
  scores or notes. The payload's `body.path` (what expo-notifications calls `data`) is a
  route of the app, which keeps the dashboard's former path shape (`/<org>/projects/<project>/<env>/webhooks/…`,
  `/<org>/reputation`); the app opens only paths in its allow-list (`push-route.ts`).
