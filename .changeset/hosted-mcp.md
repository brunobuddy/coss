---
"coss-mcp": minor
---

The server is also hosted at `https://api.coss.com/mcp` (Streamable HTTP, stateless, authenticated with `Authorization: Bearer <API key>`), for clients that can't start a local process. `coss-mcp/http` is its handler, and `createCossMcpServer` takes `transport: "hosted"`, which offers no tool that touches files. `server.json` describes both for the MCP registry.
