/**
 * Lightweight structured logger for cclsp.
 * Log level controlled via CCLSP_LOG_LEVEL env var.
 * Levels: error (0), warn (1), info (2), debug (3).
 * Default: info.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LEVELS;

function currentLevel(): number {
  const env = (process.env.CCLSP_LOG_LEVEL ?? 'info').toLowerCase();
  return LEVELS[env as LogLevel] ?? LEVELS.info;
}

function write(level: LogLevel, message: string): void {
  if (LEVELS[level] <= currentLevel()) {
    process.stderr.write(message);
  }
}

export const logger = {
  error: (message: string) => write('error', message),
  warn: (message: string) => write('warn', message),
  info: (message: string) => write('info', message),
  debug: (message: string) => write('debug', message),
};
