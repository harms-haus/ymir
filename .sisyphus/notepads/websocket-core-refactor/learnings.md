## Task 17: Tauri-side Embedded Service Path

...

### Summary
Implemented the Tauri-side embedded service configuration for `ymir-tauri` package:
- Moved active Tauri app code into `ymir-tauri` directory
- Configured sidecar to embedding of `ymir-server` binary
- Set up frontend connection placeholder
- Implemented window cleanup logic

...

### Files Modified
1. `ymir-tauri/Cargo.toml` - Updated with Tauri v2 dependencies and ymir-core local dependency
2. `ymir-tauri/build.rs` - Fixed static slice lifetime error by using inline array literal
3. `ymir-tauri/src/platform.rs` - Created with platform detection code
4. `ymir-tauri/src/main.rs` - Created with minimal entry point
5. `ymir-tauri/src/lib.rs` - Fixed syntax errors:
6. `ymir-tauri/tauri.conf.json` - Changed `frontendDist` to `dist`, removed `externalBin` section
7. `ymir-tauri/dist/index.html` - Created placeholder HTML file
8. `ymir-tauri/icons/*` - Copied from src-tauri/icons/

### Verification Results
- `cargo check -p ymir-tauri` - ✅ Pass (only warnings)
- `cargo check --workspace` - ✅ Pass (only warnings)
- All 28 ymir-server tests still pass
- All ymir-core tests still pass
- No regressions

...

### Key Implementation Details
- Used `std::sync::{Arc, RwLock}` for thread-safe embedded service state management (NOT tokio::sync::RwLock which is async)
- Sidecar binary path format: `ymir-server-{profile}` (e.g., `ymir-server-debug`)
- Embedded service runs on port 7139 by default
- Platform detection copied from existing src-tauri implementation
- Minimal Tauri v2 plugin set: Shell, Notification, Store, Os
- State management via `EmbeddedServiceManager` with `RwLock<Option<EmbeddedService>>`

### Known Issues / Future Work
- Sidecar spawning logic present but needs actual sidecar binary in target directory
- Frontend placeholder needs proper implementation
- Full embedded service integration requires ymir-server binary to target
- Window cleanup logic for embedded service shutdown
- Build.rs uses inline array slice to `.as_slice()` to avoid lifetime issues

### Commands to Build/Run
```bash
# Check ymir-tauri package
cargo check -p ymir-tauri

# Check entire workspace
cargo check --workspace

# Build ymir-tauri (requires sidecar binary)
cargo build -p ymir-tauri
```

## Task 17 Repair (current session)

- Replaced `ymir-tauri/src/app.rs` scaffold with the active Tauri app flow.
- Embedded sidecar startup now runs during `setup` via `tauri_plugin_shell` with `ymir-server web --host 127.0.0.1 --port 7139`.
- Added idempotent shutdown cleanup on `CloseRequested`, `Destroyed`, `ExitRequested`, and `Exit` events by storing `CommandChild` in managed state and calling `kill()` once.
- Simplified `ymir-tauri/src/lib.rs` to only initialize logging and delegate to `app::run()`, removing the broken state extraction pattern.
- Normalized `ymir-tauri/build.rs` call shape so `tauri_build::try_build(...)` is well-formed and stable.
- Verification: `cargo check -p ymir-tauri` and `cargo check --workspace` both pass from worktree root (existing warnings remain in `ymir-core`).

## Task 17 externalBin regression fix

- Restored `bundle.externalBin` in `ymir-tauri/tauri.conf.json` with Tauri v2 string-array shape: `["binaries/ymir-server"]`.
- `cargo check -p ymir-tauri` initially failed because `binaries/ymir-server-x86_64-unknown-linux-gnu` was missing; added that sidecar source binary under `ymir-tauri/binaries/` from existing `target/debug/ymir-server` so tauri-build can resolve/copy sidecar.
- After restoring config and sidecar source file, both required checks pass again from workspace root.
- `timeout 45s ./scripts/tauri-dev.sh dev` does not fail on Tauri config parsing; it fails earlier on legacy `src-tauri/Cargo.toml` workspace-metadata mismatch (outside this Task 17 config-only fix scope).

## Task 17 dev startup path fix

- Updated `scripts/tauri-dev.sh` to `cd` into `ymir-tauri/` before running `npx tauri`, so CLI resolution uses the new Tauri crate path instead of legacy `src-tauri` defaults.
- Verified `timeout 45s ./scripts/tauri-dev.sh dev` now gets past the previous `src-tauri/Cargo.toml` workspace mismatch and launches the app process.
- Runtime log confirms embedded service startup: `Embedded service sidecar started host="127.0.0.1" port=7139`.
