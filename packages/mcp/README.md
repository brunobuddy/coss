# coss-mcp

The [Model Context Protocol](https://modelcontextprotocol.io) server for [coss.com](https://coss.com). Your
coding agent can ask "did the welcome email to jane@example.com get delivered?" (or "did the code we
texted +14155550123 arrive?") and get the answer: the message, what happened to each recipient and why,
and what to do about it.

```sh
claude mcp add coss -e COSS_API_KEY=coss_test_… -- npx -y coss-mcp
```

Any MCP client works the same way: run `npx -y coss-mcp` with `COSS_API_KEY` in its environment.
Setup for Cursor, VS Code and Codex: [coss.com/docs/mcp](https://coss.com/docs/mcp).

Published from [cosscom/coss](https://github.com/cosscom/coss) by CI, with
[provenance](https://docs.npmjs.com/generating-provenance-statements).

## Configuration

| Variable | |
| --- | --- |
| `COSS_MCP_TOOLSETS` | Fewer tools: a comma-separated list of `email`, `marketing`, `inboxes`, `sms`, `verify`, `sign`, `forms`, `scheduling`, `webhooks`, `hooks`, `risk`, `subaccounts`, `log_drains`. Docs, `get_setup`, logs, `get_account_status` and `api_get` are always there. Default: every tool. |
| `COSS_API_KEY` | A `coss_test_…` (development) or `coss_live_…` (production) key; the server sees that key's environment. Without one, a `coss_test_` key in the project's `.env.local` or `.env` is used (`npx coss-cli init` writes it). A `coss_live_` key in that file is never loaded. With no key at all, only the docs tools are available. |
| `COSS_BASE_URL` | Another API origin, e.g. `http://localhost:3001`. Defaults to `https://api.coss.com`. |

Configuration is read from the environment only, never from command-line arguments, which other
local processes can read.

API keys can do everything the API can: through this server the agent can also send email and SMS
and change suppressions and domains. Tools are annotated (`readOnlyHint`, `destructiveHint`) so clients
can ask before calling the ones that change something.

## Tools

| Area | Tools |
| --- | --- |
| Docs (no key needed) | `search_docs`, `read_docs` |
| Email delivery | `diagnose_email`, `find_emails`, `get_email` |
| Sending | `send_email`, `cancel_email`, `reschedule_email` |
| Suppressions | `check_suppression`, `list_suppressions`, `add_suppression`, `remove_suppression` |
| Domains | `list_domains`, `get_domain`, `add_domain`, `verify_domain` |
| Webhooks | `list_webhook_endpoints`, `list_webhook_deliveries`, `get_webhook_delivery`, `retry_webhook_delivery`, `create_webhook_endpoint` |
| Receiving | `get_inbound_address`, `list_received_emails`, `get_received_email` |
| Inboxes | `create_inbox`, `list_inboxes`, `list_inbox_threads`, `get_inbox_thread`, `send_inbox_message`, `reply_to_inbox_message` |
| SMS | `diagnose_sms`, `find_sms`, `get_sms`, `send_sms`, `cancel_sms`, `list_received_sms`, `list_sms_numbers` |
| SMS suppressions | `check_sms_suppression`, `add_sms_suppression`, `remove_sms_suppression` |
| Logs | `search_logs`, `get_log` |
| Setup | `get_setup` (with `product`: that product's readiness and next step) |
| Templates | `list_email_templates`, `pull_email_template`, `push_email_template`, `publish_email_template` |
| Marketing | `list_contacts`, `upsert_contact`, `list_audiences`, `save_audience`, `list_segments`, `save_segment`, `list_topics`, `save_topic`, `list_broadcasts`, `get_broadcast`, `save_broadcast`, `send_test_broadcast`, `send_broadcast`, `cancel_broadcast`, `get_marketing_settings`, `update_marketing_settings` |
| Verify | `diagnose_verification`, `start_verification`, `check_verification`, `list_verifications`, `get_verification`, `cancel_verification`, `get_verify_settings`, `update_verify_settings` |
| Sign | `diagnose_sign_request`, `upload_sign_document`, `list_sign_requests`, `get_sign_request`, `get_sign_audit_trail`, `create_sign_request`, `create_sign_request_from_template`, `send_sign_request`, `remind_sign_request`, `cancel_sign_request`, `create_sign_session`, `list_sign_templates`, `create_sign_template`, `get_sign_settings`, `update_sign_settings` |
| Hooks | `diagnose_hook_delivery`, `list_hook_applications`, `create_hook_application`, `list_hook_event_types`, `create_hook_event_type`, `list_hook_endpoints`, `create_hook_endpoint`, `send_hook_message`, `send_hook_test_message`, `list_hook_deliveries`, `list_hook_attempts`, `retry_hook_delivery`, `create_hook_portal_session` |
| Risk | `assess_risk`, `list_risk_assessments`, `get_risk_assessment`, `record_risk_feedback`, `list_risk_rules`, `list_risk_list_entries`, `add_risk_list_entry`, `remove_risk_list_entry`, `get_risk_settings`, `check_email_risk`, `check_ip_risk`, `check_phone_risk` |
| Forms | `diagnose_form_submission`, `list_forms`, `get_form`, `save_form`, `list_form_submissions`, `get_form_submission`, `release_form_submission` |
| Scheduling | `diagnose_scheduling_slots`, `list_scheduling_hosts`, `save_scheduling_host`, `list_scheduling_schedules`, `save_scheduling_schedule`, `list_scheduling_calendars`, `authorize_scheduling_calendar`, `list_scheduling_event_types`, `save_scheduling_event_type`, `list_scheduling_slots`, `search_scheduling_availability`, `list_scheduling_bookings`, `get_scheduling_booking`, `create_scheduling_booking`, `reschedule_scheduling_booking`, `cancel_scheduling_booking`, `create_scheduling_session`, `list_scheduling_reassign_candidates`, `reassign_scheduling_booking`, `preview_scheduling_reassignment`, `create_scheduling_reassignment`, `get_scheduling_reassignment`, `cancel_scheduling_reassignment`, `undo_scheduling_reassignment`, `list_scheduling_out_of_office`, `create_scheduling_out_of_office`, `delete_scheduling_out_of_office`, `list_scheduling_out_of_office_conflicts` |
| Sub-accounts | `list_subaccounts`, `get_subaccount`, `create_subaccount`, `update_subaccount`, `delete_subaccount`, `reinstate_subaccount`, `get_subaccount_stats` |
| Log drains | `list_log_drains`, `get_log_drain`, `create_log_drain`, `update_log_drain`, `delete_log_drain`, `list_log_drain_batches` |
| Account | `get_account_status` |
| Everything else | `api_get`: GETs any `/v1/` path; refuses anything else, signing secrets and files |

Prompts: `add_product`, `debug_delivery`, `prepare_go_live`. Resources: `coss://docs/index` (no key
needed), `coss://setup`. `get_setup` and the `diagnose_*` tools declare an `outputSchema`.

## As a library

`createCossMcpServer` returns the server unconnected, for another transport or an existing client:

```ts
import { Coss } from "coss";
import { createCossMcpServer } from "coss-mcp";

const apiKey = process.env.COSS_API_KEY;
const server = createCossMcpServer({ coss: new Coss({ apiKey }), apiKey });
```

`diagnoseEmail({ email, events, context })` and `diagnoseSms({ sms, events, context })`, the pure
functions behind `diagnose_email` and `diagnose_sms`, come from the SDK's `coss/diagnose` (re-exported
here), as do the other products' diagnoses.

## Development

```sh
bun run --cwd packages/mcp build   # tsdown, publint, attw
bun run --cwd packages/mcp test
COSS_API_KEY=coss_test_… COSS_BASE_URL=http://localhost:3001 npx @modelcontextprotocol/inspector node packages/mcp/dist/cli.js
```

## License

MIT
