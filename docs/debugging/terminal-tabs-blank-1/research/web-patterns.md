# Web Research: ghostty-web v0.4.0 — API, Known Issues, Usage Patterns

## Package Information

**Dependency**: `apps/web/package.json`
```json
"ghostty-web": "^0.4.0"
```

This resolves to `ghostty-web@0.4.x` (semver-compatible with 0.4.0). The caret (`^`) means it could have been updated to any `0.4.x` version.

## ghostty-web API Usage (as found in codebase)

### Import
```tsx
import { init, Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
```

Three exports are used:
- `init()` — async function that loads the WASM module
- `Terminal` — class for creating terminal instances (aliased as `GhosttyTerminal`)
- `FitAddon` — addon class for auto-resizing the terminal to its container

### Initialization Pattern
```tsx
// Module-level singleton
let initPromise: Promise<void> | null = null;

export function initializeGhostty(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}
```

This is the standard pattern for WASM-based libraries — the `init()` call is expensive (downloads and instantiates WASM), so it's done once globally.

### Terminal Instance Creation
```tsx
const term = new GhosttyTerminal({
  fontSize: 13,
  theme: {
    background: terminalBg || '#0d1117',
    foreground: terminalFg || '#e6edf3',
  },
  fontFamily: fontMono || 'ui-monospace, SFMono-Regular, monospace',
});

term.open(containerRef.current);
```

Constructor options:
- `fontSize`: number
- `theme`: `{ background: string, foreground: string }`
- `fontFamily`: string

### Terminal Methods Used
- `term.open(container: HTMLElement)` — renders terminal into DOM element
- `term.write(data: string)` — writes terminal output
- `term.resize(cols: number, rows: number)` — sets terminal dimensions
- `term.onData(callback: (data: string) => void)` — subscribes to user input
- `term.onResize(callback: (size: { cols, rows }) => void)` — subscribes to resize events
- `term.loadAddon(addon: FitAddon)` — loads the fit addon
- `term.dispose()` — cleans up the terminal instance

### FitAddon Usage
```tsx
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
fitAddon.fit();
// ResizeObserver triggers fitAddon.fit() on container resize
fitAddon.dispose(); // cleanup
```

## Known Sanitization Requirements

The codebase implements a `sanitizeTerminalData()` function to strip unterminated extended escape sequences:

```tsx
function sanitizeTerminalData(data: string): string {
  let sanitized = data;
  // Strip unterminated extended sequences: ESC + [P]_^X + content without ESC\
  sanitized = sanitized.replace(
    /\x1b[P\]_^X](?:(?!\x1b\\)[\s\S])*?(?=\x1b[^\x1b\\]|$)/g,
    ''
  );
  // Strip orphan ST sequences
  sanitized = sanitized.replace(/\x1b\\/g, '');
  return sanitized;
}
```

This targets DCS (`ESC P`), OSC (`ESC ]`), APC (`ESC _`), PM (`ESC ^`), and SOS (`ESC X`) sequences that crash the ghostty-web parser when malformed.

## Write Size Limitation
```tsx
const MAX_WRITE_SIZE = 8192;
```

Writes larger than 8KB are truncated. This could cause issues with large history payloads.

## xterm.js Foundation

ghostty-web is built on xterm.js (the most popular web terminal emulator). The API is very similar:
- `Terminal` constructor and `open()` method
- `write()` for output
- `onData()` for input
- Addon system (FitAddon, etc.)
- `dispose()` for cleanup

The key difference from xterm.js is the WASM-based parser/renderer which provides better performance but may be more sensitive to malformed escape sequences.

## Potential ghostty-web v0.4.0 Issues

### 1. WASM Module Loading in Non-Secure Contexts
The WASM module may have specific requirements for loading (CORS, CSP, etc.). If the Vite dev server or production build has incorrect MIME types or CSP headers for `.wasm` files, the `init()` call would fail silently or reject.

### 2. CSS Variable Resolution
The terminal reads CSS custom properties at init time:
```tsx
const terminalBgRaw = getComputedStyle(root).getPropertyValue('--terminal-bg').trim();
const terminalFgRaw = getComputedStyle(root).getPropertyValue('--terminal-fg').trim();
```

If these CSS variables aren't defined at the time of terminal creation, the fallback values (`'#0d1117'`, `'#e6edf3'`) are used. However, the raw values might be empty strings or partial HSL values that result in invalid CSS when passed to ghostty-web.

### 3. Container Size at Open Time
If `term.open()` is called when the container has zero dimensions (not yet laid out by the browser), the terminal may render at 0x0 size. The `fitAddon.fit()` call after `open()` should fix this, but there's a race condition:

1. `term.open(containerRef.current)` — container may not have layout yet
2. `fitAddon.fit()` — should measure and resize
3. `ResizeObserver` — future resizes

If `fitAddon.fit()` is called too early (before CSS layout is computed), the terminal stays at 0x0.

### 4. Version Compatibility with xterm.js Addons
ghostty-web v0.4.0 may use a specific internal xterm.js version. If the FitAddon is imported from a different xterm.js version than what ghostty-web bundles internally, there could be compatibility issues.

### 5. WASM Memory Limits
If the terminal accumulates too much scrollback history in the WASM buffer, it could hit memory limits. The codebase mitigates this with:
- `MAX_WRITE_SIZE = 8192` truncation
- `limit: 1000` on history requests

## Alternative Libraries (for comparison)

Other projects use different approaches:
- **xterm.js** (direct): Pure JS, larger bundle, more flexible
- **ghostty-web**: WASM-based, smaller bundle, more performant, but stricter on escape sequences
- **node-pty + xterm.js**: Server-side PTY with WebSocket relay (what ymir effectively does, but with ghostty-web as the renderer)

## npm Registry Check

The package uses `^0.4.0` which means it accepts any `0.4.x` version. Without direct npm access, we cannot verify if newer versions (0.5.x, 0.6.x, etc.) exist. The `package-lock.json` would show the exact resolved version.

## Ghostty Official Documentation

The official Ghostty documentation is at https://ghostty.org/. The `ghostty-web` project is a community-driven WASM port of Ghostty's terminal rendering engine. Key resources:
- GitHub: https://github.com/ghostty-org/ghostty (main project)
- The web/WASM port may be in a separate repo or as a feature branch

## Summary of Web-Specific Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| WASM init failure | Critical | No error handling — terminal stays blank forever |
| Container 0x0 at open | High | fitAddon.fit() should fix, but race possible |
| Malformed escape sequences | Medium | sanitizeTerminalData() strips known-bad patterns |
| CSS var resolution | Low | Fallback values provided |
| xterm.js addon mismatch | Low | ghostty-web bundles its own addons |
| Large write truncation | Low | 8KB limit, unlikely to affect normal PTY output |
