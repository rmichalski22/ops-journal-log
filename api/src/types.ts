import type { Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}
