# Research: LSP Protocol Messages for Navigation

## textDocument/definition (Goto Definition)

### Specification
- **Method**: `textDocument/definition`
- **Direction**: Client → Server (request)
- **Since**: LSP 3.0
- **Server capability**: `definitionProvider` (boolean or `{workDoneProgress?: boolean}`)

### Request Parameters
```json
{
    "textDocument": {
        "uri": "file:///path/to/file.py"
    },
    "position": {
        "line": 10,
        "character": 5
    }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| textDocument | TextDocumentIdentifier | Yes | The document containing the symbol |
| position | Position | Yes | The cursor position (0-indexed line, 0-indexed character) |
| workDoneToken | ProgressToken | No | Optional work done progress token |
| partialResultToken | ProgressToken | No | Optional partial result token |

### Response
Returns `Definition` which is `Location | Location[] | LocationLink[] | null`

**Location format:**
```json
{
    "uri": "file:///path/to/definition.py",
    "range": {
        "start": {"line": 5, "character": 4},
        "end": {"line": 5, "character": 15}
    }
}
```

**LocationLink format (if client advertises linkSupport):**
```json
{
    "originSelectionRange": {
        "start": {"line": 10, "character": 5},
        "end": {"line": 10, "character": 15}
    },
    "targetUri": "file:///path/to/definition.py",
    "targetRange": {
        "start": {"line": 5, "character": 0},
        "end": {"line": 5, "character": 20}
    },
    "targetSelectionRange": {
        "start": {"line": 5, "character": 4},
        "end": {"line": 5, "character": 15}
    }
}
```

### Client capability to enable LocationLink
```json
{
    "textDocument": {
        "definition": {
            "linkSupport": true
        }
    }
}
```

## textDocument/references (Find All References)

### Specification
- **Method**: `textDocument/references`
- **Direction**: Client → Server (request)
- **Since**: LSP 3.0
- **Server capability**: `referencesProvider` (boolean or `{workDoneProgress?: boolean}`)

### Request Parameters
```json
{
    "textDocument": {
        "uri": "file:///path/to/file.py"
    },
    "position": {
        "line": 10,
        "character": 5
    },
    "context": {
        "includeDeclaration": true
    }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| textDocument | TextDocumentIdentifier | Yes | The document containing the symbol |
| position | Position | Yes | The cursor position (0-indexed) |
| context | ReferenceContext | Yes | Reference context |
| context.includeDeclaration | boolean | Yes | Whether to include the declaration itself |
| workDoneToken | ProgressToken | No | Optional work done progress token |
| partialResultToken | ProgressToken | No | Optional partial result token |

### Response
Returns `Location[] | null` — array of all reference locations.

Each Location:
```json
{
    "uri": "file:///path/to/referencing_file.py",
    "range": {
        "start": {"line": 20, "character": 10},
        "end": {"line": 20, "character": 20}
    }
}
```

## Server Support

### Servers known to support both methods:
| Server | definition | references | Notes |
|--------|-----------|------------|-------|
| pyright/pyright-langserver | Yes | Yes | Full support |
| typescript-language-server | Yes | Yes | Full support |
| rust-analyzer | Yes | Yes | Full support |
| clangd | Yes | Yes | Full support |
| gopls | Yes | Yes | Full support |
| jdtls | Yes | Yes | Full support |
| bash-language-server | Yes | Yes | Basic support |
| intelephense | Yes | Yes | PHP |
| yaml-language-server | Yes | Limited | References limited |
| vscode-json-languageserver | Yes | No | No references support |
| lua-language-server | Yes | Yes | Full support |
| marksman | Yes | Yes | Markdown |

### Almost all major LSP servers support goto-definition. Find-references is also widely supported but may return empty results for dynamically-typed languages or for symbols that the server cannot resolve.

## Initialization Requirements for Navigation

The current `initialize` request sends minimal capabilities:
```json
{
    "processId": null,
    "rootUri": "file:///workspace/root",
    "capabilities": {
        "textDocument": {
            "publishDiagnostics": {"relatedInformation": true}
        }
    }
}
```

For navigation to work properly, the client should also advertise:
```json
{
    "capabilities": {
        "textDocument": {
            "definition": {
                "linkSupport": true
            }
        }
    }
}
```

**Important**: The server's `initialize` response contains `capabilities` that indicate what the server supports. The client MUST check `result.capabilities.definitionProvider` and `result.capabilities.referencesProvider` before sending navigation requests.

Additionally, for navigation across files, the server needs to know about opened documents. The current model opens only one file via `textDocument/didOpen`. For navigation, the server may need:
- The target file's content (if it hasn't been opened)
- Potentially workspace-wide indexing (servers like pyright and rust-analyzer do this automatically)

## Workspace-wide Considerations

For `textDocument/definition` and `textDocument/references` to work across the codebase:
1. The LSP server needs a workspace root (already handled by `resolve_workspace_root`)
2. The server needs time to index the workspace (especially for pyright, rust-analyzer, gopls)
3. Some servers may need `workspace/didChangeWatchedFiles` notifications
4. The `initialized` notification should include `initializationOptions` if required by the server

**Indexing delay**: Servers like pyright and rust-analyzer perform background indexing. Navigation requests sent before indexing completes may return incomplete or empty results. A short delay (1-3s) after `initialized` before sending navigation requests is recommended.

## Comparison: LSP Navigation vs Mantic CLI

| Aspect | Mantic CLI | LSP Navigation |
|--------|-----------|----------------|
| Input | Symbol name (string) | File URI + Position |
| Indexing | Built-in scan at query time | Server-based, persistent |
| Speed | Slower (scan per query) | Fast (indexed) |
| Accuracy | Good for common patterns | High (AST-level precision) |
| Cross-file | Yes | Yes |
| Setup | None (CLI tool) | Requires server spawn + init |
| State | Stateless | Stateful (persistent server) |

**Key difference**: Mantic takes a symbol name and searches. LSP takes a file+position and looks up at the AST level. This means the LSP approach requires the agent to first locate the symbol position (e.g., via code_grep) before using `lsp_goto_definition`, OR the agent needs to know the file and position. However, LSP definition/references are more precise since they operate at the AST level.
