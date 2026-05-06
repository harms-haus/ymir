# Orchestrator Notes

## Decisions
- Approach D (Accumulator-First UI) selected
- No server changes needed — server ACP runtime works correctly
- No upstream library changes — acp-chat-ui-react stays clean
- `acpSessionManager` kept for backward compatibility but not used for agent tabs

## Implementation Status
- Phase 1: COMPLETE (yws-transport.ts — accumulator dispatch)
- Phase 2: COMPLETE (AcpChat.tsx — rewrite to use accumulator)
- Phase 3: COMPLETE (store.ts — dead handler update)
- Phase 4: COMPLETE (yws-transport.ts — acpSessionId population)
- Phase 5: COMPLETE (AcpChatComposer removed during Phase 2)

## Final Review: PASSED
- TypeScript compiles cleanly
- End-to-end lifecycle verified conceptually
- No cross-boundary contamination
- No new crypto.randomUUID() violations
- Pre-existing bug found: AgentPane.tsx:198 uses crypto.randomUUID() without fallback (not in scope)

## Files Changed
1. apps/web/src/lib/yws-transport.ts — Phases 1 & 4
2. apps/web/src/components/agent/AcpChat.tsx — Phase 2 (rewrite)
3. apps/web/src/store.ts — Phase 3
4. apps/web/src/components/agent/acp-chat.css — Phase 2/5 (cleanup)
