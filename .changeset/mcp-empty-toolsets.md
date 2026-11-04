---
"coss-mcp": patch
---

An empty or whitespace `COSS_MCP_TOOLSETS` now means every tool, as an unset one does, instead of only the core tools. The Claude Code plugin's new optional `toolsets` setting passes it through, and is empty unless someone picks toolsets.
