# Component Analysis: Layout, TabBar, ResizableSidebar, Pane

## Layout.tsx

### Flex Structure
- Root container: `display: flex`, `height: 100vh`, `width: 100vw`, `overflow: hidden`
- Background color: `var(--background-hex)`

### Component Layout
```
Layout Root (flex, 100vh x 100vw)
├── ResizableSidebar (flex-shrink: 0)
└── Main Content Area (flex: 1, flex-direction: column)
    └── SplitPane (recursive component)
```

### Key Properties
- Main content area: `flex: 1`, `display: flex`, `flexDirection: 'column'`
- `position: 'relative'` for absolute positioning support
- `overflow: 'hidden'` to contain scrollbars

### Integration Points
- Tab position: TabBar is rendered inside Pane, which is inside SplitPane
- No top-level title bar component exists
- Window controls integration should likely happen at the root Layout level

---

## TabBar.tsx

### Current Implementation
- Uses Base-UI TabsRoot, TabsList, TabsTab components
- Height: 35px (from CSS)
- Overflow handling with dropdown menu
- Supports both terminal and browser tab types

### Component Structure
```tsx
TabsRoot (.tab-bar)
├── TabsList (.tab-bar-scroll-container, flex: 1)
│   └── TabsTab (.tab-item, multiple)
│       ├── Icon (terminal $ or browser Globe)
│       ├── Title (.tab-title, flex: 1)
│       ├── Notification Badge (optional)
│       └── Close Button (.tab-close-button)
├── Overflow Menu (.tab-bar-overflow, conditionally rendered)
│   └── MenuRoot with dropdown
├── Browser Tab Button (.tab-bar-browser-button, 32px wide)
└── New Tab Button (.tab-bar-new-button, 32px wide)
```

### Key Props
- `paneId: string`
- `tabs: Tab[]`
- `activeTabId: string | null`
- `onCreateTab: (paneId: string) => void`
- `onCloseTab: (paneId: string, tabId: string) => void`
- `onSelectTab: (paneId: string, tabId: string) => void`
- `onSplitPane?: (paneId: string, direction: 'horizontal' | 'vertical') => void`
- `onCreateBrowserTab?: () => void`

### Width Constraints
- Tab items: min-width 120px, max-width 200px
- Scrollable container: `flex: 1`, `overflow-x: auto`
- Buttons: 28-32px each

### Modification Points
1. **Add window controls container** - can be inserted at the beginning or end of TabsRoot
2. **Adjust flex layout** - window controls need to coexist with scrollable tabs and buttons
3. **State management** - may need to pass window state props (maximized, etc.)

---

## TabBar.css

### Styling Patterns

#### TabBar Root (`.tab-bar`)
- `display: flex`, `align-items: center`
- `height: 35px`
- `background-color: #252526`
- `border-bottom: 1px solid #1e1e1e`
- `overflow: hidden`

#### Colors Used
- Background: `#252526` (tab bar), `#37373d` (active tab)
- Border: `#1e1e1e`
- Text: `#cccccc` (normal), `#ffffff` (active)
- Active indicator: `#007acc` (blue)
- Notification: `#4fc3f7` (light blue)
- Hover: `#2a2d2e`, `#3c3c3c`
- Danger (close hover): `#c75450` (red)

#### Flex Layout
- `.tab-bar-scroll-container`: `flex: 1`, `overflow-x: auto`
- `.tab-item`: `flex-shrink: 0`, `gap: 6px`
- All buttons: `flex-shrink: 0`

#### Transitions
- Background color: `0.15s ease`
- Box shadow: `0.2s ease` (notification)

### Button Dimensions
- Overflow button: 28px wide, 34px high
- Browser tab button: 32px wide, 34px high
- New tab button: 32px wide, 34px high

### Modification Points
1. **Add window controls styles** - new class for window controls container
2. **Adjust flex spacing** - ensure window controls don't break overflow logic
3. **Consider z-index** - window controls may need higher z-index than tab content

---

## ResizableSidebar.tsx

### Current Implementation
- Wraps WorkspaceSidebar with resize handle
- Custom drag implementation (not using react-resizable-panels)
- Width: 200-500px (default 250px)
- Collapse width: 50px

### Component Structure
```tsx
Flex Container (height: 100%)
├── Sidebar Container (variable width, flex-shrink: 0)
│   └── WorkspaceSidebar
└── Resize Handle (4px wide, flex-shrink: 0) [when expanded]
```

### Key Properties
- Sidebar container: `width: currentWidth`, `height: 100%`, `overflow: hidden`, `flex-shrink: 0`
- Resize handle: `width: 4px`, `cursor: col-resize`
- Color: `var(--background-tertiary)` (default), `hsl(var(--primary))` (hover/active)

### Integration Points
- Window controls integration likely independent of sidebar
- Sidebar is separate layout concern

---

## Pane.tsx

### Current Implementation
- Container for TabBar + tab content (Terminal/Browser)
- Flex column layout
- State: selects specific pane from Zustand store to prevent re-renders

### Component Structure
```tsx
ErrorBoundary
└── Flex Container (flex: 1, flex-direction: column)
    ├── TabBar (35px height)
    └── Tab Content Area (flex: 1)
        └── Terminal/Browser (active tab only)
```

### Key Properties
- Root container: `flex: 1`, `display: flex`, `flexDirection: 'column'`
- Tab content area: `flex: 1`, `overflow: hidden`
- TabBar border: `1px solid var(--border-tertiary)`
- Notification glow: `box-shadow: inset 0 0 0 2px var(--notification)`

### Integration Points
- Window controls should be added at a higher level (Layout or TabBar)
- Pane is just a container for tab content

---

## Summary: Window Controls Integration Strategy

### Recommended Approach

**Option 1: Add to TabBar (Preferred)**
- Add window controls container to the right side of `.tab-bar`
- Use `flex-shrink: 0` to ensure controls don't get squished
- Controls can be positioned between buttons or at the far right

**Option 2: Add to Layout**
- Create new TitleBar component at the top of Layout
- Position above ResizableSidebar and main content
- Requires adjusting Layout's flex structure

### Flex Container Modification Points

**TabBar (.tab-bar):**
Current:
```css
display: flex;
align-items: center;
```

Modified for window controls:
```css
display: flex;
align-items: center;
/* No changes needed - flex layout already supports it */
```

**Tab items and buttons:**
- Keep current `flex: 1` on scroll container
- Keep `flex-shrink: 0` on all buttons
- Add window controls container with `flex-shrink: 0`

### Tauri-controls Integration
- Use `tauri-plugin-window-controls` React components
- Place in new window controls container
- Style with theme colors to match TabBar (background `#252526`)
- Ensure proper z-index for clickability

### State Considerations
- Window state (maximized, fullscreen) needs to be accessible
- May need to subscribe to Tauri window events
- Consider passing window state as props to TabBar

---

## Dimensions Reference

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| TabBar | 100% | 35px | Root container |
| Tab Item | 120-200px | 34px | Min-max width |
| Close Button | ~20px | 20px | In tab item |
| Overflow Button | 28px | 34px | Right side |
| Browser Button | 32px | 34px | Right side |
| New Tab Button | 32px | 34px | Right side |
| Window Controls | ~100-150px | 34px | Estimated (minimize, maximize, close) |

### Available Space Calculation
- Total TabBar height: 35px
- Window controls should be 34px to match other buttons
- Window controls width: ~100-150px (3 buttons + spacing)
