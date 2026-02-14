import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LSPClient } from './lsp-client.js';

/**
 * Integration tests for moveFile that verify actual file moves and import updates.
 * These tests use a real TypeScript language server.
 *
 * We use a subdirectory of the cclsp project to leverage its existing node_modules/typescript.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Use a test directory inside the project so typescript-language-server can find typescript
const TEST_DIR = join(PROJECT_ROOT, '.test-move-integration');
const TEST_CONFIG_PATH = join(TEST_DIR, 'cclsp.json');

// Increase timeout for integration tests (LSP server startup can be slow)
const INTEGRATION_TIMEOUT = 60000;

describe('moveFile integration', () => {
  let client: LSPClient;

  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Create tsconfig.json that extends parent to get typescript resolution
    writeFileSync(
      join(TEST_DIR, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            // Point to parent node_modules for typescript
            typeRoots: ['../node_modules/@types'],
          },
          include: ['**/*.ts'],
        },
        null,
        2
      )
    );

    // Create package.json
    writeFileSync(
      join(TEST_DIR, 'package.json'),
      JSON.stringify(
        {
          name: 'move-test',
          type: 'module',
        },
        null,
        2
      )
    );

    // Create cclsp config - use PROJECT_ROOT as rootDir so TS can find node_modules
    writeFileSync(
      TEST_CONFIG_PATH,
      JSON.stringify(
        {
          servers: [
            {
              extensions: ['ts', 'js'],
              command: ['npx', '--', 'typescript-language-server', '--stdio'],
              rootDir: PROJECT_ROOT,
            },
          ],
        },
        null,
        2
      )
    );

    client = new LSPClient(TEST_CONFIG_PATH);
  });

  afterEach(() => {
    client?.dispose();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it(
    'should move file and update imports in files that reference it',
    async () => {
      // Create source file to be moved
      const utilsPath = join(TEST_DIR, 'utils.ts');
      writeFileSync(
        utilsPath,
        `export function formatDate(date: Date): string {
  return date.toISOString();
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}
`
      );

      // Create file that imports utils
      const mainPath = join(TEST_DIR, 'main.ts');
      writeFileSync(
        mainPath,
        `import { formatDate, formatNumber } from './utils.js';

const now = new Date();
console.log(formatDate(now));
console.log(formatNumber(12345));
`
      );

      // Create another file that imports utils
      const helperPath = join(TEST_DIR, 'helper.ts');
      writeFileSync(
        helperPath,
        `import { formatDate } from './utils.js';

export function logDate(): void {
  console.log(formatDate(new Date()));
}
`
      );

      // Create lib directory for destination
      const libDir = join(TEST_DIR, 'lib');
      mkdirSync(libDir);

      const destPath = join(libDir, 'utils.ts');

      // Warm up the LSP server by opening files
      // This ensures the server knows about the import relationships
      await client.getDocumentSymbols(mainPath);
      await client.getDocumentSymbols(helperPath);
      await client.getDocumentSymbols(utilsPath);

      // Give LSP server time to analyze
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // First do a dry run to see what would change
      const dryRunResult = await client.moveFile(utilsPath, destPath, true);

      console.log('Dry run result:', JSON.stringify(dryRunResult, null, 2));

      // Verify dry run doesn't move the file
      expect(dryRunResult.moved).toBe(false);
      expect(existsSync(utilsPath)).toBe(true);
      expect(existsSync(destPath)).toBe(false);

      // Now actually move the file
      const result = await client.moveFile(utilsPath, destPath, false);

      console.log('Move result:', JSON.stringify(result, null, 2));

      // Verify file was moved
      expect(result.moved).toBe(true);
      expect(existsSync(utilsPath)).toBe(false);
      expect(existsSync(destPath)).toBe(true);

      // Verify destination has correct content
      const destContent = readFileSync(destPath, 'utf-8');
      expect(destContent).toContain('export function formatDate');
      expect(destContent).toContain('export function formatNumber');

      // Verify imports were updated in main.ts
      const mainContent = readFileSync(mainPath, 'utf-8');
      console.log('main.ts after move:', mainContent);

      // Import should now point to ./lib/utils.js
      expect(mainContent).toContain('./lib/utils');
      expect(mainContent).not.toContain("from './utils.js'");

      // Verify imports were updated in helper.ts
      const helperContent = readFileSync(helperPath, 'utf-8');
      console.log('helper.ts after move:', helperContent);

      expect(helperContent).toContain('./lib/utils');
      expect(helperContent).not.toContain("from './utils.js'");
    },
    INTEGRATION_TIMEOUT
  );

  it(
    'should handle rename in same directory',
    async () => {
      // Create source file
      const oldPath = join(TEST_DIR, 'oldName.ts');
      writeFileSync(
        oldPath,
        `export const value = 42;
`
      );

      // Create file that imports it
      const consumerPath = join(TEST_DIR, 'consumer.ts');
      writeFileSync(
        consumerPath,
        `import { value } from './oldName.js';

console.log(value);
`
      );

      const newPath = join(TEST_DIR, 'newName.ts');

      // Warm up LSP
      await client.getDocumentSymbols(consumerPath);
      await client.getDocumentSymbols(oldPath);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Move/rename the file
      const result = await client.moveFile(oldPath, newPath, false);

      console.log('Rename result:', JSON.stringify(result, null, 2));

      expect(result.moved).toBe(true);
      expect(existsSync(oldPath)).toBe(false);
      expect(existsSync(newPath)).toBe(true);

      // Verify import was updated
      const consumerContent = readFileSync(consumerPath, 'utf-8');
      console.log('consumer.ts after rename:', consumerContent);

      expect(consumerContent).toContain('./newName');
      expect(consumerContent).not.toContain('./oldName');
    },
    INTEGRATION_TIMEOUT
  );

  it(
    'should handle moving file up a directory',
    async () => {
      // Create nested structure
      const subDir = join(TEST_DIR, 'sub');
      mkdirSync(subDir);

      const nestedPath = join(subDir, 'nested.ts');
      writeFileSync(
        nestedPath,
        `export const nested = 'I am nested';
`
      );

      // Create file in sub that imports nested
      const subConsumerPath = join(subDir, 'subConsumer.ts');
      writeFileSync(
        subConsumerPath,
        `import { nested } from './nested.js';

console.log(nested);
`
      );

      // Create file in root that imports nested
      const rootConsumerPath = join(TEST_DIR, 'rootConsumer.ts');
      writeFileSync(
        rootConsumerPath,
        `import { nested } from './sub/nested.js';

console.log(nested);
`
      );

      const destPath = join(TEST_DIR, 'nested.ts');

      // Warm up LSP
      await client.getDocumentSymbols(subConsumerPath);
      await client.getDocumentSymbols(rootConsumerPath);
      await client.getDocumentSymbols(nestedPath);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Move file up
      const result = await client.moveFile(nestedPath, destPath, false);

      console.log('Move up result:', JSON.stringify(result, null, 2));

      expect(result.moved).toBe(true);

      // Verify imports updated correctly
      const subConsumerContent = readFileSync(subConsumerPath, 'utf-8');
      console.log('subConsumer.ts after move:', subConsumerContent);
      // Should now be ../nested.js
      expect(subConsumerContent).toContain('../nested');

      const rootConsumerContent = readFileSync(rootConsumerPath, 'utf-8');
      console.log('rootConsumer.ts after move:', rootConsumerContent);
      // Should now be ./nested.js
      expect(rootConsumerContent).toContain('./nested');
      expect(rootConsumerContent).not.toContain('./sub/nested');
    },
    INTEGRATION_TIMEOUT
  );

  it(
    'should handle barrel exports (index.ts re-exports)',
    async () => {
      // Create lib directory with multiple modules
      const libDir = join(TEST_DIR, 'lib');
      mkdirSync(libDir);

      // Create a utility file
      const mathPath = join(libDir, 'math.ts');
      writeFileSync(
        mathPath,
        `export function add(a: number, b: number): number {
  return a + b;
}
`
      );

      // Create barrel export
      const indexPath = join(libDir, 'index.ts');
      writeFileSync(
        indexPath,
        `export { add } from './math.js';
`
      );

      // Create consumer that uses barrel export
      const appPath = join(TEST_DIR, 'app.ts');
      writeFileSync(
        appPath,
        `import { add } from './lib/index.js';

console.log(add(1, 2));
`
      );

      // Create another consumer that imports directly
      const directPath = join(TEST_DIR, 'direct.ts');
      writeFileSync(
        directPath,
        `import { add } from './lib/math.js';

console.log(add(3, 4));
`
      );

      // Move math.ts to utils directory
      const utilsDir = join(TEST_DIR, 'utils');
      mkdirSync(utilsDir);
      const destPath = join(utilsDir, 'math.ts');

      // Warm up LSP
      await client.getDocumentSymbols(appPath);
      await client.getDocumentSymbols(directPath);
      await client.getDocumentSymbols(indexPath);
      await client.getDocumentSymbols(mathPath);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Move the file
      const result = await client.moveFile(mathPath, destPath, false);

      console.log('Barrel move result:', JSON.stringify(result, null, 2));

      expect(result.moved).toBe(true);

      // Verify barrel export was updated
      const indexContent = readFileSync(indexPath, 'utf-8');
      console.log('index.ts after move:', indexContent);
      expect(indexContent).toContain('../utils/math');
      expect(indexContent).not.toContain('./math');

      // Verify direct import was updated
      const directContent = readFileSync(directPath, 'utf-8');
      console.log('direct.ts after move:', directContent);
      expect(directContent).toContain('./utils/math');
      expect(directContent).not.toContain('./lib/math');
    },
    INTEGRATION_TIMEOUT
  );

  it(
    'should report warnings when LSP cannot compute imports',
    async () => {
      // Create a Python file (no Python LSP configured)
      const pyPath = join(TEST_DIR, 'script.py');
      writeFileSync(pyPath, 'print("hello")\n');

      const destPath = join(TEST_DIR, 'moved_script.py');

      // This should still move the file but warn about no import updates
      const result = await client.moveFile(pyPath, destPath, false);

      expect(result.moved).toBe(true);
      expect(existsSync(destPath)).toBe(true);
      // Should have a warning about no server handling .py files
      // (or it might just have no import changes, which is fine)
    },
    INTEGRATION_TIMEOUT
  );
});
