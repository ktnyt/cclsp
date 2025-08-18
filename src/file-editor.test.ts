import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyWorkspaceEdit, cleanupBackups } from './file-editor.js';
import { pathToUri } from './utils.js';

const TEST_DIR = process.env.RUNNER_TEMP
  ? `${process.env.RUNNER_TEMP}/file-editor-test`
  : '/tmp/file-editor-test';

describe('file-editor', () => {
  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('applyWorkspaceEdit', () => {
    it('should apply a single edit to a file', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      const originalContent = 'const oldName = 42;\nconsole.log(oldName);';
      writeFileSync(filePath, originalContent);

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 13 },
              },
              newText: 'newName',
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.filesModified).toEqual([filePath]);

      const modifiedContent = readFileSync(filePath, 'utf-8');
      expect(modifiedContent).toBe('const newName = 42;\nconsole.log(oldName);');
    });

    it('should apply multiple edits to the same file', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      const originalContent = 'const foo = 1;\nconst bar = foo + foo;\nconsole.log(foo);';
      writeFileSync(filePath, originalContent);

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 9 },
              },
              newText: 'baz',
            },
            {
              range: {
                start: { line: 1, character: 12 },
                end: { line: 1, character: 15 },
              },
              newText: 'baz',
            },
            {
              range: {
                start: { line: 1, character: 18 },
                end: { line: 1, character: 21 },
              },
              newText: 'baz',
            },
            {
              range: {
                start: { line: 2, character: 12 },
                end: { line: 2, character: 15 },
              },
              newText: 'baz',
            },
          ],
        },
      });

      expect(result.success).toBe(true);

      const modifiedContent = readFileSync(filePath, 'utf-8');
      expect(modifiedContent).toBe('const baz = 1;\nconst bar = baz + baz;\nconsole.log(baz);');
    });

    it('should handle multi-line edits', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      const originalContent = 'function oldFunc() {\n  return 42;\n}\n\noldFunc();';
      writeFileSync(filePath, originalContent);

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 9 },
                end: { line: 0, character: 16 },
              },
              newText: 'newFunc',
            },
            {
              range: {
                start: { line: 4, character: 0 },
                end: { line: 4, character: 7 },
              },
              newText: 'newFunc',
            },
          ],
        },
      });

      expect(result.success).toBe(true);

      const modifiedContent = readFileSync(filePath, 'utf-8');
      expect(modifiedContent).toBe('function newFunc() {\n  return 42;\n}\n\nnewFunc();');
    });

    it('should handle edits across multiple files', async () => {
      const file1 = join(TEST_DIR, 'file1.ts');
      const file2 = join(TEST_DIR, 'file2.ts');

      writeFileSync(file1, 'export const oldName = 42;');
      writeFileSync(file2, 'import { oldName } from "./file1";\nconsole.log(oldName);');

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(file1)]: [
            {
              range: {
                start: { line: 0, character: 13 },
                end: { line: 0, character: 20 },
              },
              newText: 'newName',
            },
          ],
          [pathToUri(file2)]: [
            {
              range: {
                start: { line: 0, character: 9 },
                end: { line: 0, character: 16 },
              },
              newText: 'newName',
            },
            {
              range: {
                start: { line: 1, character: 12 },
                end: { line: 1, character: 19 },
              },
              newText: 'newName',
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.filesModified.length).toBe(2);

      const content1 = readFileSync(file1, 'utf-8');
      const content2 = readFileSync(file2, 'utf-8');
      expect(content1).toBe('export const newName = 42;');
      expect(content2).toBe('import { newName } from "./file1";\nconsole.log(newName);');
    });

    it('should create backup files when requested', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      const originalContent = 'const oldName = 42;';
      writeFileSync(filePath, originalContent);

      const result = await applyWorkspaceEdit(
        {
          changes: {
            [pathToUri(filePath)]: [
              {
                range: {
                  start: { line: 0, character: 6 },
                  end: { line: 0, character: 13 },
                },
                newText: 'newName',
              },
            ],
          },
        },
        { createBackups: true }
      );

      expect(result.success).toBe(true);
      expect(result.backupFiles.length).toBe(1);
      const backupFile = result.backupFiles[0];
      expect(backupFile).toBeDefined();
      if (backupFile) {
        expect(existsSync(backupFile)).toBe(true);
        const backupContent = readFileSync(backupFile, 'utf-8');
        expect(backupContent).toBe(originalContent);
      }
    });

    it('should skip backup creation when disabled', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      writeFileSync(filePath, 'const oldName = 42;');

      const result = await applyWorkspaceEdit(
        {
          changes: {
            [pathToUri(filePath)]: [
              {
                range: {
                  start: { line: 0, character: 6 },
                  end: { line: 0, character: 13 },
                },
                newText: 'newName',
              },
            ],
          },
        },
        { createBackups: false }
      );

      expect(result.success).toBe(true);
      expect(result.backupFiles.length).toBe(0);
      expect(existsSync(`${filePath}.bak`)).toBe(false);
    });

    it('should validate edit positions when requested', async () => {
      const filePath = join(TEST_DIR, 'test.ts');
      writeFileSync(filePath, 'const x = 1;');

      const result = await applyWorkspaceEdit(
        {
          changes: {
            [pathToUri(filePath)]: [
              {
                range: {
                  start: { line: 5, character: 0 }, // Invalid line
                  end: { line: 5, character: 5 },
                },
                newText: 'invalid',
              },
            ],
          },
        },
        { validateBeforeApply: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid start line');
    });

    it('should rollback changes on failure', async () => {
      const file1 = join(TEST_DIR, 'file1.ts');
      const file2 = join(TEST_DIR, 'file2.ts');

      const originalContent1 = 'const x = 1;';
      const originalContent2 = 'const y = 2;';

      writeFileSync(file1, originalContent1);
      writeFileSync(file2, originalContent2);

      // Make file2 invalid to cause failure
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
                  start: { line: 10, character: 0 }, // Invalid line
                  end: { line: 10, character: 5 },
                },
                newText: 'invalid',
              },
            ],
          },
        },
        { validateBeforeApply: true }
      );

      expect(result.success).toBe(false);

      // Check that file1 was rolled back to original content
      const content1 = readFileSync(file1, 'utf-8');
      expect(content1).toBe(originalContent1);
    });

    it('should handle empty files', async () => {
      const filePath = join(TEST_DIR, 'empty.ts');
      writeFileSync(filePath, '');

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              newText: 'const x = 1;',
            },
          ],
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('const x = 1;');
    });

    it('should handle files with different line endings', async () => {
      const filePath = join(TEST_DIR, 'crlf.ts');
      // File with CRLF line endings (without trailing newline)
      writeFileSync(filePath, 'const x = 1;\r\nconst y = 2;');

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 7 },
              },
              newText: 'a',
            },
          ],
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      // Our implementation now preserves line endings
      expect(content).toBe('const a = 1;\r\nconst y = 2;');
    });

    it('should handle unicode content', async () => {
      const filePath = join(TEST_DIR, 'unicode.ts');
      const originalContent = 'const 你好 = "世界";\nconsole.log(你好);';
      writeFileSync(filePath, originalContent);

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 6 },
                end: { line: 0, character: 8 },
              },
              newText: '世界',
            },
            {
              range: {
                start: { line: 1, character: 12 },
                end: { line: 1, character: 14 },
              },
              newText: '世界',
            },
          ],
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('const 世界 = "世界";\nconsole.log(世界);');
    });

    it('should fail gracefully for non-existent files', async () => {
      const filePath = join(TEST_DIR, 'non-existent.ts');

      const result = await applyWorkspaceEdit({
        changes: {
          [pathToUri(filePath)]: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
              newText: 'test',
            },
          ],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File does not exist');
    });

    it('should handle no changes gracefully', async () => {
      const result = await applyWorkspaceEdit({
        changes: {},
      });

      expect(result.success).toBe(true);
      expect(result.filesModified).toEqual([]);
      expect(result.backupFiles).toEqual([]);
    });
  });

  describe('cleanupBackups', () => {
    it('should remove backup files', () => {
      const backup1 = join(TEST_DIR, 'file1.ts.bak');
      const backup2 = join(TEST_DIR, 'file2.ts.bak');

      writeFileSync(backup1, 'backup content 1');
      writeFileSync(backup2, 'backup content 2');

      expect(existsSync(backup1)).toBe(true);
      expect(existsSync(backup2)).toBe(true);

      cleanupBackups([backup1, backup2]);

      expect(existsSync(backup1)).toBe(false);
      expect(existsSync(backup2)).toBe(false);
    });

    it('should handle non-existent backup files gracefully', () => {
      const nonExistent = join(TEST_DIR, 'non-existent.bak');

      // Should not throw
      cleanupBackups([nonExistent]);
    });
  });
});
