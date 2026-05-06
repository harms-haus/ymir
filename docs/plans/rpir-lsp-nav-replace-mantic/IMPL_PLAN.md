# Implementation Plan: Replace Mantic Code Search with LSP Navigation Tools

## Overview

This plan removes the `mantic` binary and its three tools (`code_search`, `code_goto`, `code_references`) from the `code-search` plugin, and adds two new LSP-based navigation tools (`lsp_goto_definition`, `lsp_find_references`) plus persistent server management to the `lsp-integration` plugin.

---

## Phase 1: Remove Mantic from code-search Plugin

### 1.1 Edit `~/.hermes/plugins/code-search/plugin.yaml`

**Changes:**
- Remove `code_search`, `code_references`, `code_goto` from `provides_tools` list
- Update `description` to remove "semantic code navigation (Mantic)" references
- Result should only list `code_grep` and `code_scan`

### 1.2 Edit `~/.hermes/plugins/code-search/__init__.py`

**Changes:**
- Remove `_check_mantic()` function
- Remove `tools.MANTIC` from `_resolve_binaries()` call
- Remove three `ctx.register_tool()` calls for `code_search`, `code_references`, `code_goto`
- Keep `_check_ast_grep()`, `tools.AST_GREP`, and the two ast-grep tool registrations

### 1.3 Edit `~/.hermes/plugins/code-search/tools.py`

**Changes:**
- Remove `MANTIC` constant (line ~12)
- Remove `code_search()` function (lines ~316-403)
- Remove `code_references()` function (lines ~406-445)
- Remove `code_goto()` function (lines ~448-485)
- Keep `AST_GREP` constant, `code_grep()`, `code_scan()`

### 1.4 Edit `~/.hermes/plugins/code-search/schemas.py`

**Changes:**
- Remove `CODE_SEARCH_SCHEMA` (lines ~331-409)
- Remove `_FILE_TYPE` enum (only used by CODE_SEARCH_SCHEMA)
- Remove `CODE_GOTO_SCHEMA` (lines ~415-455)
- Remove `CODE_REFERENCES_SCHEMA` (lines ~461-501)
- Update `CODE_GREP_SCHEMA` description: remove cross-references to `code_search`, `code_references`, `code_goto`. Replace with reference to `lsp_goto_definition`/`lsp_find_references` in lsp-integration plugin and recommend `code_grep` as fallback for symbol searches.
- Update `CODE_SCAN_SCHEMA` description: same cleanup of removed tool references

---

## Phase 2: Persistent LSP Server Management

### 2.1 Edit `~/.hermes/plugins/lsp-integration/lsp_manager.py` — Major Rewrite

**Add new class `ServerSession`:**
- `__init__(binary, cmd, workspace_root, lang_config)`: store config, init state vars
- `start()`: spawn subprocess, send `initialize` + `initialized`, start reader thread
- `stop()`: send `shutdown` + `exit`, terminate process, join threads
- `send_request(method, params, timeout)`: JSON-RPC request with ID matching, wait for response via threading.Event
- `send_notification(method, params)`: fire-and-forget JSON-RPC notification
- `on_notification(method, callback)`: register notification callback
- `touch()`: update `last_access` timestamp
- `is_alive` property: check subprocess status
- `idle_seconds` property: time since last access
- `_reader_loop()`: background thread — read stdout, parse Content-Length headers, JSON decode, dispatch responses/notifications
- `_stderr_loop()`: background thread — read stderr, log at DEBUG level

**Add module-level registry:**
- `_server_pool: dict[tuple[str, str], ServerSession]` — key is `(workspace_root_str, language_id)`
- `_pool_lock: threading.Lock()`
- `get_or_create_session(workspace_root, lang_config)`: lookup or create+start session
- `cleanup_idle_sessions(max_idle)`: kill sessions idle > max_idle seconds
- `_idle_cleanup_loop(check_interval, max_idle)`: daemon thread, runs periodically
- `cleanup_all_sessions()`: stop cleanup thread, kill all sessions, clear pool

**Modify `get_diagnostics(file_path, lang_config)`:**
- Replace ephemeral spawn-per-request with persistent session flow:
  1. Check/install binary (existing logic, keep)
  2. Resolve workspace root (existing logic, keep)
  3. Read file content (existing logic, keep)
  4. Call `get_or_create_session()` instead of spawning fresh Popen
  5. Send `textDocument/didOpen` notification (or `textDocument/didChange` if already open)
  6. Register callback for `textDocument/publishDiagnostics`
  7. Wait for diagnostics with timeout
  8. Return formatted diagnostics
  9. Do NOT kill the server — leave it alive for reuse

**Add new functions:**
- `goto_definition(file_path, line, character, lang_config)`: send `textDocument/definition`, parse Location/LocationLink response, return human-readable result
- `find_references(file_path, line, character, include_declaration, lang_config)`: send `textDocument/references`, parse Location[] response, return human-readable result
- `ensure_server_ready(workspace_root, lang_config)`: binary check/install + session creation

### 2.2 Edit `~/.hermes/plugins/lsp-integration/config.py`

**Add new config keys to `DEFAULT_CONFIG`:**
- `idle_timeout: 600` (seconds)
- `cleanup_interval: 60` (seconds)
- `request_timeout: 30` (seconds, default for LSP requests)
- `indexing_delay: 2.0` (seconds, global default)
- Per-language `indexing_delay` override (e.g., python/pyright might need 5s)

### 2.3 Edit `~/.hermes/plugins/lsp-integration/__init__.py`

**Changes:**
- Register idle cleanup daemon thread at plugin register time
- Register `atexit` handler to call `cleanup_all_sessions()`
- Keep existing `lsp_diagnostics` tool registration
- Add `lsp_goto_definition` tool registration (Phase 3)
- Add `lsp_find_references` tool registration (Phase 3)
- Keep existing `transform_tool_result` hook

---

## Phase 3: LSP Navigation Tools

### 3.1 Register Tools in `__init__.py`

**`lsp_goto_definition`:**
- **Parameters:**
  - `filename` (required, str): path to file
  - `line` (required, int): 1-indexed line number
  - `character` (required, int): 0-indexed character position
  - `force_refresh` (optional, bool, default False): force reinitialize server
- **Handler:** calls `lsp_manager.goto_definition()`
- **Check fn:** `lambda: True`

**`lsp_find_references`:**
- **Parameters:**
  - `filename` (required, str): path to file
  - `line` (required, int): 1-indexed line number
  - `character` (required, int): 0-indexed character position
  - `include_declaration` (optional, bool, default True): include declaration in results
  - `force_refresh` (optional, bool, default False): force reinitialize server
- **Handler:** calls `lsp_manager.find_references()`
- **Check fn:** `lambda: True`

### 3.2 Update `plugin.yaml`

**Changes:**
- Bump version to `1.2.0`
- Update description to mention navigation tools
- No `provides_tools` list exists currently (tools registered programmatically) — if one is added, include `lsp_diagnostics`, `lsp_goto_definition`, `lsp_find_references`

### 3.3 Update `README.md`

**Changes:**
- Document the two new tools with parameter descriptions
- Document persistent server management behavior (idle timeout, cleanup)
- Note that navigation tools require LSP server to be running

---

## Phase 4: Testing & Validation

### 4.1 Verification Checklist

**code-search plugin:**
- [ ] `plugin.yaml` lists only `code_grep` and `code_scan`
- [ ] `python -c "import importlib; importlib.import_module('...')"` — no import errors
- [ ] No references to `mantic`, `code_search`, `code_goto`, `code_references` remain
- [ ] `code_grep` and `code_scan` still work (manual test or CLI invocation)

**lsp-integration plugin:**
- [ ] `lsp_diagnostics` still works (regression test)
- [ ] `transform_tool_result` hook still fires on patch/write_file
- [ ] `lsp_goto_definition` returns correct definition locations for Python files (pyright)
- [ ] `lsp_find_references` returns correct reference locations
- [ ] Server persists across multiple tool calls (check process list)
- [ ] Server cleans up after 600s idle (or test with reduced timeout)
- [ ] Server cleans up on plugin unload / Python exit

### 4.2 Edge Cases to Handle

- **Server not supporting definition/references:** Return clear error message explaining the server doesn't support that capability
- **Server not yet indexed:** Handle empty/null results gracefully, suggest retry after indexing delay
- **Binary not installed:** Auto-install (existing lazy-install behavior), fail with clear message if install fails
- **Multiple workspaces:** Separate sessions per `(workspace_root, language_id)` key
- **Concurrent requests:** Thread-safe session access via locks
- **Server crash during use:** Detect dead process, recreate session on next request

---

## File Change Summary

| File | Plugin | Action |
|------|--------|--------|
| `~/.hermes/plugins/code-search/plugin.yaml` | code-search | Remove 3 tools from provides_tools, update description |
| `~/.hermes/plugins/code-search/__init__.py` | code-search | Remove mantic check, binary resolution, 3 tool registrations |
| `~/.hermes/plugins/code-search/tools.py` | code-search | Remove MANTIC constant, 3 tool handler functions |
| `~/.hermes/plugins/code-search/schemas.py` | code-search | Remove 3 schemas, _FILE_TYPE enum, update descriptions |
| `~/.hermes/plugins/lsp-integration/lsp_manager.py` | lsp-integration | Add ServerSession class, ServerPool registry, idle cleanup, goto_definition, find_references |
| `~/.hermes/plugins/lsp-integration/config.py` | lsp-integration | Add idle_timeout, cleanup_interval, request_timeout, indexing_delay |
| `~/.hermes/plugins/lsp-integration/__init__.py` | lsp-integration | Register 2 new tools, idle cleanup daemon, atexit handler |
| `~/.hermes/plugins/lsp-integration/plugin.yaml` | lsp-integration | Bump version, update description |
| `~/.hermes/plugins/lsp-integration/README.md` | lsp-integration | Document new tools and persistent server behavior |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `code_search` capability gap (no natural language replacement) | Certain | Medium | Document in README; `code_grep` with AST patterns is partial substitute |
| LSP navigation workflow differs (file+position vs symbol name) | High | Medium | Agent must first locate symbol position via `code_grep` then navigate |
| Server indexing delay causes empty results | Medium | Low | Add `indexing_delay` config, handle null results gracefully |
| Threading bugs in persistent session | Low | High | Use locks for shared state, test concurrent requests |
| Resource leak if cleanup fails | Low | Medium | atexit handler + periodic cleanup daemon as defense in depth |
| `lsp_diagnostics` regression | Low | High | Regression test before deploying |

---

## Dependencies & Order

Phases must be executed in order:
1. **Phase 1** (mantic removal) — standalone, no dependencies on Phase 2/3
2. **Phase 2** (persistent server) — prerequisite for Phase 3
3. **Phase 3** (navigation tools) — depends on Phase 2 being complete
4. **Phase 4** (testing) — after all phases complete

Phase 1 and Phase 2 can technically be done in either order since they touch different plugins, but Phase 3 depends on Phase 2.
