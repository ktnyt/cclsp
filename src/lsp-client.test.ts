import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LSPClient } from './lsp-client.js';

// Type for accessing private methods in tests
type LSPClientInternal = {
  startServer: (config: unknown) => Promise<unknown>;
  getServer: (filePath: string) => Promise<{ initializationPromise: Promise<void> }>;
  ensureFileOpen: (filePath: string) => Promise<void>;
  sendRequest: (method: string, params: unknown) => Promise<unknown>;
};

const TEST_DIR = process.env.RUNNER_TEMP
  ? `${process.env.RUNNER_TEMP}/cclsp-test`
  : '/tmp/cclsp-test';

const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json');

describe('LSPClient', () => {
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
          extensions: ['ts', 'js', 'tsx', 'jsx'],
          command: ['npx', '--', 'typescript-language-server', '--stdio'],
          rootDir: '.',
        },
      ],
    };

    const configContent = JSON.stringify(testConfig, null, 2);

    // Use async file operations for better CI compatibility
    await writeFile(TEST_CONFIG_PATH, configContent);

    // Small delay to ensure filesystem consistency
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify file creation with retry logic for CI environments
    let fileExists = existsSync(TEST_CONFIG_PATH);
    let retries = 0;
    while (!fileExists && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      fileExists = existsSync(TEST_CONFIG_PATH);
      retries++;
    }

    if (!fileExists) {
      throw new Error(
        `Failed to create config file at ${TEST_CONFIG_PATH} after ${retries} retries`
      );
    }
  });

  it('should fail to create LSPClient when config file does not exist', () => {
    const stderrSpy = spyOn(process.stderr, 'write');
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() => {
      new LSPClient('/nonexistent/config.json');
    }).toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load config from /nonexistent/config.json')
    );

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should fail to create LSPClient when no configPath provided', () => {
    const stderrSpy = spyOn(process.stderr, 'write');
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() => {
      new LSPClient();
    }).toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'configPath is required when CCLSP_CONFIG_PATH environment variable is not set'
      )
    );

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should create LSPClient with valid config file', () => {
    const client = new LSPClient(TEST_CONFIG_PATH);
    expect(client).toBeDefined();
  });

  describe('preloadServers', () => {
    it('should scan directory and find file extensions', async () => {
      // Create test files with different extensions
      await writeFile(join(TEST_DIR, 'test.ts'), 'console.log("test");');
      await writeFile(join(TEST_DIR, 'test.js'), 'console.log("test");');
      await writeFile(join(TEST_DIR, 'test.py'), 'print("test")');

      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock process.stderr.write to capture output
      const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);

      // Mock startServer to avoid actually starting LSP servers
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockImplementation(async () => ({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      }));

      await client.preloadServers(TEST_DIR, false);

      // Should attempt to start TypeScript server for .ts and .js files
      expect(startServerSpy).toHaveBeenCalled();

      stderrSpy.mockRestore();
      startServerSpy.mockRestore();
    });

    it('should handle missing .gitignore gracefully', async () => {
      // Create test file without .gitignore
      await writeFile(join(TEST_DIR, 'test.ts'), 'console.log("test");');

      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock startServer
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockImplementation(async () => ({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      }));

      // Should not throw error
      await expect(async () => {
        await client.preloadServers(TEST_DIR, false);
      }).not.toThrow();

      startServerSpy.mockRestore();
    });

    it.skip('should handle preloading errors gracefully', async () => {
      await writeFile(join(TEST_DIR, 'test.ts'), 'console.log("test");');

      const client = new LSPClient(TEST_CONFIG_PATH);

      const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);

      // Mock startServer to throw error
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockRejectedValue(new Error('Failed to start server'));

      // Should complete without throwing
      await client.preloadServers(TEST_DIR, false);

      // Should have logged the error to stderr
      expect(stderrSpy).toHaveBeenCalled();

      startServerSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  describe('initialization promise behavior', () => {
    it.skip('should wait for initialization on first call and pass through on subsequent calls', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      let initResolve: (() => void) | undefined;
      const initPromise = new Promise<void>((resolve) => {
        initResolve = resolve;
      });

      // Mock getServer to return a server state with our controlled promise
      const mockServerState = {
        initializationPromise: initPromise,
        process: { stdin: { write: jest.fn() } },
        initialized: false,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      // Mock ensureFileOpen to avoid file operations
      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      // Mock sendRequest to avoid actual LSP communication
      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockResolvedValue([]);

      // Start first call (should wait)
      const firstCallPromise = client.findDefinition('test.ts', {
        line: 0,
        character: 0,
      });

      // Wait a bit to ensure call is waiting
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Resolve initialization
      initResolve?.();

      // Wait for call to complete
      await firstCallPromise;

      // Verify call was made
      expect(sendRequestSpy).toHaveBeenCalled();

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
    });

    it('should handle multiple concurrent calls waiting for initialization', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      let initResolve: (() => void) | undefined;
      const initPromise = new Promise<void>((resolve) => {
        initResolve = resolve;
      });

      const mockServerState = {
        initializationPromise: initPromise,
        process: { stdin: { write: jest.fn() } },
        initialized: false,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockResolvedValue([]);

      // Start multiple concurrent calls
      const promises = [
        client.findDefinition('test.ts', { line: 0, character: 0 }),
        client.findReferences('test.ts', { line: 1, character: 0 }),
        client.renameSymbol('test.ts', { line: 2, character: 0 }, 'newName'),
      ];

      // Wait a bit to ensure all are waiting
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Resolve initialization - all should proceed
      initResolve?.();

      // All calls should complete successfully
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);

      // Each method should have been called once
      expect(sendRequestSpy).toHaveBeenCalledTimes(3);

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
    });
  });

  describe('Symbol kind fallback functionality', () => {
    it('should return fallback results when specified symbol kind not found', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock getDocumentSymbols to return test symbols
      const mockSymbols = [
        {
          name: 'testFunction',
          kind: 12, // Function
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } },
        },
        {
          name: 'testVariable',
          kind: 13, // Variable
          range: { start: { line: 3, character: 0 }, end: { line: 3, character: 20 } },
          selectionRange: { start: { line: 3, character: 6 }, end: { line: 3, character: 18 } },
        },
      ];

      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockSymbols
      );

      // Search for 'testFunction' with kind 'class' (should not match, then fallback to all kinds)
      const result = await client.findSymbolsByName('test.ts', 'testFunction', 'class');

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.name).toBe('testFunction');
      expect(result.matches[0]?.kind).toBe(12); // Function
      expect(result.warning).toContain('No symbols found with kind "class"');
      expect(result.warning).toContain(
        'Found 1 symbol(s) with name "testFunction" of other kinds: function'
      );

      getDocumentSymbolsSpy.mockRestore();
    });

    it('should return multiple fallback results of different kinds', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock getDocumentSymbols to return symbols with same name but different kinds
      const mockSymbols = [
        {
          name: 'test',
          kind: 12, // Function
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } },
        },
        {
          name: 'test',
          kind: 13, // Variable
          range: { start: { line: 3, character: 0 }, end: { line: 3, character: 15 } },
          selectionRange: { start: { line: 3, character: 6 }, end: { line: 3, character: 10 } },
        },
        {
          name: 'test',
          kind: 5, // Class
          range: { start: { line: 5, character: 0 }, end: { line: 10, character: 1 } },
          selectionRange: { start: { line: 5, character: 6 }, end: { line: 5, character: 10 } },
        },
      ];

      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockSymbols
      );

      // Search for 'test' with kind 'interface' (should not match, then fallback to all kinds)
      const result = await client.findSymbolsByName('test.ts', 'test', 'interface');

      expect(result.matches).toHaveLength(3);
      expect(result.warning).toContain('No symbols found with kind "interface"');
      expect(result.warning).toContain(
        'Found 3 symbol(s) with name "test" of other kinds: function, variable, class'
      );

      getDocumentSymbolsSpy.mockRestore();
    });

    it('should not trigger fallback when correct symbol kind is found', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockSymbols = [
        {
          name: 'testFunction',
          kind: 12, // Function
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } },
        },
        {
          name: 'testVariable',
          kind: 13, // Variable
          range: { start: { line: 3, character: 0 }, end: { line: 3, character: 20 } },
          selectionRange: { start: { line: 3, character: 6 }, end: { line: 3, character: 18 } },
        },
      ];

      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockSymbols
      );

      // Search for 'testFunction' with correct kind 'function'
      const result = await client.findSymbolsByName('test.ts', 'testFunction', 'function');

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.name).toBe('testFunction');
      expect(result.warning).toBeUndefined(); // No warning expected

      getDocumentSymbolsSpy.mockRestore();
    });

    it('should return empty results when no symbols found even with fallback', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockSymbols = [
        {
          name: 'otherFunction',
          kind: 12, // Function
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 22 } },
        },
      ];

      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockSymbols
      );

      // Search for non-existent symbol
      const result = await client.findSymbolsByName('test.ts', 'nonExistentSymbol', 'function');

      expect(result.matches).toHaveLength(0);
      expect(result.warning).toBeUndefined(); // No fallback triggered since no name matches found

      getDocumentSymbolsSpy.mockRestore();
    });
  });

  describe('Server restart functionality', () => {
    it('should setup restart timer when restartInterval is configured', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock setTimeout to verify timer is set
      const setTimeoutSpy = spyOn(global, 'setTimeout').mockImplementation((() => 123) as any);

      const mockServerState = {
        process: { kill: jest.fn() },
        initialized: true,
        initializationPromise: Promise.resolve(),
        openFiles: new Set(),
        startTime: Date.now(),
        config: {
          extensions: ['ts'],
          command: ['echo', 'mock'],
          restartInterval: 0.1, // 0.1 minutes
        },
        restartTimer: undefined,
      };

      try {
        // Call setupRestartTimer directly
        (client as any).setupRestartTimer(mockServerState);

        // Verify setTimeout was called with correct interval (0.1 minutes = 6000ms)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 6000);
      } finally {
        setTimeoutSpy.mockRestore();
        client.dispose();
      }
    });

    it('should not setup restart timer when restartInterval is not configured', () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      // Mock setTimeout to verify timer is NOT set
      const setTimeoutSpy = spyOn(global, 'setTimeout').mockImplementation((() => 123) as any);

      const mockServerState = {
        process: { kill: jest.fn() },
        initialized: true,
        initializationPromise: Promise.resolve(),
        openFiles: new Set(),
        startTime: Date.now(),
        config: {
          extensions: ['ts'],
          command: ['echo', 'mock'],
          // No restartInterval
        },
        restartTimer: undefined,
      };

      try {
        // Call setupRestartTimer directly
        (client as any).setupRestartTimer(mockServerState);

        // Verify setTimeout was NOT called
        expect(setTimeoutSpy).not.toHaveBeenCalled();
      } finally {
        setTimeoutSpy.mockRestore();
        client.dispose();
      }
    });

    it('should clear restart timer when disposing client', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockTimer = setTimeout(() => {}, 1000);
      const mockServerState = {
        process: { kill: jest.fn() },
        restartTimer: mockTimer,
      };

      // Mock servers map to include our test server state
      const serversMap = new Map();
      serversMap.set('test-key', mockServerState);
      (client as any).servers = serversMap;

      const clearTimeoutSpy = spyOn(global, 'clearTimeout');

      client.dispose();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimer);
      expect(mockServerState.process.kill).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('getDiagnostics', () => {
    it('should return diagnostics when server supports textDocument/diagnostic', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockDiagnostics = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
          severity: 1, // Error
          message: 'Test error message',
          source: 'test',
        },
        {
          range: {
            start: { line: 5, character: 2 },
            end: { line: 5, character: 8 },
          },
          severity: 2, // Warning
          message: 'Test warning message',
          source: 'test',
        },
      ];

      const mockServerState = {
        initializationPromise: Promise.resolve(),
        process: { stdin: { write: jest.fn() } },
        initialized: true,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockResolvedValue({
        kind: 'full',
        items: mockDiagnostics,
      });

      const result = await client.getDiagnostics('test.ts');

      expect(result).toEqual(mockDiagnostics);
      expect(sendRequestSpy).toHaveBeenCalledWith(
        mockServerState.process,
        'textDocument/diagnostic',
        {
          textDocument: { uri: 'file://test.ts' },
        }
      );

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
    });

    it('should return empty array for unchanged report', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockServerState = {
        initializationPromise: Promise.resolve(),
        process: { stdin: { write: jest.fn() } },
        initialized: true,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockResolvedValue({
        kind: 'unchanged',
        resultId: 'test-result-id',
      });

      const result = await client.getDiagnostics('test.ts');

      expect(result).toEqual([]);

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
    });

    it('should handle server not supporting textDocument/diagnostic', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockServerState = {
        initializationPromise: Promise.resolve(),
        process: { stdin: { write: jest.fn() } },
        initialized: true,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockRejectedValue(new Error('Method not found'));

      const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);

      const result = await client.getDiagnostics('test.ts');

      expect(result).toEqual([]);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('textDocument/diagnostic not supported or failed')
      );

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it('should handle unexpected response format', async () => {
      const client = new LSPClient(TEST_CONFIG_PATH);

      const mockServerState = {
        initializationPromise: Promise.resolve(),
        process: { stdin: { write: jest.fn() } },
        initialized: true,
        openFiles: new Set(),
      };

      const getServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'getServer'
      ).mockResolvedValue(mockServerState);

      const ensureFileOpenSpy = spyOn(
        client as unknown as LSPClientInternal,
        'ensureFileOpen'
      ).mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(
        client as unknown as LSPClientInternal,
        'sendRequest'
      ).mockResolvedValue({ unexpected: 'response' });

      const result = await client.getDiagnostics('test.ts');

      expect(result).toEqual([]);

      getServerSpy.mockRestore();
      ensureFileOpenSpy.mockRestore();
      sendRequestSpy.mockRestore();
    });
  });
});
