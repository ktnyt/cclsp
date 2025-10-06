import type { LSPServerConfig } from '../../types.js';

// Forward declaration to avoid circular dependency
// ServerState is defined in lsp-client.ts
export interface ServerState {
  process: import('node:child_process').ChildProcess;
  initialized: boolean;
  initializationPromise: Promise<void>;
  openFiles: Set<string>;
  fileVersions: Map<string, number>;
  startTime: number;
  config: LSPServerConfig;
  restartTimer?: NodeJS.Timeout;
  initializationResolve?: () => void;
  diagnostics: Map<string, import('../../types.js').Diagnostic[]>;
  lastDiagnosticUpdate: Map<string, number>;
  diagnosticVersions: Map<string, number>;
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

  /**
   * Check if a method is actually supported.
   * Some servers declare capabilities they don't properly implement.
   * Return false to prevent the method from being called.
   */
  isMethodSupported?(method: string): boolean;

  /**
   * Provide fallback implementation when method is not supported.
   * This is called when isMethodSupported returns false.
   */
  provideFallback?(method: string, params: unknown, state: ServerState): Promise<unknown>;
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
