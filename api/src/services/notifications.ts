import type { Impact } from "@prisma/client";
import { prisma } from "../db.js";

const IMPACT_ORDER: Impact[] = ["low", "medium", "high"];

function impactMeetsThreshold(recordImpact: Impact, threshold: Impact | null): boolean {
  if (!threshold) return true;
  return IMPACT_ORDER.indexOf(recordImpact) >= IMPACT_ORDER.indexOf(threshold);
}

export async function enqueueNotifications(data: { recordId: string; eventType: "new_record" | "edited_record" }) {
  const record = await prisma.changeRecord.findUnique({
    where: { id: data.recordId },
    include: { node: true },
  });
  if (!record) return;

  const ifEdit = data.eventType === "edited_record";

  const directSubs = await prisma.subscription.findMany({
    where: {
      nodeId: record.nodeId,
      mode: "immediate",
      notifyOnEdit: ifEdit ? true : undefined,
    },
  });

  const ancestorIds = record.node.pathIds;
  const ancestorSubs = await prisma.subscription.findMany({
    where: {
      includeDescendants: true,
      mode: "immediate",
      notifyOnEdit: ifEdit ? true : undefined,
      nodeId: { in: ancestorIds },
    },
  });

  const seen = new Set<string>();
  const allSubs = [...directSubs, ...ancestorSubs];
  const rows: Array<{ userId: string; recordId: string; subscriptionId: string; eventType: "new_record" | "edited_record"; status: "pending" }> = [];
  for (const sub of allSubs) {
    const key = `${sub.userId}-${sub.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!impactMeetsThreshold(record.impact, sub.impactThreshold)) continue;
    rows.push({
      userId: sub.userId,
      recordId: record.id,
      subscriptionId: sub.id,
      eventType: data.eventType,
      status: "pending",
    });
  }
  if (rows.length > 0) {
    await prisma.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
  }
}
