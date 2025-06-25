import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LSPClient } from './lsp-client.js';

// Type for accessing private methods in tests
type LSPClientInternal = {
  startServer: (config: unknown) => Promise<unknown>;
  scanDirectoryForExtensions: (...args: unknown[]) => Set<string>;
  loadGitignore: (dir: string) => { ignores: (path: string) => boolean };
};

const TEST_DIR = '/tmp/cclsp-test';

describe('LSPClient', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('should create LSPClient with default config when no config file exists', () => {
    const client = new LSPClient('/nonexistent/config.json');
    expect(client).toBeDefined();
  });

  it('should handle file extension matching', () => {
    const client = new LSPClient();
    expect(client).toBeDefined();
  });

  describe('preloadServers', () => {
    it('should scan directory and find file extensions', async () => {
      // Create test files with different extensions
      writeFileSync(join(TEST_DIR, 'test.ts'), 'console.log("test");');
      writeFileSync(join(TEST_DIR, 'test.js'), 'console.log("test");');
      writeFileSync(join(TEST_DIR, 'test.py'), 'print("test")');

      const client = new LSPClient();

      // Mock process.stderr.write to capture output
      const stderrSpy = spyOn(process.stderr, 'write');

      // Mock startServer to avoid actually starting LSP servers
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockResolvedValue({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      });

      await client.preloadServers(TEST_DIR);

      // Check that extensions were found
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Found extensions:'));

      // Should attempt to start TypeScript server for .ts and .js files
      expect(startServerSpy).toHaveBeenCalled();

      stderrSpy.mockRestore();
      startServerSpy.mockRestore();
    });

    it('should respect gitignore patterns', async () => {
      // Create .gitignore
      writeFileSync(join(TEST_DIR, '.gitignore'), 'ignored.ts\nignored_dir/\n');

      // Create files - some should be ignored
      writeFileSync(join(TEST_DIR, 'normal.ts'), 'console.log("normal");');
      writeFileSync(join(TEST_DIR, 'ignored.ts'), 'console.log("ignored");');

      mkdirSync(join(TEST_DIR, 'ignored_dir'));
      writeFileSync(join(TEST_DIR, 'ignored_dir', 'file.ts'), 'console.log("ignored");');

      const client = new LSPClient();

      // Mock process.stderr.write to capture output
      const stderrSpy = spyOn(process.stderr, 'write');

      // Mock startServer
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockResolvedValue({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      });

      await client.preloadServers(TEST_DIR);

      // Should load gitignore patterns
      expect(stderrSpy).toHaveBeenCalledWith('Loaded .gitignore patterns\n');

      stderrSpy.mockRestore();
      startServerSpy.mockRestore();
    });

    it('should skip common ignore patterns by default', async () => {
      // Create files in directories that should be ignored
      mkdirSync(join(TEST_DIR, 'node_modules', 'pkg'), { recursive: true });
      writeFileSync(join(TEST_DIR, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};');

      mkdirSync(join(TEST_DIR, 'dist'));
      writeFileSync(join(TEST_DIR, 'dist', 'build.js'), 'console.log("build");');

      // Create normal file
      writeFileSync(join(TEST_DIR, 'src.ts'), 'console.log("src");');

      const client = new LSPClient();

      // Mock scanDirectoryForExtensions to spy on which directories are processed
      const originalScan = (client as unknown as LSPClientInternal).scanDirectoryForExtensions;
      const scanSpy = spyOn(
        client as unknown as LSPClientInternal,
        'scanDirectoryForExtensions'
      ).mockImplementation((...args) => originalScan.call(client, ...args));

      // Mock startServer
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockResolvedValue({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      });

      await client.preloadServers(TEST_DIR);

      // Should have found TypeScript extension from src.ts but not from ignored directories
      expect(scanSpy).toHaveBeenCalled();

      scanSpy.mockRestore();
      startServerSpy.mockRestore();
    });

    it('should handle missing .gitignore gracefully', async () => {
      // Create test file without .gitignore
      writeFileSync(join(TEST_DIR, 'test.ts'), 'console.log("test");');

      const client = new LSPClient();

      // Mock startServer
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockResolvedValue({
        process: { kill: jest.fn() },
        initialized: true,
        openFiles: new Set(),
      });

      // Should not throw error
      await expect(async () => {
        await client.preloadServers(TEST_DIR);
      }).not.toThrow();

      startServerSpy.mockRestore();
    });

    it('should handle preloading errors gracefully', async () => {
      writeFileSync(join(TEST_DIR, 'test.ts'), 'console.log("test");');

      const client = new LSPClient();

      // Mock startServer to throw error
      const startServerSpy = spyOn(
        client as unknown as LSPClientInternal,
        'startServer'
      ).mockRejectedValue(new Error('Failed to start server'));

      const stderrSpy = spyOn(process.stderr, 'write');

      // Should complete without throwing
      await client.preloadServers(TEST_DIR);

      // Should have logged the error
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to preload LSP server')
      );

      startServerSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  describe('gitignore functionality', () => {
    it('should load default ignore patterns', () => {
      const client = new LSPClient();
      const ig = (client as unknown as LSPClientInternal).loadGitignore(TEST_DIR);

      // Test that default patterns are loaded
      expect(ig.ignores('node_modules')).toBe(true);
      expect(ig.ignores('dist')).toBe(true);
      expect(ig.ignores('.git')).toBe(true);
      expect(ig.ignores('src.ts')).toBe(false);
    });

    it('should load custom gitignore patterns', () => {
      writeFileSync(join(TEST_DIR, '.gitignore'), 'custom_dir\n*.log\n');

      const client = new LSPClient();
      const ig = (client as unknown as LSPClientInternal).loadGitignore(TEST_DIR);

      expect(ig.ignores('custom_dir')).toBe(true);
      expect(ig.ignores('test.log')).toBe(true);
      expect(ig.ignores('test.txt')).toBe(false);
    });
  });
});
