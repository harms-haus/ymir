# acp-chat-react Store Adapter Research

## Core Finding: SessionController is the Integration Point

`acp-chat-react` components (`Thread`, `Composer`, `ToolCall`, etc.) all depend on `AcpStore`, which wraps a `SessionController` from `acp-chat-core`.

### SessionController Interface (what we need to shim)

```typescript
class SessionController {
  // Construction
  constructor(transport: Transport, requestTimeoutMs?: number)
  
  // Lifecycle
  connect(): void
  disconnect(): void
  initialize(options?): Promise<unknown>
  createSession(cwd: string, mcpServers?: unknown[]): Promise<unknown>
  loadSession(sessionId: string, cwd: string, mcpServers?: unknown[]): Promise<unknown>
  listSessions(cursor?: string, cwd?: string): Promise<{sessions, nextCursor?}>
  
  // Core actions (used by Composer)
  sendPrompt(sessionId: string, prompt: string): Promise<void>
  cancelPrompt(sessionId: string): Promise<void>
  
  // Permission actions (used by PermissionRequestCard)
  respondToPermission(requestId: number, optionId: string): Promise<void>
  cancelPermission(requestId: number): Promise<void>
  
  // Config
  setConfigOption(sessionId: string, configId: string, value: string): Promise<ConfigOption[]>
  
  // State
  getState(): SessionControllerState
  
  // Events (what AcpStore subscribes to)
  on(event: "statusChange", handler: (state) => void): () => void
  on(event: "sessionUpdate", handler: (params: SessionUpdateParams) => void): () => void
  on(event: "error", handler: (error: Error) => void): () => void
  on(event: "sessionClearing", handler: () => void): () => void
  on(event: "permissionRequest", handler: (params) => void): () => void
  on(event: "configOptions", handler: (configOptions: ConfigOption[]) => void): () => void
}
```

### AcpStore Integration

```typescript
class AcpStore {
  constructor(sessionController: SessionController, config?: AcpStoreConfig)
  // Provides: subscribe(), getSnapshot(), getServerSnapshot()
  // Plus convenience: getMessages(), getToolCalls(), getTimeline(), etc.
}
```

### Component Props

| Component | Props | Key Dependencies |
|-----------|-------|------------------|
| `Thread` | `store: AcpStore`, `controller?: SessionController`, styling/layout props | Reads timeline, messages, thoughts, tool calls |
| `Composer` | `store: AcpStore`, `controller: SessionController`, callbacks | Calls `controller.sendPrompt()`, `controller.cancelPrompt()` |
| `ToolCall` | Data props (toolCall object), expansion callbacks | Pure data-driven, no store dependency |
| `MessageCard` | Data props (message object) | Pure data-driven |
| `ThoughtStack` | Data props + expansion state | Pure data-driven |
| `SettingsPanel` | `store: AcpStore`, `controller: SessionController` | Config options |
| `SessionList` | `controller: SessionController` | Session listing |

## Migration Strategy: YmirSessionController Adapter

Since Ymir's server intermediates the ACP connection (server is the ACP client, not the browser), we need a `YmirSessionController` that implements the `SessionController` interface but:

1. **`sendPrompt()`** → Dispatches `AgentSend` via Ymir's WebSocket
2. **`cancelPrompt()`** → Dispatches `AgentCancel` via Ymir's WebSocket  
3. **`initialize()` / `createSession()`** → Sends `AgentSpawn` via Ymir's WebSocket
4. **`sessionUpdate` events** → Fed from Ymir's `acpAccumulator` state changes (ACP events arrive as `acp_payload` bridge messages → `dispatchAccumulator()` → adapter translates to `sessionUpdate` format)
5. **`statusChange` events** → Fed from agent session status updates
6. **`permissionRequest` events** → Fed from ACP permission events in the accumulator
7. **`configOptions` events** → Fed from session init config options

### What we need to create in Ymir:

1. **`YmirSessionController`** — Class implementing `SessionController`'s public interface
   - Internal event emitter pattern matching the original
   - Translation layer between Ymir WS messages and ACP actions
   - Plugs into Ymir's WebSocket transport (via store actions)

2. **`YmirTransport`** — Implements `Transport` interface (or we skip Transport entirely and override methods)
   - Actually: `SessionController` constructor requires a `Transport`. We could create a no-op transport since Ymir doesn't use direct ACP transport.

3. **Integration in AgentPane/AcpChat** — Replace `@assistant-ui/react` primitives with `acp-chat-react` components:
   - `<Thread store={acpStore} controller={ymirController} />`
   - `<Composer store={acpStore} controller={ymirController} />`

### Key Challenge: Event Flow Reversal

In normal acp-chat usage:
```
SessionController → Transport → Agent Process → Transport → SessionController.on("sessionUpdate") → AcpStore → React
```

In Ymir:
```
Server spawns agent → Agent sends ACP events → Server broadcasts as acp_payload → Client WS → dispatchAccumulator → Zustand
                                  ↑ Need to also feed into → YmirSessionController.on("sessionUpdate") → AcpStore → React
```

The events arrive from the server as `AcpEventEnvelope` (with `eventType`, `sequence`). We need to translate these into `SessionUpdateParams` format that `applySessionUpdate()` expects.

### Alternative: Feed events directly into NormalizedState

Instead of going through SessionController → AcpStore, we could:
1. Create an `AcpStore` without a real `SessionController` (need a stub)
2. Directly call `applySessionUpdate(store.normalizedState, params)` when events arrive
3. This bypasses the SessionController event subscription entirely

But `AcpStore` constructor requires a `SessionController`. We'd need to either:
- Extend `AcpStore` to accept direct state injection
- Create a minimal `SessionController` stub
- **Or modify `acp-chat-react` to export a way to create a store without SessionController**

### Files to Create/Modify

**New files in Ymir:**
- `apps/web/src/lib/ymir-session-controller.ts` — SessionController adapter
- `apps/web/src/components/agent/AgentThread.tsx` — New thread using acp-chat-react Thread
- `apps/web/src/components/agent/AgentComposer.tsx` — New composer using acp-chat-react Composer
- `apps/web/src/styles/acp-thread.css` — Custom styling for thread/composer

**Modified files:**
- `apps/web/src/components/agent/AgentPane.tsx` — Wire up new components
- `apps/web/src/components/agent/AgentRuntimeProvider.tsx` — May be replaced or simplified
- `apps/web/src/store.ts` — Wire accumulator events to YmirSessionController
- `apps/web/package.json` — Ensure acp-chat-react dependency is linked

### Open Questions for User

1. **Should we modify `acp-chat-react` to support a store-only mode** (no SessionController required)? This would be cleaner than a stub but changes the external package.

2. **The Composer calls `controller.sendPrompt(sessionId, text)`** — in Ymir, should this dispatch `AgentSend { agentTabId, text }` through the WS? The `sessionId` maps to `acpSessionId` which maps to a specific thread in the accumulator.

3. **Session management:** `listSessions`, `loadSession`, `createSession` — Ymir uses `AgentSpawn` to create agent processes. Should the adapter map `createSession` to `AgentSpawn`?
