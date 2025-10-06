import type { LSPServerConfig } from '../../types.js';
import { PyrightAdapter } from './pyright.js';
import type { ServerAdapter } from './types.js';
import { VueLanguageServerAdapter } from './vue.js';

/**
 * Registry of built-in server adapters.
 * This is NOT extensible by users - internal use only.
 *
 * The registry automatically detects which adapter to use based on
 * the server command in the configuration.
 */
class AdapterRegistry {
  private readonly adapters: ServerAdapter[];

  constructor() {
    // Register all built-in adapters
    // Order matters - first match wins
    this.adapters = [
      new VueLanguageServerAdapter(),
      new PyrightAdapter(),
      // Add more built-in adapters here as needed
    ];
  }

  /**
   * Find adapter for given server config.
   * Returns undefined if no adapter matches (standard LSP behavior).
   */
  getAdapter(config: LSPServerConfig): ServerAdapter | undefined {
    return this.adapters.find((adapter) => adapter.matches(config));
  }

  /**
   * Get list of all registered adapter names.
   * Useful for logging and debugging.
   */
  getAdapterNames(): string[] {
    return this.adapters.map((adapter) => adapter.name);
  }
}

// Singleton instance - internal use only
export const adapterRegistry = new AdapterRegistry();
