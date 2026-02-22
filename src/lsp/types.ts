// Re-export all shared types from the main types module
export type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CodeDescription,
  Config,
  DefinitionResult,
  Diagnostic,
  DiagnosticRelatedInformation,
  DocumentDiagnosticReport,
  DocumentSymbol,
  LSPError,
  LSPLocation,
  LSPServerConfig,
  Location,
  Position,
  ReferenceResult,
  SymbolInformation,
  SymbolMatch,
  SymbolSearchParams,
} from '../types.js';
export {
  DiagnosticSeverity,
  DiagnosticTag,
  SymbolKind,
  SymbolTag,
} from '../types.js';

// --- LSP-internal types (single source of truth) ---

import type { ChildProcess } from 'node:child_process';
import type { Diagnostic, LSPError, LSPServerConfig } from '../types.js';

/**
 * JSON-RPC message format used for LSP communication.
 */
export interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: LSPError;
}

/**
 * State of a running LSP server process.
 * Single source of truth -- do NOT duplicate this interface elsewhere.
 *
 * transport, documentManager, and diagnosticsCache use structural types
 * rather than concrete class imports to keep types.ts as a dependency leaf
 * (no imports from sibling lsp/ modules that import back from here).
 */
export interface ServerState {
  process: ChildProcess;
  transport: {
    sendRequest(method: string, params: unknown, timeout?: number): Promise<unknown>;
    sendMessage(message: LSPMessage): void;
    sendNotification(method: string, params: unknown): void;
    rejectAllPending(reason: string): void;
  };
  documentManager: {
    ensureOpen(filePath: string): Promise<boolean>;
    sendChange(filePath: string, text: string): void;
    isOpen(filePath: string): boolean;
    getVersion(filePath: string): number;
  };
  initialized: boolean;
  initializationPromise: Promise<void>;
  startTime: number;
  config: LSPServerConfig;
  restartTimer?: NodeJS.Timeout;
  initializationResolve?: () => void;
  diagnosticsCache: {
    update(uri: string, items: Diagnostic[], version?: number): void;
    get(uri: string): Diagnostic[] | undefined;
    waitForIdle(
      uri: string,
      options?: {
        maxWaitTime?: number;
        idleTime?: number;
        checkInterval?: number;
      }
    ): Promise<void>;
  };
  adapter?: ServerAdapter;
}

/**
 * LSP server adapter for handling server-specific behavior.
 * This is an internal interface - no user extensions supported.
 *
 * Adapters allow cclsp to handle LSP servers that deviate from the standard
 * protocol or have special requirements.
 */
export interface ServerAdapter {
  /** Adapter name for logging */
  readonly name: string;

  /**
   * Check if this adapter should be used for the given config.
   * Called during server initialization to auto-detect the appropriate adapter.
   */
  matches(config: LSPServerConfig): boolean;

  /**
   * Customize initialization parameters before sending to server.
   * Use this to add server-specific initialization options.
   */
  customizeInitializeParams?(params: InitializeParams): InitializeParams;

  /**
   * Handle custom notifications from server.
   * Return true if handled, false to fall through to standard handling.
   */
  handleNotification?(method: string, params: unknown, state: ServerState): boolean;

  /**
   * Handle custom requests from server.
   * Should return a promise that resolves to the response.
   * Throw an error to indicate the request was not handled.
   */
  handleRequest?(method: string, params: unknown, state: ServerState): Promise<unknown>;

  /**
   * Get custom timeout for specific LSP methods.
   * Return undefined to use the default timeout (30000ms).
   */
  getTimeout?(method: string): number | undefined;
}

/**
 * LSP InitializeParams type
 * Subset of the full LSP specification
 */
export interface InitializeParams {
  processId: number | null;
  clientInfo: { name: string; version: string };
  capabilities: unknown;
  rootUri: string;
  workspaceFolders: Array<{ uri: string; name: string }>;
  initializationOptions?: unknown;
}
