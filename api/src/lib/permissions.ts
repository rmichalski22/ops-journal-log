import type { Node, Role, VisibilityMode } from "@prisma/client";

/**
 * Centralized permission evaluation for node visibility.
 * Uses path/pathIds to determine effective visibility without walking the tree.
 */

export type VisibilityResolution =
  | { visible: true }
  | { visible: false; reason: string };

/**
 * Resolve effective visibility for a node given user role and node's pathIds.
 * Fetches ancestor nodes from pathIds and checks first restricted ancestor.
 * User can see node iff their role is in allowedRoles at the first restricted ancestor.
 */
export function canUserSeeNode(
  userRole: Role,
  node: Pick<Node, "pathIds" | "visibilityMode" | "allowedRoles">,
  ancestorNodes: Array<Pick<Node, "visibilityMode" | "allowedRoles">>
): VisibilityResolution {
  const chain = [...ancestorNodes, node];
  let effectiveRestriction: Role[] | null = null;

  for (const current of chain) {
    if (current.visibilityMode === "restricted") {
      effectiveRestriction = current.allowedRoles;
      continue;
    }
    if (current.visibilityMode === "public_internal") {
      effectiveRestriction = null;
    }
  }

  if (effectiveRestriction) {
    if (effectiveRestriction.length === 0) {
      return { visible: false, reason: "restricted with no allowed roles" };
    }
    if (!effectiveRestriction.includes(userRole)) {
      return { visible: false, reason: "role not in allowed roles" };
    }
  }
  return { visible: true };
}

/**
 * Check if user can create/edit nodes. Editors and admins can.
 */
export function canEditNodes(role: Role): boolean {
  return role === "admin" || role === "editor";
}

/**
 * Check if user can move nodes or restrict visibility. Only admins can.
 */
export function canAdminNodes(role: Role): boolean {
  return role === "admin";
}
