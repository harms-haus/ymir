/**
 * Logger configuration module
 * Provides redaction rules for sensitive data and structured logging helpers
 */

// Fields that should be redacted in logs
export const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'credential',
  'privateKey',
  'private_key',
  'sessionId', // Don't log full session IDs
];

/**
 * Redact sensitive values in an object
 * Returns a shallow copy with sensitive fields replaced by [REDACTED]
 */
export function redactSensitive<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data } as Record<string, unknown>;
  
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    }
  }
  
  return result as T;
}

/**
 * Create a log context object with standard metadata
 */
export function createLogContext(
  component: string,
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  return {
    component,
    timestamp: new Date().toISOString(),
    ...(metadata ? redactSensitive(metadata) : {}),
  };
}

/**
 * Format an error for logging
 */
export function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error: String(error) };
}
