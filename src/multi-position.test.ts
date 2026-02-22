import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LSPClient } from './lsp-client.js';
import { findImplementationTool } from './tools/navigation.js';
import { renameSymbolStrictTool } from './tools/refactoring.js';
import { pathToUri, uriToPath } from './utils.js';

// Platform-neutral absolute paths for test fixtures
const SRC_IMPL = join(tmpdir(), 'src', 'impl.ts');
const SRC_IMPL1 = join(tmpdir(), 'src', 'impl1.ts');
const SRC_IMPL2 = join(tmpdir(), 'src', 'impl2.ts');
const SRC_TEST = join(tmpdir(), 'src', 'test.ts');
const SRC_FILE1 = join(tmpdir(), 'src', 'file1.ts');
const SRC_FILE2 = join(tmpdir(), 'src', 'file2.ts');

type MockLSPClient = {
  findImplementation: ReturnType<typeof jest.fn>;
  renameSymbol: ReturnType<typeof jest.fn>;
  syncFileContent: ReturnType<typeof jest.fn>;
};

function createMockClient(): MockLSPClient {
  return {
    findImplementation: jest.fn(),
    renameSymbol: jest.fn(),
    syncFileContent: jest.fn().mockResolvedValue(undefined),
  };
}

function asClient(mock: MockLSPClient): LSPClient {
  return mock as unknown as LSPClient;
}

describe('Position-based Tool Handlers', () => {
  let mockClient: MockLSPClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('find_implementation', () => {
    it('should convert 1-indexed input to 0-indexed LSP position', async () => {
      mockClient.findImplementation.mockResolvedValue([
        {
          uri: pathToUri(SRC_IMPL),
          range: {
            start: { line: 10, character: 2 },
            end: { line: 10, character: 20 },
          },
        },
      ]);

      await findImplementationTool.handler(
        { file_path: 'test.ts', line: 5, character: 10 },
        asClient(mockClient)
      );

      expect(mockClient.findImplementation).toHaveBeenCalledWith(resolve('test.ts'), {
        line: 4,
        character: 9,
      });
    });

    it('should format implementation locations with 1-indexed output', async () => {
      mockClient.findImplementation.mockResolvedValue([
        {
          uri: pathToUri(SRC_IMPL1),
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 20 },
          },
        },
        {
          uri: pathToUri(SRC_IMPL2),
          range: {
            start: { line: 10, character: 4 },
            end: { line: 10, character: 25 },
          },
        },
      ]);

      const result = await findImplementationTool.handler(
        { file_path: 'test.ts', line: 1, character: 1 },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('Found 2 implementation(s)');
      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri(SRC_IMPL1))}:6:1`);
      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri(SRC_IMPL2))}:11:5`);
    });

    it('should return message when no implementations found', async () => {
      mockClient.findImplementation.mockResolvedValue([]);

      const result = await findImplementationTool.handler(
        { file_path: 'test.ts', line: 5, character: 10 },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No implementations found at test.ts:5:10');
    });

    it('should handle errors from findImplementation', async () => {
      mockClient.findImplementation.mockRejectedValue(new Error('Server unavailable'));

      const result = await findImplementationTool.handler(
        { file_path: 'test.ts', line: 1, character: 1 },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain(
        'Error finding implementations: Server unavailable'
      );
    });

    it('should handle line 1, character 1 correctly (converts to 0, 0)', async () => {
      mockClient.findImplementation.mockResolvedValue([]);

      await findImplementationTool.handler(
        { file_path: 'test.ts', line: 1, character: 1 },
        asClient(mockClient)
      );

      expect(mockClient.findImplementation).toHaveBeenCalledWith(resolve('test.ts'), {
        line: 0,
        character: 0,
      });
    });
  });

  describe('rename_symbol_strict', () => {
    it('should convert 1-indexed input to 0-indexed LSP position', async () => {
      mockClient.renameSymbol.mockResolvedValue({
        changes: {
          [pathToUri(SRC_TEST)]: [
            {
              range: {
                start: { line: 4, character: 9 },
                end: { line: 4, character: 16 },
              },
              newText: 'newName',
            },
          ],
        },
      });

      await renameSymbolStrictTool.handler(
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          new_name: 'newName',
          dry_run: true,
        },
        asClient(mockClient)
      );

      expect(mockClient.renameSymbol).toHaveBeenCalledWith(
        resolve('test.ts'),
        { line: 4, character: 9 },
        'newName'
      );
    });

    it('should show preview in dry_run mode', async () => {
      mockClient.renameSymbol.mockResolvedValue({
        changes: {
          [pathToUri(SRC_TEST)]: [
            {
              range: {
                start: { line: 5, character: 9 },
                end: { line: 5, character: 16 },
              },
              newText: 'newName',
            },
          ],
        },
      });

      const result = await renameSymbolStrictTool.handler(
        {
          file_path: 'test.ts',
          line: 6,
          character: 10,
          new_name: 'newName',
          dry_run: true,
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('[DRY RUN]');
      expect(result.content[0]?.text).toContain('"newName"');
      expect(result.content[0]?.text).toContain('Line 6, Column 10');
    });

    it('should return message when no rename edits available', async () => {
      mockClient.renameSymbol.mockResolvedValue({});

      const result = await renameSymbolStrictTool.handler(
        { file_path: 'test.ts', line: 5, character: 10, new_name: 'newName' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain(
        'No rename edits available at line 5, character 10'
      );
    });

    it('should handle renameSymbol throwing an error', async () => {
      mockClient.renameSymbol.mockRejectedValue(new Error('LSP error'));

      const result = await renameSymbolStrictTool.handler(
        { file_path: 'test.ts', line: 5, character: 10, new_name: 'newName' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('Error renaming symbol: LSP error');
    });

    it('should show changes across multiple files in dry_run', async () => {
      mockClient.renameSymbol.mockResolvedValue({
        changes: {
          [pathToUri(SRC_FILE1)]: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 7 },
              },
              newText: 'newName',
            },
          ],
          [pathToUri(SRC_FILE2)]: [
            {
              range: {
                start: { line: 10, character: 4 },
                end: { line: 10, character: 11 },
              },
              newText: 'newName',
            },
            {
              range: {
                start: { line: 20, character: 8 },
                end: { line: 20, character: 15 },
              },
              newText: 'newName',
            },
          ],
        },
      });

      const result = await renameSymbolStrictTool.handler(
        {
          file_path: 'test.ts',
          line: 1,
          character: 1,
          new_name: 'newName',
          dry_run: true,
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('[DRY RUN]');
      expect(result.content[0]?.text).toContain(`File: ${uriToPath(pathToUri(SRC_FILE1))}`);
      expect(result.content[0]?.text).toContain(`File: ${uriToPath(pathToUri(SRC_FILE2))}`);
    });
  });
});
