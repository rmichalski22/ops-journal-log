import { resolve } from "node:path";

function env(key: string, defaultValue?: string): string {
  const val = process.env[key] ?? defaultValue;
  if (val === undefined) throw new Error(`Missing env: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  databaseUrl: env("DATABASE_URL"),
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  sessionMaxAgeDays: parseInt(process.env.SESSION_MAX_AGE_DAYS ?? "7", 10),
  smtp: {
    host: env("SMTP_HOST", "localhost"),
    port: parseInt(process.env.SMTP_PORT ?? "1025", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: env("SMTP_FROM", "ops-journal@localhost"),
  },
  attachments: {
    dir: resolve(process.env.ATTACHMENTS_DIR ?? "./uploads"),
    maxSizeBytes: (parseInt(process.env.ATTACHMENTS_MAX_SIZE_MB ?? "10", 10) || 10) * 1024 * 1024,
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      useSsl: process.env.S3_USE_SSL !== "false",
    },
  },
} as const;
