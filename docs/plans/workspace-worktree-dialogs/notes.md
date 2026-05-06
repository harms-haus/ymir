# Orchestrator Notes: Workspace Worktree Dialogs and Settings

## Decisions

- **2026-05-05**: Starting RPIR workflow. 3 main feature areas: create worktree dialog, workspace settings persistence with agent field, worktree settings dialog with DB persistence.

## User Feedback

- (none yet)

## Implementation Log

- Phase 0: PROMPT.md written
- Phase 1: Research completed (6 subagent research files + consolidated findings.md)
- Phase 2: Planner completed — outline.md and runes/runes.md created

## Key decisions during planning

- DB migrations appended to existing SCHEMA_MIGRATIONS array (no separate migration files)
- WorkspaceUpdate handler is the critical missing piece — currently returns not_implemented
- CreateWorktreeDialog already exists but needs color/icon fields and auto-population
- Agent options: hermes, claude, opencode, pi, none (defined in CreateWorktreeDialog)
- WorktreeUpdate is entirely new — no protocol type, no handler, no DB method
- 15 runes total across 6 phases (DB → Protocol → Handlers → TS Types → Components → Test)
