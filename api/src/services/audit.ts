import type { AuditEventType } from "@prisma/client";
import { prisma } from "../db.js";

export async function createAuditEvent(data: {
  type: AuditEventType;
  actorId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditEvent.create({
    data: {
      type: data.type,
      actorId: data.actorId ?? null,
      metadata: (data.metadata ?? {}) as object,
    },
  });
}
