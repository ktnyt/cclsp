# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2025-06-30

### Added

- **Vue.js Language Server Support**: Added official Vue.js language server (Volar) configuration
- **Svelte Language Server Support**: Added Svelte language server configuration 
- Support for `.vue` and `.svelte` file extensions in setup wizard
- Installation guides and auto-install commands for Vue.js and Svelte language servers

### Maintenance

- Cleaned up temporary test files (`test-example.ts`, `test-mcp.mjs`, `test-rename.ts`)

## [0.4.2] - 2025-06-29

### Added

- **LSP Server Auto-Restart**: Added `restartInterval` option to server configuration for automatic LSP server restarts to prevent long-running server degradation
- Configurable restart intervals in minutes with minimum 0.1 minute (6 seconds) for testing
- Comprehensive test coverage for restart functionality including timer setup, configuration validation, and cleanup

### Enhanced

- Improved LSP server stability for long-running sessions, particularly beneficial for Python Language Server (pylsp)
- Updated documentation with configuration examples and restart interval guidelines
- **Setup Wizard Improvements**: Enhanced file extension detection with comprehensive .gitignore support
- Improved project structure scanning to exclude common build artifacts, dependencies, and temporary files
- Better accuracy in detecting project's primary programming languages for LSP server configuration

## [0.4.1] - 2025-06-28

### Added

- **Intelligent symbol kind fallback**: When a specific `symbol_kind` is specified but no matches are found, automatically search all symbol types and return results with descriptive warning messages
- Enhanced user experience for LLM-based tools that may specify incorrect symbol kinds
- Comprehensive test coverage for all fallback scenarios

### Fixed

- Improved robustness of symbol searches when exact kind matches are not available

## [0.4.0] - 2025-06-28

### Changed

- **BREAKING**: Complete redesign of MCP tool API from position-based to symbol name/kind-based lookup
- `find_definition` now accepts `symbol_name` and `symbol_kind` instead of `line` and `character`
- `find_references` now accepts `symbol_name` and `symbol_kind` instead of `line` and `character`
- `rename_symbol` now accepts `symbol_name` and `symbol_kind` instead of `line` and `character`
- Enhanced LSP stderr forwarding directly to MCP stderr for better debugging
- Improved position accuracy for `SymbolInformation` with file content analysis

### Added

- `textDocument/documentSymbol` LSP functionality for comprehensive symbol discovery
- Automatic symbol matching by name and kind for improved LLM accuracy
- `rename_symbol_strict` tool for precise position-based renaming when multiple matches exist
- Symbol kind validation with helpful error messages listing valid options
- Comprehensive debug logging throughout the symbol resolution pipeline
- File content analysis for precise symbol position detection in `SymbolInformation`
- Enhanced pylsp configuration with jedi plugin settings for Python support
- Invalid symbol kind warnings embedded in response text instead of breaking execution

### Fixed

- Position accuracy issues with Python Language Server (pylsp) symbol detection
- Character position estimation for better symbol name targeting

## [0.3.5] - 2025-06-28

### Changed

- **BREAKING**: Removed `use_zero_index` option from all MCP tools
- Tools now automatically try multiple position combinations (line±1, character±1) to handle different indexing conventions
- Enhanced error messages with better debugging information
- Results show which position combination was successful

### Added

- Multi-position symbol resolution for better compatibility with different editors and LSP implementations
- Comprehensive test suite for multi-position functionality

## [0.3.4] - 2025-06-28

### Fixed

- Fixed setup command to use `npx cclsp@latest` instead of `npx cclsp` for MCP configuration
- Updated all documentation to consistently use `npx cclsp@latest` for better version control

## [0.3.3] - 2025-06-28

### Changed

- MCP tools now use 1-based indexing by default for both line and character positions
- Tool parameter `character` now defaults to 1-indexed (human-readable) instead of 0-indexed
- Added `use_zero_index` parameter to all tools for backward compatibility with 0-based indexing
- Updated tool descriptions to clearly indicate indexing behavior

### Added

- Comprehensive test coverage for 1-based and 0-based indexing behavior
- Character position conversion tests for all MCP tools
- Edge case testing for character indexing boundaries

## [0.3.2] - 2025-06-27

### Fixed

- Improved CI/CD version detection for npm publishing
- Replaced git-based version change detection with npm registry comparison
- Enhanced logging for version comparison process in CI workflow

## [0.3.1] - 2025-06-27

### Fixed

- `npx cclsp@latest setup` command now executes properly without hanging
- Setup subcommand execution flow and error handling
- Eliminated duplicate execution when running setup via `node dist/index.js setup`
- Streamlined build process by removing separate setup.js compilation

## [0.3.0]

### Added

- Interactive configuration generator with `cclsp setup` command
- Support for 15 language servers (TypeScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, C#, Swift, Kotlin, Dart, Elixir, Haskell, Lua)
- Emacs-style keyboard navigation (Ctrl+P/Ctrl+N) for setup interface
- Automatic installation instructions display for selected language servers
- Configuration file preview and validation
- Comprehensive test suite for setup functionality
- GitHub issue templates for bug reports, feature requests, language support, and questions
- `CONTRIBUTING.md` with detailed contribution guidelines
- `CODE_OF_CONDUCT.md` following Contributor Covenant
- `SECURITY.md` with security policy and reporting guidelines
- `ROADMAP.md` outlining project vision and planned features
- GitHub Actions CI/CD pipeline for automated testing and npm publishing
- Additional badges in README (CI status, npm downloads, PRs welcome)
- Comprehensive troubleshooting section in README
- Real-world usage examples in README

### Changed

- Enhanced README with better structure and more detailed documentation
- Improved project metadata for better npm discoverability

## [0.2.1]

### Added

- `rename_symbol` MCP tool for refactoring symbols across codebases
- Enhanced error handling for LSP server failures

### Changed

- Improved documentation clarity for tool outputs
- Better type safety in tool interfaces

## [0.2.0]

### Added

- npm publishing configuration
- Executable binary support (`cclsp` command)
- Proper package.json metadata
- Installation instructions in README

### Changed

- Project renamed from `lsmcp` to `cclsp` for better clarity
- Updated all references and documentation

## [0.1.0]

### Added

- Initial implementation of MCP server for LSP functionality
- `find_definition` tool for locating symbol definitions
- `find_references` tool for finding all symbol references
- Support for multiple language servers via configuration
- TypeScript language server as default
- Basic error handling and logging
- Test suite with Bun
- Documentation for setup and usage

[0.2.1]: https://github.com/ktnyt/cclsp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ktnyt/cclsp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ktnyt/cclsp/releases/tag/v0.1.0
