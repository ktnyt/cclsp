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

        // Verify the quoted path is preserved
        expect(echoResult.stdout).toContain('"');
      } finally {
        // Cleanup
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  );

  test('should handle command execution simulation', async () => {
    const testPath = '/path with spaces/config.json';
    const args = buildMCPArgs(testPath, false);

    // Simulate execution with echo (always available)
    const testArgs = ['MCP_SIMULATION:', ...args.slice(1)];
    const result = await executeCommand('echo', testArgs);

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('MCP_SIMULATION:');
    expect(result.stdout).toContain('add');
    expect(result.stdout).toContain('cclsp');

    // Verify path is properly quoted in the output
    const envArg = args.find((arg) => arg.startsWith('CCLSP_CONFIG_PATH='));
    expect(envArg).toContain('"');
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
