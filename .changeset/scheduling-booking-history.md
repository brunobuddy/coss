---
"coss": minor
"coss-mcp": minor
"coss-cli": minor
---

Scheduling bookings have a readable history: `coss.scheduling.bookings.events(id)`, the MCP server's `list_scheduling_booking_events` and `coss scheduling booking-events`. A cancelled booking says who cancelled it in `cancelled_by`, and `bookings.cancel` takes an optional `reason`, which only retrieving that booking returns. `bookings.cancel`'s second argument is now its parameters, and request options moved to the third, as on `series.cancel`.
