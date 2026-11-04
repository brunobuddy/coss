---
"coss": minor
"coss-cli": patch
---

Scheduling's calendar delegations: `coss.scheduling.calendarDelegations` lets an admin authorize a Google Workspace or Microsoft 365 domain once, so every host on it gets their calendar with no consent screen. Hosts gain `calendar_account`, calendar connections gain `delegation`, and there are `scheduling.calendar_delegation.failing` and `.restored` webhooks. `coss open scheduling-calendar-delegation` opens its dashboard page.
