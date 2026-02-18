import type { NodeType, Role, VisibilityMode } from "@prisma/client";
import { prisma } from "../db.js";
import { canUserSeeNode, canEditNodes, canAdminNodes } from "../lib/permissions.js";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "node";
}

export function buildPath(parentPath: string | null, slug: string): string {
  return parentPath ? `${parentPath}/${slug}` : `/${slug}`;
}

export function buildPathIds(parentPathIds: string[], parentId: string): string[] {
  return [...parentPathIds, parentId];
}

export async function getAncestorNodes(pathIds: string[]) {
  if (pathIds.length === 0) return [];
  const nodes = await prisma.node.findMany({
    where: { id: { in: pathIds } },
    select: { id: true, visibilityMode: true, allowedRoles: true },
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return pathIds.map((id) => byId.get(id)!).filter(Boolean);
}

export async function nodeIsVisibleToUser(
  userRole: Role,
  node: { pathIds: string[]; visibilityMode: VisibilityMode; allowedRoles: Role[] }
): Promise<boolean> {
  const ancestors = await getAncestorNodes(node.pathIds);
  const res = canUserSeeNode(userRole, node, ancestors);
  return res.visible;
}

export async function createNode(data: {
  parentId?: string | null;
  name: string;
  type?: NodeType;
  visibilityMode?: VisibilityMode;
  allowedRoles?: Role[];
  createdById: string;
}) {
  let parentPath = "";
  let parentPathIds: string[] = [];
  if (data.parentId) {
    const parent = await prisma.node.findFirst({
      where: { id: data.parentId, deletedAt: null },
    });
    if (!parent) throw new Error("Parent node not found");
    parentPath = parent.path;
    parentPathIds = parent.pathIds;
  }

  const slug = slugify(data.name);
  if (!data.parentId) {
    const existing = await prisma.node.findFirst({ where: { parentId: null, slug, deletedAt: null } });
    if (existing) throw new Error(`Root node with slug "${slug}" already exists`);
  }
  const path = buildPath(parentPath || null, slug);

  const node = await prisma.node.create({
    data: {
      parentId: data.parentId ?? null,
      name: data.name,
      slug,
      type: data.type ?? "other",
      path,
      pathIds: data.parentId ? buildPathIds(parentPathIds, data.parentId) : [],
      visibilityMode: data.visibilityMode ?? "public_internal",
      allowedRoles: data.allowedRoles ?? [],
      createdById: data.createdById,
    },
  });
  return node;
}

export async function updateNodePathRecursive(nodeId: string, newPath: string, newPathIds: string[]) {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return;
  await prisma.node.update({
    where: { id: nodeId },
    data: { path: newPath, pathIds: newPathIds },
  });
  const children = await prisma.node.findMany({
    where: { parentId: nodeId, deletedAt: null },
  });
  for (const child of children) {
    const childPath = `${newPath}/${child.slug}`;
    const childPathIds = [...newPathIds, nodeId];
    await updateNodePathRecursive(child.id, childPath, childPathIds);
  }
}

export function requireAuth(req: { user?: { id: string; role: Role } }): { id: string; role: Role } {
  if (!req.user) {
    const e = new Error("Unauthorized");
    (e as { statusCode?: number }).statusCode = 401;
    throw e;
  }
  return req.user;
}

export function requireEditor(req: { user?: { id: string; role: Role } }): { id: string; role: Role } {
  const u = requireAuth(req);
  if (!canEditNodes(u.role)) throw new Error("Forbidden: editor or admin required");
  return u;
}

export function requireAdmin(req: { user?: { id: string; role: Role } }): { id: string; role: Role } {
  const u = requireAuth(req);
  if (!canAdminNodes(u.role)) throw new Error("Forbidden: admin required");
  return u;
}
