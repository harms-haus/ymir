# Research: Impact of Removing Mantic from code-search Plugin

## External References to Mantic

Searched across:
- `/root/ymir` (project codebase)
- `/root/.hermes` (Hermes home: plugins, configs, sessions, logs)

### Results

**No code references to mantic found outside the code-search plugin directory.**

Specifically:
- No imports of mantic in any Python file
- No CLI calls to mantic outside `tools.py`
- No configuration references to mantic binary or npm package
- No other plugin depends on mantic
- No workflow/CI references to mantic

The only references found are:
1. `~/.hermes/plugins/code-search/` — The plugin itself (target for removal)
2. `~/.hermes/config.yaml` line 457 — `code-search` in enabled plugins list
3. `docs/plans/rpir-lsp-nav-replace-mantic/PROMPT.md` — This feature request
4. Old agent logs (`~/.hermes/logs/`) — Historical log entries from previous sessions that attempted to read code-search files

## References to code-search Tools

Searched for `code_search`, `code_goto`, `code_references` in the codebase:

**Results**: Only found in PROMPT.md. No other code references these tool names.

### Implications for Schema Description Updates

The schema descriptions in `schemas.py` cross-reference tools:
- `code_grep` description says: "Use code_search for natural-language / semantic code queries. Use code_references to find usages of a specific named symbol. Use code_goto to jump to a symbol's definition."
- `code_scan` description says: "Use code_search for natural-language code queries. Use code_references or code_goto for symbol-level navigation."

**Required changes**: These descriptions must be updated to remove references to removed tools. Options:
1. Remove the cross-references entirely
2. Replace with references to new LSP tools (e.g., "Use lsp_goto_definition to find a symbol's definition")
3. Recommend `code_grep` as the alternative for symbol searches

## plugin.yaml Changes

Current:
```yaml
provides_tools:
  - code_grep
  - code_scan
  - code_search
  - code_references
  - code_goto
```

After removal:
```yaml
provides_tools:
  - code_grep
  - code_scan
```

The `provides_tools` list is used by the Hermes plugin loader to advertise available tools. Removing entries prevents the framework from trying to load those tools.

## __init__.py Changes

Lines to remove:
1. `_check_mantic()` function (lines 76-78)
2. `tools.MANTIC` in `_resolve_binaries()` (line 84)
3. Three `ctx.register_tool()` calls for code_search, code_references, code_goto (lines 107-130)

## tools.py Changes

Remove:
1. `MANTIC` constant (line 12)
2. `code_search()` function (lines 316-403)
3. `code_references()` function (lines 406-445)
4. `code_goto()` function (lines 448-485)

Keep:
1. `AST_GREP` constant
2. `code_grep()` function
3. `code_scan()` function

## schemas.py Changes

Remove:
1. `CODE_SEARCH_SCHEMA` (lines 331-409)
2. `CODE_GOTO_SCHEMA` (lines 415-455)
3. `CODE_REFERENCES_SCHEMA` (lines 461-501)

Update:
1. `_FILE_TYPE` enum — only used by CODE_SEARCH_SCHEMA, can be removed
2. Schema descriptions for `code_grep` and `code_scan` that reference removed tools

## No Config Impact

The `~/.hermes/config.yaml` has:
```yaml
plugins:
  enabled:
    - code-search
```

This enables the plugin, not individual tools. After removal, the plugin still provides `code_grep` and `code_scan`, so the config entry should remain. No config changes needed.

## No Dependencies on Mantic Elsewhere

- `lsp-integration` plugin has zero references to mantic
- No other Hermes plugins reference mantic
- No Ymir application code references mantic
- No session files actively reference mantic tool calls (old logs are read-only artifacts)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Broken config references | None | N/A | No config references to mantic |
| Other plugins depending on mantic | None | N/A | No other plugins use mantic |
| User workflows using mantic tools | Low-Medium | Medium | Users may have sessions that call code_search/code_goto/code_references. These will fail. Mitigation: The new LSP tools provide equivalent functionality. |
| Stale agent.log references | None | N/A | Logs are read-only historical data |
| Schema description cross-references | High | Low | Must be updated to avoid confusing the LLM |

## Migration Path for Users

When the mantic tools are removed:
1. `code_search` (natural language search) → No direct replacement. Users can use `code_grep` with AST patterns, or external search tools. This is a capability gap but acceptable per the feature request.
2. `code_goto` (symbol definition) → Replaced by `lsp_goto_definition` in lsp-integration plugin
3. `code_references` (find symbol usages) → Replaced by `lsp_find_references` in lsp-integration plugin

The LSP tools require the LSP server to be running and the file to be opened, which is a different workflow than Mantic's symbol-name-based search. The agent will need to adapt its approach:
- Old: "Find definition of `MyClass`" → `code_goto(symbol="MyClass")`
- New: "Find definition of `MyClass`" → First `code_grep` to find the class, then `lsp_goto_definition` at the position, OR `lsp_goto_definition` if the file and position are already known

## Summary

Removing mantic from the code-search plugin is **low risk** from a codebase perspective:
- Zero external code dependencies on mantic
- No config changes needed
- Clean removal boundaries within the plugin directory

The primary consideration is **user experience**: the LSP-based navigation tools have a different interface (file+position vs symbol name) and require a running LSP server. This is addressed by the persistent server management changes in the lsp-integration plugin.
