import { describe, expect, it } from 'bun:test';
import { PyrightAdapter } from './pyright.js';

describe('PyrightAdapter', () => {
  const adapter = new PyrightAdapter();

  describe('matches', () => {
    it('should match pyright command', () => {
      expect(
        adapter.matches({
          extensions: ['py'],
          command: ['pyright-langserver', '--stdio'],
        })
      ).toBe(true);
    });

    it('should match basedpyright command', () => {
      expect(
        adapter.matches({
          extensions: ['py'],
          command: ['basedpyright-langserver', '--stdio'],
        })
      ).toBe(true);
    });

    it('should match command with pyright in path', () => {
      expect(
        adapter.matches({
          extensions: ['py'],
          command: ['/usr/local/bin/pyright-langserver', '--stdio'],
        })
      ).toBe(true);
    });

    it('should not match pylsp', () => {
      expect(
        adapter.matches({
          extensions: ['py'],
          command: ['pylsp'],
        })
      ).toBe(false);
    });

    it('should not match other servers', () => {
      expect(
        adapter.matches({
          extensions: ['ts'],
          command: ['typescript-language-server', '--stdio'],
        })
      ).toBe(false);
    });
  });

  describe('customizeInitializeParams', () => {
    it('should preserve existing initializationOptions', () => {
      const params = {
        processId: 123,
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
        rootUri: 'file:///test',
        workspaceFolders: [],
        initializationOptions: {
          existingOption: 'value',
        },
      };

      const result = adapter.customizeInitializeParams(params);

      expect(result.initializationOptions).toEqual({
        existingOption: 'value',
      });
    });

    it('should handle undefined initializationOptions', () => {
      const params = {
        processId: 123,
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
        rootUri: 'file:///test',
        workspaceFolders: [],
      };

      const result = adapter.customizeInitializeParams(params);

      expect(result.initializationOptions).toEqual({});
    });

    it('should handle null initializationOptions', () => {
      const params = {
        processId: 123,
        clientInfo: { name: 'test', version: '1.0' },
        capabilities: {},
        rootUri: 'file:///test',
        workspaceFolders: [],
        initializationOptions: null,
      };

      const result = adapter.customizeInitializeParams(params);

      expect(result.initializationOptions).toEqual({});
    });
  });

  describe('getTimeout', () => {
    it('should provide extended timeout for definition', () => {
      expect(adapter.getTimeout('textDocument/definition')).toBe(45000);
    });

    it('should provide extended timeout for references', () => {
      expect(adapter.getTimeout('textDocument/references')).toBe(60000);
    });

    it('should provide extended timeout for rename', () => {
      expect(adapter.getTimeout('textDocument/rename')).toBe(60000);
    });

    it('should provide extended timeout for documentSymbol', () => {
      expect(adapter.getTimeout('textDocument/documentSymbol')).toBe(45000);
    });

    it('should return undefined for hover', () => {
      expect(adapter.getTimeout('textDocument/hover')).toBeUndefined();
    });

    it('should return undefined for completion', () => {
      expect(adapter.getTimeout('textDocument/completion')).toBeUndefined();
    });
  });
});
