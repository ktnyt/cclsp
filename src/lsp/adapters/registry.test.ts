import { describe, expect, it } from 'bun:test';
import { adapterRegistry } from './registry.js';

describe('AdapterRegistry', () => {
  describe('getAdapter', () => {
    it('should return VueLanguageServerAdapter for vue-language-server', () => {
      const adapter = adapterRegistry.getAdapter({
        extensions: ['vue'],
        command: ['vue-language-server', '--stdio'],
      });

      expect(adapter).toBeDefined();
      expect(adapter?.name).toBe('vue-language-server');
    });

    it('should return PyrightAdapter for pyright', () => {
      const adapter = adapterRegistry.getAdapter({
        extensions: ['py'],
        command: ['pyright-langserver', '--stdio'],
      });

      expect(adapter).toBeDefined();
      expect(adapter?.name).toBe('pyright');
    });

    it('should return undefined for unknown server', () => {
      const adapter = adapterRegistry.getAdapter({
        extensions: ['ts'],
        command: ['typescript-language-server', '--stdio'],
      });

      expect(adapter).toBeUndefined();
    });

    it('should return undefined for pylsp', () => {
      const adapter = adapterRegistry.getAdapter({
        extensions: ['py'],
        command: ['pylsp'],
      });

      expect(adapter).toBeUndefined();
    });

    it('should match first adapter when multiple adapters could match', () => {
      // If we had two adapters that could match the same server,
      // the first one registered should win
      const adapter = adapterRegistry.getAdapter({
        extensions: ['vue'],
        command: ['vue-language-server', '--stdio'],
      });

      expect(adapter?.name).toBe('vue-language-server');
    });
  });

  describe('getAdapterNames', () => {
    it('should return list of all registered adapter names', () => {
      const names = adapterRegistry.getAdapterNames();

      expect(names).toContain('vue-language-server');
      expect(names).toContain('pyright');
      expect(names.length).toBeGreaterThanOrEqual(2);
    });
  });
});
