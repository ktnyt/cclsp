# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2025-06-27

### Fixed

- Improved CI/CD version detection for npm publishing
- Replaced git-based version change detection with npm registry comparison
- Enhanced logging for version comparison process in CI workflow

## [0.3.1] - 2025-06-27

### Fixed

- `npx cclsp setup` command now executes properly without hanging
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
