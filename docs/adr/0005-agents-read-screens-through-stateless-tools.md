---
status: accepted
---

# Agents read the same Screens through stateless tools

codezoom serves coding agents through an MCP server (`codezoom mcp`) and a
`--json` CLI mode, both answering from the Screens it already computes for
the page (ADR 0004). There are three tools: `search`, `screen` and
`references`. They keep no Trail for the agent, so a Drill is just another
`screen` call. They return file:line instead of source, and each row is
capped (25 by default, with totals and `filter` / `limit` / `offset`). We
chose this because it costs almost nothing on top of v1 and keeps an agent's
context small, and stateless calls cannot drift out of step with an agent
that juggles several questions at once.

## Considered Options

- **A stateful navigation session that mirrors the page's Trail, with Drill
  and Back tools.** Closer to the page, but every client would need its own
  session state, which gives an agent nothing it can't get by calling
  `screen` again.
- **Returning source code with each Screen.** Duplicates the agent's own
  file tools and floods its context on large types.
