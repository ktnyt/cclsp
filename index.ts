#!/usr/bin/env node

import { resolve } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LSPClient } from './src/lsp-client.js';
import type { SymbolInformation, WorkspaceSearchResult } from './src/types.js';
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
          'Rename a symbol by name and kind in a file. If multiple symbols match, returns candidate positions and suggests using rename_symbol_strict.',
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
          },
          required: ['file_path', 'symbol_name', 'new_name'],
        },
      },
      {
        name: 'rename_symbol_strict',
        description:
          'Rename a symbol at a specific position in a file. Use this when rename_symbol returns multiple candidates.',
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
        name: 'get_class_members',
        description:
          'List all properties and methods of a class. Returns members with their types and signatures.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file containing the class',
            },
            class_name: {
              type: 'string',
              description: 'The name of the class',
            },
          },
          required: ['file_path', 'class_name'],
        },
      },
      {
        name: 'get_method_signature',
        description:
          'Show full method definition with parameters and return type using LSP hover information.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The path to the file containing the method',
            },
            method_name: {
              type: 'string',
              description: 'The name of the method',
            },
            class_name: {
              type: 'string',
              description: 'Optional: The name of the class containing the method',
            },
          },
          required: ['file_path', 'method_name'],
        },
      },
      {
        name: 'search_type',
        description:
          'Search for symbols (types, methods, functions, variables, etc.) across the entire workspace by name. Supports wildcards and case-insensitive search by default.',
        inputSchema: {
          type: 'object',
          properties: {
            type_name: {
              type: 'string',
              description:
                'The name or pattern of the symbol to search for. Supports wildcards: * (any sequence), ? (single char). Examples: BreakType, *method, getValue*, ?etData',
            },
            type_kind: {
              type: 'string',
              description: 'Optional: Filter by symbol kind',
              enum: [
                'class',
                'interface',
                'enum',
                'struct',
                'type_parameter',
                'method',
                'function',
                'constructor',
                'field',
                'variable',
                'property',
                'constant',
                'namespace',
                'module',
                'package',
              ],
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Optional: Whether to perform case-sensitive search (default: false)',
              default: false,
            },
          },
          required: ['type_name'],
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
      const { file_path, symbol_name, symbol_kind, new_name } = args as {
        file_path: string;
        symbol_name: string;
        symbol_kind?: string;
        new_name: string;
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

          const responseText = warning
            ? `${warning}\n\nSuccessfully renamed ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}":\n${changes.join('\n')}`
            : `Successfully renamed ${match.name} (${lspClient.symbolKindToString(match.kind)}) to "${new_name}":\n${changes.join('\n')}`;

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
      const { file_path, line, character, new_name } = args as {
        file_path: string;
        line: number;
        character: number;
        new_name: string;
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

          return {
            content: [
              {
                type: 'text',
                text: `Successfully renamed symbol at line ${line}, character ${character} to "${new_name}":\n${changes.join('\n')}`,
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

    if (name === 'get_class_members') {
      const { file_path, class_name } = args as { file_path: string; class_name: string };
      const absolutePath = resolve(file_path);

      try {
        const members = await lspClient.getClassMembers(absolutePath, class_name);

        if (members.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No members found for class "${class_name}" in ${file_path}. Please verify the class name and ensure the language server is properly configured.`,
              },
            ],
          };
        }

        const memberList = members
          .map((member) => {
            const kindStr = lspClient.symbolKindToString(member.kind);
            const location = `${file_path}:${member.position.line + 1}:${member.position.character + 1}`;
            let output = `• ${member.name} (${kindStr}) at ${location}`;

            if (member.detail) {
              output += `\n  ${member.detail}`;
            }

            if (member.typeInfo) {
              if (member.typeInfo.parameters && member.typeInfo.parameters.length > 0) {
                output += '\n  Parameters:';
                for (const param of member.typeInfo.parameters) {
                  output += `\n    - ${param.name}${param.isOptional ? '?' : ''}: ${param.type}`;
                  if (param.defaultValue) {
                    output += ` = ${param.defaultValue}`;
                  }
                  if (param.definitionLocation) {
                    const defLoc = param.definitionLocation;
                    const filePath = uriToPath(defLoc.uri);
                    output += `\n      Type defined at: ${filePath}:${defLoc.line + 1}:${defLoc.character + 1}`;
                  }
                }
              }
              if (member.typeInfo.returnType) {
                output += `\n  Returns: ${member.typeInfo.returnType}`;
              }
              if (member.typeInfo.definitionLocation) {
                const defLoc = member.typeInfo.definitionLocation;
                const filePath = uriToPath(defLoc.uri);
                output += `\n  Type defined at: ${filePath}:${defLoc.line + 1}:${defLoc.character + 1}`;
              }
            }

            return output;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${members.length} member${members.length === 1 ? '' : 's'} in class "${class_name}":\n\n${memberList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting class members: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    if (name === 'get_method_signature') {
      const { file_path, method_name, class_name } = args as {
        file_path: string;
        method_name: string;
        class_name?: string;
      };
      const absolutePath = resolve(file_path);

      try {
        const signatures = await lspClient.getMethodSignature(
          absolutePath,
          method_name,
          class_name
        );

        if (signatures.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No signature found for method "${method_name}"${class_name ? ` in class "${class_name}"` : ''} in ${file_path}. Please verify the method name and ensure the language server is properly configured.`,
              },
            ],
          };
        }

        const signatureList = signatures
          .map((sig) => {
            const location = `${file_path}:${sig.position.line + 1}:${sig.position.character + 1}`;
            let output = `Method: ${sig.name} at ${location}\n${sig.signature}`;

            if (sig.typeInfo) {
              output += '\n\nType Details:';
              if (sig.typeInfo.parameters && sig.typeInfo.parameters.length > 0) {
                output += '\n  Parameters:';
                for (const param of sig.typeInfo.parameters) {
                  output += `\n    - ${param.name}${param.isOptional ? '?' : ''}: ${param.type}`;
                  if (param.defaultValue) {
                    output += ` = ${param.defaultValue}`;
                  }
                  if (param.definitionLocation) {
                    const defLoc = param.definitionLocation;
                    const filePath = uriToPath(defLoc.uri);
                    output += `\n      Type defined at: ${filePath}:${defLoc.line + 1}:${defLoc.character + 1}`;
                  }
                }
              }
              if (sig.typeInfo.returnType) {
                output += `\n  Returns: ${sig.typeInfo.returnType}`;
                if (sig.typeInfo.returnTypeDefinitionLocation) {
                  const defLoc = sig.typeInfo.returnTypeDefinitionLocation;
                  process.stderr.write(`[DEBUG] Raw return type URI from LSP: ${defLoc.uri}\n`);
                  const filePath = uriToPath(defLoc.uri);
                  process.stderr.write(`[DEBUG] Converted return type path: ${filePath}\n`);
                  output += `\n    Return type defined at: ${filePath}:${defLoc.line + 1}:${defLoc.character + 1}`;
                }
              }
              if (sig.typeInfo.definitionLocation) {
                const defLoc = sig.typeInfo.definitionLocation;
                const filePath = uriToPath(defLoc.uri);
                output += `\n  Type defined at: ${filePath}:${defLoc.line + 1}:${defLoc.character + 1}`;
              }
            }

            return output;
          })
          .join('\n\n---\n\n');

        return {
          content: [
            {
              type: 'text',
              text: signatureList,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting method signature: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    if (name === 'search_type') {
      const { type_name, type_kind, case_sensitive } = args as {
        type_name: string;
        type_kind?: string;
        case_sensitive?: boolean;
      };

      try {
        const searchResult = await lspClient.findTypeInWorkspace(
          type_name,
          type_kind,
          case_sensitive
        );

        const { symbols: typeSymbols, debugInfo } = searchResult;

        if (typeSymbols.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No symbol found for "${type_name}"${type_kind ? ` of kind "${type_kind}"` : ''}.\n\nMake sure:\n1. The symbol name is spelled correctly\n2. The language server is configured for the file type containing this symbol\n3. The workspace has been properly indexed by the language server${type_kind ? `\n4. The symbol is actually a ${type_kind}` : ''}`,
              },
            ],
          };
        }

        const typeList = typeSymbols
          .map((symbol: SymbolInformation) => {
            const uri = symbol.location.uri;
            const filePath = uriToPath(uri);
            const location = `${filePath}:${symbol.location.range.start.line + 1}:${symbol.location.range.start.character + 1}`;
            const kindStr = lspClient.symbolKindToString(symbol.kind);

            let output = `• ${symbol.name} (${kindStr}) at ${location}`;
            if (symbol.containerName) {
              output += `\n  Container: ${symbol.containerName}`;
            }

            return output;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${typeSymbols.length} symbol${typeSymbols.length === 1 ? '' : 's'} matching "${type_name}":\n\n${typeList}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching for type: ${error instanceof Error ? error.message : String(error)}`,
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
