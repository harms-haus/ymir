# Research: lsp-integration Plugin — Current State

## Source Files
- `~/.hermes/plugins/lsp-integration/plugin.yaml` — Plugin manifest
- `~/.hermes/plugins/lsp-integration/__init__.py` — Entry point, hook handler, tool registration
- `~/.hermes/plugins/lsp-integration/lsp_manager.py` — Core LSP server management
- `~/.hermes/plugins/lsp-integration/diagnostics.py` — Diagnostic formatting
- `~/.hermes/plugins/lsp-integration/config.py` — Configuration (30 languages)
- `~/.hermes/plugins/lsp-integration/README.md` — Documentation

## Plugin Manifest (plugin.yaml)
```yaml
name: lsp-integration
version: "1.1.0"
description: Auto LSP diagnostics for patch/write_file operations, plus on-demand
  lsp_diagnostics tool with force-refresh support. Supports 30 languages.
hooks:
  - transform_tool_result
requires_env: []
```

Note: Only ONE tool registered (`lsp_diagnostics`) and ONE hook (`transform_tool_result`). No navigation tools currently exist.

## Server Lifecycle (lsp_manager.py) — EPHEMERAL model

The current implementation uses an **ephemeral/spawn-per-request** model:

### get_diagnostics(file_path, lang_config)
Every call follows this sequence:
1. **Check/install binary** — `is_binary_available()` checks PATH, lazy installs via `install_server()` if missing
2. **Resolve workspace root** — `resolve_workspace_root()` walks up from file looking for project markers (package.json, Cargo.toml, .git, etc.)
3. **Build server command** — `_build_server_command()` uses `server_args` from config, falls back to `[binary, "--stdio"]`
4. **Read file content** — `Path(file_path).read_text()`
5. **Spawn subprocess** — `subprocess.Popen(cmd, stdin=PIPE, stdout=PIPE, stderr=PIPE, cwd=workspace_root)`
6. **Run LSP session** — `_run_lsp_session()`:
   a. Send `initialize` request (with `rootUri`, minimal `capabilities`)
   b. Wait 5s for response via `_read_messages_threaded()`
   c. Send `initialized` notification
   d. Send `textDocument/didOpen` notification (with file content)
   e. Read messages for `timeout` seconds, looking for `textDocument/publishDiagnostics`
   f. Extract diagnostics matching the file URI
7. **Shutdown** — Send `shutdown` request + `exit` notification, close stdin, terminate process, wait 3s then kill

### Key observations about the current lifecycle:
- **No persistent server** — every diagnostic call spawns and kills a fresh process
- **No threading model for persistent servers** — `_read_messages_threaded()` uses a daemon thread for a single read session
- **No connection pooling** — no concept of "server session" that survives across calls
- **No idle tracking** — servers don't exist long enough to need idle tracking
- **Process lifecycle**: spawn → initialize → open doc → collect → shutdown → terminate
- **Message protocol**: raw JSON-RPC over stdin/stdout with Content-Length headers
- **Timeout per language**: configured in config.py (default 15s)
- **Session cache**: `_installed_binaries` set tracks installed binaries, cleared by `clear_session_cache()`

## JSON-RPC Message Handling

### Message format (LSP standard)
```
Content-Length: <N>\r\n\r\n<JSON body>
```

### _send_message(proc, msg)
- Serializes dict to JSON
- Prepends `Content-Length: <len>\r\n\r\n` header
- Writes to `proc.stdin` and flushes

### _read_messages_threaded(proc, timeout)
- Spawns a daemon thread that reads `proc.stdout` byte-by-byte
- Parses Content-Length headers, reads exact body length
- JSON-decodes each message, puts into a `queue.Queue`
- Main thread polls queue with 0.2s timeout until deadline
- Returns list of all parsed message dicts
- **Limitation**: byte-by-byte read is inefficient; header parsing is basic (only Content-Length)

### Request/Response pattern
```python
# Request
{"jsonrpc": "2.0", "id": <int>, "method": "<method>", "params": {...}}

# Notification (no id, no response expected)
{"jsonrpc": "2.0", "method": "<method>", "params": {...}}

# Response (from server)
{"jsonrpc": "2.0", "id": <int>, "result": ...}  # or "error": ...
```

Currently, responses to `initialize` are collected but not inspected — only `textDocument/publishDiagnostics` notifications are used.

## Registered Hook: transform_tool_result

Function: `_on_transform_tool_result(tool_name, args, result, **kwargs)`

- Only fires for `patch` and `write_file` tool calls
- Checks `config.is_enabled()` master toggle
- Extracts `path` from args, resolves language from extension
- Calls `_get_diagnostics_for_file(path)` → `lsp_manager.get_diagnostics()` → `diagnostics.format_diagnostics()`
- Appends markdown diagnostics table to the tool result
- **All exceptions caught** — never breaks file edits

## Registered Tool: lsp_diagnostics

- **Name**: `lsp_diagnostics`
- **Parameters**: `filename` (required, str), `force_refresh` (optional, bool, default False)
- **Handler**: `_lsp_diagnostics_handler(**kwargs)`
- **Check fn**: `lambda: True` (always available)
- **Behavior**:
  1. Validates filename exists
  2. Checks `config.is_enabled()`
  3. If `force_refresh=True`, calls `lsp_manager.clear_session_cache()`
  4. Calls `_get_diagnostics_for_file(filename)` which spawns ephemeral LSP session
  5. Returns JSON with `{success, file, diagnostics}` or `{success, error}`

## Configuration (config.py)

### Default config structure
```python
DEFAULT_CONFIG = {
    "enabled": True,
    "timeout": 15,
    "languages": {
        "python": {
            "extensions": [".py"],
            "server": "pyright",
            "binary": "pyright-langserver",
            "install_command": "pip install pyright",
            "check_command": ["pyright-langserver", "--version"],
            "server_args": ["--stdio"],
            "language_id": "python",
        },
        # ... 29 more languages
    }
}
```

### 30 supported languages
Python, JavaScript, TypeScript, Rust, C, C++, Go, Java, Kotlin, Scala, C#, F#, HTML, CSS, Haskell, Elixir, Erlang, Ruby, PHP, Lua, Bash, JSON, YAML, TOML, Dockerfile, SQL, Zig, R, PowerShell, Perl, Swift, Markdown

### Config loading
- Reads `~/.hermes/config.yaml`, extracts `lsp_integration` section
- Deep merges user config over defaults
- Module-level cache (`_cached_config`) with `reload_config()` to invalidate

## Diagnostic Formatting (diagnostics.py)

- Maps severity integers to labels: 1=Error, 2=Warning, 3=Info, 4=Hint
- Maps labels to emojis: Error=🔴, Warning=🟡, Info=🔵, Hint=⚪
- Formats as markdown table: `| Severity | Line | Message |`
- Handles both dict and lsprotocol.types.Diagnostic objects
- Truncates messages > 200 chars
- Escapes pipe characters for markdown safety

## Summary: What Needs to Change for Persistent Server Management

Current model: **ephemeral** (spawn → diagnostics → kill per call)
Target model: **persistent** (spawn on first use, keep alive, idle cleanup after 600s)

Required architectural changes:
1. Introduce a `ServerSession` class per workspace/language that holds:
   - `subprocess.Popen` instance
   - `threading.Lock` for thread-safe access
   - `last_access_time` (monotonic timestamp)
   - Background reader thread for notifications
   - Message ID counter
   - Request/response matching (correlate `id` in responses to pending requests)
2. Introduce a `ServerPool` / registry mapping `(workspace_root, language)` → `ServerSession`
3. Add idle cleanup loop: periodic check (e.g., every 60s), kill sessions idle > 600s
4. Add plugin unload hook: cleanup all sessions
5. Modify `get_diagnostics` to use persistent session instead of ephemeral spawn
6. Add new navigation methods (`goto_definition`, `find_references`) using same persistent session
7. Ensure server readiness: first tool call triggers spawn+init, subsequent calls reuse
