import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { NodeType, VisibilityMode } from "@prisma/client";
import { prisma } from "../db.js";
import {
  createNode,
  updateNodePathRecursive,
  nodeIsVisibleToUser,
  requireAuth,
  requireEditor,
  requireAdmin,
} from "../services/nodes.js";
import { createAuditEvent } from "../services/audit.js";

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "Not found" });
}

export async function nodeRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(req);
    const roots = await prisma.node.findMany({
      where: { parentId: null, deletedAt: null },
      include: { createdBy: { select: { email: true } } },
      orderBy: { name: "asc" },
    });
    const visible: typeof roots = [];
    for (const n of roots) {
      if (await nodeIsVisibleToUser(user.role, n)) visible.push(n);
    }
    return { nodes: visible };
  });

  fastify.get("/tree", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(req);
    const all = await prisma.node.findMany({
      where: { deletedAt: null },
      select: { id: true, parentId: true, name: true, slug: true, path: true, pathIds: true, visibilityMode: true, allowedRoles: true },
    });
    const visibleIds = new Set<string>();
    for (const n of all) {
      const ok = await nodeIsVisibleToUser(user.role, n);
      if (ok) visibleIds.add(n.id);
    }
    function filter(nodes: typeof all): typeof all {
      return nodes.filter((n) => visibleIds.has(n.id));
    }
    function build(parentId: string | null): unknown[] {
      const children = filter(all.filter((n) => n.parentId === parentId));
      return children.map((c) => ({
        ...c,
        children: build(c.id),
      }));
    }
    return { tree: build(null) };
  });

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(req);
      const node = await prisma.node.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: { parent: true, createdBy: { select: { email: true } }, records: { where: { deletedAt: null }, take: 50 } },
      });
      if (!node) return notFound(reply);
      if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });
      return node;
    }
  );

  fastify.post<{
    Body: { parentId?: string; name: string; type?: NodeType; visibilityMode?: VisibilityMode; allowedRoles?: string[] };
  }>(
    "/",
    async (req: FastifyRequest<{ Body: { parentId?: string; name: string; type?: NodeType; visibilityMode?: VisibilityMode; allowedRoles?: string[] } }>, reply: FastifyReply) => {
      const user = requireEditor(req);
      const { parentId, name, type, visibilityMode } = req.body;
      const allowedRoles = req.body.allowedRoles?.filter((r) => r === "admin" || r === "editor") as ("admin" | "editor")[] | undefined;
      if (parentId) {
        const parent = await prisma.node.findFirst({ where: { id: parentId, deletedAt: null } });
        if (!parent) return reply.status(404).send({ error: "Parent not found" });
        if (!(await nodeIsVisibleToUser(user.role, parent))) return reply.status(403).send({ error: "Forbidden" });
      }
      const node = await createNode({
        parentId: parentId ?? null,
        name,
        type,
        visibilityMode,
        allowedRoles,
        createdById: user.id,
      });
      await createAuditEvent({ type: "node_create", actorId: user.id, metadata: { nodeId: node.id, name } });
      return reply.status(201).send(node);
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: { name?: string; type?: NodeType; visibilityMode?: VisibilityMode; allowedRoles?: string[]; parentId?: string };
  }>(
    "/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; type?: NodeType; visibilityMode?: VisibilityMode; allowedRoles?: string[]; parentId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const user = requireEditor(req);
      const node = await prisma.node.findFirst({ where: { id: req.params.id, deletedAt: null } });
      if (!node) return notFound(reply);
      if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });

      const { name, type, visibilityMode, allowedRoles: ar, parentId: newParentId } = req.body;
      const allowedRoles = ar?.filter((r) => r === "admin" || r === "editor") as ("admin" | "editor")[] | undefined;

      const moveNode = newParentId !== undefined && newParentId !== node.parentId;
      if (moveNode && !requireAdmin(req)) {
        return reply.status(403).send({ error: "Only admin can move nodes" });
      }
      if ((visibilityMode || allowedRoles) && !requireAdmin(req)) {
        return reply.status(403).send({ error: "Only admin can restrict visibility" });
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (type !== undefined) updates.type = type;
      if (visibilityMode !== undefined) updates.visibilityMode = visibilityMode;
      if (allowedRoles !== undefined) updates.allowedRoles = allowedRoles;

      if (name !== undefined) {
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "node";
        updates.slug = slug;
        const parentPath = node.parentId
          ? (await prisma.node.findUnique({ where: { id: node.parentId } }))?.path ?? ""
          : "";
        updates.path = parentPath ? `${parentPath}/${slug}` : `/${slug}`;
      }

      if (moveNode && newParentId !== null) {
        const newParent = await prisma.node.findFirst({ where: { id: newParentId, deletedAt: null } });
        if (!newParent) return reply.status(400).send({ error: "New parent not found" });
        const newPath = `${newParent.path}/${node.slug}`;
        const newPathIds = [...newParent.pathIds, newParentId];
        updates.parentId = newParentId;
        updates.path = newPath;
        updates.pathIds = newPathIds;
        await prisma.node.update({ where: { id: node.id }, data: updates as object });
        await updateNodePathRecursive(node.id, newPath, newPathIds);
        await createAuditEvent({ type: "node_move", actorId: user.id, metadata: { nodeId: node.id, from: node.parentId, to: newParentId } });
      } else if (visibilityMode === "restricted" || (node.visibilityMode === "restricted" && allowedRoles !== undefined)) {
        await prisma.node.update({ where: { id: node.id }, data: updates as object });
        await createAuditEvent({ type: "node_restrict", actorId: user.id, metadata: { nodeId: node.id } });
      } else if (name !== undefined) {
        const path = (updates.path as string) ?? node.path;
        await prisma.node.update({ where: { id: node.id }, data: updates as object });
        await updateNodePathRecursive(node.id, path, node.pathIds);
        await createAuditEvent({ type: "node_rename", actorId: user.id, metadata: { nodeId: node.id, name } });
      } else if (Object.keys(updates).length > 0) {
        await prisma.node.update({ where: { id: node.id }, data: updates as object });
      }

      const updated = await prisma.node.findUnique({ where: { id: node.id } });
      return updated;
    }
  );

  fastify.delete<{ Params: { id: string } }>("/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = requireEditor(req);
    const node = await prisma.node.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!node) return notFound(reply);
    if (!(await nodeIsVisibleToUser(user.role, node))) return reply.status(403).send({ error: "Forbidden" });
    await prisma.node.update({ where: { id: node.id }, data: { deletedAt: new Date() } });
    await createAuditEvent({ type: "node_delete", actorId: user.id, metadata: { nodeId: node.id } });
    return { ok: true };
  });
}
