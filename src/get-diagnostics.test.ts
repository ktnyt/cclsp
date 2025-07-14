import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { resolve } from 'node:path';
import type { LSPClient } from './lsp-client.js';
import type { Diagnostic } from './types.js';

// Create a function that executes the handler logic
async function createHandler(args: { file_path: string }, lspClient: { getDiagnostics: any }) {
  const { file_path } = args;
  const absolutePath = resolve(file_path);

  try {
    const diagnostics = await lspClient.getDiagnostics(absolutePath);

    if (diagnostics.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No diagnostics found for ${file_path}. The file has no errors, warnings, or hints.`,
          },
        ],
      };
    }

    const severityMap: Record<number, string> = {
      1: 'Error',
      2: 'Warning',
      3: 'Information',
      4: 'Hint',
    };

    const diagnosticMessages = diagnostics.map((diag: Diagnostic) => {
      const severity = diag.severity ? severityMap[diag.severity] || 'Unknown' : 'Unknown';
      const code = diag.code ? ` [${diag.code}]` : '';
      const source = diag.source ? ` (${diag.source})` : '';
      const { start, end } = diag.range;

      return `• ${severity}${code}${source}: ${diag.message}\n  Location: Line ${start.line + 1}, Column ${start.character + 1} to Line ${end.line + 1}, Column ${end.character + 1}`;
    });

    return {
      content: [
        {
          type: 'text',
          text: `Found ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'} in ${file_path}:\n\n${diagnosticMessages.join('\n\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error getting diagnostics: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

describe('get_diagnostics MCP tool', () => {
  let mockLspClient: {
    getDiagnostics: ReturnType<typeof spyOn>;
  };

  beforeEach(() => {
    mockLspClient = {
      getDiagnostics: spyOn({} as LSPClient, 'getDiagnostics'),
    };
  });

  it('should return message when no diagnostics found', async () => {
    mockLspClient.getDiagnostics.mockResolvedValue([]);

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toBe(
      'No diagnostics found for test.ts. The file has no errors, warnings, or hints.'
    );
    expect(mockLspClient.getDiagnostics).toHaveBeenCalledWith(resolve('test.ts'));
  });

  it('should format single diagnostic correctly', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        severity: 1, // Error
        message: 'Undefined variable',
        code: 'TS2304',
        source: 'typescript',
      },
    ];

    mockLspClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toContain('Found 1 diagnostic in test.ts:');
    expect(result?.content[0]?.text).toContain('• Error [TS2304] (typescript): Undefined variable');
    expect(result?.content[0]?.text).toContain('Location: Line 1, Column 6 to Line 1, Column 11');
  });

  it('should format multiple diagnostics correctly', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 1, // Error
        message: 'Missing semicolon',
        code: '1003',
        source: 'typescript',
      },
      {
        range: {
          start: { line: 2, character: 10 },
          end: { line: 2, character: 15 },
        },
        severity: 2, // Warning
        message: 'Unused variable',
        source: 'eslint',
      },
      {
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 20 },
        },
        severity: 3, // Information
        message: 'Consider using const',
      },
      {
        range: {
          start: { line: 10, character: 4 },
          end: { line: 10, character: 8 },
        },
        severity: 4, // Hint
        message: 'Add type annotation',
        code: 'no-implicit-any',
      },
    ];

    mockLspClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await createHandler({ file_path: 'src/main.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toContain('Found 4 diagnostics in src/main.ts:');
    expect(result?.content[0]?.text).toContain('• Error [1003] (typescript): Missing semicolon');
    expect(result?.content[0]?.text).toContain('• Warning (eslint): Unused variable');
    expect(result?.content[0]?.text).toContain('• Information: Consider using const');
    expect(result?.content[0]?.text).toContain('• Hint [no-implicit-any]: Add type annotation');
  });

  it('should handle diagnostics without optional fields', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: 'Basic error message',
        // No severity, code, or source
      },
    ];

    mockLspClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toContain('• Unknown: Basic error message');
    expect(result?.content[0]?.text).not.toContain('[');
    expect(result?.content[0]?.text).not.toContain('(');
  });

  it('should handle absolute file paths', async () => {
    mockLspClient.getDiagnostics.mockResolvedValue([]);

    await createHandler({ file_path: '/absolute/path/to/file.ts' }, mockLspClient);

    expect(mockLspClient.getDiagnostics).toHaveBeenCalledWith('/absolute/path/to/file.ts');
  });

  it('should handle error from getDiagnostics', async () => {
    mockLspClient.getDiagnostics.mockRejectedValue(new Error('LSP server not available'));

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toBe('Error getting diagnostics: LSP server not available');
  });

  it('should handle non-Error exceptions', async () => {
    mockLspClient.getDiagnostics.mockRejectedValue('Unknown error');

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    expect(result?.content[0]?.text).toBe('Error getting diagnostics: Unknown error');
  });

  it('should convert 0-indexed line and character to 1-indexed for display', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        severity: 1,
        message: 'Error at start of file',
      },
    ];

    mockLspClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await createHandler({ file_path: 'test.ts' }, mockLspClient);

    // 0-indexed (0, 0) should be displayed as 1-indexed (1, 1)
    expect(result?.content[0]?.text).toContain('Location: Line 1, Column 1 to Line 1, Column 1');
  });
});
