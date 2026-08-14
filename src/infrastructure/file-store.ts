import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
export class LocalFileStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }
  async put(bytes: Buffer): Promise<string> {
    const key = `${randomUUID()}.pdf`;
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
    if (extname(key) !== '.pdf' || key.includes('/') || key.includes('\\'))
      throw new Error('Invalid storage key');
    const target = resolve(this.root, key);
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Unsafe storage path');
    return target;
  }
}
