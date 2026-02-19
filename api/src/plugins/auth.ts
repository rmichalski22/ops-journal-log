import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import { prisma } from "../db.js";
import type { SessionUser } from "../types.js";
import { config } from "../config.js";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 * config.sessionMaxAgeDays;
const ROTATE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("user", undefined as SessionUser | undefined);

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

    if (session.expiresAt.getTime() - Date.now() < ROTATE_THRESHOLD_MS) {
      const newToken = nanoid(32);
      const newExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
      await prisma.session.update({ where: { id: session.id }, data: { token: newToken, expiresAt: newExpiresAt } });
      reply.setCookie(SESSION_COOKIE, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: config.sessionMaxAgeDays * 24 * 60 * 60,
      });
    }

    (req as FastifyRequest & { user?: SessionUser }).user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };
  });
}
