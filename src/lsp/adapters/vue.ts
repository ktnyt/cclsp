import { logger } from '../../logger.js';
import type { LSPServerConfig } from '../../types.js';
import type { ServerAdapter, ServerState } from './types.js';

/**
 * Adapter for Vue Language Server (@vue/language-server).
 *
 * Vue Language Server uses a non-standard tsserver/request protocol
 * for TypeScript integration. This adapter handles these custom requests
 * to prevent timeouts and errors.
 *
 * Issues addressed:
 * - Responds to tsserver/request notifications
 * - Extended timeouts for operations that require TypeScript analysis
 */
export class VueLanguageServerAdapter implements ServerAdapter {
  readonly name = 'vue-language-server';

  matches(config: LSPServerConfig): boolean {
    return config.command.some(
      (c: string) => c.includes('vue-language-server') || c.includes('@vue/language-server')
    );
  }

  handleRequest(method: string, params: unknown, state: ServerState): Promise<unknown> {
    // Handle vue-language-server's custom tsserver/request protocol
    if (method === 'tsserver/request') {
      const requestParams = params as [number, string, unknown];
      const [id, requestType] = requestParams;

      logger.debug(`[DEBUG VueAdapter] Handling tsserver/request: ${requestType} (id: ${id})\n`);

      // Respond to project info requests
      if (requestType === '_vue:projectInfo') {
        // Return minimal response to unblock the server
        // The server can work without full TypeScript project info
        return Promise.resolve([
          id,
          {
            configFiles: [],
            sourceFiles: [],
          },
        ]);
      }

      // Default empty response for other tsserver requests
      // This prevents the server from hanging waiting for responses
      return Promise.resolve([id, {}]);
    }

    return Promise.reject(new Error(`Unhandled request: ${method}`));
  }

  getTimeout(method: string): number | undefined {
    // Vue language server can be slow on certain operations
    // that require TypeScript analysis
    const timeouts: Record<string, number> = {
      'textDocument/documentSymbol': 60000, // 60 seconds
      'textDocument/definition': 45000, // 45 seconds
      'textDocument/references': 45000, // 45 seconds
      'textDocument/rename': 45000, // 45 seconds
    };
    return timeouts[method];
  }
}
