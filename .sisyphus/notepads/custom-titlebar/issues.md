# Issues - Custom Titlebar Plan

## Potential Issues

### Tauri Version Compatibility
- Need to verify tauri-controls supports current Tauri version
- Check last commit date and open issues for stability
- Verify npm package name and version

### Linux Window Manager Detection
- GTK vs KDE detection may be complex
- May need platform-specific heuristics
- D-Bus approach might be too heavy

### Wayland Limitations
- Drag region may not work on Wayland
- Need to document this limitation
- May need fallback behavior

### Tab Overflow Behavior
- Window controls must remain visible when tabs overflow
- Need to define min-width for tab area
- Handle edge cases with many tabs

### Accessibility
- Maintain keyboard shortcuts
- Screen reader support for window controls
- Proper ARIA attributes

### High DPI and Multi-monitor
- Window controls must scale correctly
- Handle different DPI settings
- Multi-monitor window positioning

## Known Risks

### Breaking Existing Functionality
- Tab dragging, closing, reordering must not break
- Existing keyboard shortcuts must work
- Window state persistence must not be affected

### Performance
- Platform detection should not block UI
- Hook should cache results
- Minimize re-renders

### Cross-platform Consistency
- Button appearance may vary by platform
- Layout swapping must work correctly on all platforms
- Testing on all three platforms required