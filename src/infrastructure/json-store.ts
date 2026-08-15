import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DatabaseState } from '../domain/types.js';
import type { DataStore } from './store.js';
const codes = [
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
const emptyState = (): DatabaseState => ({
  users: [],
  statements: [],
  transactions: [],
  corrections: [],
  categories: codes.map((code, displayOrder) => ({
    id: code,
    code,
    name: code.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
    displayOrder,
  })),
});
export class JsonStore implements DataStore {
  private state: DatabaseState = emptyState();
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}
  async initialize(): Promise<void> {
    const absolute = resolve(this.path);
    await mkdir(dirname(absolute), { recursive: true });
    try {
      this.state = JSON.parse(await readFile(absolute, 'utf8')) as DatabaseState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
  }
  read<T>(reader: (state: DatabaseState) => T): T {
    return reader(structuredClone(this.state));
  }
  async write<T>(writer: (state: DatabaseState) => T): Promise<T> {
    let result!: T;
    this.queue = this.queue.then(async () => {
      const next = structuredClone(this.state);
      result = writer(next);
      this.state = next;
      await this.persist();
    });
    await this.queue;
    return result;
  }
  private async persist(): Promise<void> {
    const absolute = resolve(this.path);
    const temporary = `${absolute}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(temporary, absolute);
  }
  ready(): Promise<boolean> {
    return Promise.resolve(true);
  }
  async close(): Promise<void> {}
}
