import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { constants, access, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadGitignore, scanDirectoryForExtensions } from './file-scanner.js';
import type {
  Config,
  LSPError,
  LSPLocation,
  LSPServerConfig,
  Location,
  Position,
} from './types.js';

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
    };

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
      process.stderr.write(`LSP Server stderr: ${data.toString()}`);
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
          references: { includeDeclaration: true },
          rename: { prepareSupport: false },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      rootUri: `file://${serverConfig.rootDir || process.cwd()}`,
      workspaceFolders: [
        {
          uri: `file://${serverConfig.rootDir || process.cwd()}`,
          name: 'workspace',
        },
      ],
    });

    await this.sendNotification(childProcess, 'initialized', {});

    serverState.initialized = true;
    initializationResolve?.();
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
      // Could handle server notifications here if needed
    }
  }

  private sendMessage(process: ChildProcess, message: LSPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    process.stdin?.write(header + content);
  }

  private sendRequest(process: ChildProcess, method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: LSPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
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

  private async ensureFileOpen(serverState: ServerState, filePath: string): Promise<void> {
    if (serverState.openFiles.has(filePath)) {
      return;
    }

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const uri = `file://${filePath}`;

      await this.sendNotification(serverState.process, 'textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: this.getLanguageId(filePath),
          version: 1,
          text: fileContent,
        },
      });

      serverState.openFiles.add(filePath);
    } catch (error) {
      process.stderr.write(`Failed to open file ${filePath}: ${error}\n`);
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
    const serverConfig = this.getServerForFile(filePath);
    if (!serverConfig) {
      throw new Error(`No LSP server configured for file: ${filePath}`);
    }

    const key = JSON.stringify(serverConfig);
    if (!this.servers.has(key)) {
      const serverState = await this.startServer(serverConfig);
      this.servers.set(key, serverState);
    }

    const server = this.servers.get(key);
    if (!server) {
      throw new Error('Failed to get or create server');
    }
    return server;
  }

  async findDefinition(filePath: string, position: Position): Promise<Location[]> {
    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    const result = await this.sendRequest(serverState.process, 'textDocument/definition', {
      textDocument: { uri: `file://${filePath}` },
      position,
    });

    if (Array.isArray(result)) {
      return result.map((loc: LSPLocation) => ({
        uri: loc.uri,
        range: loc.range,
      }));
    }
    if (result && typeof result === 'object' && 'uri' in result) {
      const location = result as LSPLocation;
      return [
        {
          uri: location.uri,
          range: location.range,
        },
      ];
    }

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

    const result = await this.sendRequest(serverState.process, 'textDocument/references', {
      textDocument: { uri: `file://${filePath}` },
      position,
      context: { includeDeclaration },
    });

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
    const serverState = await this.getServer(filePath);

    // Wait for the server to be fully initialized
    await serverState.initializationPromise;

    // Ensure the file is opened and synced with the LSP server
    await this.ensureFileOpen(serverState, filePath);

    const result = await this.sendRequest(serverState.process, 'textDocument/rename', {
      textDocument: { uri: `file://${filePath}` },
      position,
      newName,
    });

    if (result && typeof result === 'object' && 'changes' in result) {
      return result as {
        changes: Record<
          string,
          Array<{ range: { start: Position; end: Position }; newText: string }>
        >;
      };
    }

    return {};
  }

  async preloadServers(projectDir: string = process.cwd(), debug = true): Promise<void> {
    if (debug) {
      process.stderr.write(`Scanning project directory for supported file types: ${projectDir}\n`);
    }

    const ig = await loadGitignore(projectDir);
    const foundExtensions = await scanDirectoryForExtensions(projectDir, 3, ig, debug);
    if (debug) {
      process.stderr.write(`Found extensions: ${Array.from(foundExtensions).join(', ')}\n`);
    }

    const serversToStart = new Set<LSPServerConfig>();

    for (const extension of foundExtensions) {
      const serverConfig = this.config.servers.find((server) =>
        server.extensions.includes(extension)
      );
      if (serverConfig) {
        serversToStart.add(serverConfig);
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
      serverState.process.kill();
    }
    this.servers.clear();
  }
}
