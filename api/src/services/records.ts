import type { ChangeType, Impact, RecordStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { nodeIsVisibleToUser } from "./nodes.js";
import { scanRecordForSecrets } from "../lib/secrets.js";

export interface RecordSnapshot {
  title: string;
  description: string;
  reason: string | null;
  changeType: ChangeType;
  impact: Impact;
  status: RecordStatus;
  links: string[];
  occurredAt: string;
}

export function recordToSnapshot(r: {
  title: string;
  description: string;
  reason: string | null;
  changeType: ChangeType;
  impact: Impact;
  status: RecordStatus;
  links: string[];
  occurredAt: Date;
}): RecordSnapshot {
  return {
    title: r.title,
    description: r.description,
    reason: r.reason,
    changeType: r.changeType,
    impact: r.impact,
    status: r.status,
    links: r.links,
    occurredAt: r.occurredAt.toISOString(),
  };
}

export async function canUserAccessRecord(
  userRole: string,
  node: { pathIds: string[]; visibilityMode: string; allowedRoles: unknown[] }
): Promise<boolean> {
  return nodeIsVisibleToUser(userRole as "admin" | "editor", node as Parameters<typeof nodeIsVisibleToUser>[1]);
}

export function checkSecrets(data: { title?: string; description?: string; reason?: string | null; links?: string[] }): {
  hasSecrets: boolean;
} {
  return { hasSecrets: scanRecordForSecrets(data) };
}
