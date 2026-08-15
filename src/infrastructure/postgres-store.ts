import pg from 'pg';
import type { DatabaseState } from '../domain/types.js';
import type { DataStore } from './store.js';

const categoryCodes = [
  'FOOD',
  'TRANSPORT',
  'BILLS',
  'SHOPPING',
  'AIRTIME_DATA',
  'TRANSFER',
  'INCOME',
  'FEES',
  'CASH',
  'HEALTH',
  'ENTERTAINMENT',
  'OTHER',
];

const initialState = (): DatabaseState => ({
  users: [],
  statements: [],
  transactions: [],
  corrections: [],
  categories: categoryCodes.map((code, displayOrder) => ({
    id: code,
    code,
    name: code.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    displayOrder,
  })),
});

/** Durable PostgreSQL-backed state store. Writes are serialized with a row lock. */
export class PostgresStore implements DataStore {
  private readonly pool: pg.Pool;
  private state: DatabaseState = initialState();
  private queue: Promise<void> = Promise.resolve();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      create table if not exists expenseiq_app_state (
        id smallint primary key check (id = 1),
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await this.pool.query(
      `insert into expenseiq_app_state (id, data) values (1, $1::jsonb)
       on conflict (id) do nothing`,
      [JSON.stringify(initialState())],
    );
    const result = await this.pool.query<{ data: DatabaseState }>(
      'select data from expenseiq_app_state where id = 1',
    );
    this.state = result.rows[0]?.data ?? initialState();
  }

  read<T>(reader: (state: DatabaseState) => T): T {
    return reader(structuredClone(this.state));
  }

  async write<T>(writer: (state: DatabaseState) => T): Promise<T> {
    let result!: T;
    this.queue = this.queue.then(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        const current = await client.query<{ data: DatabaseState }>(
          'select data from expenseiq_app_state where id = 1 for update',
        );
        const next = structuredClone(current.rows[0]?.data ?? initialState());
        result = writer(next);
        await client.query(
          'update expenseiq_app_state set data = $1::jsonb, updated_at = now() where id = 1',
          [JSON.stringify(next)],
        );
        await client.query('commit');
        this.state = next;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    });
    await this.queue;
    return result;
  }

  async ready(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
