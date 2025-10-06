import { describe, expect, it } from 'bun:test';
import { VueLanguageServerAdapter } from './vue.js';

describe('VueLanguageServerAdapter', () => {
  const adapter = new VueLanguageServerAdapter();

  describe('matches', () => {
    it('should match vue-language-server command', () => {
      expect(
        adapter.matches({
          extensions: ['vue'],
          command: ['vue-language-server', '--stdio'],
        })
      ).toBe(true);
    });

    it('should match @vue/language-server command', () => {
      expect(
        adapter.matches({
          extensions: ['vue'],
          command: ['@vue/language-server', '--stdio'],
        })
      ).toBe(true);
    });

    it('should match command with vue-language-server in path', () => {
      expect(
        adapter.matches({
          extensions: ['vue'],
          command: ['/usr/local/bin/vue-language-server', '--stdio'],
        })
      ).toBe(true);
    });

    it('should not match other servers', () => {
      expect(
        adapter.matches({
          extensions: ['ts'],
          command: ['typescript-language-server', '--stdio'],
        })
      ).toBe(false);
    });

    it('should not match volar', () => {
      expect(
        adapter.matches({
          extensions: ['vue'],
          command: ['volar', '--stdio'],
        })
      ).toBe(false);
    });
  });

  describe('handleRequest', () => {
    it('should handle tsserver/request for projectInfo', async () => {
      const mockState = {
        config: { extensions: ['vue'], command: ['vue-language-server'] },
      } as any;

      const result = await adapter.handleRequest(
        'tsserver/request',
        [1, '_vue:projectInfo', { file: '/test.vue' }],
        mockState
      );

      expect(result).toEqual([
        1,
        {
          configFiles: [],
          sourceFiles: [],
        },
      ]);
    });

    it('should handle tsserver/request with default response', async () => {
      const mockState = {
        config: { extensions: ['vue'], command: ['vue-language-server'] },
      } as any;

      const result = await adapter.handleRequest(
        'tsserver/request',
        [2, 'someOtherRequest', {}],
        mockState
      );

      expect(result).toEqual([2, {}]);
    });

    it('should reject unhandled methods', async () => {
      const mockState = {} as any;

      await expect(adapter.handleRequest('textDocument/definition', {}, mockState)).rejects.toThrow(
        'Unhandled request: textDocument/definition'
      );
    });
  });

  describe('getTimeout', () => {
    it('should provide extended timeout for documentSymbol', () => {
      expect(adapter.getTimeout('textDocument/documentSymbol')).toBe(60000);
    });

    it('should provide extended timeout for definition', () => {
      expect(adapter.getTimeout('textDocument/definition')).toBe(45000);
    });

    it('should provide extended timeout for references', () => {
      expect(adapter.getTimeout('textDocument/references')).toBe(45000);
    });

    it('should provide extended timeout for rename', () => {
      expect(adapter.getTimeout('textDocument/rename')).toBe(45000);
    });

    it('should return undefined for hover', () => {
      expect(adapter.getTimeout('textDocument/hover')).toBeUndefined();
    });

    it('should return undefined for completion', () => {
      expect(adapter.getTimeout('textDocument/completion')).toBeUndefined();
    });
  });
});
