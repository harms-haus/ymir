# Workspace Settings Enhancement Plan

## TL;DR

> **Quick Summary**: Add customizable workspace settings (color, icon, working directory, subtitle) with a modal dialog for configuration, accessible via a new context menu item.

> **Deliverables**:
> - Extended Workspace type with color, icon, workingDirectory, subtitle, name fields
> - `updateWorkspaceSettings` action in Zustand store
> - `WorkspaceSettingsDialog` component using existing Base-UI Dialog wrappers
> - "Settings" context menu item in workspace sidebar
> - Visual accent line (3px left border) colored by workspace setting
> - Icon display on workspace tabs
> - Subtitle display below workspace name
> - Directory picker using Tauri plugin

> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Type extension → Store action → Dialog UI → Visual integration

---

## Context

### Original Request
User wants to add workspace customization features:
1. Color assignment (accent line on sidebar)
2. Icon assignment
3. Working directory (default to CWD)
4. Configurable label (name)
5. Subtitle (blank = collapsed)
6. Modal dialog using base-ui.com/components/dialog
7. Context menu item to access settings

### Interview Summary
**Key Discussions**:
- Color format: Hex string (e.g., "#ff5733")
- Icon system: Predefined set of Lucide React icons (already installed)
- Working directory: Affects new tabs only; existing tabs keep their CWD
- Subtitle: Shows in expanded view, hidden when collapsed
- Accent line: 3px left border on workspace tab
- Hotkeys: Display only (Cmd+1-8), not customizable

**Research Findings**:
- Workspace type currently: id, name, root, activePaneId, hasNotification
- Context menu pattern exists with Base-UI Menu + custom anchor positioning
- Dialog wrappers exist: DialogRoot, DialogPortal, DialogPopup, DialogTitle, DialogDescription, DialogClose
- Menu wrappers exist: MenuRoot, MenuPortal, MenuPositioner, MenuPopup, MenuItem
- No existing workspace color/icon/theme support
- `@tauri-apps/plugin-dialog` not installed (needed for directory picker)
- lucide-react already installed in package.json

### Metis Review
**Identified Gaps** (addressed):
- Color format specified: hex string
- Icon system: predefined Lucide icons (8-12 icons)
- Working directory: only affects new tabs
- Subtitle: plain text, max 50 chars
- Accent line: 3px left border (VS Code pattern)

---

## Work Objectives

### Core Objective
Add workspace customization (color, icon, working directory, subtitle) with a settings modal dialog accessible from the context menu.

### Concrete Deliverables
- Extended `Workspace` type in `src/state/types.ts`
- `updateWorkspaceSettings` store action in `src/state/workspace.ts`
- New `src/components/WorkspaceSettingsDialog.tsx` component
- "Settings" menu item in `src/components/WorkspaceSidebar.tsx`
- Updated `WorkspaceList` rendering with accent line, icon, subtitle
- New CSS in `src/components/WorkspaceSidebar.css`
- Store tests for new action

### Definition of Done
- [ ] All new Workspace fields persist via Tauri Store
- [ ] Settings dialog opens from context menu and saves correctly
- [ ] Color accent line renders on workspace tabs
- [ ] Icon displays on workspace tabs when set
- [ ] Subtitle displays below name in expanded view, hidden when collapsed
- [ ] Working directory used for new tabs in that workspace
- [ ] All acceptance criteria pass (see tasks)

### Must Have
- 4 optional fields on Workspace: color, icon, workingDirectory, subtitle
- updateWorkspaceSettings action in Zustand store
- WorkspaceSettingsDialog using existing Base-UI Dialog wrappers
- "Settings" MenuItem in existing context menu
- 3px left border accent line when color is set
- Icon display when icon is set
- Subtitle display (max 50 chars, truncated with ellipsis)

### Must NOT Have (Guardrails)
- Do NOT add more fields beyond the 4 specified
- Do NOT create custom hooks, contexts, or providers
- Do NOT add workspace hotkey customization (Cmd+1-8 is display-only)
- Do NOT add custom color picker (10 preset colors only)
- Do NOT add upload custom icons (predefined Lucide set only)
- Do NOT add workspace templates or presets
- Do NOT add export/import functionality
- Do NOT create multiple plans — everything in this single plan

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest + playwright)
- **Automated tests**: Tests-after (add tests for store action + components)
- **Framework**: vitest for unit tests, playwright for E2E
- **If TDD**: No — tests-after approach for this feature

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **Store/State**: Use vitest — Unit tests for actions and selectors
- **Integration**: Use Bash — curl/API verification where applicable

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Extend Workspace type in types.ts [quick]
├── Task 2: Add updateWorkspaceSettings action to store [quick]
└── Task 3: Install @tauri-apps/plugin-dialog [quick]

Wave 2 (After Wave 1 — UI components, MAX PARALLEL):
├── Task 4: Create WorkspaceSettingsDialog component [deep]
├── Task 5: Add "Settings" context menu item [quick]
├── Task 6: Add color picker subcomponent [quick]
├── Task 7: Add icon picker subcomponent [quick]
└── Task 8: Add directory browser integration [quick]

Wave 3 (After Wave 2 — visual integration):
├── Task 9: Add accent line CSS + rendering [quick]
├── Task 10: Add icon display to workspace tabs [quick]
├── Task 11: Add subtitle display to workspace tabs [quick]
└── Task 12: Update WorkspaceList component [quick]

Wave 4 (After Wave 3 — verification):
├── Task 13: Add store unit tests [quick]
├── Task 14: Add dialog E2E tests [deep]
└── Task 15: Final QA pass [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 4 → Task 9 → Task 13 → Task 15
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 7 (Waves 1 & 2)
```

### Dependency Matrix

- **1** (type extension): — → 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
- **2** (store action): 1 → 4, 5, 13
- **3** (install dialog plugin): — → 8
- **4** (dialog component): 1, 2 → 5, 14
- **5** (context menu item): 1, 4 → 12
- **6** (color picker): 1 → 4
- **7** (icon picker): 1 → 4
- **8** (directory browser): 1, 3 → 4
- **9** (accent line CSS): 1 → 12
- **10** (icon display): 1, 7 → 12
- **11** (subtitle display): 1 → 12
- **12** (update WorkspaceList): 5, 9, 10, 11 → 14
- **13** (store tests): 2 → 15
- **14** (E2E tests): 4, 12 → 15
- **15** (final QA): 13, 14

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — quick × 3
- **Wave 2**: 5 tasks — deep × 1, quick × 4
- **Wave 3**: 4 tasks — quick × 4
- **Wave 4**: 3 tasks — quick × 1, deep × 1, unspecified-high × 1

---

## TODOs

- [ ] 1. Extend Workspace Type with New Fields

  **What to do**:
  - Add 4 optional fields to `Workspace` interface in `src/state/types.ts` (lines 132-143):
    - `color?: string` — hex color string (e.g., "#ff5733") for workspace accent line
    - `icon?: string` — Lucide icon name string (e.g., "Terminal", "Code", "Server") for workspace icon
    - `workingDirectory?: string` — path string for workspace default working directory
    - `subtitle?: string` — subtitle text (max 50 chars, truncated with ellipsis)
  - Add `WORKSPACE_COLORS` constant array of 10 hex color strings
  - Add `WORKSPACE_ICONS` constant array of ~12 Lucide icon name strings
  - Export both constants from types.ts

  **Must NOT do**:
  - Do NOT add any fields beyond the 4 specified above
  - Do NOT add a default value for these fields in the type definition itself (undefined = not set)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — trivial type extension

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
  - **Blocked By**: None

  **References**:
  - `src/state/types.ts:132-143` — Current Workspace interface to extend
  - `src/state/types.ts:230-232` — Where to add WORKSPACE_COLORS and WORKSPACE_ICONS constants (after Git types)

  **Acceptance Criteria**:
  - [ ] Workspace interface has 4 new optional fields
  - [ ] WORKSPACE_COLORS array has exactly 10 hex color strings
  - [ ] WORKSPACE_ICONS array has 8-12 Lucide icon name strings
  - [ ] `npx tsc --noEmit` passes with no errors

  **QA Scenarios**:
  ```
  Scenario: Type extension compiles correctly
    Tool: Bash
    Preconditions: Types file updated
    Steps:
      1. Run `npx tsc --noEmit`
      2. Check exit code is 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-1-type-check.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add workspace color, icon, workingDirectory, subtitle fields`
  - Files: `src/state/types.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 2. Add updateWorkspaceSettings Store Action

  **What to do**:
  - Add `updateWorkspaceSettings` method to `WorkspaceState` interface in `src/state/workspace.ts`
  - Signature: `(workspaceId: string, updates: { color?: string; icon?: string; workingDirectory?: string; subtitle?: string }) => void`
  - Implement the action in the store using Immer draft:
    - Find workspace by ID
    - Apply updates only to provided fields (partial update pattern)
    - Validate subtitle length (max 50 chars, truncate if exceeded)
    - Validate color format (must be valid hex)
    - Log the change via logger.info
  - Update `resetState` to clear the new fields (set to undefined)

  **Must NOT do**:
  - Do NOT persist color/icon to Tauri store separately — they're part of the Workspace object
  - Do NOT create a separate "settings" object — fields live directly on Workspace

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — straightforward store extension

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 13
  - **Blocked By**: Task 1 (needs type definitions)

  **References**:
  - `src/state/workspace.ts:50-117` — WorkspaceState interface (add new action signature)
  - `src/state/workspace.ts:413-420` — Example pattern for setActiveWorkspace action
  - `src/state/workspace.ts:380-399` — Example of createWorkspace action with Immer draft mutation
  - `src/state/workspace.ts:680-710` — resetState function to update

  **Acceptance Criteria**:
  - [ ] `updateWorkspaceSettings` action exists in WorkspaceState interface
  - [ ] Action implements partial update pattern (only provided fields are updated)
  - [ ] Subtitle validation: truncated to 50 chars
  - [ ] Action persists via existing Tauri store adapter (auto via partialize)
  - [ ] `bun test src/state/workspace.test.ts` passes

  **QA Scenarios**:
  ```
  Scenario: Update workspace color
    Tool: Bash (vitest)
    Preconditions: Store initialized
    Steps:
      1. Call updateWorkspaceSettings(wsId, { color: "#ff0000" })
      2. Assert workspace.color === "#ff0000"
    Expected Result: Color updated, persisted
    Evidence: .sisyphus/evidence/task-2-store-test.txt

  Scenario: Update subtitle with truncation
    Tool: Bash (vitest)
    Preconditions: Store initialized
    Steps:
      1. Call updateWorkspaceSettings(wsId, { subtitle: "A".repeat(100) })
      2. Assert workspace.subtitle.length === 50
    Expected Result: Subtitle truncated to 50 chars
    Evidence: .sisyphus/evidence/task-2-subtitle-truncate.txt
  ```

  **Commit**: YES
  - Message: `feat(store): add updateWorkspaceSettings action`
  - Files: `src/state/workspace.ts`
  - Pre-commit: `bun test src/state/workspace.test.ts`

---

- [ ] 3. Install @tauri-apps/plugin-dialog

  **What to do**:
  - Install `@tauri-apps/plugin-dialog` via npm/bun
  - Verify the plugin is listed in `src-tauri/capabilities/default.json` (or create the permission entry if needed)
  - Import and verify the dialog module is accessible: `import { open } from '@tauri-apps/plugin-dialog'`

  **Must NOT do**:
  - Do NOT implement the directory browser logic yet (that's Task 8)
  - Do NOT modify Cargo.toml (Tauri plugins use JS-only install for v2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — simple dependency install

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `package.json` — Add dependency here
  - `src-tauri/capabilities/default.json` — May need dialog permission

  **Acceptance Criteria**:
  - [ ] `@tauri-apps/plugin-dialog` listed in package.json dependencies
  - [ ] `bun install` succeeds
  - [ ] Import of `open` from dialog module works (verified by tsc)

  **QA Scenarios**:
  ```
  Scenario: Plugin installed and importable
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bun install`
      2. Run `npx tsc --noEmit` (no import errors)
    Expected Result: Clean install, no type errors
    Evidence: .sisyphus/evidence/task-3-install.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): install @tauri-apps/plugin-dialog`
  - Files: `package.json`, `bun.lock`
  - Pre-commit: `bun install`

---

- [ ] 4. Create WorkspaceSettingsDialog Component

  **What to do**:
  - Create new file `src/components/WorkspaceSettingsDialog.tsx`
  - Component receives props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `workspaceId: string`
  - Uses existing Base-UI Dialog wrappers (`DialogRoot`, `DialogPortal`, `DialogPopup`, `DialogTitle`, `DialogDescription`, `DialogClose`)
  - Contains 5 sections:
    1. **Name/Label**: Editable text input with Enter-to-save behavior (no save button)
    2. **Subtitle**: Editable text input, max 50 chars, shows character count
    3. **Color Picker**: Grid of 10 colored boxes from `WORKSPACE_COLORS` constant
    4. **Icon Picker**: Grid of icons from `WORKSPACE_ICONS` constant, hover shows pencil overlay
    5. **Working Directory**: Text input + "Browse" button that opens Tauri dialog
    6. **Hotkey Display**: Read-only display showing Cmd+1-8 based on workspace index
  - On any field change, calls `updateWorkspaceSettings` from the store
  - Dialog has standard close button (X) and no explicit save button (changes are applied immediately)
  - Import icon components from `lucide-react` dynamically based on icon name

  **Must NOT do**:
  - Do NOT create a form with submit/save button — changes apply immediately on change
  - Do NOT create custom hook or context — direct store usage
  - Do NOT implement file browser logic (delegate to Task 8 via a callback or inline import)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`playwright`, `frontend-ui-ux`]
  - `playwright`: For testing the dialog UI interactions
  - `frontend-ui-ux`: For styling the dialog sections and ensuring good UX
  - **Skills Evaluated but Omitted**:
    - `ultrabrain`: Not needed — this is a UI composition task, not complex logic

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential within this wave, but wave depends on Wave 1)
  - **Blocks**: Tasks 5, 14
  - **Blocked By**: Tasks 1, 2, 6, 7, 8

  **References**:
  - `src/components/ui/Dialog.tsx:5-87` — Dialog wrapper components to use
  - `src/components/WorkspaceSidebar.tsx:143-195` — Context menu pattern with Base-UI Menu
  - `src/state/workspace.ts` — updateWorkspaceSettings action to call
  - `src/state/types.ts` — WORKSPACE_COLORS and WORKSPACE_ICONS constants
  - `src/components/ui/Button.tsx` — Button component for Browse button

  **Acceptance Criteria**:
  - [ ] Dialog opens/closes correctly with `open`/`onOpenChange` props
  - [ ] All 5 sections render (name, subtitle, color picker, icon picker, working directory)
  - [ ] Color picker shows 10 colored boxes, highlights selected one
  - [ ] Icon picker shows icons with hover pencil overlay
  - [ ] Browse button opens Tauri directory picker
  - [ ] Hotkey display shows correct Cmd+1-8 text
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Dialog renders all sections
    Tool: Playwright
    Preconditions: Dialog open with workspaceId
    Steps:
      1. Open dialog
      2. Assert name input exists
      3. Assert subtitle input exists
      4. Assert 10 color boxes exist
      5. Assert icon grid exists
      6. Assert working directory input exists
      7. Assert hotkey display shows "⌘1" or similar
    Expected Result: All sections visible
    Evidence: .sisyphus/evidence/task-4-dialog-render.png

  Scenario: Color selection updates workspace
    Tool: Playwright
    Preconditions: Dialog open, color picker visible
    Steps:
      1. Click on the 3rd color box
      2. Assert the 3rd color box has a selected ring/indicator
      3. Assert store workspace.color matches the clicked color
    Expected Result: Color selected and persisted
    Evidence: .sisyphus/evidence/task-4-color-select.png
  ```

  **Commit**: YES
  - Message: `feat(ui): create WorkspaceSettingsDialog component`
  - Files: `src/components/WorkspaceSettingsDialog.tsx`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 5. Add Settings Context Menu Item

  **What to do**:
  - In `src/components/WorkspaceSidebar.tsx`, add a "Settings" `MenuItem` to the existing context menu (after the separator at line 184, before "Close Workspace")
  - Import and render `WorkspaceSettingsDialog` component
  - Add state: `const [settingsOpen, setSettingsOpen] = useState(false)` and `const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null)`
  - Clicking "Settings" sets `settingsWorkspaceId` to `contextMenuAnchor.workspaceId` and opens the dialog
  - Render `<WorkspaceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} workspaceId={settingsWorkspaceId ?? ''} />` at end of WorkspaceList component

  **Must NOT do**:
  - Do NOT modify the existing menu items (New Workspace Below, Move Up, Move Down, Close Workspace)
  - Do NOT add a new context menu — add to the existing one

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — small addition to existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (depends on Task 4)
  - **Blocks**: Task 12
  - **Blocked By**: Task 4 (needs WorkspaceSettingsDialog component)

  **References**:
  - `src/components/WorkspaceSidebar.tsx:166-192` — Existing context menu items (add Settings before separator)
  - `src/components/WorkspaceSidebar.tsx:184` — Separator line where to insert
  - `src/components/WorkspaceSidebar.tsx:33-38` — Existing state for context menu

  **Acceptance Criteria**:
  - [ ] "Settings" menu item appears in context menu
  - [ ] Clicking "Settings" opens the WorkspaceSettingsDialog
  - [ ] Dialog is scoped to the right-clicked workspace
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Settings menu item opens dialog
    Tool: Playwright
    Preconditions: Sidebar visible with workspaces
    Steps:
      1. Right-click on workspace tab
      2. Assert "Settings" item appears in menu
      3. Click "Settings"
      4. Assert dialog opens with correct workspace context
    Expected Result: Dialog opens for the right-clicked workspace
    Evidence: .sisyphus/evidence/task-5-context-menu.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add Settings menu item to workspace context menu`
  - Files: `src/components/WorkspaceSidebar.tsx`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 6. Create Color Picker Subcomponent

  **What to do**:
  - Create a `ColorPicker` component (can be inline in WorkspaceSettingsDialog.tsx or separate file)
  - Props: `value: string | undefined`, `onChange: (color: string) => void`
  - Renders a horizontal/vertical row of 10 colored squares (24x24px each)
  - Uses `WORKSPACE_COLORS` constant from types.ts
  - Selected color gets a 2px white ring/outline (or highlight border)
  - Each color box has a hover effect (slight scale/brightness)
  - Clicking a color calls `onChange(color)`
  - Include a "none" option (first item, transparent with X icon) to clear color

  **Must NOT do**:
  - Do NOT create a custom color picker with hex input
  - Do NOT use any external color picker library

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — simple UI component

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 7, 8)
  - **Blocks**: Task 4 (integrated into dialog)
  - **Blocked By**: Task 1 (needs WORKSPACE_COLORS constant)

  **References**:
  - `src/state/types.ts` — WORKSPACE_COLORS constant

  **Acceptance Criteria**:
  - [ ] 10 colored boxes + 1 "none" option rendered
  - [ ] Selected color has visible ring/outline
  - [ ] Clicking a color triggers onChange with hex string
  - [ ] Hover effect visible on each box

  **QA Scenarios**:
  ```
  Scenario: Color picker renders correctly
    Tool: Playwright
    Preconditions: ColorPicker rendered
    Steps:
      1. Assert 11 color boxes exist (10 colors + none)
      2. Click color at index 3
      3. Assert that color has a ring indicator
    Expected Result: Color picker interactive and visual
    Evidence: .sisyphus/evidence/task-6-color-picker.png
  ```

  **Commit**: NO (part of Task 4 commit)

---

- [ ] 7. Create Icon Picker Subcomponent

  **What to do**:
  - Create an `IconPicker` component (can be inline in WorkspaceSettingsDialog.tsx or separate file)
  - Props: `value: string | undefined`, `onChange: (icon: string) => void`
  - Renders a grid of Lucide icons from `WORKSPACE_ICONS` constant
  - Each icon rendered using `lucide-react` — dynamically import icon by name using a lookup map
  - Hover effect: show small pencil/edit icon overlay on the top-right corner
  - Selected icon gets a highlight background
  - Include a "none" option (first item, empty/X icon)
  - Icon size: 20x20px, grid spacing with Tailwind `gap-2`

  **Must NOT do**:
  - Do NOT allow uploading custom icons
  - Do NOT use any icon library other than lucide-react

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — simple UI component

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6, 8)
  - **Blocks**: Task 4 (integrated into dialog)
  - **Blocked By**: Task 1 (needs WORKSPACE_ICONS constant)

  **References**:
  - `src/state/types.ts` — WORKSPACE_ICONS constant
  - `lucide-react` — Icon component library (already installed)

  **Acceptance Criteria**:
  - [ ] Grid of Lucide icons rendered from WORKSPACE_ICONS
  - [ ] Hover shows pencil overlay icon
  - [ ] Selected icon has highlight
  - [ ] Clicking an icon triggers onChange with icon name string

  **QA Scenarios**:
  ```
  Scenario: Icon picker renders and allows selection
    Tool: Playwright
    Preconditions: IconPicker rendered
    Steps:
      1. Assert icon grid exists with expected count
      2. Hover over an icon
      3. Assert pencil overlay appears
      4. Click the icon
      5. Assert selected highlight appears
    Expected Result: Interactive icon picker
    Evidence: .sisyphus/evidence/task-7-icon-picker.png
  ```

  **Commit**: NO (part of Task 4 commit)

---

- [ ] 8. Add Directory Browser Integration

  **What to do**:
  - In the Working Directory section of WorkspaceSettingsDialog, implement the "Browse" button
  - On click, call `open({ directory: true, multiple: false })` from `@tauri-apps/plugin-dialog`
  - If a directory is selected, update the text input and call `updateWorkspaceSettings` with the new `workingDirectory`
  - Text input is also editable — user can type a path directly and press Enter to save
  - Handle error case: dialog cancelled (no-op)
  - Show current directory path as placeholder or value in the text input

  **Must NOT do**:
  - Do NOT validate that the directory exists (let OS/Tauri handle it)
  - Do NOT browse file contents within the directory picker

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — straightforward integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6, 7)
  - **Blocks**: Task 4 (integrated into dialog)
  - **Blocked By**: Task 3 (needs dialog plugin installed)

  **References**:
  - `@tauri-apps/plugin-dialog` — `open()` function for directory picker
  - `src/state/workspace.ts` — updateWorkspaceSettings action

  **Acceptance Criteria**:
  - [ ] "Browse" button triggers native directory picker
  - [ ] Selected directory path populates the text input
  - [ ] Text input is editable and Enter-to-save works
  - [ ] `workingDirectory` is updated in the store

  **QA Scenarios**:
  ```
  Scenario: Browse button opens directory picker
    Tool: Playwright
    Preconditions: Dialog open, Browse button visible
    Steps:
      1. Click "Browse" button
      2. (Tauri native dialog opens — skip in automated test, manual verify)
      3. Assert text input can be typed into
      4. Type "/home/user/test" and press Enter
      5. Assert store workspace.workingDirectory === "/home/user/test"
    Expected Result: Directory path updated
    Evidence: .sisyphus/evidence/task-8-dir-picker.txt
  ```

  **Commit**: NO (part of Task 4 commit)

---

- [ ] 9. Add Accent Line CSS and Rendering

  **What to do**:
  - Create `src/components/WorkspaceSidebar.css` (new CSS file) for workspace-specific styles
  - Add CSS class `.workspace-accent-line`:
    - 3px left border using `border-left: 3px solid var(--workspace-color)`
    - When color is not set, border is transparent or uses default `var(--primary)`
  - Add CSS class `.workspace-tab-with-accent` for tabs that have a color set
  - Update `WorkspaceList` component to:
    - Read `workspace.color` from store
    - Apply accent line class if color is set
    - Set CSS custom property `--workspace-color: {color}` on the tab element
  - Update `CollapsedWorkspaceList` to also show accent line (3px left border on collapsed tab)

  **Must NOT do**:
  - Do NOT change the existing workspace tab layout/structure beyond adding the accent
  - Do NOT use inline styles for the accent — use CSS classes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — CSS addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1 (needs color field on type)

  **References**:
  - `src/components/WorkspaceSidebar.tsx:96-122` — WorkspaceList tabs to add accent to
  - `src/components/WorkspaceSidebar.tsx:200-230` — CollapsedWorkspaceList to add accent to

  **Acceptance Criteria**:
  - [ ] CSS file created with `.workspace-accent-line` class
  - [ ] Workspace tab shows 3px left border when color is set
  - [ ] Accent line color matches workspace.color
  - [ ] Collapsed view also shows accent line

  **QA Scenarios**:
  ```
  Scenario: Accent line renders with workspace color
    Tool: Playwright
    Preconditions: Workspace has color "#ff5733" set
    Steps:
      1. Set workspace color via store
      2. Assert workspace tab has 3px left border
      3. Assert border color is "#ff5733"
    Expected Result: Visible colored accent line
    Evidence: .sisyphus/evidence/task-9-accent-line.png
  ```

  **Commit**: NO (part of Task 12 commit)

---

- [ ] 10. Add Icon Display to Workspace Tabs

  **What to do**:
  - In `WorkspaceList` component, read `workspace.icon` from store
  - If icon is set, render the Lucide icon (20x20px) before the workspace name
  - Use the same dynamic icon lookup as the icon picker (icon name → Lucide component)
  - Position icon to the left of the workspace name in the tab content area
  - In collapsed view, show the icon in place of or next to the number badge

  **Must NOT do**:
  - Do NOT show the icon picker in the tab — just display the selected icon
  - Do NOT animate the icon (keep it static)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — simple conditional rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1 (needs icon field on type)

  **References**:
  - `src/components/WorkspaceSidebar.tsx:105-112` — workspace-tab-content area to add icon to
  - `lucide-react` — Dynamic icon rendering pattern

  **Acceptance Criteria**:
  - [ ] Icon renders in workspace tab when workspace.icon is set
  - [ ] Icon is 20x20px, positioned before workspace name
  - [ ] Collapsed view also shows icon
  - [ ] No icon shown when workspace.icon is undefined

  **QA Scenarios**:
  ```
  Scenario: Icon displays on workspace tab
    Tool: Playwright
    Preconditions: Workspace has icon "Terminal" set
    Steps:
      1. Set workspace icon via store
      2. Assert Lucide Terminal icon is visible in tab
      3. Assert icon is before the workspace name
    Expected Result: Icon visible in tab
    Evidence: .sisyphus/evidence/task-10-icon-display.png
  ```

  **Commit**: NO (part of Task 12 commit)

---

- [ ] 11. Add Subtitle Display to Workspace Tabs

  **What to do**:
  - In `WorkspaceList` component, read `workspace.subtitle` from store
  - If subtitle is set and not empty, render it below the workspace name in smaller text
  - Apply CSS class `.workspace-subtitle` with:
    - Smaller font size (11px)
    - Muted color (`var(--foreground-muted)`)
    - Single line with ellipsis overflow (`text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`)
    - Max width constrained to parent
  - In collapsed view, subtitle is NOT shown (it would overflow)
  - When subtitle is empty/undefined, no subtitle element is rendered (no extra height)

  **Must NOT do**:
  - Do NOT allow multi-line subtitles
  - Do NOT show subtitle in collapsed view

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — simple conditional rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1 (needs subtitle field on type)

  **References**:
  - `src/components/WorkspaceSidebar.tsx:105-112` — workspace-tab-content area
  - CSS class `.workspace-subtitle` to add to new WorkspaceSidebar.css

  **Acceptance Criteria**:
  - [ ] Subtitle renders below workspace name when set
  - [ ] Subtitle is truncated with ellipsis if too long
  - [ ] No subtitle element when workspace.subtitle is undefined
  - [ ] Subtitle NOT shown in collapsed view

  **QA Scenarios**:
  ```
  Scenario: Subtitle displays correctly
    Tool: Playwright
    Preconditions: Workspace has subtitle "My Dev Environment"
    Steps:
      1. Set workspace subtitle via store
      2. Assert subtitle text "My Dev Environment" visible below name
      3. Assert subtitle font is smaller and muted
    Expected Result: Subtitle visible with correct styling
    Evidence: .sisyphus/evidence/task-11-subtitle.png

  Scenario: Long subtitle is truncated
    Tool: Playwright
    Preconditions: Workspace has very long subtitle (100 chars)
    Steps:
      1. Set long subtitle via store
      2. Assert subtitle is visible
      3. Assert subtitle ends with ellipsis "..."
    Expected Result: Truncated display
    Evidence: .sisyphus/evidence/task-11-subtitle-truncated.png
  ```

  **Commit**: NO (part of Task 12 commit)

---

- [ ] 12. Update WorkspaceList to Integrate All Visual Elements

  **What to do**:
  - Ensure all visual enhancements from Tasks 9, 10, 11 are properly integrated into both `WorkspaceList` and `CollapsedWorkspaceList`
  - Import the new CSS file (`import './WorkspaceSidebar.css'`)
  - Apply conditional classes based on workspace properties:
    - `workspace-accent-line` + `--workspace-color` custom property when color is set
    - Icon rendering when icon is set
    - Subtitle rendering when subtitle is set (expanded view only)
  - Test that the tab layout remains correct with/without accent line, icon, and subtitle
  - Ensure notification dot and shortcut key still display correctly alongside new elements

  **Must NOT do**:
  - Do NOT change the overall tab layout/structure
  - Do NOT break existing notification dot or shortcut display

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — integration of existing pieces

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final task in wave)
  - **Blocks**: Task 14 (E2E tests)
  - **Blocked By**: Tasks 9, 10, 11

  **References**:
  - `src/components/WorkspaceSidebar.tsx` — Both WorkspaceList and CollapsedWorkspaceList
  - `src/components/WorkspaceSidebar.css` — New CSS file from Task 9

  **Acceptance Criteria**:
  - [ ] CSS file imported
  - [ ] All visual elements (accent, icon, subtitle) render correctly
  - [ ] No layout issues with notification dot and shortcut
  - [ ] Both expanded and collapsed views work

  **QA Scenarios**:
  ```
  Scenario: Full visual integration with all features
    Tool: Playwright
    Preconditions: Workspace with color, icon, and subtitle set
    Steps:
      1. Assert accent line is visible (3px border)
      2. Assert icon is visible before name
      3. Assert subtitle is visible below name
      4. Assert notification dot still works
      5. Assert shortcut key still displays
    Expected Result: All elements coexist correctly
    Evidence: .sisyphus/evidence/task-12-full-integration.png
  ```

  **Commit**: YES
  - Message: `feat(ui): integrate accent line, icon, and subtitle into workspace tabs`
  - Files: `src/components/WorkspaceSidebar.tsx`, `src/components/WorkspaceSidebar.css`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 13. Add Store Unit Tests

  **What to do**:
  - Add test suite to `src/state/workspace.test.ts` for the new `updateWorkspaceSettings` action
  - Tests to add:
    1. Update workspace color — set color, verify it persists
    2. Update workspace icon — set icon name, verify it persists
    3. Update workspace workingDirectory — set path, verify it persists
    4. Update workspace subtitle — set text, verify it persists
    5. Partial update — update only color, verify other fields unchanged
    6. Subtitle truncation — set 100-char subtitle, verify truncated to 50
    7. Clear fields — set color to undefined, verify cleared
    8. Persistence — verify new fields survive prepareStateForPersistence
  - Follow existing test patterns: use `beforeEach` reset, direct store access

  **Must NOT do**:
  - Do NOT test UI components (that's Task 14)
  - Do NOT test dialog behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: N/A — straightforward test additions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 14)
  - **Blocks**: Task 15
  - **Blocked By**: Task 2 (needs store action)

  **References**:
  - `src/state/workspace.test.ts` — Existing test file to add to
  - `src/state/workspace.test.ts:34-105` — Initialization and workspace actions tests (pattern to follow)

  **Acceptance Criteria**:
  - [ ] 8 new test cases added for updateWorkspaceSettings
  - [ ] All tests pass: `bun test src/state/workspace.test.ts`
  - [ ] Tests cover partial updates, truncation, clearing, persistence

  **QA Scenarios**:
  ```
  Scenario: All store tests pass
    Tool: Bash
    Preconditions: Tests written
    Steps:
      1. Run `bun test src/state/workspace.test.ts`
      2. Assert all tests pass (exit code 0)
    Expected Result: All 8 new tests pass
    Evidence: .sisyphus/evidence/task-13-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(store): add unit tests for updateWorkspaceSettings`
  - Files: `src/state/workspace.test.ts`
  - Pre-commit: `bun test src/state/workspace.test.ts`

---

- [ ] 14. Add Dialog E2E Tests

  **What to do**:
  - Create or extend E2E test file for workspace settings dialog
  - Test scenarios using Playwright:
    1. Context menu "Settings" item opens dialog
    2. Dialog shows correct workspace data (name, color, icon, subtitle, cwd)
    3. Changing name via Enter saves and closes edit mode
    4. Clicking a color updates the accent line on the workspace tab
    5. Clicking an icon updates the icon display on the workspace tab
    6. Typing in working directory input and pressing Enter saves
    7. Dialog close button works
    8. Changes persist after page reload (check Tauri store)
  - Tests should use page object pattern or direct selectors matching actual DOM structure

  **Must NOT do**:
  - Do NOT test the native directory picker (can't automate Tauri native dialogs)
  - Do NOT test store internals (that's Task 13)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]
  - `playwright`: Required for E2E browser automation testing
  - **Skills Evaluated but Omitted**:
    - `ultrabrain`: Not needed — structured E2E test writing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (depends on Task 12)
  - **Blocks**: Task 15
  - **Blocked By**: Task 12 (needs integrated UI)

  **References**:
  - `playwright` skill — For Playwright test patterns
  - `src/components/WorkspaceSidebar.tsx` — DOM structure to query
  - `src/components/WorkspaceSettingsDialog.tsx` — Dialog structure to query

  **Acceptance Criteria**:
  - [ ] E2E test file created with 8 test scenarios
  - [ ] All E2E tests pass: `bun test` or `npx playwright test`
  - [ ] Tests verify both UI state and store state

  **QA Scenarios**:
  ```
  Scenario: Full E2E test suite passes
    Tool: Bash
    Preconditions: App running, E2E tests written
    Steps:
      1. Run E2E test suite
      2. Assert all 8 tests pass
    Expected Result: Full E2E coverage
    Evidence: .sisyphus/evidence/task-14-e2e-results.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add Playwright tests for workspace settings dialog`
  - Files: `src/tests/workspace-settings.test.ts` (new)
  - Pre-commit: `bun test`

---

- [ ] 15. Final QA Pass

  **What to do**:
  - Run full verification suite:
    1. `npx tsc --noEmit` — No TypeScript errors
    2. `bun test` — All unit tests pass
    3. Manual verification of all acceptance criteria from Definition of Done
  - Check for AI slop patterns:
    - No excessive comments
    - No over-abstraction
    - No generic names (data, result, item, temp)
  - Verify no `as any` or `@ts-ignore` in new code
  - Verify no console.log in new code
  - Verify all files follow existing patterns and conventions
  - Verify no scope creep (no changes beyond the planned scope)

  **Must NOT do**:
  - Do NOT make additional changes during QA — only verify and report
  - Do NOT skip any verification step

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]
  - `playwright`: For final manual QA scenarios
  - **Skills Evaluated but Omitted**:
    - N/A — this is a verification/review task

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave FINAL (after all tasks)
  - **Blocks**: None (final)
  - **Blocked By**: Tasks 13, 14

  **References**:
  - `package.json` — Build/test commands
  - `src/state/workspace.test.ts` — Unit test results
  - `src/components/WorkspaceSidebar.tsx` — Visual verification

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` — PASS
  - [ ] `bun test` — All tests pass
  - [ ] No AI slop patterns in new code
  - [ ] No `as any` or `@ts-ignore` in new code
  - [ ] All Definition of Done items verified

  **QA Scenarios**:
  ```
  Scenario: Full build and test verification
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run `npx tsc --noEmit`
      2. Run `bun test`
      3. Assert both commands exit with 0
    Expected Result: Clean build and all tests pass
    Evidence: .sisyphus/evidence/task-15-verification.txt

  Scenario: Visual QA - all features working
    Tool: Playwright
    Preconditions: App running with workspace settings configured
    Steps:
      1. Open app
      2. Verify accent line on workspace with color
      3. Verify icon on workspace with icon
      4. Verify subtitle on workspace with subtitle
      5. Right-click → Settings opens dialog
      6. Dialog shows all current values
      7. Change color → accent updates live
    Expected Result: All features working end-to-end
    Evidence: .sisyphus/evidence/task-15-visual-qa.png
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all Must Have implemented, no Must NOT Have present.
  Output: `Must Have [5/5] | Must NOT Have [0 violations] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun test` + linter.
  Output: `Build [PASS/FAIL] | Tests [N pass] | VERDICT`

- [ ] F3. **Real Manual QA** — `playwright`
  Execute all QA scenarios, test cross-task integration.
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify no scope creep, all tasks implemented as specified.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN] | VERDICT`

---

## Commit Strategy

- **1**: `feat(workspace): add color, icon, workingDirectory, subtitle fields` — types.ts
- **2**: `feat(store): add updateWorkspaceSettings action` — workspace.ts
- **3**: `chore(deps): install @tauri-apps/plugin-dialog` — package.json
- **4-8**: `feat(ui): create WorkspaceSettingsDialog with subcomponents` — WorkspaceSettingsDialog.tsx
- **9-11**: `feat(ui): add accent line, icon, subtitle to workspace tabs` — WorkspaceSidebar.tsx/css
- **12**: `feat(ui): update WorkspaceList rendering` — WorkspaceSidebar.tsx
- **13-14**: `test: add unit and E2E tests for workspace settings` — workspace.test.ts, e2e

---

## Success Criteria

### Verification Commands
```bash
npx tsc --noEmit  # No type errors
bun test          # All unit tests pass
bun run dev       # App starts, settings dialog opens
```

### Final Checklist
- [ ] Workspace type has 5 new optional fields (color, icon, workingDirectory, subtitle, name via existing)
- [ ] updateWorkspaceSettings action persists via Tauri Store
- [ ] Settings dialog opens from right-click context menu
- [ ] Color picker shows 10 preset colors with ring indicator
- [ ] Icon picker shows Lucide icons with hover pencil overlay
- [ ] Directory picker opens native Tauri dialog
- [ ] Workspace tab shows 3px left border with selected color
- [ ] Workspace tab shows icon when set
- [ ] Subtitle appears below name, hidden when empty
- [ ] New tabs in workspace use workingDirectory as cwd
- [ ] All tests pass (vitest + playwright)
- [ ] No Must NOT Have violations
