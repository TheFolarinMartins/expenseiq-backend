import { z } from 'zod';

const placeholderSecret = 'replace-with-a-long-random-secret-at-least-32-characters';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1).default('file:./dev.db'),
    DATA_FILE: z.string().min(1).default('./storage/data.json'),
    JWT_SECRET: z.string().min(32).default(placeholderSecret),
    JWT_EXPIRES_IN: z.string().min(1).default('15m'),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    STATEMENT_STORAGE_DIR: z.string().min(1).default('./storage/statements'),
    MAX_UPLOAD_FILES: z.coerce.number().int().min(1).max(100).default(10),
    MAX_UPLOAD_FILE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(10 * 1024 * 1024),
    MAX_UPLOAD_BATCH_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(50 * 1024 * 1024),
    BANK_DETECTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  })
  .superRefine((value, context) => {
    if (value.MAX_UPLOAD_BATCH_BYTES < value.MAX_UPLOAD_FILE_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['MAX_UPLOAD_BATCH_BYTES'],
        message: 'must be at least MAX_UPLOAD_FILE_BYTES',
      });
    }
    if (value.NODE_ENV === 'production' && value.JWT_SECRET === placeholderSecret) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'placeholder is forbidden in production',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
