import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { FileStore } from './store.js';

export class SupabaseFileStore implements FileStore {
  private readonly client: ReturnType<typeof createClient>;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async initialize(): Promise<void> {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (!data && error) {
      const created = await this.client.storage.createBucket(this.bucket, { public: false });
      if (created.error) throw created.error;
    }
  }

  async put(bytes: Buffer): Promise<string> {
    const key = `${randomUUID()}.pdf`;
    const { error } = await this.client.storage.from(this.bucket).upload(key, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (error) throw error;
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw error;
  }
}
