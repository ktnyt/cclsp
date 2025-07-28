# Common CCLSP Usage Patterns

This document outlines common usage patterns for the CCLSP MCP server in development workflows.

## Table of Contents
1. [Basic Symbol Navigation](#basic-symbol-navigation)
2. [Code Exploration](#code-exploration)
3. [Refactoring](#refactoring)
4. [Debugging and Diagnostics](#debugging-and-diagnostics)
5. [API Documentation](#api-documentation)

## Basic Symbol Navigation

### Finding Symbol Definitions

Find where a function, class, or variable is defined:

```
find_definition:
  file_path: "src/index.ts"
  symbol_name: "processRequest"
  symbol_kind: "function"  # optional, helps narrow results
```

### Finding All References

Locate all places where a symbol is used:

```
find_references:
  file_path: "src/models/user.ts"
  symbol_name: "User"
  symbol_kind: "class"
  include_declaration: true  # include the definition location
```

## Code Exploration

### Exploring Class Structure

Get all members (properties and methods) of a class:

```
get_class_members:
  file_path: "src/services/api.ts"
  class_name: "ApiService"
```

This returns:
- All properties with their types
- All methods with their signatures
- Member visibility (public/private/protected)
- Location information for each member

### Understanding Method Signatures

Get detailed method signature information including parameters and return types:

```
get_method_signature:
  file_path: "src/utils/helpers.ts"
  method_name: "formatDate"
  class_name: "DateFormatter"  # optional, for class methods
```

Returns:
- Full method signature with parameter types
- Return type information
- JSDoc comments if available
- Overload signatures if applicable

## Refactoring

### Safe Symbol Renaming

Rename symbols across the entire codebase:

```
# For unique symbols
rename_symbol:
  file_path: "src/config.ts"
  symbol_name: "oldConfigName"
  new_name: "newConfigName"

# For ambiguous symbols (multiple matches)
rename_symbol_strict:
  file_path: "src/config.ts"
  line: 42
  character: 10
  new_name: "newConfigName"
```

## Debugging and Diagnostics

### Getting File Diagnostics

Check for errors, warnings, and hints in a file:

```
get_diagnostics:
  file_path: "src/components/button.tsx"
```

Returns:
- Syntax errors
- Type errors
- Linting warnings
- Code hints and suggestions
- Exact location of each issue

## API Documentation

### Complete Workflow Example

Here's a complete workflow for exploring and understanding an API:

1. **Find the main API class**:
   ```
   find_definition:
     file_path: "src/index.ts"
     symbol_name: "ApiClient"
     symbol_kind: "class"
   ```

2. **Explore its structure**:
   ```
   get_class_members:
     file_path: "src/api/client.ts"
     class_name: "ApiClient"
   ```

3. **Get method details**:
   ```
   get_method_signature:
     file_path: "src/api/client.ts"
     method_name: "request"
     class_name: "ApiClient"
   ```

4. **Find usage examples**:
   ```
   find_references:
     file_path: "src/api/client.ts"
     symbol_name: "request"
     symbol_kind: "method"
   ```

## Best Practices

1. **Use symbol_kind when available**: This helps narrow down results and improves accuracy.

2. **Check diagnostics before refactoring**: Run `get_diagnostics` to ensure the file is error-free before making changes.

3. **Use strict mode for ambiguous renames**: If `rename_symbol` returns multiple candidates, use `rename_symbol_strict` with specific coordinates.

4. **Combine tools for comprehensive understanding**: Use `get_class_members` followed by `get_method_signature` for complete API documentation.

5. **Verify LSP server configuration**: Ensure the appropriate language server is configured for your file types in `cclsp.json`.

## Troubleshooting

If tools return no results:
1. Verify the file path is correct and absolute
2. Check that the appropriate LSP server is configured for the file type
3. Ensure the symbol name is spelled correctly
4. Try without `symbol_kind` parameter for broader search
5. Check server logs for any LSP errors

## Language-Specific Notes

### TypeScript/JavaScript
- Supports JSDoc comments in hover information
- Handles type aliases and interfaces
- Works with both `.ts` and `.tsx` files

### Python
- Returns type hints when available
- Supports docstring information
- Works with virtual environments when configured

### Go
- Provides interface implementation information
- Includes package documentation
- Supports workspace modules