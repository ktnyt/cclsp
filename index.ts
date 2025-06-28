#!/usr/bin/env node

import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LSPClient } from './src/lsp-client.js';

// Handle subcommands
const args = process.argv.slice(2);
if (args.length > 0) {
  const subcommand = args[0];

  if (subcommand === 'setup') {
    const { main } = await import('./src/setup.js');
    await main();
    process.exit(0);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Available subcommands:');
    console.error('  setup    Configure cclsp for your project');
    console.error('');
    console.error('Run without arguments to start the MCP server.');
    process.exit(1);
  }
}

const lspClient = new LSPClient();

const server = new Server(
  {
    name: 'cclsp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'find_definition',
        description:
          'Find the definition of a symbol at a specific position in a file. Returns line/character numbers as 1-based for human readability.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            line: {
              type: 'number',
              description:
                'The line number (1-indexed by default; set use_zero_index to use 0-based indexing)',
            },
            character: {
              type: 'number',
              description: 'The character position in the line (0-based)',
            },
            use_zero_index: {
              type: 'boolean',
              description:
                'If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input',
              default: false,
            },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      {
        name: 'find_references',
        description:
          'Find all references to a symbol at a specific position in a file. Returns line/character numbers as 1-based for human readability.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            line: {
              type: 'number',
              description:
                'The line number (1-indexed by default; set use_zero_index to use 0-based indexing)',
            },
            character: {
              type: 'number',
              description: 'The character position in the line (0-based)',
            },
            include_declaration: {
              type: 'boolean',
              description: 'Whether to include the declaration',
              default: true,
            },
            use_zero_index: {
              type: 'boolean',
              description:
                'If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input',
              default: false,
            },
          },
          required: ['file_path', 'line', 'character'],
        },
      },
      {
        name: 'rename_symbol',
        description:
          'Rename a symbol at a specific position in a file. Returns the file changes needed to rename the symbol across the codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            line: {
              type: 'number',
              description:
                'The line number (1-indexed by default; set use_zero_index to use 0-based indexing)',
            },
            character: {
              type: 'number',
              description: 'The character position in the line (0-based)',
            },
            new_name: {
              type: 'string',
              description: 'The new name for the symbol',
            },
            use_zero_index: {
              type: 'boolean',
              description:
                'If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input',
              default: false,
            },
          },
          required: ['file_path', 'line', 'character', 'new_name'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
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
      const absolutePath = resolve(file_path);

      const adjustedLine = use_zero_index ? line : line - 1;
      const locations = await lspClient.findDefinition(absolutePath, {
        line: adjustedLine,
        character,
      });

      if (locations.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No definition found',
            },
          ],
        };
      }

      const results = locations
        .map((loc) => {
          const filePath = loc.uri.replace('file://', '');
          const { start, end } = loc.range;
          return `${filePath}:${start.line + 1}:${start.character + 1}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Definition found:\n${results}`,
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
      const absolutePath = resolve(file_path);

      const adjustedLine = use_zero_index ? line : line - 1;
      const locations = await lspClient.findReferences(
        absolutePath,
        { line: adjustedLine, character },
        include_declaration
      );

      if (locations.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No references found',
            },
          ],
        };
      }

      const results = locations
        .map((loc) => {
          const filePath = loc.uri.replace('file://', '');
          const { start, end } = loc.range;
          return `${filePath}:${start.line + 1}:${start.character + 1}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `References found:\n${results}`,
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
      const absolutePath = resolve(file_path);

      const adjustedLine = use_zero_index ? line : line - 1;
      const workspaceEdit = await lspClient.renameSymbol(
        absolutePath,
        { line: adjustedLine, character },
        new_name
      );

      if (!workspaceEdit || !workspaceEdit.changes) {
        return {
          content: [
            {
              type: 'text',
              text: 'No rename edits available',
            },
          ],
        };
      }

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

      return {
        content: [
          {
            type: 'text',
            text: `Rename edits:\n${changes.join('\n')}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

process.on('SIGINT', () => {
  lspClient.dispose();
  process.exit(0);
});

process.on('SIGTERM', () => {
  lspClient.dispose();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('CCLSP Server running on stdio\n');

  // Preload LSP servers for file types found in the project
  try {
    await lspClient.preloadServers();
  } catch (error) {
    process.stderr.write(`Failed to preload LSP servers: ${error}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Server error: ${error}\n`);
  lspClient.dispose();
  process.exit(1);
});
