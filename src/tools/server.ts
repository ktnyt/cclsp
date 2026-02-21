import { textResult } from './helpers.js';
import type { ToolDefinition } from './registry.js';

export const restartServerTool: ToolDefinition = {
  name: 'restart_server',
  description:
    'Manually restart LSP servers. Can restart servers for specific file extensions or all running servers.',
  inputSchema: {
    type: 'object',
    properties: {
      extensions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of file extensions to restart servers for (e.g., ["ts", "tsx"]). If not provided, all servers will be restarted.',
      },
    },
  },
  handler: async (args, client) => {
    const { extensions } = args as { extensions?: string[] };

    try {
      const result = await client.restartServers(extensions);

      let response = result.message;

      if (result.restarted.length > 0) {
        response += `\n\nRestarted servers:\n${result.restarted.map((s) => `• ${s}`).join('\n')}`;
      }

      if (result.failed.length > 0) {
        response += `\n\nFailed to restart:\n${result.failed.map((s) => `• ${s}`).join('\n')}`;
      }

      return textResult(response);
    } catch (error) {
      return textResult(
        `Error restarting servers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const serverTools: ToolDefinition[] = [restartServerTool];
