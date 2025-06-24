# lsmcp

MCP (Model Context Protocol) server that bridges Language Server Protocol (LSP) functionality to MCP tools. It allows MCP clients to access LSP features like "go to definition" and "find references" through a standardized interface.

## Features

- **Go to Definition**: Find where symbols are defined
- **Find References**: Locate all references to a symbol
- **Multi-language Support**: Configurable LSP servers for different file types
- **TypeScript**: Built-in support via typescript-language-server
- **Python**: Support via python-lsp-server (pylsp)
- **Go**: Support via gopls
- **And many more**: Extensive language server configurations

## Installation

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run the server
bun run start
```

## Usage

### As MCP Server

Configure in your MCP client (e.g., Claude Code):

```json
{
  "mcpServers": {
    "lsmcp": {
      "command": "node",
      "args": ["/path/to/lsmcp/dist/index.js"],
      "env": {
        "LSMCP_CONFIG_PATH": "/path/to/your/lsmcp.json"
      }
    }
  }
}
```

### Configuration

Create an `lsmcp.json` configuration file:

```json
{
  "servers": [
    {
      "extensions": ["py", "pyi"],
      "command": ["uvx", "--from", "python-lsp-server", "pylsp"],
      "rootDir": "."
    },
    {
      "extensions": ["js", "ts", "jsx", "tsx"],
      "command": ["npx", "--", "typescript-language-server", "--stdio"],
      "rootDir": "."
    }
  ]
}
```

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Run manual integration test
bun run test:manual

# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run typecheck
```

## MCP Tools

The server exposes these MCP tools:

### `find_definition`

Find the definition of a symbol at a specific position.

**Parameters:**
- `file_path`: Absolute path to the file
- `line`: Line number (0-based)
- `character`: Character position (0-based)

### `find_references`

Find all references to a symbol at a specific position.

**Parameters:**
- `file_path`: Absolute path to the file  
- `line`: Line number (0-based)
- `character`: Character position (0-based)
- `include_declaration`: Whether to include the declaration (optional, default: true)

## License

MIT