# Ghostty-Web Migration Plan

## TL;DR

> **Objective**: Migrate Ymir's terminal from xterm.js to ghostty-web for better Unicode support, standards compliance, and performance.
>
> **Key Changes**:
> - Replace `@xterm/*` packages with `ghostty-web`
> - Add async WASM initialization
> - Remove SearchAddon (to be re-added later)
> - Replace WebLinksAddon with ghostty-web's UrlRegexProvider
>
> **Estimated Effort**: Medium (~4-6 hours)
> **Risk Level**: Low-Medium (API-compatible, but WASM loading adds complexity)
> **Rollback**: Git branch `feature/ghostty-web-migration`

---

## Context

### Current State
Ymir uses xterm.js via react-xtermjs wrapper:
- `@xterm/xterm@5.5.0` - Core terminal emulator
- `@xterm/addon-fit@0.10.0` - Auto-resize to container
- `@xterm/addon-web-links@0.11.0` - URL detection
- `@xterm/addon-search@0.15.0` - Search functionality
- `react-xtermjs@1.0.10` - React hook wrapper

### Target State
ghostty-web provides:
- **ghostty-web@^0.4.0** - WASM-compiled Ghostty terminal
- Built-in `FitAddon` (no separate package)
- `UrlRegexProvider` for link detection
- No SearchAddon (feature temporarily removed)

### Why Migrate?
1. **Better Unicode**: Proper grapheme handling for complex scripts (Arabic, Devanagari)
2. **Standards Compliance**: Full XTPUSHSGR/XTPOPSGR support, mode 2027
3. **Performance**: SIMD-optimized parser from Ghostty's Zig code
4. **Maintainability**: Single dependency (~400KB WASM) vs multiple xterm packages
5. **Future-proof**: Mitchell Hashimoto actively developing; will become lib-ghostty

---

## Work Objectives

### Core Objective
Migrate Terminal.tsx and all related components from xterm.js to ghostty-web while maintaining all existing functionality (except search, which is temporarily removed).

### Concrete Deliverables
1. Updated `package.json` with ghostty-web dependency
2. Refactored `src/components/Terminal.tsx` for ghostty-web API
3. Updated `src/theme/terminal.ts` for ghostty-web theme compatibility
4. Removed SearchAddon usage
5. Migrated WebLinksAddon to UrlRegexProvider
6. Added WASM initialization handling
7. Updated all Terminal tests

### Definition of Done
- [ ] Terminal component renders and functions correctly
- [ ] PTY integration works (spawn, write, resize, kill)
- [ ] Font size changes apply correctly
- [ ] Tab titles update from terminal OSC sequences
- [ ] Notifications still work (OSC 9/99/777)
- [ ] Links are clickable in terminal
- [ ] No console errors or warnings
- [ ] All existing tests pass (or are updated)

### Must Have
- Working terminal with PTY integration
- Proper error handling for WASM loading failures
- Theme integration with existing Ymir theme system
- Backward-compatible API for other components

### Must NOT Have (Guardrails)
- **NO breaking changes to PTY backend** (Rust code stays unchanged)
- **NO changes to workspace/tab state management**
- **NO custom ghostty-web builds** (use NPM package only)
- **NO search functionality** (explicitly excluded, to be added later)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest, React Testing Library, Playwright)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: Vitest with jsdom

### QA Policy
Every task includes agent-executed QA scenarios:
- **Frontend/UI**: Playwright for browser testing
- **Component**: React Testing Library + Vitest
- **Integration**: Manual verification via Tauri app

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Dependencies & Setup):
├── Task 1: Remove xterm packages from package.json
├── Task 2: Add ghostty-web dependency
├── Task 3: Create feature branch
└── Task 4: Update TypeScript types

Wave 2 (After Wave 1 - Core Implementation):
├── Task 5: Refactor Terminal.tsx for ghostty-web
├── Task 6: Update terminal theme compatibility
├── Task 7: Add WASM initialization to App.tsx
└── Task 8: Create ghostty-web wrapper hook

Wave 3 (After Wave 2 - Integration & Polish):
├── Task 9: Update Terminal tests
├── Task 10: Verify PTY integration
├── Task 11: Test theme switching
└── Task 12: Performance verification

Wave 4 (Final Verification):
├── Task 13: Full regression test
└── Task 14: Documentation update
```

### Dependency Matrix
- **1-4**: ─ ─ 5-8, 1
- **5**: 1, 2, 3, 4 ─ 9-12, 2
- **9**: 5 ─ 13, 3
- **13**: 9, 10, 11, 12 ─ 14, 4

---

## TODOs

- [x] **Task 1: Remove xterm packages from package.json**

**What to do**:
Remove these dependencies from package.json:
- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-web-links`
- `@xterm/addon-search`
- `react-xtermjs`

**Files to modify**:
- `package.json`

**Acceptance Criteria**:
- [ ] All xterm-related dependencies removed
- [ ] `npm install` completes without errors
- [ ] No import errors from removed packages

**QA Scenario**:
```
Scenario: Verify xterm packages removed
Tool: Bash
Preconditions: Clean git state
Steps:
  1. Run: grep -E "@xterm|react-xtermjs" package.json
Expected Result: No matches found
Evidence: .sisyphus/evidence/task-1-packages-removed.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- Reason: Simple package.json edit, minimal risk

**Commit**: YES
- Message: `chore(deps): remove xterm.js dependencies`
- Files: `package.json`
- Pre-commit: `npm install`

---

- [x] **Task 2: Add ghostty-web dependency**

**What to do**:
Add `ghostty-web` to dependencies in package.json:
```json
"ghostty-web": "^0.4.0"
```

**Files to modify**:
- `package.json`

**Acceptance Criteria**:
- [ ] ghostty-web added to dependencies
- [ ] `npm install` completes successfully
- [ ] ghostty-web present in node_modules
- [ ] Can import from ghostty-web in TypeScript

**QA Scenario**:
```
Scenario: Verify ghostty-web installed
Tool: Bash
Preconditions: Task 1 complete
Steps:
  1. Run: npm install
  2. Run: ls node_modules/ghostty-web
  3. Run: grep -q "ghostty-web" package.json && echo "Found"
Expected Result: Package exists in node_modules and package.json
Evidence: .sisyphus/evidence/task-2-ghostty-installed.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Commit**: YES
- Message: `chore(deps): add ghostty-web dependency`
- Files: `package.json`
- Pre-commit: `npm install`

---

- [x] **Task 3: Create feature branch**

**What to do**:
Create and switch to feature branch:
```bash
git checkout -b feature/ghostty-web-migration
```

**Acceptance Criteria**:
- [ ] Branch created from main
- [ ] On feature/ghostty-web-migration branch
- [ ] Clean working directory

**QA Scenario**:
```
Scenario: Verify feature branch
Tool: Bash
Steps:
  1. Run: git branch --show-current
Expected Result: Output is "feature/ghostty-web-migration"
Evidence: .sisyphus/evidence/task-3-branch-created.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`git-master`]

**Commit**: NO (this is the branch creation)

---

- [x] **Task 4: Update TypeScript types**

**What to do**:
Update or remove TypeScript types for xterm.js. Check for:
- Any `import type { ITerminalOptions, Terminal } from '@xterm/xterm'`
- Type references in other files

**Files to check/modify**:
- `src/components/Terminal.tsx`
- `src/theme/terminal.ts`
- Search for xterm type imports project-wide

**Acceptance Criteria**:
- [ ] No TypeScript errors from missing xterm types
- [ ] ghostty-web types recognized by TypeScript
- [ ] `npx tsc --noEmit` passes

**QA Scenario**:
```
Scenario: Verify TypeScript compilation
Tool: Bash
Steps:
  1. Run: npx tsc --noEmit
Expected Result: No errors
Evidence: .sisyphus/evidence/task-4-typescript-check.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Commit**: YES
- Message: `chore(types): remove xterm type references`
- Files: Any files with xterm type imports

---

- [x] **Task 5: Refactor Terminal.tsx for ghostty-web**

**What to do**:
Rewrite src/components/Terminal.tsx to use ghostty-web instead of react-xtermjs:

Key changes:
1. Replace imports:
```typescript
// OLD:
import { useXTerm } from 'react-xtermjs';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';

// NEW:
import { Terminal as GhosttyTerminal, FitAddon, UrlRegexProvider } from 'ghostty-web';
```

2. Replace useXTerm hook with direct ghostty-web usage:
```typescript
// OLD:
const { ref, instance } = useXTerm({ options, addons, listeners });

// NEW:
const containerRef = useRef<HTMLDivElement>(null);
const terminalRef = useRef<GhosttyTerminal | null>(null);
const fitAddonRef = useRef<FitAddon | null>(null);

useEffect(() => {
  if (!containerRef.current || terminalRef.current) return;
  
  const term = new GhosttyTerminal({
    fontSize,
    fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
    cursorBlink: true,
    theme: terminalTheme,
  });
  
  term.open(containerRef.current);
  
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  fitAddon.fit();
  
  terminalRef.current = term;
  fitAddonRef.current = fitAddon;
  
  return () => {
    term.dispose();
    terminalRef.current = null;
    fitAddonRef.current = null;
  };
}, []);
```

3. Update event handlers:
```typescript
// OLD:
const onData = useCallback((data: string) => {
  if (currentSessionIdRef.current) {
    invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
  }
}, []);

// NEW:
useEffect(() => {
  const term = terminalRef.current;
  if (!term) return;
  
  const disposable = term.onData((data: string) => {
    if (currentSessionIdRef.current) {
      invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
    }
  });
  
  return () => disposable.dispose();
}, []);
```

4. Update resize handling:
```typescript
// OLD:
useEffect(() => {
  if (!ref.current || !fitAddon || !instance) return;
  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit();
    } catch (error) {
      // Silently ignore fit errors
    }
  });
  resizeObserver.observe(ref.current);
  return () => resizeObserver.disconnect();
}, [fitAddon, ref, instance]);

// PTY resize:
useEffect(() => {
  if (!isReady || !currentSessionIdRef.current || !instance) return;
  const { cols, rows } = instance;
  invoke('resize_pty', { sessionId: currentSessionIdRef.current, cols, rows });
}, [isReady, instance]);

// NEW:
useEffect(() => {
  const container = containerRef.current;
  const fitAddon = fitAddonRef.current;
  const term = terminalRef.current;
  if (!container || !fitAddon || !term) return;
  
  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit();
      // Notify PTY of resize
      if (currentSessionIdRef.current && isReady) {
        const { cols, rows } = term;
        invoke('resize_pty', { 
          sessionId: currentSessionIdRef.current, 
          cols, 
          rows,
          correlationId: generateUUID(),
        });
      }
    } catch (error) {
      // Silently ignore fit errors
    }
  });
  
  resizeObserver.observe(container);
  return () => resizeObserver.disconnect();
}, [isReady]);
```

5. Update title change handling:
```typescript
// OLD:
useEffect(() => {
  if (!instance) return;
  const disposable = instance.onTitleChange((newTitle: string) => {
    if (newTitle && newTitle.trim()) {
      useWorkspaceStore.getState().updateTabTitle(paneId, tabId, newTitle.trim());
    }
  });
  return () => disposable.dispose();
}, [instance, paneId, tabId]);

// NEW:
useEffect(() => {
  const term = terminalRef.current;
  if (!term) return;
  
  const disposable = term.onTitleChange((newTitle: string) => {
    if (newTitle && newTitle.trim()) {
      useWorkspaceStore.getState().updateTabTitle(paneId, tabId, newTitle.trim());
    }
  });
  
  return () => disposable.dispose();
}, [paneId, tabId]);
```

6. Update output handling (from PTY):
```typescript
// OLD:
case 'output': {
  const outputData = (message.data as { data?: string })?.data ?? message.data;
  if (outputData !== undefined && outputData !== null) {
    const outputStr = typeof outputData === 'string' ? outputData : String(outputData);
    term.write(outputStr);
  }
  break;
}

// NEW: (same API)
case 'output': {
  const outputData = (message.data as { data?: string })?.data ?? message.data;
  if (outputData !== undefined && outputData !== null) {
    const outputStr = typeof outputData === 'string' ? outputData : String(outputData);
    term.write(outputStr);  // Same API
  }
  break;
}
```

**Files to modify**:
- `src/components/Terminal.tsx`

**Must NOT do**:
- Change PTY backend integration (invoke calls remain same)
- Change notification handling
- Change keyboard shortcuts
- Change error handling patterns

**Acceptance Criteria**:
- [ ] Terminal component compiles without TypeScript errors
- [ ] No references to useXTerm hook
- [ ] No references to react-xtermjs
- [ ] Uses ghostty-web's Terminal, FitAddon, UrlRegexProvider
- [ ] Event handlers use ghostty-web's event API
- [ ] Resize handling works correctly

**QA Scenarios**:
```
Scenario: Terminal renders and accepts input
Tool: Playwright
Preconditions: App running, WASM initialized
Steps:
  1. Navigate to app
  2. Wait for terminal container: [data-testid="terminal-container"]
  3. Type "echo hello" in terminal
  4. Press Enter
  5. Wait for text "hello" to appear in terminal
Expected Result: Text "hello" visible in terminal output
Evidence: .sisyphus/evidence/task-5-terminal-renders.png

Scenario: PTY integration works
Tool: Playwright
Preconditions: Terminal rendered
Steps:
  1. Type "pwd" in terminal
  2. Press Enter
  3. Wait for path output
Expected Result: Current working directory path displayed
Evidence: .sisyphus/evidence/task-5-pty-works.png

Scenario: Resize works correctly
Tool: Playwright
Preconditions: Terminal rendered
Steps:
  1. Note current terminal dimensions
  2. Resize browser window to larger size
  3. Wait 500ms
  4. Check terminal filled new space
Expected Result: Terminal resizes to fill container
Evidence: .sisyphus/evidence/task-5-resize-works.png
```

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: [`frontend-ui-ux`]
- Reason: Complex refactoring with many moving parts, requires careful testing

**Commit**: YES
- Message: `refactor(terminal): migrate to ghostty-web`
- Files: `src/components/Terminal.tsx`
- Pre-commit: `npx tsc --noEmit`

---

- [x] **Task 6: Update terminal theme compatibility**

**What to do**:
Check and update src/theme/terminal.ts to ensure theme object is compatible with ghostty-web's theme format.

ghostty-web theme format (from context7):
```typescript
interface ITheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  // ... and more
}
```

Compare with current terminalTheme and adjust if needed.

**Files to check/modify**:
- `src/theme/terminal.ts`

**Acceptance Criteria**:
- [ ] Theme colors apply correctly to terminal
- [ ] Background, foreground, cursor colors match design

**QA Scenario**:
```
Scenario: Theme colors apply correctly
Tool: Playwright
Preconditions: Terminal rendered
Steps:
  1. Take screenshot of terminal
  2. Verify background color matches theme
Expected Result: Terminal background is var(--background-hex)
Evidence: .sisyphus/evidence/task-6-theme-applied.png
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`frontend-ui-ux`]

**Commit**: YES
- Message: `fix(theme): update terminal theme for ghostty-web compatibility`
- Files: `src/theme/terminal.ts`

---

- [x] **Task 7: Add WASM initialization to App.tsx**

**What to do**:
Add ghostty-web's `init()` call to initialize WASM before any Terminal components are rendered.

Pattern:
```typescript
import { init as initGhostty } from 'ghostty-web';

function App() {
  const [ghosttyReady, setGhosttyReady] = useState(false);
  const [ghosttyError, setGhosttyError] = useState<Error | null>(null);

  useEffect(() => {
    initGhostty()
      .then(() => setGhosttyReady(true))
      .catch((err) => {
        logger.error('Failed to initialize ghostty-web WASM', { error: err });
        setGhosttyError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  if (ghosttyError) {
    return <div>Error loading terminal: {ghosttyError.message}</div>;
  }

  if (!ghosttyReady) {
    return <div>Loading terminal...</div>;
  }

  return <Layout />;
}
```

**Files to modify**:
- `src/App.tsx`

**Acceptance Criteria**:
- [ ] init() called before Terminal components
- [ ] Loading state shown while WASM loads
- [ ] Error state shown if WASM fails to load
- [ ] App only renders fully after WASM ready

**QA Scenarios**:
```
Scenario: WASM loads successfully
Tool: Playwright
Preconditions: Clean browser cache
Steps:
  1. Navigate to app
  2. Wait for "Loading terminal..." or similar
  3. Wait for app to fully load
  4. Check console for WASM load messages
Expected Result: App loads without WASM errors
Evidence: .sisyphus/evidence/task-7-wasm-loads.png

Scenario: WASM handles gracefully on error
Tool: Playwright + Browser devtools (block ghostty-vt.wasm)
Preconditions: App loaded once (cached)
Steps:
  1. Open DevTools Network tab
  2. Block ghostty-vt.wasm
  3. Reload page
Expected Result: Error message shown, no uncaught exceptions
Evidence: .sisyphus/evidence/task-7-wasm-error.png
```

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`frontend-ui-ux`]
- Reason: Error handling and async initialization requires careful implementation

**Commit**: YES
- Message: `feat(app): add ghostty-web WASM initialization`
- Files: `src/App.tsx`

---

- [ ] **Task 8: Create ghostty-web wrapper hook (Optional)**

**What to do**:
Create a custom hook to simplify ghostty-web terminal usage (similar to useXTerm).

File: `src/hooks/useGhostty.ts`
```typescript
import { useEffect, useRef, useCallback } from 'react';
import { Terminal, FitAddon } from 'ghostty-web';

interface UseGhosttyOptions {
  fontSize: number;
  onData?: (data: string) => void;
  onTitleChange?: (title: string) => void;
}

export function useGhostty(options: UseGhosttyOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const term = new Terminal({
      fontSize: options.fontSize,
      cursorBlink: true,
    });

    term.open(containerRef.current);

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    if (options.onData) {
      term.onData(options.onData);
    }

    if (options.onTitleChange) {
      term.onTitleChange(options.onTitleChange);
    }

    return () => {
      term.dispose();
    };
  }, []);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    terminalRef.current?.resize(cols, rows);
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return {
    ref: containerRef,
    terminal: terminalRef.current,
    write,
    resize,
    fit,
    cols: terminalRef.current?.cols,
    rows: terminalRef.current?.rows,
  };
}
```

**Files to create**:
- `src/hooks/useGhostty.ts` (optional)

**Acceptance Criteria**:
- [ ] Hook created (if doing this task)
- [ ] Hook can be used to create terminal
- [ ] Hook handles cleanup on unmount

**QA Scenario**:
```
Scenario: Hook creates terminal correctly
Tool: Vitest
Steps:
  1. Import useGhostty hook
  2. Render component using hook
  3. Check terminal ref is populated
Expected Result: Hook returns container ref and terminal instance
Evidence: .sisyphus/evidence/task-8-hook-works.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Commit**: YES (if implementing)
- Message: `feat(hooks): add useGhostty hook for terminal management`
- Files: `src/hooks/useGhostty.ts`

---

- [ ] **Task 9: Update Terminal tests**

**What to do**:
Update all Terminal component tests in `src/components/__tests__/Terminal.test.tsx`:

1. Replace xterm mock with ghostty-web mock
2. Update test assertions for ghostty-web API
3. Add tests for WASM initialization
4. Remove SearchAddon tests

**Files to modify**:
- `src/components/__tests__/Terminal.test.tsx`

**Acceptance Criteria**:
- [ ] All existing tests pass
- [ ] Tests updated for ghostty-web API
- [ ] Mock properly simulates ghostty-web behavior
- [ ] No references to xterm or react-xtermjs

**QA Scenario**:
```
Scenario: Terminal tests pass
Tool: Bash
Steps:
  1. Run: npm test -- Terminal.test.tsx
Expected Result: All tests pass
Evidence: .sisyphus/evidence/task-9-tests-pass.txt
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Commit**: YES
- Message: `test(terminal): update tests for ghostty-web`
- Files: `src/components/__tests__/Terminal.test.tsx`
- Pre-commit: `npm test -- Terminal.test.tsx`

---

- [ ] **Task 10: Verify PTY integration**

**What to do**:
Test that PTY commands still work correctly:
- spawn_pty
- write_pty
- resize_pty
- kill_pty
- is_pty_alive
- attach_pty_channel

**Files to test**:
- Integration between Terminal.tsx and Tauri backend

**Acceptance Criteria**:
- [ ] New tabs spawn shells correctly
- [ ] Commands execute and output displays
- [ ] Resize events propagate to PTY
- [ ] Process exit handled correctly

**QA Scenarios**:
```
Scenario: Spawn new PTY session
Tool: Playwright + Tauri
Preconditions: App running
Steps:
  1. Click "New Tab" button
  2. Wait for terminal to appear
  3. Type "echo test"
  4. Press Enter
  5. Verify "test" appears in output
Expected Result: PTY spawned, command executed, output displayed
Evidence: .sisyphus/evidence/task-10-spawn-works.png

Scenario: PTY resize propagates
Tool: Playwright + Tauri
Preconditions: Terminal open
Steps:
  1. Resize pane (drag splitter)
  2. Type "stty size"
  3. Press Enter
  4. Verify rows/cols match new size
Expected Result: stty size reflects new terminal dimensions
Evidence: .sisyphus/evidence/task-10-resize-works.png
```

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Commit**: NO (verification task)

---

- [ ] **Task 11: Test theme switching**

**What to do**:
Verify theme changes apply correctly to ghostty-web terminal.

**Acceptance Criteria**:
- [ ] Theme changes reflect in terminal colors
- [ ] Background, foreground, cursor update

**QA Scenario**:
```
Scenario: Theme changes apply
Tool: Playwright
Preconditions: Terminal open
Steps:
  1. Note current terminal colors
  2. Change theme (if theme switcher exists)
  3. Verify colors updated
Expected Result: Terminal colors match new theme
Evidence: .sisyphus/evidence/task-11-theme-switches.png
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Commit**: NO (verification task)

---

- [ ] **Task 12: Performance verification**

**What to do**:
Compare performance metrics before/after migration:
- Bundle size
- Initial load time
- Terminal responsiveness

**Acceptance Criteria**:
- [ ] Bundle size acceptable (~400KB increase from WASM is expected)
- [ ] Load time within acceptable range
- [ ] No noticeable lag in typing/scrolling

**QA Scenario**:
```
Scenario: Performance acceptable
Tool: Playwright + DevTools
Steps:
  1. Open DevTools Performance tab
  2. Reload page
  3. Measure time to interactive
  4. Type rapidly in terminal
  5. Measure input latency
Expected Result: < 200ms time to interactive, < 16ms input latency
Evidence: .sisyphus/evidence/task-12-performance.json
```

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Commit**: NO (verification task)

---

- [ ] **Task 13: Full regression test**

**What to do**:
Run complete test suite and manual verification:

1. `npm test` - all unit tests
2. `npx tsc --noEmit` - TypeScript check
3. Manual testing:
   - Create workspace
   - Create tabs
   - Split panes
   - Type commands
   - Resize panes
   - Close tabs/panes
   - Notifications

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Manual testing reveals no critical bugs
- [ ] All core features work

**QA Scenario**:
```
Scenario: Full regression test
Tool: Bash + Playwright
Steps:
  1. Run: npm test
  2. Run: npx tsc --noEmit
  3. Manual: Test all core workflows
Expected Result: All pass, no critical issues
Evidence: .sisyphus/evidence/task-13-regression.txt
```

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Commit**: NO (verification task)

---

- [ ] **Task 14: Documentation update**

**What to do**:
Update documentation to reflect:
- ghostty-web usage
- Removed search feature (temporarily)
- New WASM initialization pattern

**Files to update**:
- `README.md` (if terminal usage documented)
- Any docs mentioning xterm.js
- `AGENTS.md` or similar

**Acceptance Criteria**:
- [ ] Documentation mentions ghostty-web
- [ ] No references to xterm packages
- [ ] Search feature marked as "temporarily disabled"

**QA Scenario**:
```
Scenario: Documentation updated
Tool: Bash
Steps:
  1. Run: grep -r "@xterm" README.md docs/
  2. Run: grep -r "ghostty-web" README.md docs/
Expected Result: No @xterm references, ghostty-web mentioned
Evidence: .sisyphus/evidence/task-14-docs-updated.txt
```

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: []

**Commit**: YES
- Message: `docs: update for ghostty-web migration`
- Files: `README.md`, `docs/`

---

## Final Verification Wave

- [ ] **F1: Plan Compliance Audit** - `oracle`
Read plan end-to-end. Verify:
- All "Must Have" items implemented
- No "Must NOT Have" violations
- All tasks completed

- [ ] **F2: Code Quality Review** - `unspecified-high`
- Run `npx tsc --noEmit` (no errors)
- Run `npm test` (all pass)
- Check for console.log in production code
- Check for unused imports

- [ ] **F3: Real Manual QA** - `unspecified-high`
Start from clean state. Execute:
1. Create new workspace
2. Open terminal
3. Run commands (ls, echo, cat)
4. Resize panes
5. Create multiple tabs
6. Split panes horizontally and vertically
7. Test notifications
8. Close all tabs/panes

- [ ] **F4: Scope Fidelity Check** - `deep`
Verify:
- Only Terminal component changed (not PTY backend)
- Search feature removed (not broken)
- No feature creep

---

## Commit Strategy

**Group commits by logical change:**

1. `chore(deps): remove xterm.js dependencies`
2. `chore(deps): add ghostty-web dependency`
3. `chore(types): remove xterm type references`
4. `refactor(terminal): migrate to ghostty-web`
5. `fix(theme): update terminal theme for ghostty-web compatibility`
6. `feat(app): add ghostty-web WASM initialization`
7. `feat(hooks): add useGhostty hook for terminal management` (optional)
8. `test(terminal): update tests for ghostty-web`
9. `docs: update for ghostty-web migration`

**Final merge commit:**
`feat(terminal): migrate to ghostty-web for better Unicode and standards support`

---

## Success Criteria

### Verification Commands

```bash
# TypeScript compilation
npx tsc --noEmit

# Unit tests
npm test

# Build verification
npm run build

# Bundle size check
ls -lh dist/assets/*.wasm
du -sh node_modules/ghostty-web
```

### Final Checklist

- [ ] All xterm packages removed from package.json
- [ ] ghostty-web installed and imports work
- [ ] Terminal component uses ghostty-web API
- [ ] WASM initialization added to App.tsx
- [ ] PTY integration still works
- [ ] Theme colors apply correctly
- [ ] Resize handling works
- [ ] Tab titles update correctly
- [ ] Notifications still work
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] Feature branch ready for merge

### Known Limitations

1. **Search functionality temporarily removed** - Will be re-added when ghostty-web adds SearchAddon support
2. **Link detection** - Using UrlRegexProvider instead of WebLinksAddon (slightly different behavior)
3. **Bundle size** - ~400KB WASM file increases bundle size

---

## Rollback Plan

If critical issues discovered:

1. **Immediate**: Stay on feature branch, fix issues
2. **If unfixable**: Abandon feature branch, delete it
3. **Restore**: Main branch still has working xterm.js version
4. **Document**: Note reasons for rollback in issue/PR

---

## Notes

### Key API Differences Summary

| Feature | xterm.js | ghostty-web |
|---------|----------|-------------|
| Initialization | Synchronous | `await init()` |
| Import | `from '@xterm/xterm'` | `from 'ghostty-web'` |
| React Hook | `useXTerm()` | Manual useEffect |
| Event Handling | `onData: handler` in options | `term.onData(handler)` |
| Addon Loading | `new FitAddon()` then `term.loadAddon()` | Same |
| Search | `SearchAddon` | ❌ Not available |
| Links | `WebLinksAddon` | `UrlRegexProvider` |

### Resources

- ghostty-web docs: https://github.com/coder/ghostty-web
- ghostty-web NPM: https://www.npmjs.com/package/ghostty-web
- Ghostty: https://github.com/ghostty-org/ghostty
- Migration guide: https://zread.ai/coder/ghostty-web/4-migrating-from-xterm-js

---

Plan saved to: `.sisyphus/plans/ghostty-web-migration.md`

To begin execution, run: `/start-work ghostty-web-migration`
