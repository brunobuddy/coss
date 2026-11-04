-- 0121 marked every existing row as named. A host a filter found got its row in the transaction of
-- their first booking, so the row and that booking have the same `now()`; named rows never do.
-- A row whose first booking has been purged stays named, as it is today.
UPDATE "scheduling_event_type_host" AS h
SET "assigned" = false
FROM "scheduling_event_type" AS e
WHERE e."id" = h."event_type_id"
  AND e."organization_id" = h."organization_id"
  AND e."kind" = 'pool'
  AND e."host_filter" IS NOT NULL
  AND h."assigned"
  AND h."role" = 'member'
  AND h."weight" = 100
  AND h."schedule_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "scheduling_booking" AS b
    JOIN "scheduling_booking_host" AS bh
      ON bh."booking_id" = b."id" AND bh."organization_id" = b."organization_id"
    WHERE b."event_type_id" = h."event_type_id"
      AND b."organization_id" = h."organization_id"
      AND bh."host_id" = h."host_id"
      AND b."created_at" = h."created_at"
  );
