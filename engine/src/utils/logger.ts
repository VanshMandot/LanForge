export const logger = {
  // Logs informational messages
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  },
  // Logs warning messages
  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  },

  // Logs error messages
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  },

  // Logs debug messages
  debug: (message: string, ...args: any[]) => {
    // Only log if DEBUG env var is set or just always log for now?
    // For simplicity, let's just log.
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  },
};
