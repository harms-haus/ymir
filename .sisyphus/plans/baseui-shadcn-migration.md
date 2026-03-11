# Base-UI + shadcn/ui Migration Plan for Ymir

## TL;DR

**Objective**: Migrate Ymir terminal emulator from custom-built UI components to Base-UI primitives with shadcn/ui theming system.

**Current State**: 28 React components with custom CSS (7 CSS files, ~1,900 lines), inline styles, NO component library, NO design system.

**Target State**: Base-UI primitives + shadcn/ui components + unified CSS variables theming.

**Estimated Effort**: Large (~15-20 tasks)

**Parallel Execution**: YES - Components can be migrated in parallel waves

**Critical Path**: Button → Tabs → Accordion → Menu → Dialog → Migration verification

---

## Context

### Original Request
Reverse-engineer migration plan from `.worktrees/baseui-shadcn-migration` worktree. Previous agent deleted repo. Reconstruct complete migration plan covering all UI patterns.

### Current Architecture Analysis

**Tech Stack**:
- React 18 + TypeScript + Vite
- NO UI component library (completely custom)
- 7 component-scoped CSS files (~1,900 lines)
- Mixed styling: CSS files + inline styles
- Zustand + Immer for state management

**UI Patterns Requiring Migration**:

| Pattern | Count | Current Implementation | Base-UI Equivalent |
|---------|-------|----------------------|------------------|
| Buttons | ~25 | `.git-empty-state-button`, `.tab-close-button`, `.git-header-action-button`, `.git-toolbar-icon-button`, `.branch-selector-button`, `.branch-create-button`, `.branch-option`, `.branch-delete-button`, `.git-commit-button`, `.git-discard-button`, `.tab-bar-overflow-button`, `.tab-bar-browser-button`, `.tab-bar-new-button`, `.context-menu-item`, `.collapse-button` | `@base-ui/react/button` |
| Tabs | 3 sets | `.tab-item` (pane tabs), `.tab-button` (sidebar), `.tab-button-vertical` (collapsed) | `@base-ui/react/tabs` |
| Dropdowns/Menus | 4 | `.branch-dropdown`, `.tab-bar-overflow-menu`, `.context-menu` (2 instances) | `@base-ui/react/menu` |
| Accordions | 3 | `.section-header` in GitPanel (staged/changes sections), `.project-folder-tree` | `@base-ui/react/accordion` |
| Popovers | 0 | Currently using fixed-position divs | `@base-ui/react/popover` |
| Dialogs | 0 | Using `window.prompt()`, `window.confirm()` | `@base-ui/react/dialog` |
| Input/Textarea | 2 | `.git-commit-textarea` | `@base-ui/react/textarea` |
| Checkbox | 1 | `.git-checkbox` (file staging) | `@base-ui/react/checkbox` |
| Tooltip | ~15 | Native `title` attribute only | `@base-ui/react/tooltip` |
| Badge | ~8 | `.tab-notification-badge`, `.git-status-badge`, `.tab-badge` | shadcn/ui Badge |

**Current Styling Approach**:
- VS Code Dark-inspired color scheme
- Hardcoded hex colors: `#1e1e1e`, `#252526`, `#3c3c3c`, `#007acc`, `#4fc3f7`
- Transitions: `0.15s ease` consistently
- NO CSS variables, NO design tokens
- NO dark/light theme switching

**Color Palette** (to preserve as CSS variables):
```css
/* Backgrounds */
--bg-primary: #1e1e1e;
--bg-secondary: #252526;
--bg-tertiary: #3c3c3c;
--bg-active: #37373d;
--bg-hover: #2a2d2e;

/* Text */
--text-primary: #cccccc;
--text-secondary: #858585;
--text-muted: #666666;
--text-active: #ffffff;

/* Accents */
--accent-primary: #007acc;
--accent-notification: #4fc3f7;
--accent-danger: #c75450;

/* Status */
--status-modified: #ff9f00;
--status-added: #4caf50;
--status-deleted: #f44336;
--status-untracked: #73bf99;
--status-renamed: #e8c39b;
--status-conflict: #c94a4c;
```

---

## Work Objectives

### Core Objective
Replace all custom UI components with Base-UI primitives while preserving exact visual appearance and behavior, then wrap with shadcn/ui styling.

### Concrete Deliverables
1. **Base-UI Setup**: Install `@base-ui/react` + configure shadcn/ui
2. **Theme System**: CSS custom properties matching current palette
3. **Button Migration**: ~25 button patterns → `@base-ui/react/button`
4. **Tab Migration**: 3 tab systems → `@base-ui/react/tabs`
5. **Menu Migration**: 4 dropdown/context menus → `@base-ui/react/menu`
6. **Accordion Migration**: 3 expandable sections → `@base-ui/react/accordion`
7. **Input Migration**: Textarea + checkbox → `@base-ui/react/textarea`, `@base-ui/react/checkbox`
8. **Tooltip Migration**: 15 `title` attributes → `@base-ui/react/tooltip`
9. **Dialog Migration**: Native prompts → `@base-ui/react/dialog`
10. **Badge Migration**: 8 badge patterns → shadcn/ui Badge
11. **Legacy CSS Removal**: Delete 7 CSS files after migration
12. **Test Updates**: Update 13 test files for new component structure

### Definition of Done
- [ ] All buttons render with Base-UI Button primitive
- [ ] All buttons follow Component Taxonomy (icon/label/ghost/danger/menu-trigger)
- [ ] All tabs use Base-UI Tabs primitive with correct orientation
- [ ] All menus use Base-UI Menu primitive with proper positioning
- [ ] All native prompts replaced with Base-UI Dialog
- [ ] All `title` tooltips replaced with Base-UI Tooltip
- [ ] All CSS custom properties defined in `theme.css`
- [ ] Zero console errors or accessibility warnings
- [ ] All existing tests pass (or updated to match new structure)
- [ ] **Visual consistency: Component sub-types match their taxonomy patterns**
  - Icon buttons: No border/background
  - Label buttons: Full styling
  - Toolbar buttons: Consistent with each other
  - Branch selector: Blends with toolbar

### Must Have
- Base-UI primitives for ALL interactive elements
- CSS custom properties for ALL colors
- shadcn/ui component wrappers for consistent API
- Preserve all keyboard shortcuts and accessibility
- Preserve all hover/active/focus states
- Preserve all animations (0.15s ease)
- **Component sub-types visually consistent within their category** (see Component Taxonomy below)

### Component Taxonomy (Visual Consistency Rules)

Components are organized by **function/behavior**, not visual appearance. Each sub-type has intentional styling:

#### Button Sub-Types

| Sub-Type | Visual Pattern | Usage | Examples |
|----------|---------------|-------|----------|
| **Icon Button** | No border, no background, icon only, icon color change on hover | Toolbar actions, tab bar | `.tab-close-button`, `.tab-bar-browser-button`, `.tab-bar-new-button`, `.git-toolbar-icon-button` |
| **Label Button** | Border + background, text label, full button styling | Primary actions, CTAs | `.git-commit-button`, `.git-empty-state-button`, `.branch-create-button` |
| **Ghost Button** | Border only, transparent background, subtle hover | Secondary actions | `.branch-selector-button` (shows current branch), context menu items |
| **Menu Trigger** | Blends with toolbar (icon button), opens dropdown | Branch selector, overflow | `.tab-bar-overflow-button` |
| **Danger Button** | Red accent, destructive action styling | Delete, discard | `.branch-delete-button`, `.git-discard-button` |

#### Tab Sub-Types

| Sub-Type | Visual Pattern | Usage |
|----------|---------------|-------|
| **Horizontal Tab** | Full width, left border accent (active), scrollable | Pane tabs (TabBar) |
| **Vertical Tab** | Icon-only when collapsed, icon+text when expanded, top border accent | Sidebar tabs (TabHeaderPanel) |
| **Workspace Tab** | Number badge, notification dot, left border | WorkspaceSidebar |

#### Menu Sub-Types

| Sub-Type | Visual Pattern | Usage |
|----------|---------------|-------|
| **Dropdown Menu** | Full popover, positioned below trigger, full styling | Branch selector, overflow |
| **Context Menu** | Fixed position, right-click, full styling | TabBar, WorkspaceSidebar |
| **Select (as Popover)** | No border/background on trigger, blends with toolbar, popover panel | Branch selector |

### Must NOT Have (Guardrails)
- NO breaking changes to user-facing behavior
- NO removal of keyboard shortcuts
- NO changes to notification system logic
- NO changes to workspace/pane/tab state management
- NO runtime theme switching in v1 (just CSS variable foundation)
- NO bloated bundle (tree-shake unused Base-UI components)
- **NO forced visual uniformity across different component sub-types** (icon buttons ≠ label buttons)
- **NO borders on icon buttons** (preserves current minimal toolbar aesthetic)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest + React Testing Library)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: Vitest
- **Test pattern**: Update existing tests to use Base-UI selectors

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **UI Components**: Playwright screenshots for visual regression
- **Interactions**: Playwright for click/hover/focus states
- **Accessibility**: Playwright for keyboard navigation

**Evidence Location**: `.sisyphus/evidence/task-{N}-{scenario-slug}.png`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Setup + Foundation):
├── Task 1: Install Base-UI + shadcn/ui dependencies [quick]
├── Task 2: Create theme.css with CSS variables [quick]
├── Task 3: Create Button wrapper component [quick]
├── Task 4: Create Badge wrapper component [quick]
└── Task 5: Create Tooltip wrapper component [quick]

Wave 2 (High-Impact Components - MAX PARALLEL):
├── Task 6: Migrate GitPanel buttons (~10 buttons) [unspecified-high]
├── Task 7: Migrate TabBar buttons (~5 buttons) [unspecified-high]
├── Task 8: Migrate TabHeaderPanel tabs [unspecified-high]
├── Task 9: Migrate WorkspaceSidebar tabs [unspecified-high]
├── Task 10: Migrate TabBar tabs [unspecified-high]
└── Task 11: Create Accordion wrapper [quick]

Wave 3 (Menus + Complex Components):
├── Task 12: Migrate branch selector dropdown [deep]
├── Task 13: Migrate tab overflow menu [deep]
├── Task 14: Migrate context menus (TabBar + WorkspaceSidebar) [deep]
├── Task 15: Migrate GitPanel accordions (staged/changes sections) [unspecified-high]
└── Task 16: Migrate ProjectPanel accordion [unspecified-high]

Wave 4 (Inputs + Dialogs):
├── Task 17: Migrate commit textarea [quick]
├── Task 18: Migrate file staging checkbox [quick]
├── Task 19: Create Dialog wrapper [quick]
├── Task 20: Replace window.prompt with Dialog [unspecified-high]
└── Task 21: Replace window.confirm with Dialog [unspecified-high]

Wave 5 (Tooltips + Polish):
├── Task 22: Replace all title attributes with Tooltip [unspecified-high]
├── Task 23: Update NotificationsPanel buttons [quick]
├── Task 24: Update ProjectPanel items [quick]
└── Task 25: Remove legacy CSS files [quick]

Wave 6 (Verification):
├── Task 26: Update test files for new component structure [unspecified-high]
├── Task 27: Visual regression testing [deep]
├── Task 28: Accessibility audit [deep]
└── Task 29: Bundle size verification [quick]

Wave FINAL (Review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
└── Task F3: Final visual QA [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 3 → Task 6-11 → Task 12-16 → Task 22 → Task 27
```

### Dependency Matrix
- **Task 3 (Button)**: Blocks Task 6-7, 23-24
- **Task 4 (Badge)**: Blocks Task 10-11
- **Task 5 (Tooltip)**: Blocks Task 22
- **Task 11 (Accordion)**: Blocks Task 15-16
- **Task 19 (Dialog)**: Blocks Task 20-21
- **Task 22 (Tooltips)**: Blocks FINAL

---

## TODOs

- [x] 1. Install Base-UI + shadcn/ui Dependencies

**What to do**:
- Install `@base-ui/react` package (v1.2.0+)
- Install `class-variance-authority` for component variants
- Install `clsx` + `tailwind-merge` for class merging
- Install `lucide-react` for icons (replace inline SVGs)
- Add shadcn/ui CLI configuration (components.json)
- Update vite.config.ts if needed for path aliases

**Files to modify**:
- `package.json` - add dependencies
- `vite.config.ts` - ensure path aliases work
- `tsconfig.json` - path aliases for `@/components`
- Create `components.json` - shadcn/ui config

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- Reason: Package installation and config setup

**Parallelization**:
- **Can Run In Parallel**: NO (foundation task)
- **Blocks**: Task 2-29

**Acceptance Criteria**:
- [ ] `bun install` completes without errors
- [ ] `@base-ui/react` in node_modules
- [ ] `npx shadcn` CLI works
- [ ] No TypeScript errors in new imports

**QA Scenarios**:
```
Scenario: Verify Base-UI imports work
Tool: Bash
Preconditions: Dependencies installed
Steps:
  1. Create test file: `echo "import { Button } from '@base-ui/react/button';" > /tmp/test-import.ts`
  2. Run TypeScript check: `npx tsc --noEmit /tmp/test-import.ts`
Expected Result: No TypeScript errors
Evidence: .sisyphus/evidence/task-1-import-test.log
```

**Commit**: NO (part of Task 29)

---

- [x] 2. Create theme.css with CSS Variables

**What to do**:
- Create `src/styles/theme.css`
- Define CSS custom properties matching current hardcoded colors
- Include light/dark theme support (dark as default)
- Use oklch() color space for better manipulation
- Define spacing, border-radius, transitions as variables

**CSS Variables to Create**:
```css
:root {
  /* Backgrounds */
  --background: #1e1e1e;
  --background-secondary: #252526;
  --background-tertiary: #3c3c3c;
  --background-active: #37373d;
  --background-hover: #2a2d2e;
  
  /* Text */
  --foreground: #cccccc;
  --foreground-secondary: #858585;
  --foreground-muted: #666666;
  --foreground-active: #ffffff;
  
  /* Accents */
  --primary: #007acc;
  --primary-hover: #0098ff;
  --notification: #4fc3f7;
  --destructive: #c75450;
  
  /* Status */
  --status-modified: #ff9f00;
  --status-added: #4caf50;
  --status-deleted: #f44336;
  --status-untracked: #73bf99;
  --status-renamed: #e8c39b;
  --status-conflict: #c94a4c;
  
  /* Borders */
  --border: #1e1e1e;
  --border-secondary: #3c3c3c;
  
  /* Effects */
  --transition-fast: 0.15s ease;
  --radius-sm: 4px;
  --radius-md: 6px;
}
```

**Files to create**:
- `src/styles/theme.css`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- Reason: CSS file creation

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1)
- **Parallel Group**: Wave 1
- **Blocked By**: None
- **Blocks**: Task 3-5 (needs theme variables)

**Acceptance Criteria**:
- [ ] `src/styles/theme.css` exists
- [ ] All CSS variables defined
- [ ] File imported in `main.tsx`
- [ ] No visual changes (variables match hardcoded values)

**QA Scenarios**:
```
Scenario: Verify theme variables work
Tool: Bash
Preconditions: theme.css created
Steps:
  1. Run: `grep -c "var(--background)" src/styles/theme.css`
  2. Check: grep "import.*theme.css" src/main.tsx
Expected Result: theme.css has variables, imported in main
Evidence: .sisyphus/evidence/task-2-theme-verification.txt
```

**Commit**: NO (part of Task 29)

---

- [x] 3. Create Button Wrapper Component

**What to do**:
- Create `src/components/ui/button.tsx`
- Wrap `@base-ui/react/button` with shadcn/ui styling
- Support variants: default, secondary, ghost, destructive
- Support sizes: sm, md, lg
- Preserve all hover/active/focus states
- Match current button styling exactly

**Component Structure**:
```tsx
import * as ButtonPrimitive from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
        secondary: 'bg-[var(--background-tertiary)] text-[var(--foreground)] hover:bg-[var(--background-hover)]',
        ghost: 'hover:bg-[var(--background-hover)] text-[var(--foreground)]',
        destructive: 'bg-[var(--destructive)] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-2 text-xs',
        md: 'h-9 px-3',
        lg: 'h-10 px-4',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <ButtonPrimitive.Root
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
```

**Files to create**:
- `src/components/ui/button.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- Reason: Component creation with patterns

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1-2)
- **Parallel Group**: Wave 1
- **Blocked By**: Task 2 (needs theme variables)
- **Blocks**: Task 6-7, 23-24

**Acceptance Criteria**:
- [ ] Button component exports with proper TypeScript types
- [ ] All 4 variants render correctly
- [ ] All 3 sizes work
- [ ] Hover/active states match current CSS
- [ ] No visual regression in appearance

**QA Scenarios**:
```
Scenario: Verify Button variants render
Tool: Playwright
Preconditions: Button component created
Steps:
  1. Create test page with all variants
  2. Navigate to test page
  3. Screenshot each variant
Expected Result: All variants match current button styles
Evidence: .sisyphus/evidence/task-3-button-variants.png
```

**Commit**: NO (part of Task 29)

---

- [x] 4. Create Badge Wrapper Component

**What to do**:
- Create `src/components/ui/badge.tsx`
- shadcn/ui Badge component (not from Base-UI directly)
- Support variants: default, secondary, destructive, outline
- Match current badge styling

**Current Badge Types**:
- `.tab-notification-badge` - blue background
- `.git-status-badge.modified` - orange
- `.git-status-badge.added` - green
- `.git-status-badge.deleted` - red
- `.tab-badge` - blue

**Files to create**:
- `src/components/ui/badge.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1-3)
- **Parallel Group**: Wave 1
- **Blocked By**: Task 2
- **Blocks**: Task 10-11

**Acceptance Criteria**:
- [ ] Badge component with variants
- [ ] Matches current badge styling
- [ ] Status color variants work

**QA Scenarios**:
```
Scenario: Badge variants render correctly
Tool: Playwright
Steps:
  1. Create test page with status badges
  2. Navigate and screenshot
Expected Result: M, A, D badges match current colors
Evidence: .sisyphus/evidence/task-4-badges.png
```

**Commit**: NO (part of Task 29)

---

- [x] 5. Create Tooltip Wrapper Component

**What to do**:
- Create `src/components/ui/tooltip.tsx`
- Wrap `@base-ui/react/tooltip`
- Match current native tooltip appearance
- Delay: 700ms (browser default)
- Position: top by default

**Files to create**:
- `src/components/ui/tooltip.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1-4)
- **Parallel Group**: Wave 1
- **Blocked By**: Task 2
- **Blocks**: Task 22

**Acceptance Criteria**:
- [ ] Tooltip component works
- [ ] Hover triggers tooltip after delay
- [ ] Matches browser tooltip style

**QA Scenarios**:
```
Scenario: Tooltip appears on hover
Tool: Playwright
Steps:
  1. Hover over element with tooltip
  2. Wait 700ms
  3. Screenshot
Expected Result: Tooltip visible with correct text
Evidence: .sisyphus/evidence/task-5-tooltip.png
```

**Commit**: NO (part of Task 29)

---

- [x] 6. Migrate GitPanel Buttons

**What to do**:
- Replace ~10 buttons in GitPanel.tsx with appropriate sub-types:

**Icon Buttons** (no border/background, icon only):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| `.git-header-action-button` (refresh icon) | `Button variant="icon"` | Header toolbar |
| `.git-header-action-button` (more actions icon) | `Button variant="icon"` | Header toolbar |
| `.git-toolbar-icon-button` (refresh) | `Button variant="icon"` | Toolbar row |
| `.git-toolbar-icon-button` (stage all) | `Button variant="icon"` | Toolbar row |
| `.git-toolbar-icon-button` (unstage all) | `Button variant="icon"` | Toolbar row |

**Label Buttons** (full styling, border + background):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| `.git-empty-state-button` | `Button variant="default"` | Empty state |
| `.git-commit-button` | `Button variant="default"` | Commit section |
| `.git-discard-button` | `Button variant="destructive"` | File item actions |

**Ghost Buttons** (border only, transparent bg):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| `.branch-create-button` | `Button variant="ghost"` | Branch dropdown |
| `.branch-option` | `Button variant="ghost"` | Branch dropdown items |

**Menu Triggers** (blend with toolbar):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| `.branch-selector-button` | `Menu.Trigger asChild` with `Button variant="ghost"` | Branch selector |

**Danger Buttons** (destructive styling):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| `.branch-delete-button` | `Button variant="destructive" size="icon"` | Branch dropdown |

**Visual Consistency Rules**:
- Icon buttons must have NO border, NO background by default
- Icon buttons change icon color on hover (not background)
- Toolbar buttons (refresh, stage, unstage) must visually match
- Branch selector must blend with toolbar (minimal styling)
- Commit button is prominent (default variant)
- Discard/delete use destructive styling

**Files to modify**:
- `src/components/GitPanel.tsx`
- Keep `src/components/GitPanel.css` for now (will delete in Task 25)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- Reason: Many button replacements, need care with event handlers

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 7-11)
- **Parallel Group**: Wave 2
- **Blocked By**: Task 3 (needs Button component)
- **Blocks**: None directly

**Must NOT do**:
- Do NOT change button behavior/logic
- Do NOT change event handler names
- Do NOT remove CSS file yet

**Acceptance Criteria**:
- [ ] All 10+ buttons use Button component
- [ ] All event handlers preserved
- [ ] Visual appearance matches exactly
- [ ] All hover/active states work

**QA Scenarios**:
```
Scenario: GitPanel buttons work
Tool: Playwright
Steps:
  1. Open GitPanel
  2. Screenshot each button variant
  3. Hover over buttons and screenshot
Expected Result: Buttons match current style, hover states work
Evidence: .sisyphus/evidence/task-6-gitpanel-buttons.png
```

**Commit**: NO (part of Task 29)

---

- [x] 7. Migrate TabBar Buttons

**What to do**:
- Replace buttons in TabBar.tsx with appropriate sub-types:

**Icon Buttons** (no border/background, minimal):
| Current | Base-UI Equivalent | Icon | Hover Effect |
|---------|-------------------|------|--------------|
| `.tab-close-button` | `Button variant="icon" size="sm"` | × (close) | Background appears on tab hover |
| `.tab-bar-overflow-button` | `Button variant="icon"` | ▼ (chevron) | Background highlight |
| `.tab-bar-browser-button` | `Button variant="icon"` | Globe SVG | Background highlight |
| `.tab-bar-new-button` | `Button variant="icon"` | + | Background highlight |

**Visual Consistency Rules**:
- Tab bar buttons are ALL icon buttons (minimal aesthetic)
- No borders on any tab bar button
- Close button is hidden until tab hover (preserve current behavior)
- Close button uses destructive hover (red background)
- Other buttons use standard hover (#3c3c3c background)
- Icons are 16px, buttons are square (~28px)

**Special Behavior**:
- `.tab-close-button`: Appears on `.tab-item:hover` via CSS, red hover background
- `.tab-bar-overflow-button`: Toggles overflow menu, rotated chevron when open
- `.tab-bar-browser-button`: Opens browser tab
- `.tab-bar-new-button`: Creates new terminal tab

**Files to modify**:
- `src/components/TabBar.tsx`

**Files to modify**:
- `src/components/TabBar.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6, 8-11)
- **Parallel Group**: Wave 2
- **Blocked By**: Task 3

**Acceptance Criteria**:
- [ ] All TabBar buttons use Button component
- [ ] Close button appears on hover
- [ ] Browser/New buttons work

**QA Scenarios**:
```
Scenario: TabBar buttons render
Tool: Playwright
Steps:
  1. Open TabBar with tabs
  2. Screenshot
  3. Hover over tab to show close button
  4. Screenshot
Expected Result: Close button appears, all buttons styled
Evidence: .sisyphus/evidence/task-7-tabbar-buttons.png
```

**Commit**: NO (part of Task 29)

---

- [x] 8. Migrate TabHeaderPanel Tabs

**What to do**:
- Replace horizontal/vertical tab buttons with Tabs primitive
- Current: `.tab-button`, `.tab-button-vertical`
- New: `@base-ui/react/tabs` with orientation prop
- Preserve active state styling
- Preserve badge display

**Files to modify**:
- `src/components/TabHeaderPanel.tsx`
- Keep CSS for styling (delete later)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- Reason: Complex component with state management

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6-7, 9-11)
- **Parallel Group**: Wave 2
- **Blocked By**: None (can use custom tabs for now)
- **Blocks**: None

**Acceptance Criteria**:
- [ ] Tabs use Base-UI Tabs primitive
- [ ] Active state works
- [ ] Badge displays correctly
- [ ] Collapsed/expanded modes work

**QA Scenarios**:
```
Scenario: TabHeaderPanel tabs work
Tool: Playwright
Steps:
  1. Open sidebar
  2. Click different tabs
  3. Verify active state changes
Expected Result: Active tab highlighted, content switches
Evidence: .sisyphus/evidence/task-8-tabheader-tabs.png
```

**Commit**: NO (part of Task 29)

---

- [x] 9. Migrate WorkspaceSidebar Tabs

**What to do**:
- Replace workspace list items with Tabs primitive
- Current: Clickable divs with inline styles
- New: Tab buttons with two modes:

**Expanded Mode** (full width, text + shortcut):
| Current | Base-UI Equivalent |
|---------|-------------------|
| Workspace item div | `Tabs.Trigger` with label button styling |
| Number badge | `Badge` inside trigger |
| Notification dot | `span` with notification styling |
| Shortcut hint | Text element |

**Collapsed Mode** (icon only):
| Current | Base-UI Equivalent |
|---------|-------------------|
| Number icon | `Tabs.Trigger` with icon button styling |
| Notification dot | `span` positioned absolute |

**New Workspace Button**:
| Current | Base-UI Equivalent |
|---------|-------------------|
| `+ New` button | `Button variant="ghost"` (not icon button - needs text) |

**Visual Consistency Rules**:
- Expanded workspace items: Full row, left border accent when active
- Collapsed workspace items: Icon-only, circular number badge
- New workspace button: Ghost variant (border on hover), NOT icon button (has text)
- Active workspace: #37373d background, #007acc left border
- Notification state: #4fc3f7 left border (overrides active color)
- Hover: #2a2d2e background

**Files to modify**:
- `src/components/WorkspaceSidebar.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6-8, 10-11)
- **Parallel Group**: Wave 2
- **Blocked By**: Task 8 (similar pattern)

**Acceptance Criteria**:
- [ ] Workspace items use Tabs primitive
- [ ] Active workspace highlighted with left border
- [ ] Notification indicators visible as dots
- [ ] Collapsed mode shows icon-only tabs
- [ ] New workspace button is ghost variant (not icon)

**QA Scenarios**:
```
Scenario: Workspace navigation works
Tool: Playwright
Steps:
  1. Open WorkspaceSidebar
  2. Verify expanded mode: full rows with text
  3. Click different workspaces
  4. Toggle collapse
  5. Verify collapsed mode: icon-only
Expected Result: Both modes work, styling matches taxonomy
Evidence: .sisyphus/evidence/task-9-workspace-tabs.png
```

**Commit**: NO (part of Task 29)

---

- [x] 10. Migrate TabBar Tabs

**What to do**:
- Replace `.tab-item` divs with Tabs primitive
- Use Tabs with horizontal orientation
- Preserve scrollable container
- Preserve overflow menu
- Preserve notification badges

**Files to modify**:
- `src/components/TabBar.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- Reason: Complex with scrolling and overflow

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6-9, 11)
- **Parallel Group**: Wave 2
- **Blocked By**: Task 3 (Badge component for notification badges)

**Acceptance Criteria**:
- [ ] Tab items use Tabs primitive
- [ ] Scrollable container works
- [ ] Active tab highlighted with left border
- [ ] Notification badges display

**QA Scenarios**:
```
Scenario: TabBar tabs work
Tool: Playwright
Steps:
  1. Open multiple tabs
  2. Scroll through tabs
  3. Click different tabs
Expected Result: Tabs scroll, active state changes
Evidence: .sisyphus/evidence/task-10-tabbar-tabs.png
```

**Commit**: NO (part of Task 29)

---

- [x] 11. Create Accordion Wrapper Component

**What to do**:
- Create `src/components/ui/accordion.tsx`
- Wrap `@base-ui/react/accordion`
- Support collapsible sections with chevron animation
- Match current `.section-header` styling

**Current Accordions**:
- GitPanel: staged files section, changes section
- ProjectPanel: folder tree (already recursive)

**Files to create**:
- `src/components/ui/accordion.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 6-10)
- **Parallel Group**: Wave 2
- **Blocked By**: Task 2 (theme variables)
- **Blocks**: Task 15-16

**Acceptance Criteria**:
- [ ] Accordion component created
- [ ] Chevron rotates on expand/collapse
- [ ] Smooth transition animation

**QA Scenarios**:
```
Scenario: Accordion expands/collapses
Tool: Playwright
Steps:
  1. Render accordion with section
  2. Click header
  3. Verify content shows/hides
  4. Verify chevron rotation
Expected Result: Content toggles, chevron animates
Evidence: .sisyphus/evidence/task-11-accordion.gif
```

**Commit**: NO (part of Task 29)

---

- [x] 12. Migrate Branch Selector Dropdown

**What to do**:
- Replace custom `.branch-dropdown` with Menu primitive
- Current: Custom div with buttons
- New: `@base-ui/react/menu` with submenus
- Preserve branch list
- Preserve create/delete functionality
- Preserve checkmark for current branch

**Files to modify**:
- `src/components/GitPanel.tsx` (BranchSelector component)

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []
- Reason: Complex menu with actions and icons

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 13-16)
- **Parallel Group**: Wave 3
- **Blocked By**: Task 6 (GitPanel buttons done)

**Acceptance Criteria**:
- [ ] Branch selector uses Menu primitive
- [ ] Dropdown opens/closes
- [ ] Branch selection works
- [ ] Create/delete buttons work

**QA Scenarios**:
```
Scenario: Branch selector works
Tool: Playwright
Steps:
  1. Open branch selector
  2. Screenshot dropdown
  3. Select different branch
Expected Result: Dropdown styled correctly, branch changes
Evidence: .sisyphus/evidence/task-12-branch-selector.png
```

**Commit**: NO (part of Task 29)

---

- [x] 13. Migrate Tab Overflow Menu

**What to do**:
- Replace `.tab-bar-overflow-menu` with Menu primitive
- Current: Custom div with items
- New: Menu with tab items as menu items
- Preserve active state highlighting
- Preserve notification badges

**Files to modify**:
- `src/components/TabBar.tsx`

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 12, 14-16)
- **Parallel Group**: Wave 3
- **Blocked By**: Task 10 (TabBar tabs done)

**Acceptance Criteria**:
- [ ] Overflow menu uses Menu primitive
- [ ] Menu items styled
- [ ] Active tab highlighted
- [ ] Click selects tab

**QA Scenarios**:
```
Scenario: Overflow menu works
Tool: Playwright
Steps:
  1. Open many tabs to trigger overflow
  2. Click overflow button
  3. Screenshot menu
Expected Result: Menu opens with tab items
Evidence: .sisyphus/evidence/task-13-overflow-menu.png
```

**Commit**: NO (part of Task 29)

---

- [x] 14. Migrate Context Menus

**What to do**:
- Replace 2 custom context menus with Menu primitive:
  1. TabBar context menu (split horizontal/vertical, close, new tab)
  2. WorkspaceSidebar context menu (new workspace, move, close)
- Current: Fixed-position div with backdrop
- New: Menu with positioning
- Preserve all actions

**Files to modify**:
- `src/components/TabBar.tsx`
- `src/components/WorkspaceSidebar.tsx`

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []
- Reason: Two complex context menus

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 12-13, 15-16)
- **Parallel Group**: Wave 3
- **Blocked By**: Task 7, 9 (buttons done)

**Acceptance Criteria**:
- [ ] Both context menus use Menu primitive
- [ ] Right-click opens menu
- [ ] Click outside closes menu
- [ ] All menu actions work

**QA Scenarios**:
```
Scenario: Context menus work
Tool: Playwright
Steps:
  1. Right-click on tab
  2. Screenshot context menu
  3. Click menu item
  4. Verify action executes
Expected Result: Menu styled, actions work
Evidence: .sisyphus/evidence/task-14-context-menu.png
```

**Commit**: NO (part of Task 29)

---

- [x] 15. Migrate GitPanel Accordions

**What to do**:
- Replace staged/changes sections with Accordion component
- Current: `.section-header` with chevron
- New: Accordion with proper semantics
- Preserve expand/collapse state
- Preserve file counts

**Files to modify**:
- `src/components/GitPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 12-14, 16)
- **Parallel Group**: Wave 3
- **Blocked By**: Task 11 (Accordion component), Task 6 (GitPanel buttons)

**Acceptance Criteria**:
- [ ] Staged section uses Accordion
- [ ] Changes section uses Accordion
- [ ] Sections expand/collapse
- [ ] File counts display

**QA Scenarios**:
```
Scenario: GitPanel sections expand
Tool: Playwright
Steps:
  1. Open GitPanel
  2. Click staged section header
  3. Verify files show/hide
Expected Result: Accordion works, chevron rotates
Evidence: .sisyphus/evidence/task-15-gitpanel-accordion.png
```

**Commit**: NO (part of Task 29)

---

- [x] 16. Migrate ProjectPanel Accordion

**What to do**:
- Replace folder tree with Accordion (already recursive)
- Current: Custom expand/collapse
- New: Accordion primitive with nested support
- Preserve folder icons
- Preserve file icons

**Files to modify**:
- `src/components/ProjectPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 12-15)
- **Parallel Group**: Wave 3
- **Blocked By**: Task 11

**Acceptance Criteria**:
- [ ] Folder tree uses Accordion
- [ ] Folders expand/collapse
- [ ] Icons preserved

**QA Scenarios**:
```
Scenario: Project tree works
Tool: Playwright
Steps:
  1. Open ProjectPanel
  2. Click folder
  3. Verify children show/hide
Expected Result: Tree expands/collapses
Evidence: .sisyphus/evidence/task-16-project-accordion.png
```

**Commit**: NO (part of Task 29)

---

- [x] 17. Migrate Commit Textarea

**What to do**:
- Replace `.git-commit-textarea` with Textarea primitive
- Add auto-resize capability
- Preserve placeholder text
- Preserve styling

**Files to modify**:
- `src/components/GitPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 18-21)
- **Parallel Group**: Wave 4
- **Blocked By**: None

**Acceptance Criteria**:
- [ ] Textarea uses Textarea primitive
- [ ] Auto-resize works
- [ ] Styling matches

**QA Scenarios**:
```
Scenario: Commit textarea works
Tool: Playwright
Steps:
  1. Open GitPanel
  2. Type multi-line text
  3. Verify textarea grows
Expected Result: Textarea auto-resizes
Evidence: .sisyphus/evidence/task-17-textarea.png
```

**Commit**: NO (part of Task 29)

---

- [x] 18. Migrate File Staging Checkbox

**What to do**:
- Replace staging checkboxes with Checkbox primitive
- Current: Native checkbox
- New: `@base-ui/react/checkbox`
- Preserve indeterminate state support (future)

**Files to modify**:
- `src/components/GitPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 17, 19-21)
- **Parallel Group**: Wave 4

**Acceptance Criteria**:
- [ ] Checkboxes use Checkbox primitive
- [ ] Check/uncheck works
- [ ] Styling matches

**QA Scenarios**:
```
Scenario: Staging checkboxes work
Tool: Playwright
Steps:
  1. Open GitPanel with changes
  2. Click checkbox
  3. Verify state changes
Expected Result: Checkbox toggles
Evidence: .sisyphus/evidence/task-18-checkbox.png
```

**Commit**: NO (part of Task 29)

---

- [x] 19. Create Dialog Wrapper Component

**What to do**:
- Create `src/components/ui/dialog.tsx`
- Wrap `@base-ui/react/dialog`
- Support title, description, actions
- Match native dialog appearance

**Files to create**:
- `src/components/ui/dialog.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 17-18, 20-21)
- **Parallel Group**: Wave 4
- **Blocks**: Task 20-21

**Acceptance Criteria**:
- [ ] Dialog component created
- [ ] Opens/closes correctly
- [ ] Backdrop visible

**QA Scenarios**:
```
Scenario: Dialog renders
Tool: Playwright
Steps:
  1. Open dialog
  2. Screenshot
Expected Result: Dialog centered with backdrop
Evidence: .sisyphus/evidence/task-19-dialog.png
```

**Commit**: NO (part of Task 29)

---

- [x] 20. Replace window.prompt with Dialog

**What to do**:
- Replace `window.prompt('Enter new branch name:')` with Dialog
- Current: Native prompt in handleCreateBranch
- New: Dialog with input field
- Preserve flow

**Files to modify**:
- `src/components/GitPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 17-19, 21)
- **Parallel Group**: Wave 4
- **Blocked By**: Task 19

**Acceptance Criteria**:
- [ ] Branch creation uses Dialog
- [ ] Input captured correctly
- [ ] Cancel works

**QA Scenarios**:
```
Scenario: Branch creation dialog works
Tool: Playwright
Steps:
  1. Click "Create New Branch"
  2. Dialog opens
  3. Enter name, click OK
Expected Result: Branch created with entered name
Evidence: .sisyphus/evidence/task-20-branch-dialog.png
```

**Commit**: NO (part of Task 29)

---

- [x] 21. Replace window.confirm with Dialog

**What to do**:
- Replace `window.confirm('Discard changes?')` with Dialog
- Current: Native confirm in handleDiscard
- New: Dialog with confirm/cancel buttons
- Preserve destructive action styling

**Files to modify**:
- `src/components/GitPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 17-20)
- **Parallel Group**: Wave 4
- **Blocked By**: Task 19

**Acceptance Criteria**:
- [ ] Discard confirmation uses Dialog
- [ ] Confirm/cancel work
- [ ] Destructive styling on confirm

**QA Scenarios**:
```
Scenario: Discard dialog works
Tool: Playwright
Steps:
  1. Click discard button
  2. Dialog opens
  3. Click Confirm
Expected Result: Changes discarded after confirmation
Evidence: .sisyphus/evidence/task-21-discard-dialog.png
```

**Commit**: NO (part of Task 29)

---

- [ ] 22. Replace All title Attributes with Tooltip

**What to do**:
- Find all `title="..."` attributes (~15 locations)
- Replace with Tooltip component wrapper
- Files affected:
  - TabBar.tsx (tab items, buttons)
  - GitPanel.tsx (buttons)
  - WorkspaceSidebar.tsx (workspace items)
  - TabHeaderPanel.tsx (tab buttons)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- Reason: Many scattered replacements

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 23-24)
- **Parallel Group**: Wave 5
- **Blocked By**: Task 5 (Tooltip component)

**Acceptance Criteria**:
- [ ] All title attributes replaced
- [ ] Tooltips appear on hover
- [ ] Consistent delay and styling

**QA Scenarios**:
```
Scenario: Tooltips appear
Tool: Playwright
Steps:
  1. Hover over element
  2. Wait 700ms
  3. Screenshot
Expected Result: Tooltip visible
Evidence: .sisyphus/evidence/task-22-tooltips.png
```

**Commit**: NO (part of Task 29)

---

- [ ] 23. Update NotificationsPanel Buttons

**What to do**:
- Replace inline button styles with appropriate Button sub-types:

**Icon/Ghost Buttons** (minimal, inline):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| "Clear" button | `Button variant="ghost" size="sm"` | Per notification |
| "Jump to Unread" | `Button variant="ghost"` | Header |

**Label Button** (full width, prominent):
| Current | Base-UI Equivalent | Location |
|---------|-------------------|----------|
| "Clear All" | `Button variant="secondary"` | Footer |

**Visual Consistency Rules**:
- "Clear" buttons: Ghost variant, red hover (destructive action)
- "Jump to Unread": Ghost variant, primary color text
- "Clear All": Secondary variant, full width, subtle styling
- All buttons: 0.15s ease transition

**Files to modify**:
- `src/components/NotificationsPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 22, 24)
- **Parallel Group**: Wave 5
- **Blocked By**: Task 3

**Acceptance Criteria**:
- [ ] "Clear" uses ghost variant
- [ ] "Clear All" uses secondary variant
- [ ] Hover states: Clear → red, Jump → primary blue

**QA Scenarios**:
```
Scenario: Notification buttons work
Tool: Playwright
Steps:
  1. Open NotificationsPanel with notifications
  2. Screenshot
  3. Hover over "Clear" button
  4. Hover over "Clear All" button
Expected Result: Ghost styling, appropriate hover colors
Evidence: .sisyphus/evidence/task-23-notification-buttons.png
```

**Commit**: NO (part of Task 29)

---

- [ ] 24. Update ProjectPanel Items

**What to do**:
- Update file/folder items to use proper Button or Accordion triggers
- Current: Clickable divs
- New: Button or Accordion trigger as appropriate
- Preserve folder/file icons

**Files to modify**:
- `src/components/ProjectPanel.tsx`

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 22-23)
- **Parallel Group**: Wave 5
- **Blocked By**: Task 3, Task 16

**Acceptance Criteria**:
- [ ] File items use proper interactive elements
- [ ] Folder items use Accordion triggers
- [ ] Icons preserved

**QA Scenarios**:
```
Scenario: Project items work
Tool: Playwright
Steps:
  1. Open ProjectPanel
  2. Click file
  3. Click folder
Expected Result: Items interactive
Evidence: .sisyphus/evidence/task-24-project-items.png
```

**Commit**: NO (part of Task 29)

---

- [x] 25. Remove Legacy CSS Files

**What to do**:
- Delete 7 CSS files (after confirming all styles migrated):
  1. `src/components/GitPanel.css` (788 lines)
  2. `src/components/TabBar.css` (334 lines)
  3. `src/components/TabHeaderPanel.css` (199 lines)
  4. `src/components/ProjectPanel.css` (221 lines)
  5. `src/components/NotificationsPanel.css` (231 lines)
  6. `src/components/Browser.css` (136 lines)
  7. `src/App.css` (5 lines)
- Remove CSS imports from component files
- Update `App.tsx` to import theme.css instead

**Files to delete**:
- 7 CSS files

**Files to modify**:
- All component files (remove CSS imports)
- `src/App.tsx` (update imports)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO (must be last cleanup task)
- **Blocked By**: Tasks 6-24 (all component migrations)

**Must NOT do**:
- Do NOT delete CSS if any styles still referenced
- Do NOT remove imports until components updated

**Acceptance Criteria**:
- [ ] All 7 CSS files deleted
- [ ] No CSS imports in components
- [ ] No visual regression
- [ ] `bun run build` succeeds

**QA Scenarios**:
```
Scenario: No CSS files remain
Tool: Bash
Steps:
  1. Find CSS files: `find src -name "*.css" -type f`
  2. Verify count: 0 (except theme.css)
  3. Build: `bun run build`
Expected Result: No CSS files, build succeeds
Evidence: .sisyphus/evidence/task-25-css-cleanup.txt
```

**Commit**: YES (separate cleanup commit)

---

- [ ] 26. Update Test Files

**What to do**:
- Update 13 test files for new component structure:
  - Update selectors (class names may change)
  - Update event triggers (if changed)
  - Update assertions
- Test files:
  1. `src/components/__tests__/TabHeaderPanel.test.tsx`
  2. `src/components/__tests__/TabBar.test.tsx`
  3. `src/components/__tests__/WorkspaceSidebar.test.tsx`
  4. `src/components/__tests__/GitPanel.test.tsx`
  5. `src/components/__tests__/NotificationsPanel.test.tsx`
  6. `src/components/__tests__/ProjectPanel.test.tsx`
  7. `src/components/__tests__/Pane.test.tsx`
  8. `src/components/__tests__/ResizableSidebar.test.tsx`
  9. `src/components/__tests__/SplitPane.test.tsx`
  10. `src/components/__tests__/Terminal.test.tsx`
  11. `src/components/__tests__/ErrorBoundary.test.tsx`
  12. `src/components/__tests__/Browser.test.tsx`
  13. `src/tests/*.test.ts`

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- Reason: Many test files to update

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 27-29)
- **Parallel Group**: Wave 6
- **Blocked By**: Tasks 6-25

**Acceptance Criteria**:
- [ ] All tests pass: `bun test`
- [ ] No test warnings
- [ ] Coverage maintained

**QA Scenarios**:
```
Scenario: All tests pass
Tool: Bash
Steps:
  1. Run tests: `bun test`
  2. Check: All tests pass
  3. Check: No errors
Expected Result: Test suite passes
Evidence: .sisyphus/evidence/task-26-tests.txt
```

**Commit**: NO (part of Task 29)

---

- [ ] 27. Visual Regression Testing

**What to do**:
- Screenshot comparison of key screens
- **NOT pixel-perfect** - verify Component Taxonomy compliance:

**Visual Checks by Category**:

**Icon Buttons** (verify NO border/background):
- [ ] TabBar: close, overflow, browser, new buttons
- [ ] GitPanel: toolbar buttons (refresh, stage, unstage)
- [ ] GitPanel: header action buttons

**Label Buttons** (verify full styling):
- [ ] GitPanel: commit button
- [ ] GitPanel: empty state button
- [ ] NotificationsPanel: clear all button

**Ghost Buttons** (verify border on hover only):
- [ ] GitPanel: branch create button
- [ ] GitPanel: branch selector
- [ ] NotificationsPanel: clear button

**Menu Triggers** (verify blend with toolbar):
- [ ] GitPanel: branch selector blends with toolbar buttons
- [ ] TabBar: overflow button consistent with other tab bar buttons

**Consistency Checks**:
- [ ] Toolbar buttons visually match each other
- [ ] Tab bar buttons all use icon button pattern
- [ ] Sidebar tabs use appropriate expanded/collapsed styles
- [ ] All hover states match taxonomy rules

**Tolerance**: Component function over pixel perfection

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []
- Reason: Detailed visual verification

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 26, 28-29)
- **Parallel Group**: Wave 6
- **Blocked By**: Tasks 6-25

**Acceptance Criteria**:
- [ ] Icon buttons have no border/background
- [ ] Label buttons have full styling
- [ ] Ghost buttons have border on hover
- [ ] Toolbar buttons visually consistent
- [ ] Component sub-types match taxonomy

**QA Scenarios**:
```
Scenario: Component taxonomy compliance
Tool: Playwright
Steps:
  1. Capture GitPanel toolbar
  2. Verify all icon buttons: no border
  3. Capture branch selector
  4. Verify blends with toolbar
  5. Capture TabBar
  6. Verify all buttons: icon style
Expected Result: Components follow taxonomy rules
Evidence: .sisyphus/evidence/task-27-visual/*.png
```

**Commit**: NO (part of Task 29)

---

- [ ] 28. Accessibility Audit

**What to do**:
- Run accessibility checks:
  - Keyboard navigation (Tab, Enter, Space, Escape)
  - Focus indicators
  - ARIA labels
  - Color contrast
- Use axe-core or manual testing

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 26-27, 29)
- **Parallel Group**: Wave 6
- **Blocked By**: Tasks 6-25

**Acceptance Criteria**:
- [ ] All interactive elements keyboard accessible
- [ ] Focus visible
- [ ] No axe-core violations
- [ ] ARIA labels present

**QA Scenarios**:
```
Scenario: Keyboard navigation works
Tool: Playwright
Steps:
  1. Navigate with Tab key
  2. Activate with Enter/Space
  3. Verify focus indicators
Expected Result: All elements accessible
Evidence: .sisyphus/evidence/task-28-a11y.txt
```

**Commit**: NO (part of Task 29)

---

- [ ] 29. Bundle Size Verification

**What to do**:
- Build and check bundle size
- Compare before/after
- Ensure Base-UI is tree-shaken
- Target: <10% increase acceptable

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 26-28)
- **Parallel Group**: Wave 6
- **Blocked By**: Tasks 6-25

**Acceptance Criteria**:
- [ ] Build succeeds
- [ ] Bundle size acceptable
- [ ] No unused Base-UI components in bundle

**QA Scenarios**:
```
Scenario: Bundle size acceptable
Tool: Bash
Steps:
  1. Build: `bun run build`
  2. Check dist size: `du -sh dist/`
  3. Analyze bundle: `npx vite-bundle-visualizer`
Expected Result: Size increase <10%
Evidence: .sisyphus/evidence/task-29-bundle.txt
```

**Commit**: YES (final migration commit)

---

## Final Verification Wave (MANDATORY)

> 3 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`

Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check imports, run component). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.

**Output**: `Must Have [29/29] | Must NOT Have [6/6] | Tasks [29/29] | VERDICT: APPROVE/REJECT`

**Acceptance Criteria**:
- [ ] All 29 tasks completed
- [ ] All Must Have items present
- [ ] All Must NOT Have items absent
- [ ] All evidence files exist
- [ ] No forbidden patterns found

---

- [ ] F2. **Code Quality Review** — `unspecified-high`

Run `tsc --noEmit` + `bun run build` + `bun test`. Review all changed files for:
- `as any` / `@ts-ignore`
- Empty catch blocks
- `console.log` in production code
- Commented-out code
- Unused imports
- Check AI slop: excessive comments, over-abstraction

**Output**: `Build [PASS/FAIL] | Tests [N pass/N fail] | Quality [N issues] | VERDICT`

**Acceptance Criteria**:
- [ ] TypeScript compilation passes
- [ ] Build succeeds
- [ ] All tests pass
- [ ] Zero quality issues

---

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)

Start from clean state. Execute key user flows:
1. Open app → verify layout renders
2. Create workspace → verify sidebar updates
3. Open GitPanel → verify buttons work
4. Create tab → verify TabBar updates
5. Split pane → verify SplitPane works
6. Open notifications → verify panel works
7. Test keyboard shortcuts (⌘T, ⌘W, ⌘D)

Save screenshots to `.sisyphus/evidence/final-qa/`.

**Output**: `Flows [7/7] | Keyboard [N/N] | Visual [PASS/FAIL] | VERDICT`

**Acceptance Criteria**:
- [ ] All 7 flows pass
- [ ] All keyboard shortcuts work
- [ ] No visual regressions

---

## Commit Strategy

**Migration is ONE major commit** with descriptive message:

```bash
# After Task 29 completes
git add .
git commit -m "feat(ui): migrate to base-ui + shadcn/ui

Complete migration from custom UI to Base-UI primitives:

- Install @base-ui/react v1.2.0
- Create theme.css with CSS custom properties
- Create Button, Badge, Tooltip, Accordion, Dialog wrappers
- Migrate ~25 button patterns across components
- Migrate 3 tab systems to Tabs primitive
- Migrate 4 dropdown/context menus to Menu primitive
- Migrate 3 accordion sections
- Replace native prompts with Dialog
- Replace title attributes with Tooltip
- Delete 7 legacy CSS files (~1,900 lines)
- Update 13 test files

BREAKING CHANGE: Component DOM structure changed
Visual appearance: 100% preserved
Bundle size: +X% (acceptable)
"
```

**Files Changed**:
- `package.json` (+@base-ui/react +deps)
- `src/styles/theme.css` (new)
- `src/components/ui/*.tsx` (5 new wrapper components)
- `src/components/*.tsx` (migrated to Base-UI)
- `src/components/*.css` (7 deleted)
- `src/components/__tests__/*.tsx` (13 updated)

---

## Success Criteria

### Verification Commands

```bash
# 1. Install dependencies
bun install

# 2. TypeScript check
npx tsc --noEmit

# 3. Build
bun run build

# 4. Tests
bun test

# 5. Check Base-UI is used
grep -r "@base-ui/react" src/ | wc -l  # Should be > 20

# 6. Check CSS variables used
grep -r "var(--" src/ | wc -l  # Should be > 50

# 7. Check legacy CSS deleted
find src -name "*.css" -type f | grep -v theme.css | wc -l  # Should be 0

# 8. Visual regression
# Run Playwright and compare screenshots
```

### Final Checklist

- [ ] All buttons use Base-UI Button
- [ ] **Buttons follow Component Taxonomy** (icon/label/ghost/danger)
- [ ] Icon buttons: NO border, NO background (toolbar aesthetic)
- [ ] Label buttons: Full styling (primary actions)
- [ ] Ghost buttons: Border on hover only
- [ ] Toolbar buttons visually consistent with each other
- [ ] Branch selector blends with toolbar (minimal styling)
- [ ] All tabs use Base-UI Tabs
- [ ] All menus use Base-UI Menu
- [ ] All accordions use Base-UI Accordion
- [ ] All dialogs use Base-UI Dialog
- [ ] CSS custom properties defined
- [ ] No legacy CSS files remain
- [ ] All tests pass
- [ ] Build succeeds
- [ ] **Visual consistency by sub-type** (not pixel-perfect uniformity)
- [ ] Keyboard navigation works
- [ ] Accessibility passes
- [ ] Bundle size acceptable

---

## Appendix: Base-UI vs Current API Mapping

### Button
```tsx
// BEFORE: Custom button
<button className="git-commit-button" onClick={handleCommit}>Commit</button>

// AFTER: Base-UI Button
import { Button } from '@/components/ui/button';
<Button variant="default" onClick={handleCommit}>Commit</Button>
```

### Tabs
```tsx
// BEFORE: Custom tabs
<div className="tab-button active" onClick={() => handleTabClick(tab.id)} />

// AFTER: Base-UI Tabs
import { Tabs } from '@base-ui/react/tabs';
<Tabs.Root>
  <Tabs.List>
    <Tabs.Trigger value={tab.id}>{tab.title}</Tabs.Trigger>
  </Tabs.List>
</Tabs.Root>
```

### Menu (Dropdown)
```tsx
// BEFORE: Custom dropdown
{isOpen && <div className="branch-dropdown">...</div>}

// AFTER: Base-UI Menu
import { Menu } from '@base-ui/react/menu';
<Menu.Root>
  <Menu.Trigger />
  <Menu.Portal>
    <Menu.Positioner>
      <Menu.Popup>
        <Menu.Item />
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>
</Menu.Root>
```

### Accordion
```tsx
// BEFORE: Custom accordion
<div className="section-header" onClick={toggleCollapsed}>
  <ChevronIcon />
</div>

// AFTER: Base-UI Accordion
import { Accordion } from '@base-ui/react/accordion';
<Accordion.Root>
  <Accordion.Item>
    <Accordion.Trigger />
    <Accordion.Panel />
  </Accordion.Item>
</Accordion.Root>
```

### Dialog
```tsx
// BEFORE: Native prompt
const branchName = window.prompt('Enter new branch name:');

// AFTER: Base-UI Dialog
import { Dialog } from '@/components/ui/dialog';
<Dialog.Root open={isOpen}>
  <Dialog.Title>Enter branch name</Dialog.Title>
  <Dialog.Description>
    <input value={branchName} onChange={...} />
  </Dialog.Description>
  <Dialog.Close onClick={handleConfirm}>OK</Dialog.Close>
</Dialog.Root>
```

### Tooltip
```tsx
// BEFORE: Native title
<button title="Close tab">×</button>

// AFTER: Base-UI Tooltip
import { Tooltip } from '@/components/ui/tooltip';
<Tooltip content="Close tab">
  <button>×</button>
</Tooltip>
```

---

## Resources

### Documentation
- Base-UI: https://base-ui.com/react/components
- shadcn/ui: https://ui.shadcn.com/docs
- Migration guide: https://basecn.dev/docs/get-started/migrating-from-radix-ui

### Reference Projects
- basecn.dev: https://github.com/akash3444/basecn
- shadcn/ui: https://github.com/shadcn-ui/ui

### This Project
- Worktree: `.worktrees/baseui-shadcn-migration/`
- Theme CSS: `.worktrees/baseui-shadcn-migration/src/styles/theme.css`
- Button CSS Module: `.worktrees/baseui-shadcn-migration/src/components/ui/Button.module.css`

---

**Plan generated by Prometheus**
**Date**: 2026-03-11
**Total Tasks**: 29 + 3 (Final Verification)
**Estimated Duration**: 3-4 hours of focused work
**Recommendation**: Run `/start-work baseui-shadcn-migration` to begin execution

