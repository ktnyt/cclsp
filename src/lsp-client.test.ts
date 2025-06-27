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
});
