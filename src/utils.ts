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
 * Also handles malformed URIs like /d:/path -> D:\path
 */
export function uriToPath(uri: string): string {
  // Handle malformed URIs that start with /{drive letter}:/
  // Convert /d:/path/to/file.cs -> D:\path\to\file.cs
  const malformedWindowsPath = uri.match(/^\/([a-zA-Z]):\/(.*)$/);
  if (malformedWindowsPath) {
    const [, driveLetter, restOfPath] = malformedWindowsPath;
    if (driveLetter && restOfPath) {
      // Convert forward slashes to backslashes and add drive letter
      const windowsPath = `${driveLetter.toUpperCase()}:\\${restOfPath.replace(/\//g, '\\')}`;
      // Decode URI components (e.g., %20 -> space)
      return decodeURIComponent(windowsPath);
    }
  }

  // Handle standard file:// URIs
  try {
    return fileURLToPath(uri);
  } catch (error) {
    // Fallback: if fileURLToPath fails, try to parse manually
    if (uri.startsWith('file://')) {
      // Remove file:// prefix and decode
      let path = uri.slice(7); // Remove 'file://'

      // Handle file:///d:/path format
      const windowsFileUri = path.match(/^\/([a-zA-Z]):\/(.*)$/);
      if (windowsFileUri) {
        const [, driveLetter, restOfPath] = windowsFileUri;
        if (driveLetter && restOfPath) {
          path = `${driveLetter.toUpperCase()}:\\${restOfPath.replace(/\//g, '\\')}`;
        }
      }

      return decodeURIComponent(path);
    }

    // If all else fails, return the original URI
    return uri;
  }
}
