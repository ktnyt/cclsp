#!/usr/bin/env bun
/**
 * Manual test script for rename operations
 * Run with: bun test/manual-rename-test.ts
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = '/tmp/cclsp-rename-test';
const FIXTURES_DIR = join(__dirname, 'fixtures');

interface TestCase {
  name: string;
  fixture: string;
  testFile: string;
  oldName: string;
  newName: string;
  expectedChanges: string[];
}

const testCases: TestCase[] = [
  {
    name: 'TypeScript class rename',
    fixture: 'typescript-example.ts',
    testFile: 'test.ts',
    oldName: 'UserService',
    newName: 'AccountService',
    expectedChanges: ['export class AccountService {'],
  },
  {
    name: 'Python class rename',
    fixture: 'python-example.py',
    testFile: 'test.py',
    oldName: 'Calculator',
    newName: 'MathProcessor',
    expectedChanges: ['class MathProcessor:', 'calc = MathProcessor()'],
  },
  {
    name: 'Go struct rename',
    fixture: 'go-example.go',
    testFile: 'test.go',
    oldName: 'DataStore',
    newName: 'Storage',
    expectedChanges: [
      'type Storage struct {',
      'func NewStorage() *Storage {',
      'func (ds *Storage)',
    ],
  },
];

interface RenameArgs {
  file_path: string;
  symbol_name: string;
  new_name: string;
  dry_run: boolean;
}

interface MCPResult {
  content: Array<{ text: string }>;
}

async function runMCPCommand(args: RenameArgs): Promise<MCPResult> {
  return new Promise((resolve, reject) => {
    const serverPath = join(__dirname, '..', 'dist', 'index.js');
    const mcp = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let error = '';

    mcp.stdout.on('data', (data) => {
      output += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      error += data.toString();
    });

    mcp.on('close', (code) => {
      if (code !== 0) {
        console.error('Server error output:', error);
        reject(new Error(`MCP server exited with code ${code}`));
      } else {
        try {
          // Parse JSON-RPC response
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('"result"')) {
              const response = JSON.parse(line);
              resolve(response.result);
              return;
            }
          }
          reject(new Error('No valid response from MCP server'));
        } catch (e) {
          reject(e);
        }
      }
    });

    // Send JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'rename_symbol',
        arguments: args,
      },
    };

    mcp.stdin.write(`${JSON.stringify(request)}\n`);
    mcp.stdin.end();
  });
}

async function setupTestEnvironment() {
  console.log('Setting up test environment...');

  // Clean and create test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  // Copy fixtures to test directory
  for (const testCase of testCases) {
    const src = join(FIXTURES_DIR, testCase.fixture);
    const dest = join(TEST_DIR, testCase.testFile);

    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`Copied ${testCase.fixture} to ${testCase.testFile}`);
    } else {
      console.warn(`Warning: Fixture ${testCase.fixture} not found`);
    }
  }

  // Create a config file for LSP servers
  const config = {
    servers: [
      {
        extensions: ['ts', 'tsx', 'js', 'jsx'],
        command: ['npx', '--', 'typescript-language-server', '--stdio'],
      },
      {
        extensions: ['py'],
        command: ['pylsp'],
      },
      {
        extensions: ['go'],
        command: ['gopls'],
      },
    ],
  };

  const configPath = join(TEST_DIR, 'cclsp.json');
  require('node:fs').writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Created LSP config file');
}

async function runTest(testCase: TestCase, dryRun: boolean) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test: ${testCase.name} (dry_run: ${dryRun})`);
  console.log('='.repeat(60));

  const testFile = join(TEST_DIR, testCase.testFile);

  // Read original content
  const originalContent = readFileSync(testFile, 'utf-8');
  console.log('\nOriginal content (first 10 lines):');
  console.log(originalContent.split('\n').slice(0, 10).join('\n'));

  try {
    // Run rename operation
    const result = await runMCPCommand({
      file_path: testFile,
      symbol_name: testCase.oldName,
      new_name: testCase.newName,
      dry_run: dryRun,
    });

    console.log('\nMCP Response:');
    console.log(result.content[0]?.text || 'No response text');

    if (!dryRun) {
      // Read modified content
      const modifiedContent = readFileSync(testFile, 'utf-8');
      console.log('\nModified content (first 10 lines):');
      console.log(modifiedContent.split('\n').slice(0, 10).join('\n'));

      // Verify expected changes
      console.log('\nVerifying expected changes:');
      for (const expected of testCase.expectedChanges) {
        if (modifiedContent.includes(expected)) {
          console.log(`✅ Found: "${expected}"`);
        } else {
          console.log(`❌ Missing: "${expected}"`);
        }
      }

      // Check that old name is gone
      if (!modifiedContent.includes(testCase.oldName)) {
        console.log(`✅ Old name "${testCase.oldName}" successfully replaced`);
      } else {
        console.log(`⚠️  Old name "${testCase.oldName}" still present`);
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function main() {
  console.log('Manual Rename Test Script');
  console.log('=========================\n');

  // Build the project first
  console.log('Building project...');
  const { execSync } = require('node:child_process');
  try {
    execSync('bun run build', { cwd: join(__dirname, '..') });
    console.log('Build successful\n');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }

  // Setup test environment
  await setupTestEnvironment();

  // Change to test directory for relative paths
  process.chdir(TEST_DIR);

  // Run tests
  for (const testCase of testCases) {
    // First run with dry_run to preview changes
    await runTest(testCase, true);

    // Then run actual rename
    await runTest(testCase, false);

    // Restore original file for next test
    const src = join(FIXTURES_DIR, testCase.fixture);
    const dest = join(TEST_DIR, testCase.testFile);
    copyFileSync(src, dest);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('All tests completed!');
  console.log('Test files are in:', TEST_DIR);
}

// Run the tests
main().catch(console.error);
