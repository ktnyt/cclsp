import { applyWorkspaceEdit } from '../file-editor.js';
import { uriToPath } from '../utils.js';
import { resolvePath, textResult, withWarning } from './helpers.js';
import type { ToolDefinition } from './registry.js';

export const renameSymbolTool: ToolDefinition = {
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
        description: 'If true, only preview the changes without applying them (default: false)',
      },
    },
    required: ['file_path', 'symbol_name', 'new_name'],
  },
  handler: async (args, client) => {
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
    const absolutePath = resolvePath(file_path);

    const result = await client.findSymbolsByName(absolutePath, symbol_name, symbol_kind);
    const { matches: symbolMatches, warning } = result;

    if (symbolMatches.length === 0) {
      return textResult(
        withWarning(
          warning,
          `No symbols found with name "${symbol_name}"${symbol_kind ? ` and kind "${symbol_kind}"` : ''} in ${file_path}. Please verify the symbol name and ensure the language server is properly configured.`
        )
      );
    }

    if (symbolMatches.length > 1) {
      const candidatesList = symbolMatches
        .map(
          (match) =>
            `- ${match.name} (${client.symbolKindToString(match.kind)}) at line ${match.position.line + 1}, character ${match.position.character + 1}`
        )
        .join('\n');

      return textResult(
        withWarning(
          warning,
          `Multiple symbols found matching "${symbol_name}"${symbol_kind ? ` with kind "${symbol_kind}"` : ''}. Please use rename_symbol_strict with one of these positions:\n\n${candidatesList}`
        )
      );
    }

    // Single match - proceed with rename
    const match = symbolMatches[0];
    if (!match) {
      throw new Error('Unexpected error: no match found');
    }
    try {
      const workspaceEdit = await client.renameSymbol(absolutePath, match.position, new_name);

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
          const editResult = await applyWorkspaceEdit(workspaceEdit, { lspClient: client });

          if (!editResult.success) {
            return textResult(`Failed to apply rename: ${editResult.error}`);
          }

          return textResult(
            withWarning(
              warning,
              `Successfully renamed ${match.name} (${client.symbolKindToString(match.kind)}) to "${new_name}".\n\nModified files:\n${editResult.filesModified.map((f) => `- ${f}`).join('\n')}`
            )
          );
        }
        // Dry run mode - show preview
        return textResult(
          withWarning(
            warning,
            `[DRY RUN] Would rename ${match.name} (${client.symbolKindToString(match.kind)}) to "${new_name}":\n${changes.join('\n')}`
          )
        );
      }
      return textResult(
        withWarning(
          warning,
          `No rename edits available for ${match.name} (${client.symbolKindToString(match.kind)}). The symbol may not be renameable or the language server doesn't support renaming this type of symbol.`
        )
      );
    } catch (error) {
      return textResult(
        `Error renaming symbol: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const renameSymbolStrictTool: ToolDefinition = {
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
        description: 'If true, only preview the changes without applying them (default: false)',
      },
    },
    required: ['file_path', 'line', 'character', 'new_name'],
  },
  handler: async (args, client) => {
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
    const absolutePath = resolvePath(file_path);

    try {
      const workspaceEdit = await client.renameSymbol(
        absolutePath,
        { line: line - 1, character: character - 1 },
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
          const editResult = await applyWorkspaceEdit(workspaceEdit, { lspClient: client });

          if (!editResult.success) {
            return textResult(`Failed to apply rename: ${editResult.error}`);
          }

          return textResult(
            `Successfully renamed symbol at line ${line}, character ${character} to "${new_name}".\n\nModified files:\n${editResult.filesModified.map((f) => `- ${f}`).join('\n')}`
          );
        }
        // Dry run mode - show preview
        return textResult(
          `[DRY RUN] Would rename symbol at line ${line}, character ${character} to "${new_name}":\n${changes.join('\n')}`
        );
      }
      return textResult(
        `No rename edits available at line ${line}, character ${character}. Please verify the symbol location and ensure the language server is properly configured.`
      );
    } catch (error) {
      return textResult(
        `Error renaming symbol: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const refactoringTools: ToolDefinition[] = [renameSymbolTool, renameSymbolStrictTool];
