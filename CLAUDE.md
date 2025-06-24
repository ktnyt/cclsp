# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

lsmcp is an MCP (Model Context Protocol) server that bridges Language Server Protocol (LSP) functionality to MCP tools. It allows MCP clients to access LSP features like "go to definition" and "find references" through a standardized interface.

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
```

## Architecture

### Core Components

**MCP Server Layer** (`index.ts`)

- Entry point that implements MCP protocol
- Exposes `find_definition` and `find_references` tools
- Handles MCP client requests and delegates to LSP layer

**LSP Client Layer** (`src/lsp-client.ts`)

- Manages multiple LSP server processes concurrently
- Handles LSP protocol communication (JSON-RPC over stdio)
- Maps file extensions to appropriate language servers
- Maintains process lifecycle and request/response correlation

**Configuration System** (`lsmcp.config.json`)

- Defines which LSP servers to use for different file extensions
- Supports environment-based config via `LSMCP_CONFIG_PATH` env var
- Falls back to default TypeScript server if no config found

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

1. `LSMCP_CONFIG_PATH` environment variable (JSON string)
2. `lsmcp.config.json` file in working directory
3. Default TypeScript-only configuration

Each server config requires:

- `extensions`: File extensions to handle
- `command`: Command array to spawn LSP server
- `rootDir`: Working directory for LSP server (optional)

## LSP Protocol Details

The implementation handles LSP protocol specifics:

- Content-Length headers for message framing
- JSON-RPC 2.0 message format
- Request/response correlation via ID tracking
- Server initialization handshake
- Proper process cleanup on shutdown

