import { existsSync, readFileSync } from 'node:fs';
import type { Config } from './types.js';

/**
 * Load configuration from CCLSP_CONFIG_PATH env var or the given configPath.
 * Throws on all error conditions instead of calling process.exit.
 */
export function loadConfig(configPath?: string): Config {
  // First try to load from environment variable (MCP config)
  if (process.env.CCLSP_CONFIG_PATH) {
    process.stderr.write(
      `Loading config from CCLSP_CONFIG_PATH: ${process.env.CCLSP_CONFIG_PATH}\n`
    );

    if (!existsSync(process.env.CCLSP_CONFIG_PATH)) {
      throw new Error(
        `Config file specified in CCLSP_CONFIG_PATH does not exist: ${process.env.CCLSP_CONFIG_PATH}`
      );
    }

    try {
      const configData = readFileSync(process.env.CCLSP_CONFIG_PATH, 'utf-8');
      const config: Config = JSON.parse(configData);
      process.stderr.write(`Loaded ${config.servers.length} server configurations from env\n`);
      return config;
    } catch (error) {
      throw new Error(`Failed to load config from CCLSP_CONFIG_PATH: ${error}`);
    }
  }

  // configPath must be provided if CCLSP_CONFIG_PATH is not set
  if (!configPath) {
    throw new Error(
      'configPath is required when CCLSP_CONFIG_PATH environment variable is not set'
    );
  }

  // Try to load from config file
  try {
    process.stderr.write(`Loading config from file: ${configPath}\n`);
    const configData = readFileSync(configPath, 'utf-8');
    const config: Config = JSON.parse(configData);
    process.stderr.write(`Loaded ${config.servers.length} server configurations\n`);
    return config;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error}`);
  }
}
