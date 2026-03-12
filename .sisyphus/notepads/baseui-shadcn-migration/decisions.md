# Decisions - Base-UI + shadcn/ui Migration

## Architectural Choices

### 1. Path Alias Configuration
**Decision**: Added explicit `@/components` and `@/lib` aliases to tsconfig.json

**Rationale**:
- Project already had `@/*` wildcard alias, which technically covers these paths
- Explicit aliases make imports more readable: `@/components/Button` vs `@/components/Button`
- Matches shadcn/ui CLI expectations for component imports
- No performance impact - TypeScript resolves aliases at compile time

### 2. components.json CSS Path
**Decision**: Pointed components.json to `src/styles/theme.css` instead of `src/styles/globals.css`

**Rationale**:
- Project already uses `theme.css` for global styles
- Avoiding file duplication by using existing file
- shadcn/ui components will work with any global CSS file
- File can be renamed later if needed (single source of truth)

### 3. Tailwind CSS Configuration
**Decision**: Created components.json with Tailwind configuration, but did NOT install Tailwind

**Rationale**:
- Current task scope: Install Base-UI + shadcn/ui dependencies only
- Tailwind CSS setup is a separate concern that requires:
  - Installing Tailwind CSS and dependencies
  - Creating tailwind.config.js
  - Updating postcss config
  - Integrating with existing CSS Modules approach
- components.json allows future Tailwind setup without breaking changes
- Project may use a hybrid approach (Base-UI + Tailwind + CSS Modules)

### 4. Dependency Resolution Strategy
**Decision**: Used bun instead of npm for installation

**Rationale**:
- Project uses bun as the package manager (evidenced by bun.lock and scripts)
- bun is faster than npm for installs
- Consistency with existing tooling
- Removed package-lock.json to avoid conflicts

### 5. Version Selection
**Decision**: Installed exact versions with caret ranges from task requirements

**Rationale**:
- Ensures reproducibility across environments
- Allows patch updates automatically (^ prefix)
- Prevents major breaking changes
- Versions specified in plan:
  - class-variance-authority: ^0.7.0
  - clsx: ^2.1.0
  - tailwind-merge: ^2.2.0
  - lucide-react: ^0.460.0

## Future Considerations

### Tailwind Integration
If full Tailwind CSS support is needed:
1. Install tailwindcss, postcss, autoprefixer
2. Create tailwind.config.js with content paths
3. Create postcss.config.js
4. Add Tailwind directives to theme.css
5. Consider migrating CSS Modules to Tailwind classes (gradual approach)

### Base-UI Usage Pattern
- @base-ui/react provides headless, accessible primitives
- Can be used directly or wrapped in custom components
- Consider creating Base-UI adapters for existing components
- Migration path: identify reusable patterns → create Base-UI versions → replace usage
