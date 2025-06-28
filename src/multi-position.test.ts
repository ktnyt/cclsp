import { beforeEach, describe, expect, it, spyOn } from 'bun:test';

// Type definitions for test
interface ToolArgs {
  file_path: string;
  line: number;
  character: number;
  include_declaration?: boolean;
  new_name?: string;
}

// Mock implementation for LSPClient with position-based results
class MockLSPClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findDefinition: any = spyOn({} as any, 'findDefinition');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findReferences: any = spyOn({} as any, 'findReferences');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renameSymbol: any = spyOn({} as any, 'renameSymbol');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispose: any = spyOn({} as any, 'dispose').mockImplementation(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preloadServers: any = spyOn({} as any, 'preloadServers').mockResolvedValue(undefined);

  // Helper to simulate different results for different positions
  setPositionBasedResults(results: Record<string, any[]>) {
    this.findDefinition.mockImplementation(
      (filePath: string, position: { line: number; character: number }) => {
        const key = `${position.line}:${position.character}`;
        return Promise.resolve(results[key] || []);
      }
    );

    this.findReferences.mockImplementation(
      (
        filePath: string,
        position: { line: number; character: number },
        includeDeclaration: boolean
      ) => {
        const key = `${position.line}:${position.character}`;
        return Promise.resolve(results[key] || []);
      }
    );

    this.renameSymbol.mockImplementation(
      (filePath: string, position: { line: number; character: number }, newName: string) => {
        const key = `${position.line}:${position.character}`;
        const locations = results[key] || [];
        if (locations.length > 0) {
          return Promise.resolve({
            changes: {
              'file:///test.ts': locations.map((loc) => ({
                range: loc.range,
                newText: newName,
              })),
            },
          });
        }
        return Promise.resolve({});
      }
    );
  }
}

// Tool handler function similar to main index.ts with multi-position logic
async function handleMultiPositionToolCall(
  name: string,
  args: ToolArgs,
  mockLspClient: MockLSPClient
) {
  const { file_path, line, character } = args;

  if (name === 'find_definition') {
    // Try multiple position combinations
    const positionCandidates = [
      {
        line: line - 1,
        character: character - 1,
        description: `line-1/character-1 (${line - 1}:${character - 1})`,
      },
      {
        line: line,
        character: character - 1,
        description: `line/character-1 (${line}:${character - 1})`,
      },
      {
        line: line - 1,
        character: character,
        description: `line-1/character (${line - 1}:${character})`,
      },
      { line: line, character: character, description: `line/character (${line}:${character})` },
    ];

    const results = [];
    for (const candidate of positionCandidates) {
      try {
        const locations = await mockLspClient.findDefinition('test.ts', {
          line: candidate.line,
          character: candidate.character,
        });

        if (locations.length > 0) {
          const locationResults = locations
            .map((loc: any) => {
              const filePath = loc.uri.replace('file://', '');
              const { start } = loc.range;
              return `${filePath}:${start.line + 1}:${start.character + 1}`;
            })
            .join('\n');

          results.push(`Results for ${candidate.description}:\n${locationResults}`);
        }
      } catch (error) {
        // Continue trying other positions if one fails
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No definition found at any position variation around line ${line}, character ${character}. Please verify the symbol location and ensure the language server is properly configured.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n\n'),
        },
      ],
    };
  }

  if (name === 'find_references') {
    const { include_declaration = true } = args;

    // Try multiple position combinations
    const positionCandidates = [
      {
        line: line - 1,
        character: character - 1,
        description: `line-1/character-1 (${line - 1}:${character - 1})`,
      },
      {
        line: line,
        character: character - 1,
        description: `line/character-1 (${line}:${character - 1})`,
      },
      {
        line: line - 1,
        character: character,
        description: `line-1/character (${line - 1}:${character})`,
      },
      { line: line, character: character, description: `line/character (${line}:${character})` },
    ];

    const results = [];
    for (const candidate of positionCandidates) {
      try {
        const locations = await mockLspClient.findReferences(
          'test.ts',
          { line: candidate.line, character: candidate.character },
          include_declaration
        );

        if (locations.length > 0) {
          const locationResults = locations
            .map((loc: any) => {
              const filePath = loc.uri.replace('file://', '');
              const { start } = loc.range;
              return `${filePath}:${start.line + 1}:${start.character + 1}`;
            })
            .join('\n');

          results.push(`Results for ${candidate.description}:\n${locationResults}`);
        }
      } catch (error) {
        // Continue trying other positions if one fails
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No references found at any position variation around line ${line}, character ${character}. Please verify the symbol location and ensure the language server is properly configured.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n\n'),
        },
      ],
    };
  }

  if (name === 'rename_symbol') {
    const { new_name } = args;
    if (!new_name) {
      throw new Error('new_name is required for rename_symbol');
    }

    // Try multiple position combinations
    const positionCandidates = [
      {
        line: line - 1,
        character: character - 1,
        description: `line-1/character-1 (${line - 1}:${character - 1})`,
      },
      {
        line: line,
        character: character - 1,
        description: `line/character-1 (${line}:${character - 1})`,
      },
      {
        line: line - 1,
        character: character,
        description: `line-1/character (${line - 1}:${character})`,
      },
      { line: line, character: character, description: `line/character (${line}:${character})` },
    ];

    const results = [];
    for (const candidate of positionCandidates) {
      try {
        const workspaceEdit = await mockLspClient.renameSymbol(
          'test.ts',
          { line: candidate.line, character: candidate.character },
          new_name
        );

        if (workspaceEdit?.changes && Object.keys(workspaceEdit.changes).length > 0) {
          const changes = [];
          for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
            const filePath = uri.replace('file://', '');
            changes.push(`File: ${filePath}`);
            for (const edit of edits) {
              const { start, end } = edit.range;
              changes.push(
                `  - Line ${start.line + 1}, Column ${start.character + 1} to Line ${end.line + 1}, Column ${end.character + 1}: "${edit.newText}"`
              );
            }
          }

          results.push(`Results for ${candidate.description}:\n${changes.join('\n')}`);
        }
      } catch (error) {
        // Continue trying other positions if one fails
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No rename edits available at any position variation around line ${line}, character ${character}. Please verify the symbol location and ensure the language server is properly configured.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n\n'),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

describe('Multi-Position Tool Calls', () => {
  let mockLspClient: MockLSPClient;

  beforeEach(() => {
    mockLspClient = new MockLSPClient();
  });

  describe('find_definition', () => {
    it('should find results in one position variation and return it', async () => {
      // Mock: only position (4, 9) has results, others return empty
      const mockResults = {
        '4:9': [
          {
            uri: 'file:///test.ts',
            range: {
              start: { line: 10, character: 5 },
              end: { line: 10, character: 15 },
            },
          },
        ],
      };
      mockLspClient.setPositionBasedResults(mockResults);

      const response = await handleMultiPositionToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(response.content[0].text).toContain('Results for line-1/character-1 (4:9)');
      expect(response.content[0].text).toContain('/test.ts:11:6');
    });

    it('should find results in multiple position variations and return all', async () => {
      // Mock: two different positions have results
      const mockResults = {
        '4:9': [
          {
            uri: 'file:///test.ts',
            range: {
              start: { line: 10, character: 5 },
              end: { line: 10, character: 15 },
            },
          },
        ],
        '5:9': [
          {
            uri: 'file:///other.ts',
            range: {
              start: { line: 15, character: 8 },
              end: { line: 15, character: 18 },
            },
          },
        ],
      };
      mockLspClient.setPositionBasedResults(mockResults);

      const response = await handleMultiPositionToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(response.content[0].text).toContain('Results for line-1/character-1 (4:9)');
      expect(response.content[0].text).toContain('/test.ts:11:6');
      expect(response.content[0].text).toContain('Results for line/character-1 (5:9)');
      expect(response.content[0].text).toContain('/other.ts:16:9');
    });

    it('should return error message when no position variations have results', async () => {
      mockLspClient.setPositionBasedResults({}); // No results for any position

      const response = await handleMultiPositionToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(response.content[0].text).toBe(
        'No definition found at any position variation around line 5, character 10. Please verify the symbol location and ensure the language server is properly configured.'
      );
    });
  });

  describe('find_references', () => {
    it('should find references in position variations', async () => {
      const mockResults = {
        '4:10': [
          {
            uri: 'file:///test.ts',
            range: {
              start: { line: 20, character: 3 },
              end: { line: 20, character: 13 },
            },
          },
        ],
      };
      mockLspClient.setPositionBasedResults(mockResults);

      const response = await handleMultiPositionToolCall(
        'find_references',
        {
          file_path: 'test.ts',
          line: 5,
          character: 11,
          include_declaration: false,
        },
        mockLspClient
      );

      expect(response.content[0].text).toContain('Results for line-1/character-1 (4:10)');
      expect(response.content[0].text).toContain('/test.ts:21:4');
    });

    it('should return error message when no references found', async () => {
      mockLspClient.setPositionBasedResults({});

      const response = await handleMultiPositionToolCall(
        'find_references',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(response.content[0].text).toBe(
        'No references found at any position variation around line 5, character 10. Please verify the symbol location and ensure the language server is properly configured.'
      );
    });
  });

  describe('rename_symbol', () => {
    it('should generate rename edits for position variations', async () => {
      const mockResults = {
        '5:10': [
          {
            uri: 'file:///test.ts',
            range: {
              start: { line: 5, character: 10 },
              end: { line: 5, character: 20 },
            },
          },
        ],
      };
      mockLspClient.setPositionBasedResults(mockResults);

      const response = await handleMultiPositionToolCall(
        'rename_symbol',
        {
          file_path: 'test.ts',
          line: 6,
          character: 11,
          new_name: 'newSymbolName',
        },
        mockLspClient
      );

      expect(response.content[0].text).toContain('Results for line-1/character-1 (5:10)');
      expect(response.content[0].text).toContain('File: /test.ts');
      expect(response.content[0].text).toContain(
        'Line 6, Column 11 to Line 6, Column 21: "newSymbolName"'
      );
    });

    it('should return error message when no rename edits available', async () => {
      mockLspClient.setPositionBasedResults({});

      const response = await handleMultiPositionToolCall(
        'rename_symbol',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          new_name: 'newName',
        },
        mockLspClient
      );

      expect(response.content[0].text).toBe(
        'No rename edits available at any position variation around line 5, character 10. Please verify the symbol location and ensure the language server is properly configured.'
      );
    });
  });

  describe('error handling', () => {
    it('should continue trying other positions when one throws an error', async () => {
      // Mock: first position throws error, second has results
      mockLspClient.findDefinition.mockImplementation(
        (filePath: string, position: { line: number; character: number }) => {
          const key = `${position.line}:${position.character}`;
          if (key === '4:9') {
            throw new Error('LSP Error');
          }
          if (key === '5:9') {
            return Promise.resolve([
              {
                uri: 'file:///test.ts',
                range: {
                  start: { line: 10, character: 5 },
                  end: { line: 10, character: 15 },
                },
              },
            ]);
          }
          return Promise.resolve([]);
        }
      );

      const response = await handleMultiPositionToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(response.content[0].text).toContain('Results for line/character-1 (5:9)');
      expect(response.content[0].text).toContain('/test.ts:11:6');
    });
  });
});
