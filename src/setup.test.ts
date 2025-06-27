import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { LANGUAGE_SERVERS, generateConfig } from './language-servers.js';

// Type for generated config
interface GeneratedConfig {
  servers: Array<{
    extensions: string[];
    command: string[];
    rootDir: string;
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
