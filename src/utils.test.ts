import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCodeContext,
  formatLocationWithContext,
  pathToUri,
  uriToPath,
} from './utils.js';

describe('utils', () => {
  describe('pathToUri and uriToPath', () => {
    it('should convert path to URI and back', () => {
      const testPath = '/Users/test/file.ts';
      const uri = pathToUri(testPath);
      expect(uri).toBe('file:///Users/test/file.ts');
      expect(uriToPath(uri)).toBe(testPath);
    });
  });

  describe('getCodeContext', () => {
    let testDir: string;
    let testFile: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `cclsp-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      testFile = join(testDir, 'test.ts');
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return context around a target line', () => {
      const content = `line 0
line 1
line 2
line 3
line 4
line 5`;
      writeFileSync(testFile, content);

      const result = getCodeContext(testFile, 2, { linesBefore: 1, linesAfter: 1 });

      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(3);
      expect(result!.lines[0]!.lineNumber).toBe(2);
      expect(result!.lines[0]!.content).toBe('line 1');
      expect(result!.lines[0]!.isTargetLine).toBe(false);
      expect(result!.lines[1]!.lineNumber).toBe(3);
      expect(result!.lines[1]!.content).toBe('line 2');
      expect(result!.lines[1]!.isTargetLine).toBe(true);
      expect(result!.lines[2]!.lineNumber).toBe(4);
      expect(result!.lines[2]!.content).toBe('line 3');
      expect(result!.lines[2]!.isTargetLine).toBe(false);
    });

    it('should handle first line with context', () => {
      const content = `first line
second line
third line`;
      writeFileSync(testFile, content);

      const result = getCodeContext(testFile, 0, { linesBefore: 2, linesAfter: 1 });

      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(2);
      expect(result!.lines[0]!.lineNumber).toBe(1);
      expect(result!.lines[0]!.isTargetLine).toBe(true);
      expect(result!.lines[1]!.lineNumber).toBe(2);
    });

    it('should handle last line with context', () => {
      const content = `first line
second line
third line`;
      writeFileSync(testFile, content);

      const result = getCodeContext(testFile, 2, { linesBefore: 1, linesAfter: 2 });

      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(2);
      expect(result!.lines[0]!.lineNumber).toBe(2);
      expect(result!.lines[1]!.lineNumber).toBe(3);
      expect(result!.lines[1]!.isTargetLine).toBe(true);
    });

    it('should use default context lines', () => {
      const content = `0
1
2
3
4
5
6`;
      writeFileSync(testFile, content);

      const result = getCodeContext(testFile, 3);

      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(5); // 2 before + target + 2 after
      expect(result!.lines[2]!.isTargetLine).toBe(true);
    });

    it('should return null for non-existent file', () => {
      const result = getCodeContext('/non/existent/file.ts', 0);
      expect(result).toBeNull();
    });

    it('should format output with line numbers and marker', () => {
      const content = `function foo() {
  const x = 1;
  return x;
}`;
      writeFileSync(testFile, content);

      const result = getCodeContext(testFile, 1, { linesBefore: 1, linesAfter: 1 });

      expect(result).not.toBeNull();
      expect(result!.formatted).toContain('> 2 |   const x = 1;');
      expect(result!.formatted).toContain('  1 | function foo()');
      expect(result!.formatted).toContain('  3 |   return x;');
    });
  });

  describe('formatLocationWithContext', () => {
    let testDir: string;
    let testFile: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `cclsp-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      testFile = join(testDir, 'test.ts');
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return just location when include_context is false', () => {
      const result = formatLocationWithContext(testFile, 10, 5, false);
      expect(result).toBe(`${testFile}:10:5`);
    });

    it('should include context when include_context is true', () => {
      const content = `line 1
line 2
line 3
line 4
line 5`;
      writeFileSync(testFile, content);

      const result = formatLocationWithContext(testFile, 3, 1, true, {
        linesBefore: 1,
        linesAfter: 1,
      });

      expect(result).toContain(`${testFile}:3:1`);
      expect(result).toContain('line 2');
      expect(result).toContain('> 3 | line 3');
      expect(result).toContain('line 4');
    });

    it('should handle non-existent file gracefully', () => {
      const result = formatLocationWithContext('/non/existent/file.ts', 10, 5, true);
      expect(result).toBe('/non/existent/file.ts:10:5');
    });
  });
});
