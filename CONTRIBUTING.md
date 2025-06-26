# Contributing to cclsp

First off, thank you for considering contributing to cclsp! It's people like you that make cclsp such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please use our [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include as many details as possible.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Use our [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) to describe your idea.

### Adding Language Support

One of the most valuable contributions is adding support for new language servers. Use our [language support template](.github/ISSUE_TEMPLATE/language_support.md) to propose new language integrations.

### Your First Code Contribution

Unsure where to begin contributing? You can start by looking through these issues:

- Issues labeled with `good first issue` - these should be relatively simple to implement
- Issues labeled with `help wanted` - these are often more involved but are areas where we need help

## Development Process

### Prerequisites

- Node.js 18+ or Bun runtime
- Git
- Your favorite code editor

### Setting Up Your Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/cclsp.git
   cd cclsp
   ```

3. Install dependencies:
   ```bash
   bun install
   ```

4. Create a branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Development Workflow

1. Make your changes
2. Add or update tests as needed
3. Run the test suite:
   ```bash
   bun test
   ```

4. Run linting and formatting:
   ```bash
   bun run lint
   bun run format
   bun run typecheck
   ```

5. Test your changes manually:
   ```bash
   bun run dev
   ```

### Testing New Language Servers

When adding support for a new language server:

1. Install the language server locally
2. Add configuration to `cclsp.json`
3. Create test files in the target language
4. Test all three main features:
   - Go to definition
   - Find references
   - Rename symbol

### Commit Messages

We use conventional commits with gitmoji for better readability:

- ✨ `:sparkles:` feat: New feature
- 🐛 `:bug:` fix: Bug fix
- 📚 `:books:` docs: Documentation changes
- ♻️ `:recycle:` refactor: Code refactoring
- ✅ `:white_check_mark:` test: Adding tests
- 🎨 `:art:` style: Code style changes
- ⚡ `:zap:` perf: Performance improvements

Example:
```
✨ feat: add support for Ruby language server

- Add configuration for solargraph
- Test go to definition and find references
- Update README with Ruby examples
```

### Pull Request Process

1. Ensure all tests pass and there are no linting errors
2. Update the README.md with details of changes if applicable
3. Add yourself to the contributors list if this is your first contribution
4. Create a Pull Request with a clear title and description
5. Link any related issues

### Code Review Process

- All submissions require review from at least one maintainer
- We may suggest changes or improvements
- Please be patient as reviews may take time
- Once approved, a maintainer will merge your PR

## Project Structure

```
cclsp/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── lsp-client.ts     # LSP client implementation
│   └── *.test.ts         # Test files
├── dist/                 # Compiled output (gitignored)
├── .github/              # GitHub specific files
├── package.json          # Package configuration
└── tsconfig.json         # TypeScript configuration
```

## Style Guide

### TypeScript Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use functional programming patterns where appropriate
- Add types to all function parameters and return values
- Use meaningful variable and function names

### Code Organization

- Keep files focused on a single responsibility
- Export types and interfaces separately
- Group related functionality together
- Add JSDoc comments for public APIs

## Recognition

Contributors will be recognized in the following ways:

- Added to the contributors section in README
- Mentioned in release notes for significant contributions
- Given credit in commit messages when their ideas are implemented

## Questions?

Feel free to open an issue with the `question` label or start a discussion in [GitHub Discussions](https://github.com/ktnyt/cclsp/discussions).

Thank you for contributing! 🎉