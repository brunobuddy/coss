---
"coss": minor
"coss-mcp": minor
"coss-cli": minor
---

Setup and diagnosis know every product. `fetchSetupReport(coss, { product })`, the MCP server's `get_setup` and `coss init --product` say what a product still needs or how to try it in a sandbox, and report `products` and `products_in_use` next to the fields they had. `coss/diagnose` adds SMS, Verify, Sign, Forms, Hooks and Scheduling, as MCP tools (`diagnose_verification`, `diagnose_sign_request`, `diagnose_form_submission`, `diagnose_hook_delivery`, `diagnose_scheduling_slots`) and CLI commands (`coss sms diagnose`, `coss verify diagnose`, `coss sign diagnose`, `coss forms diagnose`, `coss hooks diagnose`, `coss scheduling diagnose`). The MCP server also gets `list_email_templates`, log drain and sub-account tools, `api_get` (a read-only fallback for any `/v1/` path), output schemas on `get_setup` and the diagnose tools, and its first prompts and resources.
