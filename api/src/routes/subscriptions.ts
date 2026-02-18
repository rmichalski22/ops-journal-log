import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { SubscriptionMode } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../services/nodes.js";
import { nodeIsVisibleToUser } from "../services/nodes.js";
import { createAuditEvent } from "../services/audit.js";

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "Not found" });
}

export async function subscriptionRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(req);
    const subs = await prisma.subscription.findMany({
      where: { userId: user.id },
      include: { node: { select: { id: true, name: true, path: true } } },
    });
    const visible: typeof subs = [];
    for (const s of subs) {
      if (await nodeIsVisibleToUser(user.role, s.node)) visible.push(s);
    }
    return { subscriptions: visible };
  });

  fastify.post<{
    Body: {
      nodeId: string;
      includeDescendants?: boolean;
      notifyOnEdit?: boolean;
      mode?: SubscriptionMode;
      impactThreshold?: string;
    };
  }>(
    "/",
    async (
      req: FastifyRequest<{
        Body: {
          nodeId: string;
          includeDescendants?: boolean;
          notifyOnEdit?: boolean;
          mode?: SubscriptionMode;
          impactThreshold?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(req);
      const { nodeId, includeDescendants, notifyOnEdit, mode, impactThreshold } = req.body;

      const node = await prisma.node.findFirst({ where: { id: nodeId, deletedAt: null } });
      if (!node) return notFound(reply);
      if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });

      const th = impactThreshold === "low" || impactThreshold === "medium" || impactThreshold === "high" ? impactThreshold : null;

      const sub = await prisma.subscription.upsert({
        where: { userId_nodeId: { userId: user.id, nodeId } },
        create: {
          userId: user.id,
          nodeId,
          includeDescendants: includeDescendants ?? true,
          notifyOnEdit: notifyOnEdit ?? true,
          mode: mode ?? "immediate",
          impactThreshold: th,
        },
        update: {
          includeDescendants: includeDescendants ?? undefined,
          notifyOnEdit: notifyOnEdit ?? undefined,
          mode: mode ?? undefined,
          impactThreshold: th ?? undefined,
        },
      });

      await createAuditEvent({ type: "subscription_add", actorId: user.id, metadata: { subscriptionId: sub.id, nodeId } });

      return reply.status(201).send(sub);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(req);
      const sub = await prisma.subscription.findFirst({
        where: { id: req.params.id, userId: user.id },
      });
      if (!sub) return notFound(reply);
      await prisma.subscription.delete({ where: { id: sub.id } });
      await createAuditEvent({ type: "subscription_remove", actorId: user.id, metadata: { subscriptionId: sub.id } });
      return { ok: true };
    }
  );
}
