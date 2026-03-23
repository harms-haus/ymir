# Draft: Agent and Terminal Pool Strategy

## Requirements (confirmed)
- "For agents, we need to keep track of the session ID (from ACP: https://agentclientprotocol.com/protocol/session-list; https://agentclientprotocol.com/protocol/session-setup) of the agent. This way, we can load up the correct session when attempting to run the agent again."
- "For agents, we should have a separate pool for each type (currently: claude, opencode, pi)."
- "For agents, we need to keep track of the mode and model"
- "For terminals, we need to keep track of the CWD & path for each. That way, when we get back to using the terminal, it can be set up properly before we use it again."
- "For both agents and terminals: While the agent/terminal is running, that terminal CANNOT be freed. If there are no available terminals/agents, one can be spawned."
- "For both agents and terminals: There should be a timeout after running ends where the terminal/agent can be freed (if there are no free agents/terminals in the pool and one is needed), but isn't freed automatically (grace period): maybe 30s for terminals, 300s for agents."
- "After a longer timeout, freed agent/terminal processes can be terminated."
- "The UI should NOT reflect the pooling (make the UI look like there are many connected instances even if they've been freed back to the pool)."
- "When an agent is requested: The pool offers freed agents (running processes) in order of most-recently-used first. If none are available, then it tries to free an unfreed, but idle agent in order of least-recently-used. If none are available, then a new agent is spawned. The agent is given a session ID to load into context."
- "When a terminal is requested: The pool offers freed ptys (running processes) in order of most-recently-used first. If none are available, then it tries to free an unfreed, but idle pty in order of least-recently-used first. If none are available, then a new pty is spawned. The pty is loaded with the cwd and path of the terminal tab."
- "What else needs to be tracked so that we don't have an inconsistent agent/terminal? Is the grace period a good idea? Should we have a timeout to close the terminal/agent? How long for the terminate timeout?"

## Technical Decisions
- Intent tier: Architecture; requires repo and protocol research before plan generation.
- Planning target: single decision-complete plan covering data model, lifecycle rules, UI/runtime abstraction, and timeout policy.

## Research Findings
- Repo contains current agent and terminal protocol/state/runtime code in `crates/ws-server/src/agent/`, `crates/ws-server/src/pty/`, `crates/ws-server/src/router.rs`, `crates/ws-server/src/state.rs`, and `apps/web/src/store.ts`.
- Existing repo artifacts mention persisted `acp_session_id`, agent sessions, terminal sessions, and lazy loading from DB.
- ACP docs and broader pooling guidance are being researched via background librarian agents.

## Open Questions
- Should pooling be global, per worktree, or hybrid with worktree affinity and fallback reuse?
- How much environment state beyond cwd/path must be restored for terminals and agents?
- Should terminated resources be removed from persisted session metadata immediately or marked stale for recovery?

## Scope Boundaries
- INCLUDE: agent pool policy, terminal/PTy pool policy, required tracked metadata, reuse/free/terminate lifecycle, timeout recommendations, UI/runtime decoupling.
- EXCLUDE: implementation code changes, UI redesign, unrelated agent protocol features.
