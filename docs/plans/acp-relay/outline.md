# ACP JSON-RPC Relay — Implementation Outline

## Problem
Inbound `BridgeMessage::AcpPayload` messages are silently dropped by the ws-server router. The client's `SessionController` sends ACP JSON-RPC (`initialize`, `session/list`, `session/prompt`, etc.) but never gets responses, leaving the Composer in permanent `disconnected` state.

## Solution
Add server-side ACP JSON-RPC relay that intercepts inbound `AcpPayload` messages in the router, translates JSON-RPC methods to existing `AcpHandle` commands, and responds with JSON-RPC results wrapped in `BridgeMessage::AcpPayload`.

## Branch
`feat/acp-jsonrpc-relay`

## Runes

### Epic 1: Core Relay
- **R1**: ACP JSON-RPC dispatcher module (`crates/ws-server/src/agent/jsonrpc_relay.rs`)
  - Parse inbound AcpPayload JSON-RPC
  - Dispatch by method: initialize, session/list, session/new, session/load, session/prompt, session/cancel, session/set_config_option
  - Return JSON-RPC response values

- **R2**: Router integration (`crates/ws-server/src/router.rs`)
  - Handle `DecodedMessage::NonClient(BridgeMessage::AcpPayload { payload })`
  - Forward to dispatcher
  - Encode response as `BridgeMessage::AcpPayload` and return

### Epic 2: AcpHandle Extensions
- **R3**: Add `AcpCommand::GetSessions` and `AcpCommand::Initialize` variants
  - `GetSessions` → return list of active agent_tab_ids for a worktree
  - These map to `session/list` and `initialize` JSON-RPC methods

### Epic 3: Wiring & Verification
- **R4**: Wire dispatcher to AcpHandle + AppState
  - Dispatcher needs access to AcpHandle and client's worktree association
  - Map JSON-RPC methods to AcpCommand variants

- **R5**: Integration verification
  - Verify SessionController lifecycle works end-to-end
  - Verify Composer connects and can send prompts
  - Verify existing AgentSend/AgentCancel still works

## Dependencies
```
R1 ──→ R2 ──→ R4 ──→ R5
              ↗
     R3 ──→ R4
```

R1 and R3 can be developed in parallel. R2 depends on R1. R4 depends on R2 and R3. R5 depends on R4.
