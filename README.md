# cclsp - not your average LSP adapter

[![npm version](https://badge.fury.io/js/cclsp.svg)](https://www.npmjs.com/package/cclsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/cclsp.svg)](https://nodejs.org)
[![CI](https://github.com/ktnyt/cclsp/actions/workflows/ci.yml/badge.svg)](https://github.com/ktnyt/cclsp/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/cclsp.svg)](https://www.npmjs.com/package/cclsp)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**cclsp** is a Model Context Protocol (MCP) server that seamlessly integrates LLM-based coding agents with Language Server Protocol (LSP) servers. LLM-based coding agents often struggle with providing accurate line/column numbers, which makes naive attempts to integrate with LSP servers fragile and frustrating. cclsp solves this by intelligently trying multiple position combinations and providing robust symbol resolution that just works, no matter how your AI assistant counts lines.

## Setup & Usage Demo

https://github.com/user-attachments/assets/52980f32-64d6-4b78-9cbf-18d6ae120cdd

## Table of Contents

- [Why cclsp?](#why-cclsp)
- [Features](#features)
- [📋 Prerequisites](#-prerequisites)
- [⚡ Setup](#-setup)
  - [Automated Setup (Recommended)](#automated-setup-recommended)
  - [Claude Code Quick Setup](#claude-code-quick-setup)
  - [Manual Setup](#manual-setup)
  - [Language Server Installation](#language-server-installation)
  - [Verification](#verification)
- [🚀 Usage](#-usage)
  - [As MCP Server](#as-mcp-server)
  - [Configuration](#configuration)
- [🛠️ Development](#️-development)
- [🔧 MCP Tools](#-mcp-tools)
  - [`find_definition`](#find_definition)
  - [`find_references`](#find_references)
  - [`rename_symbol`](#rename_symbol)
  - [`get_diagnostics`](#get_diagnostics)
  - [`get_class_members`](#get_class_members)
  - [`get_method_signature`](#get_method_signature)
- [💡 Real-world Examples](#-real-world-examples)
  - [Finding Function Definitions](#finding-function-definitions)
  - [Finding All References](#finding-all-references)
  - [Renaming Symbols](#renaming-symbols)
- [🔍 Troubleshooting](#-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## Why cclsp?

When using AI-powered coding assistants like Claude, you often need to navigate codebases to understand symbol relationships. **cclsp** bridges the gap between Language Server Protocol capabilities and Model Context Protocol, enabling:

- 🔍 **Instant symbol navigation** - Jump to definitions without manually searching
- 📚 **Complete reference finding** - Find all usages of functions, variables, and types
- ✏️ **Safe symbol renaming** - Rename across entire codebases with confidence
- 🌍 **Universal language support** - Works with any LSP-compatible language server
- 🤖 **AI-friendly interface** - Designed for LLMs to understand and use effectively

## Features

- **Go to Definition**: Find where symbols are defined
- **Find References**: Locate all references to a symbol
- **Class Exploration**: List all members of a class with their types
- **Method Signatures**: Get full method signatures with parameters and return types
- **Code Diagnostics**: Get errors, warnings, and hints for your code
- **Multi-language Support**: Configurable LSP servers for different file types
- **TypeScript**: Built-in support via typescript-language-server
- **Python**: Support via python-lsp-server (pylsp)
- **Go**: Support via gopls
- **And many more**: Extensive language server configurations

## 📋 Prerequisites

- Node.js 18+ or Bun runtime
- Language servers for your target languages (installed separately)

## ⚡ Setup

cclsp provides an interactive setup wizard that automates the entire configuration process. Choose your preferred method:

### Automated Setup (Recommended)

Run the interactive setup wizard:

```bash
# One-time setup (no installation required)
npx cclsp@latest setup

# For user-wide configuration
npx cclsp@latest setup --user
```

The setup wizard will:

1. **🔍 Auto-detect languages** in your project by scanning files
2. **📋 Show pre-selected LSP servers** based on detected languages
3. **📦 Display installation requirements** with detailed guides
4. **⚡ Install LSPs automatically** (optional, with user confirmation)
5. **🔗 Add to Claude MCP** (optional, with user confirmation)
6. **✅ Verify setup** and show available tools

#### Setup Options

- **Project Configuration** (default): Creates `.claude/cclsp.json` in current directory
- **User Configuration** (`--user`): Creates global config in `~/.config/claude/cclsp.json`

### Manual Setup

If you prefer manual configuration:

1. **Install cclsp**:

   ```bash
   npm install -g cclsp
   ```

2. **Install language servers** (see [Language Server Installation](#language-server-installation))

3. **Create configuration file**:

   ```bash
   # Use the interactive generator
   cclsp setup

   # Or create manually (see Configuration section)
   ```

4. **Add to Claude MCP**:
   ```bash
   claude mcp add cclsp npx cclsp@latest --env CCLSP_CONFIG_PATH=/path/to/cclsp.json
   ```

### Language Server Installation

The setup wizard shows installation commands for each LSP, but you can also install them manually:

<details>
<summary>📦 Common Language Servers</summary>

#### TypeScript/JavaScript

```bash
npm install -g typescript-language-server typescript
```

#### Python

```bash
pip install "python-lsp-server[all]"
# Or basic installation: pip install python-lsp-server
```

#### Go

```bash
go install golang.org/x/tools/gopls@latest
```

#### Rust

```bash
rustup component add rust-analyzer
rustup component add rust-src
```

#### C/C++

```bash
# Ubuntu/Debian
sudo apt install clangd

# macOS
brew install llvm

# Windows: Download from LLVM releases
```

#### Ruby

```bash
gem install solargraph
```

#### PHP

```bash
npm install -g intelephense
```

For more languages and detailed instructions, run `npx cclsp@latest setup` and select "Show detailed installation guides".

</details>

## 🚀 Usage

### As MCP Server

Configure in your MCP client (e.g., Claude Code):

#### Using npm package (after global install)

```json
{
  "mcpServers": {
    "cclsp": {
      "command": "cclsp",
      "env": {
        "CCLSP_CONFIG_PATH": "/path/to/your/cclsp.json"
      }
    }
  }
}
```

#### Using local installation

```json
{
  "mcpServers": {
    "cclsp": {
      "command": "node",
      "args": ["/path/to/cclsp/dist/index.js"],
      "env": {
        "CCLSP_CONFIG_PATH": "/path/to/your/cclsp.json"
      }
    }
  }
}
```

### Configuration

#### Interactive Configuration Generator

For easy setup, use the interactive configuration generator:

```bash
# Using npx (recommended for one-time setup)
npx cclsp@latest setup

# If installed globally
cclsp setup

# Or run directly with the development version
bun run setup
```

The interactive tool will:

- Show you all available language servers
- Let you select which ones to configure with intuitive controls:
  - **Navigation**: ↑/↓ arrow keys or Ctrl+P/Ctrl+N (Emacs-style)
  - **Selection**: Space to toggle, A to toggle all, I to invert selection
  - **Confirm**: Enter to proceed
- Display installation instructions for your selected languages
- Generate the configuration file automatically
- Show you the final configuration

#### Manual Configuration

Alternatively, create an `cclsp.json` configuration file manually:

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

<details>
<summary>📋 More Language Server Examples</summary>

```json
{
  "servers": [
    {
      "extensions": ["go"],
      "command": ["gopls"],
      "rootDir": "."
    },
    {
      "extensions": ["rs"],
      "command": ["rust-analyzer"],
      "rootDir": "."
    },
    {
      "extensions": ["c", "cpp", "cc", "h", "hpp"],
      "command": ["clangd"],
      "rootDir": "."
    },
    {
      "extensions": ["java"],
      "command": ["jdtls"],
      "rootDir": "."
    },
    {
      "extensions": ["rb"],
      "command": ["solargraph", "stdio"],
      "rootDir": "."
    },
    {
      "extensions": ["php"],
      "command": ["intelephense", "--stdio"],
      "rootDir": "."
    },
    {
      "extensions": ["cs"],
      "command": ["omnisharp", "-lsp"],
      "rootDir": "."
    },
    {
      "extensions": ["swift"],
      "command": ["sourcekit-lsp"],
      "rootDir": "."
    }
  ]
}
```

</details>

## 🛠️ Development

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

## 🔧 MCP Tools

The server exposes these MCP tools:

### `find_definition`

Find the definition of a symbol at a specific position. Returns line/character numbers as 1-based for human readability.

**Parameters:**

- `file_path`: Absolute path to the file
- `line`: Line number (1-indexed by default; set `use_zero_index` to use 0-based indexing)
- `character`: Character position (0-based)
- `use_zero_index`: If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input (optional, default: false)

### `find_references`

Find all references to a symbol at a specific position. Returns line/character numbers as 1-based for human readability.

**Parameters:**

- `file_path`: Absolute path to the file
- `line`: Line number (1-indexed by default; set `use_zero_index` to use 0-based indexing)
- `character`: Character position (0-based)
- `include_declaration`: Whether to include the declaration (optional, default: true)
- `use_zero_index`: If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input (optional, default: false)

### `rename_symbol`

Rename a symbol at a specific position in a file. Returns the file changes needed to rename the symbol across the codebase.

**Parameters:**

- `file_path`: Absolute path to the file
- `line`: Line number (1-indexed by default; set `use_zero_index` to use 0-based indexing)
- `character`: Character position (0-based)
- `new_name`: The new name for the symbol
- `use_zero_index`: If true, use line number as-is (0-indexed); otherwise subtract 1 for 1-indexed input (optional, default: false)

### `get_diagnostics`

Get language diagnostics (errors, warnings, hints) for a file. Supports both pull-based (textDocument/diagnostic) and push-based (textDocument/publishDiagnostics) diagnostic reporting for maximum compatibility with different LSP servers.

**Parameters:**
- `file_path`: The path to the file

### `get_class_members`

List all properties and methods of a class. Returns members with their types and signatures using LSP hover information, including namespace/package information and detailed parameter types.

**Parameters:**
- `file_path`: The path to the file containing the class
- `class_name`: The name of the class

**Enhanced Response Includes:**
- Full type signatures with documentation
- Namespace and package information for imported types
- Parameter details including names, types, optional flags, and default values
- Return type information for methods

### `get_method_signature`

Show full method definition with parameters and return type using LSP hover information. Particularly useful for understanding API methods and their expected parameters.

**Parameters:**
- `file_path`: The path to the file containing the method
- `method_name`: The name of the method
- `class_name`: Optional - The name of the class containing the method (helps narrow results)

**Enhanced Response Includes:**
- Complete method signature with all type information
- Parsed parameter details with types and default values
- Namespace/package information for complex types
- Documentation comments when available

## 💡 Real-world Examples

### Finding Function Definitions

When Claude needs to understand how a function works:

```
Claude: Let me find the definition of the `processRequest` function
> Using cclsp.find_definition at line 42, character 15

Result: Found definition at src/handlers/request.ts:127
```

### Finding All References

When refactoring or understanding code impact:

```
Claude: I'll find all places where `CONFIG_PATH` is used
> Using cclsp.find_references at line 10, character 20

Results: Found 5 references:
- src/config.ts:10 (declaration)
- src/index.ts:45
- src/utils/loader.ts:23
- tests/config.test.ts:15
- tests/config.test.ts:89
```

### Renaming Symbols

Safe refactoring across the entire codebase:

```
Claude: I'll rename `getUserData` to `fetchUserProfile`
> Using cclsp.rename_symbol at line 55, character 10

Result: 12 files will be updated with the new name
```

### Checking File Diagnostics

When analyzing code quality:

```
Claude: Let me check for any errors or warnings in this file
> Using cclsp.get_diagnostics

Results: Found 3 diagnostics:
- Error [TS2304]: Cannot find name 'undefinedVar' (Line 10, Column 5)
- Warning [no-unused-vars]: 'config' is defined but never used (Line 25, Column 10)
- Hint: Consider using const instead of let (Line 30, Column 1)
```

### Exploring Class Structure

When understanding API architecture:

```
Claude: Let me explore the ApiService class structure
> Using cclsp.get_class_members for class "ApiService"

Results: Found 8 members in class "ApiService":
• constructor (constructor) at src/services/api.ts:10:3
• baseUrl (property) at src/services/api.ts:12:3
  private baseUrl: string
  Type: string
• request (method) at src/services/api.ts:20:3
  async request<T>(endpoint: string, options?: RequestOptions): Promise<T>
  Parameters:
    - endpoint: string
    - options?: RequestOptions
  Returns: Promise<T>
• get (method) at src/services/api.ts:35:3
  async get<T>(endpoint: string): Promise<T>
  Parameters:
    - endpoint: string
  Returns: Promise<T>
• post (method) at src/services/api.ts:40:3
  async post<T>(endpoint: string, data: unknown): Promise<T>
  Parameters:
    - endpoint: string
    - data: unknown
  Returns: Promise<T>
```

### Getting Method Signatures

When understanding function APIs:

```
Claude: I need to understand the formatDate method signature
> Using cclsp.get_method_signature for method "formatDate"

Method: formatDate at src/utils/date.ts:15:10
formatDate(date: Date | string, format?: string): string

Type Details:
  Parameters:
    - date: Date | string
    - format?: string = "YYYY-MM-DD"
  Returns: string
```

## 🔍 Troubleshooting

### Known Issues

<details>
<summary>🐍 Python LSP Server (pylsp) Performance Degradation</summary>

**Problem**: The Python Language Server (pylsp) may become slow or unresponsive after extended use (several hours), affecting symbol resolution and code navigation.

**Symptoms**:
- Slow or missing "go to definition" results for Python files
- Delayed or incomplete symbol references
- General responsiveness issues with Python code analysis

**Solution**: Use the auto-restart feature to periodically restart the pylsp server:

Add `restartInterval` to your Python server configuration:

```json
{
  "servers": [
    {
      "extensions": ["py", "pyi"],
      "command": ["pylsp"],
      "restartInterval": 5
    }
  ]
}
```

This will automatically restart the Python LSP server every 5 minutes, maintaining optimal performance for long coding sessions.

**Note**: The setup wizard automatically configures this for Python servers when detected.

</details>

### Common Issues

<details>
<summary>🔧 LSP server not starting</summary>

**Problem**: Error message about LSP server not found

**Solution**: Ensure the language server is installed:

```bash
# For TypeScript
npm install -g typescript-language-server

# For Python
pip install python-lsp-server

# For Go
go install golang.org/x/tools/gopls@latest
```

</details>

<details>
<summary>🔧 Configuration not loading</summary>

**Problem**: cclsp uses default TypeScript configuration only

**Solution**: Check that:

1. Your config file is named `cclsp.json` (not `cclsp.config.json`)
2. The `CCLSP_CONFIG_PATH` environment variable points to the correct file
3. The JSON syntax is valid
</details>

<details>
<summary>🔧 Symbol not found errors</summary>

**Problem**: "Go to definition" returns no results

**Solution**:

1. Ensure the file is saved and part of the project
2. Check that the language server supports the file type
3. Some language servers need a few seconds to index the project
</details>

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/ktnyt/cclsp/issues) with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node version, etc.)

### Adding Language Support

Want to add support for a new language?

1. Find the LSP server for your language
2. Test the configuration locally
3. Submit a PR with:
   - Updated README examples
   - Test files if possible
   - Configuration documentation

### Code Contributions

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `bun test`
5. Commit: `git commit -m '✨ feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

MIT
