-- Who cancelled bookings cancelled before `cancelled_by` existed: their last cancellation event says.
UPDATE "scheduling_booking" AS "booking"
SET "cancelled_by" = "last_event"."actor" ->> 'kind'
FROM (
  SELECT DISTINCT ON ("booking_id") "booking_id", "actor"
  FROM "scheduling_booking_event"
  WHERE "type" = 'scheduling.booking.cancelled'
  ORDER BY "booking_id", "sequence" DESC
) AS "last_event"
WHERE "booking"."id" = "last_event"."booking_id"
  AND "booking"."status" = 'cancelled'
  AND "booking"."cancelled_by" IS NULL;
