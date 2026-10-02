import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/** Port for private files (logos, later the PDFs). Nothing outside the adapters knows the provider. */
export interface ObjectStorage {
  put(key: string, object: StoredObject): Promise<void>;
  /** null when there is no object under the key. */
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Cloudflare R2 through its S3 API. The bucket must be created with EU jurisdiction. */
export class R2ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor({ accountId, accessKeyId, secretAccessKey, bucket }: R2Options) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.bucket = bucket;
  }

  async put(key: string, { body, contentType }: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = Buffer.from(await object.Body!.transformToByteArray());
      return { body, contentType: object.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Local development without R2: files in a folder, the content type in a sidecar file. */
export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(resolve(this.root))) throw new Error(`Invalid object key: ${key}`);
    return path;
  }

  async put(key: string, { body, contentType }: StoredObject): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.content-type`, contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    const path = this.path(key);
    try {
      return {
        body: await readFile(path),
        contentType: await readFile(`${path}.content-type`, 'utf8'),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    await rm(path, { force: true });
    await rm(`${path}.content-type`, { force: true });
  }
}
