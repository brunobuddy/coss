-- Fractional, so rescaling for a new weight can't round someone into a backlog.
ALTER TABLE "scheduling_event_type_host" ALTER COLUMN "fair_units" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "scheduling_booking_host" ADD COLUMN "fair_share" double precision;--> statement-breakpoint
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
