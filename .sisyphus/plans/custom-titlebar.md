# Custom Title Bar with Window Controls for Ymir

## TL;DR

> **Quick Summary**: Remove native Tauri title bar and integrate custom window controls (minimize, maximize, close) directly into the tab bars. Support cross-platform window control button positions (left on macOS, right on Windows/Linux) with dynamic layout swapping mechanism using `flex-direction` toggle.
> 
> **Deliverables**:
> - Rust command for platform + window manager detection
> - Tauri configuration with `decorations: false`
> - Window controls component integrated into tab bars
> - Dynamic layout swapping (sidebar position) based on button location
> - Window dragging functionality on tab bar backgrounds
> - Cross-platform E2E tests
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Platform detection → tauri-controls setup → Layout integration → E2E tests

---

## Context

### Original Request
Remove the native title bar from the Tauri app. Replace it with custom window controls integrated into the tab bars. The sidebar and work area must shift positions based on which side the window decoration buttons are placed. Support GTK, KDE, macOS (always left), and Windows (always right).

### Interview Summary
**Key Discussions**:
- **Window controls approach**: Use `tauri-controls` community plugin for native-looking buttons
- **Platform detection**: BOTH backend Rust AND frontend TypeScript for robust detection
- **Layout swapping**: Toggle `flex-direction` between `row` and `row-reverse` based on button position
- **Button position**: Always present on appropriate side, tab area resized to fit remaining space
- **Tab bar drag**: Entire tab bar background is draggable, tabs take click precedence

**Research Findings**:
- Tauri `decorations: false` removes native title bar
- `data-tauri-drag-region` attribute enables window dragging
- `getCurrentWindow()` API for minimize/maximize/close operations
- Platform detection via `navigator.platform` in JavaScript
- `tauri-controls` provides native-looking window control buttons
- Linux WM detection requires platform-specific code or D-Bus

### Metis Review
**Identified Gaps** (addressed):
- **Tauri version compatibility**: Must verify tauri-controls supports current version
- **Wayland limitation**: Document if drag region doesn't work
- **Tab overflow behavior**: Define min-width for tab area
- **Accessibility**: Maintain keyboard shortcuts, screen reader support
- **Edge cases**: High DPI, multi-monitor, maximized state, RTL support

**Guardrails Set**:
- MUST NOT break existing tab functionality (dragging, closing, reordering)
- MUST NOT add new title bar features beyond window controls
- MUST test on all three target platforms before merge
- MUST maintain existing keyboard shortcuts

---

## Work Objectives

### Core Objective
Integrate custom window controls into the tab bar system with cross-platform button position detection and dynamic layout swapping.

### Concrete Deliverables
- `src-tauri/src/platform.rs` - Platform detection command (Rust)
- `src/components/WindowControls.tsx` - Window controls component
- `src/hooks/usePlatformDetection.ts` - Platform detection hook (TypeScript)
- `src/components/Layout.tsx` - Modified with flex-direction toggle
- `src/components/TabBar.tsx` - Modified with drag functionality and window controls integration
- `src-tauri/tauri.conf.json` - Updated with `decorations: false` and permissions
- `src-tauri/capabilities/default.json` - Updated with window control permissions

### Definition of Done
- [ ] Window controls visible on correct side (left macOS, right Windows/Linux)
- [ ] Tab bar background is draggable, window moves on drag
- [ ] Window controls respond to minimize, maximize, close clicks
- [ ] Layout swaps correctly (sidebar moves past work area when buttons on left)
- [ ] Existing tab functionality preserved (close, create, switch, overflow)
- [ ] All existing tests pass
- [ ] Platform detection returns correct values

### Must Have
- Window controls integrated into tab bars
- Cross-platform button position detection (macOS/Windows/Linux)
- Dynamic layout swapping based on button position
- Window dragging on tab bar background
- Preserve all existing keyboard shortcuts

### Must NOT Have (Guardrails)
- No custom resize handles (use Tauri's built-in)
- No additional title bar features (search, menus)
- No modification of tab closing/creating logic
- No changes to window state persistence logic
- No breaking changes to existing tab functionality

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (package.json has test scripts, Tauri dev environment)
- **Automated tests**: TDD
- **Framework**: bun test (existing), Playwright for E2E
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **TUI/CLI**: Use interactive_bash (tmux) — Run command, send keystrokes, validate output
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun/node REPL) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.
> Target: 5-8 tasks per wave. Fewer than 3 per wave (except final) = under-splitting.

```
Wave 1 (Start Immediately — foundation + research):
├── Task 1: Verify tauri-controls compatibility [quick]
├── Task 2: Analyze existing tab bar and layout components [quick]
├── Task 3: Create Rust platform detection command [deep]
├── Task 4: Install and configure tauri-controls plugin [quick]
└── Task 4b: Install and configure Playwright for E2E testing [quick]

Wave 2 (After Wave 1 — core implementation):
├── Task 5: Create WindowControls React component [unspecified-low]
├── Task 6: Create platform detection TypeScript hook [quick]
└── Task 7: Modify TabBar component for drag functionality [unspecified-low]

Wave 3 (After Wave 2 — integration):
├── Task 8: Modify Layout component for button position [unspecified-low]
└── Task 9: Update tauri.conf.json and capabilities [quick]

Wave 4 (After Wave 3 — testing):
├── Task 10: Write platform detection tests [deep]
├── Task 11: Write window control E2E tests [deep]
└── Task 12: Write drag region tests [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 3 → Task 5 → Task 8 → Task 11 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 4 (Waves 1 & 2)
```

### Dependency Matrix (abbreviated — show ALL tasks in your generated plan)

- **1, 2, 4b**: — — 4, 5, 6, 7, 11, 12
- **3**: — — 8, 10
- **4**: 1, 4b — 5, 7, 9
- **5**: 1, 4 — 8
- **6**: 1 — 8
- **7**: 1, 4 — 8
- **8**: 3, 5, 6, 7 — 9, 10, 11, 12
- **9**: 4, 8 — 10, 11, 12
- **10**: 3, 8, 9 — F1-F4
- **11**: 8, 9 — F1-F4
- **12**: 8, 9 — F1-F4

> This is abbreviated for reference. YOUR generated plan must include the FULL matrix for ALL tasks.

### Agent Dispatch Summary

- **1**: **5** — T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `quick`, T4b → `quick`
- **2**: **3** — T5 → `unspecified-low`, T6 → `quick`, T7 → `unspecified-low`
- **3**: **2** — T8 → `unspecified-low`, T9 → `quick`
- **4**: **3** — T10 → `deep`, T11 → `deep`, T12 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

  **Commit**: NO
  ---

- [ ] 1. Verify tauri-controls Compatibility

  **What to do**:
  - Check tauri-controls GitHub repository (https://github.com/agmmnn/tauri-controls)
  - Verify supported Tauri version matches current project version
  - Check last commit date and open issues for stability
  - Review tauri-controls documentation for API usage
  - Verify npm package name and version for frontend integration
  - Document compatibility status (go/no-go decision)

  **Must NOT do**:
  - Do not install or modify any files yet — research only
  - Do not assume compatibility without checking actual repository

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: Read-only research task — checking external plugin compatibility
  - **Skills**: []
    - No specific skills needed — this is web research and documentation
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — plugin research, not UI design

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 4, 5, 7 (plugin installation and component creation depend on compatibility)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src-tauri/Cargo.toml` — Current Tauri version (line ~10-15, look for `tauri` dependency)
  - `package.json` — Current npm dependencies format

  **API/Type References** (contracts to implement against):
  - tauri-controls API documentation — for correct usage patterns

  **Test References** (testing patterns to follow):
  - None — research task only

  **External References** (libraries and frameworks):
  - tauri-controls GitHub: https://github.com/agmmnn/tauri-controls
  - tauri-controls crates.io: https://crates.io/crates/tauri-controls
  - tauri-controls npm: https://www.npmjs.com/package/tauri-controls

  **WHY Each Reference Matters** (explain the relevance):
  - Cargo.toml: Shows current Tauri version — tauri-controls must support this version
  - tauri-controls GitHub: Primary source for compatibility info, last update, issues
  - package.json: Shows npm format — need correct package name for installation

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - N/A — research task, no automated tests

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Verify tauri-controls supports current Tauri version
    Tool: Read (Cargo.toml) + Web fetch (GitHub)
    Preconditions: src-tauri/Cargo.toml exists
    Steps:
      1. Read src-tauri/Cargo.toml and extract current Tauri version
      2. Fetch tauri-controls GitHub README or crates.io page
      3. Compare supported Tauri version with project version
      4. Document: compatible (yes/no), version mismatch details if any
    Expected Result: Compatibility confirmed with documented evidence
    Failure Indicators: Version mismatch, plugin abandoned, no documentation
    Evidence: .sisyphus/evidence/task-1-compatibility-check.md

  Scenario: Check tauri-controls stability (last commit, open issues)
    Tool: Web fetch (GitHub)
    Preconditions: None
    Steps:
      1. Fetch tauri-controls GitHub repository
      2. Check last commit date (should be within last 6 months)
      3. Count open issues (should be manageable, <20)
      4. Document stability assessment
    Expected Result: Plugin is actively maintained and stable
    Failure Indicators: Abandoned (last commit >1 year), many open issues
    Evidence: .sisyphus/evidence/task-1-stability-check.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-1-compatibility-check.md (Tauri version compatibility analysis)
  - [ ] Evidence file: task-1-stability-check.md (plugin stability assessment)

  **Commit**: NO
  ---

- [ ] 2. Analyze Existing Tab Bar and Layout Components

  **What to do**:
  - Read Layout.tsx and document current flex structure, dimensions, and positioning
  - Read TabBar.tsx and document current implementation, width constraints, button areas
  - Read TabBar.css and document styling patterns, dimensions, color variables
  - Identify modification points for window controls integration
  - Document the current flex container setup and how sidebar/content are positioned

  **Must NOT do**:
  - Do not modify any files — this is analysis only
  - Do not make assumptions without reading the actual code

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: Read-only analysis of existing code structure
  - **Skills**: []
    - No specific skills needed — this is code reading and documentation
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — analyzing existing code, not designing UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 7, 8 (all implementation tasks depend on this analysis)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/components/Layout.tsx` — Root layout with flex structure (read to understand current positioning)
  - `src/components/TabBar.tsx` — Tab bar implementation (read to understand current tabs and buttons)
  - `src/components/ResizableSidebar.tsx` — Sidebar with resize functionality
  - `src/components/Pane.tsx` — Individual pane with TabBar integration

  **API/Type References** (contracts to implement against):
  - `src/state/types.ts` — Type definitions for workspace/pane/tab hierarchy

  **Test References** (testing patterns to follow):
  - `src/components/__tests__/TabBar.test.tsx` — Existing tab bar tests
  - `src/components/__tests__/Layout.test.tsx` or similar — Existing layout tests (if exist)

  **External References** (libraries and frameworks):
  - react-resizable-panels: Used in SplitPane — understand how panels work

  **WHY Each Reference Matters** (explain the relevance):
  - Layout.tsx: Shows current flex container structure and how sidebar/content are positioned — critical for understanding how to add flex-direction toggle
  - TabBar.tsx: Shows current tab implementation — need to understand where window controls can be integrated
  - TabBar.css: Shows styling patterns and dimensions — need to match existing design
  - Pane.tsx: Shows how TabBar is integrated into panes — need to understand wrapper structure

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - N/A — analysis task, no automated tests

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Document Layout.tsx flex structure
    Tool: Read
    Preconditions: src/components/Layout.tsx exists
    Steps:
      1. Read src/components/Layout.tsx
      2. Identify the root flex container and its children
      3. Document: flex-direction, sidebar position, content area structure
    Expected Result: Documented flex structure with sidebar on left, content on right
    Failure Indicators: Layout.tsx not found, structure doesn't match expected pattern
    Evidence: .sisyphus/evidence/task-2-layout-analysis.md

  Scenario: Document TabBar.tsx structure and CSS dimensions
    Tool: Read
    Preconditions: src/components/TabBar.tsx and src/components/TabBar.css exist
    Steps:
      1. Read src/components/TabBar.tsx and identify tab rendering, button areas
      2. Read src/components/TabBar.css and extract: height, padding, colors
      3. Document where window controls could be integrated (left side or right side of tab bar)
    Expected Result: Documented tab bar structure with identified integration points
    Failure Indicators: TabBar files not found, structure unclear
    Evidence: .sisyphus/evidence/task-2-tabbar-analysis.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-2-layout-analysis.md (Layout flex structure documentation)
  - [ ] Evidence file: task-2-tabbar-analysis.md (TabBar structure and integration points)

  **Commit**: NO
  ---

- [ ] 3. Create Rust Platform Detection Command

  **What to do**:
  - Create `src-tauri/src/platform.rs` with `get_platform_info()` command
  - Return platform string: 'macOS', 'windows', 'linux'
  - For Linux, also detect window manager type: 'gnome', 'kde', 'xfce', 'unknown'
  - Add command to tauri::generate_handler! in lib.rs
  - Write unit tests for platform detection on current platform
  - Add cargo test to verify command works

  **Must NOT do**:
  - Do not use D-Bus for WM detection — use simpler platform-specific heuristics
  - Do not make the command async unless necessary

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `deep`
    - Reason: Requires understanding Tauri command patterns, Rust platform APIs, and Linux WM detection
  - **Skills**: []
    - No specific skills needed — this is backend Rust work
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — backend command only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 8, 10 (layout integration and platform detection tests)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src-tauri/src/commands.rs` — Existing Tauri command patterns (read to understand how commands are structured)
  - `src-tauri/src/lib.rs` — Command registration in generate_handler! (line 36-60)
  - `src-tauri/src/git.rs` — Example of platform-specific code if present

  **API/Type References** (contracts to implement against):
  - Tauri command return types — must be serializable (serde)
  - Frontend will call via `invoke('get_platform_info')` from @tauri-apps/api/core

  **Test References** (testing patterns to follow):
  - `src-tauri/src/commands.rs` tests — if any existing tests for commands

  **External References** (libraries and frameworks):
  - std::env::consts::OS — Rust standard library for OS detection
  - std::env::consts::ARCH — For architecture detection if needed

  **WHY Each Reference Matters** (explain the relevance):
  - commands.rs: Shows existing command patterns — new command should follow same structure
  - lib.rs: Shows command registration — must add new command to generate_handler!
  - Tauri invoke: Frontend will call this command — return type must match expectations

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Test file created: src-tauri/src/platform.rs with tests
  - [ ] cargo test --lib platform -- --nocapture → PASS (all tests)

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Platform detection returns valid platform string
    Tool: Bash (cargo test)
    Preconditions: src-tauri/src/platform.rs exists with tests
    Steps:
      1. cd src-tauri && cargo test --lib platform -- --nocapture
      2. Verify test output shows PASS
      3. Verify platform string is one of: 'macOS', 'windows', 'linux'
    Expected Result: All tests pass, platform string is valid
    Failure Indicators: Test failure, empty or invalid platform string
    Evidence: .sisyphus/evidence/task-3-platform-test.txt

  Scenario: Platform detection returns correct value for current OS
    Tool: Bash (cargo run or invoke)
    Preconditions: Tauri app can be run, command is registered
    Steps:
      1. Run the platform detection command (via cargo test or invoke)
      2. Verify returned platform matches actual OS
    Expected Result: Platform string matches current operating system
    Failure Indicators: Platform string doesn't match actual OS
    Evidence: .sisyphus/evidence/task-3-platform-output.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-3-platform-test.txt (cargo test output)
  - [ ] Evidence file: task-3-platform-output.txt (command output showing platform)

  **Commit**: YES
  - Message: `feat(window): add platform detection command`
  - Files: `src-tauri/src/platform.rs`, `src-tauri/src/lib.rs`
  - Pre-commit: `cargo test --lib`

  ---

- [ ] 4. Install and Configure tauri-controls Plugin

  **What to do**:
  - Add tauri-controls dependency to src-tauri/Cargo.toml
  - Add tauri-controls npm package to package.json
  - Configure tauri.conf.json: set `decorations: false` for main window
  - Update capabilities/default.json with window control permissions:
    - core:window:allow-start-dragging
    - core:window:allow-minimize
    - core:window:allow-maximize
    - core:window:allow-close
  - Verify cargo build succeeds
  - Verify npm run dev starts without errors

  **Must NOT do**:
  - Do not modify any UI components yet — just set up the plugin
  - Do not remove existing window configuration beyond decorations

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: Configuration task — adding dependencies and updating config files
  - **Skills**: []
    - No specific skills needed — this is dependency management and config updates
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — config changes only, no UI work yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 7, 8 (implementation tasks depend on plugin being available)
  - **Blocked By**: Task 1 (must verify compatibility before installing)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src-tauri/Cargo.toml` — Existing dependency format and Tauri version
  - `src-tauri/tauri.conf.json` — Current window configuration (lines 13-23)
  - `package.json` — npm dependencies format

  **API/Type References** (contracts to implement against):
  - tauri-controls documentation — for correct dependency names and versions

  **Test References** (testing patterns to follow):
  - None — this is config setup

  **External References** (libraries and frameworks):
  - tauri-controls crates.io page — for correct crate name and version
  - tauri-controls npm page — for correct package name and version

  **WHY Each Reference Matters** (explain the relevance):
  - Cargo.toml: Shows current Tauri version and dependency format — must add tauri-controls with compatible version
  - tauri.conf.json: Shows current window config — must add `decorations: false` and permissions
  - package.json: Shows npm dependencies — must add tauri-controls npm package

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - N/A — config task

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Cargo build succeeds with tauri-controls dependency
    Tool: Bash (cargo build)
    Preconditions: src-tauri/Cargo.toml has tauri-controls added
    Steps:
      1. cd src-tauri && cargo build
      2. Wait for build to complete
      3. Verify no compilation errors
    Expected Result: Build succeeds without errors
    Failure Indicators: Compilation error, dependency resolution failure
    Evidence: .sisyphus/evidence/task-4-cargo-build.txt

  Scenario: tauri.conf.json has decorations disabled and permissions added
    Tool: Read (tauri.conf.json)
    Preconditions: File modified
    Steps:
      1. Read src-tauri/tauri.conf.json
      2. Verify "decorations": false in windows array
      3. Read capabilities/default.json
      4. Verify window permissions are listed
    Expected Result: decorations is false, permissions include window control APIs
    Failure Indicators: decorations not set, permissions missing
    Evidence: .sisyphus/evidence/task-4-config-check.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-4-cargo-build.txt (build output)
  - [ ] Evidence file: task-4-config-check.md (config verification)

  **Commit**: YES
  - Message: `chore: add tauri-controls dependency and configure decorations`
  - Files: `src-tauri/Cargo.toml`, `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
  - Pre-commit: `cargo build`

---

- [ ] 4b. Install and Configure Playwright for E2E Testing

  **What to do**:
  - Install Playwright as a dev dependency: `npm install -D @playwright/test`
  - Initialize Playwright configuration: `npx playwright install --with-deps`
  - Create `playwright.config.ts` in project root
  - Create `playwright/tests/` directory for test files
  - Configure Playwright for Tauri app testing (port, baseURL)
  - Add `npm run test:e2e` script to package.json

  **Must NOT do**:
  - Do not write actual E2E tests yet — just setup infrastructure
  - Do not modify existing test configuration (bun test)

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: Infrastructure setup — npm install and config files
  - **Skills**: [`playwright`]
    - `playwright`: Required for proper Playwright setup and configuration
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — config only, no UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 11, 12 (E2E tests depend on Playwright being installed)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `package.json` — npm dependencies format, existing test scripts
  - `vitest.config.ts` or similar — existing test config patterns if present

  **API/Type References** (contracts to implement against):
  - Playwright configuration API: `defineConfig`, test directories, browsers

  **Test References** (testing patterns to follow):
  - `src/components/__tests__/` — Existing unit test patterns (for reference, not E2E)

  **External References** (libraries and frameworks):
  - Playwright documentation: https://playwright.dev/docs/test-configuration
  - Tauri + Playwright: https://tauri.app/v1/guides/testing/playwright

  **WHY Each Reference Matters** (explain the relevance):
  - package.json: Shows npm scripts format — need to add test:e2e script
  - Playwright docs: Official setup guide for correct configuration
  - Tauri + Playwright: Specific instructions for testing Tauri apps with Playwright

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Playwright installed: `node_modules/@playwright/test` exists
  - [ ] Config file created: `playwright.config.ts`
  - [ ] Test directory exists: `playwright/tests/`
  - [ ] `npx playwright --version` returns version

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Playwright is installed and configured
    Tool: Bash (npm, npx)
    Preconditions: package.json exists
    Steps:
      1. Run npm list @playwright/test
      2. Verify package is installed
      3. Run npx playwright --version
      4. Verify version is displayed
      5. Check playwright.config.ts exists
    Expected Result: Playwright installed and version command works
    Failure Indicators: Package not found, version command fails, no config
    Evidence: .sisyphus/evidence/task-4b-playwright-install.txt

  Scenario: Playwright test command runs (even with no tests)
    Tool: Bash (npx playwright test)
    Preconditions: playwright.config.ts exists, playwright/tests/ exists
    Steps:
      1. Create empty test file: playwright/tests/smoke.spec.ts
      2. Run npx playwright test --list
      3. Verify Playwright can discover test files
    Expected Result: Playwright test runner works correctly
    Failure Indicators: Test runner crashes, cannot find config, no browsers
    Evidence: .sisyphus/evidence/task-4b-playwright-test.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-4b-playwright-install.txt (installation output)
  - [ ] Evidence file: task-4b-playwright-test.txt (test runner output)

  **Commit**: YES
  - Message: `chore: install and configure Playwright for E2E testing`
  - Files: `package.json`, `playwright.config.ts`, `playwright/tests/`
  - Pre-commit: `npx playwright --version`

  ---

- [ ] 5. Create WindowControls React Component

  **What to do**:
  - Create `src/components/WindowControls.tsx`
  - Import window controls from tauri-controls plugin
  - Accept props: `position: 'left' | 'right'` and `platform: string`
  - Render minimize, maximize, close buttons from tauri-controls
  - Style component to match existing TabBar design (colors, height, borders)
  - Add CSS file `src/components/WindowControls.css` with matching styles
  - Ensure component is draggable (data-tauri-drag-region on container)

  **Must NOT do**:
  - Do not implement custom window control logic — use tauri-controls
  - Do not change existing tab functionality

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `unspecified-low`
    - Reason: Component creation following existing patterns
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Need to match existing UI patterns and styling
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — component creation only, testing in later tasks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 8 (layout integration depends on this component)
  - **Blocked By**: Tasks 1, 4 (need plugin installed and compatibility verified)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/components/TabBar.tsx` — Tab bar structure and button styling (match height, colors, border)
  - `src/components/ui/Button.tsx` — Button component patterns
  - `src/components/TabBar.css` — Styling patterns (background colors, border styles)

  **API/Type References** (contracts to implement against):
  - tauri-controls API — for window control buttons
  - Tauri window API — `getCurrentWindow()` for minimize/maximize/close

  **Test References** (testing patterns to follow):
  - `src/components/__tests__/TabBar.test.tsx` — Component testing patterns

  **External References** (libraries and frameworks):
  - tauri-controls documentation — for component API

  **WHY Each Reference Matters** (explain the relevance):
  - TabBar.tsx: Shows current tab bar styling — WindowControls must match height (35px) and colors
  - TabBar.css: Shows styling patterns — WindowControls should use same CSS variables
  - tauri-controls: Provides the actual window control buttons — must use correctly

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Component file created: src/components/WindowControls.tsx
  - [ ] Component renders without errors when imported

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: WindowControls component renders with correct position prop
    Tool: Bash (bun test or React rendering)
    Preconditions: src/components/WindowControls.tsx exists
    Steps:
      1. Create a test that renders WindowControls with position='left'
      2. Verify component renders without errors
      3. Verify buttons are present (minimize, maximize, close)
    Expected Result: Component renders successfully with correct button layout
    Failure Indicators: Rendering errors, missing buttons, wrong position
    Evidence: .sisyphus/evidence/task-5-component-render.txt

  Scenario: WindowControls styles match TabBar design
    Tool: Read (CSS files)
    Preconditions: src/components/WindowControls.css exists
    Steps:
      1. Read src/components/WindowControls.css
      2. Read src/components/TabBar.css
      3. Compare: height should be 35px, background colors should match
    Expected Result: Styles are consistent with existing TabBar design
    Failure Indicators: Height mismatch, color mismatch, border inconsistencies
    Evidence: .sisyphus/evidence/task-5-style-comparison.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-5-component-render.txt (component rendering output)
  - [ ] Evidence file: task-5-style-comparison.md (style comparison analysis)

  **Commit**: YES
  - Message: `feat(ui): add WindowControls component`
  - Files: `src/components/WindowControls.tsx`, `src/components/WindowControls.css`
  - Pre-commit: `npx tsc --noEmit`

  ---

- [ ] 6. Create Platform Detection TypeScript Hook

  **What to do**:
  - Create `src/hooks/usePlatformDetection.ts`
  - Use `navigator.platform` for initial platform detection
  - Call Rust command `get_platform_info()` via `invoke` from @tauri-apps/api/core
  - Return: `{ platform: string, windowManager?: string, buttonPosition: 'left' | 'right' }`
  - Determine button position from platform + window manager
  - Cache result to avoid repeated calls
  - Handle errors gracefully (fallback to TypeScript-only detection)

  **Must NOT do**:
  - Do not detect button position programmatically on Linux — use heuristics
  - Do not make the hook async beyond the Rust invoke call

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: TypeScript hook following existing hook patterns
  - **Skills**: []
    - No specific skills needed — this is standard React hook
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — hook logic only, no UI styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 8 (layout integration needs platform info)
  - **Blocked By**: Task 3 (Rust command must exist)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/hooks/useKeyboardShortcuts.ts` — Existing hook patterns (read to understand hook structure)
  - `src/hooks/useDebouncedResize.ts` — Another hook example if present

  **API/Type References** (contracts to implement against):
  - Rust command return type from Task 3: `{ platform: string, window_manager?: string }`
  - navigator.platform values: 'MacIntel', 'Win32', 'Linux'

  **Test References** (testing patterns to follow):
  - `src/hooks/useKeyboardShortcuts.test.ts` — Hook testing patterns

  **External References** (libraries and frameworks):
  - @tauri-apps/api/core `invoke` — for calling Rust commands

  **WHY Each Reference Matters** (explain the relevance):
  - useKeyboardShortcuts.ts: Shows hook patterns — new hook should follow same structure
  - Rust command return type: Hook must match the data structure returned by Rust
  - invoke API: Hook needs to call Rust command — must use correct import and syntax

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Hook file created: src/hooks/usePlatformDetection.ts
  - [ ] Hook returns expected object structure

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Platform detection hook returns correct button position for macOS
    Tool: Read (hook implementation)
    Preconditions: src/hooks/usePlatformDetection.ts exists
    Steps:
      1. Read the hook implementation
      2. Verify: when platform='macOS', buttonPosition='left'
      3. Verify: when platform='windows', buttonPosition='right'
      4. Verify: when platform='linux', buttonPosition='right' (default)
    Expected Result: Button position logic is correct for each platform
    Failure Indicators: Wrong position for platform, missing platform handling
    Evidence: .sisyphus/evidence/task-6-hook-logic.md

  Scenario: Hook handles Rust invoke failure gracefully
    Tool: Read (hook implementation)
    Preconditions: src/hooks/usePlatformDetection.ts exists
    Steps:
      1. Read the hook implementation
      2. Verify: try/catch around invoke call
      3. Verify: fallback to navigator.platform if invoke fails
    Expected Result: Hook doesn't crash on Rust command failure
    Failure Indicators: No error handling, missing fallback, crash on failure
    Evidence: .sisyphus/evidence/task-6-error-handling.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-6-hook-logic.md (button position logic analysis)
  - [ ] Evidence file: task-6-error-handling.md (error handling verification)

  **Commit**: YES
  - Message: `feat(window): add platform detection TypeScript hook`
  - Files: `src/hooks/usePlatformDetection.ts`
  - Pre-commit: `npx tsc --noEmit`

  ---

- [ ] 7. Modify TabBar Component for Drag Functionality

  **What to do**:
  - Modify `src/components/TabBar.tsx` to add window dragging
  - Add `data-tauri-drag-region` attribute to tab bar scroll container or background
  - Ensure tab click events take precedence over drag (stop propagation)
  - Handle double-click on drag region for maximize toggle
  - Import and conditionally render WindowControls component based on button position
  - Accept new props from parent: `windowControlsPosition: 'left' | 'right'`
  - If position is 'left', render WindowControls before tabs; if 'right', render after tabs

  **Must NOT do**:
  - Do not change tab creation, closing, or switching logic
  - Do not modify tab overflow dropdown behavior

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `unspecified-low`
    - Reason: Modifying existing component to add drag and window controls
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Need to understand tab bar structure and add drag correctly
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — component modification, E2E tests in later tasks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8 (layout integration needs updated TabBar)
  - **Blocked By**: Tasks 4, 5 (need plugin and component)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/components/TabBar.tsx` — Current implementation (lines 1-319)
  - `src/components/TabBar.css` — Current styling (lines 1-336)

  **API/Type References** (contracts to implement against):
  - Tauri drag API: `data-tauri-drag-region` attribute
  - Tauri window API: `getCurrentWindow().startDragging()`, `toggleMaximize()`

  **Test References** (testing patterns to follow):
  - `src/components/__tests__/TabBar.test.tsx` — Existing tab bar tests

  **External References** (libraries and frameworks):
  - Tauri documentation on drag regions

  **WHY Each Reference Matters** (explain the relevance):
  - TabBar.tsx: Current implementation — need to understand where to add drag and window controls
  - TabBar.css: Current styling — may need to add styles for drag region
  - Tauri drag: `data-tauri-drag-region` is the standard way to enable window dragging

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] TabBar component still renders correctly
  - [ ] WindowControls render when position prop is provided
  - [ ] Existing tab bar tests still pass

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: TabBar renders WindowControls on left side when position='left'
    Tool: Read (component code)
    Preconditions: src/components/TabBar.tsx modified
    Steps:
      1. Read TabBar.tsx
      2. Verify: WindowControls component is imported
      3. Verify: When position='left', WindowControls renders before tabs list
      4. Verify: When position='right', WindowControls renders after tabs list
    Expected Result: WindowControls renders on correct side based on position
    Failure Indicators: Wrong rendering order, missing import, no conditional
    Evidence: .sisyphus/evidence/task-7-window-controls-render.md

  Scenario: TabBar has data-tauri-drag-region attribute
    Tool: Read (component code)
    Preconditions: src/components/TabBar.tsx modified
    Steps:
      1. Read TabBar.tsx
      2. Verify: data-tauri-drag-region attribute is on scroll container or background
      3. Verify: Tab click handlers have stopPropagation or equivalent
    Expected Result: Drag region exists and tab clicks take precedence
    Failure Indicators: Missing drag attribute, no click precedence handling
    Evidence: .sisyphus/evidence/task-7-drag-region.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-7-window-controls-render.md (rendering logic analysis)
  - [ ] Evidence file: task-7-drag-region.md (drag region verification)

  **Commit**: YES
  - Message: `feat(ui): add drag functionality and window controls to TabBar`
  - Files: `src/components/TabBar.tsx`, `src/components/TabBar.css`
  - Pre-commit: `npx tsc --noEmit && bun test src/components/__tests__/TabBar.test.tsx`

  ---

- [ ] 8. Modify Layout Component for Button Position

  **What to do**:
  - Modify `src/components/Layout.tsx` to integrate platform detection
  - Import and call `usePlatformDetection` hook
  - Add CSS class to root flex container based on button position:
    - When button position is 'left': add class `layout-reversed` (flex-direction: row-reverse)
    - When button position is 'right': default layout (flex-direction: row)
  - Pass `windowControlsPosition` prop to ResizableSidebar and SplitPane/TabBar
  - Ensure sidebar and work area shift correctly when layout reverses
  - Test that sidebar moves past work area when buttons are on left

  **Must NOT do**:
  - Do not change the overall flex container structure beyond direction
  - Do not modify sidebar collapse behavior

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `unspecified-low`
    - Reason: Modifying Layout component to add conditional styling
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Need to understand flex layout and how to swap positions
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — layout changes, E2E tests in later tasks

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (depends on Tasks 5, 6, 7)
  - **Blocks**: Tasks 9, 10, 11, 12 (all testing depends on layout working)
  - **Blocked By**: Tasks 5, 6, 7 (WindowControls, hook, and TabBar must exist)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/components/Layout.tsx` — Current implementation (lines 1-84)
  - `src/styles/theme.css` — CSS variables for styling

  **API/Type References** (contracts to implement against):
  - usePlatformDetection hook return type: `{ platform, windowManager, buttonPosition }`
  - CSS flex-direction: 'row' vs 'row-reverse'

  **Test References** (testing patterns to follow):
  - Existing layout tests if any

  **External References** (libraries and frameworks):
  - React hooks: conditional class application based on hook return value

  **WHY Each Reference Matters** (explain the relevance):
  - Layout.tsx: Current implementation — need to understand flex container and where to add class
  - theme.css: CSS variables — may need to add new variables for layout swap
  - usePlatformDetection: Hook return value — Layout needs to consume this for conditional styling

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Layout component renders without errors
  - [ ] CSS class is applied based on button position

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Layout applies flex-direction row-reverse when buttons on left
    Tool: Read (component code and CSS)
    Preconditions: src/components/Layout.tsx modified
    Steps:
      1. Read Layout.tsx
      2. Verify: usePlatformDetection hook is called
      3. Verify: CSS class is conditionally applied based on buttonPosition
      4. Verify: When position='left', root div has class 'layout-reversed'
      5. Read CSS: verify .layout-reversed has flex-direction: row-reverse
    Expected Result: Layout correctly swaps direction based on button position
    Failure Indicators: No hook call, missing class, no CSS rule for swap
    Evidence: .sisyphus/evidence/task-8-layout-swap.md

  Scenario: Layout passes position prop to child components
    Tool: Read (component code)
    Preconditions: src/components/Layout.tsx modified
    Steps:
      1. Read Layout.tsx
      2. Verify: ResizableSidebar receives windowControlsPosition prop
      3. Verify: SplitPane (or child components) receive windowControlsPosition prop
    Expected Result: Position prop flows down to components that need it
    Failure Indicators: Missing prop passing, props not reaching children
    Evidence: .sisyphus/evidence/task-8-prop-flow.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-8-layout-swap.md (layout swap logic verification)
  - [ ] Evidence file: task-8-prop-flow.md (prop passing verification)

  **Commit**: YES
  - Message: `feat(ui): integrate platform detection with Layout for dynamic positioning`
  - Files: `src/components/Layout.tsx`, `src/styles/theme.css`
  - Pre-commit: `npx tsc --noEmit && bun test`

  ---

- [ ] 9. Update tauri.conf.json and Capabilities

  **What to do**:
  - Verify `src-tauri/tauri.conf.json` has `decorations: false` for main window
  - Verify `src-tauri/capabilities/default.json` has all required window permissions:
    - `core:window:allow-start-dragging`
    - `core:window:allow-minimize`
    - `core:window:allow-maximize`
    - `core:window:allow-close`
  - Add `core:window:allow-start-dragging` if not already present
  - Run `cargo tauri dev` to verify app starts without permission errors
  - Run `cargo tauri build` to verify production build works

  **Must NOT do**:
  - Do not add unnecessary permissions
  - Do not modify other window settings

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: Configuration verification and minor updates
  - **Skills**: []
    - No specific skills needed — config file updates
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — config only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Tasks 10, 11, 12 (testing needs proper config)
  - **Blocked By**: Task 4 (tauri-controls must be installed first)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src-tauri/tauri.conf.json` — Current window configuration
  - `src-tauri/capabilities/default.json` — Current capabilities file

  **API/Type References** (contracts to implement against):
  - Tauri capability schema — for correct permission format

  **Test References** (testing patterns to follow):
  - None — config verification

  **External References** (libraries and frameworks):
  - Tauri capabilities documentation

  **WHY Each Reference Matters** (explain the relevance):
  - tauri.conf.json: Must have `decorations: false` for custom title bar to work
  - capabilities/default.json: Must have window control permissions for minimize/maximize/close/drag

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - N/A — config verification

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: tauri.conf.json has decorations disabled and permissions correct
    Tool: Read (config files)
    Preconditions: Files exist
    Steps:
      1. Read src-tauri/tauri.conf.json
      2. Verify: "decorations": false in windows array
      3. Read src-tauri/capabilities/default.json
      4. Verify: all 4 window permissions are listed
    Expected Result: Config is correct for custom title bar
    Failure Indicators: Missing decorations setting, missing permissions
    Evidence: .sisyphus/evidence/task-9-config-verification.md

  Scenario: Tauri dev server starts without permission errors
    Tool: Bash (cargo tauri dev)
    Preconditions: Config is correct
    Steps:
      1. Run cargo tauri dev (or npm run tauri dev)
      2. Wait for server to start
      3. Check console output for permission errors
    Expected Result: Server starts without permission-related errors
    Failure Indicators: Permission errors, startup failures
    Evidence: .sisyphus/evidence/task-9-dev-startup.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-9-config-verification.md (config verification)
  - [ ] Evidence file: task-9-dev-startup.txt (dev server output)

  **Commit**: YES
  - Message: `chore: verify tauri config and capabilities for window controls`
  - Files: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
  - Pre-commit: `cargo tauri dev` (start and verify)

  ---

- [ ] 10. Write Platform Detection Tests

  **What to do**:
  - Create `src/__tests__/platform-detection.test.ts`
  - Test TypeScript-only detection using `navigator.platform` mock
  - Test button position calculation for each platform:
    - macOS → left
    - Windows → right
    - Linux → right (default)
  - Test Linux window manager detection if applicable
  - Mock `invoke` from @tauri-apps/api/core
  - Test error handling when Rust invoke fails

  **Must NOT do**:
  - Do not test Rust command directly (covered in Task 3)
  - Do not test UI components (covered in other tasks)

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `deep`
    - Reason: Testing hook logic with mocks and edge cases
  - **Skills**: []
    - No specific skills needed — standard Jest/Vitest testing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — testing logic, not UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12)
  - **Blocks**: Final verification (F1-F4)
  - **Blocked By**: Tasks 3, 6 (Rust command and hook must exist)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/hooks/useKeyboardShortcuts.test.ts` — Hook testing patterns
  - `src/test-utils/mocks.ts` — Mock utilities if present

  **API/Type References** (contracts to implement against):
  - usePlatformDetection hook API — must match exactly
  - @tauri-apps/api/core `invoke` — mock for testing

  **Test References** (testing patterns to follow):
  - Existing test files for hooks

  **External References** (libraries and frameworks):
  - Jest/Vitest mocking patterns

  **WHY Each Reference Matters** (explain the relevance):
  - useKeyboardShortcuts.test.ts: Shows how to test hooks with mocks
  - mocks.ts: May have existing mock utilities to reuse
  - invoke mock: Must correctly mock Tauri invoke for testing

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Test file created: src/__tests__/platform-detection.test.ts
  - [ ] bun test src/__tests__/platform-detection.test.ts → PASS (all tests)

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Platform detection tests pass
    Tool: Bash (bun test)
    Preconditions: src/__tests__/platform-detection.test.ts exists
    Steps:
      1. Run bun test src/__tests__/platform-detection.test.ts
      2. Verify all tests pass
      3. Check test output for coverage
    Expected Result: All platform detection tests pass
    Failure Indicators: Test failures, missing test cases
    Evidence: .sisyphus/evidence/task-10-test-output.txt

  Scenario: Button position calculation returns correct values
    Tool: Read (test file)
    Preconditions: Tests exist
    Steps:
      1. Read test file
      2. Verify: test for macOS returns 'left'
      3. Verify: test for Windows returns 'right'
      4. Verify: test for Linux returns 'right'
    Expected Result: Tests cover all platform scenarios correctly
    Failure Indicators: Missing platform tests, wrong expected values
    Evidence: .sisyphus/evidence/task-10-test-coverage.md
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-10-test-output.txt (test run output)
  - [ ] Evidence file: task-10-test-coverage.md (test coverage analysis)

  **Commit**: YES
  - Message: `test: add platform detection tests`
  - Files: `src/__tests__/platform-detection.test.ts`
  - Pre-commit: `bun test`

  ---

- [ ] 11. Write Window Control E2E Tests

  **What to do**:
  - Create `playwright/tests/window-controls.spec.ts`
  - Test window controls visibility on correct side per platform
  - Test minimize button: click → window minimizes (or state changes)
  - Test maximize button: click → window maximizes (or state changes)
  - Test close button: click → window closes (or cleanup triggered)
  - Take screenshots for visual verification
  - Test button hover states and active states

  **Must NOT do**:
  - Do not test sidebar repositioning (covered in Task 12)
  - Do not test tab functionality (existing tests cover this)

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `deep`
    - Reason: E2E testing with Playwright, visual verification
  - **Skills**: [`playwright`]
    - `playwright`: Required for browser automation and E2E tests
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — testing existing UI, not designing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12)
  - **Blocks**: Final verification (F1-F4)
  - **Blocked By**: Tasks 7, 8 (TabBar and Layout must be updated)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `playwright/` directory — existing Playwright test structure
  - `playwright.config.ts` — Playwright configuration

  **API/Type References** (contracts to implement against):
  - Playwright API: `page.locator()`, `page.click()`, `page.screenshot()`
  - Tauri window: minimize/maximize/close behavior

  **Test References** (testing patterns to follow):
  - Existing E2E tests if any

  **External References** (libraries and frameworks):
  - Playwright documentation for Tauri apps

  **WHY Each Reference Matters** (explain the relevance):
  - playwright/: Existing test structure — new tests should follow same pattern
  - playwright.config.ts: Configuration — may need to adjust for Tauri app
  - Playwright API: Standard browser automation — need to interact with custom window controls

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Test file created: playwright/tests/window-controls.spec.ts
  - [ ] npx playwright test window-controls → PASS (all tests)

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Window controls are visible and on correct side
    Tool: Playwright
    Preconditions: Tauri app is running
    Steps:
      1. Navigate to app
      2. Locate window controls (minimize, maximize, close)
      3. Take screenshot of title area
      4. Verify controls are present and on expected side
    Expected Result: Window controls visible on correct side
    Failure Indicators: Controls missing, wrong side, not visible
    Evidence: .sisyphus/evidence/task-11-window-controls-screenshot.png

  Scenario: Window control buttons respond to clicks
    Tool: Playwright
    Preconditions: Tauri app is running, window controls visible
    Steps:
      1. Click minimize button
      2. Verify window minimizes (or state changes)
      3. Click maximize button
      4. Verify window maximizes (or state changes)
      5. Click close button
      6. Verify window closes or cleanup triggered
    Expected Result: Buttons trigger correct window operations
    Failure Indicators: Buttons don't respond, wrong behavior
    Evidence: .sisyphus/evidence/task-11-button-clicks.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-11-window-controls-screenshot.png (screenshot)
  - [ ] Evidence file: task-11-button-clicks.txt (click test output)

  **Commit**: YES
  - Message: `test: add E2E tests for window controls`
  - Files: `playwright/tests/window-controls.spec.ts`
  - Pre-commit: `npx playwright test window-controls`

  ---

- [ ] 12. Write Drag Region Tests

  **What to do**:
  - Create `playwright/tests/window-drag.spec.ts` (or add to window-controls spec)
  - Test drag region on tab bar background
  - Test that clicking tabs does NOT trigger drag (selects tab instead)
  - Test double-click on drag region toggles maximize
  - Test window position changes after drag
  - Take before/after screenshots of window position

  **Must NOT do**:
  - Do not test sidebar resize functionality (separate concern)
  - Do not test tab overflow behavior

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `deep`
    - Reason: E2E testing with Playwright, visual verification
  - **Skills**: [`playwright`]
    - `playwright`: Required for browser automation and drag testing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — testing existing functionality

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11)
  - **Blocks**: Final verification (F1-F4)
  - **Blocked By**: Tasks 7, 8 (TabBar and Layout must be updated)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `playwright/tests/window-controls.spec.ts` — Previous E2E test patterns
  - `playwright/` directory — Test structure

  **API/Type References** (contracts to implement against):
  - Playwright drag API: `page.mouse.down()`, `page.mouse.move()`, `page.mouse.up()`
  - Tauri drag: `data-tauri-drag-region` behavior

  **Test References** (testing patterns to follow):
  - Previous window control tests

  **External References** (libraries and frameworks):
  - Playwright mouse event simulation

  **WHY Each Reference Matters** (explain the relevance):
  - window-controls.spec.ts: Shows test patterns for window interactions
  - Playwright drag: Need to simulate mouse drag events to test window movement
  - Tauri drag: Standard attribute-based drag — tests verify it works

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] Test file created: playwright/tests/window-drag.spec.ts
  - [ ] npx playwright test window-drag → PASS (all tests)

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Tab bar background is draggable
    Tool: Playwright
    Preconditions: Tauri app is running, tab bar visible
    Steps:
      1. Get initial window position
      2. Click and drag tab bar background
      3. Get new window position
      4. Verify position changed
    Expected Result: Window moves when tab bar is dragged
    Failure Indicators: Window doesn't move, drag doesn't work
    Evidence: .sisyphus/evidence/task-12-drag-test.png (before/after)

  Scenario: Clicking a tab does NOT trigger drag
    Tool: Playwright
    Preconditions: Tauri app is running, multiple tabs visible
    Steps:
      1. Get initial window position
      2. Click on a tab (not background)
      3. Verify tab becomes active (selected)
      4. Verify window position unchanged
    Expected Result: Tab click selects tab, doesn't drag window
    Failure Indicators: Window moves on tab click, tab not selected
    Evidence: .sisyphus/evidence/task-12-tab-click.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-12-drag-test.png (before/after window position)
  - [ ] Evidence file: task-12-tab-click.txt (tab click test output)

  **Commit**: YES
  - Message: `test: add E2E tests for window drag functionality`
  - Files: `playwright/tests/window-drag.spec.ts`
  - Pre-commit: `npx playwright test window-drag`

---

- [ ] 13. Final Integration Testing and Documentation

  **What to do**:
  - Test tab overflow scenario (20+ tabs) — ensure window controls remain visible
  - Test fullscreen mode — verify window controls behavior
  - Test maximized state — verify maximize button shows restore icon
  - Test window restore from minimized state
  - Test sidebar collapse/expand with new layout
  - Document Wayland limitation if drag region doesn't work
  - Verify all existing keyboard shortcuts still work (Cmd+W, Cmd+T, etc.)
  - Run full test suite to check for regressions

  **Must NOT do**:
  - Do not add new features beyond window controls + drag
  - Do not modify existing window management logic

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `unspecified-low`
    - Reason: Integration testing and documentation
  - **Skills**: [`playwright`]
    - `playwright`: For visual verification and E2E edge case testing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — testing existing UI, not designing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave FINAL (with F1-F4)
  - **Blocks**: None (final verification)
  - **Blocked By**: Tasks 10, 11, 12 (all tests must pass)

  **References** (CRITICAL - Be Exhaustive):

  > The executor has NO context from your interview. References are their ONLY guide.
  > Each reference must answer: "What should I look at and WHY?"

  **Pattern References** (existing code to follow):
  - `src/hooks/useKeyboardShortcuts.ts` — Existing keyboard shortcuts to verify
  - `src/components/TabBar.tsx` — Tab overflow handling to verify

  **API/Type References** (contracts to implement against):
  - Tauri window states: minimized, maximized, fullscreen
  - Tab overflow: scrollable tab bar with dropdown

  **Test References** (testing patterns to follow):
  - All existing test files

  **External References** (libraries and frameworks):
  - Tauri documentation on fullscreen and window states

  **WHY Each Reference Matters** (explain the relevance):
  - useKeyboardShortcuts.ts: Must verify all shortcuts still work after layout changes
  - TabBar.tsx: Tab overflow behavior must work with window controls present
  - Tauri window states: Must verify all states work correctly

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY** — No human action permitted.
  > Every criterion MUST be verifiable by running a command or using a tool.

  **If TDD (tests enabled):**
  - [ ] All existing tests pass: `bun test`
  - [ ] All E2E tests pass: `npx playwright test`

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  > **This is NOT optional. A task without QA scenarios WILL BE REJECTED.**
  >
  > Write scenario tests that verify the ACTUAL BEHAVIOR of what you built.
  > Minimum: 1 happy path + 1 failure/edge case per task.
  > Each scenario = exact tool + exact steps + exact assertions + evidence path.
  >
  > **The executing agent MUST run these scenarios after implementation.**
  > **The orchestrator WILL verify evidence files exist before marking task complete.**

  ```
  Scenario: Tab overflow works with window controls present
    Tool: Playwright
    Preconditions: Tauri app is running, window controls visible
    Steps:
      1. Create 25+ tabs in a pane
      2. Verify tab bar scrolls horizontally
      3. Verify window controls remain visible and functional
      4. Click overflow dropdown
      5. Verify all tabs are listed in dropdown
    Expected Result: Tab overflow works correctly with window controls
    Failure Indicators: Window controls hidden, overflow broken, tabs missing
    Evidence: .sisyphus/evidence/task-13-tab-overflow.png

  Scenario: All existing keyboard shortcuts still work
    Tool: Playwright
    Preconditions: Tauri app is running
    Steps:
      1. Press Cmd+T (or Ctrl+T) — new tab should open
      2. Press Cmd+W (or Ctrl+W) — tab should close
      3. Press Cmd+B (or Ctrl+B) — sidebar should toggle
      4. Verify no shortcut conflicts with window controls
    Expected Result: All shortcuts work as before
    Failure Indicators: Shortcuts don't work, conflicts with window controls
    Evidence: .sisyphus/evidence/task-13-keyboard-shortcuts.txt
  ```

  **Evidence to Capture:**
  - [ ] Evidence file: task-13-tab-overflow.png (tab overflow screenshot)
  - [ ] Evidence file: task-13-keyboard-shortcuts.txt (shortcut test output)

  **Commit**: NO
  ---

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(window): add platform detection command` — src-tauri/src/platform.rs, cargo test

---

## Success Criteria

### Verification Commands
```bash
# Platform detection returns correct values
cargo test --lib platform_detection -- --nocapture

# Tauri app builds without errors
cargo tauri build

# Frontend builds without TypeScript errors
npx tsc --noEmit

# E2E tests pass
npx playwright test

# Existing tests still pass
bun test
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Window controls on correct side per platform
- [ ] Layout swaps correctly
- [ ] Tab dragging works
