-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'editor');
CREATE TYPE "VisibilityMode" AS ENUM ('inherit', 'public_internal', 'restricted');
CREATE TYPE "NodeType" AS ENUM ('system', 'service', 'module', 'other');
CREATE TYPE "ChangeType" AS ENUM ('feature', 'fix', 'migration', 'config', 'other');
CREATE TYPE "Impact" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "RecordStatus" AS ENUM ('planned', 'completed', 'rolled_back', 'monitoring');
CREATE TYPE "SubscriptionMode" AS ENUM ('immediate', 'daily', 'weekly');
CREATE TYPE "NotificationEventType" AS ENUM ('new_record', 'edited_record');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "AuditEventType" AS ENUM ('node_create', 'node_rename', 'node_move', 'node_restrict', 'node_delete', 'record_create', 'record_edit', 'record_delete', 'attachment_upload', 'attachment_delete', 'subscription_add', 'subscription_remove', 'notification_sent', 'notification_failure', 'login_success', 'login_failure');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "NodeType" NOT NULL DEFAULT 'other',
    "path" TEXT NOT NULL,
    "pathIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibilityMode" "VisibilityMode" NOT NULL DEFAULT 'public_internal',
    "allowedRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRecord" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "changeType" "ChangeType" NOT NULL DEFAULT 'other',
    "impact" "Impact" NOT NULL DEFAULT 'medium',
    "status" "RecordStatus" NOT NULL DEFAULT 'planned',
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChangeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "snapshotBefore" JSONB NOT NULL,
    "snapshotAfter" JSONB NOT NULL,
    "secretAck" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageBackend" TEXT NOT NULL DEFAULT 'local',
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnEdit" BOOLEAN NOT NULL DEFAULT true,
    "mode" "SubscriptionMode" NOT NULL DEFAULT 'immediate',
    "impactThreshold" "Impact",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "eventType" "NotificationEventType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX "Node_parentId_slug_key" ON "Node"("parentId", "slug");
CREATE INDEX "Node_parentId_idx" ON "Node"("parentId");
CREATE INDEX "Node_deletedAt_idx" ON "Node"("deletedAt");
CREATE INDEX "Node_path_idx" ON "Node"("path");
CREATE INDEX "ChangeRecord_nodeId_idx" ON "ChangeRecord"("nodeId");
CREATE INDEX "ChangeRecord_occurredAt_idx" ON "ChangeRecord"("occurredAt");
CREATE INDEX "ChangeRecord_status_idx" ON "ChangeRecord"("status");
CREATE INDEX "ChangeRecord_deletedAt_idx" ON "ChangeRecord"("deletedAt");
CREATE INDEX "RecordRevision_recordId_idx" ON "RecordRevision"("recordId");
CREATE INDEX "Attachment_recordId_idx" ON "Attachment"("recordId");
CREATE UNIQUE INDEX "Subscription_userId_nodeId_key" ON "Subscription"("userId", "nodeId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_nodeId_idx" ON "Subscription"("nodeId");
CREATE INDEX "NotificationOutbox_status_scheduledAt_idx" ON "NotificationOutbox"("status", "scheduledAt");
CREATE INDEX "NotificationOutbox_userId_idx" ON "NotificationOutbox"("userId");
CREATE INDEX "NotificationOutbox_subscriptionId_idx" ON "NotificationOutbox"("subscriptionId");
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Node" ADD CONSTRAINT "Node_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRecord" ADD CONSTRAINT "ChangeRecord_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeRecord" ADD CONSTRAINT "ChangeRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRecord" ADD CONSTRAINT "ChangeRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecordRevision" ADD CONSTRAINT "RecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ChangeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordRevision" ADD CONSTRAINT "RecordRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ChangeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ChangeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
