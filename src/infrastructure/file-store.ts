import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import type { FileStore } from './store.js';
export class LocalFileStore implements FileStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }
  async put(bytes: Buffer, extension = '.bin'): Promise<string> {
    const safeExtension = /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : '.bin';
    const key = `${randomUUID()}${safeExtension}`;
    await writeFile(this.safe(key), bytes, { flag: 'wx' });
    return key;
  }
  async get(key: string): Promise<Buffer> {
    return readFile(this.safe(key));
  }
  async delete(key: string): Promise<void> {
    await rm(this.safe(key), { force: true });
  }
  private safe(key: string): string {
    if (
      !/^[-a-f0-9]+\.[a-z0-9]{1,5}$/.test(key) ||
      !extname(key) ||
      key.includes('/') ||
      key.includes('\\')
    )
      throw new Error('Invalid storage key');
    const target = resolve(this.root, key);
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Unsafe storage path');
    return target;
  }
}
