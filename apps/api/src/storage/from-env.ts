import { Logger } from '@nestjs/common';
import { fileURLToPath } from 'node:url';
import type { WorkerEnv } from '../config.js';
import { LocalObjectStorage, R2ObjectStorage, type ObjectStorage } from './object-storage.js';

const LOCAL_STORAGE_DIR = fileURLToPath(new URL('../../.storage', import.meta.url));

export function objectStorageFromEnv(env: WorkerEnv): ObjectStorage {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new R2ObjectStorage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
  }
  new Logger('Storage').warn(`R2 is not configured: files are stored in ${LOCAL_STORAGE_DIR}`);
  return new LocalObjectStorage(LOCAL_STORAGE_DIR);
}
