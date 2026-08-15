import request from 'supertest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { LocalFileStore } from './infrastructure/file-store.js';
import { JsonStore } from './infrastructure/json-store.js';
import { createLogger } from './infrastructure/logger.js';

let app: ReturnType<typeof createApp>;
let store: JsonStore;
beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expenseiq-api-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-with-at-least-thirty-two-chars',
  });
  store = new JsonStore(join(dir, 'data.json'));
  const files = new LocalFileStore(join(dir, 'files'));
  await Promise.all([store.initialize(), files.initialize()]);
  app = createApp({ config, logger: createLogger(config), store, files });
});
async function register(email = 'cathy@example.com') {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Cathy', email, password: 'strong-password' });
  return response.body.data.token as string;
}
describe('ExpenseIQ API', () => {
  it('registers, logs in, returns me and categories', async () => {
    const token = await register();
    expect(
      (await request(app).get('/api/auth/me').set('authorization', `Bearer ${token}`)).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/categories').set('authorization', `Bearer ${token}`)).body.data,
    ).toHaveLength(12);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'cathy@example.com', password: 'strong-password' })
      ).status,
    ).toBe(200);
  });
  it('rotates refresh tokens once and revokes the rotated token on logout', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Refresh User', email: 'refresh@example.com', password: 'strong-password' });
    const firstRefreshToken = registered.body.data.refreshToken as string;
    expect(firstRefreshToken).toBeTruthy();

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.token).toBeTruthy();
    expect(refreshed.body.data.refreshToken).not.toBe(firstRefreshToken);

    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefreshToken }))
        .status,
    ).toBe(401);

    const secondRefreshToken = refreshed.body.data.refreshToken as string;
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .set('authorization', `Bearer ${refreshed.body.data.token as string}`)
          .send({ refreshToken: secondRefreshToken })
      ).status,
    ).toBe(204);
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: secondRefreshToken }))
        .status,
    ).toBe(401);
  });
  it('requires authentication', async () => {
    expect((await request(app).get('/api/statements')).status).toBe(401);
  });
  it('uploads valid and invalid PDFs independently and detects duplicates', async () => {
    const token = await register();
    const pdf = Buffer.from('%PDF-1.4\nFidelity Bank statement');
    const first = await request(app)
      .post('/api/statements/upload')
      .set('authorization', `Bearer ${token}`)
      .attach('files', pdf, { filename: 'good.pdf', contentType: 'application/pdf' })
      .attach('files', Buffer.from('bad'), { filename: 'bad.pdf', contentType: 'application/pdf' });
    expect(first.status).toBe(207);
    expect(first.body.data.summary).toMatchObject({ total: 2, processed: 1, failed: 1 });
    const duplicate = await request(app)
      .post('/api/statements/upload')
      .set('authorization', `Bearer ${token}`)
      .attach('files', pdf, { filename: 'good.pdf', contentType: 'application/pdf' });
    expect(duplicate.body.data.summary.duplicate).toBe(1);
  });
  it('lists, reprocesses and deletes only owned statements', async () => {
    const token = await register();
    const upload = await request(app)
      .post('/api/statements/upload')
      .set('authorization', `Bearer ${token}`)
      .attach('files', Buffer.from('%PDF-1.4\nunknown'), {
        filename: 'unknown.pdf',
        contentType: 'application/pdf',
      });
    const id = upload.body.data.items[0].statementId;
    expect(upload.body.data.items[0].status).toBe('NEEDS_BANK');
    expect(
      (
        await request(app)
          .post(`/api/statements/${id}/reprocess`)
          .set('authorization', `Bearer ${token}`)
          .send({ bankCode: 'GTBANK' })
      ).status,
    ).toBe(200);
    const other = await register('other@example.com');
    expect(
      (await request(app).get(`/api/statements/${id}`).set('authorization', `Bearer ${other}`))
        .status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/api/statements/${id}`).set('authorization', `Bearer ${token}`))
        .status,
    ).toBe(204);
  });
  it('returns empty transaction and dashboard contracts', async () => {
    const token = await register();
    const transactions = await request(app)
      .get('/api/transactions')
      .set('authorization', `Bearer ${token}`);
    expect(transactions.body.meta.total).toBe(0);
    const dashboard = await request(app)
      .get('/api/dashboard')
      .set('authorization', `Bearer ${token}`);
    expect(dashboard.body.data).toMatchObject({
      currency: 'NGN',
      totalIncomeMinor: 0,
      totalExpensesMinor: 0,
      netCashFlowMinor: 0,
      transactionCount: 0,
    });
  });
  it('aggregates dashboard totals by day, category and bank', async () => {
    const token = await register('analytics@example.com');
    const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${token}`);
    const userId = me.body.data.id as string;
    const base = {
      statementId: 'statement-1',
      userId,
      balanceMinor: null,
      confidenceScore: 100,
      reviewStatus: 'OK' as const,
      isUserCorrected: false,
      rawDescription: 'seed',
      rawAmount: '0',
      rawDate: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    await store.write((state) => {
      state.transactions.push(
        {
          ...base,
          id: 'income-1',
          bankCode: 'GTBANK',
          date: '2026-08-01',
          description: 'Salary',
          amountMinor: 100_000,
          type: 'INCOME',
          categoryId: 'INCOME',
        },
        {
          ...base,
          id: 'expense-1',
          bankCode: 'GTBANK',
          date: '2026-08-01',
          description: 'Groceries',
          amountMinor: 25_000,
          type: 'EXPENSE',
          categoryId: 'FOOD',
        },
        {
          ...base,
          id: 'expense-2',
          bankCode: 'ACCESS',
          date: '2026-08-02',
          description: 'Taxi',
          amountMinor: 10_000,
          type: 'EXPENSE',
          categoryId: 'TRANSPORT',
        },
      );
    });

    const dashboard = await request(app)
      .get('/api/dashboard')
      .set('authorization', `Bearer ${token}`);
    expect(dashboard.body.data).toMatchObject({
      totalIncomeMinor: 100_000,
      totalExpensesMinor: 35_000,
      netCashFlowMinor: 65_000,
      transactionCount: 3,
      spendingTrend: [
        {
          date: '2026-08-01',
          incomeMinor: 100_000,
          expensesMinor: 25_000,
          netCashFlowMinor: 75_000,
        },
        {
          date: '2026-08-02',
          incomeMinor: 0,
          expensesMinor: 10_000,
          netCashFlowMinor: -10_000,
        },
      ],
      spendingByBank: [
        {
          bankCode: 'GTBANK',
          incomeMinor: 100_000,
          expensesMinor: 25_000,
          netCashFlowMinor: 75_000,
          transactionCount: 2,
        },
        {
          bankCode: 'ACCESS',
          incomeMinor: 0,
          expensesMinor: 10_000,
          netCashFlowMinor: -10_000,
          transactionCount: 1,
        },
      ],
    });
    expect(dashboard.body.data.spendingByCategory).toEqual([
      { categoryId: 'FOOD', amountMinor: 25_000 },
      { categoryId: 'TRANSPORT', amountMinor: 10_000 },
    ]);
  });
});
