import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { config } from "../config.js";

export interface StorageBackend {
  write(key: string, stream: Readable, sizeBytes: number): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalStorageBackend implements StorageBackend {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
  }

  private path(key: string): string {
    return join(this.baseDir, key);
  }

  async write(key: string, stream: Readable, _sizeBytes: number): Promise<void> {
    const dest = this.path(key);
    const dir = dirname(dest);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    writeFileSync(dest, Buffer.concat(chunks));
  }

  async read(key: string): Promise<Readable> {
    const p = this.path(key);
    if (!existsSync(p)) {
      throw new Error(`File not found: ${key}`);
    }
    return createReadStream(p);
  }

  async delete(key: string): Promise<void> {
    const p = this.path(key);
    if (existsSync(p)) {
      await unlink(p);
    }
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.path(key));
  }
}

// S3-compatible backend (MinIO). Uses dynamic import to avoid requiring aws-sdk if not used.
async function createS3Backend(): Promise<StorageBackend | null> {
  const s3 = config.attachments.s3;
  if (!s3.endpoint || !s3.bucket || !s3.accessKey || !s3.secretKey) {
    return null;
  }
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    endpoint: s3.endpoint,
    region: "us-east-1",
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    forcePathStyle: true,
  });
  const bucket = s3.bucket;

  return {
    async write(key: string, stream: Readable, sizeBytes: number): Promise<void> {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.length }));
    },
    async read(key: string): Promise<Readable> {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) throw new Error(`File not found: ${key}`);
      return res.Body as Readable;
    },
    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async exists(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

let _defaultBackend: StorageBackend | null = null;

export async function getStorageBackend(): Promise<StorageBackend> {
  if (_defaultBackend) return _defaultBackend;
  const s3 = await createS3Backend();
  _defaultBackend = s3 ?? new LocalStorageBackend(config.attachments.dir);
  return _defaultBackend;
}

export function getStorageBackendSync(): StorageBackend {
  if (_defaultBackend) return _defaultBackend;
  _defaultBackend = new LocalStorageBackend(config.attachments.dir);
  return _defaultBackend;
}
