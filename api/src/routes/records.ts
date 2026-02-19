import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ChangeType, Impact, RecordStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth, requireEditor } from "../services/nodes.js";
import { nodeIsVisibleToUser } from "../services/nodes.js";
import {
  recordToSnapshot,
  canUserAccessRecord,
  checkSecrets,
} from "../services/records.js";
import { createAuditEvent } from "../services/audit.js";

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "Not found" });
}

export async function recordRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(req);
      const record = await prisma.changeRecord.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: {
          node: true,
          createdBy: { select: { email: true } },
          updatedBy: { select: { email: true } },
          revisions: { orderBy: { createdAt: "desc" }, include: { editor: { select: { email: true } } } },
          attachments: { where: { deletedAt: null } },
        },
      });
      if (!record) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, record.node))) return reply.status(403).send({ error: "Forbidden" });
      return record;
    }
  );

  fastify.get<{ Params: { id: string; revId: string } }>(
    "/:id/revisions/:revId",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "revId"],
          properties: { id: { type: "string" }, revId: { type: "string" } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string; revId: string } }>, reply: FastifyReply) => {
      const user = requireAuth(req);
      const record = await prisma.changeRecord.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { node: true },
      });
      if (!record) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, record.node))) return reply.status(403).send({ error: "Forbidden" });
      const rev = await prisma.recordRevision.findFirst({
        where: { recordId: req.params.id, id: req.params.revId },
        include: { editor: { select: { email: true } } },
      });
      if (!rev) return notFound(reply);
      return rev;
    }
  );

  fastify.post<{
    Body: {
      nodeId: string;
      occurredAt?: string;
      title: string;
      description: string;
      reason?: string;
      changeType?: ChangeType;
      impact?: Impact;
      status?: RecordStatus;
      links?: string[];
      secretAck?: boolean;
    };
  }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["nodeId", "title", "description"],
          properties: {
            nodeId: { type: "string" },
            occurredAt: { type: "string", format: "date-time" },
            title: { type: "string", minLength: 1, maxLength: 300 },
            description: { type: "string", minLength: 1 },
            reason: { type: "string" },
            changeType: { type: "string", enum: ["feature", "fix", "migration", "config", "other"] },
            impact: { type: "string", enum: ["low", "medium", "high"] },
            status: { type: "string", enum: ["planned", "completed", "rolled_back", "monitoring"] },
            links: { type: "array", items: { type: "string" } },
            secretAck: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    async (
      req: FastifyRequest<{
        Body: {
          nodeId: string;
          occurredAt?: string;
          title: string;
          description: string;
          reason?: string;
          changeType?: ChangeType;
          impact?: Impact;
          status?: RecordStatus;
          links?: string[];
          secretAck?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = requireEditor(req);
      const { nodeId, occurredAt, title, description, reason, changeType, impact, status, links, secretAck } = req.body;
      const nid = nodeId;
      if (!nid) return reply.status(400).send({ error: "nodeId required" });

      const node = await prisma.node.findFirst({ where: { id: nid, deletedAt: null } });
      if (!node) return notFound(reply);
      if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });

      const { hasSecrets } = checkSecrets({ title, description, reason, links });
      if (hasSecrets && !secretAck) {
        return reply.status(400).send({ error: "Secret patterns detected; confirm with secretAck: true" });
      }

      const occurred = occurredAt ? new Date(occurredAt) : new Date();
      const record = await prisma.changeRecord.create({
        data: {
          nodeId: nid,
          occurredAt: occurred,
          title,
          description,
          reason: reason ?? null,
          changeType: changeType ?? "other",
          impact: impact ?? "medium",
          status: status ?? "planned",
          links: links ?? [],
          createdById: user.id,
        },
      });

      await prisma.recordRevision.create({
        data: {
          recordId: record.id,
          editorId: user.id,
          snapshotBefore: {},
          snapshotAfter: recordToSnapshot(record) as object,
          secretAck: hasSecrets ? true : null,
        },
      });

      await createAuditEvent({ type: "record_create", actorId: user.id, metadata: { recordId: record.id, nodeId: nid } });

      const { enqueueNotifications } = await import("../services/notifications.js");
      await enqueueNotifications({ recordId: record.id, eventType: "new_record" });

      return reply.status(201).send(record);
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: Partial<{
      occurredAt: string;
      title: string;
      description: string;
      reason: string;
      changeType: ChangeType;
      impact: Impact;
      status: RecordStatus;
      links: string[];
      secretAck: boolean;
    }>;
  }>(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            occurredAt: { type: "string", format: "date-time" },
            title: { type: "string", minLength: 1, maxLength: 300 },
            description: { type: "string", minLength: 1 },
            reason: { type: "string" },
            changeType: { type: "string", enum: ["feature", "fix", "migration", "config", "other"] },
            impact: { type: "string", enum: ["low", "medium", "high"] },
            status: { type: "string", enum: ["planned", "completed", "rolled_back", "monitoring"] },
            links: { type: "array", items: { type: "string" } },
            secretAck: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: Partial<{
          occurredAt: string;
          title: string;
          description: string;
          reason: string;
          changeType: ChangeType;
          impact: Impact;
          status: RecordStatus;
          links: string[];
          secretAck: boolean;
        }>;
      }>,
      reply: FastifyReply
    ) => {
      const user = requireEditor(req);
      const record = await prisma.changeRecord.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { node: true },
      });
      if (!record) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, record.node))) return reply.status(403).send({ error: "Forbidden" });

      const updates = { ...req.body };
      const before = recordToSnapshot(record);

      const merged = {
        title: updates.title ?? record.title,
        description: updates.description ?? record.description,
        reason: updates.reason !== undefined ? updates.reason : record.reason,
        changeType: (updates.changeType ?? record.changeType) as ChangeType,
        impact: (updates.impact ?? record.impact) as Impact,
        status: (updates.status ?? record.status) as RecordStatus,
        links: updates.links ?? record.links,
        occurredAt: updates.occurredAt ? new Date(updates.occurredAt) : record.occurredAt,
      };

      const { hasSecrets } = checkSecrets({ ...merged, reason: merged.reason ?? undefined });
      if (hasSecrets && !updates.secretAck) {
        return reply.status(400).send({ error: "Secret patterns detected; confirm with secretAck: true" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const r = await tx.changeRecord.update({
          where: { id: record.id },
          data: {
            occurredAt: merged.occurredAt,
            title: merged.title,
            description: merged.description,
            reason: merged.reason,
            changeType: merged.changeType,
            impact: merged.impact,
            status: merged.status,
            links: merged.links,
            updatedById: user.id,
          },
        });

        await tx.recordRevision.create({
          data: {
            recordId: record.id,
            editorId: user.id,
            snapshotBefore: before as object,
            snapshotAfter: recordToSnapshot(r) as object,
            secretAck: hasSecrets ? true : null,
          },
        });

        return r;
      });

      await createAuditEvent({ type: "record_edit", actorId: user.id, metadata: { recordId: record.id } });

      const { enqueueNotifications } = await import("../services/notifications.js");
      await enqueueNotifications({ recordId: record.id, eventType: "edited_record" });

      return updated;
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireEditor(req);
      const record = await prisma.changeRecord.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { node: true },
      });
      if (!record) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, record.node))) return reply.status(403).send({ error: "Forbidden" });
      await prisma.changeRecord.update({ where: { id: record.id }, data: { deletedAt: new Date() } });
      await createAuditEvent({ type: "record_delete", actorId: user.id, metadata: { recordId: record.id } });
      return { ok: true };
    }
  );
}
