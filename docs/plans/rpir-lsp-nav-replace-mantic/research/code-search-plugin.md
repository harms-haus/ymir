# Research: code-search Plugin — Current State

## Source Files
- `~/.hermes/plugins/code-search/plugin.yaml` — Plugin manifest
- `~/.hermes/plugins/code-search/__init__.py` — Plugin entry point, binary management
- `~/.hermes/plugins/code-search/tools.py` — Tool handler implementations
- `~/.hermes/plugins/code-search/schemas.py` — JSON Schema definitions for tool parameters

## Plugin Manifest (plugin.yaml)
```yaml
name: code-search
version: "2.0.0"
description: Unified code search plugin combining AST-aware pattern matching (ast-grep)
  with semantic code navigation (Mantic). Provides grep, rule scanning,
  natural-language search, symbol references, and go-to-definition.
provides_tools:
  - code_grep
  - code_scan
  - code_search
  - code_references
  - code_goto
requires_env: []
```

## Binary Management (__init__.py)

Two binaries are managed:

1. **ast-grep** — npm package `@ast-grep/cli`, checked via `_check_ast_grep()`
2. **mantic** — npm package `mantic.sh`, checked via `_check_mantic()`

Binary resolution flow:
- Check session cache (`_installed_binaries` set)
- Ensure npm global bin dir is on PATH (via `npm config get prefix`)
- `shutil.which(binary)` to check availability
- If missing, run `npm install -g <package>` (120s timeout)
- After registration, `_resolve_binaries()` updates module-level `tools.AST_GREP` and `tools.MANTIC` paths via `shutil.which()`

Default binary paths in tools.py:
- `AST_GREP = shutil.which("ast-grep") or "/usr/local/bin/ast-grep"`
- `MANTIC = shutil.which("mantic") or "/root/.hermes/node/bin/mantic"`

## Tool Registrations

### 1. code_grep (ast-grep backed)
- **Schema**: `CODE_GREP_SCHEMA`
- **Handler**: `tools.code_grep()`
- **Check fn**: `_check_ast_grep()`
- **Emoji**: 🔎
- **Purpose**: AST-aware structural pattern search via `ast-grep run`
- **CLI invocation**: `ast-grep run -p <pattern> -l <lang> [options] [paths...]`
- **Key options**:
  - `-r <rewrite>` — replacement string
  - `--selector <kind>` — AST node kind to extract
  - `--strictness <level>` — cst/smart/ast/relaxed/signature/template
  - `--debug-query` — print parsed query AST
  - `--json=<format>` — pretty/stream/compact
  - `--files-with-matches` — files only mode
  - `-C/-B/-A` — context lines
  - `-j <threads>` — parallelism
  - `--follow` — follow symlinks
  - `--no-ignore <type>` — disable ignore rules
  - `--globs <pattern>` — include/exclude files
  - `--stdin` — read from stdin
- **Returns**: JSON with `{success, matches, count}` or `{error}`

### 2. code_scan (ast-grep backed)
- **Schema**: `CODE_SCAN_SCHEMA`
- **Handler**: `tools.code_scan()`
- **Check fn**: `_check_ast_grep()`
- **Emoji**: 📋
- **Purpose**: Check code against YAML rule definitions via `ast-grep scan`
- **CLI invocation**: `ast-grep scan [options] [paths...]`
- **Key options**:
  - `--rule <path>` — YAML rule file path
  - `--inline-rules <text>` — inline YAML rule text
  - `--format <fmt>` — github/sarif
  - `--report-style <style>` — rich/medium/short
  - `--include-metadata` — include rule metadata
  - `--filter <regex>` — filter rules by ID
  - `--<severity>=<rule_ids>` — severity overrides
  - Same output options as code_grep (--json, --files-with-matches, context, threads, etc.)
  - `--max-results <n>` — limit results
- **Returns**: JSON with `{success, matches, count}` or `{error}`

### 3. code_search (mantic backed) — TO BE REMOVED
- **Schema**: `CODE_SEARCH_SCHEMA`
- **Handler**: `tools.code_search()`
- **Check fn**: `_check_mantic()`
- **Emoji**: 🧠
- **Purpose**: Natural-language / semantic code search via Mantic
- **CLI invocation**: `mantic <query> [options]`
- **Key options**:
  - `--files` — files-only output
  - `--json` — JSON output
  - `-p <path>` — restrict to directory
  - `--code` / `--config` / `--test` — filter by file type
  - `--semantic` — neural reranking
  - `--fast` — fast mode
  - `--impact` — dependency analysis / blast radius
  - `--include-generated` — include generated files
  - `--session <id>` — session ID for context carryover
  - `--quiet` — minimal output
- **Returns**: JSON with `{success, files, snippets, count}` or `{error}`
- **Timeout**: 60s default

### 4. code_references (mantic backed) — TO BE REMOVED
- **Schema**: `CODE_REFERENCES_SCHEMA`
- **Handler**: `tools.code_references()`
- **Check fn**: `_check_mantic()`
- **Emoji**: 🔗
- **Purpose**: Find all references/usages of a named symbol via Mantic
- **CLI invocation**: `mantic references <symbol> [options]`
- **Key options**:
  - `--json` — JSON output
  - `-d <dir>` — directory to search
- **Returns**: JSON with `{success, references, count}` or `{error}`
- **Timeout**: 30s default

### 5. code_goto (mantic backed) — TO BE REMOVED
- **Schema**: `CODE_GOTO_SCHEMA`
- **Handler**: `tools.code_goto()`
- **Check fn**: `_check_mantic()`
- **Emoji**: 📍
- **Purpose**: Find definition of a named symbol via Mantic
- **CLI invocation**: `mantic goto <symbol> [options]`
- **Key options**:
  - `--json` — JSON output
  - `-p <path>` — directory to search
- **Returns**: JSON with `{success, ...definition data}` or `{error}`
- **Timeout**: 30s default

## Schema Descriptions Cross-References

Each schema description references other tools:
- `code_grep` description mentions: code_scan, code_search, code_references, code_goto
- `code_scan` description mentions: code_grep, code_search, code_references, code_goto
- `code_search` description mentions: code_grep, code_scan, code_references, code_goto
- `code_goto` description mentions: code_references, code_search, code_grep, code_scan
- `code_references` description mentions: code_goto, code_search, code_grep, code_scan

**Implication**: When removing mantic tools, all schema descriptions that reference them must be updated.

## Summary: What Gets Removed

| Item | File | Lines (approx) |
|------|------|----------------|
| `code_search` registration | `__init__.py` | lines 107-114 |
| `code_references` registration | `__init__.py` | lines 115-122 |
| `code_goto` registration | `__init__.py` | lines 123-130 |
| `_check_mantic()` function | `__init__.py` | lines 76-78 |
| `tools.MANTIC` path resolution | `__init__.py` | line 84 |
| `code_search()` handler | `tools.py` | lines 316-403 |
| `code_references()` handler | `tools.py` | lines 406-445 |
| `code_goto()` handler | `tools.py` | lines 448-485 |
| `MANTIC` constant | `tools.py` | line 12 |
| `CODE_SEARCH_SCHEMA` | `schemas.py` | lines 331-409 |
| `CODE_GOTO_SCHEMA` | `schemas.py` | lines 415-455 |
| `CODE_REFERENCES_SCHEMA` | `schemas.py` | lines 461-501 |
| `code_search` in provides_tools | `plugin.yaml` | line 10 |
| `code_references` in provides_tools | `plugin.yaml` | line 11 |
| `code_goto` in provides_tools | `plugin.yaml` | line 12 |
| `mantic` npm package | `__init__.py` | line 78 (`mantic.sh`) |
