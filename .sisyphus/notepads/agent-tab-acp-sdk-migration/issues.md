
## 2026-03-20
- Initial Task 1 delegation failed before touching protocol files; retry with category-only prompt and no unsupported skills.
- Task 2 first pass broke `useAgentStatus` expectations and introduced TypeScript diagnostics in store/state files.
- Task 6 official ACP bridge still breaks `cargo check` because the active WebSocket path becomes `!Send`.
