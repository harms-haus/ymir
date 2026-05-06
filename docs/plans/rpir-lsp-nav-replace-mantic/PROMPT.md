# RPIR: Replace Mantic Code Search with LSP Navigation Tools

## Original Request

Remove `mantic` from the `code-search` plugin (including `code_search`, `code_goto`, `code_references` tools). Update the `lsp-integration` plugin to include `lsp_goto_definition` and `lsp_find_references` tools using LSP's goto-definition and find-references protocols.

## Requirements

1. **Remove code-search plugin tools**: Delete `code_search`, `code_goto`, and `code_references` tool registrations and the `mantic` CLI dependency from the code-search plugin.

2. **Add LSP navigation tools**: Implement `lsp_goto_definition` and `lsp_find_references` in the lsp-integration plugin using standard LSP methods:
   - `textDocument/definition` for goto definition
   - `textDocument/references` for find all references

3. **Persistent LSP server management** (Option B): Change the lsp-integration plugin to manage LSP servers efficiently:
   - **Spawn on first use**: Start LSP server when first tool call needs it
   - **Idle cleanup**: Automatically shut down servers after 600s of inactivity (configurable)
   - **Unload cleanup**: Clean up all servers on plugin unload / Hermes unload
   - **Auto-install**: Keep the existing lazy-install behavior (install binary if missing)

4. **Guarantee server readiness**: No matter which direction the agent approaches LSP tools (either by hook for diagnostics or by direct tool use for navigation):
   - The LSP server will always be installed and started/ready
   - The LSP server will be cleaned up on idle/unload

## Scope

- Plugin: `~/.hermes/plugins/code-search/` (remove mantic-dependent tools)
- Plugin: `~/.hermes/plugins/lsp-integration/` (add navigation tools + persistent server management)
- Existing diagnostics functionality must continue to work
- No changes to Ymir application code itself

## Key Constraints

- Keep `ast-grep` tools (`code_grep`, `code_scan`) — only remove mantic-dependent tools
- Preserve existing `lsp_diagnostics` tool behavior
- Python-only changes (no Rust/TS application code)
