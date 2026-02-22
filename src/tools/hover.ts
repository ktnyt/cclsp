import { resolvePath, textResult } from './helpers.js';
import type { ToolDefinition } from './registry.js';

export const getHoverTool: ToolDefinition = {
  name: 'get_hover',
  description:
    'Get hover information (documentation, type info) for a symbol at a specific position in a file.',
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
      const result = await client.hover(absolutePath, {
        line: line - 1,
        character: character - 1,
      });

      if (!result) {
        return textResult(`No hover information available at ${file_path}:${line}:${character}`);
      }

      let hoverText: string;
      if (typeof result.contents === 'string') {
        hoverText = result.contents;
      } else if (result.contents && typeof result.contents === 'object') {
        hoverText = result.contents.value || JSON.stringify(result.contents);
      } else {
        hoverText = JSON.stringify(result.contents);
      }

      return textResult(`Hover information at ${file_path}:${line}:${character}:\n\n${hoverText}`);
    } catch (error) {
      return textResult(
        `Error getting hover info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const hoverTools: ToolDefinition[] = [getHoverTool];
