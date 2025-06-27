import { readFile, readdir, stat } from 'node:fs/promises';
import { constants, access } from 'node:fs/promises';
import { extname, join } from 'node:path';
import ignore from 'ignore';
import type { LanguageServerConfig } from './language-servers.js';

// Default ignore patterns
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  'temp',
  'cache',
  '.cache',
  '.vscode',
  '.idea',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
];

export interface FileScanResult {
  extensions: Set<string>;
  recommendedServers: string[];
}

/**
 * Load gitignore patterns and create an ignore filter
 */
export async function loadGitignore(projectPath: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();

  // Add default patterns
  ig.add(DEFAULT_IGNORE_PATTERNS);

  // Add .gitignore patterns if file exists
  const gitignorePath = join(projectPath, '.gitignore');
  try {
    await access(gitignorePath, constants.F_OK);
    const gitignoreContent = await readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch (error) {
    // File doesn't exist or can't be read - that's ok
  }

  return ig;
}

/**
 * Recursively scan directory for file extensions
 */
export async function scanDirectoryForExtensions(
  dirPath: string,
  maxDepth = 3,
  ignoreFilter?: ReturnType<typeof ignore>,
  debug = false
): Promise<Set<string>> {
  const extensions = new Set<string>();

  async function scanDirectory(
    currentPath: string,
    currentDepth: number,
    relativePath = ''
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await readdir(currentPath);
      if (debug) {
        console.log(
          `Scanning directory ${currentPath} (depth: ${currentDepth}), found ${entries.length} entries: ${entries.join(', ')}`
        );
      }

      for (const entry of entries) {
        const fullPath = join(currentPath, entry);
        const entryRelativePath = relativePath ? join(relativePath, entry) : entry;

        // Skip if ignored - normalize path separators for cross-platform compatibility
        const normalizedPath = entryRelativePath.replace(/\\/g, '/');
        if (ignoreFilter?.ignores(normalizedPath)) {
          if (debug) {
            console.log(`Skipping ignored entry: ${entryRelativePath}`);
          }
          continue;
        }

        try {
          const fileStat = await stat(fullPath);

          if (fileStat.isDirectory()) {
            if (debug) {
              console.log(`Recursing into directory: ${entryRelativePath}`);
            }
            await scanDirectory(fullPath, currentDepth + 1, entryRelativePath);
          } else if (fileStat.isFile()) {
            const ext = extname(entry).toLowerCase().slice(1); // Remove the dot
            if (debug) {
              console.log(`Found file: ${entry}, extension: "${ext}"`);
            }
            if (ext) {
              extensions.add(ext);
              if (debug) {
                console.log(`Added extension: ${ext}`);
              }
            }
          }
        } catch (error) {
          console.error(`Error processing ${fullPath}: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentPath}: ${error}`);
      return;
    }
  }

  await scanDirectory(dirPath, 0);
  return extensions;
}

/**
 * Get recommended language servers based on found extensions
 */
export function getRecommendedLanguageServers(
  extensions: Set<string>,
  languageServers: LanguageServerConfig[]
): string[] {
  const recommended: string[] = [];

  for (const server of languageServers) {
    const hasMatchingExtension = server.extensions.some((ext) => extensions.has(ext));
    if (hasMatchingExtension) {
      recommended.push(server.name);
    }
  }

  return recommended;
}

/**
 * Scan project files and get recommendations
 */
export async function scanProjectFiles(
  projectPath: string,
  languageServers: LanguageServerConfig[],
  maxDepth = 3,
  debug = false
): Promise<FileScanResult> {
  const ignoreFilter = await loadGitignore(projectPath);
  const extensions = await scanDirectoryForExtensions(projectPath, maxDepth, ignoreFilter, debug);
  const recommendedServers = getRecommendedLanguageServers(extensions, languageServers);

  return {
    extensions,
    recommendedServers,
  };
}
