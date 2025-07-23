import { afterEach, beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LSPClient } from './lsp-client.js';
import { SymbolKind } from './types.js';
import type { DocumentSymbol, SymbolInformation, SymbolMatch } from './types.js';

const TEST_DIR = process.env.RUNNER_TEMP
  ? `${process.env.RUNNER_TEMP}/cclsp-class-test`
  : '/tmp/cclsp-class-test';

const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json');

describe('Class Tools', () => {
  let client: LSPClient;

  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });

    // Create test config file
    const testConfig = {
      servers: [
        {
          extensions: ['ts', 'js', 'tsx', 'jsx'],
          command: ['npx', '--', 'typescript-language-server', '--stdio'],
          rootDir: TEST_DIR,
        },
      ],
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    // Wait for file system
    await new Promise((resolve) => setTimeout(resolve, 50));

    client = new LSPClient(TEST_CONFIG_PATH);
  });

  afterEach(() => {
    // Dispose of the client to prevent real LSP servers from running
    if (client) {
      client.dispose();
    }
  });

  describe('getClassMembers', () => {
    it('should return class members with hierarchical DocumentSymbol format', async () => {
      const testFilePath = join(TEST_DIR, 'test-class.ts');

      // Mock the DocumentSymbol response
      const mockDocumentSymbols: DocumentSymbol[] = [
        {
          name: 'TestClass',
          kind: SymbolKind.Class,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 15 },
          },
          children: [
            {
              name: 'constructor',
              kind: SymbolKind.Constructor,
              range: {
                start: { line: 1, character: 2 },
                end: { line: 3, character: 3 },
              },
              selectionRange: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 13 },
              },
            },
            {
              name: 'myProperty',
              kind: SymbolKind.Property,
              detail: 'myProperty: string',
              range: {
                start: { line: 4, character: 2 },
                end: { line: 4, character: 25 },
              },
              selectionRange: {
                start: { line: 4, character: 2 },
                end: { line: 4, character: 12 },
              },
            },
            {
              name: 'myMethod',
              kind: SymbolKind.Method,
              detail: '(): void',
              range: {
                start: { line: 6, character: 2 },
                end: { line: 8, character: 3 },
              },
              selectionRange: {
                start: { line: 6, character: 2 },
                end: { line: 6, character: 10 },
              },
            },
          ],
        },
      ];

      // Mock getDocumentSymbols
      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockDocumentSymbols
      );

      // Mock getHoverInfo to return type information
      const getHoverInfoSpy = spyOn(client as any, 'getHoverInfo').mockImplementation(
        (filePath: string, position: any) => {
          if (position.line === 4) {
            return Promise.resolve('myProperty: string');
          }
          if (position.line === 6) {
            return Promise.resolve('(method) TestClass.myMethod(): void');
          }
          return Promise.resolve(undefined);
        }
      );

      // Mock getSignatureHelp to prevent real LSP calls
      const getSignatureHelpSpy = spyOn(client as any, 'getSignatureHelp').mockResolvedValue(
        undefined
      );

      // Mock getTypeDefinition to prevent real LSP calls
      const getTypeDefinitionSpy = spyOn(client as any, 'getTypeDefinition').mockResolvedValue([]);

      const members = await client.getClassMembers(testFilePath, 'TestClass');

      expect(getDocumentSymbolsSpy).toHaveBeenCalledWith(testFilePath);
      expect(members).toHaveLength(3);

      // Check constructor
      expect(members[0]).toEqual({
        name: 'constructor',
        kind: SymbolKind.Constructor,
        position: { line: 1, character: 2 },
        range: {
          start: { line: 1, character: 2 },
          end: { line: 3, character: 3 },
        },
        detail: undefined,
        typeInfo: undefined,
      });

      // Check property with hover info
      expect(members[1]).toEqual({
        name: 'myProperty',
        kind: SymbolKind.Property,
        position: { line: 4, character: 2 },
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 25 },
        },
        detail: 'myProperty: string',
        typeInfo: {
          returnType: 'string',
        },
      });

      // Check method with hover info
      expect(members[2]).toEqual({
        name: 'myMethod',
        kind: SymbolKind.Method,
        position: { line: 6, character: 2 },
        range: {
          start: { line: 6, character: 2 },
          end: { line: 8, character: 3 },
        },
        detail: '(method) TestClass.myMethod(): void',
        typeInfo: {
          returnType: 'void',
          parameters: [],
        },
      });
    });

    it('should return class members with flat SymbolInformation format', async () => {
      const testFilePath = join(TEST_DIR, 'test-class.ts');

      // Mock the SymbolInformation response
      const mockSymbolInformation: SymbolInformation[] = [
        {
          name: 'TestClass',
          kind: SymbolKind.Class,
          location: {
            uri: `file://${testFilePath}`,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 10, character: 1 },
            },
          },
        },
        {
          name: 'myProperty',
          kind: SymbolKind.Property,
          containerName: 'TestClass',
          location: {
            uri: `file://${testFilePath}`,
            range: {
              start: { line: 4, character: 2 },
              end: { line: 4, character: 25 },
            },
          },
        },
        {
          name: 'myMethod',
          kind: SymbolKind.Method,
          containerName: 'TestClass',
          location: {
            uri: `file://${testFilePath}`,
            range: {
              start: { line: 6, character: 2 },
              end: { line: 8, character: 3 },
            },
          },
        },
      ];

      // Mock getDocumentSymbols
      const getDocumentSymbolsSpy = spyOn(client, 'getDocumentSymbols').mockResolvedValue(
        mockSymbolInformation
      );

      // Mock findSymbolPositionInFile
      const findSymbolPositionSpy = spyOn(
        client as any,
        'findSymbolPositionInFile'
      ).mockImplementation((filePath: string, symbol: SymbolInformation) => {
        if (symbol.name === 'myProperty') {
          return Promise.resolve({ line: 4, character: 2 });
        }
        if (symbol.name === 'myMethod') {
          return Promise.resolve({ line: 6, character: 2 });
        }
        return Promise.resolve({ line: 0, character: 0 });
      });

      // Mock getHoverInfo
      const getHoverInfoSpy = spyOn(client as any, 'getHoverInfo').mockImplementation(
        (filePath: string, position: any) => {
          if (position.line === 4) {
            return Promise.resolve('myProperty: string');
          }
          if (position.line === 6) {
            return Promise.resolve('(method) TestClass.myMethod(): void');
          }
          return Promise.resolve(undefined);
        }
      );

      // Mock getSignatureHelp to prevent real LSP calls
      const getSignatureHelpSpy = spyOn(client as any, 'getSignatureHelp').mockResolvedValue(
        undefined
      );

      // Mock getTypeDefinition to prevent real LSP calls
      const getTypeDefinitionSpy = spyOn(client as any, 'getTypeDefinition').mockResolvedValue([]);

      const members = await client.getClassMembers(testFilePath, 'TestClass');

      expect(getDocumentSymbolsSpy).toHaveBeenCalledWith(testFilePath);
      expect(findSymbolPositionSpy).toHaveBeenCalledTimes(2);
      expect(members).toHaveLength(2);

      // Check property
      expect(members[0]).toEqual({
        name: 'myProperty',
        kind: SymbolKind.Property,
        position: { line: 4, character: 2 },
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 25 },
        },
        detail: 'myProperty: string',
        typeInfo: {
          returnType: 'string',
        },
      });

      // Check method
      expect(members[1]).toEqual({
        name: 'myMethod',
        kind: SymbolKind.Method,
        position: { line: 6, character: 2 },
        range: {
          start: { line: 6, character: 2 },
          end: { line: 8, character: 3 },
        },
        detail: '(method) TestClass.myMethod(): void',
        typeInfo: {
          returnType: 'void',
          parameters: [],
        },
      });
    });

    it('should return empty array when class not found', async () => {
      const testFilePath = join(TEST_DIR, 'test-class.ts');

      const mockDocumentSymbols: DocumentSymbol[] = [
        {
          name: 'OtherClass',
          kind: SymbolKind.Class,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 16 },
          },
        },
      ];

      spyOn(client, 'getDocumentSymbols').mockResolvedValue(mockDocumentSymbols);
      spyOn(client as any, 'getSignatureHelp').mockResolvedValue(undefined);
      spyOn(client as any, 'getTypeDefinition').mockResolvedValue([]);

      const members = await client.getClassMembers(testFilePath, 'NonExistentClass');

      expect(members).toHaveLength(0);
    });

    it('should include type definition location for properties', async () => {
      const testFilePath = join(TEST_DIR, 'test-class.ts');

      const mockDocumentSymbols: DocumentSymbol[] = [
        {
          name: 'TestClass',
          kind: SymbolKind.Class,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 15 },
          },
          children: [
            {
              name: 'breakType',
              kind: SymbolKind.Property,
              detail: 'BreakType',
              range: {
                start: { line: 2, character: 2 },
                end: { line: 2, character: 30 },
              },
              selectionRange: {
                start: { line: 2, character: 2 },
                end: { line: 2, character: 11 },
              },
            },
          ],
        },
      ];

      spyOn(client, 'getDocumentSymbols').mockResolvedValue(mockDocumentSymbols);

      // Mock getHoverInfo to return property type info
      spyOn(client as any, 'getHoverInfo').mockResolvedValue('breakType: BreakType');

      // Mock getTypeDefinition to return the type's definition location
      spyOn(client as any, 'getTypeDefinition').mockResolvedValue([
        {
          uri: 'file:///path/to/BreakType.cs',
          range: {
            start: { line: 9, character: 4 },
            end: { line: 20, character: 5 },
          },
        },
      ]);

      // Mock ensureFileOpen
      spyOn(client as any, 'ensureFileOpen').mockResolvedValue(undefined);

      const members = await client.getClassMembers(testFilePath, 'TestClass');

      expect(members).toHaveLength(1);
      expect(members[0]).toEqual({
        name: 'breakType',
        kind: SymbolKind.Property,
        position: { line: 2, character: 2 },
        range: {
          start: { line: 2, character: 2 },
          end: { line: 2, character: 30 },
        },
        detail: 'breakType: BreakType',
        typeInfo: {
          returnType: 'BreakType',
          definitionLocation: {
            uri: 'file:///path/to/BreakType.cs',
            line: 9,
            character: 4,
          },
        },
      });
    });
  });

  describe('getMethodSignature', () => {
    it('should return method signature with hover info', async () => {
      const testFilePath = join(TEST_DIR, 'test-method.ts');

      const mockSymbolMatches: SymbolMatch[] = [
        {
          name: 'formatDate',
          kind: SymbolKind.Method,
          position: { line: 10, character: 5 },
          range: {
            start: { line: 10, character: 0 },
            end: { line: 15, character: 1 },
          },
        },
      ];

      // Mock findSymbolsByName
      const findSymbolsByNameSpy = spyOn(client, 'findSymbolsByName').mockResolvedValue({
        matches: mockSymbolMatches,
      });

      // Mock getHoverInfo
      const getHoverInfoSpy = spyOn(client as any, 'getHoverInfo').mockResolvedValue(
        '(method) DateFormatter.formatDate(date: Date | string, format?: string): string'
      );

      // Mock getSignatureHelp to return proper signature data
      const getSignatureHelpSpy = spyOn(client as any, 'getSignatureHelp').mockResolvedValue({
        signatures: [
          {
            label: '(date: Date | string, format?: string): string',
            parameters: [{ label: 'date: Date | string' }, { label: 'format?: string' }],
          },
        ],
      });

      const signatures = await client.getMethodSignature(testFilePath, 'formatDate');

      expect(findSymbolsByNameSpy).toHaveBeenCalledWith(testFilePath, 'formatDate', 'method');
      expect(getSignatureHelpSpy).toHaveBeenCalledWith(testFilePath, { line: 10, character: 5 });
      expect(signatures).toHaveLength(1);
      expect(signatures[0]).toEqual({
        name: 'formatDate',
        position: { line: 10, character: 5 },
        signature: '(date: Date | string, format?: string): string',
        typeInfo: {
          returnType: 'string',
          parameters: [
            { name: 'date', type: 'Date | string' },
            { name: 'format', type: 'string', isOptional: true },
          ],
        },
      });
    });

    it('should filter by class name when provided', async () => {
      const testFilePath = join(TEST_DIR, 'test-method.ts');

      const mockSymbolMatches: SymbolMatch[] = [
        {
          name: 'render',
          kind: SymbolKind.Method,
          position: { line: 10, character: 5 },
          range: {
            start: { line: 10, character: 0 },
            end: { line: 15, character: 1 },
          },
        },
        {
          name: 'render',
          kind: SymbolKind.Method,
          position: { line: 30, character: 5 },
          range: {
            start: { line: 30, character: 0 },
            end: { line: 35, character: 1 },
          },
        },
      ];

      const mockDocumentSymbols: DocumentSymbol[] = [
        {
          name: 'ComponentA',
          kind: SymbolKind.Class,
          range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 16 } },
          children: [
            {
              name: 'render',
              kind: SymbolKind.Method,
              range: { start: { line: 10, character: 0 }, end: { line: 15, character: 1 } },
              selectionRange: {
                start: { line: 10, character: 5 },
                end: { line: 10, character: 11 },
              },
            },
          ],
        },
        {
          name: 'ComponentB',
          kind: SymbolKind.Class,
          range: { start: { line: 25, character: 0 }, end: { line: 40, character: 1 } },
          selectionRange: { start: { line: 25, character: 6 }, end: { line: 25, character: 16 } },
          children: [
            {
              name: 'render',
              kind: SymbolKind.Method,
              range: { start: { line: 30, character: 0 }, end: { line: 35, character: 1 } },
              selectionRange: {
                start: { line: 30, character: 5 },
                end: { line: 30, character: 11 },
              },
            },
          ],
        },
      ];

      spyOn(client, 'findSymbolsByName').mockResolvedValue({ matches: mockSymbolMatches });
      spyOn(client, 'getDocumentSymbols').mockResolvedValue(mockDocumentSymbols);

      const getHoverInfoSpy = spyOn(client as any, 'getHoverInfo').mockImplementation(
        (filePath: string, position: any) => {
          if (position.line === 10) {
            return Promise.resolve('(method) ComponentA.render(): ReactElement');
          }
          return Promise.resolve(undefined);
        }
      );

      // Mock getSignatureHelp
      spyOn(client as any, 'getSignatureHelp').mockResolvedValue({
        signatures: [
          {
            label: 'ComponentA.render(): ReactElement',
            parameters: [],
          },
        ],
      });

      const signatures = await client.getMethodSignature(testFilePath, 'render', 'ComponentA');

      expect(signatures).toHaveLength(1);
      if (signatures[0]) {
        expect(signatures[0].signature).toBe('ComponentA.render(): ReactElement');
        expect(signatures[0].typeInfo).toEqual({
          returnType: 'ReactElement',
          parameters: [],
        });
      }
    });

    it('should include parameter type definition locations', async () => {
      const testFilePath = join(TEST_DIR, 'test-method.ts');

      const mockSymbolMatches: SymbolMatch[] = [
        {
          name: 'processBreak',
          kind: SymbolKind.Method,
          position: { line: 10, character: 5 },
          range: {
            start: { line: 10, character: 0 },
            end: { line: 15, character: 1 },
          },
        },
      ];

      spyOn(client, 'findSymbolsByName').mockResolvedValue({ matches: mockSymbolMatches });

      // Mock getSignatureHelp to return signature with parameters
      spyOn(client as any, 'getSignatureHelp').mockResolvedValue({
        signatures: [
          {
            label: '(breakType: BreakType, startTime: DateTime): void',
            parameters: [{ label: 'breakType: BreakType' }, { label: 'startTime: DateTime' }],
          },
        ],
      });

      // Mock findParameterPositions to return positions for type definitions
      spyOn(client as any, 'findParameterPositions').mockResolvedValue([
        { line: 10, character: 20 }, // Position of BreakType
        { line: 10, character: 40 }, // Position of DateTime
      ]);

      // Mock getTypeDefinition to return different locations for each type
      const getTypeDefinitionSpy = spyOn(client as any, 'getTypeDefinition');
      getTypeDefinitionSpy.mockImplementation((filePath: string, position: Position) => {
        if (position.character === 20) {
          // BreakType definition
          return Promise.resolve([
            {
              uri: 'file:///path/to/BreakType.cs',
              range: {
                start: { line: 9, character: 4 },
                end: { line: 20, character: 5 },
              },
            },
          ]);
        }
        if (position.character === 40) {
          // DateTime definition
          return Promise.resolve([
            {
              uri: 'file:///path/to/System/DateTime.cs',
              range: {
                start: { line: 100, character: 0 },
                end: { line: 500, character: 1 },
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const signatures = await client.getMethodSignature(testFilePath, 'processBreak');

      expect(signatures).toHaveLength(1);
      expect(signatures[0]).toEqual({
        name: 'processBreak',
        position: { line: 10, character: 5 },
        signature: '(breakType: BreakType, startTime: DateTime): void',
        typeInfo: {
          returnType: 'void',
          parameters: [
            {
              name: 'breakType',
              type: 'BreakType',
              definitionLocation: {
                uri: 'file:///path/to/BreakType.cs',
                line: 9,
                character: 4,
              },
            },
            {
              name: 'startTime',
              type: 'DateTime',
              definitionLocation: {
                uri: 'file:///path/to/System/DateTime.cs',
                line: 100,
                character: 0,
              },
            },
          ],
        },
      });
    });

    it('should return empty array when no hover info available', async () => {
      const testFilePath = join(TEST_DIR, 'test-method.ts');

      const mockSymbolMatches: SymbolMatch[] = [
        {
          name: 'someMethod',
          kind: SymbolKind.Method,
          position: { line: 10, character: 5 },
          range: {
            start: { line: 10, character: 0 },
            end: { line: 15, character: 1 },
          },
        },
      ];

      spyOn(client, 'findSymbolsByName').mockResolvedValue({ matches: mockSymbolMatches });
      spyOn(client as any, 'getHoverInfo').mockResolvedValue(undefined);
      spyOn(client as any, 'getSignatureHelp').mockResolvedValue(undefined);

      const signatures = await client.getMethodSignature(testFilePath, 'someMethod');

      expect(signatures).toHaveLength(0);
    });
  });

  describe('getHoverInfo', () => {
    it('should handle string hover content', async () => {
      const testFilePath = join(TEST_DIR, 'test-hover.ts');
      const position = { line: 5, character: 10 };

      // Mock internal methods
      const mockServerState = {
        process: {} as any,
        initializationPromise: Promise.resolve(),
      };

      spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      spyOn(client as any, 'ensureFileOpen').mockResolvedValue(undefined);

      const sendRequestSpy = spyOn(client as any, 'sendRequest').mockResolvedValue({
        contents: 'function testFunction(): void',
      });

      const result = await (client as any).getHoverInfo(testFilePath, position);

      expect(sendRequestSpy).toHaveBeenCalledWith(mockServerState.process, 'textDocument/hover', {
        textDocument: { uri: expect.stringContaining('test-hover.ts') },
        position: position,
      });
      expect(result).toBe('function testFunction(): void');
    });

    it('should handle object hover content with value property', async () => {
      const testFilePath = join(TEST_DIR, 'test-hover.ts');
      const position = { line: 5, character: 10 };

      const mockServerState = {
        process: {} as any,
        initializationPromise: Promise.resolve(),
      };

      spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      spyOn(client as any, 'ensureFileOpen').mockResolvedValue(undefined);
      spyOn(client as any, 'sendRequest').mockResolvedValue({
        contents: { value: 'const myVariable: string' },
      });

      const result = await (client as any).getHoverInfo(testFilePath, position);

      expect(result).toBe('const myVariable: string');
    });

    it('should handle array hover content', async () => {
      const testFilePath = join(TEST_DIR, 'test-hover.ts');
      const position = { line: 5, character: 10 };

      const mockServerState = {
        process: {} as any,
        initializationPromise: Promise.resolve(),
      };

      spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      spyOn(client as any, 'ensureFileOpen').mockResolvedValue(undefined);
      spyOn(client as any, 'sendRequest').mockResolvedValue({
        contents: ['class MyClass', { value: 'A class that does something' }],
      });

      const result = await (client as any).getHoverInfo(testFilePath, position);

      expect(result).toBe('class MyClass\nA class that does something');
    });

    it('should return undefined on error', async () => {
      const testFilePath = join(TEST_DIR, 'test-hover.ts');
      const position = { line: 5, character: 10 };

      const mockServerState = {
        process: {} as any,
        initializationPromise: Promise.resolve(),
      };

      spyOn(client as any, 'getServer').mockResolvedValue(mockServerState);
      spyOn(client as any, 'ensureFileOpen').mockResolvedValue(undefined);
      spyOn(client as any, 'sendRequest').mockRejectedValue(new Error('LSP error'));

      const stderrSpy = spyOn(process.stderr, 'write');

      const result = await (client as any).getHoverInfo(testFilePath, position);

      expect(result).toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting hover info'));

      stderrSpy.mockRestore();
    });
  });
});
