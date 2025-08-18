#!/usr/bin/env node

import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { applyWorkspaceEdit } from './src/file-editor.js';
import { LSPClient } from './src/lsp-client.js';
import { uriToPath } from './src/utils.js';

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
          'Find the definition of a symbol by name and kind in a file. Returns definitions for all matching symbols.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            symbol_name: {
              type: 'string',
              description: 'The name of the symbol',
            },
            symbol_kind: {
              type: 'string',
              description: 'The kind of symbol (function, class, variable, method, etc.)',
            },
          },
          required: ['file_path', 'symbol_name'],
        },
      },
      {
        name: 'find_references',
        description:
          'Find all references to a symbol by name and kind in a file. Returns references for all matching symbols.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            symbol_name: {
              type: 'string',
              description: 'The name of the symbol',
            },
            symbol_kind: {
              type: 'string',
              description: 'The kind of symbol (function, class, variable, method, etc.)',
            },
            include_declaration: {
              type: 'boolean',
              description: 'Whether to include the declaration',
              default: true,
            },
          },
          required: ['file_path', 'symbol_name'],
        },
      },
      {
        name: 'rename_symbol',
        description:
          'Rename a symbol by name and kind in a file. If multiple symbols match, returns candidate positions and suggests using rename_symbol_strict. By default, this will apply the rename to the files. Use dry_run to preview changes without applying them.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file',
            },
            symbol_name: {
              type: 'string',
              description: 'The name of the symbol',
            },
            symbol_kind: {
              type: 'string',
              description: 'The kind of symbol (function, class, variable, method, etc.)',
            },
            new_name: {
              type: 'string',
              description: 'The new name for the symbol',
            },
            dry_run: {
              type: 'boolean',
              description:
                'If true, only preview the changes without applying them (default: false)',
            },
          },
          required: ['file_path', 'symbol_name', 'new_name'],
        },
      },
      {
        name: 'rename_symbol_strict',
        description:
          'Rename a symbol at a specific position in a file. Use this when rename_symbol returns multiple candidates. By default, this will apply the rename to the files. Use dry_run to preview changes without applying them.',
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
            new_name: {
              type: 'string',
              description: 'The new name for the symbol',
            },
            dry_run: {
              type: 'boolean',
              description:
                'If true, only preview the changes without applying them (default: false)',
            },
          },
          required: ['file_path', 'line', 'character', 'new_name'],
        },
      },
      {
        name: 'get_diagnostics',
        description:
          'Get language diagnostics (errors, warnings, hints) for a file. Uses LSP textDocument/diagnostic to pull current diagnostics.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file to get diagnostics for',
            },
          },
          required: ['file_path'],
        },
      },
      {
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
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'find_definition') {
      const { file_path, symbol_name, symbol_kind } = args as {
        file_path: string;
        symbol_name: string;
        symbol_kind?: string;
      };
      const absolutePath = resolve(file_path);

      const result = await lspClient.findSymbolsByName(absolutePath, symbol_name, symbol_kind);
      const { matches: symbolMatches, warning } = result;

      process.stderr.write(
        `[DEBUG find_definition] Found ${symbolMatches.length} symbol matches for "${symbol_name}"\n`
      );

      if (symbolMatches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`,
            },
          ],
        };
      }

      const results = [];
      for (const match of symbolMatches) {
        process.stderr.write(
          `[DEBUG find_definition] Processing match: ${match.name} (${lspClient.symbolKindToString(match.kind)}) at ${match.position.line}:${match.position.character}\n`
        );
        try {
          const locations = await lspClient.findDefinition(absolutePath, match.position);
          process.stderr.write(
            `[DEBUG find_definition] findDefinition returned ${locations.length} locations\n`
          );

          if (locations.length > 0) {
            const locationResults = locations
              .map((loc) => {
                const filePath = uriToPath(loc.uri);
                const { start, end } = loc.range;
                return `${filePath}:${start.line + 1}:${start.character + 1}`;
              })
              .join('\n');

            results.push(
              `Results for ${match.name} (${lspClient.symbolKindToString(match.kind)}) at ${file_path}:${match.position.line + 1}:${match.position.character + 1}:\n${locationResults}`
            );
          } else {
            process.stderr.write(
              `[DEBUG find_definition] No definition found for ${match.name} at position ${match.position.line}:${match.position.character}\n`
            );
          }
        } catch (error) {
          process.stderr.write(`[DEBUG find_definition] Error processing match: ${error}\n`);
          // Continue trying other symbols if one fails
        }
      }

      if (results.length === 0) {
        const responseText = warning
          ? `${warning}\n\nFound ${symbolMatches.length} symbol(s) but no definitions could be retrieved. Please ensure the language server is properly configured.`
          : `Found ${symbolMatches.length} symbol(s) but no definitions could be retrieved. Please ensure the language server is properly configured.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      const responseText = warning ? `${warning}\n\n${results.join('\n\n')}` : results.join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    }

    if (name === 'find_references') {
      const {
        file_path,
        symbol_name,
        symbol_kind,
        include_declaration = true,
      } = args as {
        file_path: string;
        symbol_name: string;
        symbol_kind?: string;
        include_declaration?: boolean;
      };
      const absolutePath = resolve(file_path);

      const result = await lspClient.findSymbolsByName(absolutePath, symbol_name, symbol_kind);
      const { matches: symbolMatches, warning } = result;

      if (symbolMatches.length === 0) {
        const responseText = warning
          ? `${warning}\n\nNo symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`
          : `No symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      const results = [];
      for (const match of symbolMatches) {
        try {
          const locations = await lspClient.findReferences(
            absolutePath,
            match.position,
            include_declaration
          );

          if (locations.length > 0) {
            const locationResults = locations
              .map((loc) => {
                const filePath = uriToPath(loc.uri);
                const { start, end } = loc.range;
                return `${filePath}:${start.line + 1}:${start.character + 1}`;
              })
              .join('\n');

            results.push(
              `Results for ${match.name} (${lspClient.symbolKindToString(match.kind)}) at ${file_path}:${match.position.line + 1}:${match.position.character + 1}:\n${locationResults}`
            );
          }
        } catch (error) {
          // Continue trying other symbols if one fails
        }
      }

      if (results.length === 0) {
        const responseText = warning
          ? `${warning}\n\nFound ${symbolMatches.length} symbol(s) but no references could be retrieved. Please ensure the language server is properly configured.`
          : `Found ${symbolMatches.length} symbol(s) but no references could be retrieved. Please ensure the language server is properly configured.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      const responseText = warning ? `${warning}\n\n${results.join('\n\n')}` : results.join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    }

    if (name === 'rename_symbol') {
      const {
        file_path,
        symbol_name,
        symbol_kind,
        new_name,
        dry_run = false,
      } = args as {
        file_path: string;
        symbol_name: string;
        symbol_kind?: string;
        new_name: string;
        dry_run?: boolean;
      };
      const absolutePath = resolve(file_path);

      const result = await lspClient.findSymbolsByName(absolutePath, symbol_name, symbol_kind);
      const { matches: symbolMatches, warning } = result;

      if (symbolMatches.length === 0) {
        const responseText = warning
          ? `${warning}\n\nNo symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`
          : `No symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      if (symbolMatches.length > 1) {
        const candidatesList = symbolMatches
          .map(
            (match) =>
              `- ${match.name} (${lspClient.symbolKindToString(match.kind)}) at line ${match.position.line + 1}, character ${match.position.character + 1}`
          )
          .join('\n');

        const responseText = warning
          ? `${warning}\n\nMultiple symbols found matching "${symbol_name}"${symbol_kind ? ` with kind "${symbol_kind}"` : ''}. Please use rename_symbol_strict with one of these positions:\n\n${candidatesList}`
          : `Multiple symbols found matching "${symbol_name}"${symbol_kind ? ` with kind "${symbol_kind}"` : ''}. Please use rename_symbol_strict with one of these positions:\n\n${candidatesList}`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      }

      // Single match - proceed with rename
      const match = symbolMatches[0];
      if (!match) {
        throw new Error('Unexpected error: no match found');
      }
      try {
        const workspaceEdit = await lspClient.renameSymbol(absolutePath, match.position, new_name);

        if (workspaceEdit?.changes && Object.keys(workspaceEdit.changes).length > 0) {
          const changes = [];
          for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
            const filePath = uriToPath(uri);
            changes.push(`File: ${filePath}`);
            for (const edit of edits) {
              const { start, end } = edit.range;
              changes.push(
                `  - Line ${start.line + 1}, Column ${start.character + 1} to Line ${end.line + 1}, Column ${end.character + 1}: "${edit.newText}"`
              );
            }
          }

          // Apply changes if not in dry run mode
          if (!dry_run) {
            const editResult = await applyWorkspaceEdit(workspaceEdit, { lspClient });

            if (!editResult.success) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to apply rename: ${editResult.error}`,
                  },
                ],
              };
            }

            const responseText = warning
              ? `${warning}\n\nSuccessfully renamed ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}".\n\nModified files:\n${editResult.filesModified.map((f) => `- ${f}`).join('\n')}`
              : `Successfully renamed ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}".\n\nModified files:\n${editResult.filesModified.map((f) => `- ${f}`).join('\n')}`;

            return {
              content: [
                {
                  type: 'text',
                  text: responseText,
                },
              ],
            };
          }
          // Dry run mode - show preview
          const responseText = warning
            ? `${warning}\n\n[DRY RUN] Would rename ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}":\n${changes.join('\n')}`
            : `[DRY RUN] Would rename ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}":\n${changes.join('\n')}`;

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
          };
        }
        const responseText = warning
          ? `${warning}\n\nNo rename edits available for ${match.name} (${lspClient.symbolKindToString(match.kind)}). The symbol may not be renameable or the language server doesn't support renaming this type of symbol.`
          : `No rename edits available for ${match.name} (${lspClient.symbolKindToString(match.kind)}). The symbol may not be renameable or the language server doesn't support renaming this type of symbol.`;

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error renaming symbol: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    if (name === 'rename_symbol_strict') {
      const {
        file_path,
        line,
        character,
        new_name,
        dry_run = false,
      } = args as {
        file_path: string;
        line: number;
        character: number;
        new_name: string;
        dry_run?: boolean;
      };
      const absolutePath = resolve(file_path);

      try {
        const workspaceEdit = await lspClient.renameSymbol(
          absolutePath,
          { line: line - 1, character: character - 1 }, // Convert to 0-indexed
          new_name
        );

        if (workspaceEdit?.changes && Object.keys(workspaceEdit.changes).length > 0) {
          const changes = [];
          for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
            const filePath = uriToPath(uri);
            changes.push(`File: ${filePath}`);
            for (const edit of edits) {
              const { start, end } = edit.range;
              changes.push(
                `  - Line ${start.line + 1}, Column ${start.character + 1} to Line ${end.line + 1}, Column ${end.character + 1}: "${edit.newText}"`
              );
            }
          }

          // Apply changes if not in dry run mode
          if (!dry_run) {
            const editResult = await applyWorkspaceEdit(workspaceEdit, { lspClient });

            if (!editResult.success) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Failed to apply rename: ${editResult.error}`,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `Successfully renamed symbol at line ${line}, character ${character} to "${new_name}".\n\nModified files:\n${editResult.filesModified.map((f) => `- ${f}`).join('\n')}`,
                },
              ],
            };
          }
          // Dry run mode - show preview
          return {
            content: [
              {
                type: 'text',
                text: `[DRY RUN] Would rename symbol at line ${line}, character ${character} to "${new_name}":\n${changes.join('\n')}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `No rename edits available at line ${line}, character ${character}. Please verify the symbol location and ensure the language server is properly configured.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error renaming symbol: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    if (name === 'get_diagnostics') {
      const { file_path } = args as { file_path: string };
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

        const severityMap = {
          1: 'Error',
          2: 'Warning',
          3: 'Information',
          4: 'Hint',
        };

        const diagnosticMessages = diagnostics.map((diag) => {
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

    if (name === 'restart_server') {
      const { extensions } = args as { extensions?: string[] };

      try {
        const result = await lspClient.restartServers(extensions);

        let response = result.message;

        if (result.restarted.length > 0) {
          response += `\n\nRestarted servers:\n${result.restarted.map((s) => `• ${s}`).join('\n')}`;
        }

        if (result.failed.length > 0) {
          response += `\n\nFailed to restart:\n${result.failed.map((s) => `• ${s}`).join('\n')}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error restarting servers: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
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
