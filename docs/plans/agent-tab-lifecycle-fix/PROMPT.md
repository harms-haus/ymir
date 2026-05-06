# Agent Tab Lifecycle Fix

## Problem Statement

Agent tabs in Ymir appear to never spawn or are never attached to the agent tab UI. The agents seem to not initialize correctly through the lifecycle. We need to identify the likely interrupt in the lifecycle of an agent tab and fix it.

## Context

- The terminal tab lifecycle is a working reference implementation — review it as the example of correct behavior.
- The agent system uses ACP (agent-client-protocol) through the `acp-chat-core` library.
- `acp-chat-core` and related libraries are at `~/acp-chat-ui-react/` and are intended to be publishable, independent packages.
- Do NOT contaminate `acp-chat-ui-react` with changes specifically for Ymir. Both libraries must remain independently publishable.
- The Ymir project is at the current working directory.

## Requirements

1. Research the agent tab lifecycle end-to-end, comparing it against the terminal tab lifecycle (the working reference).
2. Identify where the lifecycle breaks — why agents never spawn or attach.
3. Plan various fixes for the identified issues.
4. Implement those fixes, with a review subagent between each implementer.
5. Fix any issues found during review before moving on.
6. Any changes to `acp-chat-core` or related libs must be generic improvements, not Ymir-specific.

## Key Files to Investigate

### Rust Server (Agent Domain)
- `crates/ws-server/src/agent/` — Agent handlers
- `crates/ws-server/src/protocol/agent.rs` — Agent protocol types
- `crates/ws-server/src/protocol/acp.rs` — ACP wire types
- `crates/ws-server/src/router.rs` — Message routing

### TypeScript Client
- `apps/web/src/store.ts` — Zustand store + handleBridgeMessage
- `apps/web/src/lib/bridge-transport.ts` — Client encoder/decoder
- `apps/web/src/lib/yws-transport.ts` — WebSocket transport
- `apps/web/src/types/protocol.ts` — Client protocol types + type guards
- `apps/web/src/components/agent/` — Agent UI components

### ACP Libraries (~/acp-chat-ui-react/)
- `acp-chat-core/` — Core ACP chat library
- Related packages in the monorepo

### Reference Implementation (Terminal)
- `crates/ws-server/src/pty/handler.rs` — Terminal handlers (working reference)
- `crates/ws-server/src/protocol/terminal.rs` — Terminal protocol types (working reference)
- `apps/web/src/components/terminal/TerminalView.tsx` — Terminal UI (working reference)
