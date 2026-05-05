# Orchestrator Notes: Workspace Sidebar Context Menu

## Decisions

- **2026-05-05**: Approved outline from Planner. 5 phases, 15 tasks.
- **Key decisions**:
  1. ConfirmDialog: generic reusable component using @base-ui/react/dialog
  2. Dialog mounting: AppShell.tsx (central layout)
  3. Change Branch: full implementation including backend changes
  4. In-place rename: FileTree.tsx renamingId state
  5. Branch picker: @base-ui/react/combobox with local + remote branches

## User Feedback

- (none yet)

## Saga ID

**bf-cdd0** — Workspace Sidebar Context Menu Improvements
Branch: `feat/workspace-sidebar-context-menu`
Forged: 2026-05-05

### Runes (15 total)

| Rune | Title | Dependencies |
|------|-------|-------------|
| bf-cdd0.1.1 | Create ConfirmDialog Component | none |
| bf-cdd0.1.2 | Wire Up Remove Workspace Action | bf-cdd0.1.1 |
| bf-cdd0.1.3 | Wire Up Delete Worktree Action | bf-cdd0.1.1 |
| bf-cdd0.2.1 | Mount WorkspaceSettingsDialog in AppShell | none |
| bf-cdd0.2.2 | Wire Up Settings Context Menu Action | bf-cdd0.2.1 |
| bf-cdd0.2.3 | Mount ChangeBranchDialog in AppShell | none |
| bf-cdd0.2.4 | Wire Up Change Branch Context Menu Action | bf-cdd0.2.3 |
| bf-cdd0.3.1 | Add Renaming State to FileTree | none |
| bf-cdd0.3.2 | Wire Up In-Place Rename Interaction | bf-cdd0.3.1 |
| bf-cdd0.4.1 | Add list_branches Backend Endpoint | none |
| bf-cdd0.4.2 | Enhance change_branch Backend Function | bf-cdd0.4.1 |
| bf-cdd0.4.3 | Add list_branches Frontend API | bf-cdd0.4.1 |
| bf-cdd0.4.4 | Enhance ChangeBranchDialog with Combobox | bf-cdd0.4.3 |
| bf-cdd0.5.1 | Remove All Legacy Alert/Prompt Calls | bf-cdd0.1.2, bf-cdd0.1.3, bf-cdd0.2.2, bf-cdd0.2.4, bf-cdd0.3.2 |
| bf-cdd0.5.2 | Verify Delete vs Remove Semantics | bf-cdd0.1.2, bf-cdd0.2.2 |

### Pre-existing Components

- **ConfirmDialog** already exists at `apps/web/src/components/dialogs/ConfirmDialog.tsx` (145 lines)
- **FileTree renamingId** already implemented at `apps/web/src/components/ui/FileTree.tsx` (lines 28-30, 60-92, 148-172)
- **Backend list_branches** already exists at `crates/ws-server/src/git/mod.rs` (lines 377-448)
- **Protocol types** already defined at `crates/ws-server/src/protocol/git.rs` (GitListBranches, BranchInfo, GitListBranchesResult)

## Implementation Log

- Phase 0: PROMPT.md written
- Phase 1: Research complete (4 artifacts)
- Phase 2: Outline approved, proceeding to Bifrost planning
- Phase 3: Saga bf-cdd0 forged with 15 runes, all dependencies set, all descriptions updated
