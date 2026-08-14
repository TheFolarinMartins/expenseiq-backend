import pino, { type Logger } from 'pino';
import type { AppConfig } from '../config/env.js';

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'request.headers.authorization',
        'password',
        '*.password',
        'token',
        '*.token',
        'rawText',
        '*.rawText',
      ],
      censor: '[REDACTED]',
    },
  });
}
