-- Hosts who joined a running pool and haven't been booked yet, so their first booking doesn't start
-- a run of every booking until they've caught up: see `poolStartingUnits`.
UPDATE "scheduling_event_type_host" AS "joining"
SET "fair_units" = ceil("pool"."lowest_share" * "joining"."weight")::integer
FROM (
  SELECT "event_type_id", min("fair_units"::numeric / "weight") AS "lowest_share"
  FROM "scheduling_event_type_host"
  WHERE "role" = 'member' AND "removed_at" IS NULL AND "fair_units" > 0
  GROUP BY "event_type_id"
) AS "pool"
WHERE "joining"."event_type_id" = "pool"."event_type_id"
  AND "joining"."role" = 'member'
  AND "joining"."removed_at" IS NULL
  AND "joining"."fair_units" = 0;
