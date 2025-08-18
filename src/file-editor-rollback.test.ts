import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyWorkspaceEdit } from './file-editor.js';
import { pathToUri } from './utils.js';

describe('file-editor rollback without backups', () => {
  let TEST_DIR: string;

  beforeEach(() => {
    // Generate unique directory for each test run
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}-${process.pid}`;
    TEST_DIR = process.env.RUNNER_TEMP
      ? `${process.env.RUNNER_TEMP}/file-editor-rollback-test-${uniqueId}`
      : `/tmp/file-editor-rollback-test-${uniqueId}`;

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should rollback changes when createBackups=false and an error occurs', async () => {
    const file1 = join(TEST_DIR, 'file1.ts');
    const file2 = join(TEST_DIR, 'file2.ts');

    const originalContent1 = 'const x = 1;';
    const originalContent2 = 'const y = 2;';

    writeFileSync(file1, originalContent1);
    writeFileSync(file2, originalContent2);

    // Create an edit that will succeed on file1 but fail on file2
    const result = await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(file1)]: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 7 },
              },
              newText: 'a',
            },
          ],
          [pathToUri(file2)]: [
            {
              range: {
                start: { line: 10, character: 0 }, // Invalid line - will cause failure
                end: { line: 10, character: 5 },
              },
              newText: 'invalid',
            },
          ],
        },
      },
      {
        createBackups: false, // Critical: no backup files created
        validateBeforeApply: true,
      }
    );

    // Should have failed
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid start line');

    // Check that file1 was rolled back to original content even without backup file
    const content1 = readFileSync(file1, 'utf-8');
    expect(content1).toBe(originalContent1);

    // Verify no backup files were created
    expect(existsSync(`${file1}.bak`)).toBe(false);
    expect(existsSync(`${file2}.bak`)).toBe(false);
  });

  it('should handle multi-line edit with invalid character positions', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    const content = 'line1\nline2\nline3';
    writeFileSync(filePath, content);

    // Multi-line edit where end character exceeds line length
    const result = await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 3 },
                end: { line: 2, character: 100 }, // line3 only has 5 characters
              },
              newText: 'replaced',
            },
          ],
        },
      },
      { validateBeforeApply: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid end character');
    expect(result.error).toContain('line has 5 characters');

    // File should be unchanged
    const unchangedContent = readFileSync(filePath, 'utf-8');
    expect(unchangedContent).toBe(content);
  });

  it('should detect inverted ranges (start > end)', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    writeFileSync(filePath, 'const x = 1;\nconst y = 2;');

    const result = await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 1, character: 5 },
                end: { line: 0, character: 2 }, // End before start
              },
              newText: 'invalid',
            },
          ],
        },
      },
      { validateBeforeApply: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid range');
    expect(result.error).toContain('start (1:5) is after end (0:2)');
  });

  it('should detect same-line inverted character positions', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    writeFileSync(filePath, 'const x = 1;');

    const result = await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 5 }, // End character before start
              },
              newText: 'invalid',
            },
          ],
        },
      },
      { validateBeforeApply: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid range');
    expect(result.error).toContain('start (0:10) is after end (0:5)');
  });
});
