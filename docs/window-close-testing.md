# Window Close Testing Guide

This document explains how to test and ensure the window close functionality stays working.

## How It Works

The window close flow is:

1. User clicks X button
2. Tauri emits `WindowEvent::CloseRequested`
3. Frontend `onCloseRequested` handler fires (in `src/main.tsx`)
4. Handler calls `event.preventDefault()` to allow async cleanup
5. Handler invokes `kill_all_sessions` command to terminate PTY processes
6. Handler invokes `exit_app` command to exit the process
7. Backend calls `std::process::exit(0)`
8. Application terminates

## Running Tests

### Frontend Tests

```bash
# Run all tests
npm test

# Run window-close specific tests
npm run test:close

# Run tests in watch mode during development
npm run test:watch
```

### Rust Tests

```bash
cd src-tauri

# Run all Rust tests
cargo test

# Run tests with output visible
cargo test -- --nocapture
```

## Test Coverage

### What Tests Cover

The window-close tests verify:

1. `onCloseRequested` handler is registered
2. `preventDefault` is called on close request
3. `kill_all_sessions` is invoked during cleanup
4. `exit_app` is invoked after cleanup
5. Double cleanup is prevented
6. Errors during cleanup don't prevent exit

### What Tests Cannot Cover

Due to limitations in testing Tauri window behavior:

- Actual window closing (requires running Tauri app)
- `std::process::exit` behavior (would terminate test runner)
- OS-level window events

## Manual Testing Checklist

Before each release, manually verify:

- [ ] Open multiple tabs with active PTY sessions
- [ ] Click X button to close window
- [ ] Window closes completely (no ghost process)
- [ ] PTY processes are terminated (check `ps aux | grep -E "(bash|zsh|sh)"`)
- [ ] Clicking X multiple times quickly doesn't cause issues
- [ ] Closing with active notifications works
- [ ] Closing with unsaved work (if applicable) works

## Common Issues

### Window Doesn't Close

**Symptoms:** UI disappears but window stays open (empty white/black window)

**Cause:** `preventDefault()` was called but `exit_app` wasn't invoked or failed

**Fix:** Check that `exit_app` command is registered and called after cleanup

### PTY Processes Left Running

**Symptoms:** After closing app, PTY processes still exist

**Cause:** `kill_all_sessions` failed or wasn't called

**Fix:** Check that `kill_all_sessions` completes before `exit_app` is called

### Double Cleanup

**Symptoms:** Errors about "already cleaned up" or duplicate logs

**Fix:** The `isClosing` flag should prevent this. Check it's properly set.

## CI/CD

Tests run automatically on:

- Every pull request
- Every push to main/develop

The CI ensures:
- Frontend tests pass
- Rust tests pass
- Tauri app builds successfully
- Code formatting is correct

## Regression Prevention

To prevent regressions:

1. **Always run tests before committing:** `npm test`
2. **Add tests for new close-related features**
3. **Update this doc if changing close behavior**
4. **Test manually on all target platforms** (Linux, macOS, Windows)
