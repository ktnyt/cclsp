import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentManager, getLanguageId } from './document-manager.js';
import type { JsonRpcTransport } from './json-rpc.js';

/** Write a file using Bun.write to avoid node:fs mock interference from other test files. */
async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

let TEST_DIR: string;

function createMockTransport(): JsonRpcTransport & {
  sendNotification: ReturnType<typeof jest.fn>;
} {
  return {
    sendRequest: jest.fn(),
    sendMessage: jest.fn(),
    sendNotification: jest.fn(),
    rejectAllPending: jest.fn(),
  } as unknown as JsonRpcTransport & {
    sendNotification: ReturnType<typeof jest.fn>;
  };
}

describe('DocumentManager', () => {
  let transport: ReturnType<typeof createMockTransport>;
  let manager: DocumentManager;

  beforeEach(() => {
    TEST_DIR = mkdtempSync(join(tmpdir(), 'cclsp-docmgr-test-'));
    transport = createMockTransport();
    manager = new DocumentManager(transport);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('ensureOpen', () => {
    it('opens a file and sends didOpen notification', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'const x = 1;');

      const result = await manager.ensureOpen(filePath);

      expect(result).toBe(true);
      expect(transport.sendNotification).toHaveBeenCalledTimes(1);
      expect(transport.sendNotification).toHaveBeenCalledWith('textDocument/didOpen', {
        textDocument: expect.objectContaining({
          languageId: 'typescript',
          version: 1,
          text: 'const x = 1;',
        }),
      });
    });

    it('returns false and does not re-send for already open file', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'const x = 1;');

      await manager.ensureOpen(filePath);
      const result = await manager.ensureOpen(filePath);

      expect(result).toBe(false);
      expect(transport.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('throws when file does not exist', async () => {
      const filePath = join(TEST_DIR, 'nonexistent.ts');

      expect(manager.ensureOpen(filePath)).rejects.toThrow();
    });
  });

  describe('sendChange', () => {
    it('sends didChange with incremented version', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'const x = 1;');

      await manager.ensureOpen(filePath);
      manager.sendChange(filePath, 'const x = 2;');

      expect(transport.sendNotification).toHaveBeenCalledWith('textDocument/didChange', {
        textDocument: expect.objectContaining({
          version: 2,
        }),
        contentChanges: [{ text: 'const x = 2;' }],
      });
    });

    it('increments version on each change', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'v1');

      await manager.ensureOpen(filePath);
      manager.sendChange(filePath, 'v2');
      manager.sendChange(filePath, 'v3');

      expect(manager.getVersion(filePath)).toBe(3);
    });
  });

  describe('isOpen', () => {
    it('returns false for unopened file', () => {
      expect(manager.isOpen('/some/file.ts')).toBe(false);
    });

    it('returns true after ensureOpen', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'content');

      await manager.ensureOpen(filePath);
      expect(manager.isOpen(filePath)).toBe(true);
    });
  });

  describe('getVersion', () => {
    it('returns 0 for unopened file', () => {
      expect(manager.getVersion('/some/file.ts')).toBe(0);
    });

    it('returns 1 after opening', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      await writeFile(filePath, 'content');

      await manager.ensureOpen(filePath);
      expect(manager.getVersion(filePath)).toBe(1);
    });
  });
});

describe('getLanguageId', () => {
  it('maps TypeScript extensions', () => {
    expect(getLanguageId('file.ts')).toBe('typescript');
    expect(getLanguageId('file.tsx')).toBe('typescriptreact');
  });

  it('maps JavaScript extensions', () => {
    expect(getLanguageId('file.js')).toBe('javascript');
    expect(getLanguageId('file.jsx')).toBe('javascriptreact');
  });

  it('maps Python', () => {
    expect(getLanguageId('file.py')).toBe('python');
  });

  it('maps Go', () => {
    expect(getLanguageId('file.go')).toBe('go');
  });

  it('maps Vue and Svelte', () => {
    expect(getLanguageId('file.vue')).toBe('vue');
    expect(getLanguageId('file.svelte')).toBe('svelte');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguageId('file.xyz')).toBe('plaintext');
    expect(getLanguageId('noextension')).toBe('plaintext');
  });

  it('handles paths with directories', () => {
    expect(getLanguageId('/src/components/App.tsx')).toBe('typescriptreact');
  });
});
