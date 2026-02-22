import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { resolve } from 'node:path';
import type { LSPClient } from './lsp-client.js';
import { findDefinitionTool, findReferencesTool } from './tools/navigation.js';
import { renameSymbolTool } from './tools/refactoring.js';
import { pathToUri, uriToPath } from './utils.js';

type MockLSPClient = {
  findSymbolsByName: ReturnType<typeof jest.fn>;
  findDefinition: ReturnType<typeof jest.fn>;
  findReferences: ReturnType<typeof jest.fn>;
  renameSymbol: ReturnType<typeof jest.fn>;
  symbolKindToString: ReturnType<typeof jest.fn>;
  syncFileContent: ReturnType<typeof jest.fn>;
};

function createMockClient(): MockLSPClient {
  return {
    findSymbolsByName: jest.fn(),
    findDefinition: jest.fn(),
    findReferences: jest.fn(),
    renameSymbol: jest.fn(),
    symbolKindToString: jest.fn((kind: number) => {
      const kindMap: Record<number, string> = {
        5: 'class',
        6: 'method',
        12: 'function',
        13: 'variable',
      };
      return kindMap[kind] || 'unknown';
    }),
    syncFileContent: jest.fn().mockResolvedValue(undefined),
  };
}

function asClient(mock: MockLSPClient): LSPClient {
  return mock as unknown as LSPClient;
}

describe('MCP Tool Handlers', () => {
  let mockClient: MockLSPClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('find_definition', () => {
    it('should find definition via symbol name lookup', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'testFunction',
            kind: 12,
            position: { line: 4, character: 9 },
            range: {
              start: { line: 4, character: 0 },
              end: { line: 6, character: 1 },
            },
          },
        ],
      });

      mockClient.findDefinition.mockResolvedValue([
        {
          uri: pathToUri('/src/impl.ts'),
          range: {
            start: { line: 10, character: 5 },
            end: { line: 10, character: 17 },
          },
        },
      ]);

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'testFunction' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri('/src/impl.ts'))}:11:6`);
      expect(result.content[0]?.text).toContain('testFunction (function)');
      expect(mockClient.findSymbolsByName).toHaveBeenCalledWith(
        resolve('test.ts'),
        'testFunction',
        undefined
      );
    });

    it('should pass symbol_kind to findSymbolsByName', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'MyClass',
            kind: 5,
            position: { line: 0, character: 6 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 10, character: 1 },
            },
          },
        ],
      });

      mockClient.findDefinition.mockResolvedValue([
        {
          uri: pathToUri('/src/classes.ts'),
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
        },
      ]);

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'MyClass', symbol_kind: 'class' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('MyClass (class)');
      expect(mockClient.findSymbolsByName).toHaveBeenCalledWith(
        resolve('test.ts'),
        'MyClass',
        'class'
      );
    });

    it('should return no-symbols message when no matches found', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({ matches: [] });

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'nonExistent' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No symbols found with name "nonExistent"');
      expect(mockClient.findDefinition).not.toHaveBeenCalled();
    });

    it('should include kind in no-symbols message when symbol_kind specified', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({ matches: [] });

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'test', symbol_kind: 'class' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain(
        'No symbols found with name "test" and kind "class"'
      );
    });

    it('should propagate warning from findSymbolsByName', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'test',
            kind: 12,
            position: { line: 0, character: 9 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 2, character: 1 },
            },
          },
        ],
        warning: 'No symbols found with kind "class". Found 1 symbol(s) of other kinds: function',
      });

      mockClient.findDefinition.mockResolvedValue([
        {
          uri: pathToUri('/src/test.ts'),
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
        },
      ]);

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'test', symbol_kind: 'class' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No symbols found with kind "class"');
      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri('/src/test.ts'))}:1:1`);
    });

    it('should handle findDefinition returning empty array', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'test',
            kind: 12,
            position: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ],
      });

      mockClient.findDefinition.mockResolvedValue([]);

      const result = await findDefinitionTool.handler(
        { file_path: 'test.ts', symbol_name: 'test' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('no definitions could be retrieved');
    });
  });

  describe('find_references', () => {
    it('should find references via symbol name lookup', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'myVar',
            kind: 13,
            position: { line: 3, character: 6 },
            range: {
              start: { line: 3, character: 0 },
              end: { line: 3, character: 20 },
            },
          },
        ],
      });

      mockClient.findReferences.mockResolvedValue([
        {
          uri: pathToUri('/src/test.ts'),
          range: {
            start: { line: 3, character: 6 },
            end: { line: 3, character: 11 },
          },
        },
        {
          uri: pathToUri('/src/other.ts'),
          range: {
            start: { line: 20, character: 3 },
            end: { line: 20, character: 8 },
          },
        },
      ]);

      const result = await findReferencesTool.handler(
        { file_path: 'test.ts', symbol_name: 'myVar' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri('/src/test.ts'))}:4:7`);
      expect(result.content[0]?.text).toContain(`${uriToPath(pathToUri('/src/other.ts'))}:21:4`);
      expect(result.content[0]?.text).toContain('myVar (variable)');
    });

    it('should pass include_declaration to findReferences', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'myVar',
            kind: 13,
            position: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ],
      });

      mockClient.findReferences.mockResolvedValue([]);

      await findReferencesTool.handler(
        {
          file_path: 'test.ts',
          symbol_name: 'myVar',
          include_declaration: false,
        },
        asClient(mockClient)
      );

      expect(mockClient.findReferences).toHaveBeenCalledWith(
        resolve('test.ts'),
        { line: 0, character: 0 },
        false
      );
    });

    it('should default include_declaration to true', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'myVar',
            kind: 13,
            position: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ],
      });

      mockClient.findReferences.mockResolvedValue([]);

      await findReferencesTool.handler(
        { file_path: 'test.ts', symbol_name: 'myVar' },
        asClient(mockClient)
      );

      expect(mockClient.findReferences).toHaveBeenCalledWith(
        resolve('test.ts'),
        { line: 0, character: 0 },
        true
      );
    });

    it('should return no-symbols message when no matches found', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({ matches: [] });

      const result = await findReferencesTool.handler(
        { file_path: 'test.ts', symbol_name: 'nonExistent' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No symbols found with name "nonExistent"');
      expect(mockClient.findReferences).not.toHaveBeenCalled();
    });
  });

  describe('rename_symbol', () => {
    it('should rename single matching symbol in dry_run mode', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'oldName',
            kind: 12,
            position: { line: 5, character: 9 },
            range: {
              start: { line: 5, character: 0 },
              end: { line: 7, character: 1 },
            },
          },
        ],
      });

      mockClient.renameSymbol.mockResolvedValue({
        changes: {
          [pathToUri('/src/test.ts')]: [
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

      const result = await renameSymbolTool.handler(
        {
          file_path: 'test.ts',
          symbol_name: 'oldName',
          new_name: 'newName',
          dry_run: true,
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('[DRY RUN]');
      expect(result.content[0]?.text).toContain('oldName (function)');
      expect(result.content[0]?.text).toContain('"newName"');
    });

    it('should return candidate list when multiple symbols match', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'test',
            kind: 12,
            position: { line: 0, character: 9 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 2, character: 1 },
            },
          },
          {
            name: 'test',
            kind: 13,
            position: { line: 5, character: 6 },
            range: {
              start: { line: 5, character: 0 },
              end: { line: 5, character: 20 },
            },
          },
        ],
      });

      const result = await renameSymbolTool.handler(
        { file_path: 'test.ts', symbol_name: 'test', new_name: 'newTest' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('Multiple symbols found');
      expect(result.content[0]?.text).toContain('rename_symbol_strict');
      expect(result.content[0]?.text).toContain('function');
      expect(result.content[0]?.text).toContain('variable');
      expect(mockClient.renameSymbol).not.toHaveBeenCalled();
    });

    it('should return no-symbols message when no matches found', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({ matches: [] });

      const result = await renameSymbolTool.handler(
        {
          file_path: 'test.ts',
          symbol_name: 'nonExistent',
          new_name: 'newName',
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No symbols found with name "nonExistent"');
      expect(mockClient.renameSymbol).not.toHaveBeenCalled();
    });

    it('should handle empty workspace edit', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'test',
            kind: 12,
            position: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ],
      });

      mockClient.renameSymbol.mockResolvedValue({});

      const result = await renameSymbolTool.handler(
        {
          file_path: 'test.ts',
          symbol_name: 'test',
          new_name: 'newTest',
          dry_run: true,
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('No rename edits available');
    });

    it('should handle renameSymbol throwing an error', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [
          {
            name: 'test',
            kind: 12,
            position: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ],
      });

      mockClient.renameSymbol.mockRejectedValue(new Error('LSP error'));

      const result = await renameSymbolTool.handler(
        { file_path: 'test.ts', symbol_name: 'test', new_name: 'newTest' },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('Error renaming symbol: LSP error');
    });

    it('should propagate warning from findSymbolsByName', async () => {
      mockClient.findSymbolsByName.mockResolvedValue({
        matches: [],
        warning: 'Invalid symbol kind "xyz"',
      });

      const result = await renameSymbolTool.handler(
        {
          file_path: 'test.ts',
          symbol_name: 'test',
          symbol_kind: 'xyz',
          new_name: 'newTest',
        },
        asClient(mockClient)
      );

      expect(result.content[0]?.text).toContain('Invalid symbol kind "xyz"');
    });
  });
});
