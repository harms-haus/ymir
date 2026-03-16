# T10: CSS Theme + Design Tokens - Learnings

## Date: 2026-03-16

### Implementation Details

1. **CSS Custom Properties Strategy**
   - Used shadcn/ui dark theme preset as base (auHhe6q)
   - All colors in HSL format: `hsl(var(--token-name))`
   - Semantic token naming for maintainability

2. **Color Token Categories**
   - **Base colors**: background, foreground, card, popover, primary, secondary, muted, accent, destructive
   - **Interactive states**: input, border, ring
   - **Application-specific**: status dots, panels, terminal

3. **Status Dot Colors**
   - Working: Green (#22c55e) → HSL: 142 70% 45%
   - Idle: Gray (#71717a) → HSL: 240 4% 46%
   - Waiting: Yellow (#eab308) → HSL: 48 93% 47%
   - Used direct HSL values for consistency

4. **Panel Backgrounds**
   - Sidebar: Slightly lighter than main background
   - Main: Same as base background
   - Project: Slightly darker for visual hierarchy

5. **Testing Approach**
   - Created vitest configuration with jsdom environment
   - Tests verify CSS custom properties are present on document root
   - Separate test for status color requirements
   - All tests passing (2/2)

6. **Project Setup**
   - Installed vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom
   - Added test scripts: `npm test` and `npm run test:run`
   - Created test setup file with jest-dom imports

### Key Decisions

1. **No Light Mode**: App is dark-only per requirements
2. **No Theme Switching**: Simplified implementation, no provider needed
3. **CSS Import Order**: Theme imported before component imports in main.tsx
4. **Animation Classes**: Added status-dot-pulse and status-dot-flash classes for dynamic states

### Verification Checklist

- [x] theme.css contains all listed CSS custom properties
- [x] All color tokens use HSL format
- [x] Status dot colors match requirements
- [x] Panel backgrounds have subtle visual differentiation
- [x] Font stacks defined for sans-serif and monospace
- [x] Spacing tokens defined at all 5 levels
- [x] Unit test passes (2/2 tests)
- [x] Theme imported before component imports
- [x] No hardcoded color values in component CSS

### Next Steps

- T9 (App Shell) will depend on these theme variables
- Monaco and ghostty-web themes to be customized separately
