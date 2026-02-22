import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';

/** Write a file using Bun.write to avoid node:fs mock interference from other test files. */
async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

const validConfig = {
  servers: [
    {
      extensions: ['ts'],
      command: ['typescript-language-server', '--stdio'],
    },
  ],
};

describe('loadConfig', () => {
  let testDir: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync('/tmp/cclsp-config-test-');
    savedEnv = process.env.CCLSP_CONFIG_PATH;
  });

  afterEach(() => {
    // Restore env var to whatever it was before each test
    if (savedEnv !== undefined) {
      process.env.CCLSP_CONFIG_PATH = savedEnv;
    } else {
      process.env.CCLSP_CONFIG_PATH = '';
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('loading from configPath', () => {
    it('loads valid config from file path', async () => {
      process.env.CCLSP_CONFIG_PATH = '';
      const configFile = join(testDir, 'cclsp.json');
      await writeFile(configFile, JSON.stringify(validConfig));

      const config = loadConfig(configFile);
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0]?.extensions).toEqual(['ts']);
    });

    it('throws when config file does not exist', () => {
      process.env.CCLSP_CONFIG_PATH = '';
      expect(() => loadConfig(join(testDir, 'nonexistent.json'))).toThrow(
        'Failed to load config from'
      );
    });

    it('throws when config file contains invalid JSON', async () => {
      process.env.CCLSP_CONFIG_PATH = '';
      const configFile = join(testDir, 'bad.json');
      await writeFile(configFile, 'not valid json {{{');

      expect(() => loadConfig(configFile)).toThrow('Failed to load config from');
    });

    it('throws when configPath is not provided and no env var', () => {
      process.env.CCLSP_CONFIG_PATH = '';
      expect(() => loadConfig()).toThrow(
        'configPath is required when CCLSP_CONFIG_PATH environment variable is not set'
      );
    });
  });

  describe('loading from CCLSP_CONFIG_PATH env var', () => {
    it('loads config from env var path', async () => {
      const configFile = join(testDir, 'env-config.json');
      await writeFile(configFile, JSON.stringify(validConfig));
      process.env.CCLSP_CONFIG_PATH = configFile;

      const config = loadConfig();
      expect(config.servers).toHaveLength(1);
    });

    it('env var takes precedence over configPath', async () => {
      const envConfig = {
        servers: [{ extensions: ['py'], command: ['pylsp'] }],
      };
      const fileConfig = {
        servers: [{ extensions: ['ts'], command: ['tsserver'] }],
      };

      const envFile = join(testDir, 'env.json');
      const pathFile = join(testDir, 'path.json');
      await writeFile(envFile, JSON.stringify(envConfig));
      await writeFile(pathFile, JSON.stringify(fileConfig));
      process.env.CCLSP_CONFIG_PATH = envFile;

      const config = loadConfig(pathFile);
      expect(config.servers[0]?.extensions).toEqual(['py']);
    });

    it('throws when env var points to nonexistent file', () => {
      process.env.CCLSP_CONFIG_PATH = '/nonexistent/path.json';

      expect(() => loadConfig()).toThrow(
        'Config file specified in CCLSP_CONFIG_PATH does not exist'
      );
    });

    it('throws when env var file contains invalid JSON', async () => {
      const configFile = join(testDir, 'bad-env.json');
      await writeFile(configFile, '{{invalid');
      process.env.CCLSP_CONFIG_PATH = configFile;

      expect(() => loadConfig()).toThrow('Failed to load config from CCLSP_CONFIG_PATH');
    });
  });
});
