import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './infrastructure/logger.js';
import { JsonStore } from './infrastructure/json-store.js';
import { LocalFileStore } from './infrastructure/file-store.js';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function testApp(readiness?: () => Promise<boolean>) {
  const directory = await mkdtemp(join(tmpdir(), 'expenseiq-'));
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const store = new JsonStore(join(directory, 'data.json'));
  const files = new LocalFileStore(join(directory, 'files'));
  await Promise.all([store.initialize(), files.initialize()]);
  return createApp({
    config,
    logger: createLogger(config),
    store,
    files,
    ...(readiness ? { readiness } : {}),
  });
}

describe('operational endpoints', () => {
  it('reports liveness and propagates a request ID', async () => {
    const response = await request(await testApp())
      .get('/health/live')
      .set('x-request-id', 'test-request');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-request');
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports unavailable readiness without exposing details', async () => {
    const response = await request(await testApp(() => Promise.resolve(false))).get(
      '/health/ready',
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ data: { status: 'not_ready' } });
  });

  it('returns a stable not-found error', async () => {
    const response = await request(await testApp()).get('/missing');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    });
  });

  it('serves Swagger UI and the OpenAPI document', async () => {
    const application = await testApp();
    const specification = await request(application).get('/openapi.json');
    expect(specification.status).toBe(200);
    expect(specification.body.openapi).toBe('3.1.0');
    expect(specification.body.paths['/api/statements/upload']).toBeDefined();
    const docs = await request(application).get('/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('Swagger UI');
  });
});
