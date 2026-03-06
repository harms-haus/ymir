# Ymir - Terminal with Vertical Tabs & AI Notifications

## TL;DR
> Build a Linux-compatible terminal with vertical tabs and AI agent notifications using Tauri v2 + React + xterm.js + portable-pty.
>
> **Core Features**: PTY terminal per tab, vertical tab sidebar with git info, OSC 9/777 notification detection, tab highlighting.
>
> **Estimated Effort**: Medium (6-7 tasks, ~2-3 days execution)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Tauri Setup → PTY Backend → Frontend Terminal → Sidebar Integration → Notification System → Notification Panel

## TL;DR
> Build a Linux-compatible terminal with vertical tabs and AI agent notifications using Tauri v2 + React + xterm.js + portable-pty.
>
> **Core Features**: PTY terminal per tab, vertical tab sidebar with git info, OSC 9/777 notification detection, tab highlighting.
>
> **Estimated Effort**: Medium (5-6 tasks, ~2-3 days execution)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Tauri Setup → PTY Backend → Frontend Terminal → Sidebar Integration → Notification System

---

## Context

### Original Request
User wants to build "Ymir" - a terminal with vertical tabs and AI notifications (inspired by cmux) for Linux using Tauri instead of native Swift/AppKit.

### Why Tauri?
- **Cross-platform**: Works on Linux, macOS, Windows (solves Linux need)
- **Small footprint**: ~5-10MB vs Electron's 150MB+
- **Rust backend**: Perfect for PTY operations (same language as original cmux)
- **Web frontend**: Can reuse terminal emulator (xterm.js)
- **Security**: Built-in CSP, sandboxing
- **Performance**: System WebView, not bundled Chromium

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript)                                   │
│ ├─ Sidebar: Vertical tabs with git/notification info            │
│ ├─ Terminal View: xterm.js instance per tab                     │
│ └─ Notification Panel: Unread notifications list                  │
├─────────────────────────────────────────────────────────────────┤
│ Tauri Bridge (IPC)                                              │
│ ├─ invoke() - Frontend calls Rust commands                        │
│ ├─ emit() - Rust sends events to Frontend                       │
│ └─ Channel - Streaming data (terminal output)                   │
├─────────────────────────────────────────────────────────────────┤
│ Rust Backend                                                      │
│ ├─ PTY Manager: portable-pty for shell processes                │
│ ├─ Session State: HashMap<tab_id, PTY session>                  │
│ ├─ Parser: OSC 9/777 notification detection                     │
│ ├─ Git Watcher: Watch working dir for branch changes            │
│ └─ Notification Queue: Store unread notifications               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Work Objectives

### Core Objective
Create a functional Linux terminal application with vertical tab sidebar and AI agent notification detection, using Tauri as the framework.

### Concrete Deliverables
1. **Tauri v2 project** with React + TypeScript + Vite
2. **PTY backend** - Spawn bash shells, stream I/O via Tauri Channels
3. **Terminal UI** - xterm.js with fit-addon, one per tab
4. **Vertical Sidebar** - Tab list with: title, git branch, notification badge
5. **Notification System** - Parse OSC 9/777 sequences, show badges + OS notifications

### Definition of Done
### Definition of Done
```bash
# App builds and runs
npm run tauri dev

# Terminal works - can type commands
# Sidebar shows tabs
# Notification badge appears when AI agent sends OSC sequence
# Can create/close tabs
# Can switch between tabs
# Can jump to latest unread notification
# Notification panel shows all pending notifications
```
# App builds and runs
npm run tauri dev

# Terminal works - can type commands
# Sidebar shows tabs
# Notification badge appears when AI agent sends OSC sequence
# Can create/close tabs
# Can switch between tabs
```

### Must Have (MVP Scope)
- [ ] Tauri v2 setup with React + Vite
- [ ] PTY integration via portable-pty crate
- [ ] xterm.js terminal component
- [ ] Vertical tab sidebar (React)
- [ ] OSC 9/777 notification parsing
- [ ] Tab notification badges (blue dot/highlight)
- [ ] **Pane-level blue ring when notification arrives**
- [ ] **Notification panel with jump-to functionality**
- [ ] **Cmd/Ctrl+Shift+U jump to latest unread**
- [ ] Git branch detection in cwd
- [ ] **Working directory display in sidebar**
- [ ] Create/close/switch tabs
- [ ] Tauri v2 setup with React + Vite
- [ ] PTY integration via portable-pty crate
- [ ] xterm.js terminal component
- [ ] Vertical tab sidebar (React)
- [ ] OSC 9/777 notification parsing
- [ ] Tab notification badges (blue dot/highlight)
- [ ] **Pane-level blue ring when notification arrives**
- [ ] **Notification panel with jump-to functionality**
- [ ] **Cmd/Ctrl+Shift+U jump to latest unread**
- [ ] Git branch detection in cwd
- [ ] **Working directory display in sidebar**
- [ ] Create/close/switch tabs
- [ ] Tauri v2 setup with React + Vite
- [ ] PTY integration via portable-pty crate
- [ ] xterm.js terminal component
- [ ] Vertical tab sidebar (React)
- [ ] OSC 9/777/99 notification parsing
- [ ] Tab notification badges (blue dot/highlight)
- [ ] Git branch detection in cwd
- [ ] Create/close/switch tabs
- [ ] Keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+I)

### Must NOT Have (Out of Scope for MVP)
- In-app browser
- Workspaces (multiple windows)
- Session persistence/restore
- Split panes (horizontal/vertical splits)
- PR status integration
- Port detection in sidebar
- CLI for external automation
- Settings/config UI
- Themes (use default xterm theme)
- Notification persistence across sessions
- Auto-updating working directory (static display only)

---

## Verification Strategy
- Themes (use default xterm theme)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (starting fresh)
- **Automated tests**: Tests-after (no TDD, add tests if time permits)
- **Framework**: None for MVP (manual verification)

### QA Policy
Every task includes agent-executed QA scenarios:
- **Tauri Dev**: Run app, verify UI renders
- **Terminal**: Send keystrokes, verify output appears
- **PTY**: Verify shell process spawns, streams data
- **Events**: Verify bidirectional communication

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Can Start Immediately):
├── Task 1: Tauri v2 + React + Vite scaffolding
├── Task 2: PTY backend with portable-pty
└── Task 3: xterm.js terminal component

Wave 2 (Integration - After Wave 1):
├── Task 4: Vertical sidebar with tabs
├── Task 5: Notification system (OSC parsing + UI)
├── **Task 5b: Notification panel (depends on Task 5)**
└── Task 6: Git branch detection + polish

Wave FINAL (Review):
├── Task F1: End-to-end QA
└── Task F2: Build verification

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → **Task 5b**
Parallel Speedup: ~40% (Wave 1 tasks partially parallel)
```

### Dependency Matrix

### Dependency Matrix
- **Task 1**: — | **Blocks**: Task 3 | **Can Parallel**: Task 2
- **Task 2**: — | **Blocks**: Task 3, Task 5 | **Can Parallel**: Task 1
- **Task 3**: Task 1, Task 2 | **Blocks**: Task 4, Task 5 | **Can Parallel**: No
- **Task 4**: Task 3 | **Blocks**: Task 5b, Task F1 | **Can Parallel**: Task 5
- **Task 5**: Task 2, Task 3 | **Blocks**: Task 5b, Task F1 | **Can Parallel**: Task 4
- **Task 5b**: Task 4, Task 5 | **Blocks**: Task 6, Task F1 | **Can Parallel**: Task 6
- **Task 6**: Task 4, Task 5b | **Blocks**: Task F1 | **Can Parallel**: Task 5b
- **Task F1**: Task 4, Task 5, Task 5b, Task 6 | **Blocks**: — | **Can Parallel**: No


---

## Libraries & Dependencies

### Frontend (npm packages)
```json
{
  "@tauri-apps/api": "^2.0.0",
  "@tauri-apps/plugin-shell": "^2.0.0",
  "@xterm/xterm": "^5.3.0",
  "@xterm/addon-fit": "^0.10.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0"
}
```

### Backend (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
portable-pty = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
dashmap = "5"
notify = "6"  # For file watching (git detection)
```

### Why These Libraries?
- **xterm.js**: Industry-standard terminal emulator (used by VS Code, Hyper)
- **portable-pty**: Cross-platform PTY (from wezterm, battle-tested)
- **dashmap**: Thread-safe HashMap for session state
- **notify**: File system watching for git branch changes
- **tokio**: Async runtime for PTY I/O and file watching

---

## Code Examples for Pivot Points

### 1. Tauri Command with PTY Spawn

**File**: `src-tauri/src/lib.rs`

```rust
use std::sync::Arc;
use tauri::{ipc::Channel, State};
use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtyPair};
use dashmap::DashMap;
use serde::Serialize;
use uuid::Uuid;

// State structure to hold all PTY sessions
#[derive(Default)]
pub struct AppState {
    sessions: DashMap<String, PtySession>,
}

pub struct PtySession {
    pub pair: PtyPair,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
}

// Event types for streaming terminal output
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum PtyEvent {
    Output { data: String },
    Notification { message: String },
    Exit { code: Option<u32> },
}

#[tauri::command]
async fn spawn_pty(
    state: State<'_, Arc<AppState>>,
    on_event: Channel<PtyEvent>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    
    // Create PTY pair
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    
    // Spawn shell
    // Spawn shell - use user's preferred shell
let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
let cmd = CommandBuilder::new(&shell);
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    // Generate session ID
    let session_id = Uuid::new_v4().to_string();
    
    // Store session
    state.sessions.insert(
        session_id.clone(),
        PtySession {
            pair: pair.try_clone().map_err(|e| e.to_string())?,
            child,
        },
    );
    
    // Spawn async task to read PTY output
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let session_id_clone = session_id.clone();
    
    tauri::async_runtime::spawn(async move {
        use std::io::{BufRead, BufReader};
        
        let buf_reader = BufReader::new(reader);
        for line in buf_reader.lines() {
            if let Ok(line) = line {
// Check for OSC 9/777 notifications
// NOTE: Current implementation uses line-by-line parsing.
// For MVP, this works for most cases, but OSC sequences can span reads.
// Production should use a proper VT parser or buffered stream parser.
if let Some(notification) = parse_notification(&line) {
  let _ = on_event.send(PtyEvent::Notification {
    message: notification,
  });
}
                // Send raw output
                let _ = on_event.send(PtyEvent::Output {
                    data: line + "\n",
                });
            }
        }
        
        // Notify on session end
        let _ = on_event.send(PtyEvent::Exit { code: None });
    });
    
    Ok(session_id)
}

// Parse OSC 9, 99, or 777 notification sequences
fn parse_notification(line: &str) -> Option<String> {
  // OSC 9: ESC ] 9 ; <message> BEL
  // OSC 777: ESC ] 777 ; notify ; <message> BEL
  // OSC 99: ESC ] 99 ; message BEL
  // Format: \x1b]9;message\x07 or \x1b]777;notify;message\x07

  if line.contains("\x1b]9;") {
    line.split("\x1b]9;").nth(1).map(|s| {
      s.split('\x07').next().unwrap_or(s).to_string()
    })
  } else if line.contains("\x1b]99;") {
    // OSC 99 support (used by some terminals)
    line.split("\x1b]99;").nth(1).map(|s| {
      s.split('\x07').next().unwrap_or(s).to_string()
    })
  } else if line.contains("\x1b]777;notify;") {
    line.split("\x1b]777;notify;").nth(1).map(|s| {
      s.split('\x07').next().unwrap_or(s).to_string()
    })
  } else {
    None
  }
}

#[tauri::command]
async fn write_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        let mut writer = session.pair.master.take_writer().map_err(|e| e.to_string())?;
        use std::io::Write;
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if let Some(session) = state.sessions.get(&session_id) {
        session.pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn kill_pty(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    if let Some((_, session)) = state.sessions.remove(&session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}
```

### 2. Frontend xterm.js Integration

**File**: `src/components/Terminal.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke, Channel } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  onNotification: (message: string) => void;
}

export function Terminal({ sessionId, onNotification }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Set up PTY communication
    const setupPty = async () => {
      const channel = new Channel<{
        event: 'output' | 'notification' | 'exit';
        data: any;
      }>();

      channel.onmessage = (message) => {
        switch (message.event) {
          case 'output':
            term.write(message.data);
            break;
          case 'notification':
            onNotification(message.data.message);
            break;
          case 'exit':
            term.write('\r\n[Process exited]\r\n');
            break;
        }
      };

      // Spawn PTY and get session ID
      const id = await invoke<string>('spawn_pty', {
        onEvent: channel,
      });
      
      // Store session ID for cleanup
      // (In real implementation, store in parent component)
    };

    setupPty();

    // Handle user input
    term.onData((data) => {
      invoke('write_pty', { sessionId, data }).catch(console.error);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = term;
        invoke('resize_pty', { sessionId, cols, rows }).catch(console.error);
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      invoke('kill_pty', { sessionId }).catch(console.error);
    };
  }, [sessionId, onNotification]);

  return (
    <div 
      ref={terminalRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        backgroundColor: '#1e1e1e',
      }} 
    />
  );
}
```

### 3. Tab State Management

**File**: `src/state/tabs.ts`

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Tab {
  id: string;
  title: string;
  gitBranch?: string;
  hasNotification: boolean;
  notificationCount: number;
  notificationText?: string; // Latest notification message (shown in sidebar)
  cwd: string;
  sessionId: string;
}


interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: () => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  markNotification: (tabId: string, message: string) => void;
clearNotification: (tabId: string) => void;
updateGitBranch: (tabId: string, branch: string) => void;
  clearNotification: (tabId: string) => void;
  updateGitBranch: (tabId: string, branch: string) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: async () => {
    const sessionId = await invoke<string>('spawn_pty');
    const newTab: Tab = {
      id: crypto.randomUUID(),
      title: 'bash',
      hasNotification: false,
      notificationCount: 0,
      cwd: '~',
      sessionId,
    };
    
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab) {
      await invoke('kill_pty', { sessionId: tab.sessionId });
    }
    
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveId = state.activeTabId === id 
        ? newTabs[newTabs.length - 1]?.id || null
        : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
    // Clear notification when tab is focused
    get().clearNotification(id);
  },

  markNotification: (tabId: string, message: string) => {
  set((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            hasNotification: true,
            notificationCount: tab.notificationCount + 1,
            notificationText: message, // Store for sidebar display
            // NOTE: Title is NOT updated - matches original cmux behavior
          }
        : tab
    ),
  }));
},

  clearNotification: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, hasNotification: false, notificationCount: 0 }
          : tab
      ),
    }));
  },

  updateGitBranch: (tabId, branch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, gitBranch: branch } : tab
      ),
    }));
  },
}));
```

### 4. Sidebar Component

**File**: `src/components/Sidebar.tsx`

```typescript
import { useTabsStore } from '../state/tabs';

export function Sidebar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabsStore();

  return (
    <div style={{ 
      width: 250, 
      backgroundColor: '#252526',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ 
        padding: '10px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#fff', fontWeight: 'bold' }}>Tabs</span>
        <button 
          onClick={addTab}
          style={{
            background: 'transparent',
            border: '1px solid #555',
            color: '#fff',
            cursor: 'pointer',
            padding: '2px 8px',
          }}
        >
          +
        </button>
      </div>

      {/* Tab List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px',
              backgroundColor: activeTabId === tab.id ? '#37373d' : 'transparent',
              borderLeft: tab.hasNotification ? '3px solid #4fc3f7' : '3px solid transparent',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {/* Tab Title */}
            <div style={{ 
              color: '#fff', 
              fontSize: 13,
              fontWeight: tab.hasNotification ? 'bold' : 'normal',
            }}>
              {tab.title}
              {tab.notificationCount > 0 && (
                <span style={{
                  marginLeft: 5,
                  backgroundColor: '#4fc3f7',
                  color: '#000',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 11,
                }}>
                  {tab.notificationCount}
                </span>
              )}
            </div>

{/* Git Branch */}
          {tab.gitBranch && (
            <div style={{
              color: '#858585',
              fontSize: 11,
              marginTop: 2,
            }}>
              <span style={{ marginRight: 4 }}>🌿</span>
              {tab.gitBranch}
            </div>
          )}

          {/* Working Directory */}
          <div style={{
            color: '#858585',
            fontSize: 11,
            marginTop: 2,
          }}>
            <span style={{ marginRight: 4 }}>📁</span>
            {tab.cwd}
          </div>

          {/* Notification Preview */}
          {tab.notificationText && (
            <div style={{
              color: '#4fc3f7',
              fontSize: 11,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              <span style={{ marginRight: 4 }}>🔔</span>
              {tab.notificationText}
            </div>
          )}


            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{
                position: 'absolute',
                right: 5,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#858585',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5. Tauri Capability Configuration

**File**: `src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-spawn",
    "notification:default",
    "fs:allow-read",
    "fs:allow-write"
  ]
}
```

---

## TODOs

### Task 1: Tauri v2 + React + Vite Scaffolding
**What to do**:
- Initialize Tauri v2 project with React + TypeScript + Vite template
- Install frontend dependencies: xterm.js, react, zustand (state management)
- Configure build tooling (vite.config.ts, tsconfig.json)
- Set up project structure (src/, src-tauri/src/)
- Configure Tauri window (size, title, min dimensions)
- Test `npm run tauri dev` launches successfully

**Code to write**:
- `package.json` with all dependencies
- `vite.config.ts` with Tauri integration
- `src-tauri/tauri.conf.json` window config
- Basic `App.tsx` with "Hello Tauri"
- `index.html` entry point

**Libraries**:
- `@tauri-apps/cli` (dev dependency)
- `@tauri-apps/api` ^2.0.0
- `react` ^18.2.0
- `react-dom` ^18.2.0
- `@xterm/xterm` ^5.3.0
- `@xterm/addon-fit` ^0.10.0
- `zustand` ^4.4.0

**Must NOT do**:
- Don't add backend code yet (that's Task 2)
- Don't create complex UI yet (that's Task 4)
- Don't add plugins not listed (keep it minimal)

**Acceptance Criteria**:
- [ ] `npm install` completes without errors
- [ ] `npm run tauri dev` launches app with "Hello Tauri"
- [ ] Window title is "Ymir"
- [ ] Window size is at least 1200x800
- [ ] No console errors

**QA Scenarios**:

Scenario: App launches successfully
Tool: interactive_bash
Preconditions: Node.js installed, dependencies installed
Steps:
  1. Run `cd /home/blake/Documents/software/ymir && npm run tauri dev`
  2. Wait for compilation (30-60 seconds)
  3. Verify window appears with title "cmux"
  4. Take screenshot
Expected Result: App window visible, no errors in terminal
Evidence: .sisyphus/evidence/task-1-app-launches.png

**Commit**: YES
- Message: `chore: initialize Tauri v2 with React + Vite`
- Files: `package.json`, `vite.config.ts`, `src-tauri/`, `src/`

---

### Task 2: PTY Backend with portable-pty
**What to do**:
- Add Rust dependencies: portable-pty, tokio, dashmap, uuid
- Create state management for PTY sessions (DashMap)
- Implement `spawn_pty` command that:
  - Opens PTY pair using portable-pty
  - Spawns bash shell
  - Returns session ID
  - Spawns async task to read output
- Implement `write_pty` command for sending input
- Implement `resize_pty` for terminal resize
- Implement `kill_pty` for cleanup
- Test with minimal frontend

**Code to write**:
- `src-tauri/Cargo.toml` dependencies
- `src-tauri/src/lib.rs` with all PTY commands
- `src-tauri/src/state.rs` for AppState struct
- Minimal test component in React

**Libraries**:
- `portable-pty = "0.8"`
- `tokio = { version = "1", features = ["full"] }`
- `dashmap = "5"`
- `uuid = { version = "1", features = ["v4"] }`
- `serde = { version = "1", features = ["derive"] }`

**Key Implementation Details**:

**State Management**:
```rust
#[derive(Default)]
pub struct AppState {
    sessions: DashMap<String, PtySession>,
}

pub struct PtySession {
    pub pair: PtyPair,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
}
```

**Channel-based Streaming**:
```rust
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum PtyEvent {
    Output { data: String },
    Exit { code: Option<u32> },
}

#[tauri::command]
async fn spawn_pty(on_event: Channel<PtyEvent>) -> Result<String, String> {
    // ... spawn PTY ...
    tauri::async_runtime::spawn(async move {
        // Read from PTY and send via channel
        on_event.send(PtyEvent::Output { data: line }).unwrap();
    });
}
```

**Must NOT do**:
- Don't parse OSC sequences yet (that's Task 5)
- Don't handle complex resize scenarios (out of scope)
- Don't implement session persistence (out of scope)

**Acceptance Criteria**:
- [ ] `spawn_pty` returns valid session ID
- [ ] PTY process starts (can see bash prompt in logs)
- [ ] `write_pty` sends data to shell
- [ ] Output streams back via Channel
- [ ] `kill_pty` terminates process
- [ ] No memory leaks (sessions cleaned up on kill)

**QA Scenarios**:

Scenario: PTY spawns and receives output
Tool: Bash + interactive_bash
Preconditions: Task 1 complete
Steps:
  1. Create test script at `src/test-pty.tsx`
  2. Add button that calls `invoke('spawn_pty')`
  3. Log session ID and events to console
  4. Run app, click button
  5. Verify "Output" events appear with bash prompt
  6. Send "ls\n" via write_pty
  7. Verify output contains directory listing
Expected Result: PTY events logged, output visible
Evidence: .sisyphus/evidence/task-2-pty-output.log

Scenario: PTY cleanup works
Tool: Bash
Preconditions: Session spawned
Steps:
  1. Spawn PTY session
  2. Check process list: `ps aux | grep bash`
  3. Call kill_pty
  4. Verify process terminates
Expected Result: No orphaned bash processes
Evidence: .sisyphus/evidence/task-2-pty-cleanup.txt

**Commit**: YES
- Message: `feat: add PTY backend with portable-pty`
- Files: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/state.rs`

---

### Task 3: xterm.js Terminal Component
**What to do**:
- Install xterm.js and fit-addon
- Create React Terminal component that:
  - Initializes xterm.js on mount
  - Connects to PTY via Tauri channels
  - Sends user keystrokes to PTY
  - Resizes PTY when terminal resizes
  - Cleans up on unmount
- Style terminal (dark theme, proper colors)
- Test in isolation (one terminal tab)

**Code to write**:
- `src/components/Terminal.tsx`
- `src/components/Terminal.css` (xterm.js theme overrides)
- Update `App.tsx` to render Terminal

**Key Implementation**:

**Terminal Component with Pane-Level Blue Ring**:
```typescript
interface TerminalProps {
  sessionId: string;
  hasNotification?: boolean; // Add blue ring when true
}

export function Terminal({ sessionId, hasNotification }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div 
      ref={containerRef}
      className={`terminal-container ${hasNotification ? 'has-notification' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        // Pane-level blue ring when notification arrives
        boxShadow: hasNotification ? '0 0 0 2px #4fc3f7' : 'none',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

**Original Terminal Component**:
```typescript
export function Terminal({ sessionId }: { sessionId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

**Terminal Component**:
```typescript
export function Terminal({ sessionId }: { sessionId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useEffect(() => {
    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
    });
    
    // Load fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    // Set up PTY channel
    const channel = new Channel<{
      event: 'output' | 'exit';
      data: any;
    }>();

    channel.onmessage = (msg) => {
      if (msg.event === 'output') term.write(msg.data);
    };

    // Spawn PTY
    invoke('spawn_pty', { onEvent: channel });

    // Handle input
    term.onData((data) => {
      invoke('write_pty', { sessionId, data });
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      invoke('resize_pty', { sessionId, cols, rows });
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      invoke('kill_pty', { sessionId });
    };
  }, [sessionId]);

  return <div ref={terminalRef} className="terminal-container" />;
}
```

**Must NOT do**:
- Don't implement multiple tabs yet (that's Task 4)
- Don't add notification parsing yet (that's Task 5)
- Don't add sidebar yet (that's Task 4)

**Acceptance Criteria**:
- [ ] Terminal renders with dark theme
- [ ] Can type commands and see output
- [ ] Can run `ls`, `pwd`, etc.
- [ ] Cursor blinks
- [ ] Text wraps correctly
- [ ] Resize works (triggers resize_pty)
- [ ] Cleanup on unmount (no orphaned processes)

**QA Scenarios**:

Scenario: Terminal accepts input and shows output
Tool: interactive_bash
Preconditions: Task 2 complete
Steps:
  1. Launch app with Terminal component
  2. Wait for bash prompt
  3. Type "echo Hello World"
  4. Press Enter
  5. Verify "Hello World" appears in terminal
  6. Take screenshot
Expected Result: Command executes, output visible
Evidence: .sisyphus/evidence/task-3-terminal-works.png

Scenario: Resize triggers PTY resize
Tool: interactive_bash
Preconditions: Terminal running
Steps:
  1. Run `stty size` in terminal
  2. Resize window larger
  3. Wait 500ms
  4. Run `stty size` again
  5. Verify row/col count increased
Expected Result: stty shows updated dimensions
Evidence: .sisyphus/evidence/task-3-resize.txt

**Commit**: YES
- Message: `feat: add xterm.js terminal component`
- Files: `src/components/Terminal.tsx`, `src/components/Terminal.css`, `src/App.tsx`

---

### Task 4: Vertical Sidebar with Tabs
**What to do**:
- Install zustand for state management
- Create tabs store with:
  - Tab list (id, title, gitBranch, hasNotification)
  - Active tab tracking
  - Actions: addTab, closeTab, setActiveTab
- Create Sidebar component with vertical tab list
- Integrate Sidebar + Terminal in main layout
- Style sidebar (dark theme, active state, close buttons)
- Implement tab switching (show/hide terminal)

**Code to write**:
- `src/state/tabs.ts` (zustand store)
- `src/components/Sidebar.tsx`
- `src/components/Layout.tsx` (Sidebar + Terminal area)
- Update `App.tsx` to use Layout

**Layout Structure**:
```
┌─────────────────────────────────────────────────┐
│ Sidebar │ Terminal Area                          │
│ 250px   │ flex: 1                                │
│         │                                        │
│ [Tab 1] │  [Active Terminal]                     │
│ [Tab 2] │                                        │
│ [Tab 3] │                                        │
│ [+]     │                                        │
└─────────────────────────────────────────────────┘
```

**Key Implementation**:

**Tabs Store**:
```typescript
interface Tab {
  id: string;
  title: string;
  gitBranch?: string;
  hasNotification: boolean;
  cwd: string;
  sessionId: string;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  addTab: async () => { /* spawn PTY, add to list */ },
  closeTab: async (id) => { /* kill PTY, remove from list */ },
  setActiveTab: (id) => set({ activeTabId: id }),
}));
```

**Layout Component**:
```typescript
export function Layout() {
  const { tabs, activeTabId } = useTabsStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, position: 'relative' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTabId ? 'block' : 'none',
            }}
          >
            <Terminal sessionId={tab.sessionId} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Must NOT do**:
- Don't add notification badges yet (that's Task 5)
- Don't add git branch detection yet (that's Task 6)
- Don't implement splits (out of scope)
- Don't persist tabs (out of scope)

**Acceptance Criteria**:
- [ ] Sidebar visible on left
- [ ] "+" button creates new tab
- [ ] Tab shows title (initially "bash")
- [ ] Clicking tab switches active terminal
- [ ] Active tab highlighted
- [ ] × button closes tab
- [ ] Only active terminal visible (others hidden, not destroyed)
- [ ] Can have 3+ tabs

**QA Scenarios**:

Scenario: Create and switch tabs
Tool: interactive_bash
Preconditions: Task 3 complete
Steps:
  1. Launch app
  2. Click "+" button twice (now have 3 tabs)
  3. In first tab, type "echo Tab 1"
  4. Click second tab
  5. Type "echo Tab 2"
  6. Switch back to first tab
  7. Verify "Tab 1" still visible
  8. Take screenshot
Expected Result: Tabs switch, content preserved
Evidence: .sisyphus/evidence/task-4-tabs-switch.png

Scenario: Close tab cleans up
Tool: Bash
Preconditions: Multiple tabs open
Steps:
  1. Create 3 tabs
  2. Run `ps aux | grep bash | wc -l` (count bash processes)
  3. Close middle tab
  4. Run count again
  5. Verify count decreased by 1
Expected Result: PTY process terminated on close
Evidence: .sisyphus/evidence/task-4-tab-cleanup.txt

**Commit**: YES
- Message: `feat: add vertical sidebar with tab management`
- Files: `src/state/tabs.ts`, `src/components/Sidebar.tsx`, `src/components/Layout.tsx`

---

### Task 5: Notification System (OSC Parsing + UI)
**What to do**:
- Extend PTY output parsing to detect OSC sequences:
  - OSC 9: `\x1b]9;message\x07`
  - OSC 777: `\x1b]777;notify;message\x07`
- When notification detected:
  - Update tab store (hasNotification, notificationCount)
  - Send OS notification via Tauri notification plugin
  - Store notification message in notificationText field (NOT title)
- Add visual indicator in sidebar (blue left border, badge)
- Clear notification when tab is focused

**Code to write**:
- Update `src-tauri/src/lib.rs` parse_notification function
- Extend PtyEvent enum with Notification variant
- Update `src-tauri/src/lib.rs` to call parse_notification
- Update Terminal component to handle notification events
- Update Sidebar to show notification indicators
- Add Tauri notification plugin

**OSC Sequence Formats**:
```
OSC 9 (iTerm2): ESC ] 9 ; message BEL
OSC 99: ESC ] 99 ; message BEL
OSC 777 (urxxt): ESC ] 777 ; notify ; message BEL
OSC 777 (urxvt):  ESC ] 777 ; notify ; message BEL
Claude Code:      echo -e "\e]9;Claude is waiting\007"
                  printf '\e]9;%s\007' "Claude is waiting"
```

**Parser Implementation**:
```rust
fn parse_notification(line: &str) -> Option<String> {
    // OSC 9: \x1b]9;message\x07
    if line.contains("\x1b]9;") {
        line.split("\x1b]9;").nth(1).map(|s| {
            s.split('\x07').next().unwrap_or(s).to_string()
        })
    } 
    // OSC 777: \x1b]777;notify;message\x07
    else if line.contains("\x1b]777;notify;") {
        line.split("\x1b]777;notify;").nth(1).map(|s| {
            s.split('\x07').next().unwrap_or(s).to_string()
        })
    } else {
        None
    }
}
```

**UI Updates**:
```typescript
// In Sidebar.tsx - notification badge
{tab.notificationCount > 0 && (
  <span style={{
    marginLeft: 5,
    backgroundColor: '#4fc3f7',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: 11,
  }}>
    {tab.notificationCount}
  </span>
)}

// Active tab has blue left border
borderLeft: tab.hasNotification ? '3px solid #4fc3f7' : '3px solid transparent'
```

**Must NOT do**:
- Don't handle all OSC sequences (only 9, 99, and 777)
- Don't add notification sounds (out of scope)
- Don't support markdown in notifications (out of scope)

**Acceptance Criteria**:
- [ ] OSC 9 sequence triggers notification
- [ ] OSC 777 sequence triggers notification
- [ ] OSC 99 sequence triggers notification
- [ ] Tab shows blue left border when hasNotification=true
- [ ] Pane-level blue ring around terminal when notification arrives
- [ ] Tab shows badge with count
- [ ] OS notification appears (Linux desktop notification)
- [ ] Clicking tab clears notification

**QA Scenarios**:

Scenario: OSC 9 notification triggers UI update
Tool: interactive_bash
Preconditions: Task 4 complete
Steps:
  1. Launch app, create tab
  2. In terminal, type: `echo -e "\e]9;Claude needs input\007"`
  3. Verify tab shows blue border
 4. Verify tab shows "Claude needs input" as notification preview in sidebar
 5. Verify OS notification appears
  5. Verify OS notification appears
  6. Take screenshot
  7. Click tab
  8. Verify blue border removed
Expected Result: Notification detected and displayed
Evidence: .sisyphus/evidence/task-5-notification-osc9.png

Scenario: OSC 777 notification works
Tool: interactive_bash
Steps:
  1. In terminal, type: `printf '\e]777;notify;%s\007' "Build complete"`
  2. Verify notification detected
Expected Result: Same behavior as OSC 9
Evidence: .sisyphus/evidence/task-5-notification-osc777.png

Scenario: Multiple notifications accumulate
Tool: interactive_bash
Steps:
  1. Send 3 different notifications
  2. Verify badge shows "3"
  3. Click tab
  4. Verify badge cleared
Expected Result: Count accumulates, clears on focus
Evidence: .sisyphus/evidence/task-5-notification-count.png

**Commit**: YES
- Message: `feat: add OSC 9/777 notification detection and UI`
- Files: `src-tauri/src/lib.rs`, `src/components/Sidebar.tsx`, `src/components/Terminal.tsx`

---

### Task 5b: Notification Panel
**What to do**:
- Create slide-out notification panel component
- List all tabs with pending notifications
- Show tab title, notification text, working directory
- Click notification to jump to tab
- Clear individual notifications or clear all
- Keyboard shortcut: Cmd/Ctrl+I to toggle panel
- Update tabs store to support notification panel state

**Code to write**:
- `src/components/NotificationPanel.tsx` - Panel component
- `src/hooks/useNotificationPanel.ts` - Panel state management
- Update `src/state/tabs.ts` - Add panel state and helper actions
- Update `App.tsx` or `Layout.tsx` - Integrate panel

**Key Implementation**:
```typescript
// NotificationPanel.tsx
export function NotificationPanel({ isOpen, onClose }: PanelProps) {
  const { tabs, setActiveTab, clearNotification } = useTabsStore();
  const notifiedTabs = tabs.filter(t => t.hasNotification);
  
  return (
    <div className={`notification-panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <h3>Notifications ({notifiedTabs.length})</h3>
        <button onClick={onClose}>×</button>
      </div>
      {notifiedTabs.map(tab => (
        <div 
          key={tab.id}
          className="notification-item"
          onClick={() => {
            setActiveTab(tab.id);
            onClose();
          }}
        >
          <div className="notification-title">{tab.title}</div>
          <div className="notification-text">{tab.notificationText}</div>
          <div className="notification-meta">
            {tab.cwd} {tab.gitBranch && `• ${tab.gitBranch}`}
          </div>
          <button onClick={(e) => {
            e.stopPropagation();
            clearNotification(tab.id);
          }}>
            Clear
          </button>
        </div>
      ))}
      {notifiedTabs.length > 0 && (
        <button onClick={() => notifiedTabs.forEach(t => clearNotification(t.id))}>
          Clear All
        </button>
      )}
    </div>
  );
}
```

**Must NOT do**:
- Don't persist notifications across sessions (out of scope)
- Don't add notification history beyond current session
- Don't add filtering/sorting in MVP
- Don't add notification actions (buttons in notifications)

**Acceptance Criteria**:
- [ ] Panel opens/closes with keyboard shortcut (Cmd/Ctrl+I)
- [ ] Panel shows all tabs with pending notifications
- [ ] Each item shows title, notification text, cwd, branch
- [ ] Click navigates to correct tab
- [ ] Can clear individual notification
- [ ] Can clear all notifications
- [ ] Panel closes when clicking outside (optional)

**QA Scenarios**:

Scenario: Notification panel shows all notifications
Tool: interactive_bash
Preconditions: Task 5 complete
Steps:
 1. Create 3 tabs
 2. Send notification in tab 2: `echo -e "\e]9;Message 1\007"`
 3. Send notification in tab 3: `echo -e "\e]9;Message 2\007"`
 4. Press Ctrl+I to open panel
 5. Verify both notifications listed
 6. Click notification for tab 3
 7. Verify switched to tab 3
Expected Result: Panel displays notifications, click navigates
Evidence: .sisyphus/evidence/task-5b-notification-panel.png

**Commit**: YES
- Message: `feat: add notification panel with jump-to functionality`
- Files: `src/components/NotificationPanel.tsx`, `src/hooks/useNotificationPanel.ts`

---

### Task 6: Git Branch Detection + Keyboard Shortcuts + Polish

### Task 6: Git Branch Detection + Keyboard Shortcuts + Polish
**What to do**:
- Add notify crate for file watching
- Watch each tab's working directory for .git/HEAD changes
- Parse git branch from HEAD file
- Update tab store with branch name
- Show branch in sidebar
- Add keyboard shortcuts:
  - Ctrl+T new tab
  - Ctrl+W close tab
  - **Ctrl+Shift+U jump to latest unread notification**
- Add error handling for failed commands
- Final styling polish
**What to do**:
- Add notify crate for file watching
- Add notify crate for file watching
- Watch each tab's working directory for .git/HEAD changes
- Parse git branch from HEAD file
- Update tab store with branch name
- Show branch in sidebar
- Add keyboard shortcuts (Ctrl+T new tab, Ctrl+W close tab)
- Add error handling for failed commands
- Final styling polish

**Code to write**:
- `src-tauri/src/git.rs` - Git branch detection
- Update `src-tauri/src/lib.rs` - Add git watching
- Update `src/state/tabs.ts` - Add git update action
- Update `src/components/Sidebar.tsx` - Show branch
- `src/hooks/useKeyboardShortcuts.ts`

**Git Detection**:
```rust
use notify::{Watcher, RecursiveMode, watcher};
use std::sync::mpsc::channel;

fn watch_git_head(session_id: String, cwd: String, app_handle: AppHandle) {
    let (tx, rx) = channel();
    let mut watcher = watcher(tx, Duration::from_secs(1)).unwrap();
    
    let git_head = Path::new(&cwd).join(".git/HEAD");
    if git_head.exists() {
        watcher.watch(&git_head, RecursiveMode::NonRecursive).unwrap();
        
        std::thread::spawn(move || {
            loop {
                match rx.recv() {
                    Ok(_) => {
                        if let Ok(branch) = read_git_branch(&git_head) {
                            app_handle.emit("git-branch-update", {
                                session_id: session_id.clone(),
                                branch,
                            }).unwrap();
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}

fn read_git_branch(head_path: &Path) -> Result<String, std::io::Error> {
    let content = std::fs::read_to_string(head_path)?;
    // Parse "ref: refs/heads/main" -> "main"
    Ok(content.trim()
        .strip_prefix("ref: refs/heads/")
        .unwrap_or(&content)
        .to_string())
}
```

**Keyboard Shortcuts**:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      addTab();
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeTabId]);
```

**Must NOT do**:
- Don't watch entire directory tree (too expensive)
- Don't auto-detect git repo on init (user can see ~ initially)
- Don't add complex git status (only branch name)

**Acceptance Criteria**:
- [ ] Git branch shows in sidebar when in git repo
- [ ] Branch updates when switching branches
- [ ] Ctrl+T creates new tab
- [ ] Ctrl+W closes active tab
- [ ] No console errors
- [ ] Graceful handling when PTY spawn fails
- [ ] Window title updates with active tab

**QA Scenarios**:

Scenario: Git branch detection works
Tool: interactive_bash
Preconditions: Task 5 complete
Steps:
  1. Launch app in a git repo directory
  2. Create tab
  3. Verify sidebar shows branch name (e.g., "main")
  4. In terminal: `git checkout -b test-branch`
  5. Verify sidebar updates to "test-branch"
  6. Take screenshot
Expected Result: Branch name visible and updates
Evidence: .sisyphus/evidence/task-6-git-branch.png

Scenario: Keyboard shortcuts work
Tool: interactive_bash
Steps:
  1. Press Ctrl+T
  2. Verify new tab created
  3. Press Ctrl+W
  4. Verify tab closed
Expected Result: Shortcuts trigger actions
Evidence: .sisyphus/evidence/task-6-shortcuts.txt

Scenario: Jump to latest unread works
Tool: interactive_bash
Steps:
 1. Create 3 tabs
 2. In tab 3, send notification: `echo -e "\e]9;Test\007"`
 3. Switch to tab 1
 4. Press Ctrl+Shift+U
 5. Verify tab 3 becomes active
Expected Result: Jumped to tab with notification
Evidence: .sisyphus/evidence/task-6-jump-unread.txt

**Commit**: YES
- Message: `feat: add git branch detection and keyboard shortcuts`
- Files: `src-tauri/src/git.rs`, `src/hooks/useKeyboardShortcuts.ts`, `src/components/Sidebar.tsx`

---

## Final Verification Wave

### Task F1: End-to-End QA
**What to do**:
- Test complete workflow:
  1. Launch app
  2. Create 3 tabs
  3. In each: navigate to different directories
  4. In one: trigger OSC notification
  5. Switch between tabs
  6. Close all tabs
  7. Verify no orphaned processes
- Check memory usage over time
- Test with real AI agent (Claude Code or similar)
- Document any issues

**Acceptance Criteria**:
- [ ] All user stories work
- [ ] No critical bugs
- [ ] Memory stable (no leaks)
- [ ] Ready for Next Steps

**QA Scenarios**:

Scenario: Full user workflow
Tool: interactive_bash
Steps:
 1. Launch app
 2. Create 3 tabs (Ctrl+T)
 3. In tab 1: `cd ~/project1` (git repo)
 4. In tab 2: `cd ~/project2`
 5. In tab 3: run `claude-code` or simulate with OSC
 6. Verify tab 1 shows git branch
 7. When agent needs input, verify notification appears
 8. **Verify pane-level blue ring appears around terminal**
 9. Open notification panel (Ctrl+I), verify notification listed
 10. Press Ctrl+Shift+U, verify jumps to notified tab
 11. Switch to tab 3
 12. Verify notification cleared
 13. Close all tabs (Ctrl+W)
 14. Verify no bash processes: `ps aux | grep bash | grep -v grep`
Expected Result: All features work together
Evidence: .sisyphus/evidence/final-e2e-workflow.png
Tool: interactive_bash
Steps:
  1. Launch app
  2. Create 3 tabs (Ctrl+T)
  3. In tab 1: `cd ~/project1` (git repo)
  4. In tab 2: `cd ~/project2`
  5. In tab 3: run `claude-code` or simulate with OSC
  6. Verify tab 1 shows git branch
  7. When agent needs input, verify notification appears
 7. When agent needs input, verify notification appears
 8. **Verify pane-level blue ring appears around terminal**
 9. Open notification panel (Ctrl+I), verify notification listed
 10. Press Ctrl+Shift+U, verify jumps to notified tab
 11. Switch to tab 3
 12. Verify notification cleared
 13. Close all tabs (Ctrl+W)
 14. Verify no bash processes: `ps aux | grep bash | grep -v grep`
Expected Result: All features work together
Evidence: .sisyphus/evidence/final-e2e-workflow.png
 9. Open notification panel (Ctrl+I), verify notification listed
 10. Press Ctrl+Shift+U, verify jumps to notified tab
 11. Switch to tab 3
 12. Verify notification cleared
  9. Verify notification cleared
  10. Close all tabs (Ctrl+W)
  11. Verify no bash processes: `ps aux | grep bash | grep -v grep`
Expected Result: All features work together
Evidence: .sisyphus/evidence/final-e2e-workflow.png

### Task F2: Build Verification
**What to do**:
- Run `npm run tauri build`
- Verify Linux .deb/.AppImage created
- Test installing/running binary
- Check bundle size

**Acceptance Criteria**:
- [ ] Build succeeds
- [ ] Binary launches
- [ ] Bundle size < 20MB

---

## Commit Strategy

- Task 1: `chore: initialize Tauri v2 with React + Vite`
- Task 2: `feat: add PTY backend with portable-pty`
- Task 3: `feat: add xterm.js terminal component`
- Task 4: `feat: add vertical sidebar with tab management`
- Task 5: `feat: add OSC 9/777 notification detection and UI`
- **Task 5b: `feat: add notification panel with jump-to functionality`**
- Task 6: `feat: add git branch detection and keyboard shortcuts`
- F1: `test: complete end-to-end QA`
- F2: `build: verify Linux build`


---

## Success Criteria

### Verification Commands
```bash
# Build and run
cd /home/blake/Documents/software/ymir
npm run tauri dev

# In another terminal - check processes
ps aux | grep -E "(bash|cmux)" | grep -v grep

# Build for distribution
npm run tauri build
ls -la src-tauri/target/release/bundle/
```

### Final Checklist
- [ ] App launches with `npm run tauri dev`
- [ ] Can create multiple tabs (Ctrl+T)
- [ ] Can close tabs (Ctrl+W)
- [ ] **Can jump to latest unread (Ctrl+Shift+U)**
- [ ] **Can toggle notification panel (Ctrl+I)**
- [ ] Terminal accepts input and shows output
- [ ] OSC 9 sequence triggers notification
- [ ] OSC 777 sequence triggers notification
- [ ] Notification shows blue border + badge
- [ ] **Pane-level blue ring appears when notification arrives**
- [ ] **Notification panel shows all pending notifications**
- [ ] **Working directory displayed in sidebar**
- [ ] Git branch detected and displayed
- [ ] No orphaned processes after closing
- [ ] Build succeeds


---

## Next Steps (Post-MVP)

After MVP is complete, here's the roadmap for future iterations. These are planned but NOT detailed—execution will be adaptive based on MVP learnings.

### Phase 2: Enhanced Notifications (Week 2-3)
**Scope**: Richer notification experience
- [ ] ~~Notification history panel~~ (COMPLETED IN MVP)
- [ ] ~~Notification timestamps~~ (COMPLETED IN MVP)
- [ ] Persistent notifications across sessions
- [ ] Notification actions (buttons in notification)
- [ ] Different notification colors by severity
- [ ] Sound notifications (optional)
- [ ] Notification filtering and search
**Scope**: Richer notification experience
- [ ] Notification history panel (sidebar section)
- [ ] Notification timestamps
- [ ] Persistent notifications across sessions
- [ ] Notification actions (buttons in notification)
- [ ] Different notification colors by severity
- [ ] Sound notifications (optional)

### Phase 3: Split Panes (Week 3-4)
**Scope**: Multi-pane layout like original cmux
- [ ] Horizontal split (Cmd+D)
- [ ] Vertical split (Cmd+Shift+D)
- [ ] Pane focus management (Alt+Cmd+arrows)
- [ ] Pane resizing
- [ ] Independent tabs per pane

### Phase 4: In-App Browser (Week 4-5)
**Scope**: Scriptable browser alongside terminal
- [ ] Tauri WebView integration
- [ ] Split browser + terminal view
- [ ] Scriptable API (click, fill, evaluate JS)
- [ ] Accessibility tree snapshot
- [ ] Browser tabs in sidebar

### Phase 5: Workspaces & Persistence (Week 5-6)
**Scope**: Multiple windows, session restore
- [ ] Workspaces (window groups)
- [ ] Session persistence (save/restore tabs)
- [ ] Window layout restoration
- [ ] Working directory restore
- [ ] Scrollback buffer persistence

### Phase 6: Advanced Features (Week 6-8)
**Scope**: Feature parity with cmux
- [ ] PR status in sidebar (GitHub/GitLab integration)
- [ ] Port detection and display
- [ ] CLI for external automation
- [ ] Settings/config UI
- [ ] Theme support (import Ghostty config)
- [ ] Plugin system

### Phase 7: Polish & Distribution (Week 8+)
**Scope**: Production-ready
- [ ] Auto-updater (Tauri updater)
- [ ] Code signing
- [ ] Package managers (Homebrew, AUR, etc.)
- [ ] Documentation
- [ ] Unit/integration tests
- [ ] Performance optimization

---

## Technical Debt & Considerations

### Known Limitations
1. **No GPU acceleration**: xterm.js canvas renderer vs cmux's libghostty
2. **Single window**: No workspace support in MVP
3. **No persistence**: Tabs don't survive app restart
4. **Basic notifications**: No history, just current state
5. **Manual git detection**: Could use libgit2 for better detection

### Future Architecture Decisions
1. **Replace xterm.js?**: Consider alacritty_terminal or custom GPU renderer
2. **Async I/O**: Currently using threads, could move to tokio::io
3. **State persistence**: SQLite or JSON file for sessions
4. **Multi-window**: Tauri multi-window or separate processes
5. **Plugin system**: WASI or dynamic linking for extensions

---

## Resources & References

### Documentation
- Tauri v2: https://v2.tauri.app/
- xterm.js: https://xtermjs.org/
- portable-pty: https://docs.rs/portable-pty/
- React: https://react.dev/

### Original cmux
- GitHub: https://github.com/manaflow-ai/cmux
- Features: Ghostty-based, Swift+AppKit, libghostty

### OSC Sequences
- iTerm2 OSC 9: https://iterm2.com/documentation-escape-sequences.html
- urxvt OSC 777: https://github.com/Waldteufel/osc_notify

---

## Questions for User

Before proceeding, consider these questions:

1. **Do you want to test with a real AI agent?** I can include instructions for testing with Claude Code, OpenCode, or Aider.


2. **What Linux distro?** Different distros have different notification systems (notify-send, dunst, etc.). I can configure for your specific setup.

3. **Do you want dark theme only?** Ymir is dark-first. I can add light theme support but it's extra work.

4. **Shell preference?** Uses your $SHELL by default. Want to customize?

5. **Git provider?** Planning generic git. Want GitHub/GitLab-specific features (PR status)?

Run `/start-work ymir-tauri-mvp` to begin execution when ready.

