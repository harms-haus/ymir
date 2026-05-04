# Terminal Tabs Blank & Unresponsive - Debug Notes

## Bug Description
Terminal UI tabs show blank content and don't respond to typing. Expected: PTY prompt text should be visible and typing should work in the terminal.

## Key Constraints
- NOT the ACP terminals - these are the regular terminal UI tabs
- PTY sessions are ephemeral and may terminate on idle or when tab closes
- Terminal tabs must be stateful on server (single PTY session ID per tab)
- PTY event history must be kept with terminal tab storage
- Unmounting terminal tab content should NOT end the PTY session (only tab close should)
- Main issue: history and PTY events aren't reaching the UI or aren't being rendered properly
- This is NOT a new issue - it's been around a while

## Technology Stack
- Ghostty library for terminal rendering
- React frontend
- WebSocket-based communication
- Server-side PTY session management

## Investigation Focus
1. Ghostty library documentation and usage patterns
2. Check if there's a newer version with fixes
3. Code examples of successful Ghostty integration
4. Verify PTY event flow from server → WebSocket → React → Ghostty renderer
5. Verify PTY session lifecycle management
