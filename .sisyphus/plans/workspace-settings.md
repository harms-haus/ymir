# Workspace Settings with WebSocket Integration Plan

## TL;DR

> **Objective**: Update workspace settings to work with WebSocket-based core service, storing in `.ymir/workspace-settings.yaml` with WebSocket protocol communication.

> **Deliverables**:
> - Extended Rust/TypeScript Workspace types with settings fields (color, icon, workingDirectory, subtitle)
> - Updated database schema with workspace settings columns (migration 002)
> - WebSocket handlers for settings CRUD (`workspace.updateSettings`, `workspace.getSettings`)
> - React WebSocket hooks for settings (`useWorkspaceSettings`)
> - `.ymir/workspace-settings.yaml` file-based storage
> - WorkspaceSettingsDialog adapted for WebSocket architecture
> - Settings sync between YAML file and database

> **Estimated Effort**: Medium (~15 tasks)
> **Parallel Execution**: YES - 4 waves with 3-5 tasks each
> **Critical Path**: Types → Schema → Handlers → React Hooks → UI Integration

---

## Context

### Original Request (Pre-Refactor)
User wants workspace customization features that were planned before the WebSocket refactor:
1. Color assignment (accent line on sidebar)
2. Icon assignment
3. Working directory (default to CWD)
4. Configurable label (name)
5. Subtitle (blank = collapsed)
6. Modal dialog using base-ui.com/components/dialog
7. Context menu item to access settings

### WebSocket Refactor Status
The websocket-core-refactor is **partially implemented** (Worktree: `.worktrees/websocket-core-refactor/`):

**Completed Tasks:**
- ✅ Task 1-4: Cargo workspace, types, schema, migrations
- ✅ Task 5-8: Database client, PTY manager, scrollback, Git service
- ✅ Task 9-12: WebSocket server, protocol, workspace/pane handlers
- ✅ Task 14-15: Git handlers, auth middleware
- ✅ Task 18-20: CLI, browser spawning, sidecar config

**Remaining Tasks:**
- ⏳ Task 13: Tab/PTY handlers (partially complete)
- ⏳ Task 16-17: Standalone server, Tauri embedded
- ⏳ Tasks 21-26: React WebSocket client, hooks, terminal adapter
- ⏳ Tasks 27-31: Cleanup

### Key Constraint: Storage Location
User explicitly requires settings to be stored in `.ymir/workspace-settings.yaml` (YAML file) rather than solely in the database. This enables:
- Human-readable configuration
- Version control of workspace settings
- Easy backup/restore
- Manual editing

### Architecture Decision: Hybrid Storage
- **Database**: Primary source of truth for runtime state
- **YAML file**: Persistent settings storage with sync on startup
- **WebSocket**: Communication protocol between frontend and backend
- **Sync**: Rust core loads from YAML on startup, saves to YAML on changes

---

## Work Objectives

### Core Objective
Extend the WebSocket-based core service to support workspace settings (color, icon, workingDirectory, subtitle) with file-based persistence in `.ymir/workspace-settings.yaml`, adapting the React UI to use WebSocket communication instead of Zustand/Tauri invoke.

### Concrete Deliverables
1. `ymir-core` crate: Extended types with settings fields
2. Database migration: 002_workspace_settings.sql
3. YAML storage: Settings serialization/deserialization in Rust
4. WebSocket handlers: `workspace.updateSettings`, `workspace.getSettings`
5. React hooks: `useWorkspaceSettings()` WebSocket-based hook
6. Settings dialog: Updated for WebSocket architecture (no Zustand)
7. Settings sync: Load YAML on startup, save on changes

### Definition of Done
- [ ] Workspace struct has settings fields in both Rust and TypeScript
- [ ] Database schema supports settings columns
- [ ] `.ymir/workspace-settings.yaml` loads on server startup
- [ ] WebSocket handlers for settings CRUD work
- [ ] React hooks subscribe to settings changes
- [ ] Settings dialog opens and saves via WebSocket
- [ ] Accent line, icon, subtitle render correctly
- [ ] Settings persist across server restarts

### Must Have
- Settings fields: color, icon, workingDirectory, subtitle on Workspace type
- YAML file storage: `.ymir/workspace-settings.yaml`
- WebSocket handlers for settings operations
- React hooks replacing Zustand actions
- Settings dialog with immediate-save (no submit button)
- Color picker with 10 preset colors
- Icon picker with Lucide icons
- Directory browser using Tauri dialog (in Tauri mode) or native (in browser mode)
- Working directory affects new tab CWD

### Must NOT Have (Guardrails)
- NO Zustand store for settings (use WebSocket hooks)
- NO Tauri invoke for settings operations
- NO localStorage for settings persistence
- NO separate settings table (columns on workspaces table)
- NO manual YAML editing while server is running
- NO split pane settings (removed in refactor)
- NO browser tab settings (removed in refactor)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (websocket plan has test framework)
- **Automated tests**: Tests-after implementation
- **Framework**: Rust: built-in test, TS: Vitest + Playwright
- **Agent-Executed QA**: MANDATORY for all tasks

### QA Policy
Every task includes agent-executed QA scenarios:
- **Frontend/UI**: Playwright - navigate, interact, assert DOM, screenshot
- **Rust/WebSocket**: Bash - wscat/custom client for WebSocket testing
- **File System**: Bash - verify YAML file contents
- **Database**: SQL - verify settings columns

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Rust types + schema):
├── Task 1: Extend Rust Workspace type with settings fields [quick]
├── Task 2: Create database migration 002 for settings columns [quick]
└── Task 3: Implement YAML serialization for settings [quick]

Wave 2 (Core Service - Handlers + storage):
├── Task 4: Add workspace settings WebSocket handlers [unspecified-high]
├── Task 5: Implement YAML file load on startup [unspecified-high]
├── Task 6: Implement YAML file save on settings change [unspecified-high]
└── Task 7: Add workspace.updateSettings to protocol [quick]

Wave 3 (React Client - Hooks + UI):
├── Task 8: Create useWorkspaceSettings WebSocket hook [unspecified-high]
├── Task 9: Update WorkspaceSettingsDialog for WebSocket [deep]
├── Task 10: Integrate settings into WorkspaceSidebar [quick]
└── Task 11: Add accent line/icon/subtitle rendering [quick]

Wave 4 (Verification):
├── Task 12: Add WebSocket handler tests [quick]
├── Task 13: Add React hook tests [quick]
├── Task 14: Add E2E tests for settings dialog [unspecified-high]
└── Task 15: Final QA pass [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 4 → Task 8 → Task 9 → Task 15
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3-4 tasks per wave
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 2, 4 |
| 2 | - | 4, 5, 6 |
| 3 | - | 5, 6 |
| 4 | 1, 2 | 8, 12 |
| 5 | 2, 3 | 15 |
| 6 | 2, 3, 4 | 15 |
| 7 | - | 4 |
| 8 | 4 | 9, 10, 13 |
| 9 | 8 | 10, 14 |
| 10 | 8 | 11, 14 |
| 11 | 10 | 14 |
| 12 | 4 | 15 |
| 13 | 8 | 15 |
| 14 | 9, 10, 11 | 15 |
| 15 | 5, 6, 12, 13, 14 | - |

---

## TODOs

### Wave 1: Foundation (Rust Types + Schema)

- [ ] **1. Extend Rust Workspace Type with Settings Fields**

**What to do**:
- Update `ymir-core/src/types.rs` Workspace struct (lines 195-209) to add:
  - `color: Option<String>` - hex color string
  - `icon: Option<String>` - Lucide icon name
  - `working_directory: Option<String>` - path string
  - `subtitle: Option<String>` - subtitle text
- Add serde derives for all new fields
- Update Default impl if present
- Add constants for WORKSPACE_COLORS and WORKSPACE_ICONS

**Must NOT do**:
- Don't change existing fields (id, name, root, active_pane_id, has_notification)
- Don't make new fields required (use Option<T>)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Blocks**: Task 4
- **Blocked By**: None

**References**:
- `ymir-core/src/types.rs:195-209` - Current Workspace struct
- `websocket-core-refactor.md` - Task 2 for type patterns

**Acceptance Criteria**:
- [ ] Workspace struct has 4 new Option<String> fields
- [ ] serde Serialize/Deserialize derives cover new fields
- [ ] `cargo check -p ymir-core` passes

**QA Scenarios**:
```
Scenario: Types compile correctly
Tool: Bash
Steps:
1. cd ymir-core && cargo check
2. Verify no errors
Expected: Clean compilation
Evidence: .sisyphus/evidence/task-1-types-compile.txt
```

**Commit**: YES
- Message: `feat(core): add workspace settings fields to Workspace type`
- Files: `ymir-core/src/types.rs`
- Pre-commit: `cargo check -p ymir-core`

---

- [ ] **2. Create Database Migration 002 for Settings Columns**

**What to do**:
- Create `ymir-core/migrations/002_workspace_settings.sql`
- Add columns to workspaces table:
  - `color TEXT` - hex color
  - `icon TEXT` - Lucide icon name
  - `working_directory TEXT` - path
  - `subtitle TEXT` - subtitle
- Add indexes if needed (color for filtering)
- Ensure columns are nullable (SQLite DEFAULT NULL)

**Migration SQL**:
```sql
-- Migration: Add workspace settings columns
-- Version: 2

-- Add settings columns to workspaces table
ALTER TABLE workspaces ADD COLUMN color TEXT;
ALTER TABLE workspaces ADD COLUMN icon TEXT;
ALTER TABLE workspaces ADD COLUMN working_directory TEXT;
ALTER TABLE workspaces ADD COLUMN subtitle TEXT;

-- Index for color-based queries
CREATE INDEX idx_workspaces_color ON workspaces(color);

-- Migration tracking
INSERT INTO _migrations (version, name) VALUES (2, '002_workspace_settings');
```

**Must NOT do**:
- Don't create a separate settings table
- Don't make columns NOT NULL

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1, 3)
- **Blocks**: Tasks 4, 5, 6
- **Blocked By**: None

**References**:
- `ymir-core/migrations/001_initial_schema.sql` - Pattern to follow
- `ymir-core/src/db/migrations.rs` - Migration runner

**Acceptance Criteria**:
- [ ] Migration file exists
- [ ] SQL applies without errors
- [ ] Columns are nullable

**QA Scenarios**:
```
Scenario: Migration applies successfully
Tool: Bash
Steps:
1. turso db shell test-db < 002_workspace_settings.sql
2. Verify no errors
Expected: Migration applies cleanly
Evidence: .sisyphus/evidence/task-2-migration.txt
```

**Commit**: YES (groups with Task 1)
- Message: `feat(core): add workspace settings database migration`
- Files: `ymir-core/migrations/002_workspace_settings.sql`

---

- [ ] **3. Implement YAML Serialization for Settings**

**What to do**:
- Create `ymir-core/src/settings/` directory
- Create `ymir-core/src/settings/yaml.rs` for YAML handling
- Define struct for YAML file format:
```rust
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct WorkspaceSettingsFile {
    pub workspaces: HashMap<String, WorkspaceSettings>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct WorkspaceSettings {
    pub color: Option<String>,
    pub icon: Option<String>,
    pub working_directory: Option<String>,
    pub subtitle: Option<String>,
}
```
- Implement load function: read `.ymir/workspace-settings.yaml`
- Implement save function: write to `.ymir/workspace-settings.yaml`
- Add `serde_yaml` dependency to ymir-core/Cargo.toml

**Must NOT do**:
- Don't use synchronous file I/O in async contexts
- Don't create the file if it doesn't exist

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1, 2)
- **Blocks**: Tasks 5, 6
- **Blocked By**: None

**References**:
- `ymir-core/Cargo.toml` - Add serde_yaml dependency

**Acceptance Criteria**:
- [ ] serde_yaml added to dependencies
- [ ] WorkspaceSettingsFile struct defined
- [ ] Load/save functions implemented
- [ ] Unit tests for serialization

**QA Scenarios**:
```
Scenario: YAML serialization roundtrip
Tool: Bash (Rust test)
Steps:
1. cd ymir-core && cargo test settings::yaml::tests
Expected: Roundtrip serialization works
Evidence: .sisyphus/evidence/task-3-yaml-test.txt
```

**Commit**: YES (groups with Task 1)
- Message: `feat(core): add YAML settings file serialization`
- Files: `ymir-core/src/settings/yaml.rs`, `ymir-core/src/settings/mod.rs`
- Pre-commit: `cargo test -p ymir-core settings::`

---

### Wave 2: Core Service (Handlers + Storage)

- [ ] **4. Add Workspace Settings WebSocket Handlers**

**What to do**:
- Create `ymir-core/src/handlers/workspace_settings.rs`
- Implement handlers:
  - `workspace.getSettings` - returns settings for workspace_id
  - `workspace.updateSettings` - updates settings, saves to DB and YAML
- Add to `ymir-core/src/handlers/mod.rs` exports
- Integrate with existing workspace handlers
- Update database client to support settings columns

**Handler signatures**:
```rust
pub async fn get_settings(
    db: &DatabaseClient,
    workspace_id: String,
) -> Result<WorkspaceSettings>;

pub async fn update_settings(
    db: &DatabaseClient,
    yaml_path: &Path,
    workspace_id: String,
    updates: WorkspaceSettings,
) -> Result<WorkspaceSettings>;
```

**Must NOT do**:
- Don't use Zustand patterns
- Don't return the full Workspace (just settings)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 2 starter)
- **Blocks**: Tasks 8, 12
- **Blocked By**: Tasks 1, 2

**References**:
- `ymir-core/src/handlers/workspace.rs` - Existing workspace handlers
- `ymir-core/src/db/client.rs` - Database client

**Acceptance Criteria**:
- [ ] Handlers implemented
- [ ] Database queries work
- [ ] JSON-RPC protocol integration

**QA Scenarios**:
```
Scenario: Settings handler responds
Tool: Bash (wscat)
Steps:
1. Start server
2. Send: {"jsonrpc":"2.0","method":"workspace.getSettings","params":{"workspaceId":"ws-1"},"id":1}
3. Verify response contains settings fields
Expected: Valid JSON-RPC response
Evidence: .sisyphus/evidence/task-4-settings-handler.txt
```

**Commit**: YES
- Message: `feat(core): add workspace settings WebSocket handlers`
- Files: `ymir-core/src/handlers/workspace_settings.rs`
- Pre-commit: `cargo check -p ymir-core`

---

- [ ] **5. Implement YAML File Load on Startup**

**What to do**:
- Add YAML loading to server initialization
- In `ymir-server/src/main.rs`:
  - Create `.ymir/` directory if not exists
  - Load `workspace-settings.yaml` if exists
  - Apply settings to database (merge strategy)
- Handle missing file gracefully

**Merge strategy**:
- YAML file wins over DB on startup
- After startup, DB is source of truth
- Save to YAML on every settings change

**Must NOT do**:
- Don't fail to start if YAML is malformed
- Don't require YAML file to exist

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6)
- **Blocks**: Task 15
- **Blocked By**: Tasks 2, 3, 4

**References**:
- `ymir-server/src/main.rs` - Server startup
- `ymir-core/src/settings/yaml.rs` - Load function

**Acceptance Criteria**:
- [ ] Server creates `.ymir/` directory
- [ ] YAML file loads if exists
- [ ] Settings applied to database

**QA Scenarios**:
```
Scenario: YAML loads on startup
Tool: Bash
Steps:
1. Create test YAML file
2. Start server
3. Query settings via WebSocket
4. Verify YAML values loaded
Expected: Settings from YAML available
Evidence: .sisyphus/evidence/task-5-yaml-load.txt
```

**Commit**: YES
- Message: `feat(server): load workspace settings from YAML on startup`
- Files: `ymir-server/src/main.rs`

---

- [ ] **6. Implement YAML File Save on Settings Change**

**What to do**:
- Update `workspace.updateSettings` handler to save to YAML after DB update
- Trigger save for all workspaces on graceful shutdown
- Ensure atomic write (write to temp file, then rename)
- Handle file write errors gracefully

**Save logic**:
```rust
// After DB update
let settings_file = WorkspaceSettingsFile {
    workspaces: load_all_workspace_settings(db).await?,
};
settings::yaml::save(yaml_path, &settings_file).await?;
```

**Must NOT do**:
- Don't block WebSocket response on file write
- Don't lose settings if file write fails

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 5)
- **Blocks**: Task 15
- **Blocked By**: Tasks 2, 3, 4

**References**:
- `ymir-core/src/handlers/workspace_settings.rs` - Update handler
- `ymir-core/src/settings/yaml.rs` - Save function

**Acceptance Criteria**:
- [ ] Settings save to YAML on change
- [ ] File is valid YAML
- [ ] Atomic write (no corruption)

**QA Scenarios**:
```
Scenario: Settings save to YAML
Tool: Bash
Steps:
1. Update settings via WebSocket
2. Verify YAML file updated
3. Verify content is valid YAML
Expected: File reflects changes
Evidence: .sisyphus/evidence/task-6-yaml-save.txt
```

**Commit**: YES
- Message: `feat(core): save workspace settings to YAML on change`
- Files: `ymir-core/src/handlers/workspace_settings.rs`

---

- [ ] **7. Add workspace.updateSettings to Protocol**

**What to do**:
- Update `ymir-core/src/protocol.rs` to include new methods:
  - `workspace.getSettings`
  - `workspace.updateSettings`
- Add to protocol router/handler dispatch
- Add TypeScript type definitions

**Protocol additions**:
```rust
pub enum WorkspaceMethod {
    // ... existing methods
    GetSettings,
    UpdateSettings,
}
```

**Must NOT do**:
- Don't break existing protocol methods
- Don't use different naming

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 4)
- **Blocks**: Task 4
- **Blocked By**: None

**References**:
- `ymir-core/src/protocol.rs`
- `websocket-core-refactor.md` - Task 10

**Acceptance Criteria**:
- [ ] Protocol methods defined
- [ ] Router dispatches to handlers
- [ ] TypeScript types created

**QA Scenarios**:
```
Scenario: Protocol accepts settings methods
Tool: Bash (wscat)
Steps:
1. Send workspace.getSettings request
2. Verify valid JSON-RPC response
3. Send workspace.updateSettings request
4. Verify success response
Expected: Both methods work
Evidence: .sisyphus/evidence/task-7-protocol.txt
```

**Commit**: YES (groups with Task 4)
- Message: `feat(core): add settings methods to WebSocket protocol`
- Files: `ymir-core/src/protocol.rs`

---

### Wave 3: React Client (Hooks + UI)

- [ ] **8. Create useWorkspaceSettings WebSocket Hook**

**What to do**:
- Create `src/hooks/useWorkspaceSettings.ts`
- Implement hook for WebSocket-based settings:
```typescript
export function useWorkspaceSettings(workspaceId: string) {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Subscribe to settings changes via WebSocket
  // Load initial settings on mount
  // Update when server pushes changes
  
  const updateSettings = async (updates: Partial<WorkspaceSettings>) => {
    // Send workspace.updateSettings via WebSocket
  };
  
  return { settings, loading, updateSettings };
}
```
- Integrate with WebSocket client service
- Handle reconnection

**Must NOT do**:
- Don't use Zustand
- Don't call Tauri invoke

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO (Wave 3 starter)
- **Blocks**: Tasks 9, 10, 13
- **Blocked By**: Task 4

**References**:
- `websocket-core-refactor.md` - Task 23
- `src/services/websocket.ts`

**Acceptance Criteria**:
- [ ] Hook loads settings via WebSocket
- [ ] Hook provides updateSettings function
- [ ] Hook subscribes to changes
- [ ] Reconnection handling works

**QA Scenarios**:
```
Scenario: Hook loads settings
Tool: Playwright
Steps:
1. Mount component with useWorkspaceSettings
2. Verify settings loaded
3. Verify updateSettings callable
Expected: Settings available
Evidence: .sisyphus/evidence/task-8-hook-load.png
```

**Commit**: YES
- Message: `feat(react): add useWorkspaceSettings WebSocket hook`
- Files: `src/hooks/useWorkspaceSettings.ts`
- Pre-commit: `npx tsc --noEmit`

---

- [ ] **9. Update WorkspaceSettingsDialog for WebSocket**

**What to do**:
- Create `src/components/WorkspaceSettingsDialog.tsx`
- Adapt from original plan but use WebSocket hooks:
  - Use `useWorkspaceSettings(workspaceId)` instead of Zustand
  - Call `updateSettings` from hook instead of store action
  - Immediate-save pattern
  - Color picker with 10 colors
  - Icon picker with Lucide icons
  - Directory browser (Tauri dialog)
- Use Base-UI Dialog components

**Props**:
```typescript
interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}
```

**Must NOT do**:
- Don't import from `src/state/workspace.ts` (being removed)
- Don't use Zustand patterns

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: [`frontend-ui-ux`]

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 10, after Task 8)
- **Blocks**: Task 14
- **Blocked By**: Task 8

**References**:
- `src/components/ui/Dialog.tsx` - Base-UI wrappers
- `websocket-core-refactor.md` - Task 25
- Original `workspace-settings.md` - Task 4

**Acceptance Criteria**:
- [ ] Dialog opens/closes
- [ ] All 5 sections render
- [ ] Settings load via WebSocket
- [ ] Changes save via WebSocket
- [ ] Color picker works
- [ ] Icon picker works

**QA Scenarios**:
```
Scenario: Dialog works with WebSocket
Tool: Playwright
Steps:
1. Open dialog
2. Change color
3. Verify WebSocket message sent
4. Verify settings updated
Expected: Full dialog workflow
Evidence: .sisyphus/evidence/task-9-dialog-ws.png
```

**Commit**: YES
- Message: `feat(ui): create WorkspaceSettingsDialog with WebSocket integration`
- Files: `src/components/WorkspaceSettingsDialog.tsx`
- Pre-commit: `npx tsc --noEmit`

---

- [ ] **10. Integrate Settings into WorkspaceSidebar**

**What to do**:
- Update `src/components/WorkspaceSidebar.tsx`:
  - Add Settings context menu item
  - Add state for settings dialog
  - Render `<WorkspaceSettingsDialog />`
- Remove old Zustand-based code
- Use WebSocket-based hooks

**Must NOT do**:
- Don't modify existing workspace actions
- Don't break existing sidebar functionality

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 9, after Task 8)
- **Blocks**: Task 11, 14
- **Blocked By**: Task 8

**References**:
- `src/components/WorkspaceSidebar.tsx`
- `websocket-core-refactor.md` - Task 25

**Acceptance Criteria**:
- [ ] Settings menu item appears
- [ ] Click opens dialog for correct workspace
- [ ] Dialog scoped to right-clicked workspace

**QA Scenarios**:
```
Scenario: Settings menu opens dialog
Tool: Playwright
Steps:
1. Right-click workspace tab
2. Click Settings
3. Verify dialog opens
4. Verify correct workspace loaded
Expected: Dialog opens correctly
Evidence: .sisyphus/evidence/task-10-menu.png
```

**Commit**: YES
- Message: `feat(ui): add Settings menu item to workspace sidebar`
- Files: `src/components/WorkspaceSidebar.tsx`

---

- [ ] **11. Add Accent Line, Icon, Subtitle Rendering**

**What to do**:
- Update `src/components/WorkspaceSidebar.tsx`:
  - Read settings from workspace (via WebSocket state)
  - Add 3px left border with workspace color
  - Add icon display before workspace name
  - Add subtitle below workspace name
- Create `src/components/WorkspaceSidebar.css` for styling
- Update both expanded and collapsed views

**CSS classes**:
```css
.workspace-accent-line { border-left: 3px solid var(--workspace-color); }
.workspace-icon { /* 20x20px icon */ }
.workspace-subtitle { /* 11px, muted, ellipsis */ }
```

**Must NOT do**:
- Don't use inline styles
- Don't show subtitle in collapsed view

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 9, 10)
- **Blocks**: Task 14
- **Blocked By**: Task 10

**References**:
- Original `workspace-settings.md` - Tasks 9, 10, 11
- `websocket-core-refactor.md` - Task 25

**Acceptance Criteria**:
- [ ] Accent line renders with color
- [ ] Icon renders before name
- [ ] Subtitle renders below name
- [ ] Collapsed view shows icon/accent

**QA Scenarios**:
```
Scenario: Visual elements render
Tool: Playwright
Steps:
1. Set workspace color, icon, subtitle
2. Verify accent line visible
3. Verify icon visible
4. Verify subtitle visible
Expected: All visual elements present
Evidence: .sisyphus/evidence/task-11-visual.png
```

**Commit**: YES
- Message: `feat(ui): add accent line, icon, subtitle to workspace tabs`
- Files: `src/components/WorkspaceSidebar.tsx`, `src/components/WorkspaceSidebar.css`
- Pre-commit: `npx tsc --noEmit`

---

### Wave 4: Verification

- [ ] **12. Add WebSocket Handler Tests**

**What to do**:
- Add Rust tests in `ymir-core/src/handlers/workspace_settings.rs`:
  - Test get_settings returns correct data
  - Test update_settings updates DB and YAML
  - Test partial updates
- Add integration test

**Test scenarios**:
- Get settings for existing workspace
- Get settings for non-existent workspace
- Update color only
- Update all fields
- Verify YAML file updated

**Must NOT do**:
- Don't mock WebSocket layer

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Blocks**: Task 15
- **Blocked By**: Task 4

**References**:
- `ymir-core/src/handlers/` - Handler test patterns

**Acceptance Criteria**:
- [ ] 5+ test cases pass
- [ ] Tests cover happy path and errors

**QA Scenarios**:
```
Scenario: Handler tests pass
Tool: Bash
Steps:
1. cd ymir-core && cargo test workspace_settings
2. Verify all tests pass
Expected: 5 tests pass
Evidence: .sisyphus/evidence/task-12-handler-tests.txt
```

**Commit**: YES
- Message: `test(core): add WebSocket handler tests for settings`
- Files: `ymir-core/src/handlers/workspace_settings.rs`
- Pre-commit: `cargo test -p ymir-core workspace_settings`

---

- [ ] **13. Add React Hook Tests**

**What to do**:
- Add tests in `src/hooks/useWorkspaceSettings.test.ts`:
  - Test hook loads settings on mount
  - Test hook calls WebSocket correctly
  - Test hook handles errors
  - Test hook updates local state
- Mock WebSocket service

**Must NOT do**:
- Don't test WebSocket service itself

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Blocks**: Task 15
- **Blocked By**: Task 8

**References**:
- `src/hooks/` - Existing hook test patterns
- Vitest documentation

**Acceptance Criteria**:
- [ ] 4+ test cases pass
- [ ] WebSocket calls mocked and verified

**QA Scenarios**:
```
Scenario: Hook tests pass
Tool: Bash
Steps:
1. bun test src/hooks/useWorkspaceSettings.test.ts
2. Verify all tests pass
Expected: 4 tests pass
Evidence: .sisyphus/evidence/task-13-hook-tests.txt
```

**Commit**: YES
- Message: `test(react): add useWorkspaceSettings hook tests`
- Files: `src/hooks/useWorkspaceSettings.test.ts`
- Pre-commit: `bun test src/hooks/useWorkspaceSettings.test.ts`

---

- [ ] **14. Add E2E Tests for Settings Dialog**

**What to do**:
- Create `src/tests/workspace-settings.e2e.test.ts`:
  - Test dialog opens from context menu
  - Test color selection updates accent line
  - Test icon selection displays icon
  - Test subtitle input shows subtitle
  - Test settings persist after reload (YAML verification)
- Use Playwright

**Must NOT do**:
- Don't test directory picker

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`playwright`]

**Parallelization**:
- **Can Run In Parallel**: YES
- **Blocks**: Task 15
- **Blocked By**: Tasks 9, 10, 11

**References**:
- `playwright.config.ts`
- Original `workspace-settings.md` - Task 14

**Acceptance Criteria**:
- [ ] 6+ E2E test scenarios
- [ ] All tests pass in CI
- [ ] Screenshots captured

**QA Scenarios**:
```
Scenario: Full E2E test suite
Tool: Bash
Steps:
1. npx playwright test workspace-settings
2. Verify all tests pass
Expected: 6+ tests pass
Evidence: .sisyphus/evidence/task-14-e2e-results.txt
```

**Commit**: YES
- Message: `test(e2e): add Playwright tests for workspace settings`
- Files: `src/tests/workspace-settings.e2e.test.ts`
- Pre-commit: `npx playwright test`

---

- [ ] **15. Final QA Pass**

**What to do**:
- Run full verification:
  1. `cargo check --workspace` - No Rust errors
  2. `cargo test -p ymir-core` - All Rust tests pass
  3. `npx tsc --noEmit` - No TypeScript errors
  4. `bun test` - All unit tests pass
  5. `npx playwright test` - All E2E tests pass
- Manual verification:
  - Start server
  - Create workspace
  - Open settings dialog
  - Change color, icon, subtitle
  - Verify YAML file updated
  - Restart server
  - Verify settings loaded from YAML
- Check for AI slop patterns

**Must NOT do**:
- Don't skip any verification step
- Don't make changes during QA (only verify)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`playwright`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocks**: None (final)
- **Blocked By**: Tasks 5, 6, 12, 13, 14

**References**:
- All previous tasks

**Acceptance Criteria**:
- [ ] All builds pass
- [ ] All tests pass
- [ ] YAML persistence verified
- [ ] WebSocket communication verified
- [ ] No AI slop patterns

**QA Scenarios**:
```
Scenario: Full verification
Tool: Bash + Playwright
Steps:
1. Run all builds
2. Run all tests
3. Manual verification of YAML persistence
Expected: All checks pass
Evidence: .sisyphus/evidence/task-15-final-qa.txt
```

**Commit**: NO (verification only)

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** - `oracle`
Verify all Must Have implemented, no Must NOT Have present.
Output: `Must Have [8/8] | Must NOT Have [0 violations] | VERDICT`

- [ ] F2. **Code Quality Review** - `unspecified-high`
Run `cargo check/test` + `tsc --noEmit` + `bun test` + linter.
Output: `Build [PASS/FAIL] | Tests [N pass] | VERDICT`

- [ ] F3. **Real Manual QA** - `playwright`
Execute all QA scenarios, test cross-task integration.
Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** - `deep`
Verify no scope creep, all tasks implemented as specified.
Output: `Tasks [N/N compliant] | Contamination [CLEAN] | VERDICT`

---

## Integration with WebSocket Refactor

### Prerequisites from WebSocket Plan
Before this plan can execute, the following must be complete:
- Task 1-4: ✅ Cargo workspace, types, schema, migrations
- Task 9-10: ✅ WebSocket server, protocol
- Task 11-12: ✅ Workspace/pane handlers
- Task 21: ⏳ WebSocket client service (React) - **Target for Wave 3**

### Dependency Graph
```
WebSocket Plan (Tasks 1-20) ─┬─> This Plan Task 1-7 (Rust)
                              │
                              ├─> This Plan Task 8-15 (React)
                              │   (requires Task 21 from WebSocket plan)
                              │
                              └─> Final verification
```

### Execution Order
1. Complete WebSocket plan Tasks 1-20 (mostly done)
2. Complete WebSocket plan Task 21 (WebSocket client service)
3. Execute this plan (Tasks 1-15)
4. Complete WebSocket plan Tasks 22-31

---

## Commit Strategy

- **1-3**: `feat(core): add workspace settings foundation (types, schema, YAML)`
- **4-7**: `feat(core): add settings WebSocket handlers and YAML storage`
- **8**: `feat(react): add useWorkspaceSettings WebSocket hook`
- **9**: `feat(ui): create WorkspaceSettingsDialog with WebSocket`
- **10**: `feat(ui): integrate settings into workspace sidebar`
- **11**: `feat(ui): add accent line, icon, subtitle to workspace tabs`
- **12-13**: `test: add handler and hook tests`
- **14**: `test(e2e): add Playwright tests for workspace settings`

---

## Success Criteria

### Verification Commands
```bash
# Rust
cd ymir-core && cargo test

# TypeScript
npx tsc --noEmit
bun test

# E2E
npx playwright test workspace-settings

# Manual
cat .ymir/workspace-settings.yaml  # Verify file exists and is valid YAML
```

### Final Checklist
- [ ] Workspace type has settings fields (Rust + TypeScript)
- [ ] Database schema has settings columns
- [ ] YAML file storage works (load on startup, save on change)
- [ ] WebSocket handlers for settings CRUD
- [ ] React hook for settings subscription
- [ ] Settings dialog opens from context menu
- [ ] Color picker with 10 preset colors
- [ ] Icon picker with Lucide icons
- [ ] Directory picker (Tauri mode)
- [ ] Workspace tab shows 3px left border with selected color
- [ ] Workspace tab shows icon when set
- [ ] Subtitle appears below name, hidden when empty
- [ ] Settings persist across server restarts
- [ ] All tests pass (Rust + TypeScript + E2E)
