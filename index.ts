#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from './src/logger.js';
import { LSPClient } from './src/lsp-client.js';
import { diagnosticsTools } from './src/tools/diagnostics.js';
import { hoverTools } from './src/tools/hover.js';
import { navigationTools } from './src/tools/navigation.js';
import { refactoringTools } from './src/tools/refactoring.js';
import { registerTools } from './src/tools/registry.js';
import { serverTools } from './src/tools/server.js';
import { symbolTools } from './src/tools/symbols.js';
import { VERSION } from './src/version.js';

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
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const allTools = [
  ...navigationTools,
  ...refactoringTools,
  ...diagnosticsTools,
  ...hoverTools,
  ...symbolTools,
  ...serverTools,
];

registerTools(server, allTools, lspClient);

process.on('SIGINT', () => {
  lspClient.dispose();
  process.exit(0);
});

process.on('SIGTERM', () => {
  lspClient.dispose();
  process.exit(0);
});

// Prevent unhandled errors from crashing the MCP server process
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error}\n`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}\n`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('CCLSP Server running on stdio\n');

  // Preload LSP servers for file types found in the project
  try {
    await lspClient.preloadServers();
  } catch (error) {
    logger.error(`Failed to preload LSP servers: ${error}\n`);
  }
}

main().catch((error) => {
  logger.error(`Server error: ${error}\n`);
  lspClient.dispose();
  process.exit(1);
});
