import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('loads safe development defaults', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).PORT).toBe(4000);
  });

  it('rejects the placeholder secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('JWT_SECRET');
  });

  it('rejects an aggregate limit below the file limit', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        MAX_UPLOAD_FILE_BYTES: '2000',
        MAX_UPLOAD_BATCH_BYTES: '1000',
      }),
    ).toThrow('MAX_UPLOAD_BATCH_BYTES');
  });
});
