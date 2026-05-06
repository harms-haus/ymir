# Implementation Summary: Replace Mantic with LSP Navigation Tools

## What Was Done

### Phase 1: Removed Mantic from code-search Plugin
- **plugin.yaml**: Removed `code_search`, `code_references`, `code_goto` from `provides_tools`. Only `code_grep` and `code_scan` remain.
- **__init__.py**: Removed `_check_mantic()`, `tools.MANTIC` binary resolution, and 3 tool registrations.
- **tools.py**: Removed `MANTIC` constant, `code_search()`, `code_references()`, `code_goto()` functions. Reduced from 485 to 309 lines.
- **schemas.py**: Removed `CODE_SEARCH_SCHEMA`, `CODE_GOTO_SCHEMA`, `CODE_REFERENCES_SCHEMA`, `_FILE_TYPE`. Updated descriptions to reference new LSP tools. Reduced from 501 to 324 lines.

### Phase 2: Persistent LSP Server Management
- **lsp_manager.py**: Added `ServerSession` class (subprocess management, reader thread, request/response matching via `threading.Event`, document tracking). Added `ServerPool` registry with `_server_pool` dict keyed by `(workspace_root, language_id)`. Added `get_or_create_session()`, `cleanup_idle_sessions()`, `start_idle_cleanup_daemon()`, `cleanup_all_sessions()`, `close_document()`. Modified `get_diagnostics()` to use persistent sessions instead of ephemeral spawn-per-request. Removed legacy `_run_lsp_session()` and `_read_messages_threaded()` functions.
- **config.py**: Added `idle_timeout` (600s), `cleanup_interval` (60s), `request_timeout` (30s), `indexing_delay` (2.0s global). Added per-language overrides: python=5.0, typescript=5.0, rust=8.0, go=5.0. Added getter functions.
- **__init__.py**: Added `atexit.register(cleanup_all_sessions)`, `start_idle_cleanup_daemon()` at register time.

### Phase 3: LSP Navigation Tools
- **lsp_manager.py**: Added `_parse_location()` helper, `goto_definition()`, `find_references()` functions.
- **__init__.py**: Registered `lsp_goto_definition` (🎯) and `lsp_find_references` (🔗) tools with parameter schemas.
- **plugin.yaml**: Bumped version to 1.2.0, updated description.
- **README.md**: Documented new tools, persistent server behavior, workflow differences.

### Phase 4: Testing & Review
- All syntax checks pass for all modified .py files.
- Module imports verified for both plugins.
- `goto_definition` tested with pyright: correctly resolves `greet` call to definition on line 1.
- `find_references` tested with pyright: finds 2 references (definition + call).
- Persistent server verified: same session reused across calls, not killed between them.

## Review Findings Fixed

**5 Warnings fixed:**
1. TOCTOU race in `get_or_create_session` - added double-check under lock after creation
2. `_doc_versions` dict reassignment - changed to proper dict update
3. `_doc_versions` not initialized in `__init__` - added to constructor
4. `close_document` missing `didClose` notification - added notification + version cleanup
5. `send_request` lock not covering `_send_message` - extended lock scope

**4 Info issues fixed:**
6. README architecture section updated to reflect persistent server model
7. `close_document` now properly sends `didClose` (was dead code, now wired)
8. `idle_seconds` edge case noted (returns 0 for never-touched sessions)
9. Removed dead legacy functions `_run_lsp_session` and `_read_messages_threaded`

## Bifrost Saga

Saga: `bf-55ab` - "Replace Mantic with LSP Navigation Tools"
Branch: `feat/replace-mantic-with-lsp-nav`
Status: Sealed
Epics: 4 fulfilled, 13 runes fulfilled

## Files Modified

| File | Lines Before | Lines After | Change |
|------|-------------|-------------|--------|
| code-search/plugin.yaml | 10 | 9 | Removed 3 tools |
| code-search/__init__.py | 134 | 103 | -31 lines |
| code-search/tools.py | 485 | 309 | -176 lines |
| code-search/schemas.py | 501 | 324 | -177 lines |
| lsp-integration/plugin.yaml | 8 | 8 | Version bump |
| lsp-integration/__init__.py | 204 | 461 | +257 lines |
| lsp-integration/lsp_manager.py | 400 | ~1100 | +700 lines (Session class + pool + nav) |
| lsp-integration/config.py | 429 | ~480 | +51 lines |
| lsp-integration/README.md | 9431 | ~14469 | +5000 chars |
