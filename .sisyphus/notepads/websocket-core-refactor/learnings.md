# Migration Embedding Strategy

- Replaced `include_dir!` macro with `include_str!` for embedding migrations
- Removed `include_dir` crate dependency from Cargo.toml
- Simplified `discover_migrations()` to return a static vec instead of runtime directory discovery
- Eliminated rust-analyzer LSP diagnostic error on `MIGRATIONS_DIR` static
- Maintained same external behavior: migrations still embedded, applied in version order

# JSON-RPC 2.0 Protocol Layer

- Wrapped core protocol types with server-specific `IncomingMessage`/`OutgoingMessage` enums
- Correlation ID routing: used `type CorrelationId = String` for type safety while keeping JSON-RPC ID compatibility
- Parsing strategy: try `JsonRpcRequest` first, then `Notification` - maintains spec compliance while distinguishing request vs notification
- Request router uses `dashmap::DashMap` for thread-safe handler registration without locks
- Notification broadcasting reuses existing `ServerState.broadcast_tx` channel - no new infrastructure needed
- Error factory provides structured conversion from `ProtocolError` to standard JSON-RPC error codes
- TDD approach: wrote all tests first, verified 10 passing tests with coverage for parsing, routing, broadcasting, and error handling

# Authentication Middleware (Task 15)

## Implementation Summary

Created password-based authentication system in `ymir-core/src/handlers/auth.rs`:

### Auth Model Decisions
- **Simple password-only**: No JWT, OAuth, or session complexity per plan requirements
- **Per-connection state**: Each WebSocket connection tracks authenticated status via `ConnectionState.authenticated`
- **Localhost bypass**: When `allow_localhost_bypass: true`, localhost connections skip auth even with password set
- **Config-driven**: `AuthConfig` holds password and bypass settings; `ServerConfig` extended with `password` and `allow_localhost_bypass` fields

### Key Types Implemented
- `AuthHandler`: Core business logic for password validation
- `AuthRpcHandler`: JSON-RPC adapter for auth methods (auth.login, auth.logout, auth.status)
- `AuthMiddleware`: Request authorization checking with method-level exemptions
- `AuthError` → `ProtocolError` conversion for proper JSON-RPC error responses

### Auth Flow
1. Client connects via WebSocket
2. If server has password set, client must call `auth.login` with password
3. On successful login, connection marked as authenticated
4. Protected routes check auth via `AuthMiddleware::check_auth()`
5. Localhost connections bypass auth when enabled

### Files Changed
- `ymir-core/src/handlers/auth.rs` (new, 644 lines with tests)
- `ymir-core/src/handlers/mod.rs` (added auth module exports)
- `ymir-core/src/server/mod.rs` (added auth fields to ServerConfig and ServerState)

### Test Coverage
- 25+ test cases covering:
  - Password validation (correct, incorrect, no password set)
  - Localhost detection (IPv4/IPv6)
  - Localhost bypass behavior
  - Auth middleware authorization checks
  - RPC handler method routing
  - Auth status reporting

### Assumptions Documented
- `--password` CLI flag will be implemented in Task 16; auth system supports it via `ServerConfig::with_password()`
- Localhost bypass is enabled by default for simplified development
- Session tokens are placeholders for future session support
- auth.login and auth.status are always allowed (no auth required)

## Task 14: Git Handlers - Implementation Summary

### Files Created/Modified
- `ymir-core/src/handlers/git.rs` - New file with git handlers
- `ymir-core/src/handlers/mod.rs` - Added git module exports
- `ymir-core/src/git/mod.rs` - Added serde derives to GitStatus, BranchInfo, GitFile, FileStatus

### Implementation Details

#### Two-Layer Pattern
Following the established pattern in workspace/pane/tab/pty handlers:
1. **GitHandler** - Business logic layer wrapping GitService
2. **GitRpcHandler** - RPC adapter layer for JSON-RPC protocol

#### Handlers Implemented
- `git.status` - Get repository status (GitStatusInput/GitStatusOutput)
- `git.stage` - Stage a file (GitStageInput/GitStageOutput)
- `git.unstage` - Unstage a file (GitUnstageInput/GitUnstageOutput)
- `git.commit` - Create a commit (GitCommitInput/GitCommitOutput)
- `git.branches` - List branches (GitBranchesInput/GitBranchesOutput)
- `git.checkout` - Checkout/switch branch (GitCheckoutInput/GitCheckoutOutput)

#### Notifications
- `git.state_change` - Emitted on git state changes
- Notification variants: StatusChanged, FileStaged, FileUnstaged, Committed, BranchChanged

#### Server-Side Polling
- `GitPollingService` - Polls registered repositories for status changes
- `register_repo()` / `unregister_repo()` - Manage polling targets
- `poll_all()` - Returns changed repositories
- `run()` - Async polling loop with callback

#### Key Design Decisions
1. Reused existing GitService from Task 8 - no git logic duplication
2. Added serde derives to git types for JSON serialization
3. Status change detection compares against last known status
4. First poll always returns current status (no previous baseline)

### Test Results
```
cargo test -p ymir-core handlers::git::tests
running 16 tests
test result: ok. 16 passed; 0 failed; 0 ignored
```

### Verification Commands
```
cargo check --workspace  # Passes with warnings only
cargo test -p ymir-core handlers::git::tests  # All 16 tests pass
```

## Task 15 Completion Summary

### Verification Results
- **cargo check -p ymir-core**: PASSED (3 warnings unrelated to auth)
- **cargo test -p ymir-core auth**: PASSED (35/35 tests)
- **cargo check --workspace**: PASSED

### Bug Fix Applied
Fixed `AuthHandler::get_status()` to properly report authenticated=true when no password is required:
- Before: `authenticated: is_authenticated || self.can_bypass_auth(addr)`
- After: `authenticated: is_authenticated || !self.is_auth_required() || self.can_bypass_auth(addr)`

This ensures that when auth is not required (open mode), all connections are considered authenticated.

### Test Coverage Summary
35 auth tests covering:
- Config defaults and password setup (3 tests)
- Password validation scenarios (4 tests)
- Localhost detection IPv4/IPv6 (2 tests)
- Localhost bypass behavior (3 tests)
- Auth status reporting (4 tests)
- Auth middleware authorization (4 tests)
- RPC handler method routing (6 tests)
- Error handling and notifications (3 tests)
- Server integration (2 tests)

### Integration Points
- ServerConfig::with_password() ready for Task 16 CLI --password flag
- AuthMiddleware::method_requires_auth() whitelist for auth-free methods
- ConnectionState::authenticated field for per-connection tracking
- AuthConfig extracted from ServerConfig for handler initialization

# Task 18: CLI Argument Parsing - Implementation Summary

### Files Created/Modified
- `.worktrees/websocket-core-refactor/Cargo.toml` - Added workspace members (ymir-server), workspace.package fields, and dependencies (tokio, uuid, tracing, tracing-subscriber, clap)
- `.worktrees/websocket-core-refactor/ymir-server/Cargo.toml` - Added clap dependency
- `.worktrees/websocket-core-refactor/ymir-server/src/cli.rs` - New CLI module with clap derive macros (177 lines with tests)
- `.worktrees/websocket-core-refactor/ymir-server/src/lib.rs` - New lib file exporting CLI types
- `.worktrees/websocket-core-refactor/ymir-server/src/main.rs` - Updated to use CLI parsing
- `.worktrees/websocket-core-refactor/ymir-server/tests/cli_test.rs` - Integration tests for CLI parsing (12 tests)

### Implementation Details

#### CLI Structure
Using clap derive macros with subcommands:
1. **Cli** - Root command with optional subcommand
2. **Commands** - Enum with `web` variant
3. **WebArgs** - Struct with `--host`, `--port`, `--password` arguments

#### Argument Design
- `--host` / `-H`: Host address (default: "127.0.0.1")
  - Used uppercase `-H` to avoid conflict with clap's `-h` for `--help`
- `--port` / `-p`: Port number (default: 8080)
- `--password`: Optional password for authentication (default: none)
  - No short option to keep it explicit and secure

#### Validation Methods
- `WebArgs::validate()` - Checks port != 0 and host not empty
- `WebArgs::bind_address()` - Returns "host:port" string

#### Library vs Binary
- Created lib target so tests can import from `ymir_server` crate
- Exported CLI types: `Cli`, `Commands`, `WebArgs`
- Binary entry point in `main.rs` parses and displays config

### Test Coverage
- **Unit tests in cli.rs**: 6 tests covering default values, custom args, validation
- **Integration tests in cli_test.rs**: 12 tests covering:
  - No subcommand
  - Web subcommand with defaults
  - Custom host/port/password
  - Short options (-H, -p)
  - Invalid arguments
  - Help text verification
- **Total**: 18 passing tests

### QA Verification
```bash
# Main help works
cargo run -p ymir-server -- --help
# Shows: Usage: ymir-server [COMMAND], Commands: web, Options: -h/--help

# Web subcommand help works
cargo run -p ymir-server -- web --help
# Shows: Usage: ymir-server web [OPTIONS], Options: -H/--host, -p/--port, --password

# Custom arguments work
cargo run -p ymir-server -- web --host 192.168.1.100 --port 9999
# Outputs: Host: 192.168.1.100, Port: 9999, Bind address: 192.168.1.100:9999

# Short options work
cargo run -p ymir-server -- web -H localhost -p 3000
# Outputs: Host: localhost, Port: 3000, Bind address: localhost:3000

# Invalid arguments rejected
cargo run -p ymir-server -- web --invalid
# Outputs: error: unexpected argument '--invalid' found
```

### Design Decisions
1. **ymir-core temporarily disabled**: ymir-server doesn't need ymir-core yet (will be re-enabled in Task 16)
2. **Uppercase -H for host**: Avoids conflict with clap's -h/--help
3. **No short option for password**: Keeps it explicit, reduces typos
4. **Separate lib target**: Enables integration tests to import CLI types
5. **Validation in WebArgs**: Centralized validation logic with clear error messages

### Integration Points
- `WebArgs` struct ready for Task 16 server startup
- Validation logic ready for integration with actual server
- Help text automatically generated from docstrings
- `bind_address()` method provides formatted address for server binding

### Known Limitations
- Server not actually started yet (Task 16 scope)
- ymir-core dependency commented out until Task 16
- Password argument validated but not used for auth yet

### Verification Commands
```bash
cargo test -p ymir-server  # All 18 tests pass
cargo run -p ymir-server -- --help  # Help works
cargo run -p ymir-server -- web --help  # Web help works
```

## Task 15 Auth Integration Fix

### Compile Error Fixes
Fixed auth/server integration compile errors:

1. **Error**: `JsonRpcError: From<AuthError>` not satisfied at `auth_err.into()`
   - **Fix**: Convert `AuthError` → `ProtocolError` → `JsonRpcError` explicitly:
   ```rust
   let protocol_err: ProtocolError = auth_err.into();
   let error_response = OutgoingMessage::error(
       correlation_id.clone(),
       protocol_err.to_jsonrpc_error(),
   );
   ```

2. **AuthRpcHandler already implemented RequestHandler**: Confirmed `#[async_trait::async_trait]` impl exists in `auth.rs:311-317`

### Server Integration Summary
Auth middleware now fully integrated into server request flow:

1. **ServerState** includes:
   - `auth_handler: AuthHandler` - password validation
   - `auth_middleware: AuthMiddleware` - request authorization
   - `request_router: RequestRouter` - method routing

2. **handle_message** flow:
   - Parse JSON-RPC message
   - Check if method requires auth via `AuthMiddleware::method_requires_auth()`
   - For protected methods: verify auth via `auth_middleware.check_auth()`
   - Special handling for `auth.login`: marks connection authenticated on success
   - Special handling for `auth.status`: includes connection context
   - Route requests via `request_router.route()`
   - Send JSON-RPC responses back to client

3. **Auth enforcement**:
   - Protected methods return auth error if not authenticated
   - `auth.login` and `auth.status` are always allowed
   - Localhost bypass works for local connections

### Verification Results
- `cargo check --workspace`: PASSED (3 unrelated warnings)
- `cargo test -p ymir-core auth`: PASSED (35/35 tests)

### Files Changed
- `ymir-core/src/server/mod.rs` - auth integration in handle_message
- `ymir-core/src/handlers/auth.rs` - RequestHandler trait impl (already existed)

# Task 18 Port Default Fix - Summary

### Issue
CLI default port was `8080`, but refactor uses `7139` (defined in `ymir-core/src/server/mod.rs:34` as `DEFAULT_PORT`)

### Files Changed
- `ymir-server/src/cli.rs` - Updated port default_value from "8080" to "7139" and updated docstring
- `ymir-server/src/cli.rs` (unit tests) - Updated 3 test assertions from 8080 to 7139
- `ymir-server/tests/cli_test.rs` - Updated 4 test assertions from 8080 to 7139

### Changes Made
1. Line 29: `#[arg(short, long, default_value = "7139")]` (was "8080")
2. Line 28: Docstring updated to show "default: 7139" (was "8080")
3. Unit tests updated: `test_web_args_default`, `test_cli_with_web_subcommand`, `test_web_args_empty_host`
4. Integration tests updated: `test_cli_parsing_web_defaults`, `test_cli_parsing_web_custom_host`, `test_cli_parsing_web_with_password`, `test_web_args_validation_success`

### Verification
```bash
cargo test -p ymir-server  # All 18 tests pass
cargo check --workspace  # Passes (unrelated warnings only)
cargo run -p ymir-server -- web  # Shows "Port: 7139"
cargo run -p ymir-server -- web --help  # Shows "default: 7139"
```

### Alignment
CLI now uses correct default port (7139) matching:
- ymir-core/src/server/mod.rs DEFAULT_PORT constant
- All test expectations
- Help documentation

# Task 19: Browser Spawning - Implementation Summary

### Files Created/Modified
- `.worktrees/websocket-core-refactor/ymir-server/Cargo.toml` - Added webbrowser dependency
- `.worktrees/websocket-core-refactor/ymir-server/src/browser.rs` - New browser helper module with 8 tests
- `.worktrees/websocket-core-refactor/ymir-server/src/lib.rs` - Exported browser module functions
- `.worktrees/websocket-core-refactor/ymir-server/src/main.rs` - Minimal browser opening integration

### Implementation Details

#### Browser Helper Functions
- `open_browser(url: &str) -> Result<bool, String>` - Opens default web browser with graceful failure handling
- `build_url(host: &str, port: u16) -> String` - Constructs HTTP URL from host and port

#### Key Design Decisions
1. **Graceful degradation**: Browser opening failures log warnings but don't crash the server
2. **URL validation**: Rejects URLs without http:// or https:// protocol
3. **Isolated helper**: Can be called from standalone mode without Tauri dependencies
4. **Public API**: Exported via lib.rs for Task 16 to use
5. **Minimal integration in main.rs**: Demonstrates usage but doesn't wire full server startup

#### Error Handling
- Invalid URLs return `Err(String)` with descriptive message
- Browser opening failures return `Ok(false)` and log warning
- No panics on browser launch failures

### Test Coverage
8 tests covering:
- URL construction with IPv4, localhost, custom hosts (4 tests)
- URL validation (invalid format, missing protocol, https/http accepted) (3 tests)
- Default port alignment (1 test)

### Verification Results
```bash
cargo test -p ymir-server  # All 40 tests pass (8 browser + 14 existing CLI + 12 integration + 6 doc tests)
cargo check -p ymir-server  # Passes with no warnings
cargo run -p ymir-server -- web  # Opens browser to http://127.0.0.1:7139
cargo run -p ymir-server -- web --host localhost --port 3000  # Opens browser to http://localhost:3000
```

### Integration Points
- `open_browser()` ready for Task 16 standalone server startup
- `build_url()` constructs URLs from CLI arguments
- Exported via `pub use browser::{build_url, open_browser}` in lib.rs
- Uses tracing for logging (info/warn levels)

### Browser Spawning Behavior
- Opens browser to constructed URL when server starts in web mode
- Correct URL format: http://{host}:{port}
- Default port 7139 aligned with Task 18 CLI defaults
- Tauri mode will NOT call this (per task requirements)

### Known Limitations
- No custom browser option support (optional per plan, not implemented)
- Browser opening is synchronous (doesn't block server startup)
- Doesn't verify server is actually running before opening browser

## Task 15 Final Completion Summary

### Protected-Route Tests Added
Added 5 integration tests to `ymir-core/src/server/mod.rs`:

1. **test_auth_middleware_blocks_protected_methods**: Verifies remote connections are blocked from protected methods without auth
2. **test_auth_login_marks_connection_authenticated**: Verifies successful login marks connection as authenticated
3. **test_auth_login_wrong_password_fails**: Verifies failed login does not authenticate connection
4. **test_localhost_bypass_allows_protected_methods**: Verifies localhost bypass works for protected methods
5. **test_auth_status_returns_connection_context**: Verifies auth.status includes connection context

### Final Verification Results
- **cargo check --workspace**: PASSED (3 unrelated warnings in git module)
- **cargo test -p ymir-core**: PASSED (232/232 tests)
- **cargo test -p ymir-core auth**: PASSED (35/35 auth tests)
- **cargo test -p ymir-core server::tests**: PASSED (17/17 server tests)

### Complete Auth Integration Flow
1. **Connection established**: `ConnectionState` created with `authenticated: false`
2. **Protected method request**: `handle_message` checks auth requirements
3. **Auth check**: `AuthMiddleware::check_auth()` validates:
   - If already authenticated: allow
   - If no password required: allow
   - If localhost bypass enabled and localhost: allow
   - Otherwise: return auth error
4. **auth.login handling**: Special case that:
   - Routes to `AuthRpcHandler`
   - On success: calls `conn_state.set_authenticated(true)`
   - Returns login response
5. **auth.status handling**: Special case that:
   - Gets connection auth state
   - Returns `AuthStatusOutput` with connection context
6. **Other methods**: Routed via `RequestRouter` after auth check

### Files Changed
- `ymir-core/src/server/mod.rs` - Auth integration in handle_message + 5 new tests
- `ymir-core/src/handlers/auth.rs` - RequestHandler trait impl for AuthRpcHandler

### Total Test Coverage
- 35 auth-specific tests in handlers::auth
- 5 server integration tests for protected routes
- 232 total tests in ymir-core (all passing)

# Task 20: Sidecar Configuration - Implementation Summary

### Files Created/Modified
- `.worktrees/websocket-core-refactor/ymir-tauri/tauri.conf.json` - New Tauri config with externalBin for ymir-server
- `.worktrees/websocket-core-refactor/.cargo/config.toml` - Updated with cross-compilation target documentation
- `.worktrees/websocket-core-refactor/ymir-tauri/build.rs` - New build script for sidecar binary validation
- `.worktrees/websocket-core-refactor/ymir-tauri/Cargo.toml` - Added build-dependencies section
- `.worktrees/websocket-core-refactor/Cargo.toml` - Added ymir-tauri to workspace members

### Tauri Sidecar Configuration

#### externalBin Configuration
- Configured `ymir-server` as external sidecar binary in tauri.conf.json
- Binary path: `../target/release/ymir-server` (relative to ymir-tauri/)
- Targets all platforms: linux, darwin, windows
- Tauri will bundle the sidecar binary with the application

#### Platform-Specific Binary Naming
Documented in .cargo/config.toml:
- Linux (x86_64): target/x86_64-unknown-linux-gnu/release/ymir-server
- macOS (x86_64): target/x86_64-apple-darwin/release/ymir-server
- macOS (ARM64): target/aarch64-apple-darwin/release/ymir-server
- Windows (x86_64): target/x86_64-pc-windows-msvc/release/ymir-server.exe

### Build Script Implementation

#### Build Script Features
- Detects build profile (release/debug) via PROFILE env var
- Constructs correct sidecar binary path for current platform
- Handles Windows .exe extension automatically via cfg!(windows)
- Warns if sidecar binary doesn't exist (doesn't fail build)
- Sets up cargo rerun directives for ymir-server changes

#### Build Script Behavior
- Release builds: Looks for ../target/release/ymir-server
- Debug builds: Looks for ../target/debug/ymir-server
- Missing binary: Prints warning but doesn't fail the build
- Changes to ymir-server trigger recompilation

### Configuration Decisions

1. **Minimal build script**: Only validates binary exists, doesn't build it
   - Sidecar should be built separately via `cargo build --release`
   - Keeps build script simple and low-risk
   - Allows fine-grained control over sidecar compilation

2. **Platform-agnostic path**: Uses ../target/release/ymir-server for all platforms
   - Tauri bundler handles platform-specific naming automatically
   - Simplifies configuration (no need for platform-specific paths)
   - Cargo's target directory structure is consistent across platforms

3. **Warning not error**: Build script warns if binary missing
   - Allows development builds to proceed without sidecar
   - Provides clear guidance for fixing the issue
   - Doesn't block Tauri dev mode unnecessarily

4. **Workspace integration**: Added ymir-tauri to workspace members
   - Enables `cargo check -p ymir-tauri` from workspace root
   - Ensures consistent workspace configuration
   - Allows workspace-level cargo commands to work correctly

### Verification Results
- ✓ JSON syntax valid for tauri.conf.json
- ✓ cargo check -p ymir-tauri passes (no build script warnings)
- ✓ cargo check --workspace passes (unrelated warnings in ymir-core only)
- ✓ ymir-server binary exists at target/debug/ymir-server
- ✓ Tauri schema reference: https://schema.tauri.app/config/2

### Integration Points
- externalBin path: `../target/release/ymir-server` (used by Tauri bundler)
- Build script: Validates sidecar binary availability
- .cargo/config.toml: Documents cross-compilation target structure
- Workspace members: ymir-tauri now part of workspace

### Known Limitations
- Sidecar binary must be built separately before Tauri bundling
- Cross-compilation targets not yet added (placeholder for future work)
- Build script only warns, doesn't automatically build sidecar
- No custom sidecar binary naming or path configuration

### Next Steps (Task 17)
- Use Tauri sidecar API to start ymir-server process
- Manage sidecar process lifecycle (start/stop/restart)
- Handle sidecar process communication
- Implement embedded service integration in ymir-tauri

### File Summary
**Created:**
- ymir-tauri/tauri.conf.json (52 lines)
- ymir-tauri/build.rs (40 lines)

**Modified:**
- .cargo/config.toml (updated with documentation)
- ymir-tauri/Cargo.toml (added build-dependencies)
- Cargo.toml (workspace members)


# Task 20 Fix: Tauri v2 externalBin Format Correction

### Issue Identified
Initial Task 20 implementation used incorrect `externalBin` format in tauri.conf.json:
- Used array of objects with name/path/targets properties
- Tauri v2 requires externalBin to be array of STRINGS, not objects

### Correction Applied

#### tauri.conf.json
Changed from (incorrect):
```json
"externalBin": [
  {
    "name": "ymir-server",
    "path": "../target/release/ymir-server",
    "targets": ["linux", "darwin", "windows"]
  }
]
```

Changed to (correct):
```json
"externalBin": [
  "../target/release/ymir-server"
]
```

#### .cargo/config.toml
Removed memo-style "Note:" comment that described implementation limitations.
Retained necessary build system documentation for binary location and naming conventions.

### Tauri v2 externalBin Requirements

#### Correct Format
- Array of strings (binary paths), not objects
- Paths can be absolute or relative to tauri.conf.json
- Relative paths resolved from ymir-tauri/ directory

#### Binary Naming
Tauri appends -{TARGET_TRIPLE} suffix during bundling:
- Base path: "../target/release/ymir-server"
- Tauri looks for: "../target/release/ymir-server-{TARGET_TRIPLE}"
- Example: "../target/release/ymir-server-x86_64-unknown-linux-gnu"

#### Cross-Compilation
For proper multi-platform support, binaries must have target triple suffixes:
- Linux: ymir-server-x86_64-unknown-linux-gnu
- macOS (Intel): ymir-server-x86_64-apple-darwin
- macOS (Apple Silicon): ymir-server-aarch64-apple-darwin
- Windows: ymir-server-x86_64-pc-windows-msvc.exe

### Current Limitation
Implementation uses platform-agnostic binary naming (ymir-server) without target triple suffix.
This works for single-platform builds but may require cross-compilation setup for full multi-platform support.

### Verification Results
- ✓ JSON syntax valid
- ✓ externalBin format correct (string array)
- ✓ cargo check -p ymir-tauri passes
- ✓ Tauri v2 schema satisfied

### Files Modified
- ymir-tauri/tauri.conf.json (fixed externalBin format)
- .cargo/config.toml (removed memo-style comment, retained necessary documentation)

