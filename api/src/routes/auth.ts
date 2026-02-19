import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import argon2 from "argon2";
import { nanoid } from "nanoid";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { createAuditEvent } from "../services/audit.js";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000 * config.sessionMaxAgeDays;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 5;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function attemptKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) return false;
  if (now - state.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return state.count >= LOGIN_ATTEMPT_LIMIT;
}

function registerAttempt(key: string) {
  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state || now - state.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  state.count += 1;
  loginAttempts.set(key, state);
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

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
      const key = attemptKey(email, req.ip);
      if (isRateLimited(key)) {
        await createAuditEvent({ type: "login_failure", metadata: { email, ip: req.ip, reason: "rate_limited" } });
        return reply.status(429).send({ error: "Too many login attempts. Try again later." });
      }
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !(await argon2.verify(user.passwordHash, password))) {
        registerAttempt(key);
        await createAuditEvent({ type: "login_failure", metadata: { email, ip: req.ip } });
        return reply.status(401).send({ error: "Invalid email or password" });
      }

      clearAttempts(key);
      const currentToken = req.cookies?.[SESSION_COOKIE];
      if (currentToken) {
        await prisma.session.deleteMany({ where: { token: currentToken } });
      }
      const token = nanoid(32);
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.session.create({
        data: { userId: user.id, token, expiresAt },
      });
      await createAuditEvent({ type: "login_success", actorId: user.id, metadata: { email } });
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: config.sessionMaxAgeDays * 24 * 60 * 60,
      });
      return { user: { id: user.id, email: user.email, role: user.role } };
    }
  );

  fastify.post("/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  fastify.get("/me", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.status(401).send({ error: "Not authenticated" });
    return { user: req.user };
  });
}
