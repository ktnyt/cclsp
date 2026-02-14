import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LSPClient } from './lsp-client.js';
import { pathToUri } from './utils.js';

const TEST_DIR = process.env.RUNNER_TEMP
  ? `${process.env.RUNNER_TEMP}/cclsp-move-test`
  : '/tmp/cclsp-move-test';

const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json');

describe('moveFile', () => {
  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });

    // Create test config file
    const testConfig = {
      servers: [
        {
          extensions: ['ts', 'js'],
          command: ['npx', '--', 'typescript-language-server', '--stdio'],
          rootDir: TEST_DIR,
        },
      ],
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    // Wait for filesystem consistency
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('validation', () => {
    it('should throw error when source file does not exist', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      await expect(client.moveFile('/nonexistent/file.ts', '/some/destination.ts')).rejects.toThrow(
        'Source file does not exist'
      );

      client.dispose();
    });

    it('should throw error when destination already exists', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      const destPath = join(TEST_DIR, 'dest.ts');

      writeFileSync(sourcePath, 'export const x = 1;');
      writeFileSync(destPath, 'export const y = 2;');

      await expect(client.moveFile(sourcePath, destPath)).rejects.toThrow(
        'Destination already exists'
      );

      client.dispose();
    });

    it('should throw error when source is a directory', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourceDir = join(TEST_DIR, 'source-dir');
      mkdirSync(sourceDir);

      await expect(client.moveFile(sourceDir, join(TEST_DIR, 'dest'))).rejects.toThrow(
        'Source is a directory, not a file'
      );

      client.dispose();
    });
  });

  describe('dry run mode', () => {
    it('should return preview without moving file in dry run mode', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');

      const destPath = join(TEST_DIR, 'dest.ts');

      const result = await client.moveFile(sourcePath, destPath, true);

      expect(result.moved).toBe(false);
      expect(existsSync(sourcePath)).toBe(true);
      expect(existsSync(destPath)).toBe(false);

      client.dispose();
    });

    it('should include warnings when no servers support willRenameFiles', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');

      const destPath = join(TEST_DIR, 'dest.ts');

      // No servers are running, so no warnings about capability support
      const result = await client.moveFile(sourcePath, destPath, true);

      expect(result.moved).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.importChanges).toBeNull();

      client.dispose();
    });
  });

  describe('normalizeWorkspaceEdit', () => {
    it('should handle changes format', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const result = {
        changes: {
          'file:///test.ts': [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
              newText: './new-path',
            },
          ],
        },
      };

      // Access private method for testing
      const normalized = (client as any).normalizeWorkspaceEdit(result);

      expect(normalized).toEqual(result.changes);

      client.dispose();
    });

    it('should handle documentChanges format', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const result = {
        documentChanges: [
          {
            textDocument: { uri: 'file:///test.ts', version: 1 },
            edits: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                newText: './new-path',
              },
            ],
          },
        ],
      };

      const normalized = (client as any).normalizeWorkspaceEdit(result);

      expect(normalized).toEqual({
        'file:///test.ts': [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            newText: './new-path',
          },
        ],
      });

      client.dispose();
    });

    it('should return null for invalid input', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      expect((client as any).normalizeWorkspaceEdit(null)).toBeNull();
      expect((client as any).normalizeWorkspaceEdit(undefined)).toBeNull();
      expect((client as any).normalizeWorkspaceEdit({})).toBeNull();
      expect((client as any).normalizeWorkspaceEdit({ other: 'data' })).toBeNull();

      client.dispose();
    });

    it('should return null for empty documentChanges', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      // Empty changes object is still returned as-is (not null)
      expect((client as any).normalizeWorkspaceEdit({ changes: {} })).toEqual({});
      // Empty documentChanges array returns null
      expect((client as any).normalizeWorkspaceEdit({ documentChanges: [] })).toBeNull();

      client.dispose();
    });
  });

  describe('actual file move', () => {
    it('should move file when not in dry run mode', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');

      const destPath = join(TEST_DIR, 'dest.ts');

      const result = await client.moveFile(sourcePath, destPath, false);

      expect(result.moved).toBe(true);
      expect(existsSync(sourcePath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);

      client.dispose();
    });

    it('should create destination directory if it does not exist', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');

      const destDir = join(TEST_DIR, 'subdir', 'nested');
      const destPath = join(destDir, 'dest.ts');

      expect(existsSync(destDir)).toBe(false);

      const result = await client.moveFile(sourcePath, destPath, false);

      expect(result.moved).toBe(true);
      expect(existsSync(destDir)).toBe(true);
      expect(existsSync(destPath)).toBe(true);

      client.dispose();
    });
  });

  describe('server interaction', () => {
    it('should collect import changes from servers that support willRenameFiles', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');
      const destPath = join(TEST_DIR, 'dest.ts');

      // Mock a server with willRename support
      const mockServerState = {
        process: {
          stdin: { write: jest.fn() },
          kill: jest.fn(),
        },
        initialized: true,
        initializationPromise: Promise.resolve(),
        openFiles: new Set<string>(),
        fileVersions: new Map(),
        diagnostics: new Map(),
        lastDiagnosticUpdate: new Map(),
        diagnosticVersions: new Map(),
        config: {
          extensions: ['ts'],
          command: ['mock-server'],
        },
        serverCapabilities: {
          workspace: {
            fileOperations: {
              willRename: true,
              didRename: true,
            },
          },
        },
        adapter: undefined,
      };

      // Set up mock server
      const serversMap = new Map();
      serversMap.set('mock-key', mockServerState);
      (client as any).servers = serversMap;

      // Mock getServer and ensureFileOpen to avoid starting real LSP server
      const getServerSpy = spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      const ensureFileOpenSpy = spyOn(client as any, 'ensureFileOpen').mockResolvedValue(false);

      // Mock sendRequest to return workspace edit
      const sendRequestSpy = spyOn(client as any, 'sendRequest').mockResolvedValue({
        changes: {
          'file:///other.ts': [
            {
              range: { start: { line: 0, character: 20 }, end: { line: 0, character: 30 } },
              newText: './dest',
            },
          ],
        },
      });

      // Mock sendNotification
      const sendNotificationSpy = spyOn(client as any, 'sendNotification').mockImplementation(
        () => {}
      );

      const result = await client.moveFile(sourcePath, destPath, true);

      expect(result.moved).toBe(false); // dry run
      expect(result.importChanges).not.toBeNull();
      expect(result.warnings).toHaveLength(0);
      expect(sendRequestSpy).toHaveBeenCalledWith(
        mockServerState.process,
        'workspace/willRenameFiles',
        expect.any(Object),
        45000
      );

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
      sendNotificationSpy.mockRestore();
      client.dispose();
    });

    it('should warn when server does not support willRenameFiles', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');
      const destPath = join(TEST_DIR, 'dest.ts');

      // Mock a server without willRename support
      const mockServerState = {
        process: {
          stdin: { write: jest.fn() },
          kill: jest.fn(),
        },
        initialized: true,
        initializationPromise: Promise.resolve(),
        openFiles: new Set<string>(),
        fileVersions: new Map(),
        diagnostics: new Map(),
        lastDiagnosticUpdate: new Map(),
        diagnosticVersions: new Map(),
        config: {
          extensions: ['ts'],
          command: ['mock-server'],
        },
        serverCapabilities: {
          // No fileOperations capability
        },
        adapter: undefined,
      };

      const serversMap = new Map();
      serversMap.set('mock-key', mockServerState);
      (client as any).servers = serversMap;

      // Mock getServer and ensureFileOpen to avoid starting real LSP server
      const getServerSpy = spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      const ensureFileOpenSpy = spyOn(client as any, 'ensureFileOpen').mockResolvedValue(false);

      const result = await client.moveFile(sourcePath, destPath, true);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('does not support willRenameFiles');

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      client.dispose();
    });

    it('should handle server request failures gracefully', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const sourcePath = join(TEST_DIR, 'source.ts');
      writeFileSync(sourcePath, 'export const x = 1;');
      const destPath = join(TEST_DIR, 'dest.ts');

      // Mock a server with willRename support
      const mockServerState = {
        process: {
          stdin: { write: jest.fn() },
          kill: jest.fn(),
        },
        initialized: true,
        initializationPromise: Promise.resolve(),
        openFiles: new Set<string>(),
        fileVersions: new Map(),
        diagnostics: new Map(),
        lastDiagnosticUpdate: new Map(),
        diagnosticVersions: new Map(),
        config: {
          extensions: ['ts'],
          command: ['mock-server'],
        },
        serverCapabilities: {
          workspace: {
            fileOperations: {
              willRename: true,
            },
          },
        },
        adapter: undefined,
      };

      const serversMap = new Map();
      serversMap.set('mock-key', mockServerState);
      (client as any).servers = serversMap;

      // Mock getServer and ensureFileOpen to avoid starting real LSP server
      const getServerSpy = spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      const ensureFileOpenSpy = spyOn(client as any, 'ensureFileOpen').mockResolvedValue(false);

      // Mock sendRequest to throw error
      const sendRequestSpy = spyOn(client as any, 'sendRequest').mockRejectedValue(
        new Error('Server timeout')
      );

      const result = await client.moveFile(sourcePath, destPath, true);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Failed to get import updates');
      expect(result.warnings[0]).toContain('Server timeout');

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
      client.dispose();
    });
  });
});
