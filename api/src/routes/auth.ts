import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import argon2 from "argon2";
import { nanoid } from "nanoid";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { createAuditEvent } from "../services/audit.js";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 * config.sessionMaxAgeDays;

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { email: string; password: string } }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string" }, password: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !(await argon2.verify(user.passwordHash, password))) {
        await createAuditEvent({ type: "login_failure", metadata: { email } });
        return reply.status(401).send({ error: "Invalid email or password" });
      }
      const token = nanoid(32);
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
      await prisma.session.create({
        data: { userId: user.id, token, expiresAt },
      });
      await createAuditEvent({ type: "login_success", actorId: user.id, metadata: { email } });
      return { token, user: { id: user.id, email: user.email, role: user.role } };
    }
  );

  fastify.post("/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies?.[SESSION_COOKIE] ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    return { ok: true };
  });

  fastify.get("/me", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.status(401).send({ error: "Not authenticated" });
    return { user: req.user };
  });
}
