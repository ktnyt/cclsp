import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Convert a file path to a proper file:// URI
 * Handles Windows paths correctly (e.g., C:\path -> file:///C:/path)
 */
export function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

/**
 * Convert a file:// URI to a file path
 * Handles Windows URIs correctly (e.g., file:///C:/path -> C:\path)
 */
export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}
