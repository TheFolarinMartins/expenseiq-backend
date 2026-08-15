import type { DatabaseState } from '../domain/types.js';

export interface DataStore {
  initialize(): Promise<void>;
  read<T>(reader: (state: DatabaseState) => T): T;
  write<T>(writer: (state: DatabaseState) => T): Promise<T>;
  ready(): Promise<boolean>;
  close(): Promise<void>;
}

export interface FileStore {
  initialize(): Promise<void>;
  put(bytes: Buffer, extension?: string, mimeType?: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
