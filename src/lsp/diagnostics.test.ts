import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import { DiagnosticsCache } from './diagnostics.js';
import type { Diagnostic } from './types.js';

const makeDiagnostic = (message: string): Diagnostic => ({
  range: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  },
  message,
  severity: 1,
});

describe('DiagnosticsCache', () => {
  let cache: DiagnosticsCache;

  beforeEach(() => {
    cache = new DiagnosticsCache();
  });

  describe('update and get', () => {
    it('returns undefined for unknown URI', () => {
      expect(cache.get('file:///unknown.ts')).toBeUndefined();
    });

    it('stores and retrieves diagnostics by URI', () => {
      const diag = makeDiagnostic('error1');
      cache.update('file:///a.ts', [diag]);
      expect(cache.get('file:///a.ts')).toEqual([diag]);
    });

    it('overwrites previous diagnostics on update', () => {
      cache.update('file:///a.ts', [makeDiagnostic('old')]);
      cache.update('file:///a.ts', [makeDiagnostic('new')]);
      expect(cache.get('file:///a.ts')).toEqual([makeDiagnostic('new')]);
    });

    it('stores diagnostics per URI independently', () => {
      cache.update('file:///a.ts', [makeDiagnostic('a')]);
      cache.update('file:///b.ts', [makeDiagnostic('b')]);
      expect(cache.get('file:///a.ts')).toEqual([makeDiagnostic('a')]);
      expect(cache.get('file:///b.ts')).toEqual([makeDiagnostic('b')]);
    });

    it('stores empty diagnostics array', () => {
      cache.update('file:///a.ts', []);
      expect(cache.get('file:///a.ts')).toEqual([]);
    });
  });

  describe('waitForIdle', () => {
    it('resolves when no updates occur within idleTime', async () => {
      cache.update('file:///a.ts', [makeDiagnostic('initial')]);

      // Wait with short timings -- no new updates should resolve quickly
      await cache.waitForIdle('file:///a.ts', {
        maxWaitTime: 500,
        idleTime: 50,
        checkInterval: 20,
      });
      // If we get here without timeout, the test passes
    });

    it('resolves eventually when version changes then stabilizes', async () => {
      const uri = 'file:///a.ts';
      cache.update(uri, [makeDiagnostic('v1')], 1);

      // Schedule a version change after a short delay
      setTimeout(() => {
        cache.update(uri, [makeDiagnostic('v2')], 2);
      }, 30);

      await cache.waitForIdle(uri, {
        maxWaitTime: 500,
        idleTime: 80,
        checkInterval: 20,
      });
      // Should have waited for the version change then idled
      expect(cache.get(uri)).toEqual([makeDiagnostic('v2')]);
    });

    it('resolves at maxWaitTime if updates keep coming', async () => {
      const uri = 'file:///a.ts';
      cache.update(uri, [], 1);

      // Keep updating faster than idleTime
      const interval = setInterval(() => {
        const v = (cache.get(uri)?.length ?? 0) + 1;
        cache.update(uri, [makeDiagnostic(`v${v}`)], v);
      }, 20);

      const start = Date.now();
      await cache.waitForIdle(uri, {
        maxWaitTime: 200,
        idleTime: 100,
        checkInterval: 20,
      });
      const elapsed = Date.now() - start;
      clearInterval(interval);

      // Should have waited approximately maxWaitTime
      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(elapsed).toBeLessThan(400);
    });

    it('resolves for unknown URI (no updates to wait for)', async () => {
      await cache.waitForIdle('file:///unknown.ts', {
        maxWaitTime: 200,
        idleTime: 50,
        checkInterval: 20,
      });
      // Should resolve quickly since no updates are happening
    });
  });
});
