import { prisma } from "../db.js";
import { sendNotificationEmail } from "./email.js";
import { createAuditEvent } from "./audit.js";

export async function processNotificationOutbox() {
  const pending = await prisma.notificationOutbox.findMany({
    where: { status: "pending" },
    take: 20,
    include: {
      user: true,
      record: { include: { node: true } },
    },
  });

  for (const n of pending) {
    const subject =
      n.eventType === "new_record"
        ? `New change: ${n.record.title}`
        : `Change updated: ${n.record.title}`;
    const html = `
      <p>${n.eventType === "new_record" ? "New change record" : "Change record updated"}: <strong>${n.record.title}</strong></p>
      <p>Node: ${n.record.node.name}</p>
      <p><a href="${process.env.API_URL ?? "http://localhost:3001"}/records/${n.record.id}">View record</a></p>
    `;

    const result = await sendNotificationEmail({
      to: n.user.email,
      subject,
      html,
    });

    if (result.ok) {
      await prisma.notificationOutbox.update({
        where: { id: n.id },
        data: { status: "sent", sentAt: new Date() },
      });
      await createAuditEvent({
        type: "notification_sent",
        actorId: n.userId,
        metadata: { outboxId: n.id, recordId: n.recordId },
      });
    } else {
      await prisma.notificationOutbox.update({
        where: { id: n.id },
        data: { status: "failed", failedAt: new Date(), errorMessage: result.error ?? "Unknown error" },
      });
      await createAuditEvent({
        type: "notification_failure",
        metadata: { outboxId: n.id, error: result.error },
      });
    }
  }
}

let interval: ReturnType<typeof setInterval> | null = null;

export function startNotificationWorker(intervalMs = 10000) {
  if (interval) return;
  processNotificationOutbox().catch(console.error);
  interval = setInterval(() => processNotificationOutbox().catch(console.error), intervalMs);
}

export function stopNotificationWorker() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
