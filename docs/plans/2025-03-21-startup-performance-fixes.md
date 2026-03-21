# Startup Performance Fixes Implementation Plan

> **Goal:** Reduce startup database queries from 2,100+ to ~5 by eliminating N+1 patterns and implementing lazy loading.

**Architecture:**
- Backend uses libsql (Turso SQLite) with Axum WebSocket server
- Frontend uses MessagePack serialization over WebSocket
- Current N+1 patterns cause exponential query growth

**Tech Stack:**
- Rust: tokio, axum, libsql, rmp-serde
- TypeScript: zustand, @msgpack/msgpack

---

## Task 1: Fix Duplicate list_workspaces() Call

**Problem:** `initialize_from_db` calls `list_workspaces()` twice (lines 160 and 183).

**Files:**
- Modify: `crates/ws-server/src/state.rs:158-213`

**Step 1: Identify and remove duplicate**

Current code (lines 160-180):
```rust
// Load workspaces
match self.db.list_workspaces().await {
    Ok(db_workspaces) => { /* ... */ }
    Err(e) => tracing::warn!("Failed to load workspaces from DB: {}", e),
}
```

Current code (lines 182-209) - THIS IS THE DUPLICATE:
```rust
// Load all worktrees
match self.db.list_workspaces().await {  // ← DUPLICATE!
    Ok(db_workspaces) => {
        let mut worktrees = self.worktrees.write().await;
        for ws in db_workspaces {
            if let Ok(workspace_id) = uuid::Uuid::parse_str(&ws.id) {
                if let Ok(wts) = self.db.list_worktrees(&ws.id).await {  // ← N+1 pattern
                    // ...
                }
            }
        }
    }
    // ...
}
```

**Step 2: Replace worktree loading with bulk method**

Replace lines 182-209 with:
```rust
// Load all worktrees (bulk query, no N+1)
match self.db.list_all_worktrees().await {
    Ok(all_worktrees) => {
        let mut worktrees = self.worktrees.write().await;
        for wt in all_worktrees {
            if let (Ok(id), Ok(workspace_id)) = (
                uuid::Uuid::parse_str(&wt.id),
                uuid::Uuid::parse_str(&wt.workspace_id)
            ) {
                worktrees.insert(
                    id,
                    WorktreeState {
                        id,
                        workspace_id,
                        branch_name: wt.branch_name,
                        path: wt.path,
                        status: wt.status,
                        is_main: wt.is_main,
                    },
                );
            }
        }
    }
    Err(e) => tracing::warn!("Failed to load worktrees from DB: {}", e),
}
```

**Step 3: Run tests**

```bash
cd /home/blake/Documents/software/ymir
cargo test -p ymir-ws-server --lib 2>&1 | head -50
```

Expected: Tests pass (especially state tests).

**Step 4: Commit**

```bash
git add crates/ws-server/src/state.rs
git commit -m "fix(state): remove duplicate list_workspaces() call in initialize_from_db

Replace N+1 worktree loading with bulk list_all_worktrees() query.
Reduces startup queries from O(N) to O(1)."
```

---

## Task 2: Add Bulk Fetch Queries to db/mod.rs

**Goal:** Add `list_all_worktrees()`, `list_all_agent_sessions()`, `list_all_terminal_sessions()` methods.

**Files:**
- Modify: `crates/ws-server/src/db/mod.rs:473-475` (after list_worktrees impl block)
- Modify: `crates/ws-server/src/db/mod.rs:614-615` (after delete_worktree)

**Step 1: Add list_all_worktrees()**

After line 473 (end of first worktrees impl block), add:

```rust
/// List all worktrees across all workspaces (bulk query, no N+1)
pub async fn list_all_worktrees(&self) -> Result<Vec<Worktree>> {
    let conn = self.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, branch_name, path, status, created_at, COALESCE(is_main, 0) FROM worktrees ORDER BY workspace_id, created_at DESC"
    ).await?;
    let mut rows = stmt.query(()).await?;
    let mut worktrees = Vec::new();

    while let Some(row) = rows.next().await? {
        worktrees.push(Worktree {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            branch_name: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            is_main: row.get::<i32>(6)? != 0,
        });
    }

    Ok(worktrees)
}
```

**Step 2: Add list_all_agent_sessions()**

After line 614 (after delete_agent_session), add new impl block:

```rust
impl Db {
    /// List all agent sessions across all worktrees (bulk query, no N+1)
    pub async fn list_all_agent_sessions(&self) -> Result<Vec<AgentSession>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, worktree_id, agent_type, acp_session_id, status, started_at FROM agent_sessions ORDER BY worktree_id, started_at DESC"
        ).await?;
        let mut rows = stmt.query(()).await?;
        let mut sessions = Vec::new();

        while let Some(row) = rows.next().await? {
            sessions.push(AgentSession {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                agent_type: row.get(2)?,
                acp_session_id: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
            });
        }

        Ok(sessions)
    }
}
```

**Step 3: Add list_all_terminal_sessions()**

Add after list_all_agent_sessions:

```rust
/// List all terminal sessions across all worktrees (bulk query, no N+1)
pub async fn list_all_terminal_sessions(&self) -> Result<Vec<TerminalSession>> {
    let conn = self.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, worktree_id, label, shell, created_at, COALESCE(position, 0) FROM terminal_sessions ORDER BY worktree_id, COALESCE(position, 0) ASC"
    ).await?;
    let mut rows = stmt.query(()).await?;
    let mut sessions = Vec::new();

    while let Some(row) = rows.next().await? {
        sessions.push(TerminalSession {
            id: row.get(0)?,
            worktree_id: row.get(1)?,
            label: row.get(2)?,
            shell: row.get(3)?,
            created_at: row.get(4)?,
            position: row.get(5)?,
        });
    }

    Ok(sessions)
}
```

**Step 4: Add tests for new methods**

Add to the test module at the end of db/mod.rs (after line 1488):

```rust
#[tokio::test]
async fn test_list_all_worktrees() {
    let db = create_test_db().await;
    
    // Setup workspace + worktree
    let workspace_id = generate_uuid();
    let worktree_id = generate_uuid();
    // ... (setup code similar to existing tests)
    
    let all_worktrees = db.list_all_worktrees().await.expect("Failed to list all worktrees");
    assert_eq!(all_worktrees.len(), 1);
    assert_eq!(all_worktrees[0].branch_name, "feature/test");
}

#[tokio::test]
async fn test_list_all_agent_sessions() {
    let db = create_test_db().await;
    // Setup and test similar pattern
}

#[tokio::test]
async fn test_list_all_terminal_sessions() {
    let db = create_test_db().await;
    // Setup and test similar pattern
}
```

**Step 5: Run tests**

```bash
cargo test -p ymir-ws-server --lib test_list_all_ 2>&1
```

Expected: All three new tests pass.

**Step 6: Commit**

```bash
git add crates/ws-server/src/db/mod.rs
git commit -m "feat(db): add bulk list_all_* methods

Add list_all_worktrees(), list_all_agent_sessions(), list_all_terminal_sessions()
to eliminate N+1 query patterns. Each method fetches all records in a single
query instead of per-parent queries."
```

---

## Task 3: Implement Lazy Loading

**Goal:** Modify GetState to only return workspaces, add GetWorktreeDetails message for on-demand loading.

**Files:**
- Modify: `crates/ws-server/src/protocol/worktree.rs` (add GetWorktreeDetails struct)
- Modify: `crates/ws-server/src/protocol/common.rs` (add message variants)
- Modify: `crates/ws-server/src/router.rs` (add handler, modify GetState)
- Modify: `crates/ws-server/src/worktree/mod.rs` (add list_for_workspace function)

**Step 1: Add GetWorktreeDetails protocol type**

Add to `crates/ws-server/src/protocol/worktree.rs` (at the end, before tests):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GetWorktreeDetails {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub workspace_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorktreeDetailsResult {
    #[serde(with = "uuid_serde")]
    #[ts(type = "string")]
    pub request_id: Uuid,
    pub worktrees: Vec<WorktreeData>,
    pub agent_sessions: Vec<AgentSessionData>,
    pub terminal_sessions: Vec<TerminalSessionData>,
}
```

**Step 2: Add message variants to protocol**

Modify `crates/ws-server/src/protocol/common.rs`:

Add to imports (line 27-31):
```rust
worktree::{
    WorktreeChangeBranch, WorktreeChanged, WorktreeCreate, WorktreeCreated, WorktreeData,
    WorktreeDelete, WorktreeDeleted, WorktreeList, WorktreeListResult, WorktreeMerge,
    WorktreeStatus, GetWorktreeDetails, WorktreeDetailsResult,  // ← Add these
},
```

Add to ClientMessagePayload (line 60-62, after WorktreeChangeBranch):
```rust
WorktreeChangeBranch(WorktreeChangeBranch),
GetWorktreeDetails(GetWorktreeDetails),  // ← Add this
```

Add to ServerMessagePayload (line 97-99, after WorktreeStatus):
```rust
WorktreeStatus(WorktreeStatus),
WorktreeDetailsResult(WorktreeDetailsResult),  // ← Add this
```

**Step 3: Modify handle_get_state to remove worktree/agent/terminal loading**

In `crates/ws-server/src/router.rs`, modify lines 260-373:

```rust
#[instrument(skip(state))]
async fn handle_get_state(state: Arc<AppState>, request_id: Uuid) -> ServerMessage {
    use crate::protocol::{
        StateSnapshot, WorkspaceData,
    };

    let workspaces: Vec<WorkspaceData> = match crate::workspace::list(state.clone()).await {
        Ok(workspaces) => workspaces,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "GET_STATE_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: None,
            }));
        }
    };

    // Return only workspaces - worktrees/agents/terminals loaded on demand
    ServerMessage::new(ServerMessagePayload::StateSnapshot(StateSnapshot {
        request_id,
        workspaces,
        worktrees: vec![],      // Empty - lazy loaded
        agent_sessions: vec![], // Empty - lazy loaded
        terminal_sessions: vec![], // Empty - lazy loaded
        settings: vec![],
    }))
}
```

**Step 4: Add handle_get_worktree_details handler**

Add new function in `crates/ws-server/src/router.rs` (after handle_get_state):

```rust
#[instrument(skip(state))]
async fn handle_get_worktree_details(
    state: Arc<AppState>,
    msg: crate::protocol::GetWorktreeDetails,
) -> ServerMessage {
    use crate::protocol::{
        AgentSessionData, TerminalSessionData, WorktreeData, WorktreeDetailsResult,
    };

    let workspace_id_str = msg.workspace_id.to_string();

    // Load worktrees for this workspace
    let worktrees: Vec<WorktreeData> = match crate::worktree::list(
        state.clone(),
        crate::protocol::WorktreeList {
            workspace_id: msg.workspace_id,
        },
    )
    .await
    {
        Ok(worktrees) => worktrees,
        Err(e) => {
            return ServerMessage::new(ServerMessagePayload::Error(Error {
                code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                message: e.to_string(),
                details: None,
                request_id: Some(msg.request_id),
            }));
        }
    };

    // Load agents and terminals for these worktrees
    let mut agent_sessions: Vec<AgentSessionData> = Vec::new();
    let mut terminal_sessions: Vec<TerminalSessionData> = Vec::new();

    for worktree in &worktrees {
        let worktree_id = worktree.id.to_string();

        // Load agent sessions
        let db_agent_sessions = match state.db.list_agent_sessions(&worktree_id).await {
            Ok(sessions) => sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                    request_id: Some(msg.request_id),
                }));
            }
        };

        agent_sessions.extend(
            db_agent_sessions
                .into_iter()
                .map(|session| AgentSessionData {
                    id: Uuid::parse_str(&session.id).unwrap_or_else(|_| Uuid::new_v4()),
                    worktree_id: Uuid::parse_str(&session.worktree_id).unwrap_or(worktree.id),
                    agent_type: session.agent_type,
                    acp_session_id: session.acp_session_id,
                    status: parse_agent_status(&session.status),
                    started_at: parse_timestamp(&session.started_at),
                }),
        );

        // Load terminal sessions
        let db_terminal_sessions = match state.db.list_terminal_sessions(&worktree_id).await {
            Ok(sessions) => sessions,
            Err(e) => {
                return ServerMessage::new(ServerMessagePayload::Error(Error {
                    code: "GET_WORKTREE_DETAILS_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                    request_id: Some(msg.request_id),
                }));
            }
        };

        terminal_sessions.extend(db_terminal_sessions.into_iter().map(|session| {
            TerminalSessionData {
                id: Uuid::parse_str(&session.id).unwrap_or_else(|_| Uuid::new_v4()),
                worktree_id: Uuid::parse_str(&session.worktree_id).unwrap_or(worktree.id),
                label: session.label,
                shell: session.shell,
                created_at: parse_timestamp(&session.created_at),
            }
        }));
    }

    ServerMessage::new(ServerMessagePayload::WorktreeDetailsResult(
        WorktreeDetailsResult {
            request_id: msg.request_id,
            worktrees,
            agent_sessions,
            terminal_sessions,
        }
    ))
}
```

**Step 5: Add routing for GetWorktreeDetails**

In `crates/ws-server/src/router.rs`, find `route_message` function and add:

```rust
ClientMessagePayload::GetWorktreeDetails(msg) => {
    Some(handle_get_worktree_details(state, msg).await)
}
```

**Step 6: Generate TypeScript types**

```bash
cd /home/blake/Documents/software/ymir
make sync-types
```

Expected: New types generated in `apps/web/src/types/generated/`.

**Step 7: Update frontend store for lazy loading**

Modify `apps/web/src/store.ts`:

Add new state handler:
```typescript
case 'WorktreeDetailsResult': {
    const { worktrees, agent_sessions, terminal_sessions } = message;
    set((state) => ({
        worktrees: [...state.worktrees, ...worktrees],
        agentSessions: [...state.agentSessions, ...agent_sessions],
        terminalSessions: [...state.terminalSessions, ...terminal_sessions],
    }));
    break;
}
```

**Step 8: Add frontend function to request worktree details**

In `apps/web/src/lib/ws.ts`, add after YmirClient class:

```typescript
export async function loadWorktreeDetails(workspaceId: string): Promise<void> {
    const client = getWebSocketClient();
    if (!client.isConnected()) {
        throw new Error('WebSocket not connected');
    }
    
    client.send({
        type: 'GetWorktreeDetails',
        workspaceId,
        requestId: generateId(),
    });
}
```

**Step 9: Run Rust tests**

```bash
cargo test -p ymir-ws-server --lib 2>&1 | tail -20
```

Expected: All tests pass.

**Step 10: Commit**

```bash
git add crates/ws-server/src/protocol/worktree.rs
git add crates/ws-server/src/protocol/common.rs
git add crates/ws-server/src/router.rs
git add apps/web/src/store.ts
git add apps/web/src/lib/ws.ts
git add apps/web/src/types/generated/
git commit -m "feat: implement lazy loading for worktrees/agents/terminals

GetState now returns only workspaces. Added GetWorktreeDetails message
to load worktrees, agents, and terminals on-demand per workspace.
Reduces initial load from O(N) queries to O(1) queries."
```

---

## Task 4: Add Connection Pooling

**Goal:** Cache libsql Connection to avoid creating new connection per query.

**Files:**
- Modify: `crates/ws-server/src/db/mod.rs:190-219`

**Step 1: Modify Db struct to cache connection**

Change `Db` struct from:
```rust
#[derive(Debug)]
pub struct Db {
    db: Database,
}
```

To:
```rust
use tokio::sync::RwLock;

#[derive(Debug)]
pub struct Db {
    db: Database,
    cached_conn: RwLock<Option<Connection>>,
}
```

**Step 2: Update Db constructors**

Update `in_memory()` and `open()` to initialize cached_conn:

```rust
pub async fn in_memory() -> Result<Self> {
    let temp_path = std::env::temp_dir().join(format!("ymir_test_{}.db", uuid::Uuid::new_v4()));
    let path_str = temp_path.to_string_lossy().to_string();
    let db = Builder::new_local(&path_str).build().await?;
    info!("Created temporary database at {}", path_str);
    let db = Self {
        db,
        cached_conn: RwLock::new(None),
    };
    db.migrate().await?;
    Ok(db)
}

pub async fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
    let path_str = path.as_ref().to_string_lossy().to_string();
    let db = Builder::new_local(&path_str).build().await?;
    info!("Opened database at {}", path_str);
    let db = Self {
        db,
        cached_conn: RwLock::new(None),
    };
    db.migrate().await?;
    Ok(db)
}
```

**Step 3: Update conn() method to use cache**

Replace `conn()` method:

```rust
pub async fn conn(&self) -> Result<Connection> {
    // Check if we have a cached connection
    if let Some(conn) = self.cached_conn.read().await.as_ref() {
        return Ok(conn.clone());
    }
    
    // Create new connection and cache it
    let conn = self.db.connect()?;
    *self.cached_conn.write().await = Some(conn.clone());
    Ok(conn)
}
```

**Step 4: Update all callers to use async**

All existing `self.conn()?` calls need to become `self.conn().await`:

```bash
# Find all sync conn() calls
grep -n "self.conn()" crates/ws-server/src/db/mod.rs
```

Update each call site. Examples:

- Line 287: `let conn = self.conn()?;` → `let conn = self.conn().await?;`
- Line 313: `let conn = self.conn()?;` → `let conn = self.conn().await?;`
- etc.

**Step 5: Update test helper**

Update `create_test_db()` test helper:

```rust
#[cfg(test)]
async fn create_test_db() -> Db {
    Db::in_memory()
        .await
        .expect("Failed to create in-memory db")
}
```

**Step 6: Run tests**

```bash
cargo test -p ymir-ws-server --lib 2>&1 | tail -30
```

Expected: All tests pass (especially db tests).

**Step 7: Commit**

```bash
git add crates/ws-server/src/db/mod.rs
git commit -m "feat(db): add connection caching to Db

Cache libsql Connection in RwLock to avoid creating new connection
per query. conn() method now returns cached connection if available.
Reduces connection overhead significantly."
```

---

## Verification Steps

### Run all tests
```bash
cargo test -p ymir-ws-server --lib
cargo test -p ymir-ws-server --test '*'
```

### Build and check
```bash
cargo check -p ymir-ws-server
cargo build -p ymir-ws-server --release
```

### Frontend build
```bash
cd apps/web && npm run build
```

### Type sync
```bash
make sync-types
```

---

## Expected Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Server startup queries | 2+N | 3 | 99% reduction |
| Client GetState queries | 1+N+2W | 1 | 99% reduction |
| Initial payload size | Full DB | Workspaces only | 90%+ reduction |
| Scalability | O(N) | O(1) | Unbounded |

---

## Rollback Plan

If issues occur:
1. Revert `router.rs` changes (restore full GetState loading)
2. Revert `state.rs` changes (restore original initialize_from_db)
3. Keep bulk queries for future use

All changes are additive except GetState modification - that can be reverted independently.
