---
name: security-review
description: >-
  Request a security expert assessment for code changes that touch child process
  spawning, file system access, configuration loading, or environment variable
  handling. Use when the Reviewer identifies security-sensitive changes in the
  MCP-LSP bridge.
compatibility: Designed for Claude Code (or similar products)
metadata:
  author: ktnyt
  version: "1.0"
---

# Security Review

Invoke the security-reviewer agent to assess security-sensitive changes.

## When to trigger

- Child process spawning or lifecycle changes (`src/lsp-client.ts`)
- File system read/write operations (`src/file-editor.ts`, `src/file-scanner.ts`)
- Configuration file loading or parsing (`cclsp.json`, `CCLSP_CONFIG_PATH`)
- Environment variable handling
- New or modified LSP server adapter (`src/lsp/adapters/`)
- Setup wizard input handling (`src/setup.ts`)

## Review checklist

1. **Command injection**: Are user-supplied values (config file paths, server
   commands) sanitized before being passed to `child_process` spawn?
2. **Path traversal**: Can file paths from LSP responses escape the project
   root? Are `file://` URIs validated before resolving?
3. **Resource exhaustion**: Are there timeouts on LSP server responses? Can a
   malicious LSP server cause unbounded memory growth?
4. **Config trust boundary**: Is `cclsp.json` treated as trusted input? What
   happens if it contains unexpected fields or types?
5. **Process cleanup**: Are child processes reliably terminated on shutdown?
   Can orphaned processes persist?
6. **Symlink attacks**: Does file resolution follow symlinks outside the
   project directory?

## How to invoke

Use the `everything-claude-code:security-reviewer` agent via the Task tool:

```
Task(
  subagent_type: "everything-claude-code:security-reviewer",
  prompt: "Review the following changes for security concerns: <describe changes>"
)
```

## Output expectations

The security reviewer should produce:

- **CRITICAL**: Must fix before merge (injection, traversal, credential leak)
- **HIGH**: Should fix before merge (missing timeouts, incomplete cleanup)
- **MEDIUM**: Fix when possible (defensive checks, hardening opportunities)
- **LOW**: Informational (best practice suggestions)
