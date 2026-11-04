---
"coss": minor
"coss-mcp": minor
---

Scheduling bookings can have guests: set an event type's `max_guests`, then pass `guests` when booking. They're emailed about it, and `coss.scheduling.attendees.eraseByEmail()` erases someone known only by their address. An event type's `host_calendar_details: "full"` puts its title and who's coming on hosts' calendars instead of a neutral "Appointment". The MCP server's `create_scheduling_booking` takes `guests`.
