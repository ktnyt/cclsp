import { uriToPath } from '../utils.js';
import { resolvePath, textResult } from './helpers.js';
import type { ToolDefinition } from './registry.js';

export const findWorkspaceSymbolsTool: ToolDefinition = {
  name: 'find_workspace_symbols',
  description:
    'Search for symbols across the entire workspace by name. Returns matching symbols from all files.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The symbol name or pattern to search for',
      },
    },
    required: ['query'],
  },
  handler: async (args, client) => {
    const { query } = args as { query: string };

    try {
      const symbols = await client.workspaceSymbol(query);

      if (symbols.length === 0) {
        return textResult(`No symbols found matching "${query}"`);
      }

      const symbolList = symbols.map((sym) => {
        const filePath = uriToPath(sym.location.uri);
        const { start } = sym.location.range;
        return `• ${sym.name} (${client.symbolKindToString(sym.kind)}) at ${filePath}:${start.line + 1}:${start.character + 1}`;
      });

      return textResult(
        `Found ${symbols.length} symbol(s) matching "${query}":\n\n${symbolList.join('\n')}`
      );
    } catch (error) {
      return textResult(
        `Error searching symbols: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const prepareCallHierarchyTool: ToolDefinition = {
  name: 'prepare_call_hierarchy',
  description:
    'Get call hierarchy item at a position. Use this to prepare for incoming_calls or outgoing_calls.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file',
      },
      line: {
        type: 'number',
        description: 'The line number (1-indexed)',
      },
      character: {
        type: 'number',
        description: 'The character position in the line (1-indexed)',
      },
    },
    required: ['file_path', 'line', 'character'],
  },
  handler: async (args, client) => {
    const { file_path, line, character } = args as {
      file_path: string;
      line: number;
      character: number;
    };
    const absolutePath = resolvePath(file_path);

    try {
      const items = await client.prepareCallHierarchy(absolutePath, {
        line: line - 1,
        character: character - 1,
      });

      if (items.length === 0) {
        return textResult(`No call hierarchy item found at ${file_path}:${line}:${character}`);
      }

      const itemList = items.map((item) => {
        const filePath = uriToPath(item.uri);
        const { start } = item.selectionRange;
        return `• ${item.name} (${client.symbolKindToString(item.kind)}) at ${filePath}:${start.line + 1}:${start.character + 1}${item.detail ? ` - ${item.detail}` : ''}`;
      });

      return textResult(
        `Call hierarchy item(s) at ${file_path}:${line}:${character}:\n\n${itemList.join('\n')}`
      );
    } catch (error) {
      return textResult(
        `Error preparing call hierarchy: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const getIncomingCallsTool: ToolDefinition = {
  name: 'get_incoming_calls',
  description:
    'Find all functions/methods that call the function at a position. Requires prepare_call_hierarchy first.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file',
      },
      line: {
        type: 'number',
        description: 'The line number (1-indexed)',
      },
      character: {
        type: 'number',
        description: 'The character position in the line (1-indexed)',
      },
    },
    required: ['file_path', 'line', 'character'],
  },
  handler: async (args, client) => {
    const { file_path, line, character } = args as {
      file_path: string;
      line: number;
      character: number;
    };
    const absolutePath = resolvePath(file_path);

    try {
      const items = await client.prepareCallHierarchy(absolutePath, {
        line: line - 1,
        character: character - 1,
      });

      if (items.length === 0) {
        return textResult(`No call hierarchy item found at ${file_path}:${line}:${character}`);
      }

      const allCalls = [];
      for (const item of items) {
        const calls = await client.incomingCalls(item);
        for (const call of calls) {
          const filePath = uriToPath(call.from.uri);
          const { start } = call.from.selectionRange;
          allCalls.push(
            `• ${call.from.name} (${client.symbolKindToString(call.from.kind)}) at ${filePath}:${start.line + 1}:${start.character + 1}`
          );
        }
      }

      if (allCalls.length === 0) {
        return textResult(
          `No incoming calls found for the function at ${file_path}:${line}:${character}`
        );
      }

      return textResult(`Found ${allCalls.length} incoming call(s):\n\n${allCalls.join('\n')}`);
    } catch (error) {
      return textResult(
        `Error finding incoming calls: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const getOutgoingCallsTool: ToolDefinition = {
  name: 'get_outgoing_calls',
  description:
    'Find all functions/methods called by the function at a position. Requires prepare_call_hierarchy first.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file',
      },
      line: {
        type: 'number',
        description: 'The line number (1-indexed)',
      },
      character: {
        type: 'number',
        description: 'The character position in the line (1-indexed)',
      },
    },
    required: ['file_path', 'line', 'character'],
  },
  handler: async (args, client) => {
    const { file_path, line, character } = args as {
      file_path: string;
      line: number;
      character: number;
    };
    const absolutePath = resolvePath(file_path);

    try {
      const items = await client.prepareCallHierarchy(absolutePath, {
        line: line - 1,
        character: character - 1,
      });

      if (items.length === 0) {
        return textResult(`No call hierarchy item found at ${file_path}:${line}:${character}`);
      }

      const allCalls = [];
      for (const item of items) {
        const calls = await client.outgoingCalls(item);
        for (const call of calls) {
          const filePath = uriToPath(call.to.uri);
          const { start } = call.to.selectionRange;
          allCalls.push(
            `• ${call.to.name} (${client.symbolKindToString(call.to.kind)}) at ${filePath}:${start.line + 1}:${start.character + 1}`
          );
        }
      }

      if (allCalls.length === 0) {
        return textResult(
          `No outgoing calls found for the function at ${file_path}:${line}:${character}`
        );
      }

      return textResult(`Found ${allCalls.length} outgoing call(s):\n\n${allCalls.join('\n')}`);
    } catch (error) {
      return textResult(
        `Error finding outgoing calls: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const symbolTools: ToolDefinition[] = [
  findWorkspaceSymbolsTool,
  prepareCallHierarchyTool,
  getIncomingCallsTool,
  getOutgoingCallsTool,
];
