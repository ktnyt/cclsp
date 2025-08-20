import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { LANGUAGE_SERVERS, generateConfig } from './language-servers.js';
import { buildMCPArgs, generateMCPCommand } from './setup.js';

// Type for generated config
interface GeneratedConfig {
  servers: Array<{
    extensions: string[];
    command: string[];
    rootDir: string;
    restartInterval?: number;
  }>;
}

// Mock fs module
mock.module('node:fs', () => ({
  writeFileSync: mock(() => {}),
}));

// Mock inquirer module
const mockPrompt = mock(() => Promise.resolve({}));
mock.module('inquirer', () => ({
  default: {
    prompt: mockPrompt,
  },
}));

describe('LANGUAGE_SERVERS', () => {
  test('should contain expected language servers', () => {
    expect(LANGUAGE_SERVERS.length).toBeGreaterThan(10);

    // Check that TypeScript server exists
    const tsServer = LANGUAGE_SERVERS.find((server) => server.name === 'typescript');
    expect(tsServer).toBeDefined();
    expect(tsServer?.displayName).toBe('TypeScript/JavaScript');
    expect(tsServer?.extensions).toContain('ts');
    expect(tsServer?.extensions).toContain('js');

    // Check that Python server exists
    const pyServer = LANGUAGE_SERVERS.find((server) => server.name === 'python');
    expect(pyServer).toBeDefined();
    expect(pyServer?.displayName).toBe('Python');
    expect(pyServer?.extensions).toContain('py');
  });

  test('should have required properties for each server', () => {
    for (const server of LANGUAGE_SERVERS) {
      expect(server.name).toBeDefined();
      expect(server.displayName).toBeDefined();
      expect(server.extensions).toBeDefined();
      expect(server.command).toBeDefined();
      expect(server.installInstructions).toBeDefined();
      expect(Array.isArray(server.extensions)).toBe(true);
      expect(Array.isArray(server.command)).toBe(true);
      expect(server.extensions.length).toBeGreaterThan(0);
      expect(server.command.length).toBeGreaterThan(0);
    }
  });

  test('should have unique names', () => {
    const names = LANGUAGE_SERVERS.map((server) => server.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  test('should have unique extensions across servers', () => {
    const extensionToServer = new Map<string, string>();

    for (const server of LANGUAGE_SERVERS) {
      for (const ext of server.extensions) {
        if (extensionToServer.has(ext)) {
          throw new Error(
            `Extension '${ext}' is used by both ${extensionToServer.get(ext)} and ${server.name}`
          );
        }
        extensionToServer.set(ext, server.name);
      }
    }

    expect(extensionToServer.size).toBeGreaterThan(0);
  });
});

describe('generateConfig', () => {
  test('should generate empty config for empty selection', () => {
    const config = generateConfig([]);
    expect(config).toEqual({ servers: [] });
  });

  test('should generate config for single language', () => {
    const config = generateConfig(['typescript']);
    expect(config).toHaveProperty('servers');
    expect(Array.isArray((config as GeneratedConfig).servers)).toBe(true);
    expect((config as GeneratedConfig).servers).toHaveLength(1);

    const server = (config as GeneratedConfig).servers[0];
    expect(server).toBeDefined();
    expect(server?.extensions).toContain('ts');
    expect(server?.extensions).toContain('js');
    expect(server?.command).toEqual(['npx', '--', 'typescript-language-server', '--stdio']);
    expect(server?.rootDir).toBe('.');
  });

  test('should generate config for multiple languages', () => {
    const config = generateConfig(['typescript', 'python', 'go']);
    expect(config).toHaveProperty('servers');
    expect(Array.isArray((config as GeneratedConfig).servers)).toBe(true);
    expect((config as GeneratedConfig).servers).toHaveLength(3);

    const serverNames = (config as GeneratedConfig).servers.map(
      (s: GeneratedConfig['servers'][0]) => {
        if (s.extensions.includes('ts')) return 'typescript';
        if (s.extensions.includes('py')) return 'python';
        if (s.extensions.includes('go')) return 'go';
        return 'unknown';
      }
    );

    expect(serverNames).toContain('typescript');
    expect(serverNames).toContain('python');
    expect(serverNames).toContain('go');
  });

  test('should include restartInterval for Python server', () => {
    const config = generateConfig(['python']);
    expect(config).toHaveProperty('servers');
    expect(Array.isArray((config as GeneratedConfig).servers)).toBe(true);
    expect((config as GeneratedConfig).servers).toHaveLength(1);

    const pythonServer = (config as GeneratedConfig).servers[0];
    expect(pythonServer?.extensions).toContain('py');
    expect(pythonServer?.restartInterval).toBe(5);
  });

  test('should not include restartInterval for servers without it configured', () => {
    const config = generateConfig(['typescript']);
    expect(config).toHaveProperty('servers');
    expect(Array.isArray((config as GeneratedConfig).servers)).toBe(true);
    expect((config as GeneratedConfig).servers).toHaveLength(1);

    const typescriptServer = (config as GeneratedConfig).servers[0];
    expect(typescriptServer?.extensions).toContain('ts');
    expect(typescriptServer?.restartInterval).toBeUndefined();
  });

  test('should handle invalid language names gracefully', () => {
    const config = generateConfig(['nonexistent', 'typescript']);
    expect(config).toHaveProperty('servers');
    expect((config as GeneratedConfig).servers).toHaveLength(1);

    const server = (config as GeneratedConfig).servers[0];
    expect(server).toBeDefined();
    expect(server?.extensions).toContain('ts');
  });

  test('should generate valid JSON structure', () => {
    const config = generateConfig(['typescript', 'python']);
    const jsonString = JSON.stringify(config, null, 2);

    // Should be parseable
    expect(() => JSON.parse(jsonString)).not.toThrow();

    // Should contain expected structure
    const parsed = JSON.parse(jsonString);
    expect(parsed.servers).toBeDefined();
    expect(Array.isArray(parsed.servers)).toBe(true);

    for (const server of parsed.servers) {
      expect(server.extensions).toBeDefined();
      expect(server.command).toBeDefined();
      expect(server.rootDir).toBeDefined();
    }
  });

  test('should filter servers based on selected languages', () => {
    const config1 = generateConfig(['python', 'typescript']);
    const config2 = generateConfig(['typescript']);

    const servers1 = (config1 as GeneratedConfig).servers;
    const servers2 = (config2 as GeneratedConfig).servers;

    expect(servers1).toHaveLength(2);
    expect(servers2).toHaveLength(1);

    // Check that both servers are included in first config
    const extensions1 = servers1.flatMap((s: GeneratedConfig['servers'][0]) => s.extensions);
    expect(extensions1).toContain('py');
    expect(extensions1).toContain('ts');

    // Check that only TypeScript is in second config
    const extensions2 = servers2.flatMap((s: GeneratedConfig['servers'][0]) => s.extensions);
    expect(extensions2).toContain('ts');
    expect(extensions2).not.toContain('py');
  });
});

describe('setup CLI integration', () => {
  beforeEach(() => {
    mockPrompt.mockClear();
    (writeFileSync as unknown as ReturnType<typeof mock>).mockClear();
  });

  test('should handle language selection workflow', async () => {
    // Mock user selecting TypeScript and Python
    mockPrompt
      .mockResolvedValueOnce({ selectedLanguages: ['typescript', 'python'] })
      .mockResolvedValueOnce({ configPath: './test-config.json' })
      .mockResolvedValueOnce({ shouldProceed: true })
      .mockResolvedValueOnce({ viewConfig: false });

    // Import and run the main function (we need to refactor setup.ts to export main for testing)
    // For now, just test the components we can test
    const config = generateConfig(['typescript', 'python']);
    const configJson = JSON.stringify(config, null, 2);

    expect(configJson).toContain('typescript-language-server');
    expect(configJson).toContain('pylsp');
  });

  test('should generate correct file content', () => {
    const selectedLanguages = ['typescript', 'go', 'rust'];
    const config = generateConfig(selectedLanguages);
    const configJson = JSON.stringify(config, null, 2);

    // Verify the generated JSON contains expected elements
    expect(configJson).toContain('typescript-language-server');
    expect(configJson).toContain('gopls');
    expect(configJson).toContain('rust-analyzer');

    // Verify structure
    const parsed = JSON.parse(configJson);
    expect(parsed.servers).toHaveLength(3);

    // Verify each server has required properties
    for (const server of parsed.servers) {
      expect(server).toHaveProperty('extensions');
      expect(server).toHaveProperty('command');
      expect(server).toHaveProperty('rootDir');
      expect(server.rootDir).toBe('.');
    }
  });
});

describe('Windows platform support', () => {
  test('should generate MCP command with cmd /c prefix on Windows', () => {
    const configPath = '/path/to/config.json';
    const isUser = false;

    // Test Windows platform
    const windowsCommand = generateMCPCommand(configPath, isUser, 'win32');
    expect(windowsCommand).toContain('cmd /c npx cclsp@latest');
    expect(windowsCommand).toContain('CCLSP_CONFIG_PATH=');
    expect(windowsCommand).not.toContain('--scope user');
  });

  test('should generate MCP command without cmd /c prefix on non-Windows', () => {
    const configPath = '/path/to/config.json';
    const isUser = false;

    // Test macOS platform
    const macCommand = generateMCPCommand(configPath, isUser, 'darwin');
    expect(macCommand).not.toContain('cmd /c');
    expect(macCommand).toContain('npx cclsp@latest');
    expect(macCommand).toContain('CCLSP_CONFIG_PATH=');

    // Test Linux platform
    const linuxCommand = generateMCPCommand(configPath, isUser, 'linux');
    expect(linuxCommand).not.toContain('cmd /c');
    expect(linuxCommand).toContain('npx cclsp@latest');
  });

  test('should add --scope user flag when isUser is true', () => {
    const configPath = '/path/to/config.json';

    // Test with user scope on Windows
    const windowsUserCommand = generateMCPCommand(configPath, true, 'win32');
    expect(windowsUserCommand).toContain('--scope user');
    expect(windowsUserCommand).toContain('cmd /c npx cclsp@latest');

    // Test with user scope on macOS
    const macUserCommand = generateMCPCommand(configPath, true, 'darwin');
    expect(macUserCommand).toContain('--scope user');
    expect(macUserCommand).not.toContain('cmd /c');
  });

  test('should build MCP args array with cmd /c on Windows', () => {
    const absoluteConfigPath = '/absolute/path/to/config.json';
    const isUser = false;

    // Test Windows platform
    const windowsArgs = buildMCPArgs(absoluteConfigPath, isUser, 'win32');
    expect(windowsArgs).toEqual([
      'mcp',
      'add',
      'cclsp',
      'cmd',
      '/c',
      'npx',
      'cclsp@latest',
      '--env',
      `CCLSP_CONFIG_PATH=${absoluteConfigPath}`,
    ]);
  });

  test('should build MCP args array without cmd /c on non-Windows', () => {
    const absoluteConfigPath = '/absolute/path/to/config.json';
    const isUser = false;

    // Test macOS platform
    const macArgs = buildMCPArgs(absoluteConfigPath, isUser, 'darwin');
    expect(macArgs).toEqual([
      'mcp',
      'add',
      'cclsp',
      'npx',
      'cclsp@latest',
      '--env',
      `CCLSP_CONFIG_PATH=${absoluteConfigPath}`,
    ]);

    // Test Linux platform
    const linuxArgs = buildMCPArgs(absoluteConfigPath, isUser, 'linux');
    expect(linuxArgs).toEqual([
      'mcp',
      'add',
      'cclsp',
      'npx',
      'cclsp@latest',
      '--env',
      `CCLSP_CONFIG_PATH=${absoluteConfigPath}`,
    ]);
  });

  test('should build MCP args with user scope', () => {
    const absoluteConfigPath = '/absolute/path/to/config.json';

    // Test Windows with user scope
    const windowsUserArgs = buildMCPArgs(absoluteConfigPath, true, 'win32');
    expect(windowsUserArgs).toEqual([
      'mcp',
      'add',
      'cclsp',
      'cmd',
      '/c',
      'npx',
      'cclsp@latest',
      '--scope',
      'user',
      '--env',
      `CCLSP_CONFIG_PATH=${absoluteConfigPath}`,
    ]);

    // Test macOS with user scope
    const macUserArgs = buildMCPArgs(absoluteConfigPath, true, 'darwin');
    expect(macUserArgs).toEqual([
      'mcp',
      'add',
      'cclsp',
      'npx',
      'cclsp@latest',
      '--scope',
      'user',
      '--env',
      `CCLSP_CONFIG_PATH=${absoluteConfigPath}`,
    ]);
  });

  test('should handle different platforms correctly', () => {
    const configPath = '/path/to/config.json';
    const absoluteConfigPath = '/absolute/path/to/config.json';

    // Test all common platforms
    const platforms: NodeJS.Platform[] = [
      'win32',
      'darwin',
      'linux',
      'freebsd',
      'openbsd',
      'sunos',
      'aix',
    ];

    for (const platform of platforms) {
      const command = generateMCPCommand(configPath, false, platform);
      const args = buildMCPArgs(absoluteConfigPath, false, platform);

      if (platform === 'win32') {
        expect(command).toContain('cmd /c');
        expect(args).toContain('cmd');
        expect(args).toContain('/c');
      } else {
        expect(command).not.toContain('cmd /c');
        expect(args).not.toContain('cmd');
        expect(args).not.toContain('/c');
      }
    }
  });

  test('should quote config path with spaces in command', () => {
    const configPathWithSpaces = '/path with spaces/config.json';
    const isUser = false;

    // Test Windows platform with spaces
    const windowsCommand = generateMCPCommand(configPathWithSpaces, isUser, 'win32');
    expect(windowsCommand).toContain('CCLSP_CONFIG_PATH="/');
    expect(windowsCommand).toContain('with spaces');
    expect(windowsCommand).toContain('"');

    // Test macOS platform with spaces
    const macCommand = generateMCPCommand(configPathWithSpaces, isUser, 'darwin');
    expect(macCommand).toContain('CCLSP_CONFIG_PATH="/');
    expect(macCommand).toContain('with spaces');
    expect(macCommand).toContain('"');
  });

  test('should quote config path with spaces in args', () => {
    const absolutePathWithSpaces = '/absolute/path with spaces/config.json';
    const isUser = false;

    // Test Windows platform with spaces
    const windowsArgs = buildMCPArgs(absolutePathWithSpaces, isUser, 'win32');
    const envArg = windowsArgs.find((arg) => arg.startsWith('CCLSP_CONFIG_PATH='));
    expect(envArg).toBeDefined();
    expect(envArg).toContain('"');
    expect(envArg).toContain('with spaces');

    // Test macOS platform with spaces
    const macArgs = buildMCPArgs(absolutePathWithSpaces, isUser, 'darwin');
    const macEnvArg = macArgs.find((arg) => arg.startsWith('CCLSP_CONFIG_PATH='));
    expect(macEnvArg).toBeDefined();
    expect(macEnvArg).toContain('"');
    expect(macEnvArg).toContain('with spaces');
  });

  test('should not quote config path without spaces', () => {
    const configPath = '/path/to/config.json';
    const absolutePath = '/absolute/path/to/config.json';
    const isUser = false;

    // Test command generation
    const command = generateMCPCommand(configPath, isUser, 'darwin');
    expect(command).not.toContain('CCLSP_CONFIG_PATH="');
    expect(command).toContain('CCLSP_CONFIG_PATH=/');

    // Test args generation
    const args = buildMCPArgs(absolutePath, isUser, 'darwin');
    const envArg = args.find((arg) => arg.startsWith('CCLSP_CONFIG_PATH='));
    expect(envArg).toBeDefined();
    expect(envArg).not.toContain('"');
  });
});
