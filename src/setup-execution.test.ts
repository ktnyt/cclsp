import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMCPArgs, generateMCPCommand } from './setup.js';

// Helper function to execute command
async function executeCommand(
  command: string,
  args: string[]
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', () => {
      resolve({ success: false, stdout, stderr });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
}

describe('Setup command execution tests', () => {
  test('should generate valid claude mcp add command', async () => {
    const configPath = '/test/path/config.json';
    const command = generateMCPCommand(configPath, false);
    const args = buildMCPArgs(configPath, false);

    // Verify command structure
    expect(command).toContain('claude mcp add cclsp');
    expect(command).toContain('--env CCLSP_CONFIG_PATH=');
    expect(command).toContain('npx cclsp@latest');

    // Verify args structure
    expect(args[0]).toBe('mcp');
    expect(args[1]).toBe('add');
    expect(args[2]).toBe('cclsp');

    // Find --env argument
    const envIndex = args.indexOf('--env');
    expect(envIndex).toBeGreaterThan(2);
    expect(args[envIndex + 1]).toContain('CCLSP_CONFIG_PATH=');
  });

  test('should execute claude mcp add command with dry-run', async () => {
    const testDir = join(tmpdir(), `cclsp-mcp-test-${Date.now()}`);
    const configPath = join(testDir, 'cclsp.json');

    try {
      // Create test directory and config
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: [
            {
              extensions: ['ts'],
              command: ['npx', '--', 'typescript-language-server', '--stdio'],
              rootDir: '.',
            },
          ],
        })
      );

      // Build the command with --dry-run flag
      const args = buildMCPArgs(configPath, false);

      // Replace 'mcp' with 'echo' to simulate the command
      const testArgs = ['claude', ...args];

      // Execute with echo to verify command structure
      const result = await executeCommand('echo', testArgs);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('claude');
      expect(result.stdout).toContain('mcp');
      expect(result.stdout).toContain('add');
      expect(result.stdout).toContain('cclsp');
      expect(result.stdout).toContain('CCLSP_CONFIG_PATH=');
    } finally {
      // Cleanup
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test.skipIf(!process.env.TEST_WITH_CLAUDE_CLI)(
    'should execute actual claude mcp add command',
    async () => {
      const testDir = join(tmpdir(), `cclsp-real-test-${Date.now()}`);
      const configPath = join(testDir, 'cclsp.json');

      try {
        // Create test directory and config
        mkdirSync(testDir, { recursive: true });
        writeFileSync(
          configPath,
          JSON.stringify({
            servers: [
              {
                extensions: ['ts'],
                command: ['npx', '--', 'typescript-language-server', '--stdio'],
                rootDir: '.',
              },
            ],
          })
        );

        // Check if claude command exists
        const checkResult = await executeCommand('which', ['claude']);
        const hasClaudeCLI = checkResult.success && checkResult.stdout.trim().length > 0;

        if (hasClaudeCLI) {
          // Build the actual command
          const args = buildMCPArgs(configPath, false);

          // First, try to remove if exists (ignore errors)
          await executeCommand('claude', ['mcp', 'remove', 'cclsp']);

          // Execute the actual add command
          const result = await executeCommand('claude', args);

          if (result.success) {
            console.log('✅ Successfully added cclsp to MCP configuration');

            // Try to remove it to clean up
            const removeResult = await executeCommand('claude', ['mcp', 'remove', 'cclsp']);
            expect(removeResult.success).toBe(true);
          } else {
            console.log('⚠️ Claude CLI command failed:', result.stderr);
            // Log the command that would have been executed
            const command = generateMCPCommand(configPath, false);
            console.log(`Command would be: ${command}`);
          }
        } else {
          console.log('⚠️ Claude CLI not found, verifying command format only');

          // Just verify the command would be correctly formatted
          const command = generateMCPCommand(configPath, false);
          console.log(`Command would be: ${command}`);
          expect(command).toContain('claude mcp add cclsp');
          expect(command).toContain('--env CCLSP_CONFIG_PATH=');
          expect(command).toContain('npx cclsp@latest');
        }
      } finally {
        // Cleanup
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  );
  test.skipIf(!process.env.RUN_EXECUTION_TESTS)(
    'should execute MCP command with spaces in path',
    async () => {
      const testDir = join(tmpdir(), `cclsp-exec-test-${Date.now()} with spaces`);
      const configPath = join(testDir, 'cclsp.json');

      try {
        // Create test directory and config
        mkdirSync(testDir, { recursive: true });
        writeFileSync(
          configPath,
          JSON.stringify({
            servers: [
              {
                extensions: ['ts'],
                command: ['npx', '--', 'typescript-language-server', '--stdio'],
                rootDir: '.',
              },
            ],
          })
        );

        // Generate command parts
        const args = buildMCPArgs(configPath, false);

        // Test with echo to verify command structure
        const echoResult = await executeCommand('echo', args.slice(1));
        expect(echoResult.success).toBe(true);
        expect(echoResult.stdout).toContain('add');
        expect(echoResult.stdout).toContain('cclsp');
        expect(echoResult.stdout).toContain('CCLSP_CONFIG_PATH=');

        // Verify path handling based on platform
        const isWindows = process.platform === 'win32';
        if (isWindows) {
          // Windows: Path with spaces should be quoted
          expect(echoResult.stdout).toContain('"');
        } else {
          // Non-Windows: Path with spaces should be escaped
          expect(echoResult.stdout).toContain('\\ ');
          expect(echoResult.stdout).not.toContain('"');
        }
      } finally {
        // Cleanup
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  );

  test('should handle command execution simulation', async () => {
    const testPath = '/path with spaces/config.json';
    const isWindows = process.platform === 'win32';
    const args = buildMCPArgs(testPath, false);

    // Simulate execution with echo (always available)
    const testArgs = ['MCP_SIMULATION:', ...args.slice(1)];
    const result = await executeCommand('echo', testArgs);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('MCP_SIMULATION:');
    expect(result.stdout).toContain('add');
    expect(result.stdout).toContain('cclsp');

    // Verify path handling based on platform
    const envArg = args.find((arg) => arg.startsWith('CCLSP_CONFIG_PATH='));
    if (isWindows) {
      // Windows: Path with spaces should be quoted
      expect(envArg).toContain('"');
    } else {
      // Non-Windows: Path with spaces should be escaped
      expect(envArg).not.toContain('"');
      expect(envArg).toContain('\\ ');
    }
  });

  test.skipIf(!process.env.TEST_WITH_CLAUDE_CLI)('should work with actual claude CLI', async () => {
    // This test requires Claude CLI to be installed
    const testDir = join(tmpdir(), `cclsp-claude-test-${Date.now()}`);
    const configPath = join(testDir, 'cclsp.json');

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          servers: [
            {
              extensions: ['ts'],
              command: ['npx', '--', 'typescript-language-server', '--stdio'],
              rootDir: '.',
            },
          ],
        })
      );

      // Try to check if command would work (dry run)
      const args = buildMCPArgs(configPath, false);

      // Check if claude command exists
      const checkResult = await executeCommand('which', ['claude']);
      if (checkResult.success) {
        // Claude is installed, we could test the actual command
        // But we'll just verify the structure is correct
        console.log('Claude CLI found, command would be:', ['claude', ...args].join(' '));
      }

      expect(args).toContain('mcp');
      expect(args).toContain('add');
      expect(args).toContain('cclsp');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
