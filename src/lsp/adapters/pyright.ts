import type { LSPServerConfig } from '../../types.js';
import type { InitializeParams, ServerAdapter } from './types.js';

/**
 * Adapter for Pyright Language Server.
 *
 * Pyright and basedpyright can be slow on large Python projects.
 * This adapter extends timeouts for operations that may take longer.
 */
export class PyrightAdapter implements ServerAdapter {
  readonly name = 'pyright';

  matches(config: LSPServerConfig): boolean {
    return config.command.some((c: string) => c.includes('pyright') || c.includes('basedpyright'));
  }

  customizeInitializeParams(params: InitializeParams): InitializeParams {
    // Pyright works better with specific workspace configuration
    // Preserve any existing initializationOptions from config
    const existingOptions =
      typeof params.initializationOptions === 'object' && params.initializationOptions !== null
        ? params.initializationOptions
        : {};

    return {
      ...params,
      initializationOptions: {
        ...existingOptions,
        // Pyright-specific options can be added here if needed
      },
    };
  }

  getTimeout(method: string): number | undefined {
    // Pyright can be slow on large projects
    // Extend timeouts for operations that may analyze many files
    const timeouts: Record<string, number> = {
      'textDocument/definition': 45000, // 45 seconds
      'textDocument/references': 60000, // 60 seconds
      'textDocument/rename': 60000, // 60 seconds
      'textDocument/documentSymbol': 45000, // 45 seconds
    };
    return timeouts[method];
  }
}
