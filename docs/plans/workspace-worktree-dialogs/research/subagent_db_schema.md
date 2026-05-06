# Subagent: DB Schema Research

Investigate the database schema for workspaces and worktrees in /root/ymir.

## What to find:

1. **DB module**: Look in `crates/ws-server/src/db/` - find all DB schema definitions, migrations, table structures
2. **Workspace table**: What fields does the workspace table have? (name, cwd, color, icon, agent, etc.)
3. **Worktree table**: What fields does the worktree table have? (name, branch, color, icon, agent, workspace_id, etc.)
4. **Settings table**: Is there a separate settings table? How are settings stored?
5. **SQL files**: Search for .sql files, migration files, schema definitions
6. **DB initialization**: How is the DB initialized? What ORM or query builder is used?
7. **Model structs**: Find the Rust structs that represent workspace and worktree records

Search thoroughly in:
- crates/ws-server/src/db/
- Any .sql files in the repo
- crates/ws-server/src/state.rs
- crates/ws-server/src/workspace/mod.rs
- crates/ws-server/src/worktree/mod.rs

Report ALL fields with their types for workspace and worktree tables. Note any missing fields (like 'agent') that need to be added.
