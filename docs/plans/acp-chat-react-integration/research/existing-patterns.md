# Ymir Codebase Patterns & Conventions

Research findings for the acp-chat-react integration. This document catalogs the patterns, conventions, and abstractions the integration must follow.

---

## 1. File Organization

### Directory Structure (apps/web/src/)

```
src/
├── App.tsx                      # Root component
├── main.tsx                     # Entry point
├── store.ts                     # Main Zustand store
├── uiStore.ts                   # Persisted UI Zustand store
├── vite-env.d.ts               # Vite type declarations
├── components/
│   ├── agent/                   # Agent/chat UI
│   │   ├── AgentChat.tsx        # Main chat component
│   │   ├── AgentPane.tsx        # Tabbed agent pane
│   │   ├── AgentRuntimeProvider.tsx  # assistant-ui runtime wrapper
│   │   ├── AgentSkeleton.tsx    # Loading state
│   │   ├── EventCards.tsx       # Custom card components (permission, tool, plan, status)
│   │   ├── card-schema.ts       # Card schema definitions
│   │   ├── runtimeBoundary.ts   # assistant-ui runtime boundary mapping
│   │   └── __tests__/           # Co-located tests
│   ├── debug/                   # Debug utilities
│   ├── dialogs/                 # Modal dialogs (PR, worktree, merge, settings)
│   ├── editor/                  # Code editor tabs (monaco)
│   ├── layout/                  # App shell, status bar
│   ├── main/                    # Main panel (agent + terminal split)
│   ├── project/                 # File tree, git changes
│   ├── sidebar/                 # Workspace/worktree tree
│   ├── terminal/                # Terminal (ghostty-web)
│   └── ui/                      # Shared UI primitives (tabs, toast, context menu, etc.)
├── hooks/                       # Custom React hooks
├── lib/                         # Utility libraries (ws, api, error-recovery, tabStorage)
├── styles/                      # CSS files (agent.css, panels.css, tabs.css, etc.)
├── test/                        # Test utilities (setup.ts, fixtureValidator.ts)
└── types/
    ├── protocol.ts              # WebSocket protocol types (hand-written)
    ├── state.ts                 # Zustand store types
    ├── generated/               # Auto-generated from Rust ts_rs
    └── __tests__/
```

### Key Conventions

- **Co-located tests**: Each component directory has a `__tests__/` subdirectory. Test files named `{Component}.test.tsx`.
- **CSS imports**: Components import CSS at the top level using relative paths (e.g., `import '../../styles/agent.css'`).
- **No barrel files**: Components are imported directly by path, not through index.ts barrel exports.
- **Type imports**: Use `import type { ... }` for type-only imports.

### Component Naming

- Components: PascalCase (`AgentChat`, `TerminalPane`, `AppShell`)
- Custom hooks: `use` prefix + PascalCase (`useWebSocket`, `useAgentStatus`, `useToast`)
- Store selectors: camelCase functions exported from store (`selectActiveWorktree`)

---

## 2. State Management

### Two-Store Architecture

**Main Store** (`src/store.ts`): `useStore` — transient, WebSocket-driven state
- Created with `create<AppState>()(devtools(...))`
- Holds: workspaces, worktrees, agentSessions, terminalSessions, notifications
- Holds: connectionStatus, activeWorktreeId, agentTabs, acpAccumulator
- Dialog state: prDialog, createWorktreeDialog, mergeDialog, etc.
- All CRUD setters: setWorkspaces, addWorktree, removeAgentSession, etc.

**UI Store** (`src/uiStore.ts`): `useUIStore` — persisted, tab-scoped UI state
- Created with `create<UIState>()(persist(...))`
- Uses zustand `persist` middleware with `createJSONStorage`
- Custom storage adapter maps to per-tab localStorage keys via `tabStorage.ts`
- Holds: panel sizes, active tab IDs per worktree, diff/view modes, expanded workspace IDs

### ACP Accumulator Pattern

The accumulator is a **pure reducer function** (`acpAccumulatorReducer`) embedded in the store:

```
// Action types
type AcpAccumulatorAction =
  | { type: 'EVENT_RECEIVED'; envelope: AcpEventEnvelope; worktreeId: string }
  | { type: 'USER_MESSAGE'; worktreeId: string; content: string }
  | { type: 'CONNECTION_RECONNECTED' }
  | { type: 'FLUSH_THREAD'; worktreeId: string }
  | { type: 'FLUSH_ALL' }
  | { type: 'REBUILD_FROM_SNAPSHOT'; worktreeId: string; acpSessionId: string }
  | { type: 'SET_STREAMING'; worktreeId: string; isStreaming: boolean };

// Dispatched via store action
dispatchAccumulator: (action: AcpAccumulatorAction) => void;
```

Key principles:
- **Connection-scoped**: State is flushed on reconnect (connectionGeneration counter)
- **NOT source of truth**: Worktree/session identity comes from AppState.worktrees/agentSessions
- **Per-worktree threads**: `Map<string, AccumulatedThread>` keyed by worktreeId
- **Bounded**: MAX_TOOL_OUTPUT_LENGTH (10000), MAX_ACCUMULATED_MESSAGES (500)

### Store Update Pattern

Server messages flow through `updateStateFromServerMessage()` in store.ts:
```
WS message -> updateStateFromServerMessage() -> set({...}) 
```

The WebSocket client (`YmirClient`) directly calls store setters for non-ACP messages:
```ts
updateStateFromServerMessage(message);  // called in ws.ts handleMessage()
```

### Callback Registry Pattern

For cross-component communication (terminal output routing):
```ts
let terminalOutputCallback: ((message: TerminalOutput) => void) | null = null;
export function setTerminalOutputCallback(cb: ...): void { ... }
```
TerminalProvider registers the callback on mount, unregisters on cleanup.

---

## 3. Testing Conventions

### Framework
- **Vitest** v4.1.0 with jsdom environment
- **@testing-library/react** v16.3.2
- **@testing-library/jest-dom** for DOM matchers

### Config (vitest.config.ts)
```ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    maxWorkers: 1,
  },
})
```

### Test Setup (src/test/setup.ts)
- Imports `@testing-library/jest-dom`
- Mocks localStorage for zustand persist middleware

### Test File Pattern
```tsx
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component } from '../Component';
import { useSomeHook } from '../../../hooks/useSomeHook';

vi.mock('../../../hooks/useSomeHook');

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up mock return values
  });

  const renderComponent = (props = {}) => {
    const defaultProps = { ... };
    return render(<Component {...defaultProps} {...props} />);
  };

  it('does something', () => {
    renderComponent();
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
```

### Mocking Pattern
- External hooks are mocked with `vi.mock()` at the top of the file
- Mock objects with vi.fn() for callbacks
- ResizeObserver is globally mocked in test files that need it
- WebSocket client is mocked via `vi.mock('../../../hooks/useWebSocket')`

### Fixture Validation
- `src/test/fixtureValidator.ts` validates MessagePack fixtures against protocol types
- Used for protocol-level testing of wire format compatibility

---

## 4. Error Handling

### Error Types (src/types/protocol.ts)

Discriminated union of typed errors:
```ts
export interface Error {
  type: 'Error';
  code: string;
  message: string;
  details?: string;
  requestId?: string;
}

export const ErrorCodes = {
  PTY_CRASH: 'pty_crash',
  GIT_FAILURE: 'git_failure',
  AGENT_CRASH: 'agent_crash',
  DB_ERROR: 'db_error',
} as const;

export type ServerErrorMessage = PtyCrashError | GitFailureError | AgentCrashError | DbError | Error;
```

### Error Recovery (src/lib/error-recovery.ts)

Centralized `handleError()` dispatcher with typed handlers:
```ts
export function handleError(error: ServerError, context?: ErrorRecoveryContext): void {
  if (isPtyCrashError(error)) { handlePtyCrash(error, context); return; }
  if (isGitFailureError(error)) { handleGitFailure(error, context); return; }
  if (isAgentCrashError(error)) { handleAgentCrash(error, context); return; }
  if (isDbError(error)) { handleDbError(error); return; }
  // Fallback toast notification
}
```

Each handler:
1. Shows toast notification via `useToastStore.getState().addNotification()`
2. Performs recovery action (e.g., re-create terminal session)
3. Some call Tauri native notifications via `showNotification()`

### Runtime Boundary (src/components/agent/runtimeBoundary.ts)

Defines the contract between Ymir's accumulated state and assistant-ui's ExternalStoreRuntime:
- **Render-only**: assistant-ui NEVER owns worktree/session identity
- **Feature flags**: editing, approval, branching all DISABLED (first-cut)
- **Mapping functions**: `createRuntimeInput()`, `mapContentPart()`, `mapMessage()`, `mapStatus()`
- ThreadId uses worktreeId, NOT session ID (Ymir owns session truth)

---

## 5. Build/Config

### Vite Config (apps/web/vite.config.ts)
```ts
const acpPackages = path.join(os.homedir(), 'acp-chat-ui-react', 'packages')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@harms-haus/acp-chat-core': path.resolve(acpPackages, 'acp-chat-core/src'),
      '@harms-haus/acp-chat-react': path.resolve(acpPackages, 'acp-chat-react/src'),
      '@harms-haus/acp-ws-bridge': path.resolve(acpPackages, 'acp-ws-bridge/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'http://localhost:7319',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
})
```

### TypeScript Config (apps/web/tsconfig.json)
- Target: ES2020, Module: ESNext, ModuleResolution: bundler
- JSX: react-jsx, Strict: true
- NoUnusedLocals/Parameters: true
- **Paths already configured** for the three acp packages:
  ```json
  "paths": {
    "@harms-haus/acp-chat-core": ["../../acp-chat-ui-react/packages/acp-chat-core/src"],
    "@harms-haus/acp-chat-react": ["../../acp-chat-ui-react/packages/acp-chat-react/src"],
    "@harms-haus/acp-ws-bridge": ["../../acp-chat-ui-react/packages/acp-ws-bridge/src"]
  }
  ```

### Package.json (apps/web)
- `"type": "module"`
- Key deps: react 19, zustand 5, @assistant-ui/react 0.12, ghostty-web 0.4, monaco-editor
- Key devDeps: vitest 4, @testing-library/react 16, typescript 5.8, vite 6

### Package Manager
- pnpm (inferred from node_modules/.pnpm structure)

---

## 6. Rust Server Conventions

### Module Structure (crates/ws-server/src/)
```
ws-server/
├── main.rs             # Binary entry point
├── lib.rs              # Library exports + constants (DEFAULT_PORT: 7319)
├── hub.rs              # Client connection management (connect, disconnect, broadcast, send_to)
├── router.rs           # Message dispatch (route_message with pattern matching)
├── state.rs            # Shared AppState (clients, agents, db, settings)
├── logging.rs          # Tracing setup
├── protocol/           # Protocol type definitions (serde + ts_rs)
│   ├── mod.rs          # Re-exports all submodules
│   ├── acp.rs          # WS-ACP wire contract types
│   ├── agent.rs        # Agent protocol types
│   ├── terminal.rs     # Terminal protocol types
│   ├── workspace.rs    # Workspace protocol types
│   ├── worktree.rs     # Worktree protocol types
│   ├── git.rs          # Git protocol types
│   ├── file.rs         # File protocol types
│   ├── common.rs       # Shared types (Ack, Ping, Pong, Error, etc.)
│   └── settings.rs     # Settings protocol types
├── agent/              # Agent handlers (spawn, send, cancel, config)
├── pty/                # PTY management (create, input, kill, resize)
├── workspace/          # Workspace CRUD
├── worktree/           # Worktree CRUD
├── git/                # Git operations
├── db/                 # Database layer
└── watcher/            # File system watcher
```

### Protocol Patterns
- All types derive `Serialize, Deserialize` (serde) and `TS` (ts_rs)
- **Tagged enums**: `#[serde(tag = "eventType", content = "data")]` for AcpEvent
- **camelCase**: `#[serde(rename_all = "camelCase")]` on all structs
- **UUID serialization**: Custom `uuid_serde` module for string encoding
- **ts_rs exports**: `#[ts(export)]` generates TypeScript types into `types/generated/`

### WS-ACP Wire Contract (protocol/acp.rs)
```rust
pub struct AcpEventEnvelope {
    pub sequence: AcpSequence,      // u64, monotonically increasing
    pub correlation_id: Option<AcpCorrelationId>,
    pub timestamp: u64,             // Unix ms
    #[serde(flatten)]
    pub event: AcpEvent,
}

pub enum AcpEvent {
    SessionInit(AcpSessionInit),
    ConfigOptionsUpdate(AcpConfigOptionsUpdate),
    SessionStatus(AcpSessionStatusEvent),
    PromptChunk(AcpPromptChunk),
    PromptComplete(AcpPromptComplete),
    ToolUse(AcpToolUseEvent),
    ContextUpdate(AcpContextUpdate),
    Error(AcpError),
    ResumeMarker(AcpResumeMarker),
}
```

### Hub Pattern
- `AppState.connect()` returns `mpsc::Receiver<ServerMessage>`
- `AppState.broadcast()` sends to all connected clients
- `AppState.send_to()` targets specific client
- Failed sends trigger automatic disconnect

### Router Pattern
- `route_message(state, client_id, message)` returns `Option<ServerMessage>`
- Uses exhaustive pattern matching on `ClientMessagePayload`
- `not_implemented()` fallback for unhandled message types
- Instrumented with `#[instrument]` tracing macro

### Error Pattern
- All handlers return `ServerMessage::new(ServerMessagePayload::Error(...))`
- Error codes are UPPER_SNAKE_CASE strings (e.g., "WORKTREE_CREATE_ERROR")

---

## 7. Type System

### Generated Types (src/types/generated/)
- Auto-generated by `ts_rs` from Rust protocol types
- File naming: matches Rust type name (e.g., `AcpEventEnvelope.ts`)
- **DO NOT EDIT**: Marked with `_DO-NOT-EDIT-THESE-BY-HAND`
- Each file exports a single interface matching the Rust struct

### Hand-Written Protocol Types (src/types/protocol.ts)
- Core message types: `ClientMessage`, `ServerMessage` unions
- Type guards: `isPtyCrashError()`, `isAgentCrashError()`, etc.
- `AcpEventEnvelope` interface for WS-ACP events
- `PROTOCOL_VERSION` constant
- MessagePack encode/decode helpers using `@msgpack/msgpack`

### State Types (src/types/state.ts)
- `AppState` interface: full Zustand store shape
- `AccumulatedThread`, `AccumulatedMessage`, `AccumulatedContentPart` union
- Content part union: `text | structured | tool | context | permission | error | image`
- `AcpAccumulatorState` and `AcpAccumulatorAction` for reducer
- Constants: `MAX_TOOL_OUTPUT_LENGTH`, `MAX_ACCUMULATED_MESSAGES`

### Type Import Pattern
```ts
import type { AcpSessionConfigOption } from '../../types/protocol';
import type { AccumulatedThread, AccumulatedMessage } from '../../types/state';
import { AcpEventEnvelope, isAcpSessionStatus } from '../../types/protocol';  // value + type
```

---

## 8. Existing Terminal Integration

### Architecture
- **ghostty-web** v0.4.0 for terminal rendering (WebAssembly-based)
- PTY management server-side in Rust (crates/ws-server/src/pty/)
- WebSocket message routing for terminal I/O

### TerminalProvider Pattern (src/components/terminal/TerminalProvider.tsx)
- React Context-based terminal registry
- `registerTerminal(instance)` returns cleanup function
- `writeToTerminal(sessionId, data)` routes output to registered terminals
- Callback registered in store: `setTerminalOutputCallback()`
- Ghostty async initialization on mount

### TerminalInstance Interface
```ts
export interface TerminalInstance {
  sessionId: string;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}
```

### useTerminal Hook
```ts
export function useTerminal(sessionId: string) {
  // Returns: { register, writeToTerminal, isInitialized }
  // register(write, resize) -> cleanup function
}
```

### Protocol Messages
- Client -> Server: TerminalCreate, TerminalKill, TerminalInput, TerminalResize, TerminalRename, TerminalReorder, TerminalRequestHistory
- Server -> Client: TerminalCreated, TerminalOutput, TerminalRemoved, TerminalUpdated, TerminalHistory

---

## 9. Routing/Navigation

### Tab-Based Navigation

**No client-side router** — ymir uses a workspace/worktree selection model with tab-based UI.

### Tab Storage (src/lib/tabStorage.ts)
- Per-tab localStorage keys using session-scoped tab ID
- Key format: `ymir-ui-state-{tabId}-{propertyName}`
- Tab ID generated on first load: `{timestamp}-{random}`
- `TabStorage` interface defines all persisted UI state
- `clearTabStorage()` cleans up keys for current tab

### Active Worktree Selection
- `useStore` holds `activeWorktreeId: string | null`
- `useUIStore` holds `activeAgentTabIds: Record<string, string>` (per worktree)
- `useUIStore` holds `activeTerminalTabIds: Record<string, string>` (per worktree)
- `setActiveWorktree()` syncs both stores and expands workspace in sidebar

### Agent Pane Tabs
- Per-worktree tabs stored in `useStore`: `agentTabs: Map<string, AgentTab[]>`
- Tab types: `'agent' | 'diff' | 'editor'`
- CRUD: addAgentTab, removeAgentTab, reorderAgentTabs, removeAgentTabsRightOf, etc.
- Tab context menu: close, close others, close left/right

### Panel Layout
- Three-panel horizontal layout: Sidebar | Main | Project
- Main panel splits vertically: Agent | Terminal
- Uses `react-resizable-panels` (Group, Panel, Separator)
- Panel sizes persisted in useUIStore with zustand persist middleware

### AppShell Flow
```
AppShell
├── SidebarPanel (workspace tree)
│   └── User clicks worktree -> useStore.setActiveWorktree(id)
├── MainPanel
│   ├── AgentPane (tabbed agent sessions)
│   │   └── Active tab shows AgentChat for that worktree
│   └── TerminalPane (tabbed terminals)
│       └── Active tab shows TerminalView for that session
├── ProjectPanel (file tree, git changes)
└── StatusBar (connection status, worktree info)
```

---

## 10. Current Agent Chat Architecture

### Component Hierarchy
```
AgentPane
└── AgentChat (per active tab)
    └── AgentRuntimeProvider (wraps assistant-ui)
        └── AgentChatContent
            ├── ThreadPrimitive.Root
            │   └── ThreadPrimitive.Messages (UserMessage | AgentMessage)
            └── ComposerPrimitive.Root (input + controls)
```

### Current Stack
- `@assistant-ui/react` v0.12 for chat rendering (ThreadPrimitive, ComposerPrimitive, MessagePrimitive)
- `useExternalStoreRuntime` with custom message converter
- Custom `EventCards` for tool/permission/status rendering
- `@base-ui/react` Select for agent/model/mode selectors

### Message Flow
```
User types -> ComposerPrimitive.Input
  -> AgentRuntimeProvider.onNew()
    -> dispatchAccumulator({ type: 'USER_MESSAGE', ... })
    -> onSendMessage(text) -> ws.send({ type: 'AgentSend', ... })

Server ACP events -> ws.onAcpEvent()
  -> acpAccumulatorReducer({ type: 'EVENT_RECEIVED', ... })
    -> Updates AccumulatedThread in Zustand store
      -> useExternalStoreRuntime reads from store
        -> Re-renders ThreadPrimitive.Messages
```

---

## Summary: Key Integration Constraints

1. **Package scope**: Use `@harms-haus/acp-chat-core`, `@harms-haus/acp-chat-react`, `@harms-haus/acp-ws-bridge`
2. **No router changes**: Navigation stays workspace/worktree-tab based
3. **Zustand stores**: Must integrate with existing useStore and useUIStore
4. **MessagePack protocol**: WebSocket uses binary MessagePack (not JSON)
5. **ACP event accumulator**: Must preserve or replace the existing reducer pattern
6. **Runtime boundary**: assistant-ui is render-only; Ymir owns canonical state
7. **Co-located tests**: New components need `__tests__/*.test.tsx` alongside
8. **CSS convention**: Plain CSS imports, not CSS modules or styled-components
9. **Terminal**: ghostty-web integration must be preserved
10. **Type generation**: Rust ts_rs exports to `types/generated/` — avoid manual duplication
