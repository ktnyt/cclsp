import { beforeEach, describe, expect, it, spyOn } from 'bun:test';

// Type definitions for test
interface ToolArgs {
  file_path: string;
  line: number;
  character: number;
  use_zero_index?: boolean;
  include_declaration?: boolean;
  new_name?: string;
}

// Mock implementation for LSPClient
class MockLSPClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findDefinition: any = spyOn({} as any, 'findDefinition').mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findReferences: any = spyOn({} as any, 'findReferences').mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renameSymbol: any = spyOn({} as any, 'renameSymbol').mockResolvedValue({ changes: {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispose: any = spyOn({} as any, 'dispose').mockImplementation(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preloadServers: any = spyOn({} as any, 'preloadServers').mockResolvedValue(undefined);
}

// Tool handler function similar to main index.ts
async function handleToolCall(name: string, args: ToolArgs, mockLspClient: MockLSPClient) {
  if (name === 'find_definition') {
    const {
      file_path,
      line,
      character,
      use_zero_index = false,
    } = args as {
      file_path: string;
      line: number;
      character: number;
      use_zero_index?: boolean;
    };

    const adjustedLine = use_zero_index ? line : line - 1;
    await mockLspClient.findDefinition('test.ts', {
      line: adjustedLine,
      character,
    });

    return {
      content: [
        {
          type: 'text',
          text: `find_definition called with line: ${adjustedLine}`,
        },
      ],
    };
  }

  if (name === 'find_references') {
    const {
      file_path,
      line,
      character,
      include_declaration = true,
      use_zero_index = false,
    } = args as {
      file_path: string;
      line: number;
      character: number;
      include_declaration?: boolean;
      use_zero_index?: boolean;
    };

    const adjustedLine = use_zero_index ? line : line - 1;
    await mockLspClient.findReferences(
      'test.ts',
      { line: adjustedLine, character },
      include_declaration
    );

    return {
      content: [
        {
          type: 'text',
          text: `find_references called with line: ${adjustedLine}`,
        },
      ],
    };
  }

  if (name === 'rename_symbol') {
    const {
      file_path,
      line,
      character,
      new_name,
      use_zero_index = false,
    } = args as {
      file_path: string;
      line: number;
      character: number;
      new_name: string;
      use_zero_index?: boolean;
    };

    const adjustedLine = use_zero_index ? line : line - 1;
    await mockLspClient.renameSymbol('test.ts', { line: adjustedLine, character }, new_name || '');

    return {
      content: [
        {
          type: 'text',
          text: `rename_symbol called with line: ${adjustedLine}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

describe('MCP Tools with use_zero_index option', () => {
  let mockLspClient: MockLSPClient;

  beforeEach(() => {
    // Create fresh mock instance
    mockLspClient = new MockLSPClient();
  });

  describe('find_definition', () => {
    it('should subtract 1 from line number when use_zero_index is false (default)', async () => {
      const response = await handleToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(mockLspClient.findDefinition).toHaveBeenCalledWith('test.ts', {
        line: 4, // 5 - 1 (1-indexed to 0-indexed)
        character: 10,
      });

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_definition called with line: 4',
      });
    });

    it('should use original line number when use_zero_index is true', async () => {
      const response = await handleToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          use_zero_index: true,
        },
        mockLspClient
      );

      expect(mockLspClient.findDefinition).toHaveBeenCalledWith('test.ts', {
        line: 5, // Original line number (0-indexed)
        character: 10,
      });

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_definition called with line: 5',
      });
    });

    it('should subtract 1 from line number when use_zero_index is explicitly false', async () => {
      const response = await handleToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          use_zero_index: false,
        },
        mockLspClient
      );

      expect(mockLspClient.findDefinition).toHaveBeenCalledWith('test.ts', {
        line: 4, // 5 - 1 (1-indexed to 0-indexed)
        character: 10,
      });

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_definition called with line: 4',
      });
    });
  });

  describe('find_references', () => {
    it('should subtract 1 from line number when use_zero_index is false (default)', async () => {
      const response = await handleToolCall(
        'find_references',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
        },
        mockLspClient
      );

      expect(mockLspClient.findReferences).toHaveBeenCalledWith(
        'test.ts',
        {
          line: 4, // 5 - 1 (1-indexed to 0-indexed)
          character: 10,
        },
        true
      );

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_references called with line: 4',
      });
    });

    it('should use original line number when use_zero_index is true', async () => {
      const response = await handleToolCall(
        'find_references',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          use_zero_index: true,
          include_declaration: false,
        },
        mockLspClient
      );

      expect(mockLspClient.findReferences).toHaveBeenCalledWith(
        'test.ts',
        {
          line: 5, // Original line number (0-indexed)
          character: 10,
        },
        false
      );

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_references called with line: 5',
      });
    });
  });

  describe('rename_symbol', () => {
    it('should subtract 1 from line number when use_zero_index is false (default)', async () => {
      const response = await handleToolCall(
        'rename_symbol',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          new_name: 'newSymbolName',
        },
        mockLspClient
      );

      expect(mockLspClient.renameSymbol).toHaveBeenCalledWith(
        'test.ts',
        {
          line: 4, // 5 - 1 (1-indexed to 0-indexed)
          character: 10,
        },
        'newSymbolName'
      );

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'rename_symbol called with line: 4',
      });
    });

    it('should use original line number when use_zero_index is true', async () => {
      const response = await handleToolCall(
        'rename_symbol',
        {
          file_path: 'test.ts',
          line: 5,
          character: 10,
          new_name: 'newSymbolName',
          use_zero_index: true,
        },
        mockLspClient
      );

      expect(mockLspClient.renameSymbol).toHaveBeenCalledWith(
        'test.ts',
        {
          line: 5, // Original line number (0-indexed)
          character: 10,
        },
        'newSymbolName'
      );

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'rename_symbol called with line: 5',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle line 0 with use_zero_index correctly', async () => {
      const response = await handleToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 0,
          character: 0,
          use_zero_index: true,
        },
        mockLspClient
      );

      expect(mockLspClient.findDefinition).toHaveBeenCalledWith('test.ts', {
        line: 0, // Original 0-indexed input
        character: 0,
      });

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_definition called with line: 0',
      });
    });

    it('should handle line 1 with default behavior correctly (converts to 0)', async () => {
      const response = await handleToolCall(
        'find_definition',
        {
          file_path: 'test.ts',
          line: 1,
          character: 0,
        },
        mockLspClient
      );

      expect(mockLspClient.findDefinition).toHaveBeenCalledWith('test.ts', {
        line: 0, // 1 - 1 (1-indexed to 0-indexed)
        character: 0,
      });

      expect(response.content[0]).toEqual({
        type: 'text',
        text: 'find_definition called with line: 0',
      });
    });
  });
});
