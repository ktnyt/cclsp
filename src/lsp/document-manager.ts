import { readFileSync } from 'node:fs';
import { pathToUri } from '../utils.js';
import type { JsonRpcTransport } from './json-rpc.js';

/**
 * Manages document lifecycle for a single LSP server.
 *
 * Handles:
 * - Opening files (textDocument/didOpen) with version tracking
 * - Syncing file changes (textDocument/didChange) with version increment
 * - Language ID mapping from file extensions
 * - Tracking which files are open and their current versions
 */
export class DocumentManager {
  private readonly openFiles = new Set<string>();
  private readonly fileVersions = new Map<string, number>();

  constructor(private readonly transport: JsonRpcTransport) {}

  /**
   * Ensure a file is open in the LSP server. If already open, returns false.
   * If not open, reads the file, sends textDocument/didOpen, and returns true.
   */
  async ensureOpen(filePath: string): Promise<boolean> {
    if (this.openFiles.has(filePath)) {
      process.stderr.write(`[DEBUG ensureOpen] File already open: ${filePath}\n`);
      return false;
    }

    process.stderr.write(`[DEBUG ensureOpen] Opening file: ${filePath}\n`);

    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const uri = pathToUri(filePath);
      const languageId = getLanguageId(filePath);

      process.stderr.write(
        `[DEBUG ensureOpen] File content length: ${fileContent.length}, languageId: ${languageId}\n`
      );

      this.transport.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: fileContent,
        },
      });

      this.openFiles.add(filePath);
      this.fileVersions.set(filePath, 1);
      process.stderr.write(`[DEBUG ensureOpen] File opened successfully: ${filePath}\n`);
      return true;
    } catch (error) {
      process.stderr.write(`[DEBUG ensureOpen] Failed to open file ${filePath}: ${error}\n`);
      throw error;
    }
  }

  /**
   * Send a textDocument/didChange notification with version increment.
   * The file must already be open (call ensureOpen first).
   */
  sendChange(filePath: string, text: string): void {
    const uri = pathToUri(filePath);
    const version = (this.fileVersions.get(filePath) || 1) + 1;
    this.fileVersions.set(filePath, version);

    this.transport.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    });
  }

  /**
   * Check if a file is currently open in the LSP server.
   */
  isOpen(filePath: string): boolean {
    return this.openFiles.has(filePath);
  }

  /**
   * Get the current version number for a file.
   */
  getVersion(filePath: string): number {
    return this.fileVersions.get(filePath) || 0;
  }
}

/**
 * Map file extension to LSP language identifier.
 */
export function getLanguageId(filePath: string): string {
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
    jar: 'java',
    class: 'java',
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
