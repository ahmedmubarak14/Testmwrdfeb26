/**
 * Secure Logger Utility
 * 
 * SECURITY: This logger prevents sensitive data from being logged in production.
 * - Debug messages only appear in development
 * - Error messages are sanitized to remove sensitive data
 * - Provides structured logging for better observability
 */

// Check if we're in development mode
const isDev = import.meta.env.DEV;

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
    /email/i,
    /password/i,
    /token/i,
    /key/i,
    /secret/i,
    /authorization/i,
    /credit/i,
    /card/i,
    /cvv/i,
    /cvc/i,
    /ssn/i,
    /phone/i,
];

// Sensitive value patterns to redact
const SENSITIVE_VALUE_PATTERNS = [
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Email
    /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/, // Card number
    /^eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*$/, // JWT
];

/**
 * Sanitize an object by redacting sensitive fields
 */
function sanitize(data: unknown): unknown {
    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data === 'string') {
        // Check if the string matches any sensitive value pattern
        for (const pattern of SENSITIVE_VALUE_PATTERNS) {
            if (pattern.test(data)) {
                return '[REDACTED]';
            }
        }
        return data;
    }

    if (typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(sanitize);
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        // Check if the key matches any sensitive field pattern
        const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

        if (isSensitive) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitize(value);
        } else {
            sanitized[key] = sanitize(value);
        }
    }
    return sanitized;
}

/**
 * Secure Logger
 * 
 * Usage:
 *   import { logger } from '@/src/utils/logger';
 *   
 *   logger.debug('User logged in', { userId: '123' });  // Only shows in dev
 *   logger.info('Order created', { orderId: 'xyz' });   // Always shows
 *   logger.warn('Rate limit approaching');              // Always shows
 *   logger.error('Failed to process', error);           // Sanitized output
 */
export const logger = {
    /**
     * Debug messages - ONLY shown in development
     * Use for detailed debugging information
     */
    debug: (message: string, data?: unknown): void => {
        if (isDev) {
            console.log(`[DEBUG] ${message}`, data !== undefined ? sanitize(data) : '');
        }
    },

    /**
     * Info messages - shown in all environments
     * Use for important operational information
     */
    info: (message: string, data?: unknown): void => {
        console.info(`[INFO] ${message}`, data !== undefined ? sanitize(data) : '');
    },

    /**
     * Warning messages - shown in all environments
     * Use for potentially problematic situations
     */
    warn: (message: string, data?: unknown): void => {
        console.warn(`[WARN] ${message}`, data !== undefined ? sanitize(data) : '');
    },

    /**
     * Error messages - shown in all environments, ALWAYS sanitized
     * Use for error conditions
     */
    error: (message: string, error?: unknown): void => {
        // Always sanitize error objects to prevent sensitive data leakage
        const sanitizedError = error instanceof Error
            ? {
                message: error.message,
                name: error.name,
                // Don't include stack trace in production
                ...(isDev ? { stack: error.stack } : {})
            }
            : sanitize(error);

        console.error(`[ERROR] ${message}`, sanitizedError);
    },

    /**
     * Auth-specific logging - only in development, highly sanitized
     * Use for authentication flow debugging
     */
    auth: (message: string, data?: unknown): void => {
        if (isDev) {
            // Extra sanitization for auth logs
            const safeData = data !== undefined ? sanitize(data) : '';
            console.log(`[AUTH] ${message}`, safeData);
        }
    },

    /**
     * Payment-specific logging - never logs sensitive payment data
     * Use for payment flow debugging
     */
    payment: (message: string, data?: unknown): void => {
        if (isDev) {
            // Always sanitize payment data
            console.log(`[PAYMENT] ${message}`, data !== undefined ? sanitize(data) : '');
        }
    },
};

export default logger;
