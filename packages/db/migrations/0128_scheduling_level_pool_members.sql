-- Fractional, so rescaling for a new weight can't round someone into a backlog.
ALTER TABLE "scheduling_event_type_host" ALTER COLUMN "fair_units" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "scheduling_booking_host" ADD COLUMN "fair_share" double precision;--> statement-breakpoint
-- What pool bookings that can still be cancelled added, even past ones, which can be moved into the
-- future, for when they're cancelled after a weight changes. The weight when
-- each was booked is gone, so this is today's, which is what their counter has counted in so far.
UPDATE "scheduling_booking_host" AS "added"
SET "fair_share" = 1.0 / "member"."weight"
FROM "scheduling_booking" AS "booking"
INNER JOIN "scheduling_event_type" AS "event_type" ON "event_type"."id" = "booking"."event_type_id"
INNER JOIN "scheduling_event_type_host" AS "member" ON "member"."event_type_id" = "booking"."event_type_id"
WHERE "added"."booking_id" = "booking"."id"
  AND "member"."host_id" = "added"."host_id"
  AND "added"."role" = 'member'
  AND "event_type"."kind" = 'pool'
  AND "booking"."status" IN ('held', 'pending_approval', 'confirmed');--> statement-breakpoint
-- Hosts who joined a running pool and haven't been booked yet, so their first booking doesn't start
-- a run of every booking until they've caught up: see `startingUnits`.
UPDATE "scheduling_event_type_host" AS "joining"
SET "fair_units" = "pool"."lowest_share" * "joining"."weight"
FROM (
  SELECT "member"."event_type_id", min("member"."fair_units" / "member"."weight") AS "lowest_share"
  FROM "scheduling_event_type_host" AS "member"
  INNER JOIN "scheduling_host" AS "host" ON "host"."id" = "member"."host_id"
  WHERE "member"."role" = 'member'
    AND "member"."removed_at" IS NULL
    AND "member"."fair_units" > 0
    AND "host"."status" = 'active'
  GROUP BY "member"."event_type_id"
) AS "pool"
WHERE "joining"."event_type_id" = "pool"."event_type_id"
  AND "joining"."role" = 'member'
  AND "joining"."removed_at" IS NULL
  AND "joining"."fair_units" = 0;
