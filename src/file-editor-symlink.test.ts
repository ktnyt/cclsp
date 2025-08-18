import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyWorkspaceEdit } from './file-editor.js';
import { pathToUri } from './utils.js';

// Check if symlinks are supported in this environment
function canCreateSymlinks(): boolean {
  try {
    const tmpdir = require('node:os').tmpdir();
    const testFile = join(tmpdir, `cclsp-test-target-${Date.now()}.txt`);
    const testLink = join(tmpdir, `cclsp-test-link-${Date.now()}.txt`);

    writeFileSync(testFile, 'test');
    symlinkSync(testFile, testLink);
    const isLink = lstatSync(testLink).isSymbolicLink();

    rmSync(testFile, { force: true });
    rmSync(testLink, { force: true });
    return isLink;
  } catch (error) {
    return false;
  }
}

describe.skipIf(!canCreateSymlinks())('file-editor symlink handling', () => {
  let TEST_DIR: string;

  // Helper function to create test directory with robust error handling
  async function createTestDir(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const uniqueId = [
          Date.now(),
          Math.random().toString(36).substring(2, 15),
          Math.random().toString(36).substring(2, 15),
          process.pid,
          process.hrtime.bigint().toString(36),
          attempts,
        ].join('-');

        // Use workspace temp directory to avoid cross-device issues
        const tmpRoot = `${process.cwd()}/tmp`;
        const testDir = `${tmpRoot}/file-editor-symlink-test-${uniqueId}`;

        // Ensure parent directory exists
        mkdirSync(tmpRoot, { recursive: true });

        // Clean up if directory exists
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
          // Force filesystem sync
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        mkdirSync(testDir, { recursive: true });

        // Verify directory was created and is accessible
        if (!existsSync(testDir)) {
          throw new Error('Directory creation failed - does not exist');
        }

        // Test directory writability
        const testFile = `${testDir}/.test-write`;
        writeFileSync(testFile, 'test');
        if (!existsSync(testFile)) {
          throw new Error('Directory creation failed - not writable');
        }
        rmSync(testFile);

        return testDir;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(
            `Failed to create test directory after ${maxAttempts} attempts: ${error}`
          );
        }
        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
      }
    }
    throw new Error('Unreachable');
  }

  beforeEach(async () => {
    // Create directory in beforeEach but verify in each test
    TEST_DIR = await createTestDir();
  });

  afterEach(async () => {
    if (TEST_DIR && existsSync(TEST_DIR)) {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          rmSync(TEST_DIR, { recursive: true, force: true });

          // Verify cleanup was successful
          if (!existsSync(TEST_DIR)) {
            break; // Success
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 20));
          attempts++;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            console.warn(`Failed to cleanup test directory ${TEST_DIR}: ${error}`);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }
    }
  });

  it('should edit the target file without replacing the symlink', async () => {
    // Ensure test directory exists (guard against race conditions)
    if (!existsSync(TEST_DIR)) {
      TEST_DIR = await createTestDir();
    }

    // Create a target file
    const targetPath = join(TEST_DIR, 'target.ts');
    const originalContent = 'const oldName = 42;';
    writeFileSync(targetPath, originalContent);

    // Create a symlink pointing to the target
    const symlinkPath = join(TEST_DIR, 'link.ts');
    symlinkSync(targetPath, symlinkPath);

    // Verify symlink was created correctly
    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(symlinkPath)).toBe(targetPath);
    expect(readFileSync(symlinkPath, 'utf-8')).toBe(originalContent);

    // Apply an edit to the symlink path
    const result = await applyWorkspaceEdit({
      changes: {
        [pathToUri(symlinkPath)]: [
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

    // CRITICAL: The symlink should STILL be a symlink, not replaced with a regular file
    const symlinkStatsAfter = lstatSync(symlinkPath);
    expect(symlinkStatsAfter.isSymbolicLink()).toBe(true);
    expect(symlinkStatsAfter.isFile()).toBe(false);

    // The symlink should still point to the same target
    expect(readlinkSync(symlinkPath)).toBe(targetPath);

    // The content should be updated when read through either path
    const expectedContent = 'const newName = 42;';
    expect(readFileSync(symlinkPath, 'utf-8')).toBe(expectedContent);
    expect(readFileSync(targetPath, 'utf-8')).toBe(expectedContent);
  });

  it('should handle edits to multiple symlinks and regular files', async () => {
    // Ensure test directory exists (guard against race conditions)
    if (!existsSync(TEST_DIR)) {
      TEST_DIR = await createTestDir();
    }

    // Create target files
    const target1 = join(TEST_DIR, 'target1.ts');
    const target2 = join(TEST_DIR, 'target2.ts');
    const regularFile = join(TEST_DIR, 'regular.ts');

    writeFileSync(target1, 'class OldClass1 {}');
    writeFileSync(target2, 'class OldClass2 {}');
    writeFileSync(regularFile, 'class OldClass3 {}');

    // Create symlinks
    const link1 = join(TEST_DIR, 'link1.ts');
    const link2 = join(TEST_DIR, 'link2.ts');
    symlinkSync(target1, link1);
    symlinkSync(target2, link2);

    // Apply edits to all files (mix of symlinks and regular)
    const result = await applyWorkspaceEdit({
      changes: {
        [pathToUri(link1)]: [
          {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 15 },
            },
            newText: 'NewClass1',
          },
        ],
        [pathToUri(link2)]: [
          {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 15 },
            },
            newText: 'NewClass2',
          },
        ],
        [pathToUri(regularFile)]: [
          {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 15 },
            },
            newText: 'NewClass3',
          },
        ],
      },
    });

    expect(result.success).toBe(true);

    // Verify symlinks are still symlinks
    expect(lstatSync(link1).isSymbolicLink()).toBe(true);
    expect(lstatSync(link2).isSymbolicLink()).toBe(true);
    expect(lstatSync(regularFile).isFile()).toBe(true);
    expect(lstatSync(regularFile).isSymbolicLink()).toBe(false);

    // Verify content updates
    expect(readFileSync(target1, 'utf-8')).toBe('class NewClass1 {}');
    expect(readFileSync(target2, 'utf-8')).toBe('class NewClass2 {}');
    expect(readFileSync(regularFile, 'utf-8')).toBe('class NewClass3 {}');
  });

  it('should create backups of the target file, not the symlink', async () => {
    // Ensure test directory exists (guard against race conditions)
    if (!existsSync(TEST_DIR)) {
      TEST_DIR = await createTestDir();
    }

    const targetPath = join(TEST_DIR, 'target.ts');
    const symlinkPath = join(TEST_DIR, 'link.ts');

    writeFileSync(targetPath, 'const x = 1;');
    symlinkSync(targetPath, symlinkPath);

    const result = await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(symlinkPath)]: [
            {
              range: {
                start: { line: 0, character: 10 },
                end: { line: 0, character: 11 },
              },
              newText: '2',
            },
          ],
        },
      },
      { createBackups: true }
    );

    expect(result.success).toBe(true);

    // The backup should be of the target file (which may be the resolved path)
    expect(result.backupFiles.length).toBe(1);
    const backupPath = result.backupFiles[0];
    expect(backupPath).toBeDefined();
    expect(backupPath?.endsWith('.bak')).toBe(true);

    if (backupPath) {
      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, 'utf-8')).toBe('const x = 1;');

      // Clean up backup
      rmSync(backupPath);
    }
  });

  it('should handle rollback correctly when editing through symlink fails', async () => {
    // Ensure test directory exists (guard against race conditions)
    if (!existsSync(TEST_DIR)) {
      TEST_DIR = await createTestDir();
    }

    const targetPath = join(TEST_DIR, 'target.ts');
    const symlinkPath = join(TEST_DIR, 'link.ts');

    const originalContent = 'const x = 1;\nconst y = 2;';
    writeFileSync(targetPath, originalContent);
    symlinkSync(targetPath, symlinkPath);

    // Apply an edit that will fail validation
    const result = await applyWorkspaceEdit({
      changes: {
        [pathToUri(symlinkPath)]: [
          {
            range: {
              start: { line: 10, character: 0 }, // Invalid line
              end: { line: 10, character: 5 },
            },
            newText: 'invalid',
          },
        ],
      },
    });

    expect(result.success).toBe(false);

    // Symlink should still be a symlink
    expect(lstatSync(symlinkPath).isSymbolicLink()).toBe(true);

    // Target content should be unchanged
    expect(readFileSync(targetPath, 'utf-8')).toBe(originalContent);
    expect(readFileSync(symlinkPath, 'utf-8')).toBe(originalContent);
  });
});
