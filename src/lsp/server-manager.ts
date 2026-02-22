import { type ChildProcess, spawn } from 'node:child_process';
import { logger } from '../logger.js';
import { pathToUri } from '../utils.js';
import { VERSION } from '../version.js';
import { adapterRegistry } from './adapters/registry.js';
import { DiagnosticsCache } from './diagnostics.js';
import { DocumentManager } from './document-manager.js';
import { JsonRpcTransport } from './json-rpc.js';
import type {
  Diagnostic,
  InitializeParams,
  LSPMessage,
  LSPServerConfig,
  ServerState,
} from './types.js';

/**
 * Manages LSP server process lifecycles.
 *
 * Handles:
 * - Spawning server processes with stdio communication
 * - LSP initialization handshake
 * - Adapter auto-detection and integration
 * - Restart timers and manual restart
 * - Concurrency protection (prevents duplicate server starts)
 * - Process cleanup on dispose
 */
export class ServerManager {
  private readonly servers: Map<string, ServerState> = new Map();
  private readonly serversStarting: Map<string, Promise<ServerState>> = new Map();

  /**
   * Get or start a server for the given config.
   * Handles concurrency: if a server is already starting, waits for that instead of starting a duplicate.
   */
  async getServer(serverConfig: LSPServerConfig): Promise<ServerState> {
    const key = JSON.stringify(serverConfig);

    // Check if server already exists
    if (this.servers.has(key)) {
      logger.debug('[DEBUG getServer] Using existing server instance\n');
      const server = this.servers.get(key);
      if (!server) {
        throw new Error('Server exists in map but is undefined');
      }
      return server;
    }

    // Check if server is currently starting
    if (this.serversStarting.has(key)) {
      logger.debug('[DEBUG getServer] Waiting for server startup in progress\n');
      const startPromise = this.serversStarting.get(key);
      if (!startPromise) {
        throw new Error('Server start promise exists in map but is undefined');
      }
      return await startPromise;
    }

    // Start new server with concurrency protection
    logger.debug('[DEBUG getServer] Starting new server instance\n');
    const startPromise = this.startServer(serverConfig);
    this.serversStarting.set(key, startPromise);

    try {
      const serverState = await startPromise;
      this.servers.set(key, serverState);
      this.serversStarting.delete(key);
      logger.debug('[DEBUG getServer] Server started and cached\n');
      return serverState;
    } catch (error) {
      this.serversStarting.delete(key);
      throw error;
    }
  }

  /**
   * Get all currently running servers.
   */
  getRunningServers(): Map<string, ServerState> {
    return this.servers;
  }

  /**
   * Terminate all running servers and clean up resources.
   */
  dispose(): void {
    for (const serverState of this.servers.values()) {
      if (serverState.restartTimer) {
        clearTimeout(serverState.restartTimer);
      }
      serverState.process.kill();
    }
    this.servers.clear();
  }

  private isPylspServer(serverConfig: LSPServerConfig): boolean {
    return serverConfig.command.some((cmd) => cmd.includes('pylsp'));
  }

  private async startServer(serverConfig: LSPServerConfig): Promise<ServerState> {
    const [command, ...args] = serverConfig.command;
    if (!command) {
      throw new Error('No command specified in server config');
    }
    const childProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: serverConfig.rootDir || process.cwd(),
    });

    let initializationResolve: (() => void) | undefined;
    const initializationPromise = new Promise<void>((resolve) => {
      initializationResolve = resolve;
    });

    // Auto-detect adapter for this server
    const adapter = adapterRegistry.getAdapter(serverConfig);
    if (adapter) {
      logger.info(
        `Using adapter "${adapter.name}" for server: ${serverConfig.command.join(' ')}\n`
      );
    }

    // Create transport with message handler for non-response messages
    const transport = new JsonRpcTransport(childProcess, (message: LSPMessage) => {
      this.handleMessage(message, serverState);
    });

    const documentManager = new DocumentManager(transport);
    const diagnosticsCache = new DiagnosticsCache();

    const serverState: ServerState = {
      process: childProcess,
      transport,
      documentManager,
      initialized: false,
      initializationPromise,
      startTime: Date.now(),
      config: serverConfig,
      restartTimer: undefined,
      diagnosticsCache,
      adapter,
    };

    // Store the resolve function to call when initialized notification is received
    serverState.initializationResolve = initializationResolve;

    childProcess.stderr?.on('data', (data: Buffer) => {
      // Forward LSP server stderr directly to MCP stderr
      process.stderr.write(data);
    });

    // Handle server process exit (intentional restarts already remove from servers map)
    childProcess.on('exit', (code, signal) => {
      const key = JSON.stringify(serverConfig);
      const desc = serverConfig.command.join(' ');
      const wasIntentional = !this.servers.has(key);

      if (!wasIntentional) {
        logger.warn(`LSP server exited unexpectedly: ${desc} (code: ${code}, signal: ${signal})\n`);
      } else {
        logger.debug(`LSP server exited: ${desc} (code: ${code}, signal: ${signal})\n`);
      }

      // Reject any pending requests so callers get errors instead of hanging
      transport.rejectAllPending(`LSP server process exited (code: ${code}, signal: ${signal})`);

      // Clean up state so next request triggers a fresh server start
      // (no-op for intentional restarts since restartServer already deleted the key)
      if (serverState.restartTimer) {
        clearTimeout(serverState.restartTimer);
        serverState.restartTimer = undefined;
      }
      this.servers.delete(key);
    });

    childProcess.on('error', (error) => {
      const key = JSON.stringify(serverConfig);
      const desc = serverConfig.command.join(' ');
      logger.error(`LSP server process error: ${desc}: ${error}\n`);

      // Reject pending requests and clean up so next request starts fresh
      transport.rejectAllPending(`LSP server process error: ${error.message}`);
      this.servers.delete(key);
    });

    // Initialize the server
    const initializeParams: InitializeParams = {
      processId: childProcess.pid || null,
      clientInfo: { name: 'cclsp', version: VERSION },
      capabilities: {
        textDocument: {
          synchronization: {
            didOpen: true,
            didChange: true,
            didClose: true,
          },
          definition: { linkSupport: false },
          references: {
            includeDeclaration: true,
            dynamicRegistration: false,
          },
          rename: { prepareSupport: false },
          documentSymbol: {
            symbolKind: {
              valueSet: [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
                24, 25, 26,
              ],
            },
            hierarchicalDocumentSymbolSupport: true,
          },
          completion: {
            completionItem: {
              snippetSupport: true,
            },
          },
          hover: {},
          signatureHelp: {},
          diagnostic: {
            dynamicRegistration: false,
            relatedDocumentSupport: false,
          },
        },
        workspace: {
          workspaceEdit: {
            documentChanges: true,
          },
          workspaceFolders: true,
        },
      },
      rootUri: pathToUri(serverConfig.rootDir || process.cwd()),
      workspaceFolders: [
        {
          uri: pathToUri(serverConfig.rootDir || process.cwd()),
          name: 'workspace',
        },
      ],
    };

    // Handle initializationOptions with backwards compatibility for pylsp
    if (serverConfig.initializationOptions !== undefined) {
      initializeParams.initializationOptions = serverConfig.initializationOptions;
    } else if (this.isPylspServer(serverConfig)) {
      // Backwards compatibility: provide default pylsp settings when none are specified
      initializeParams.initializationOptions = {
        settings: {
          pylsp: {
            plugins: {
              jedi_completion: { enabled: true },
              jedi_definition: { enabled: true },
              jedi_hover: { enabled: true },
              jedi_references: { enabled: true },
              jedi_signature_help: { enabled: true },
              jedi_symbols: { enabled: true },
              pylint: { enabled: false },
              pycodestyle: { enabled: false },
              pyflakes: { enabled: false },
              yapf: { enabled: false },
              rope_completion: { enabled: false },
            },
          },
        },
      };
    }

    // Allow adapter to customize initialization parameters
    const finalParams = adapter?.customizeInitializeParams
      ? adapter.customizeInitializeParams(initializeParams)
      : initializeParams;

    const initResult = await transport.sendRequest('initialize', finalParams);

    // Send the initialized notification after receiving the initialize response
    transport.sendNotification('initialized', {});

    // Wait for the server to send the initialized notification back with timeout
    const INITIALIZATION_TIMEOUT = 3000; // 3 seconds
    try {
      await Promise.race([
        initializationPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Initialization timeout')), INITIALIZATION_TIMEOUT)
        ),
      ]);
    } catch (error) {
      // If timeout or initialization fails, mark as initialized anyway
      logger.debug(
        `[DEBUG startServer] Initialization timeout or failed for ${serverConfig.command.join(' ')}, proceeding anyway: ${error}\n`
      );
      serverState.initialized = true;
      if (serverState.initializationResolve) {
        serverState.initializationResolve();
        serverState.initializationResolve = undefined;
      }
    }

    // Set up auto-restart timer if configured
    this.setupRestartTimer(serverState);

    return serverState;
  }

  private handleMessage(message: LSPMessage, serverState?: ServerState) {
    // Handle notifications and requests from server
    // (Response correlation is handled by JsonRpcTransport)
    if (message.method && serverState) {
      const { adapter } = serverState;

      // Try adapter-specific handlers first for custom requests
      if (message.id && adapter?.handleRequest) {
        adapter
          .handleRequest(message.method, message.params, serverState)
          .then((result) => {
            // Send response back to server via transport
            serverState.transport.sendMessage({
              jsonrpc: '2.0',
              id: message.id,
              result,
            });
          })
          .catch((error) => {
            // Adapter didn't handle it, fall through to standard handling
            logger.debug(
              `[DEBUG handleMessage] Adapter did not handle request: ${message.method} - ${error}\n`
            );
          });
        return;
      }

      // Try adapter-specific notification handlers
      if (!message.id && adapter?.handleNotification) {
        const handled = adapter.handleNotification(message.method, message.params, serverState);
        if (handled) {
          return;
        }
      }

      // Standard LSP message handling
      if (message.method === 'initialized') {
        logger.debug('[DEBUG handleMessage] Received initialized notification from server\n');
        serverState.initialized = true;
        // Resolve the initialization promise
        const resolve = serverState.initializationResolve;
        if (resolve) {
          resolve();
          serverState.initializationResolve = undefined;
        }
      } else if (message.method === 'textDocument/publishDiagnostics') {
        // Handle diagnostic notifications from the server
        const params = message.params as {
          uri: string;
          diagnostics: Diagnostic[];
          version?: number;
        };
        if (params?.uri) {
          logger.debug(
            `[DEBUG handleMessage] Received publishDiagnostics for ${params.uri} with ${params.diagnostics?.length || 0} diagnostics${params.version !== undefined ? ` (version: ${params.version})` : ''}\n`
          );
          serverState.diagnosticsCache.update(params.uri, params.diagnostics || [], params.version);
        }
      }
    }
  }

  private setupRestartTimer(serverState: ServerState): void {
    if (serverState.config.restartInterval && serverState.config.restartInterval > 0) {
      // Minimum interval is 0.1 minutes (6 seconds) for testing, practical minimum is 1 minute
      const minInterval = 0.1;
      const actualInterval = Math.max(serverState.config.restartInterval, minInterval);
      const intervalMs = actualInterval * 60 * 1000; // Convert minutes to milliseconds

      logger.debug(
        `[DEBUG setupRestartTimer] Setting up restart timer for ${actualInterval} minutes\n`
      );

      serverState.restartTimer = setTimeout(() => {
        this.restartServer(serverState);
      }, intervalMs);
    }
  }

  private async restartServer(serverState: ServerState): Promise<void> {
    const key = JSON.stringify(serverState.config);
    logger.info(
      `[DEBUG restartServer] Restarting LSP server for ${serverState.config.command.join(' ')}\n`
    );

    // Clear existing timer
    if (serverState.restartTimer) {
      clearTimeout(serverState.restartTimer);
      serverState.restartTimer = undefined;
    }

    // Terminate old server
    serverState.process.kill();

    // Remove from servers map
    this.servers.delete(key);

    try {
      // Start new server
      const newServerState = await this.startServer(serverState.config);
      this.servers.set(key, newServerState);

      logger.info(
        `[DEBUG restartServer] Successfully restarted LSP server for ${serverState.config.command.join(' ')}\n`
      );
    } catch (error) {
      logger.error(`[DEBUG restartServer] Failed to restart LSP server: ${error}\n`);
    }
  }
}
