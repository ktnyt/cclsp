import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LSPClient } from './lsp-client.js';

const TEST_DIR = process.env.RUNNER_TEMP
  ? `${process.env.RUNNER_TEMP}/cclsp-server-selection-test`
  : '/tmp/cclsp-server-selection-test';

const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json');

describe('LSPClient server selection', () => {
  let savedConfigPath: string | undefined;

  beforeEach(() => {
    // Save and clear CCLSP_CONFIG_PATH so tests use their own config files
    savedConfigPath = process.env.CCLSP_CONFIG_PATH;
    process.env.CCLSP_CONFIG_PATH = '';

    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Restore CCLSP_CONFIG_PATH
    if (savedConfigPath !== undefined) {
      process.env.CCLSP_CONFIG_PATH = savedConfigPath;
    } else {
      process.env.CCLSP_CONFIG_PATH = '';
    }
  });

  it('should select single matching server', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['typescript-language-server', '--stdio'],
          rootDir: '.',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);

    // Access private method for testing
    const getServerForFile = (client as any).getServerForFile.bind(client);
    const server = getServerForFile('/some/path/test.ts');

    expect(server).toBeTruthy();
    expect(server.extensions).toContain('ts');
  });

  it('should select most specific rootDir when multiple servers match extension', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['server-root', '--stdio'],
          rootDir: '.',
        },
        {
          extensions: ['ts'],
          command: ['server-specific', '--stdio'],
          rootDir: 'repos/applicationserver',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    // File inside repos/applicationserver should use the more specific server
    const cwd = process.cwd();
    const server = getServerForFile(join(cwd, 'repos/applicationserver/src/test.ts'));

    expect(server).toBeTruthy();
    expect(server.command[0]).toBe('server-specific');
  });

  it('should fall back to less specific rootDir when file is outside specific rootDir', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['server-root', '--stdio'],
          rootDir: '.',
        },
        {
          extensions: ['ts'],
          command: ['server-specific', '--stdio'],
          rootDir: 'repos/applicationserver',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    // File outside repos/applicationserver should use root server
    const cwd = process.cwd();
    const server = getServerForFile(join(cwd, 'other-dir/test.ts'));

    expect(server).toBeTruthy();
    expect(server.command[0]).toBe('server-root');
  });

  it('should handle absolute paths in rootDir', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['server-absolute', '--stdio'],
          rootDir: '/absolute/path/to/project',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    const server = getServerForFile('/absolute/path/to/project/src/test.ts');

    expect(server).toBeTruthy();
    expect(server.command[0]).toBe('server-absolute');
  });

  it('should return first match when no rootDir contains the file', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['server-one', '--stdio'],
          rootDir: 'project-a',
        },
        {
          extensions: ['ts'],
          command: ['server-two', '--stdio'],
          rootDir: 'project-b',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    // File outside both rootDirs should fall back to first match
    const server = getServerForFile('/completely/different/path/test.ts');

    expect(server).toBeTruthy();
    expect(server.command[0]).toBe('server-one');
  });

  it('should return null when no server matches extension', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['typescript-language-server', '--stdio'],
          rootDir: '.',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    const server = getServerForFile('/some/path/test.py');

    expect(server).toBeNull();
  });

  it('should prefer longer matching rootDir over shorter one', () => {
    const testConfig = {
      servers: [
        {
          extensions: ['ts'],
          command: ['server-short', '--stdio'],
          rootDir: 'repos',
        },
        {
          extensions: ['ts'],
          command: ['server-long', '--stdio'],
          rootDir: 'repos/applicationserver',
        },
        {
          extensions: ['ts'],
          command: ['server-longest', '--stdio'],
          rootDir: 'repos/applicationserver/apps',
        },
      ],
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig));
    const client = new LSPClient(TEST_CONFIG_PATH);
    const getServerForFile = (client as any).getServerForFile.bind(client);

    const cwd = process.cwd();
    const server = getServerForFile(join(cwd, 'repos/applicationserver/apps/infinity/src/test.ts'));

    expect(server).toBeTruthy();
    expect(server.command[0]).toBe('server-longest');
  });
});
