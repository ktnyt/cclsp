import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { LSPClient } from './lsp-client.js';
import { uriToPath } from './utils.js';

// Diagnostic helper for cross-device debugging
function logRenameOperation(tempPath: string, targetPath: string) {
  if (process.env.CI) {
    try {
      const tempMount = execSync(`stat -c '%m (%d)' "${tempPath}"`, { encoding: 'utf8' }).trim();
      const targetMount = execSync(`stat -c '%m (%d)' "${dirname(targetPath)}"`, {
        encoding: 'utf8',
      }).trim();
      console.log(`[RENAME DEBUG] temp: ${tempPath} → ${tempMount}`);
      console.log(`[RENAME DEBUG] target: ${targetPath} → ${targetMount}`);
      if (tempMount !== targetMount) {
        console.warn('[RENAME DEBUG] ⚠️  Cross-device rename detected!');
      }
    } catch (error) {
      console.log(`[RENAME DEBUG] Failed to check mounts: ${error}`);
    }
  }
}

export interface TextEdit {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newText: string;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}

export interface ApplyEditResult {
  success: boolean;
  filesModified: string[];
  backupFiles: string[];
  error?: string;
}

interface FileBackup {
  originalPath: string; // The path that was requested (could be symlink)
  targetPath: string; // The actual file path (resolved symlink target or same as originalPath)
  backupPath?: string;
  originalContent: string;
}

/**
 * Apply a workspace edit to files on disk
 * @param workspaceEdit The edit to apply (from LSP rename operation)
 * @param options Configuration options
 * @returns Result indicating success and modified files
 */
export async function applyWorkspaceEdit(
  workspaceEdit: WorkspaceEdit,
  options: {
    createBackups?: boolean;
    validateBeforeApply?: boolean;
    backupSuffix?: string;
    lspClient?: LSPClient;
  } = {}
): Promise<ApplyEditResult> {
  const {
    createBackups = true,
    validateBeforeApply = true,
    backupSuffix = '.bak',
    lspClient,
  } = options;

  const backups: FileBackup[] = [];
  const filesModified: string[] = [];

  if (!workspaceEdit.changes || Object.keys(workspaceEdit.changes).length === 0) {
    return {
      success: true,
      filesModified: [],
      backupFiles: [],
    };
  }

  try {
    // Pre-flight checks
    for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
      const filePath = uriToPath(uri);

      // Check file exists
      if (!existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Check if it's a symlink and validate the target
      const stats = lstatSync(filePath);
      if (stats.isSymbolicLink()) {
        // For symlinks, validate that the target exists and is a file
        try {
          const realPath = realpathSync(filePath);
          const targetStats = statSync(realPath);
          if (!targetStats.isFile()) {
            throw new Error(`Symlink target is not a file: ${realPath}`);
          }
        } catch (error) {
          throw new Error(`Cannot resolve symlink ${filePath}: ${error}`);
        }
      } else if (!stats.isFile()) {
        // For non-symlinks, check it's a regular file
        throw new Error(`Not a file: ${filePath}`);
      }

      // Try to read the file to ensure we have permissions
      try {
        readFileSync(filePath, 'utf-8');
      } catch (error) {
        throw new Error(`Cannot read file: ${filePath} - ${error}`);
      }
    }

    // Process each file
    for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
      const originalPath = uriToPath(uri);

      // Resolve symlinks to their actual target
      let targetPath = originalPath;
      const originalStats = lstatSync(originalPath);
      if (originalStats.isSymbolicLink()) {
        targetPath = realpathSync(originalPath);
        process.stderr.write(
          `[DEBUG] Editing symlink target: ${targetPath} (via ${originalPath})\n`
        );
      }

      // Read content from the actual file (symlink target or regular file)
      const originalContent = readFileSync(targetPath, 'utf-8');

      // Always track original content for rollback
      const backup: FileBackup = {
        originalPath: originalPath, // The requested path (could be symlink)
        targetPath: targetPath, // The actual file to restore
        originalContent,
      };

      // Create physical backup file if requested (backup the target, not the symlink)
      if (createBackups) {
        const backupPath = targetPath + backupSuffix;
        copyFileSync(targetPath, backupPath);
        backup.backupPath = backupPath;
      }

      backups.push(backup);

      // Apply edits to the file content
      const modifiedContent = applyEditsToContent(originalContent, edits, validateBeforeApply);

      // Write the modified content atomically to the target location
      const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      writeFileSync(tempPath, modifiedContent, 'utf-8');

      // Diagnostic: log the rename operation to detect cross-device issues
      logRenameOperation(tempPath, targetPath);

      // Atomic rename to replace the target file (not the symlink)
      try {
        renameSync(tempPath, targetPath);
      } catch (error) {
        // Clean up temp file if rename failed
        try {
          if (existsSync(tempPath)) {
            unlinkSync(tempPath);
          }
        } catch {}
        throw error;
      }

      // Report the original path as modified (what the user requested)
      filesModified.push(originalPath);

      // Sync the file with LSP server if client is provided
      // Use the original path (not target) for LSP sync since LSP tracks by requested path
      if (lspClient) {
        await lspClient.syncFileContent(originalPath);
      }
    }

    return {
      success: true,
      filesModified,
      backupFiles: backups
        .filter((b): b is FileBackup & { backupPath: string } => !!b.backupPath)
        .map((b) => b.backupPath),
    };
  } catch (error) {
    // Rollback: restore original files from backups
    for (const backup of backups) {
      try {
        // Restore to the target path (the actual file, not the symlink)
        writeFileSync(backup.targetPath, backup.originalContent, 'utf-8');
      } catch (rollbackError) {
        console.error(`Failed to rollback ${backup.targetPath}:`, rollbackError);
      }
    }

    // Clean up backup files after successful rollback
    for (const backup of backups) {
      if (backup.backupPath) {
        try {
          if (existsSync(backup.backupPath)) {
            unlinkSync(backup.backupPath);
          }
        } catch (cleanupError) {
          console.error(`Failed to clean up backup ${backup.backupPath}:`, cleanupError);
        }
      }
    }

    return {
      success: false,
      filesModified: [],
      backupFiles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply text edits to file content
 * @param content Original file content
 * @param edits List of edits to apply
 * @param validate Whether to validate edit positions
 * @returns Modified content
 */
function applyEditsToContent(content: string, edits: TextEdit[], validate: boolean): string {
  // Detect and preserve line ending style
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

  // Split content into lines for easier manipulation
  // Handle both LF and CRLF
  const lines = content.split(/\r?\n/);

  // Sort edits in reverse order (bottom to top, right to left)
  // This ensures that earlier edits don't affect the positions of later edits
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  for (const edit of sortedEdits) {
    const { start, end } = edit.range;

    // Validate edit positions if requested
    if (validate) {
      if (start.line < 0 || start.line >= lines.length) {
        throw new Error(`Invalid start line ${start.line} (file has ${lines.length} lines)`);
      }
      if (end.line < 0 || end.line >= lines.length) {
        throw new Error(`Invalid end line ${end.line} (file has ${lines.length} lines)`);
      }

      // Validate start position is before end position
      if (start.line > end.line || (start.line === end.line && start.character > end.character)) {
        throw new Error(
          `Invalid range: start (${start.line}:${start.character}) is after end (${end.line}:${end.character})`
        );
      }

      // Validate character bounds for start line
      const startLine = lines[start.line];
      if (startLine !== undefined) {
        if (start.character < 0 || start.character > startLine.length) {
          throw new Error(
            `Invalid start character ${start.character} on line ${start.line} (line has ${startLine.length} characters)`
          );
        }
      }

      // Validate character bounds for end line
      const endLine = lines[end.line];
      if (endLine !== undefined) {
        if (end.character < 0 || end.character > endLine.length) {
          throw new Error(
            `Invalid end character ${end.character} on line ${end.line} (line has ${endLine.length} characters)`
          );
        }
      }
    }

    // Apply the edit
    if (start.line === end.line) {
      // Single line edit
      const line = lines[start.line];
      if (line !== undefined) {
        lines[start.line] =
          line.substring(0, start.character) + edit.newText + line.substring(end.character);
      }
    } else {
      // Multi-line edit
      const startLine = lines[start.line];
      const endLine = lines[end.line];

      if (startLine !== undefined && endLine !== undefined) {
        // Combine the parts with the new text
        const newLine =
          startLine.substring(0, start.character) + edit.newText + endLine.substring(end.character);

        // Replace the affected lines
        lines.splice(start.line, end.line - start.line + 1, newLine);
      }
    }
  }

  return lines.join(lineEnding);
}

/**
 * Clean up backup files created during editing
 * @param backupFiles List of backup file paths
 */
export function cleanupBackups(backupFiles: string[]): void {
  for (const backupPath of backupFiles) {
    try {
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
    } catch (error) {
      console.error(`Failed to remove backup file ${backupPath}:`, error);
    }
  }
}
