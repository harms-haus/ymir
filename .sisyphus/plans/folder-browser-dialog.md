# Folder Browser Dialog Implementation

## TL;DR
> **Quick Summary**: Replace the `window.prompt()` in WorkspaceSettingsDialog with a proper folder picker that uses Tauri's native dialog in desktop and the File System Access API in web (Chrome/Edge). Unsupported browsers (Firefox/Safari) will show a disabled browse button.
>
> **Deliverables**:
> - `useDirectoryPicker` hook (Tauri + Web support)
> - Updated `WorkspaceSettingsDialog.tsx` (replaces prompt)
> - Tauri dialog plugin configuration
> - Unit tests for the hook
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - Sequential dependencies
> **Critical Path**: Install plugin → Create hook → Update dialog → Add tests → Configure permissions

---

## Context

### Original Request
Implement a folder browser dialog for the workspace settings that works in both Tauri (desktop) and web environments, replacing the current `window.prompt()` implementation.

### Interview Summary
**Key Discussions**:
1. **No truncation needed** in Tauri - display full path
2. **Disable browse button** in unsupported browsers (Firefox/Safari)
3. **No mobile support** required
4. **Vite** (not Next.js) - no SSR/hydration concerns
5. **English only** - hardcoded strings

### Current Implementation
**File**: `src/components/WorkspaceSettingsDialog.tsx:171-185`
```typescript
const handleDirectorySelect = useCallback(async () => {
  const selected = window.prompt(
    'Enter working directory path:',
    settings?.workingDirectory || ''
  );
  if (selected !== null && selected !== settings?.workingDirectory) {
    setSaving(true);
    try {
      await updateSettings({ workingDirectory: selected });
    } finally {
      setSaving(false);
    }
  }
}, [settings?.workingDirectory, updateSettings]);
```

### Technical Architecture
- **Frontend**: React 18 + TypeScript + Vite
- **Desktop**: Tauri v2 with existing plugins (shell, store, notification)
- **Web**: Chrome/Edge 86+ (File System Access API)
- **Environment Detection**: `window.__TAURI_INTERNALS__` check

---

## Work Objectives

### Core Objective
Create a cross-platform folder picker hook that abstracts Tauri's native dialog and the Web File System Access API, with graceful degradation for unsupported browsers.

### Concrete Deliverables
1. `src/hooks/useDirectoryPicker.ts` - Unified folder picker hook
2. Updated `src/components/WorkspaceSettingsDialog.tsx` - Uses new hook
3. `ymir-tauri/tauri.conf.json` - Add dialog permissions
4. `ymir-tauri/Cargo.toml` - Add tauri-plugin-dialog dependency
5. `src/hooks/useDirectoryPicker.test.ts` - Unit tests

### Definition of Done
- [ ] `bun run tsc --noEmit` passes with 0 errors
- [ ] `bun test useDirectoryPicker` passes with >80% coverage
- [ ] `bun test WorkspaceSettingsDialog` passes with no regressions
- [ ] Browse button opens native folder picker in Tauri
- [ ] Browse button opens directory picker in Chrome/Edge
- [ ] Browse button is disabled with tooltip in Firefox/Safari
- [ ] Full path displayed in Tauri, folder name in web

### Must Have
- Tauri native folder dialog support
- Web File System Access API support (Chrome/Edge)
- Graceful degradation for unsupported browsers
- Unit tests for both environments
- TypeScript strict mode compliance

### Must NOT Have (Guardrails)
- File reading/writing operations
- Directory listing functionality
- Persistence (localStorage, tauri-store)
- Drag-and-drop folder selection
- Custom folder browser UI
- Truncation logic (Tauri shows full path)
- Mobile browser support

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: Vitest with React Testing Library

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves
```
Wave 1 (Foundation):
├── Task 1: Install Tauri dialog plugin dependencies
└── Task 2: Add Rust dialog plugin and permissions

Wave 2 (Core Implementation):
├── Task 3: Create useDirectoryPicker hook
└── Task 4: Update WorkspaceSettingsDialog component

Wave 3 (Testing & Polish):
├── Task 5: Write unit tests for hook
└── Task 6: Add accessibility attributes and error handling

Wave 4 (Verification):
├── Task 7: Run TypeScript check
├── Task 8: Run all tests
└── Task 9: Integration verification (Tauri + Web)

Wave FINAL (Code Review):
├── Task F1: Code quality review
└── Task F2: Final verification

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 7 → Task 8 → Task 9 → F1-F2
Parallel Speedup: Limited (sequential dependencies)
Max Concurrent: 2 (Waves 1 & 2 can partially overlap)
```

### Dependency Matrix
| Task | Dependencies | Blocks |
|------|--------------|--------|
| 1 | - | 2 |
| 2 | 1 | 3 |
| 3 | 2 | 4 |
| 4 | 3 | 5, 7, 8 |
| 5 | 4 | 8 |
| 6 | 4 | 7, 8 |
| 7 | 4, 6 | 8 |
| 8 | 5, 7 | 9 |
| 9 | 8 | F1-F2 |

---

## TODOs

- [x] 1. Install Tauri Dialog Plugin Dependencies

**What to do**:
- Install `@tauri-apps/plugin-dialog` npm package
- Add `tauri-plugin-dialog` to `ymir-tauri/Cargo.toml` dependencies
- Run `bun install` to update lockfile

**Must NOT do**:
- Install any additional unrelated packages
- Modify frontend code yet
- Change existing plugin configurations

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`git-master`]
  - `git-master`: For managing dependency changes

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 1
- **Blocks**: Task 2
- **Blocked By**: None

**References**:
- `package.json:19-38` - Existing dependencies structure
- `ymir-tauri/Cargo.toml:16-24` - Rust dependencies section
- Context7: `/tauri-apps/tauri-docs` - Dialog plugin setup

**Acceptance Criteria**:
- [ ] `@tauri-apps/plugin-dialog` in `package.json` dependencies
- [ ] `tauri-plugin-dialog = "2"` in `ymir-tauri/Cargo.toml`
- [ ] `bun.lockb` updated
- [ ] No TypeScript errors introduced

**QA Scenarios**:
```
Scenario: Dependencies installed correctly
Tool: Bash
Preconditions: Clean working directory
Steps:
  1. Run: cat package.json | grep "@tauri-apps/plugin-dialog"
  2. Run: cat ymir-tauri/Cargo.toml | grep "tauri-plugin-dialog"
Expected Result: Both commands show the dependency
Failure Indicators: Dependency not found
Evidence: .sisyphus/evidence/task-1-deps-installed.txt
```

**Commit**: YES
- Message: `chore(deps): add tauri dialog plugin`
- Files: `package.json`, `ymir-tauri/Cargo.toml`, `bun.lockb`
- Pre-commit: `bun install`

---

- [x] 2. Add Tauri Dialog Plugin Initialization and Permissions

**What to do**:
- Add `.plugin(tauri_plugin_dialog::init())` to `ymir-tauri/src/app.rs`
- Add `tauri-plugin-dialog` to imports in `ymir-tauri/src/app.rs`
- Add `"dialog:allow-open"` permission to `ymir-tauri/tauri.conf.json` capabilities

**Must NOT do**:
- Modify any other Tauri plugins
- Change window configuration
- Add filesystem permissions

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 1
- **Blocks**: Task 3
- **Blocked By**: Task 1

**References**:
- `ymir-tauri/src/app.rs:1-50` - Plugin initialization pattern
- `ymir-tauri/tauri.conf.json:30-41` - Permissions configuration
- Context7: `/tauri-apps/tauri-docs` - Capability-based permissions in v2

**Acceptance Criteria**:
- [ ] `tauri_plugin_dialog::init()` in app builder chain
- [ ] `"dialog:allow-open"` in capabilities
- [ ] Rust compiles: `cargo check -p ymir-tauri` passes

**QA Scenarios**:
```
Scenario: Rust compiles with dialog plugin
Tool: Bash
Preconditions: Task 1 complete
Steps:
  1. Run: cd ymir-tauri && cargo check
  2. Verify: No compilation errors
Expected Result: Clean compilation
Failure Indicators: "dialog plugin not found" or permission errors
Evidence: .sisyphus/evidence/task-2-rust-compile.txt
```

**Commit**: YES
- Message: `feat(tauri): initialize dialog plugin with permissions`
- Files: `ymir-tauri/src/app.rs`, `ymir-tauri/tauri.conf.json`
- Pre-commit: `cargo check -p ymir-tauri`

---

- [x] 3. Create useDirectoryPicker Hook

**What to do**:
- Create `src/hooks/useDirectoryPicker.ts`
- Export hook that detects Tauri vs Web environment
- Tauri: Use `@tauri-apps/plugin-dialog` `open({ directory: true })`
- Web: Use `window.showDirectoryPicker()` with feature detection
- Return `{ selectDirectory, isSupported, isSelecting }`
- Handle AbortError (user cancel) silently
- Handle SecurityError (permission denied) with console.warn

**Must NOT do**:
- Implement file reading/writing
- Add truncation logic (show full path in Tauri)
- Support Firefox/Safari (disable instead)
- Add persistence
- Use `any` types

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 4
- **Blocked By**: Task 2

**References**:
- `src/hooks/usePlatformDetection.ts:17-120` - Environment detection pattern
- `src/App.tsx:14` - `__TAURI_INTERNALS__` detection
- Context7: `/tauri-apps/tauri-docs` - Dialog API: `open({ directory: true })`
- MDN: `showDirectoryPicker()` API

**Acceptance Criteria**:
- [ ] Hook file created at `src/hooks/useDirectoryPicker.ts`
- [ ] TypeScript interfaces defined: `UseDirectoryPickerReturn`
- [ ] Tauri path: returns `{ path: string }`
- [ ] Web path: returns `{ name: string, handle: FileSystemDirectoryHandle }`
- [ ] Feature detection: `'showDirectoryPicker' in window`
- [ ] `isSupported` boolean for unsupported browsers
- [ ] Debounce rapid clicks (set isSelecting)

**QA Scenarios**:
```
Scenario: Hook exports correct interface
Tool: Bash
Preconditions: File created
Steps:
  1. Run: cat src/hooks/useDirectoryPicker.ts
  2. Verify: Contains 'export function useDirectoryPicker'
  3. Verify: Contains 'isSupported'
  4. Verify: Contains 'selectDirectory'
Expected Result: Hook interface complete
Evidence: .sisyphus/evidence/task-3-hook-interface.txt

Scenario: Tauri detection works
Tool: Bash
Steps:
  1. Read file content
  2. Verify: Contains '__TAURI_INTERNALS__' check
  3. Verify: Contains "import { open } from '@tauri-apps/plugin-dialog'"
Expected Result: Tauri detection and imports present
Evidence: .sisyphus/evidence/task-3-tauri-code.txt
```

**Commit**: YES
- Message: `feat(hooks): add useDirectoryPicker for cross-platform folder selection`
- Files: `src/hooks/useDirectoryPicker.ts`
- Pre-commit: `bun run tsc --noEmit`

---

- [ ] 4. Update WorkspaceSettingsDialog Component

**What to do**:
- Import `useDirectoryPicker` hook
- Replace `handleDirectorySelect` function
- Use hook's `selectDirectory` function
- Update display: show `path` (Tauri) or `name` (Web)
- Disable browse button when `!isSupported`
- Add `title` attribute for disabled state tooltip
- Keep existing `updateSettings` call pattern

**Must NOT do**:
- Change UI layout or styling
- Modify other settings (color, icon, subtitle)
- Add new dependencies
- Change the dialog structure

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2
- **Blocks**: Task 5, 6, 7
- **Blocked By**: Task 3

**References**:
- `src/components/WorkspaceSettingsDialog.tsx:171-185` - Current handleDirectorySelect
- `src/components/WorkspaceSettingsDialog.tsx:276-292` - Browse button UI
- `src/hooks/useDirectoryPicker.ts` - New hook (Task 3)

**Acceptance Criteria**:
- [ ] `useDirectoryPicker` imported and called
- [ ] Old `handleDirectorySelect` prompt code removed
- [ ] New handler calls `selectDirectory()`
- [ ] Button disabled state: `disabled={saving || !isSupported || isSelecting}`
- [ ] Display shows `result?.path` (Tauri) or `result?.name` (Web)
- [ ] `window.prompt` completely removed

**QA Scenarios**:
```
Scenario: Component uses new hook
Tool: Bash
Steps:
  1. Run: grep "useDirectoryPicker" src/components/WorkspaceSettingsDialog.tsx
  2. Run: grep "window.prompt" src/components/WorkspaceSettingsDialog.tsx
Expected Result: Hook imported, prompt not found
Failure Indicators: window.prompt still present
Evidence: .sisyphus/evidence/task-4-component-updated.txt

Scenario: Button has correct disabled states
Tool: Bash
Steps:
  1. Read: src/components/WorkspaceSettingsDialog.tsx
  2. Verify: disabled prop includes isSupported
  3. Verify: disabled prop includes isSelecting
Expected Result: Button properly disabled for unsupported/loading
Evidence: .sisyphus/evidence/task-4-button-states.txt
```

**Commit**: YES
- Message: `refactor(settings): replace prompt with useDirectoryPicker in workspace dialog`
- Files: `src/components/WorkspaceSettingsDialog.tsx`
- Pre-commit: `bun run tsc --noEmit`

---

- [ ] 5. Write Unit Tests for useDirectoryPicker Hook

**What to do**:
- Create `src/hooks/useDirectoryPicker.test.ts`
- Test Tauri environment: mock `@tauri-apps/plugin-dialog`
- Test Web environment: mock `window.showDirectoryPicker`
- Test unsupported browser: verify `isSupported: false`
- Test user cancellation: verify graceful handling
- Test permission denied: verify error handling
- Test rapid clicks: verify debouncing

**Must NOT do**:
- Skip testing any code paths
- Use `any` types in tests
- Mock internal implementation details

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3
- **Blocks**: Task 8
- **Blocked By**: Task 4

**References**:
- `src/hooks/useWorkspaceSettings.test.ts` - Existing hook test pattern
- `src/hooks/useGit.test.ts` - Another hook test example
- Vitest + React Testing Library documentation

**Acceptance Criteria**:
- [ ] Test file created at `src/hooks/useDirectoryPicker.test.ts`
- [ ] Tests cover Tauri path
- [ ] Tests cover Web path (Chrome/Edge)
- [ ] Tests cover unsupported browser
- [ ] Tests cover user cancellation
- [ ] Tests cover permission denied
- [ ] Coverage >80% for hook

**QA Scenarios**:
```
Scenario: Tests pass
Tool: Bash
Steps:
  1. Run: bun test useDirectoryPicker
  2. Verify: "Test Files 1 passed"
  3. Verify: Coverage >80%
Expected Result: All tests pass
Failure Indicators: Test failures or low coverage
Evidence: .sisyphus/evidence/task-5-tests-pass.txt
```

**Commit**: YES
- Message: `test(hooks): add unit tests for useDirectoryPicker`
- Files: `src/hooks/useDirectoryPicker.test.ts`
- Pre-commit: `bun test useDirectoryPicker`

---

- [ ] 6. Add Accessibility and Error Handling Polish

**What to do**:
- Add `aria-label` to browse button
- Add `aria-describedby` linking to error message
- Add visual tooltip for disabled state (unsupported browser)
- Ensure keyboard navigation works
- Add error boundary for unexpected errors

**Must NOT do**:
- Change styling significantly
- Add new UI components
- Modify other parts of the dialog

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3
- **Blocks**: Task 7
- **Blocked By**: Task 4

**References**:
- WCAG 2.1 guidelines for form inputs
- Existing button patterns in `src/components/ui/Button.tsx`

**Acceptance Criteria**:
- [ ] Browse button has `aria-label="Select working directory"`
- [ ] Disabled state has `title="Folder selection requires Chrome or Edge browser"`
- [ ] Keyboard navigation works (Tab to focus, Enter to activate)

**QA Scenarios**:
```
Scenario: Accessibility attributes present
Tool: Bash
Steps:
  1. Run: grep -n "aria-label" src/components/WorkspaceSettingsDialog.tsx
  2. Run: grep -n "title=" src/components/WorkspaceSettingsDialog.tsx
Expected Result: Both attributes found
Evidence: .sisyphus/evidence/task-6-a11y.txt
```

**Commit**: YES (grouped with Task 4 or separate)
- Message: `a11y(settings): add accessibility attributes to folder picker`
- Files: `src/components/WorkspaceSettingsDialog.tsx`

---

- [ ] 7. Run TypeScript Compilation Check

**What to do**:
- Run `bun run tsc --noEmit`
- Fix any type errors
- Ensure no `any` types introduced

**Must NOT do**:
- Skip errors with `@ts-ignore`
- Use `as any` casting

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4
- **Blocks**: Task 8
- **Blocked By**: Task 4, 6

**Acceptance Criteria**:
- [ ] `bun run tsc --noEmit` exits 0
- [ ] No TypeScript errors

**QA Scenarios**:
```
Scenario: TypeScript check passes
Tool: Bash
Steps:
  1. Run: bun run tsc --noEmit
  2. Verify: Exit code 0
Expected Result: Clean TypeScript
Evidence: .sisyphus/evidence/task-7-tsc.txt
```

**Commit**: NO (verification only)

---

- [ ] 8. Run All Tests

**What to do**:
- Run `bun test` (all tests)
- Verify no regressions in existing tests
- Verify new tests pass

**Must NOT do**:
- Skip failing tests
- Modify test expectations without fixing code

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4
- **Blocks**: Task 9
- **Blocked By**: Task 5, 7

**Acceptance Criteria**:
- [ ] All existing tests pass
- [ ] New tests pass
- [ ] No test regressions

**QA Scenarios**:
```
Scenario: All tests pass
Tool: Bash
Steps:
  1. Run: bun test
  2. Verify: "Tests  XX passed"
  3. Verify: No failures
Expected Result: All green
Evidence: .sisyphus/evidence/task-8-all-tests.txt
```

**Commit**: NO (verification only)

---

- [ ] 9. Integration Verification

**What to do**:
- Verify Tauri build works: `cargo build -p ymir-tauri`
- Verify web dev works: `bun run dev`
- Manual check: Browse button in WorkspaceSettingsDialog

**Must NOT do**:
- Skip Tauri build verification
- Skip web verification

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 4
- **Blocks**: F1, F2
- **Blocked By**: Task 8

**Acceptance Criteria**:
- [ ] `cargo build -p ymir-tauri` succeeds
- [ ] `bun run dev` starts without errors
- [ ] Browse button visible in WorkspaceSettingsDialog

**QA Scenarios**:
```
Scenario: Tauri builds successfully
Tool: Bash
Steps:
  1. Run: cargo build -p ymir-tauri 2>&1 | tail -20
  2. Verify: "Finished dev" or "Compiling" with no errors
Expected Result: Successful build
Evidence: .sisyphus/evidence/task-9-tauri-build.txt
```

**Commit**: NO (verification only)

---

## Final Verification Wave

- [ ] F1. Code Quality Review

**What to do**:
- Run `bun run lint` (if available) or `eslint src/hooks/useDirectoryPicker.ts`
- Check for unused imports
- Verify code follows existing patterns
- Review TypeScript strictness

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Acceptance Criteria**:
- [ ] No lint errors
- [ ] No unused imports
- [ ] Follows existing hook patterns

---

- [ ] F2. Final Scope Verification

**What to do**:
- Verify `window.prompt` is completely removed
- Verify no file operations added
- Verify no persistence added
- Verify no custom UI created

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []

**Acceptance Criteria**:
- [ ] `grep -r "window.prompt" src/` returns nothing
- [ ] No file read/write APIs used
- [ ] No localStorage/tauri-store usage

---

## Commit Strategy

### Commit Sequence
1. Task 1: `chore(deps): add tauri dialog plugin`
2. Task 2: `feat(tauri): initialize dialog plugin with permissions`
3. Task 3: `feat(hooks): add useDirectoryPicker for cross-platform folder selection`
4. Task 4: `refactor(settings): replace prompt with useDirectoryPicker in workspace dialog`
5. Task 5: `test(hooks): add unit tests for useDirectoryPicker`
6. Task 6: `a11y(settings): add accessibility attributes to folder picker` (or grouped with Task 4)

---

## Success Criteria

### Verification Commands
```bash
# TypeScript check
bun run tsc --noEmit
# Expected: exit code 0

# Unit tests
bun test useDirectoryPicker --coverage
# Expected: >80% coverage, all pass

# All tests
bun test
# Expected: all pass, no regressions

# Tauri build
cargo build -p ymir-tauri
# Expected: successful build

# Lint (if available)
bun run lint
# Expected: no errors
```

### Final Checklist
- [ ] All "Must Have" present: hook, dialog integration, tests, permissions
- [ ] All "Must NOT Have" absent: no file ops, no persistence, no custom UI
- [ ] Tauri: native folder picker opens
- [ ] Web (Chrome/Edge): directory picker opens
- [ ] Web (Firefox/Safari): button disabled
- [ ] Full path displayed in Tauri
- [ ] Folder name displayed in web
- [ ] All tests pass with >80% coverage

