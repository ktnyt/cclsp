import { describe, expect, it } from 'bun:test';
import { LSPClient } from './lsp-client.js';

describe('LSPClient', () => {
  it('should create LSPClient with default config when no config file exists', () => {
    const client = new LSPClient('/nonexistent/config.json');
    expect(client).toBeDefined();
  });

  it('should handle file extension matching', () => {
    const client = new LSPClient();
    // This is a basic smoke test - the actual getServerForFile is private
    // In a real test, we'd expose a public method or test through integration
    expect(client).toBeDefined();
  });
});
