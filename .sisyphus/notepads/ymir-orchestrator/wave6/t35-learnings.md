# Task 35 Learnings: Tauri Build Config + Proxy Setup

## Configuration Changes

### tauri.conf.json Updates
- Updated window title from "ymir" to "Ymir"
- Changed dimensions to 1400x900 (was 1200x800)
- Added min dimensions: 1200x800
- Added center: true
- Removed fullscreen: false (not needed)
- Added security.csp with Monaco-friendly settings:
  - default-src: 'self'
  - connect-src: 'self' ws://localhost:7319 (WebSocket support)
  - style-src: 'self' 'unsafe-inline' (inline styles)
  - script-src: 'self' 'unsafe-eval' 'unsafe-inline' (Monaco eval support)
  - worker-src: 'self' blob: (Monaco web workers)
  - img-src: 'self' data: blob: (embedded images)
  - font-src: 'self' data: (embedded fonts)
- Added dangerousDisableAssetCspModification: true (for Monaco workers)

### capabilities/default.json Creation
- Created Tauri v2 capabilities file
- Identifier: "default"
- Windows: ["main"]
- Permissions: core:default + window dragging + webview resizing
- Remote URLs: http://localhost:* (for development)
- Initially included invalid permissions (shell:allow-open, fs:*, dialog:*, clipboard-manager:*)
- Simplified to only valid core permissions to pass build

### src/lib.rs Implementation
- Implemented run() function using Builder pattern
- Standard Tauri v2 initialization
- Ready for IPC command registration in T36

## Icon Generation

### Approach
- Used ImageMagick (magick) to generate placeholder icons
- Simple "Y" letter on dark (#1a1a1a) background
- Created all required formats: PNG, ICO, ICNS

### Files Created
- 32x32.png (575 bytes)
- 128x128.png (1.7KB)
- 128x128@2x.png (256x256) (3.1KB)
- icon.icns (1.7KB)
- icon.ico (67KB - larger due to multiple resolutions)

### Key Learning
- Icons must be in RGBA format (used PNG32: prefix)
- Tauri's generate_context!() macro validates icon format during build
- Must specify format when using magick: PNG32:/path/to/file

## Makefile Updates

### New Targets Added
1. `make dev-tauri`: 
   - Starts Vite dev server in background
   - Starts Tauri dev mode
   - Kills existing processes first

2. `make build-tauri`:
   - Builds web app first
   - Builds Tauri release binary
   - Used for production builds

3. `make build-web-only`:
   - Builds just the web app
   - Useful for web-only deployments

### Help Text
Updated help section to document all three new targets.

## Workspace Configuration

### Cargo.toml Update
- Uncommented "apps/tauri/src-tauri" in workspace members
- Tauri app now part of Rust workspace
- Build process: `cargo build -p ymir-app` works

### Test Dependencies
- Added serde and serde_json to dev-dependencies
- Required for JSON validation in build tests

## Build Verification

### Test File: apps/tauri/src-tauri/tests/build.rs
- Validates tauri.conf.json exists and is valid JSON
- Validates capabilities/default.json exists and is valid JSON
- Validates all 5 icon files exist
- All 9 tests pass successfully

### Running Tests
```bash
cargo test -p ymir-app --test build
```

### Path Resolution Issue
- Integration tests run from test directory
- Must use relative paths without "src-tauri/" prefix
- Example: Path::new("tauri.conf.json") not Path::new("src-tauri/tauri.conf.json")

## Issues Encountered and Resolved

### 1. Capabilities JSON Format Error
- **Error**: "missing field `urls`"
- **Cause**: Used `remote.domain` instead of `remote.urls`
- **Fix**: Changed to `remote: { "urls": ["http://localhost:*"] }`

### 2. Invalid Permissions Error
- **Error**: "Permission shell:allow-open not found"
- **Cause**: Included shell, fs, dialog, clipboard-manager permissions
- **Root Cause**: These require plugin crates not added yet
- **Fix**: Simplified to only core:default + specific window/webview permissions
- **Note**: Additional permissions will be added in T36 when plugins are configured

### 3. Icon Format Error
- **Error**: "icon is not RGBA"
- **Cause**: Default PNG format not suitable for Tauri
- **Fix**: Used ImageMagick PNG32: prefix to force RGBA format

### 4. Test Harness Confusion
- **Error**: "main function not found"
- **Cause**: Mixed binary and test syntax
- **Fix**: Used standard #[test] attributes (no main needed)
- **Note**: Integration tests automatically discover #[test] functions

## Next Steps for T36

The following will need to be added in Task 36:
1. Add plugin crates to Cargo.toml (shell, fs, dialog, clipboard-manager)
2. Add plugin initialization in lib.rs Builder chain
3. Register IPC commands for window management
4. Add system tray setup
5. Configure auto-update (if needed)

## Verification Checklist

- [x] tauri.conf.json updated with correct window settings
- [x] CSP configured for Monaco, WebSocket, inline styles
- [x] capabilities/default.json created with valid permissions
- [x] lib.rs implemented with Builder pattern
- [x] icons/ directory with 5 icon files (RGBA format)
- [x] Makefile updated with 3 new targets
- [x] Root Cargo.toml includes Tauri in workspace
- [x] Build test passes: cargo test -p ymir-app

All Task 35 requirements completed successfully!
