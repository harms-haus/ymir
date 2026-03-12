# Decisions - Custom Titlebar Plan

## Architecture Decisions

### Window Controls Approach
- Use tauri-controls community plugin for native-looking buttons
- Both backend Rust AND frontend TypeScript for platform detection
- Layout swapping via flex-direction toggle (row vs row-reverse)

### Platform Detection Strategy
- macOS: Always left button position
- Windows: Always right button position  
- Linux: Right by default, with window manager detection for GTK/KDE

### Integration Points
- Window controls integrated into TabBar component
- Layout component handles flex-direction based on button position
- Tab bar background is draggable with data-tauri-drag-region attribute

## Technical Decisions

### Component Structure
- WindowControls.tsx: Standalone component for window control buttons
- usePlatformDetection.ts: Hook for platform detection and button position
- Modified TabBar.tsx: Add drag functionality and window controls
- Modified Layout.tsx: Add flex-direction toggle based on button position

### Testing Strategy
- Unit tests for platform detection logic
- E2E tests with Playwright for window controls and drag functionality
- Integration tests for layout swapping

## Constraints
- Must not break existing tab functionality
- Must maintain keyboard shortcuts
- Must work cross-platform (macOS, Windows, Linux)
- Must handle tab overflow correctly