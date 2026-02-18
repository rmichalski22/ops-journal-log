import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { nodeRoutes } from "./routes/nodes.js";
import { recordRoutes } from "./routes/records.js";
import { feedRoutes } from "./routes/feeds.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { subscriptionRoutes } from "./routes/subscriptions.js";
import { adminRoutes } from "./routes/admin.js";

async function main() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });
  await fastify.register(cookie, {
    secret: config.sessionSecret,
  });
  await fastify.register(multipart, {
    limits: { fileSize: config.attachments.maxSizeBytes },
  });
  await fastify.register(authPlugin);

  fastify.setErrorHandler((err, _req, reply) => {
    if (err.message === "Unauthorized") return reply.status(401).send({ error: "Unauthorized" });
    if (err.message.startsWith("Forbidden")) return reply.status(403).send({ error: err.message });
    if (err.message === "Not found" || err.message?.includes("not found")) return reply.status(404).send({ error: err.message });
    reply.send(err);
  });

  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(nodeRoutes, { prefix: "/api/nodes" });
  await fastify.register(recordRoutes, { prefix: "/api/records" });
  await fastify.register(feedRoutes, { prefix: "/api/feeds" });
  await fastify.register(attachmentRoutes, { prefix: "/api/attachments" });
  await fastify.register(subscriptionRoutes, { prefix: "/api/subscriptions" });
  await fastify.register(adminRoutes, { prefix: "/api/admin" });

  fastify.get("/api/health", async () => ({ ok: true }));

  const { startNotificationWorker } = await import("./services/notificationWorker.js");
  startNotificationWorker(15000);

  const port = config.port;
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on http://localhost:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
