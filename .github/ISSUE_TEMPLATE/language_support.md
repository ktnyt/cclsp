---
name: Language support request
about: Request support for a new programming language
title: '[LANG] Add support for '
labels: 'enhancement, language-support'
assignees: ''

---

## Language Information
- **Language name**: 
- **File extensions**: [e.g. .rs, .rust]
- **LSP server name**: 
- **LSP server repository/website**: 

## Installation
How to install the language server:
```bash
# Example: npm install -g rust-analyzer
```

## Configuration
Suggested configuration for `cclsp.json`:
```json
{
  "extensions": ["rs"],
  "command": ["rust-analyzer"],
  "rootDir": "."
}
```

## Testing
Have you tested this configuration locally?
- [ ] Yes, it works
- [ ] Yes, but with issues (describe below)
- [ ] No, I haven't tested it

## Additional requirements
Does this language server need any special:
- Environment variables?
- Initialization options?
- Project setup (e.g., config files)?

## Example use cases
What LSP features are most important for this language?
- [ ] Go to definition
- [ ] Find references
- [ ] Rename symbol
- [ ] Other: 

## Notes
Any other information about this language server that would be helpful.