import { readFileSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
import { loadGitignore, scanDirectoryForExtensions } from './file-scanner.js';
import { loadConfig } from './lsp/config.js';
import {
  getValidSymbolKinds,
  findDefinition as opsFindDefinition,
  findImplementation as opsFindImplementation,
  findReferences as opsFindReferences,
  findSymbolsByName as opsFindSymbolsByName,
  getDiagnostics as opsGetDiagnostics,
  hover as opsHover,
  incomingCalls as opsIncomingCalls,
  outgoingCalls as opsOutgoingCalls,
  prepareCallHierarchy as opsPrepareCallHierarchy,
  renameSymbol as opsRenameSymbol,
  workspaceSymbol as opsWorkspaceSymbol,
  symbolKindToString,
} from './lsp/operations.js';
import { ServerManager } from './lsp/server-manager.js';
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  Config,
  Diagnostic,
  LSPServerConfig,
  Location,
  Position,
  ServerState,
  SymbolInformation,
  SymbolMatch,
} from './lsp/types.js';
import type { SymbolKind } from './lsp/types.js';
import { uriToPath } from './utils.js';

export class LSPClient {
  private config: Config;
  private serverManager = new ServerManager();

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
  }

  private getServerForFile(filePath: string): LSPServerConfig | null {
    const extension = filePath.split('.').pop();
    if (!extension) return null;

    process.stderr.write(`Looking for server for extension: ${extension}\n`);
    process.stderr.write(
      `Available servers: ${this.config.servers.map((s) => s.extensions.join(',')).join(' | ')}\n`
    );

    // Find all servers that support this extension
    const matchingServers = this.config.servers.filter((server) =>
      server.extensions.includes(extension)
    );

    if (matchingServers.length === 0) {
      process.stderr.write(`No server found for extension: ${extension}\n`);
      return null;
    }

    // If only one server matches, use it
    if (matchingServers.length === 1) {
      const server = matchingServers[0];
      if (server) {
        process.stderr.write(`Found server for ${extension}: ${server.command.join(' ')}\n`);
      }
      return server || null;
    }

    // Multiple servers match - pick the one with most specific rootDir
    // Check if filePath is already absolute (Unix: /, Windows: C:\ or UNC paths)
    const isAbsolutePath =
      filePath.startsWith('/') || filePath.startsWith('\\') || /^[a-zA-Z]:/.test(filePath);
    const absoluteFilePath = normalize(isAbsolutePath ? filePath : join(process.cwd(), filePath));
    let bestMatch: LSPServerConfig | null = null;
    let longestRootLength = -1;

    for (const server of matchingServers) {
      // Normalize rootDir to use platform-specific separators
      // rootDir might be stored with '/' separators even on Windows
      const normalizedServerRoot = server.rootDir ? normalize(server.rootDir) : '.';
      const isAbsolute =
        normalizedServerRoot.startsWith('/') || /^[a-zA-Z]:/.test(normalizedServerRoot);
      const rootDir = normalize(
        isAbsolute ? normalizedServerRoot : join(process.cwd(), normalizedServerRoot)
      );

      const rel = relative(rootDir, absoluteFilePath);

      // File is inside rootDir if relative path doesn't escape with '..'
      // Works on both Unix and Windows (normalize handles path separators)
      if (!rel.startsWith('..')) {
        if (rootDir.length > longestRootLength) {
          longestRootLength = rootDir.length;
          bestMatch = server;
        }
      }
    }

    // Fallback to first match if no rootDir contains the file
    const server = bestMatch || matchingServers[0];

    if (server) {
      process.stderr.write(
        `Found server for ${extension}: ${server.command.join(' ')} (rootDir: ${server.rootDir || '.'})\n`
      );
    }

    return server || null;
  }

  /**
   * Manually restart LSP servers for specific extensions or all servers
   * @param extensions Array of file extensions, or null to restart all
   * @returns Object with success status and details about restarted servers
   */
  async restartServers(extensions?: string[]): Promise<{
    success: boolean;
    restarted: string[];
    failed: string[];
    message: string;
  }> {
    const restarted: string[] = [];
    const failed: string[] = [];

    process.stderr.write(
      `[DEBUG restartServers] Request to restart servers for extensions: ${extensions ? extensions.join(', ') : 'all'}\n`
    );

    // Collect servers to restart
    const serversToRestart: Array<{ key: string; state: ServerState }> = [];

    for (const [key, serverState] of this.serverManager.getRunningServers().entries()) {
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

    // Restart each server by disposing and re-getting via serverManager
    for (const { state } of serversToRestart) {
      const serverDesc = `${state.config.command.join(' ')} (${state.config.extensions.join(', ')})`;

      try {
        // Clear existing timer
        if (state.restartTimer) {
          clearTimeout(state.restartTimer);
          state.restartTimer = undefined;
        }

        // Terminate old server
        state.process.kill();

        // Remove from running servers and start new one
        this.serverManager.getRunningServers().delete(JSON.stringify(state.config));
        await this.serverManager.getServer(state.config);

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

  /**
   * Synchronize file content with LSP server after external modifications
   * This should be called after any disk writes to keep the LSP server in sync
   */
  async syncFileContent(filePath: string): Promise<void> {
    try {
      const serverState = await this.getServer(filePath);

      // If file is not already open in the LSP server, open it first
      if (!serverState.documentManager.isOpen(filePath)) {
        process.stderr.write(
          `[DEBUG syncFileContent] File not open, opening it first: ${filePath}\n`
        );
        await serverState.documentManager.ensureOpen(filePath);
      }

      process.stderr.write(`[DEBUG syncFileContent] Syncing file: ${filePath}\n`);

      const fileContent = readFileSync(filePath, 'utf-8');
      serverState.documentManager.sendChange(filePath, fileContent);

      process.stderr.write(`[DEBUG syncFileContent] File synced: ${filePath}\n`);
    } catch (error) {
      process.stderr.write(`[DEBUG syncFileContent] Failed to sync file ${filePath}: ${error}\n`);
      // Don't throw - syncing is best effort
    }
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

    return this.serverManager.getServer(serverConfig);
  }

  async findDefinition(filePath: string, position: Position): Promise<Location[]> {
    const serverState = await this.getServer(filePath);
    return opsFindDefinition(serverState, filePath, position);
  }

  async findReferences(
    filePath: string,
    position: Position,
    includeDeclaration = true
  ): Promise<Location[]> {
    const serverState = await this.getServer(filePath);
    return opsFindReferences(serverState, filePath, position, includeDeclaration);
  }

  async renameSymbol(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<{
    changes?: Record<string, Array<{ range: { start: Position; end: Position }; newText: string }>>;
  }> {
    const serverState = await this.getServer(filePath);
    return opsRenameSymbol(serverState, filePath, position, newName);
  }

  symbolKindToString(kind: SymbolKind): string {
    return symbolKindToString(kind);
  }

  getValidSymbolKinds(): string[] {
    return getValidSymbolKinds();
  }

  async findSymbolsByName(
    filePath: string,
    symbolName: string,
    symbolKind?: string
  ): Promise<{ matches: SymbolMatch[]; warning?: string }> {
    const serverState = await this.getServer(filePath);
    return opsFindSymbolsByName(serverState, filePath, symbolName, symbolKind);
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const serverState = await this.getServer(filePath);
    return opsGetDiagnostics(serverState, filePath);
  }

  async hover(
    filePath: string,
    position: Position
  ): Promise<{
    contents: string | { kind: string; value: string };
    range?: { start: Position; end: Position };
  } | null> {
    const serverState = await this.getServer(filePath);
    return opsHover(serverState, filePath, position);
  }

  async workspaceSymbol(query: string): Promise<SymbolInformation[]> {
    const servers = Array.from(this.serverManager.getRunningServers().values());
    if (servers.length === 0) {
      process.stderr.write('[DEBUG workspaceSymbol] No LSP servers running\n');
      return [];
    }

    const serverState = servers[0];
    if (!serverState) return [];

    return opsWorkspaceSymbol(serverState, query);
  }

  async findImplementation(filePath: string, position: Position): Promise<Location[]> {
    const serverState = await this.getServer(filePath);
    return opsFindImplementation(serverState, filePath, position);
  }

  async prepareCallHierarchy(filePath: string, position: Position): Promise<CallHierarchyItem[]> {
    const serverState = await this.getServer(filePath);
    return opsPrepareCallHierarchy(serverState, filePath, position);
  }

  async incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]> {
    const filePath = uriToPath(item.uri);
    const serverState = await this.getServer(filePath);
    return opsIncomingCalls(serverState, item);
  }

  async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
    const filePath = uriToPath(item.uri);
    const serverState = await this.getServer(filePath);
    return opsOutgoingCalls(serverState, item);
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
        if (debug) {
          process.stderr.write(`Preloading LSP server: ${serverConfig.command.join(' ')}\n`);
        }
        await this.serverManager.getServer(serverConfig);
        if (debug) {
          process.stderr.write(
            `Successfully preloaded LSP server for extensions: ${serverConfig.extensions.join(', ')}\n`
          );
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
    this.serverManager.dispose();
  }
}
