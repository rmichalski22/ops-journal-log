CREATE UNIQUE INDEX IF NOT EXISTS "NotificationOutbox_userId_recordId_eventType_subscriptionId_key"
ON "NotificationOutbox" ("userId", "recordId", "eventType", "subscriptionId");
