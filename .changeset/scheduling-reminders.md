---
"coss": minor
"coss-mcp": minor
"coss-cli": minor
---

Scheduling reminders: `reminders` on `coss.scheduling.settings` and event types say what goes out around a booking, timed from its start, end or any change to it, to attendees, hosts, fixed addresses or a webhook, in your own words if you like. `coss.scheduling.bookings.notifications()` lists what was queued and why anything wasn't sent. New webhooks: `scheduling.booking.started`, `scheduling.booking.ended` and `scheduling.booking.reminder`. Hosts take a `phone`, event types take `notifications`, and settings take `email_reply_to`. The MCP server gets `get_scheduling_reminders`, `save_scheduling_reminders`, `list_scheduling_booking_notifications` and `mark_scheduling_no_show`, and the CLI `coss scheduling reminders`, `notifications` and `no-show`.
