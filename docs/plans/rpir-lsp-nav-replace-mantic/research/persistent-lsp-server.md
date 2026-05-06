# Research: Persistent LSP Server Management in Python

## Problem Statement

The current lsp-integration plugin uses an **ephemeral model**: every diagnostic request spawns a new LSP server process, initializes it, opens the document, collects diagnostics, then kills it. This is wasteful for navigation tools that may need multiple rapid requests.

The target **persistent model**:
- Spawn LSP server on first use (lazy init)
- Keep the server alive across multiple requests
- Track last-access time per server
- Automatically shut down after 600s of inactivity (configurable)
- Clean up all servers on plugin unload

## Architecture: ServerSession Class

A `ServerSession` manages one LSP server subprocess:

```python
class ServerSession:
    """Manages a single persistent LSP server subprocess."""

    def __init__(self, binary: str, cmd: list[str], workspace_root: Path,
                 lang_config: dict):
        self.binary = binary
        self.cmd = cmd
        self.workspace_root = workspace_root
        self.lang_config = lang_config
        self.proc: subprocess.Popen | None = None
        self.last_access: float = 0.0
        self._msg_id: int = 0
        self._lock = threading.Lock()
        self._response_events: dict[int, threading.Event] = {}
        self._responses: dict[int, dict] = {}
        self._notification_callbacks: dict[str, list[callable]] = {}
        self._reader_thread: threading.Thread | None = None
        self._stop_reader = threading.Event()
        self._initialized = False

    def start(self) -> bool:
        """Spawn subprocess, send initialize/initialized, start reader thread."""

    def stop(self) -> None:
        """Send shutdown/exit, terminate process, join reader thread."""

    def send_request(self, method: str, params: dict,
                     timeout: float = 30.0) -> dict | None:
        """Send a JSON-RPC request and wait for response."""

    def send_notification(self, method: str, params: dict) -> None:
        """Send a JSON-RPC notification (no response expected)."""

    def on_notification(self, method: str, callback: callable) -> None:
        """Register a callback for a specific notification method."""

    def touch(self) -> None:
        """Update last_access timestamp."""

    @property
    def is_alive(self) -> bool:
        """Check if the subprocess is still running."""

    @property
    def idle_seconds(self) -> float:
        """Seconds since last access."""
```

## Threading Model

### Reader Thread (per session)
Each `ServerSession` has a dedicated background reader thread:

```python
def _reader_loop(self):
    """Background thread: read stdout, parse messages, dispatch."""
    buf = b""
    while not self._stop_reader.is_set():
        data = self.proc.stdout.read(1)  # or larger chunks
        if not data:
            break  # Server exited
        buf += data
        while b"\r\n\r\n" in buf:
            # Parse Content-Length header
            # Read exact body length
            # JSON decode
            msg = json.loads(body)

            if "id" in msg:
                # This is a response — store it and signal waiting thread
                if msg["id"] in self._response_events:
                    self._responses[msg["id"]] = msg
                    self._response_events[msg["id"]].set()
            else:
                # This is a notification — dispatch to callbacks
                method = msg.get("method", "")
                for cb in self._notification_callbacks.get(method, []):
                    cb(msg)
```

### Request/Response Matching
LSP uses integer `id` fields to match requests to responses. The pattern:
1. Generate unique ID (`self._msg_id += 1`)
2. Create `threading.Event` for this ID
3. Send request with this ID
4. Wait on Event with timeout
5. When reader thread receives response with matching ID, sets the Event
6. Request thread retrieves response from `_responses` dict

```python
def send_request(self, method, params, timeout=30.0):
    with self._lock:
        msg_id = self._msg_id
        self._msg_id += 1
        event = threading.Event()
        self._response_events[msg_id] = event

    request = {"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params}
    self._send_message(request)
    self.touch()

    if event.wait(timeout=timeout):
        with self._lock:
            response = self._responses.pop(msg_id, None)
            self._response_events.pop(msg_id, None)
            if "error" in response:
                raise LspError(response["error"])
            return response.get("result")
    else:
        raise TimeoutError(f"LSP request {method} timed out after {timeout}s")
```

### Thread Safety
- `self._lock` protects: `_msg_id`, `_response_events`, `_responses`
- Reader thread only writes to `_responses` and signals events
- Request threads only read after their event is set
- `self._lock` is held during send to ensure ordering

## Subprocess Management

### Spawning
```python
self.proc = subprocess.Popen(
    self.cmd,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd=str(self.workspace_root),
    # Consider: start_new_session=True for process group cleanup
)
```

### Reading stderr
LSP servers may write errors/logs to stderr. Options:
1. **Discard**: `stderr=subprocess.DEVNULL` (simplest, loses debug info)
2. **Log in background thread**: spawn a thread that reads stderr and logs
3. **Pipe to log file**: redirect to a temp file

Recommended: background stderr reader that logs at DEBUG level.

### Graceful Shutdown
```python
def stop(self):
    self._stop_reader.set()

    if self._initialized and self.proc:
        try:
            # LSP spec: shutdown then exit
            self.send_request("shutdown", {}, timeout=5.0)
            self.send_notification("exit", {})
        except Exception:
            pass

    if self.proc:
        self.proc.stdin.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=2)

    if self._reader_thread and self._reader_thread.is_alive():
        self._reader_thread.join(timeout=2)
```

## Server Pool / Registry

A module-level registry manages all active sessions:

```python
# Key: (workspace_root_str, language_id) → ServerSession
_server_pool: dict[tuple[str, str], ServerSession] = {}
_pool_lock = threading.Lock()

def get_or_create_session(workspace_root: Path, lang_config: dict) -> ServerSession:
    key = (str(workspace_root), lang_config["language_id"])
    with _pool_lock:
        session = _server_pool.get(key)
        if session and session.is_alive:
            session.touch()
            return session
        # Create new session
        session = ServerSession(lang_config["binary"], cmd, workspace_root, lang_config)
        if session.start():
            _server_pool[key] = session
            return session
        return None

def cleanup_idle_sessions(max_idle: float = 600.0) -> None:
    """Kill sessions idle longer than max_idle seconds."""
    now = time.monotonic()
    with _pool_lock:
        stale_keys = [
            k for k, s in _server_pool.items()
            if now - s.last_access > max_idle or not s.is_alive
        ]
        for key in stale_keys:
            session = _server_pool.pop(key)
            session.stop()
```

## Idle Cleanup Loop

Two approaches:

### Approach 1: Periodic timer thread
```python
def _idle_cleanup_loop(check_interval: float = 60.0, max_idle: float = 600.0):
    """Background thread that periodically cleans up idle sessions."""
    while not _cleanup_stop.is_set():
        _cleanup_stop.wait(check_interval)
        cleanup_idle_sessions(max_idle)
```
- Start a daemon thread at plugin register time
- Runs every 60s, checks all sessions
- Kills any idle > 600s

### Approach 2: Lazy cleanup on access
```python
def get_or_create_session(...):
    # Before returning, check if any other sessions are idle
    cleanup_idle_sessions()  # runs inline, fast
```
- No background thread needed
- Cleanup happens opportunistically
- May leave stale sessions longer than 600s

**Recommended**: Approach 1 (periodic timer) for reliability, with Approach 2 as opportunistic bonus.

## Plugin Unload Cleanup

The Hermes plugin system may call a cleanup function on unload:

```python
def cleanup_all_sessions() -> None:
    """Called on plugin unload — kill all sessions."""
    _cleanup_stop.set()  # stop cleanup thread
    with _pool_lock:
        for key, session in list(_server_pool.items()):
            session.stop()
        _server_pool.clear()
```

If Hermes doesn't provide an unload hook, use `atexit.register(cleanup_all_sessions)`.

## Server Readiness Guarantee

To ensure the LSP server is always ready before use:

```python
def ensure_server_ready(workspace_root: Path, lang_config: dict) -> ServerSession | None:
    """Guarantee server is installed, started, and initialized."""
    # 1. Check/install binary
    binary = lang_config["binary"]
    if not is_binary_available(binary):
        install_command = lang_config.get("install_command", "")
        if install_command:
            if not install_server(install_command):
                return None
            _installed_binaries.add(binary)
        else:
            return None

    # 2. Get or create persistent session
    return get_or_create_session(workspace_root, lang_config)
```

## Indexing Delay Handling

Some servers (pyright, rust-analyzer) need time to index the workspace:

```python
def _wait_for_indexing(session: ServerSession, lang_config: dict,
                       max_wait: float = 10.0) -> None:
    """Wait briefly after initialization for server indexing."""
    # Some servers need time to parse workspace files
    # pyright: send workspace/didChangeConfiguration, wait for progress end
    # rust-analyzer: sends progress notifications
    # Generic fallback: simple sleep
    time.sleep(min(2.0, float(lang_config.get("indexing_delay", 2.0))))
```

Alternatively, check server-specific readiness signals:
- pyright: waits for `$/progress` with `kind: "end"` for "indexing"
- rust-analyzer: `$/progress` for "rust-analyzer/indexing"
- Generic: just send the request and handle empty results gracefully

## Configuration Additions

New config keys needed in `config.py`:
```python
# Global settings
"idle_timeout": 600,        # seconds before idle server is killed
"cleanup_interval": 60,     # seconds between cleanup checks
"request_timeout": 30,      # default timeout for LSP requests
"indexing_delay": 2.0,      # seconds to wait after init for indexing

# Per-language overrides (in each language config)
"indexing_delay": 5.0,      # pyright might need more time
```

## Comparison: Ephemeral vs Persistent

| Aspect | Current (Ephemeral) | Target (Persistent) |
|--------|-------------------|---------------------|
| Spawn cost | Per request | Once per workspace/language |
| Init cost | Per request | Once per workspace/language |
| Indexing cost | Repeated | Once |
| Memory | Low (short-lived) | Higher (long-lived) |
| Complexity | Low | Medium |
| Navigation viable | No (too slow) | Yes (fast) |
| Diagnostics viable | Yes (already works) | Yes (still works) |
| Idle cleanup | N/A | Required (600s) |
| Unload cleanup | N/A | Required |

## Key Implementation Files to Modify

1. **lsp_manager.py** — Major rewrite:
   - Add `ServerSession` class
   - Add `_server_pool` registry
   - Add `get_or_create_session()` function
   - Add `cleanup_idle_sessions()` function
   - Modify `get_diagnostics()` to use persistent session
   - Add `goto_definition()` function
   - Add `find_references()` function
   - Add idle cleanup daemon thread

2. **config.py** — Add new config keys:
   - `idle_timeout`, `cleanup_interval`, `request_timeout`
   - Per-language `indexing_delay`

3. **__init__.py** — Minor changes:
   - Register `lsp_goto_definition` tool
   - Register `lsp_find_references` tool
   - Register unload/cleanup hook (via `atexit`)
