-- Reminders already queued become the default rule's rows, timed from the booking's start, with the
-- dedupe key that rule makes: planning then finds them, rather than taking them for something
-- no longer wanted and dropping what's due. A row whose version no longer matches its booking was going to
-- finish as stale anyway, so it's left alone.
UPDATE "scheduling_notification" AS n
SET
  "reminder_key" = 'reminder',
  "reminder_anchor" = 'start',
  "reminder_offset_minutes" = -1440,
  "anchor_at" = b."start_at",
  "dedupe_key" = 'reminder:reminder:-1440:' || n."channel" || ':' || n."recipient" || ':' || b."id" || ':'
    || floor(extract(epoch FROM b."start_at") * 1000)::bigint
FROM "scheduling_booking" AS b
WHERE n."booking_id" = b."id"
  AND n."organization_id" = b."organization_id"
  AND n."kind" = 'reminder'
  AND n."anchor_at" IS NULL
  AND n."finished_at" IS NULL
  AND n."booking_version" = b."version";
--> statement-breakpoint
-- Bookings confirmed before now have no `started` or `ended` rows. Each environment with any still to
-- come gets the walk a changed list gets, by the worker's usual code, a page at a time. It only adds
-- what's ahead, so nothing is sent because of this.
INSERT INTO "scheduling_reminder_sync" ("id", "organization_id", "environment_id")
SELECT DISTINCT
  'srsync_backfill_' || b."environment_id",
  b."organization_id",
  b."environment_id"
FROM "scheduling_booking" AS b
WHERE b."status" = 'confirmed'
  AND b."end_at" > now();
