import { resolvePath, textResult } from './helpers.js';
import type { ToolDefinition } from './registry.js';

export const getDiagnosticsTool: ToolDefinition = {
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
  handler: async (args, client) => {
    const { file_path } = args as { file_path: string };
    const absolutePath = resolvePath(file_path);

    try {
      const diagnostics = await client.getDiagnostics(absolutePath);

      if (diagnostics.length === 0) {
        return textResult(
          `No diagnostics found for ${file_path}. The file has no errors, warnings, or hints.`
        );
      }

      const severityMap: Record<number, string> = {
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

      return textResult(
        `Found ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'} in ${file_path}:\n\n${diagnosticMessages.join('\n\n')}`
      );
    } catch (error) {
      return textResult(
        `Error getting diagnostics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
};

export const diagnosticsTools: ToolDefinition[] = [getDiagnosticsTool];
