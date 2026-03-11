# Issues - Base-UI + shadcn/ui Migration

## Installation Issues

### Initial bun add Timeout
**Issue**: `bun add` command timed out after 120 seconds

**Root Cause**:
- Project had both `package-lock.json` (npm) and `bun.lock` (bun)
- Conflicting lock files caused resolution to hang

**Resolution**:
- Removed `package-lock.json`
- Retried `bun add` command
- Installation completed successfully in ~500ms

**Impact**: Low - Single retry required, no data loss

**Prevention**:
- Stick to single package manager (bun)
- Do not commit both package-lock.json and bun.lock
- Add .npmrc or bunfig.toml to enforce preferred manager

## Known Limitations

### Tailwind CSS Not Configured
**Status**: Warning - Not blocking, but prevents full shadcn/ui functionality

**Details**:
- Tailwind CSS is not installed in the project
- shadcn/ui CLI may fail when adding components
- components.json references tailwind.config.js which doesn't exist

**Workaround**:
- Components can still be used with Base-UI primitives
- Custom styling can use CSS Modules
- Tailwind configuration can be added later without breaking changes

**Next Steps**:
- Install Tailwind CSS if shadcn/ui components are needed
- Consider hybrid approach: Base-UI + CSS Modules + Tailwind

### Bundle Size Warning
**Status**: Optimization suggestion, not an error

**Details**:
- Vite reports bundle > 500 kB (606.24 kB)
- Suggests code-splitting with dynamic imports
- Related to Tauri API modules, not new dependencies

**Impact**: Low - Performance recommendation only
