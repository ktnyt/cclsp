import { logger } from '../logger.js';
import type { Diagnostic } from './types.js';

/**
 * Cache for LSP diagnostics received via publishDiagnostics notifications.
 * Tracks diagnostic state per URI with version and timestamp tracking
 * to support idle detection for pull-based fallback.
 */
export class DiagnosticsCache {
  private diagnostics = new Map<string, Diagnostic[]>();
  private lastUpdate = new Map<string, number>();
  private versions = new Map<string, number>();

  /**
   * Update cached diagnostics for a URI (called from publishDiagnostics handler).
   */
  update(uri: string, items: Diagnostic[], version?: number): void {
    this.diagnostics.set(uri, items);
    this.lastUpdate.set(uri, Date.now());
    if (version !== undefined) {
      this.versions.set(uri, version);
    }
  }

  /**
   * Get cached diagnostics for a URI, or undefined if none cached.
   */
  get(uri: string): Diagnostic[] | undefined {
    return this.diagnostics.get(uri);
  }

  /**
   * Wait for diagnostics to stabilize (no updates for `idleTime` ms).
   * Used as fallback when textDocument/diagnostic is not supported.
   */
  async waitForIdle(
    uri: string,
    options: {
      maxWaitTime?: number;
      idleTime?: number;
      checkInterval?: number;
    } = {}
  ): Promise<void> {
    const { maxWaitTime = 1000, idleTime = 100, checkInterval = 50 } = options;

    const startTime = Date.now();
    let lastVersion = this.versions.get(uri) ?? -1;
    let lastUpdateTime = this.lastUpdate.get(uri) ?? startTime;

    logger.debug(
      `[DEBUG waitForDiagnosticsIdle] Waiting for diagnostics to stabilize for ${uri}\n`
    );

    while (Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      const currentVersion = this.versions.get(uri) ?? -1;
      const currentUpdateTime = this.lastUpdate.get(uri) ?? lastUpdateTime;

      if (currentVersion !== lastVersion) {
        logger.debug(
          `[DEBUG waitForDiagnosticsIdle] Version changed from ${lastVersion} to ${currentVersion}\n`
        );
        lastVersion = currentVersion;
        lastUpdateTime = currentUpdateTime;
        continue;
      }

      const timeSinceLastUpdate = Date.now() - currentUpdateTime;
      if (timeSinceLastUpdate >= idleTime) {
        logger.debug(
          `[DEBUG waitForDiagnosticsIdle] Server appears idle after ${timeSinceLastUpdate}ms without updates\n`
        );
        return;
      }
    }

    logger.debug(`[DEBUG waitForDiagnosticsIdle] Max wait time reached (${maxWaitTime}ms)\n`);
  }
}
