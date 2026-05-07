# Orchestrator Notes

## Decision Log

1. **acp-chat-react vs @assistant-ui/react**: User chose full migration to acp-chat-react
2. **Store adapter approach**: ~~Chose Option B~~ → REVISED to Option A. `acp-session-manager.ts` already has full YmirAcpTransport → SessionController → AcpStore pipeline. Only gap: `getOrCreateController()` never called from production code. No changes needed to acp-chat-react.
3. **Component to build on**: AgentChat.tsx (has tool rendering, config selectors) — but it will be replaced by acp-chat-react components
4. **Scrollbar**: Global CSS already handles 3px/no-track/rounded. Only fade-on-idle needs adding.

## Architecture Decisions

### Store-Only Mode for acp-chat-react — NOT NEEDED
~~User confirmed: implement store-only mode as a generic, clean addition~~
REVISED: `acp-session-manager.ts` already has the full pipeline (YmirAcpTransport → SessionController → AcpStore). The only gap is that `getOrCreateController()` is never called from production code, so controllers are never created. No changes to acp-chat-react are needed.

### Ymir Integration Layer
- Existing `acp-session-manager.ts` already provides:
  - `getOrCreateController(agentTabId, worktreeId)` — creates YmirAcpTransport → SessionController → AcpStore
  - `handleAcpPayloadByAgentTabId(agentTabId, payload)` — routes events through the pipeline
  - `getAcpStore(agentTabId)` — returns the AcpStore for a tab
  - `removeController(agentTabId)` — cleanup when tab closes
- **Gap**: `getOrCreateController()` is never called from production code → controllers never created → events dropped
- **Fix**: Wire `AgentPane.tsx` to call `acpSessionManager.getOrCreateController()` when agent sessions appear

### UI Components
- Replace `@assistant-ui/react` primitives with `acp-chat-react` components
- `Thread` component with `layout="expanded"` (full width per requirements)
- `Composer` component with custom `renderSettingsRow` for ACP Mode/Model/Session selects
- Custom CSS for user message bubbles, agent message on-surface, tool stack expandability
- Scrollbar fade behavior via custom hook + CSS
- "Jump to Latest" via built-in Thread scroll-to-bottom feature

### Files That Will Change
- `apps/web/src/components/agent/AcpChat.tsx` — Rewrite to use acp-chat-react components
- `apps/web/src/components/agent/AgentPane.tsx` — Wire up acpSessionManager to create controllers and pass store/controller to AcpChat
- `apps/web/src/components/agent/acp-chat.css` — Updated styling for new component structure

### New Files
- `apps/web/src/hooks/useScrollbarFade.ts` — Custom hook for 5-second scrollbar fade
- `apps/web/src/components/agent/YmirSettingsRow.tsx` — Custom settings row for Composer (mode/model/session selects)

### Unchanged Files
- `~/acp-chat-ui-react/packages/acp-chat-react/` — No changes needed (SessionController pipeline already works)
- `apps/web/src/lib/acp-session-manager.ts` — Already provides everything needed
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx` — Kept for backward compat; AcpChat no longer uses it
- `apps/web/src/store.ts` — Accumulator still runs; new UI reads from AcpStore instead
- No new `ymir-acp-bridge.ts` needed (acp-session-manager.ts handles this)
