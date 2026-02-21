# Architecture Proposal: cclsp Refactoring

> Prepared by the ensemble review team (Alpha, Bravo, Charlie)
> Date: 2026-02-21

## 1. Current State Summary

### Component Inventory

| Component | File | Lines | Responsibility |
|-----------|------|-------|----------------|
| MCP Server | `index.ts` | ~1200 | Entry point, tool registration, request routing |
| LSP Client | `src/lsp-client.ts` | ~1880 | Server lifecycle, JSON-RPC, document sync, all LSP ops |
| Types | `src/types.ts` | ~200 | LSP protocol type definitions |
| Utils | `src/utils.ts` | ~17 | Path/URI conversions |
| File Editor | `src/file-editor.ts` | ~318 | Atomic workspace edit application |
| File Scanner | `src/file-scanner.ts` | ~169 | Directory scanning with gitignore |
| Language Servers | `src/language-servers.ts` | ~222 | Pre-configured server registry |
| Setup Wizard | `src/setup.ts` | ~711 | Interactive CLI configuration |
| Adapter Types | `src/lsp/adapters/types.ts` | ~88 | ServerAdapter interface |
| Adapter Registry | `src/lsp/adapters/registry.ts` | ~44 | Singleton adapter lookup |
| Vue Adapter | `src/lsp/adapters/vue.ts` | ~66 | Vue Language Server support |
| Pyright Adapter | `src/lsp/adapters/pyright.ts` | ~45 | Pyright timeout extensions |

### Strengths (S1-S7)

- **S1**: Adapter pattern for non-standard LSP servers is well-designed and extensible
- **S2**: Atomic file editing with backup/rollback and symlink awareness is production-quality
- **S3**: Server preloading via file scanning reduces first-request latency
- **S4**: Configurable restart intervals improve long-running stability
- **S5**: Clean MCP SDK integration with proper lifecycle management
- **S6**: Gitignore-aware file scanning prevents indexing irrelevant files
- **S7**: Strong TypeScript typing throughout the codebase

### Weaknesses (W1-W10)

- **W1**: `index.ts` is a God Handler -- 12 tools registered via if/else chain with massive duplication
- **W2**: `lsp-client.ts` is a 1880-line monolith mixing 5+ concerns
- **W3**: `ServerState` interface duplicated between `lsp-client.ts` and `adapters/types.ts`
- **W4**: `customizeInitializeParams` defined in adapter interface but never called by `startServer()`
- **W5**: `isMethodSupported` and `provideFallback` in adapter interface are unused anywhere
- **W6**: Hardcoded version `'0.1.0'` in index.ts vs `'0.7.0'` in package.json
- **W7**: `mcp-tools.test.ts` tests a `use_zero_index` parameter that does not exist in the implementation
- **W8**: No structured logging -- uses raw `process.stderr.write` throughout (117 occurrences in `lsp-client.ts`)
- **W9**: Constructor in `LSPClient` calls `process.exit(1)` instead of throwing
- **W10**: No graceful degradation when individual LSP servers fail

### Actual Tool Inventory (12 tools in `index.ts`)

| Tool | LSPClient Method | LSP Method |
|------|-----------------|------------|
| `find_definition` | `findDefinition()` | `textDocument/definition` |
| `find_references` | `findReferences()` | `textDocument/references` |
| `find_implementation` | `findImplementation()` | `textDocument/implementation` |
| `rename_symbol` | `renameSymbol()` | `textDocument/rename` |
| `rename_symbol_strict` | `renameSymbol()` | `textDocument/rename` (with validation) |
| `get_diagnostics` | `getDiagnostics()` | diagnostics cache query |
| `get_hover` | `hover()` | `textDocument/hover` |
| `find_workspace_symbols` | `findSymbolsByName()` | `workspace/symbol` |
| `prepare_call_hierarchy` | `prepareCallHierarchy()` | `textDocument/prepareCallHierarchy` |
| `get_incoming_calls` | `incomingCalls()` | `callHierarchy/incomingCalls` |
| `get_outgoing_calls` | `outgoingCalls()` | `callHierarchy/outgoingCalls` |
| `restart_server` | `restartServers()` | N/A (lifecycle) |

## 2. Proposed Architecture

### 2.1 Module Structure

```
src/
  tools/
    registry.ts          # ToolDefinition type + registerTools()
    navigation.ts        # find_definition, find_references, find_implementation
    hover.ts             # get_hover (standalone - different return shape)
    symbols.ts           # find_workspace_symbols, prepare_call_hierarchy, get_incoming_calls, get_outgoing_calls
    refactoring.ts       # rename_symbol, rename_symbol_strict
    diagnostics.ts       # get_diagnostics
    server.ts            # restart_server
    helpers.ts           # Shared: resolvePosition, formatLocation, parseArguments
  lsp/
    json-rpc.ts          # JsonRpcTransport: message framing, send/receive, correlation
    server-manager.ts    # ServerManager: spawn, restart, lifecycle, adapter integration
    document-manager.ts  # DocumentManager: didOpen/didChange/didClose tracking
    operations.ts        # LspOperations: definition, references, rename, symbols, hover, etc.
    diagnostics.ts       # DiagnosticsCache: store, query, invalidate
    config.ts            # ConfigLoader: load, validate, env var resolution
    types.ts             # All LSP + internal types (single source of truth)
    adapters/
      types.ts           # ServerAdapter interface (cleaned: remove dead methods)
      registry.ts        # AdapterRegistry
      vue.ts             # Vue adapter
      pyright.ts         # Pyright adapter
  file-editor.ts         # (unchanged)
  file-scanner.ts        # (unchanged)
  language-servers.ts    # (unchanged)
  setup.ts               # (unchanged -- interactive wizard, not part of refactoring scope)
  utils.ts               # (unchanged)
index.ts                 # Slim entry point: create MCP server, register tools, start
```

> **Note on `setup.ts`**: The setup wizard (`cclsp setup`) is a standalone CLI subcommand with its own dependency on `inquirer`. It is intentionally excluded from the refactoring scope as it has no runtime coupling to the MCP server or LSP client.

### 2.2 Key Interfaces

#### Tool Registry

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  client: LSPClient; // Thin facade over internal modules
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};
```

Tools are defined declaratively and registered in a loop, eliminating the if/else chain. The `ToolContext` exposes a single `LSPClient` facade rather than leaking internal module boundaries.

#### LSPClient (Thin Facade)

```typescript
class LSPClient {
  // Composed from internal modules (not exposed to tools)
  private transport: JsonRpcTransport;
  private serverManager: ServerManager;
  private documentManager: DocumentManager;
  private operations: LspOperations;
  private diagnosticsCache: DiagnosticsCache;
  private config: ConfigLoader;

  // Public API consumed by tool handlers
  findDefinition(file: string, position: Position): Promise<Location[]>;
  findReferences(file: string, position: Position): Promise<Location[]>;
  findImplementations(file: string, position: Position): Promise<Location[]>;
  hover(file: string, position: Position): Promise<HoverResult | null>;
  getDocumentSymbols(file: string): Promise<DocumentSymbol[]>;
  findSymbolsByName(query: string, file?: string): Promise<SymbolInformation[]>;
  prepareCallHierarchy(file: string, position: Position): Promise<CallHierarchyItem[]>;
  incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]>;
  outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]>;
  rename(file: string, position: Position, newName: string): Promise<WorkspaceEdit>;
  getDiagnostics(file: string): Promise<Diagnostic[]>;
  syncFileContent(filePath: string): Promise<void>;
  preloadServers(debug?: boolean): Promise<void>;
  restartServers(): Promise<void>;
}
```

The facade delegates to internal modules but presents a stable API to tool handlers. Internal decomposition can change without affecting tools.

#### JsonRpcTransport

```typescript
interface JsonRpcTransport {
  send(method: string, params: unknown): Promise<unknown>;
  onNotification(method: string, handler: (params: unknown) => void): void;
  onRequest(method: string, handler: (params: unknown) => Promise<unknown>): void;
  close(): void;
}
```

Owns Content-Length framing, ID correlation, and JSON-RPC 2.0 encoding/decoding. Pure I/O layer with no LSP semantics.

#### ServerManager

```typescript
interface ServerManager {
  getServer(extension: string): Promise<ManagedServer>;
  restartServer(extension: string): Promise<void>;
  restartAll(): Promise<void>;
  getStatus(): ServerStatusMap;
  shutdown(): Promise<void>;
}

interface ManagedServer {
  transport: JsonRpcTransport;
  rootDir: string;
  adapter: ServerAdapter | null;
  state: ServerState;
}
```

Handles spawning, restart intervals, adapter detection, initialization handshake.

#### DocumentManager

```typescript
interface DocumentManager {
  open(uri: string, languageId: string, text: string): Promise<void>;
  change(uri: string, text: string): Promise<void>;
  close(uri: string): Promise<void>;
  isOpen(uri: string): boolean;
  getVersion(uri: string): number;
}
```

Tracks open document state and version numbers. Delegates actual `textDocument/*` notifications to the transport.

#### LspOperations

```typescript
interface LspOperations {
  findDefinition(file: string, position: Position): Promise<Location[]>;
  findReferences(file: string, position: Position): Promise<Location[]>;
  findImplementations(file: string, position: Position): Promise<Location[]>;
  hover(file: string, position: Position): Promise<HoverResult | null>;
  getDocumentSymbols(file: string): Promise<DocumentSymbol[]>;
  findSymbolsByName(query: string, file?: string): Promise<SymbolInformation[]>;
  prepareCallHierarchy(file: string, position: Position): Promise<CallHierarchyItem[]>;
  incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]>;
  outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]>;
  rename(file: string, position: Position, newName: string): Promise<WorkspaceEdit>;
  getDiagnostics(file: string): Promise<Diagnostic[]>;
  syncFileContent(filePath: string): Promise<void>;
  preloadServers(debug?: boolean): Promise<void>;
}
```

Orchestrates: get server -> open document -> send LSP request -> transform response. No I/O or lifecycle logic.

#### DiagnosticsCache

```typescript
interface DiagnosticsCache {
  update(uri: string, diagnostics: Diagnostic[]): void;
  get(uri: string): Diagnostic[];
  clear(uri?: string): void;
}
```

Stores pushed diagnostics from servers, queryable by URI.

#### ConfigLoader

```typescript
interface ConfigLoader {
  load(): Config;
  validate(config: unknown): config is Config;
}
```

Handles `CCLSP_CONFIG_PATH` env var, `cclsp.json` file discovery, and schema validation. Throws on invalid config instead of `process.exit`.

### 2.3 Diagrams

See companion Mermaid diagrams in `docs/`:
- `architecture-current.mmd` -- Current module dependency graph
- `architecture-proposed.mmd` -- Proposed module dependency graph
- `sequence-find-definition.mmd` -- Request flow for find_definition
- `sequence-server-lifecycle.mmd` -- Server spawn, restart, and shutdown
- `sequence-adapter-integration.mmd` -- Adapter notification/request handling

## 3. Migration Plan

### Phase 1: Structural Refactoring (preserves all current behavior)

Each step produces a fully working state with passing tests.

| Step | Action | Validates |
|------|--------|-----------|
| 1 | Extract `src/lsp/types.ts` -- consolidate all LSP and internal types, remove `ServerState` duplication | `bun run typecheck` passes |
| 2 | Extract `src/lsp/json-rpc.ts` -- pull message framing and ID correlation out of `lsp-client.ts` | Existing tests pass, manual test confirms tool calls work |
| 3 | Extract `src/lsp/config.ts` -- move config loading/validation, replace `process.exit` with thrown errors | Config-related tests pass |
| 4 | Extract `src/lsp/document-manager.ts` -- pull didOpen/didChange/didClose tracking | Document sync tests pass |
| 5 | Extract `src/lsp/server-manager.ts` -- pull spawn, restart, lifecycle, adapter integration | Server lifecycle tests pass |
| 6 | Extract `src/lsp/diagnostics.ts` -- pull diagnostics cache | Diagnostics tests pass |
| 7 | Extract `src/lsp/operations.ts` -- remaining LSP operations become thin orchestration | All LSP operation tests pass |
| 8 | Create `src/tools/registry.ts` + tool group files -- declarative tool definitions | Tool handler tests pass |
| 9 | Slim down `index.ts` -- replace if/else chain with `registerTools(server, toolDefs)`, retain `LSPClient` as thin facade | Full integration test passes |

### Phase 2: Quality Improvements (after Phase 1 is stable)

| Step | Action |
|------|--------|
| A | Add structured logger with `CCLSP_LOG_LEVEL` env var (custom lightweight, no external dep) |
| B | Clean adapter interface -- remove `isMethodSupported`, `provideFallback`; wire `customizeInitializeParams` |
| C | Fix version: read from `package.json` at build time or import |
| D | Fix/remove outdated `mcp-tools.test.ts` (`use_zero_index` parameter) |
| E | Add graceful degradation: individual server failures don't crash the process |
| F | Expand test coverage for new modules (target: each module has own test file) |

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regression during LSPClient decomposition | Medium | High | Each step has passing tests as gate; keep old file until step is validated |
| JSON-RPC extraction breaks message ordering | Low | High | Preserve exact buffer/correlation logic; add targeted unit tests for edge cases |
| Tool registry changes break MCP protocol compliance | Low | Medium | Keep tool schemas identical; validate with `bun run test:manual` at each step |
| Adapter integration breaks during ServerManager extraction | Medium | Medium | Test with Vue and Pyright servers specifically; adapters are auto-detected |
| Document version tracking drift after DocumentManager extraction | Low | Medium | Unit test version incrementing; integration test with real LSP server |
| Circular dependencies between extracted modules | Medium | High | Enforce strict dependency direction: types <- transport <- server-manager <- document-manager <- operations <- facade. Use `madge` or manual review to detect cycles before merging each step |
| Large PR size makes review difficult | Medium | Low | Each phase step is a separate commit; can be reviewed incrementally |

## 5. Acceptance Criteria

### Phase 1 Complete When:

- [ ] `lsp-client.ts` is deleted or reduced to a thin facade composing internal modules
- [ ] `index.ts` is under 150 lines with no if/else tool dispatch
- [ ] `ServerState` exists in exactly one location (`src/lsp/types.ts`)
- [ ] All existing tests pass without modification (or with minimal import path updates)
- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun run lint` passes with zero errors
- [ ] `bun run test:manual` confirms all 12 tools work end-to-end
- [ ] No behavior changes visible to MCP clients
- [ ] Each new module has clear single responsibility and is independently testable
- [ ] No circular dependencies between extracted modules (verified with `madge` or equivalent)
- [ ] `setup.ts` remains unchanged and functional (`cclsp setup` works)
- [ ] `cclsp.json` configuration format unchanged (backward compatible)

### Phase 2 Complete When:

- [ ] `CCLSP_LOG_LEVEL=debug` produces structured log output
- [ ] Adapter interface has no dead methods
- [ ] `customizeInitializeParams` is called during server initialization
- [ ] Version in MCP server info matches `package.json`
- [ ] Outdated test parameters are fixed or removed
- [ ] Individual server failure does not crash the MCP server process
- [ ] Each `src/lsp/*.ts` and `src/tools/*.ts` module has a corresponding test file
- [ ] No measurable performance regression in tool response latency
