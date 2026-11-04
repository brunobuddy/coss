-- Reminders already queued become the default rule's rows, timed from the booking's start. A row
-- whose version no longer matches its booking was going to finish as stale anyway, so it's left alone.
UPDATE "scheduling_notification" AS n
SET
  "reminder_key" = 'reminder',
  "reminder_anchor" = 'start',
  "reminder_offset_minutes" = -1440,
  "anchor_at" = b."start_at"
FROM "scheduling_booking" AS b
WHERE n."booking_id" = b."id"
  AND n."organization_id" = b."organization_id"
  AND n."kind" = 'reminder'
  AND n."finished_at" IS NULL
  AND n."booking_version" = b."version";
