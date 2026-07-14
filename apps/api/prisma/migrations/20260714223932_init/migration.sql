-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "upn" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "department" TEXT,
    "org" TEXT,
    "managerId" TEXT,
    "appRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entraGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSignIn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "color" TEXT,
    "desc" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "targetDate" TIMESTAMP(3),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleStep" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'upcoming',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CycleStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleParticipant" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" TEXT,
    "dueDate" TIMESTAMP(3),
    "extended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CycleParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "templateId" TEXT NOT NULL,
    "cycleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "managerReviewDone" BOOLEAN NOT NULL DEFAULT false,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "employeeSelf" JSONB,
    "managerReview" JSONB,
    "employeeScore" INTEGER,
    "managerScore" INTEGER,
    "finalCommentEmployee" TEXT,
    "finalCommentManager" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "appraisalId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "ip" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "preview" TEXT,
    "toUserId" TEXT,
    "toEmail" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "graphMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "objectRef" TEXT,
    "sourceIp" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_upn_key" ON "User"("upn");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_org_idx" ON "User"("org");

-- CreateIndex
CREATE INDEX "Section_templateId_idx" ON "Section"("templateId");

-- CreateIndex
CREATE INDEX "Field_sectionId_idx" ON "Field"("sectionId");

-- CreateIndex
CREATE INDEX "CycleStep_cycleId_idx" ON "CycleStep"("cycleId");

-- CreateIndex
CREATE INDEX "CycleParticipant_cycleId_idx" ON "CycleParticipant"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleParticipant_cycleId_userId_key" ON "CycleParticipant"("cycleId", "userId");

-- CreateIndex
CREATE INDEX "Appraisal_employeeId_idx" ON "Appraisal"("employeeId");

-- CreateIndex
CREATE INDEX "Appraisal_managerId_idx" ON "Appraisal"("managerId");

-- CreateIndex
CREATE INDEX "Appraisal_status_idx" ON "Appraisal"("status");

-- CreateIndex
CREATE INDEX "Signature_appraisalId_idx" ON "Signature"("appraisalId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_appraisalId_party_key" ON "Signature"("appraisalId", "party");

-- CreateIndex
CREATE INDEX "Notification_toUserId_idx" ON "Notification"("toUserId");

-- CreateIndex
CREATE INDEX "Notification_sentAt_idx" ON "Notification"("sentAt");

-- CreateIndex
CREATE INDEX "AuditEvent_ts_idx" ON "AuditEvent"("ts");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleStep" ADD CONSTRAINT "CycleStep_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleParticipant" ADD CONSTRAINT "CycleParticipant_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_appraisalId_fkey" FOREIGN KEY ("appraisalId") REFERENCES "Appraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
