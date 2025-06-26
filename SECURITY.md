# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of cclsp seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please do NOT:
- Open a public issue
- Post about it on social media
- Exploit the vulnerability

### Please DO:
- Email us at [INSERT SECURITY EMAIL] with details
- Include steps to reproduce if possible
- Allow us reasonable time to respond and fix the issue

### What to expect:
1. **Acknowledgment**: We'll acknowledge receipt within 48 hours
2. **Assessment**: We'll assess the vulnerability and determine its impact
3. **Fix**: We'll work on a fix and coordinate a release
4. **Disclosure**: We'll publicly disclose the issue after the fix is released

## Security Considerations

### Language Server Protocol (LSP) Servers

cclsp spawns external LSP server processes based on configuration. Users should:

1. **Trust your LSP servers**: Only use LSP servers from trusted sources
2. **Review configurations**: Carefully review any shared `cclsp.json` configurations
3. **Use official servers**: Prefer official language servers when available

### Configuration Security

- Never include sensitive information in `cclsp.json`
- Be cautious with configurations that execute arbitrary commands
- Review command arguments carefully

### MCP Protocol Security

cclsp follows MCP protocol security best practices:
- No arbitrary code execution without explicit configuration
- Clear boundaries between tool capabilities
- Transparent operation logging

## Best Practices for Users

1. **Keep cclsp updated**: Always use the latest version
2. **Audit configurations**: Review `cclsp.json` before using
3. **Use trusted sources**: Only install language servers from official sources
4. **Report issues**: If something seems wrong, report it immediately

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be acknowledged here unless they prefer to remain anonymous.