import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { requireEditor } from "../services/nodes.js";
import { canUserAccessRecord } from "../services/records.js";
import { getStorageBackendSync } from "../lib/storage.js";
import { createAuditEvent } from "../services/audit.js";
import { nanoid } from "nanoid";

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "Not found" });
}

export async function attachmentRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { recordId: string };
  }>(
    "/:recordId",
    async (req: FastifyRequest<{ Params: { recordId: string } }>, reply: FastifyReply) => {
      const user = requireEditor(req);
      const record = await prisma.changeRecord.findFirst({
        where: { id: req.params.recordId, deletedAt: null },
        include: { node: true },
      });
      if (!record) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, record.node))) return reply.status(403).send({ error: "Forbidden" });

      const data = await req.file();
      if (!data) return reply.status(400).send({ error: "No file uploaded" });

      const buffer = await data.toBuffer();
      const sizeBytes = buffer.length;
      const storageKey = `records/${record.id}/${nanoid(12)}-${data.filename}`;
      const storage = getStorageBackendSync();
      const { Readable } = await import("node:stream");
      await storage.write(storageKey, Readable.from(buffer), sizeBytes);

      const backend = process.env.S3_ENDPOINT ? "s3" : "local";
      const att = await prisma.attachment.create({
        data: {
          recordId: record.id,
          filename: data.filename,
          mimeType: data.mimetype || "application/octet-stream",
          sizeBytes,
          storageKey,
          storageBackend: backend,
          uploadedById: user.id,
        },
      });

      await createAuditEvent({ type: "attachment_upload", actorId: user.id, metadata: { attachmentId: att.id, recordId: record.id } });

      return reply.status(201).send(att);
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    "/:id/download",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireEditor(req);
      const att = await prisma.attachment.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { record: { include: { node: true } } },
      });
      if (!att) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, att.record.node))) return reply.status(403).send({ error: "Forbidden" });

      const storage = getStorageBackendSync();
      const stream = await storage.read(att.storageKey);
      reply.header("Content-Type", att.mimeType);
      reply.header("Content-Disposition", `attachment; filename="${att.filename}"`);
      return reply.send(stream);
    }
  );

  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireEditor(req);
      const att = await prisma.attachment.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { record: { include: { node: true } } },
      });
      if (!att) return notFound(reply);
      if (!(await canUserAccessRecord(user.role, att.record.node))) return reply.status(403).send({ error: "Forbidden" });

      await prisma.attachment.update({ where: { id: att.id }, data: { deletedAt: new Date() } });
      await createAuditEvent({ type: "attachment_delete", actorId: user.id, metadata: { attachmentId: att.id } });

      return { ok: true };
    }
  );
}
