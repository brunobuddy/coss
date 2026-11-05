---
"coss": minor
"coss-mcp": minor
"coss-cli": minor
---

Move many scheduling bookings at once: `coss.scheduling.reassignments` previews who each would go to, runs it in the background with an outcome per booking, and can cancel and undo. Out of office entries take `existing_bookings: "reassign"` to start one. Adds a `scheduling.reassignment.completed` webhook. The MCP server gets preview, create, get, cancel and undo tools, and the CLI `coss scheduling reassign-many`, `reassignments` and `reassignment`.
