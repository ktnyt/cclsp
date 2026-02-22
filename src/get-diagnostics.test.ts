import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { resolve } from 'node:path';
import type { LSPClient } from './lsp-client.js';
import { getDiagnosticsTool } from './tools/diagnostics.js';
import type { Diagnostic } from './types.js';

type MockLSPClient = {
  getDiagnostics: ReturnType<typeof jest.fn>;
};

function createMockClient(): MockLSPClient {
  return {
    getDiagnostics: jest.fn(),
  };
}

function callHandler(args: { file_path: string }, mock: MockLSPClient) {
  return getDiagnosticsTool.handler(args as Record<string, unknown>, mock as unknown as LSPClient);
}

describe('get_diagnostics MCP tool', () => {
  let mockClient: MockLSPClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should return message when no diagnostics found', async () => {
    mockClient.getDiagnostics.mockResolvedValue([]);

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toBe(
      'No diagnostics found for test.ts. The file has no errors, warnings, or hints.'
    );
    expect(mockClient.getDiagnostics).toHaveBeenCalledWith(resolve('test.ts'));
  });

  it('should format single diagnostic correctly', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
        severity: 1,
        message: 'Undefined variable',
        code: 'TS2304',
        source: 'typescript',
      },
    ];

    mockClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toContain('Found 1 diagnostic in test.ts:');
    expect(result.content[0]?.text).toContain('Error [TS2304] (typescript): Undefined variable');
    expect(result.content[0]?.text).toContain('Location: Line 1, Column 6 to Line 1, Column 11');
  });

  it('should format multiple diagnostics correctly', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        severity: 1,
        message: 'Missing semicolon',
        code: '1003',
        source: 'typescript',
      },
      {
        range: {
          start: { line: 2, character: 10 },
          end: { line: 2, character: 15 },
        },
        severity: 2,
        message: 'Unused variable',
        source: 'eslint',
      },
      {
        range: {
          start: { line: 5, character: 0 },
          end: { line: 5, character: 20 },
        },
        severity: 3,
        message: 'Consider using const',
      },
      {
        range: {
          start: { line: 10, character: 4 },
          end: { line: 10, character: 8 },
        },
        severity: 4,
        message: 'Add type annotation',
        code: 'no-implicit-any',
      },
    ];

    mockClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await callHandler({ file_path: 'src/main.ts' }, mockClient);

    expect(result.content[0]?.text).toContain('Found 4 diagnostics in src/main.ts:');
    expect(result.content[0]?.text).toContain('Error [1003] (typescript): Missing semicolon');
    expect(result.content[0]?.text).toContain('Warning (eslint): Unused variable');
    expect(result.content[0]?.text).toContain('Information: Consider using const');
    expect(result.content[0]?.text).toContain('Hint [no-implicit-any]: Add type annotation');
  });

  it('should handle diagnostics without optional fields', async () => {
    const mockDiagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        message: 'Basic error message',
      },
    ];

    mockClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toContain('Unknown: Basic error message');
    expect(result.content[0]?.text).not.toContain('[');
    expect(result.content[0]?.text).not.toContain('(');
  });

  it('should handle absolute file paths', async () => {
    mockClient.getDiagnostics.mockResolvedValue([]);

    await callHandler({ file_path: '/absolute/path/to/file.ts' }, mockClient);

    expect(mockClient.getDiagnostics).toHaveBeenCalledWith(resolve('/absolute/path/to/file.ts'));
  });

  it('should handle error from getDiagnostics', async () => {
    mockClient.getDiagnostics.mockRejectedValue(new Error('LSP server not available'));

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toBe('Error getting diagnostics: LSP server not available');
  });

  it('should handle non-Error exceptions', async () => {
    mockClient.getDiagnostics.mockRejectedValue('Unknown error');

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toBe('Error getting diagnostics: Unknown error');
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

    mockClient.getDiagnostics.mockResolvedValue(mockDiagnostics);

    const result = await callHandler({ file_path: 'test.ts' }, mockClient);

    expect(result.content[0]?.text).toContain('Location: Line 1, Column 1 to Line 1, Column 1');
  });
});
