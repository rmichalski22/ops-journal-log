import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuditEventType } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin } from "../services/nodes.js";

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      type?: AuditEventType;
      actorId?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/audit",
    async (req: FastifyRequest<{ Querystring: Record<string, string | undefined> }>, reply: FastifyReply) => {
      requireAdmin(req);
      const { type, actorId, from, to, limit, offset } = req.query as Record<string, string | undefined>;

      const where: Record<string, unknown> = {};
      if (type) where.type = type;
      if (actorId) where.actorId = actorId;
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
        if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
      }

      const limitNum = Math.min(parseInt(limit ?? "50", 10) || 50, 100);
      const offsetNum = parseInt(offset ?? "0", 10) || 0;

      const [events, total] = await Promise.all([
        prisma.auditEvent.findMany({
          where,
          include: { actor: { select: { email: true } } },
          orderBy: { createdAt: "desc" },
          take: limitNum,
          skip: offsetNum,
        }),
        prisma.auditEvent.count({ where }),
      ]);

      return { events, total, limit: limitNum, offset: offsetNum };
    }
  );
}
