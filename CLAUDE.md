# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cclsp is an MCP (Model Context Protocol) server that bridges Language Server Protocol (LSP) functionality to MCP tools. It allows MCP clients to access LSP features like "go to definition" and "find references" through a standardized interface.

## Development Commands

```bash
# Install dependencies
bun install

# Development with hot reload
bun run dev

# Build for production
bun run build

# Run the built server
bun run start
# or directly
node dist/index.js

# Run setup wizard to configure LSP servers
cclsp setup

# Quality assurance
bun run lint         # Check code style and issues
bun run lint:fix     # Auto-fix safe issues
bun run format       # Format code with Biome
bun run typecheck    # Run TypeScript type checking
bun run test         # Run unit tests
bun run test:manual  # Run manual MCP client test

# Full pre-publish check
npm run prepublishOnly  # build + test + typecheck
```

## Architecture

### Core Components

**MCP Server Layer** (`index.ts`)

- Entry point that implements MCP protocol
- Exposes `find_definition`, `find_references`, and `rename_symbol` tools
- Handles MCP client requests and delegates to LSP layer
- Includes subcommand handling for `cclsp setup`

**LSP Client Layer** (`src/lsp-client.ts`)

- Manages multiple LSP server processes concurrently
- Handles LSP protocol communication (JSON-RPC over stdio)
- Maps file extensions to appropriate language servers
- Maintains process lifecycle and request/response correlation

**Configuration System** (`cclsp.json` or via `CCLSP_CONFIG_PATH`)

- Defines which LSP servers to use for different file extensions
- Supports environment-based config via `CCLSP_CONFIG_PATH` env var
- Interactive setup wizard via `cclsp setup` command
- File scanning with gitignore support for project structure detection

### Data Flow

1. MCP client sends tool request (e.g., `find_definition`)
2. Main server resolves file path and extracts position
3. LSP client determines appropriate language server for file extension
4. If server not running, spawns new LSP server process
5. Sends LSP request to server and correlates response
6. Transforms LSP response back to MCP format

### LSP Server Management

The system spawns separate LSP server processes per configuration. Each server:

- Runs as child process with stdio communication
- Maintains its own initialization state
- Handles multiple concurrent requests
- Gets terminated on process exit

Supported language servers (configurable):

- TypeScript: `typescript-language-server`
- Python: `pylsp`
- Go: `gopls`

## Configuration

The server loads configuration in this order:

1. `CCLSP_CONFIG_PATH` environment variable pointing to config file
2. `cclsp.json` file in working directory
3. Fails if neither is found (no default fallback)

### Interactive Setup

Use `cclsp setup` to configure LSP servers interactively:

- Scans project for file extensions (respects .gitignore)
- Presents pre-configured language server options
- Generates `cclsp.json` configuration file
- Validates server availability before configuration

Each server config requires:

- `extensions`: File extensions to handle (array)
- `command`: Command array to spawn LSP server
- `rootDir`: Working directory for LSP server (optional)
- `restartInterval`: Auto-restart interval in minutes (optional, helps with long-running server stability, minimum 1 minute)

### Example Configuration

```json
{
  "servers": [
    {
      "extensions": ["py"],
      "command": ["pylsp"],
      "restartInterval": 5
    },
    {
      "extensions": ["ts", "tsx", "js", "jsx"],
      "command": ["typescript-language-server", "--stdio"],
      "restartInterval": 10
    }
  ]
}
```

## Code Quality & Testing

The project uses Biome for linting and formatting:

- **Linting**: Enabled with recommended rules + custom strictness
- **Formatting**: 2-space indents, single quotes, semicolons always, LF endings
- **TypeScript**: Strict type checking with `--noEmit`
- **Testing**: Bun test framework with unit tests in `src/*.test.ts`

Run quality checks before committing:

```bash
bun run lint:fix && bun run format && bun run typecheck && bun run test
```

## LSP Protocol Details

The implementation handles LSP protocol specifics:

- Content-Length headers for message framing
- JSON-RPC 2.0 message format
- Request/response correlation via ID tracking
- Server initialization handshake
- Proper process cleanup on shutdown
- Preloading of servers for detected file types
- Automatic server restart based on configured intervals
- Manual server restart via MCP tool

## Multi-Position Symbol Resolution

The MCP tools now automatically try multiple position combinations to handle different indexing conventions:

- `line-1/character-1`: Both line and character adjusted by -1
- `line/character-1`: Only character adjusted by -1  
- `line-1/character`: Only line adjusted by -1
- `line/character`: Original position as provided

When multiple positions yield results, all successful matches are returned with clear labels indicating which position combination worked. This eliminates the need for users to manually specify indexing preferences and provides better symbol resolution accuracy.

