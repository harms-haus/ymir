# Manual QA Issues Report

**Date:** 2026-03-12
**Tester:** Sisyphus-Junior
**Environment:** Browser mode (Vite dev server)

## Summary

Performed manual QA testing on Ymir terminal emulator. Testing was done in browser mode (not Tauri mode), which limited some functionality.

## Test Results

### ✅ Working Features

1. **Create new workspace** - Works correctly
   - Clicking "+ New" button creates a new workspace
   - New workspace appears in sidebar with correct numbering
   - Workspace switching works

2. **Create multiple tabs** - Works correctly
   - "New tab" button creates new bash tabs
   - Multiple tabs appear in tab bar
   - Tab switching works

3. **Close tabs** - Works correctly
   - Close button (X) on tab removes the tab
   - When last tab is closed, pane becomes empty

4. **Sidebar navigation** - Works correctly
   - Workspace icons in sidebar are clickable
   - Git/source control panel opens when clicking git icon

### ⚠️ Issues Found

#### 1. Terminal Not Functional in Browser Mode
**Severity:** High (expected limitation)
**Description:** The terminal canvas is visible but non-functional in browser mode. Commands cannot be typed or executed.
**Expected:** Terminal should work with a mock PTY or show a message about Tauri requirement
**Actual:** Terminal appears as a dark canvas with no input/output
**Console Errors:** Multiple "Uncaught (in promise)" errors related to Tauri API calls

#### 2. CLI API Not Initialized
**Severity:** Medium
**Description:** The `window.ymir` CLI API is not available because `initCLI()` is never called.
**Location:** `src/cli/commands.ts` exports `initCLI()` but it's not imported/called in `main.tsx` or `App.tsx`
**Expected:** `window.ymir` should be available for programmatic control
**Actual:** `window.ymir` is undefined
**Fix:** Add `initCLI()` call in `main.tsx` or `App.tsx`

#### 3. Split Pane Keyboard Shortcuts Not Working
**Severity:** Medium
**Description:** Keyboard shortcuts for splitting panes (Ctrl+D, Ctrl+Shift+D) do not work.
**Expected:** Panes should split horizontally/vertically
**Actual:** No visible change when shortcuts are pressed
**Possible Cause:** May be related to browser mode limitations or focus issues

#### 4. DOM Nesting Warning
**Severity:** Low
**Description:** React warning about invalid DOM nesting
**Message:** `Warning: validateDOMNesting(...): <button> cannot appear as a descendant of <button>`
**Location:** TabBar component - buttons nested inside tabs
**File:** `src/components/ui/Tabs.tsx:64`

#### 5. Zustand Deprecation Warning
**Severity:** Low
**Description:** Zustand library deprecation warning
**Message:** `[DEPRECATED] Use createWithEqualityFn instead of create or use useStoreWithEqualityFn instead of useStore`
**Location:** State management setup
**Fix:** Update to use `createWithEqualityFn` from 'zustand/traditional'

#### 6. Theme Storage Errors
**Severity:** Low
**Description:** Failed to get stored theme from Tauri storage
**Message:** `Failed to get stored theme [object Object]`
**Cause:** Tauri storage API not available in browser mode

#### 7. Form Field Missing ID/Name
**Severity:** Low
**Description:** Accessibility issue with terminal input
**Message:** `A form field element should have an id or name attribute`
**Fix:** Add id/name attributes to terminal input textbox

### ❌ Not Tested (Requires Tauri)

1. **Run commands (ls, echo, cat)** - Requires Tauri backend for PTY
2. **Resize panes** - Requires split panes to be working
3. **Split panes horizontally/vertically** - Keyboard shortcuts not working
4. **Test notifications** - Requires Tauri backend for OSC protocol support

## Recommendations

1. **Initialize CLI API:** Call `initCLI()` in `main.tsx` or `App.tsx`
2. **Fix DOM nesting:** Restructure TabBar to avoid nested buttons
3. **Update Zustand:** Migrate to `createWithEqualityFn` to fix deprecation warning
4. **Add browser mode detection:** Show a message when running in browser mode explaining limited functionality
5. **Add form field attributes:** Add id/name to terminal input for accessibility

## Console Error Summary

```
[error] Failed to get stored theme [object Object] (2 occurrences)
[error] Uncaught (in promise) (multiple occurrences)
[error] Warning: validateDOMNesting(...): <button> cannot appear as a descendant of <button>
[warn] [DEPRECATED] Use `createWithEqualityFn` instead of `create`
[warn] Failed to get platform info from Tauri, using browser fallback
[issue] A form field element should have an id or name attribute
```
