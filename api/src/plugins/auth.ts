import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";
import type { SessionUser } from "../types.js";

const SESSION_COOKIE = "session";

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("user", null as SessionUser | null | undefined);

  fastify.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies?.[SESSION_COOKIE] ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      return;
    }
    (req as FastifyRequest & { user?: SessionUser }).user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
  });
}
