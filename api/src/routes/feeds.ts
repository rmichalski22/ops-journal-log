import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ChangeType, Impact, RecordStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../services/nodes.js";
import { nodeIsVisibleToUser } from "../services/nodes.js";

export async function feedRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      nodeId?: string;
      includeDescendants?: string;
      createdById?: string;
      changeType?: ChangeType;
      impact?: Impact;
      status?: RecordStatus;
      limit?: string;
      offset?: string;
    };
  }>("/", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          nodeId: { type: "string" },
          includeDescendants: { type: "string", enum: ["true", "false"] },
          createdById: { type: "string" },
          changeType: { type: "string", enum: ["feature", "fix", "migration", "config", "other"] },
          impact: { type: "string", enum: ["low", "medium", "high"] },
          status: { type: "string", enum: ["planned", "completed", "rolled_back", "monitoring"] },
          limit: { type: "string" },
          offset: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  }, async (req: FastifyRequest<{ Querystring: Record<string, string | undefined> }>, reply: FastifyReply) => {
    const user = requireAuth(req);
    const {
      from,
      to,
      nodeId,
      includeDescendants,
      createdById,
      changeType,
      impact,
      status,
      limit,
      offset,
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { deletedAt: null };

    if (from || to) {
      where.occurredAt = {};
      if (from) (where.occurredAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.occurredAt as Record<string, Date>).lte = new Date(to);
    }
    if (changeType) where.changeType = changeType;
    if (impact) where.impact = impact;
    if (status) where.status = status;
    if (createdById) where.createdById = createdById;

    if (nodeId) {
      const node = await prisma.node.findFirst({ where: { id: nodeId, deletedAt: null } });
      if (!node) return reply.status(404).send({ error: "Node not found" });
      if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });
      if (includeDescendants === "true") {
        where.OR = [
          { nodeId },
          { node: { pathIds: { has: nodeId } } },
        ];
      } else {
        where.nodeId = nodeId;
      }
    }

    const limitNum = Math.min(parseInt(limit ?? "50", 10) || 50, 100);
    const offsetNum = parseInt(offset ?? "0", 10) || 0;

    const records = await prisma.changeRecord.findMany({
      where,
      include: {
        node: { select: { id: true, name: true, path: true, pathIds: true, visibilityMode: true, allowedRoles: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: limitNum,
      skip: offsetNum,
    });

    const visible: typeof records = [];
    for (const r of records) {
      if (await nodeIsVisibleToUser(user.role, r.node)) {
        visible.push(r);
      }
    }

    const sanitizedRecords = visible.map((r) => ({
      ...r,
      node: { id: r.node.id, name: r.node.name, path: r.node.path },
    }));

    return { records: sanitizedRecords, total: sanitizedRecords.length, limit: limitNum, offset: offsetNum };
  });
}
