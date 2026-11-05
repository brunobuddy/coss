---
"coss": minor
"coss-mcp": minor
"coss-cli": minor
---

Reassign scheduling bookings: `coss.scheduling.bookings.reassign` gives any kind of booking to another host, keeping its id and time, and `reassignCandidates` says who could take it and why not. Adds a `scheduling.booking.reassigned` webhook with `previous_host_ids`, `reassignment_enabled` on event types and `name_host_in_attendee_emails` in settings. The MCP server gets reassign and out of office tools, and the CLI `coss scheduling reassign`, `candidates` and `ooo`.
