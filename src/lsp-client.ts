import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { constants, access, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadGitignore, scanDirectoryForExtensions } from './file-scanner.js';
import type {
  Config,
  Diagnostic,
  DocumentDiagnosticReport,
  DocumentSymbol,
  LSPError,
  LSPLocation,
  LSPServerConfig,
  Location,
  Position,
  SymbolInformation,
  SymbolMatch,
} from './types.js';
import { SymbolKind } from './types.js';
import { pathToUri } from './utils.js';

interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: LSPError;
}

interface ServerState {
  process: ChildProcess;
  initialized: boolean;
  initializationPromise: Promise<void>;
  openFiles: Set<string>;
  startTime: number;
  config: LSPServerConfig;
  restartTimer?: NodeJS.Timeout;
  initializationResolve?: () => void;
  diagnostics: Map<string, Diagnostic[]>; // Store diagnostics by file URI
  lastDiagnosticUpdate: Map<string, number>; // Track last update time per file
  diagnosticVersions: Map<string, number>; // Track diagnostic versions per file
}

export class LSPClient {
  private config: Config;
  private servers: Map<string, ServerState> = new Map();
  private nextId = 1;
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  > = new Map();

  constructor(configPath?: string) {
    // First try to load from environment variable (MCP config)
    if (process.env.CCLSP_CONFIG_PATH) {
      process.stderr.write(
        `Loading config from CCLSP_CONFIG_PATH: ${process.env.CCLSP_CONFIG_PATH}\n`
      );

      if (!existsSync(process.env.CCLSP_CONFIG_PATH)) {
        process.stderr.write(
          `Config file specified in CCLSP_CONFIG_PATH does not exist: ${process.env.CCLSP_CONFIG_PATH}\n`
        );
        process.exit(1);
      }

      try {
        const configData = readFileSync(process.env.CCLSP_CONFIG_PATH, 'utf-8');
        this.config = JSON.parse(configData);
        process.stderr.write(
          `Loaded ${this.config.servers.length} server configurations from env\n`
        );
        return;
      } catch (error) {
        process.stderr.write(`Failed to load config from CCLSP_CONFIG_PATH: ${error}\n`);
        process.exit(1);
      }
    }

    // configPath must be provided if CCLSP_CONFIG_PATH is not set
    if (!configPath) {
      process.stderr.write(
        'Error: configPath is required when CCLSP_CONFIG_PATH environment variable is not set\n'
      );
      process.exit(1);
    }

    // Try to load from config file
    try {
      process.stderr.write(`Loading config from file: ${configPath}\n`);
      const configData = readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(configData);
      process.stderr.write(`Loaded ${this.config.servers.length} server configurations\n`);
    } catch (error) {
      process.stderr.write(`Failed to load config from ${configPath}: ${error}\n`);
      process.exit(1);
    }
  }

  private getServerForFile(filePath: string): LSPServerConfig | null {
    const extension = filePath.split('.').pop();
    if (!extension) return null;

    process.stderr.write(`Looking for server for extension: ${extension}\n`);
    process.stderr.write(
      `Available servers: ${this.config.servers.map((s) => s.extensions.join(',')).join(' | ')}\n`
    );

    const server = this.config.servers.find((server) => server.extensions.includes(extension));

    if (server) {
      process.stderr.write(`Found server for ${extension}: ${server.command.join(' ')}\n`);
    } else {
      process.stderr.write(`No server found for extension: ${extension}\n`);
    }

    return server || null;
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

    const serverState: ServerState = {
      process: childProcess,
      initialized: false,
      initializationPromise,
      openFiles: new Set(),
      startTime: Date.now(),
      config: serverConfig,
      restartTimer: undefined,
      diagnostics: new Map(),
      lastDiagnosticUpdate: new Map(),
      diagnosticVersions: new Map(),
    };

    // Store the resolve function to call when initialized notification is received
    serverState.initializationResolve = initializationResolve;

    let buffer = '';
    childProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();

      while (buffer.includes('\r\n\r\n')) {
        const headerEndIndex = buffer.indexOf('\r\n\r\n');
        const headerPart = buffer.substring(0, headerEndIndex);
        const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/);

        if (contentLengthMatch?.[1]) {
          const contentLength = Number.parseInt(contentLengthMatch[1]);
          const messageStart = headerEndIndex + 4;

          if (buffer.length >= messageStart + contentLength) {
            const messageContent = buffer.substring(messageStart, messageStart + contentLength);
            buffer = buffer.substring(messageStart + contentLength);

            try {
              const message: LSPMessage = JSON.parse(messageContent);
              this.handleMessage(message, serverState);
            } catch (error) {
              process.stderr.write(`Failed to parse LSP message: ${error}\n`);
            }
          } else {
            break;
          }
        } else {
          buffer = buffer.substring(headerEndIndex + 4);
        }
      }
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      // Forward LSP server stderr directly to MCP stderr
      process.stderr.write(data);
    });

    // Initialize the server
    const initResult = await this.sendRequest(childProcess, 'initialize', {
      processId: childProcess.pid || null,
      clientInfo: { name: 'cclsp', version: '0.1.0' },
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
      initializationOptions: {
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
      },
    });

    // Send the initialized notification after receiving the initialize response
    await this.sendNotification(childProcess, 'initialized', {});

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
      process.stderr.write(
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
    if (message.id && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id);
      if (!request) return;
      const { resolve, reject } = request;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'LSP Error'));
      } else {
        resolve(message.result);
      }
    }

    // Handle notifications from server
    if (message.method && serverState) {
      if (message.method === 'initialized') {
        process.stderr.write(
          '[DEBUG handleMessage] Received initialized notification from server\n'
        );
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
          process.stderr.write(
            `[DEBUG handleMessage] Received publishDiagnostics for ${params.uri} with ${params.diagnostics?.length || 0} diagnostics${params.version !== undefined ? ` (version: ${params.version})` : ''}\n`
          );
          serverState.diagnostics.set(params.uri, params.diagnostics || []);
          serverState.lastDiagnosticUpdate.set(params.uri, Date.now());
          if (params.version !== undefined) {
            serverState.diagnosticVersions.set(params.uri, params.version);
          }
        }
      }
    }
  }

  private sendMessage(process: ChildProcess, message: LSPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    process.stdin?.write(header + content);
  }

  private sendRequest(
    process: ChildProcess,
    method: string,
    params: unknown,
    timeout = 30000
  ): Promise<unknown> {
    const id = this.nextId++;
    const message: LSPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (reason?: unknown) => {
          clearTimeout(timeoutId);
          reject(reason);
        },
      });

      this.sendMessage(process, message);
    });
  }

  private sendNotification(process: ChildProcess, method: string, params: unknown): void {
    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.sendMessage(process, message);
  }

  private setupRestartTimer(serverState: ServerState): void {
    if (serverState.config.restartInterval && serverState.config.restartInterval > 0) {
      // Minimum interval is 0.1 minutes (6 seconds) for testing, practical minimum is 1 minute
      const minInterval = 0.1;
      const actualInterval = Math.max(serverState.config.restartInterval, minInterval);
      const intervalMs = actualInterval * 60 * 1000; // Convert minutes to milliseconds

      process.stderr.write(
        `[DEBUG setupRestartTimer] Setting up restart timer for ${actualInterval} minutes\n`
      );

      serverState.restartTimer = setTimeout(() => {
        this.restartServer(serverState);
      }, intervalMs);
    }
  }

  private async restartServer(serverState: ServerState): Promise<void> {
    const key = JSON.stringify(serverState.config);
    process.stderr.write(
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

      process.stderr.write(
        `[DEBUG restartServer] Successfully restarted LSP server for ${serverState.config.command.join(' ')}\n`
      );
    } catch (error) {
      process.stderr.write(`[DEBUG restartServer] Failed to restart LSP server: ${error}\n`);
    }
  }

  /**
   * Manually restart LSP servers for specific extensions or all servers
   * @param extensions Array of file extensions, or null to restart all
   * @returns Object with success status and details about restarted servers
   */
  async restartServers(
    extensions?: string[]
  ): Promise<{ success: boolean; restarted: string[]; failed: string[]; message: string }> {
    const restarted: string[] = [];
    const failed: string[] = [];

    process.stderr.write(
      `[DEBUG restartServers] Request to restart servers for extensions: ${extensions ? extensions.join(', ') : 'all'}\n`
    );

    // Collect servers to restart
    const serversToRestart: Array<{ key: string; state: ServerState }> = [];

    for (const [key, serverState] of this.servers.entries()) {
      if (!extensions || extensions.some((ext) => serverState.config.extensions.includes(ext))) {
        serversToRestart.push({ key, state: serverState });
      }
    }

    if (serversToRestart.length === 0) {
      const message = extensions
        ? `No LSP servers found for extensions: ${extensions.join(', ')}`
        : 'No LSP servers are currently running';
      return { success: false, restarted: [], failed: [], message };
    }

    // Restart each server
    for (const { key, state } of serversToRestart) {
      const serverDesc = `${state.config.command.join(' ')} (${state.config.extensions.join(', ')})`;

      try {
        // Clear existing timer
        if (state.restartTimer) {
          clearTimeout(state.restartTimer);
          state.restartTimer = undefined;
        }

        // Terminate old server
        state.process.kill();

        // Remove from servers map
        this.servers.delete(key);

        // Start new server
        const newServerState = await this.startServer(state.config);
        this.servers.set(key, newServerState);

        restarted.push(serverDesc);
        process.stderr.write(`[DEBUG restartServers] Successfully restarted: ${serverDesc}\n`);
      } catch (error) {
        failed.push(`${serverDesc}: ${error}`);
        process.stderr.write(`[DEBUG restartServers] Failed to restart: ${serverDesc}: ${error}\n`);
      }
    }

    const success = failed.length === 0;
    let message: string;

    if (success) {
      message = `Successfully restarted ${restarted.length} LSP server(s)`;
    } else if (restarted.length > 0) {
      message = `Restarted ${restarted.length} server(s), but ${failed.length} failed`;
    } else {
      message = `Failed to restart all ${failed.length} server(s)`;
    }

    return { success, restarted, failed, message };
  }

  private async ensureFileOpen(serverState: ServerState, filePath: string): Promise<void> {
    if (serverState.openFiles.has(filePath)) {
      process.stderr.write(`[DEBUG ensureFileOpen] File already open: ${filePath}\n`);
      return;
    }

    process.stderr.write(`[DEBUG ensureFileOpen] Opening file: ${filePath}\n`);

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const uri = pathToUri(filePath);
      const languageId = this.getLanguageId(filePath);

      process.stderr.write(
        `[DEBUG ensureFileOpen] File content length: ${fileContent.length}, languageId: ${languageId}\n`
      );

      await this.sendNotification(serverState.process, 'textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: fileContent,
        },
      });

      serverState.openFiles.add(filePath);
      process.stderr.write(`[DEBUG ensureFileOpen] File opened successfully: ${filePath}\n`);
    } catch (error) {
      process.stderr.write(`[DEBUG ensureFileOpen] Failed to open file ${filePath}: ${error}\n`);
      throw error;
    }
  }

  private getLanguageId(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      go: 'go',
      rs: 'rust',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      java: 'java',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      dart: 'dart',
      lua: 'lua',
      sh: 'shellscript',
      bash: 'shellscript',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      vue: 'vue',
      svelte: 'svelte',
      tf: 'terraform',
      sql: 'sql',
      graphql: 'graphql',
      gql: 'graphql',
      md: 'markdown',
      tex: 'latex',
      elm: 'elm',
      hs: 'haskell',
      ml: 'ocaml',
      clj: 'clojure',
      fs: 'fsharp',
      r: 'r',
      toml: 'toml',
      zig: 'zig',
    };

    return languageMap[extension || ''] || 'plaintext';
  }

  private async getServer(filePath: string): Promise<ServerState> {
    process.stderr.write(`[DEBUG getServer] Getting server for file: ${filePath}\n`);

    const serverConfig = this.getServerForFile(filePath);
    if (!serverConfig) {
      throw new Error(`No LSP server configured for file: ${filePath}`);
    }

    process.stderr.write(
      `[DEBUG getServer] Found server config: ${serverConfig.command.join(' ')}\n`
    );

    const key = JSON.stringify(serverConfig);
    if (!this.servers.has(key)) {
      process.stderr.write('[DEBUG getServer] Starting new server instance\n');
      const serverState = await this.startServer(serverConfig);
      this.servers.set(key, serverState);
      process.stderr.write('[DEBUG getServer] Server started and cached\n');
    } else {
      process.stderr.write('[DEBUG getServer] Using existing server instance\n');
    }

    const server = this.servers.get(key);
    if (!server) {
      throw new Error('Failed to get or create server');
    }
    return server;
  }

  async findDefinition(filePath: string, position: Position): Promise<Location[]> {
    process.stderr.write(
      `[DEBUG findDefinition] Requesting definition for ${filePath} at ${position.line}:${position.character}\n`
    );

    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    process.stderr.write('[DEBUG findDefinition] Sending textDocument/definition request\n');
    const result = await this.sendRequest(serverState.process, 'textDocument/definition', {
      textDocument: { uri: pathToUri(filePath) },
      position,
    });

    process.stderr.write(
      `[DEBUG findDefinition] Result type: ${typeof result}, isArray: ${Array.isArray(result)}\n`
    );

    if (Array.isArray(result)) {
      process.stderr.write(`[DEBUG findDefinition] Array result with ${result.length} locations\n`);
      if (result.length > 0) {
        process.stderr.write(
          `[DEBUG findDefinition] First location: ${JSON.stringify(result[0], null, 2)}\n`
        );
      }
      return result.map((loc: LSPLocation) => ({
        uri: loc.uri,
        range: loc.range,
      }));
    }
    if (result && typeof result === 'object' && 'uri' in result) {
      process.stderr.write(
        `[DEBUG findDefinition] Single location result: ${JSON.stringify(result, null, 2)}\n`
      );
      const location = result as LSPLocation;
      return [
        {
          uri: location.uri,
          range: location.range,
        },
      ];
    }

    process.stderr.write(
      '[DEBUG findDefinition] No definition found or unexpected result format\n'
    );
    return [];
  }

  async findReferences(
    filePath: string,
    position: Position,
    includeDeclaration = true
  ): Promise<Location[]> {
    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    process.stderr.write(
      `[DEBUG] findReferences for ${filePath} at ${position.line}:${position.character}, includeDeclaration: ${includeDeclaration}\n`
    );

    const result = await this.sendRequest(serverState.process, 'textDocument/references', {
      textDocument: { uri: pathToUri(filePath) },
      position,
      context: { includeDeclaration },
    });

    process.stderr.write(
      `[DEBUG] findReferences result type: ${typeof result}, isArray: ${Array.isArray(result)}, length: ${Array.isArray(result) ? result.length : 'N/A'}\n`
    );

    if (result && Array.isArray(result) && result.length > 0) {
      process.stderr.write(`[DEBUG] First reference: ${JSON.stringify(result[0], null, 2)}\n`);
    } else if (result === null || result === undefined) {
      process.stderr.write('[DEBUG] findReferences returned null/undefined\n');
    } else {
      process.stderr.write(
        `[DEBUG] findReferences returned unexpected result: ${JSON.stringify(result)}\n`
      );
    }

    if (Array.isArray(result)) {
      return result.map((loc: LSPLocation) => ({
        uri: loc.uri,
        range: loc.range,
      }));
    }

    return [];
  }

  async renameSymbol(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<{
    changes?: Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>>;
  }> {
    process.stderr.write(
      `[DEBUG renameSymbol] Requesting rename for ${filePath} at ${position.line}:${position.character} to "${newName}"\n`
    );

    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    process.stderr.write('[DEBUG renameSymbol] Sending textDocument/rename request\n');
    const result = await this.sendRequest(serverState.process, 'textDocument/rename', {
      textDocument: { uri: pathToUri(filePath) },
      position,
      newName,
    });

    process.stderr.write(
      `[DEBUG renameSymbol] Result type: ${typeof result}, hasChanges: ${result && typeof result === 'object' && 'changes' in result}\n`
    );

    if (result && typeof result === 'object' && 'changes' in result) {
      const workspaceEdit = result as {
        changes: Record<
          string,
          Array<{ range: { start: Position; end: Position }; newText: string }>
        >;
      };

      const changeCount = Object.keys(workspaceEdit.changes || {}).length;
      process.stderr.write(
        `[DEBUG renameSymbol] WorkspaceEdit has changes for ${changeCount} files\n`
      );

      return workspaceEdit;
    }

    process.stderr.write('[DEBUG renameSymbol] No rename changes available\n');
    return {};
  }

  async getDocumentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    process.stderr.write(`[DEBUG] Requesting documentSymbol for: ${filePath}\n`);

    const result = await this.sendRequest(serverState.process, 'textDocument/documentSymbol', {
      textDocument: { uri: pathToUri(filePath) },
    });

    process.stderr.write(
      `[DEBUG] documentSymbol result type: ${typeof result}, isArray: ${Array.isArray(result)}, length: ${Array.isArray(result) ? result.length : 'N/A'}\n`
    );

    if (result && Array.isArray(result) && result.length > 0) {
      process.stderr.write(`[DEBUG] First symbol: ${JSON.stringify(result[0], null, 2)}\n`);
    } else if (result === null || result === undefined) {
      process.stderr.write('[DEBUG] documentSymbol returned null/undefined\n');
    } else {
      process.stderr.write(
        `[DEBUG] documentSymbol returned unexpected result: ${JSON.stringify(result)}\n`
      );
    }

    if (Array.isArray(result)) {
      return result as DocumentSymbol[] | SymbolInformation[];
    }

    return [];
  }

  private flattenDocumentSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
    const flattened: DocumentSymbol[] = [];

    for (const symbol of symbols) {
      flattened.push(symbol);
      if (symbol.children) {
        flattened.push(...this.flattenDocumentSymbols(symbol.children));
      }
    }

    return flattened;
  }

  private isDocumentSymbolArray(
    symbols: DocumentSymbol[] | SymbolInformation[]
  ): symbols is DocumentSymbol[] {
    if (symbols.length === 0) return true;
    const firstSymbol = symbols[0];
    if (!firstSymbol) return true;
    // DocumentSymbol has 'range' and 'selectionRange', SymbolInformation has 'location'
    return 'range' in firstSymbol && 'selectionRange' in firstSymbol;
  }

  symbolKindToString(kind: SymbolKind): string {
    const kindMap: Record<SymbolKind, string> = {
      [SymbolKind.File]: 'file',
      [SymbolKind.Module]: 'module',
      [SymbolKind.Namespace]: 'namespace',
      [SymbolKind.Package]: 'package',
      [SymbolKind.Class]: 'class',
      [SymbolKind.Method]: 'method',
      [SymbolKind.Property]: 'property',
      [SymbolKind.Field]: 'field',
      [SymbolKind.Constructor]: 'constructor',
      [SymbolKind.Enum]: 'enum',
      [SymbolKind.Interface]: 'interface',
      [SymbolKind.Function]: 'function',
      [SymbolKind.Variable]: 'variable',
      [SymbolKind.Constant]: 'constant',
      [SymbolKind.String]: 'string',
      [SymbolKind.Number]: 'number',
      [SymbolKind.Boolean]: 'boolean',
      [SymbolKind.Array]: 'array',
      [SymbolKind.Object]: 'object',
      [SymbolKind.Key]: 'key',
      [SymbolKind.Null]: 'null',
      [SymbolKind.EnumMember]: 'enum_member',
      [SymbolKind.Struct]: 'struct',
      [SymbolKind.Event]: 'event',
      [SymbolKind.Operator]: 'operator',
      [SymbolKind.TypeParameter]: 'type_parameter',
    };
    return kindMap[kind] || 'unknown';
  }

  getValidSymbolKinds(): string[] {
    return [
      'file',
      'module',
      'namespace',
      'package',
      'class',
      'method',
      'property',
      'field',
      'constructor',
      'enum',
      'interface',
      'function',
      'variable',
      'constant',
      'string',
      'number',
      'boolean',
      'array',
      'object',
      'key',
      'null',
      'enum_member',
      'struct',
      'event',
      'operator',
      'type_parameter',
    ];
  }

  private async findSymbolPositionInFile(
    filePath: string,
    symbol: SymbolInformation
  ): Promise<Position> {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      const range = symbol.location.range;
      const startLine = range.start.line;
      const endLine = range.end.line;

      process.stderr.write(
        `[DEBUG findSymbolPositionInFile] Searching for "${symbol.name}" in lines ${startLine}-${endLine}\n`
      );

      // Search within the symbol's range for the symbol name
      for (let lineNum = startLine; lineNum <= endLine && lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        // Find all occurrences of the symbol name in this line
        let searchStart = 0;
        if (lineNum === startLine) {
          searchStart = range.start.character;
        }

        let searchEnd = line.length;
        if (lineNum === endLine) {
          searchEnd = range.end.character;
        }

        const searchText = line.substring(searchStart, searchEnd);
        const symbolIndex = searchText.indexOf(symbol.name);

        if (symbolIndex !== -1) {
          const actualCharacter = searchStart + symbolIndex;
          process.stderr.write(
            `[DEBUG findSymbolPositionInFile] Found "${symbol.name}" at line ${lineNum}, character ${actualCharacter}\n`
          );

          return {
            line: lineNum,
            character: actualCharacter,
          };
        }
      }

      // Fallback to range start if not found
      process.stderr.write(
        `[DEBUG findSymbolPositionInFile] Symbol "${symbol.name}" not found in range, using range start\n`
      );
      return range.start;
    } catch (error) {
      process.stderr.write(
        `[DEBUG findSymbolPositionInFile] Error reading file: ${error}, using range start\n`
      );
      return symbol.location.range.start;
    }
  }

  private stringToSymbolKind(kindStr: string): SymbolKind | null {
    const kindMap: Record<string, SymbolKind> = {
      file: SymbolKind.File,
      module: SymbolKind.Module,
      namespace: SymbolKind.Namespace,
      package: SymbolKind.Package,
      class: SymbolKind.Class,
      method: SymbolKind.Method,
      property: SymbolKind.Property,
      field: SymbolKind.Field,
      constructor: SymbolKind.Constructor,
      enum: SymbolKind.Enum,
      interface: SymbolKind.Interface,
      function: SymbolKind.Function,
      variable: SymbolKind.Variable,
      constant: SymbolKind.Constant,
      string: SymbolKind.String,
      number: SymbolKind.Number,
      boolean: SymbolKind.Boolean,
      array: SymbolKind.Array,
      object: SymbolKind.Object,
      key: SymbolKind.Key,
      null: SymbolKind.Null,
      enum_member: SymbolKind.EnumMember,
      struct: SymbolKind.Struct,
      event: SymbolKind.Event,
      operator: SymbolKind.Operator,
      type_parameter: SymbolKind.TypeParameter,
    };
    return kindMap[kindStr.toLowerCase()] || null;
  }

  async findSymbolsByName(
    filePath: string,
    symbolName: string,
    symbolKind?: string
  ): Promise<{ matches: SymbolMatch[]; warning?: string }> {
    process.stderr.write(
      `[DEBUG findSymbolsByName] Searching for symbol "${symbolName}" with kind "${symbolKind || 'any'}" in ${filePath}\n`
    );

    // Validate symbolKind if provided - return validation info for caller to handle
    let validationWarning: string | undefined;
    let effectiveSymbolKind = symbolKind;
    if (symbolKind && this.stringToSymbolKind(symbolKind) === null) {
      const validKinds = this.getValidSymbolKinds();
      validationWarning = `⚠️ Invalid symbol kind "${symbolKind}". Valid kinds are: ${validKinds.join(', ')}. Searching all symbol types instead.`;
      effectiveSymbolKind = undefined; // Reset to search all kinds
    }

    const symbols = await this.getDocumentSymbols(filePath);
    const matches: SymbolMatch[] = [];

    process.stderr.write(
      `[DEBUG findSymbolsByName] Got ${symbols.length} symbols from documentSymbols\n`
    );

    if (this.isDocumentSymbolArray(symbols)) {
      process.stderr.write(
        '[DEBUG findSymbolsByName] Processing DocumentSymbol[] (hierarchical format)\n'
      );
      // Handle DocumentSymbol[] (hierarchical)
      const flatSymbols = this.flattenDocumentSymbols(symbols);
      process.stderr.write(
        `[DEBUG findSymbolsByName] Flattened to ${flatSymbols.length} symbols\n`
      );

      for (const symbol of flatSymbols) {
        const nameMatches = symbol.name === symbolName || symbol.name.includes(symbolName);
        const kindMatches =
          !effectiveSymbolKind ||
          this.symbolKindToString(symbol.kind) === effectiveSymbolKind.toLowerCase();

        process.stderr.write(
          `[DEBUG findSymbolsByName] Checking DocumentSymbol: ${symbol.name} (${this.symbolKindToString(symbol.kind)}) - nameMatch: ${nameMatches}, kindMatch: ${kindMatches}\n`
        );

        if (nameMatches && kindMatches) {
          process.stderr.write(
            `[DEBUG findSymbolsByName] DocumentSymbol match: ${symbol.name} (kind=${symbol.kind}) using selectionRange ${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character}\n`
          );

          matches.push({
            name: symbol.name,
            kind: symbol.kind,
            position: symbol.selectionRange.start,
            range: symbol.range,
            detail: symbol.detail,
          });
        }
      }
    } else {
      process.stderr.write(
        '[DEBUG findSymbolsByName] Processing SymbolInformation[] (flat format)\n'
      );
      // Handle SymbolInformation[] (flat)
      for (const symbol of symbols) {
        const nameMatches = symbol.name === symbolName || symbol.name.includes(symbolName);
        const kindMatches =
          !effectiveSymbolKind ||
          this.symbolKindToString(symbol.kind) === effectiveSymbolKind.toLowerCase();

        process.stderr.write(
          `[DEBUG findSymbolsByName] Checking SymbolInformation: ${symbol.name} (${this.symbolKindToString(symbol.kind)}) - nameMatch: ${nameMatches}, kindMatch: ${kindMatches}\n`
        );

        if (nameMatches && kindMatches) {
          process.stderr.write(
            `[DEBUG findSymbolsByName] SymbolInformation match: ${symbol.name} (kind=${symbol.kind}) at ${symbol.location.range.start.line}:${symbol.location.range.start.character} to ${symbol.location.range.end.line}:${symbol.location.range.end.character}\n`
          );

          // For SymbolInformation, we need to find the actual symbol name position within the range
          // by reading the file content and searching for the symbol name
          const position = await this.findSymbolPositionInFile(filePath, symbol);

          process.stderr.write(
            `[DEBUG findSymbolsByName] Found symbol position in file: ${position.line}:${position.character}\n`
          );

          matches.push({
            name: symbol.name,
            kind: symbol.kind,
            position: position,
            range: symbol.location.range,
            detail: undefined, // SymbolInformation doesn't have detail
          });
        }
      }
    }

    process.stderr.write(`[DEBUG findSymbolsByName] Found ${matches.length} matching symbols\n`);

    // If a specific symbol kind was requested but no matches found, try searching all kinds as fallback
    let fallbackWarning: string | undefined;
    if (effectiveSymbolKind && matches.length === 0) {
      process.stderr.write(
        `[DEBUG findSymbolsByName] No matches found for kind "${effectiveSymbolKind}", trying fallback search for all kinds\n`
      );

      const fallbackMatches: SymbolMatch[] = [];

      if (this.isDocumentSymbolArray(symbols)) {
        const flatSymbols = this.flattenDocumentSymbols(symbols);
        for (const symbol of flatSymbols) {
          const nameMatches = symbol.name === symbolName || symbol.name.includes(symbolName);
          if (nameMatches) {
            fallbackMatches.push({
              name: symbol.name,
              kind: symbol.kind,
              position: symbol.selectionRange.start,
              range: symbol.range,
              detail: symbol.detail,
            });
          }
        }
      } else {
        for (const symbol of symbols) {
          const nameMatches = symbol.name === symbolName || symbol.name.includes(symbolName);
          if (nameMatches) {
            const position = await this.findSymbolPositionInFile(filePath, symbol);
            fallbackMatches.push({
              name: symbol.name,
              kind: symbol.kind,
              position: position,
              range: symbol.location.range,
              detail: undefined,
            });
          }
        }
      }

      if (fallbackMatches.length > 0) {
        const foundKinds = [
          ...new Set(fallbackMatches.map((m) => this.symbolKindToString(m.kind))),
        ];
        fallbackWarning = `⚠️ No symbols found with kind "${effectiveSymbolKind}". Found ${fallbackMatches.length} symbol(s) with name "${symbolName}" of other kinds: ${foundKinds.join(', ')}.`;
        matches.push(...fallbackMatches);
        process.stderr.write(
          `[DEBUG findSymbolsByName] Fallback search found ${fallbackMatches.length} additional matches\n`
        );
      }
    }

    const combinedWarning = [validationWarning, fallbackWarning].filter(Boolean).join(' ');
    return { matches, warning: combinedWarning || undefined };
  }

  /**
   * Wait for LSP server to become idle after a change.
   * Uses multiple heuristics to determine when diagnostics are likely complete.
   */
  private async waitForDiagnosticsIdle(
    serverState: ServerState,
    fileUri: string,
    options: {
      maxWaitTime?: number; // Maximum time to wait in ms (default: 1000)
      idleTime?: number; // Time without updates to consider idle in ms (default: 100)
      checkInterval?: number; // How often to check for updates in ms (default: 50)
    } = {}
  ): Promise<void> {
    const { maxWaitTime = 1000, idleTime = 100, checkInterval = 50 } = options;

    const startTime = Date.now();
    let lastVersion = serverState.diagnosticVersions.get(fileUri) ?? -1;
    let lastUpdateTime = serverState.lastDiagnosticUpdate.get(fileUri) ?? startTime;

    process.stderr.write(
      `[DEBUG waitForDiagnosticsIdle] Waiting for diagnostics to stabilize for ${fileUri}\n`
    );

    while (Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      const currentVersion = serverState.diagnosticVersions.get(fileUri) ?? -1;
      const currentUpdateTime = serverState.lastDiagnosticUpdate.get(fileUri) ?? lastUpdateTime;

      // Check if version changed
      if (currentVersion !== lastVersion) {
        process.stderr.write(
          `[DEBUG waitForDiagnosticsIdle] Version changed from ${lastVersion} to ${currentVersion}\n`
        );
        lastVersion = currentVersion;
        lastUpdateTime = currentUpdateTime;
        continue;
      }

      // Check if enough time has passed without updates
      const timeSinceLastUpdate = Date.now() - currentUpdateTime;
      if (timeSinceLastUpdate >= idleTime) {
        process.stderr.write(
          `[DEBUG waitForDiagnosticsIdle] Server appears idle after ${timeSinceLastUpdate}ms without updates\n`
        );
        return;
      }
    }

    process.stderr.write(
      `[DEBUG waitForDiagnosticsIdle] Max wait time reached (${maxWaitTime}ms)\n`
    );
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    process.stderr.write(`[DEBUG getDiagnostics] Requesting diagnostics for ${filePath}\n`);

    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    // First, check if we have cached diagnostics from publishDiagnostics
    const fileUri = pathToUri(filePath);
    const cachedDiagnostics = serverState.diagnostics.get(fileUri);

    if (cachedDiagnostics !== undefined) {
      process.stderr.write(
        `[DEBUG getDiagnostics] Returning ${cachedDiagnostics.length} cached diagnostics from publishDiagnostics\n`
      );
      return cachedDiagnostics;
    }

    // If no cached diagnostics, try the pull-based textDocument/diagnostic
    process.stderr.write(
      '[DEBUG getDiagnostics] No cached diagnostics, trying textDocument/diagnostic request\n'
    );

    try {
      const result = await this.sendRequest(serverState.process, 'textDocument/diagnostic', {
        textDocument: { uri: fileUri },
      });

      process.stderr.write(
        `[DEBUG getDiagnostics] Result type: ${typeof result}, has kind: ${result && typeof result === 'object' && 'kind' in result}\n`
      );

      if (result && typeof result === 'object' && 'kind' in result) {
        const report = result as DocumentDiagnosticReport;

        if (report.kind === 'full' && report.items) {
          process.stderr.write(
            `[DEBUG getDiagnostics] Full report with ${report.items.length} diagnostics\n`
          );
          return report.items;
        }
        if (report.kind === 'unchanged') {
          process.stderr.write('[DEBUG getDiagnostics] Unchanged report (no new diagnostics)\n');
          return [];
        }
      }

      process.stderr.write(
        '[DEBUG getDiagnostics] Unexpected response format, returning empty array\n'
      );
      return [];
    } catch (error) {
      // Some LSP servers may not support textDocument/diagnostic
      // Try falling back to waiting for publishDiagnostics notifications
      process.stderr.write(
        `[DEBUG getDiagnostics] textDocument/diagnostic not supported or failed: ${error}. Waiting for publishDiagnostics...\n`
      );

      // Wait for the server to become idle and publish diagnostics
      // MCP tools can afford longer wait times for better reliability
      await this.waitForDiagnosticsIdle(serverState, fileUri, {
        maxWaitTime: 5000, // 5 seconds - generous timeout for MCP usage
        idleTime: 300, // 300ms idle time to ensure all diagnostics are received
      });

      // Check again for cached diagnostics
      const diagnosticsAfterWait = serverState.diagnostics.get(fileUri);
      if (diagnosticsAfterWait !== undefined) {
        process.stderr.write(
          `[DEBUG getDiagnostics] Returning ${diagnosticsAfterWait.length} diagnostics after waiting for idle state\n`
        );
        return diagnosticsAfterWait;
      }

      // If still no diagnostics, try triggering publishDiagnostics by making a no-op change
      process.stderr.write(
        '[DEBUG getDiagnostics] No diagnostics yet, triggering publishDiagnostics with no-op change\n'
      );

      try {
        // Get current file content
        const fileContent = readFileSync(filePath, 'utf-8');

        // Send a no-op change notification (add and remove a space at the end)
        await this.sendNotification(serverState.process, 'textDocument/didChange', {
          textDocument: {
            uri: fileUri,
            version: Date.now(), // Use timestamp as version
          },
          contentChanges: [
            {
              text: `${fileContent} `,
            },
          ],
        });

        // Immediately revert the change
        await this.sendNotification(serverState.process, 'textDocument/didChange', {
          textDocument: {
            uri: fileUri,
            version: Date.now() + 1,
          },
          contentChanges: [
            {
              text: fileContent,
            },
          ],
        });

        // Wait for the server to process the changes and become idle
        // After making changes, servers may need time to re-analyze
        await this.waitForDiagnosticsIdle(serverState, fileUri, {
          maxWaitTime: 3000, // 3 seconds after triggering changes
          idleTime: 300, // Consistent idle time for reliability
        });

        // Check one more time
        const diagnosticsAfterTrigger = serverState.diagnostics.get(fileUri);
        if (diagnosticsAfterTrigger !== undefined) {
          process.stderr.write(
            `[DEBUG getDiagnostics] Returning ${diagnosticsAfterTrigger.length} diagnostics after triggering publishDiagnostics\n`
          );
          return diagnosticsAfterTrigger;
        }
      } catch (triggerError) {
        process.stderr.write(
          `[DEBUG getDiagnostics] Failed to trigger publishDiagnostics: ${triggerError}\n`
        );
      }

      return [];
    }
  }

  async preloadServers(debug = true): Promise<void> {
    if (debug) {
      process.stderr.write('Scanning configured server directories for supported file types\n');
    }

    const serversToStart = new Set<LSPServerConfig>();

    // Scan each server's rootDir for its configured extensions
    for (const serverConfig of this.config.servers) {
      const serverDir = serverConfig.rootDir || process.cwd();

      if (debug) {
        process.stderr.write(
          `Scanning ${serverDir} for extensions: ${serverConfig.extensions.join(', ')}\n`
        );
      }

      try {
        const ig = await loadGitignore(serverDir);
        const foundExtensions = await scanDirectoryForExtensions(serverDir, 3, ig, false);

        // Check if any of this server's extensions are found in its rootDir
        const hasMatchingExtensions = serverConfig.extensions.some((ext) =>
          foundExtensions.has(ext)
        );

        if (hasMatchingExtensions) {
          serversToStart.add(serverConfig);
          if (debug) {
            const matchingExts = serverConfig.extensions.filter((ext) => foundExtensions.has(ext));
            process.stderr.write(
              `Found matching extensions in ${serverDir}: ${matchingExts.join(', ')}\n`
            );
          }
        }
      } catch (error) {
        if (debug) {
          process.stderr.write(`Failed to scan ${serverDir}: ${error}\n`);
        }
      }
    }

    if (debug) {
      process.stderr.write(`Starting ${serversToStart.size} LSP servers...\n`);
    }

    const startPromises = Array.from(serversToStart).map(async (serverConfig) => {
      try {
        const key = JSON.stringify(serverConfig);
        if (!this.servers.has(key)) {
          if (debug) {
            process.stderr.write(`Preloading LSP server: ${serverConfig.command.join(' ')}\n`);
          }
          const serverState = await this.startServer(serverConfig);
          this.servers.set(key, serverState);
          if (debug) {
            process.stderr.write(
              `Successfully preloaded LSP server for extensions: ${serverConfig.extensions.join(', ')}\n`
            );
          }
        }
      } catch (error) {
        process.stderr.write(
          `Failed to preload LSP server for ${serverConfig.extensions.join(', ')}: ${error}\n`
        );
      }
    });

    await Promise.all(startPromises);
    if (debug) {
      process.stderr.write('LSP server preloading completed\n');
    }
  }

  dispose(): void {
    for (const serverState of this.servers.values()) {
      // Clear restart timer if exists
      if (serverState.restartTimer) {
        clearTimeout(serverState.restartTimer);
      }
      serverState.process.kill();
    }
    this.servers.clear();
  }
}
