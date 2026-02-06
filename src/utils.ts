import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Convert a file path to a proper file:// URI
 * Handles Windows paths correctly (e.g., C:\path -> file:///C:/path)
 */
export function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

/**
 * Convert a file:// URI to a file path
 * Handles Windows URIs correctly (e.g., file:///C:/path -> C:\path)
 */
export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}

/**
 * Options for getting code context around a location
 */
export interface CodeContextOptions {
  /** Number of lines to include before the target line (default: 2) */
  linesBefore?: number;
  /** Number of lines to include after the target line (default: 2) */
  linesAfter?: number;
}

/**
 * Result of getting code context
 */
export interface CodeContextResult {
  /** The context lines with their line numbers */
  lines: Array<{
    lineNumber: number;
    content: string;
    isTargetLine: boolean;
  }>;
  /** Formatted string representation of the context */
  formatted: string;
}

/**
 * Get code context around a specific line in a file.
 * Returns the target line plus surrounding context lines.
 *
 * @param filePath - Path to the file
 * @param line - 0-indexed line number
 * @param options - Context options (linesBefore, linesAfter)
 * @returns CodeContextResult with lines and formatted output, or null if file can't be read
 */
export function getCodeContext(
  filePath: string,
  line: number,
  options: CodeContextOptions = {}
): CodeContextResult | null {
  const { linesBefore = 2, linesAfter = 2 } = options;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');

    const startLine = Math.max(0, line - linesBefore);
    const endLine = Math.min(allLines.length - 1, line + linesAfter);

    const lines: CodeContextResult['lines'] = [];

    for (let i = startLine; i <= endLine; i++) {
      const lineContent = allLines[i];
      if (lineContent !== undefined) {
        lines.push({
          lineNumber: i + 1, // 1-indexed for display
          content: lineContent,
          isTargetLine: i === line,
        });
      }
    }

    // Format the context with line numbers and a marker for the target line
    const maxLineNumWidth = String(endLine + 1).length;
    const formatted = lines
      .map((l) => {
        const lineNum = String(l.lineNumber).padStart(maxLineNumWidth, ' ');
        const marker = l.isTargetLine ? '>' : ' ';
        return `${marker} ${lineNum} | ${l.content}`;
      })
      .join('\n');

    return { lines, formatted };
  } catch {
    return null;
  }
}

/**
 * Format a location result with optional code context.
 *
 * @param filePath - Path to the file
 * @param line - 1-indexed line number (as returned by LSP)
 * @param character - 1-indexed character position
 * @param includeContext - Whether to include code context
 * @param contextOptions - Options for context (linesBefore, linesAfter)
 * @returns Formatted location string, optionally with code context
 */
export function formatLocationWithContext(
  filePath: string,
  line: number,
  character: number,
  includeContext: boolean,
  contextOptions: CodeContextOptions = {}
): string {
  const location = `${filePath}:${line}:${character}`;

  if (!includeContext) {
    return location;
  }

  // Line is 1-indexed from LSP, convert to 0-indexed for getCodeContext
  const context = getCodeContext(filePath, line - 1, contextOptions);

  if (!context) {
    return location;
  }

  return `${location}\n${context.formatted}`;
}
