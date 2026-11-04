-- Seats' calendar events and location move to their session: one event kept per calendar, others go.
CREATE TEMP TABLE scheduling_group_event_keeper ON COMMIT DROP AS
SELECT DISTINCT ON (b.group_session_id, e.host_id, e.calendar_id)
  e.id, b.group_session_id
FROM scheduling_calendar_event e
JOIN scheduling_booking b ON b.id = e.booking_id AND b.organization_id = e.organization_id
WHERE b.group_session_id IS NOT NULL
ORDER BY b.group_session_id, e.host_id, e.calendar_id,
  (e.desired_state = 'present') DESC,
  (e.provider_event_id IS NOT NULL) DESC,
  (b.status = 'confirmed') DESC,
  e.created_at, e.id;
--> statement-breakpoint
-- The kept event's seat knows the link that event has; otherwise the first seat still here.
UPDATE scheduling_group_session s
SET location = (
  SELECT b.location
  FROM scheduling_booking b
  LEFT JOIN scheduling_calendar_event e
    ON e.booking_id = b.id AND e.id IN (SELECT id FROM scheduling_group_event_keeper)
  WHERE b.group_session_id = s.id AND b.organization_id = s.organization_id
    AND b.location IS NOT NULL
  ORDER BY (e.id IS NOT NULL) DESC,
    (b.status IN ('confirmed', 'pending_approval', 'held')) DESC,
    b.created_at, b.id
  LIMIT 1
)
WHERE s.location IS NULL;
--> statement-breakpoint
UPDATE scheduling_calendar_event e
SET desired_state = 'absent',
  desired_version = e.desired_version + 1,
  next_attempt_at = clock_timestamp(),
  attempts = 0
FROM scheduling_booking b
WHERE b.id = e.booking_id AND b.organization_id = e.organization_id
  AND b.group_session_id IS NOT NULL
  AND e.desired_state = 'present'
  AND e.id NOT IN (SELECT id FROM scheduling_group_event_keeper);
--> statement-breakpoint
-- A session whose seats left in the wrong order kept an event nobody could clean up.
WITH moved AS (
  SELECT k.id, k.group_session_id,
    CASE WHEN EXISTS (
      SELECT 1 FROM scheduling_booking b
      WHERE b.group_session_id = k.group_session_id AND b.status = 'confirmed'
    ) THEN 'present' ELSE 'absent' END::scheduling_calendar_event_state AS state
  FROM scheduling_group_event_keeper k
)
UPDATE scheduling_calendar_event e
SET group_session_id = m.group_session_id,
  booking_id = NULL,
  desired_state = m.state,
  desired_version = e.desired_version + (e.desired_state <> m.state)::int,
  next_attempt_at = CASE WHEN e.desired_state <> m.state THEN clock_timestamp() ELSE e.next_attempt_at END,
  attempts = CASE WHEN e.desired_state <> m.state THEN 0 ELSE e.attempts END
FROM moved m
WHERE m.id = e.id;
