-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "club_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "membership_policy" AS ENUM ('OPEN', 'APPROVAL_REQUIRED', 'INVITE_ONLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "club_role" AS ENUM ('LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'EXPIRED', 'ENDED');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'ONGOING', 'COMPLETED', 'CERTIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "attendance_policy" AS ENUM ('CHECK_IN_ONLY');

-- CreateEnum
CREATE TYPE "event_responsibility" AS ENUM ('EVENT_LEAD', 'OPERATIONS', 'MARKETING');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED', 'CHECKED_IN', 'ATTENDED', 'NO_SHOW', 'REMOVED');

-- CreateEnum
CREATE TYPE "registration_source" AS ENUM ('SELF', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "attendance_method" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "certificate_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('SUCCESS', 'DENIED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "platform_role" "platform_role" NOT NULL DEFAULT 'STUDENT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "academic_year" TEXT NOT NULL,
    "logo_url" TEXT NOT NULL,
    "banner_url" TEXT,
    "membership_policy" "membership_policy" NOT NULL DEFAULT 'OPEN',
    "status" "club_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_team_appointment" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "club_role" NOT NULL,
    "status" "appointment_status" NOT NULL DEFAULT 'INVITED',
    "invited_by_id" UUID NOT NULL,
    "invitation_token_hash" TEXT,
    "invitation_expires_at" TIMESTAMPTZ(3),
    "term_start" TIMESTAMPTZ(3),
    "term_end" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "ended_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_team_appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_membership" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "decision_reason" TEXT,

    CONSTRAINT "club_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "venue" TEXT,
    "online_url" TEXT,
    "banner_url" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "registration_opens_at" TIMESTAMPTZ(3) NOT NULL,
    "registration_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT true,
    "requires_club_membership" BOOLEAN NOT NULL DEFAULT false,
    "eligibility_rules" JSONB,
    "certificate_enabled" BOOLEAN NOT NULL DEFAULT false,
    "certificate_title" TEXT,
    "certificate_signatory" TEXT,
    "attendance_policy" "attendance_policy" NOT NULL DEFAULT 'CHECK_IN_ONLY',
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "cancelled_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_assignment" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "responsibility" "event_responsibility" NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'CONFIRMED',
    "waitlist_position" INTEGER,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "promoted_at" TIMESTAMPTZ(3),
    "source" "registration_source" NOT NULL DEFAULT 'SELF',
    "override_reason" TEXT,

    CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_by_id" UUID NOT NULL,
    "method" "attendance_method" NOT NULL,
    "manual_reason" TEXT,
    "corrected_at" TIMESTAMPTZ(3),
    "corrected_by_id" UUID,
    "correction_reason" TEXT,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "verification_code" TEXT NOT NULL,
    "status" "certificate_status" NOT NULL DEFAULT 'ACTIVE',
    "holder_name_snapshot" TEXT NOT NULL,
    "event_title_snapshot" TEXT NOT NULL,
    "club_name_snapshot" TEXT NOT NULL,
    "club_logo_snapshot_url" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" TEXT,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "email_status" "email_status" NOT NULL DEFAULT 'PENDING',
    "email_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "club_name_key" ON "club"("name");

-- CreateIndex
CREATE UNIQUE INDEX "club_slug_key" ON "club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "club_team_appointment_invitation_token_hash_key" ON "club_team_appointment"("invitation_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "event_club_id_slug_key" ON "event"("club_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "event_assignment_event_id_user_id_responsibility_key" ON "event_assignment"("event_id", "user_id", "responsibility");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_registration_id_key" ON "attendance_record"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_serial_number_key" ON "certificate"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_verification_code_key" ON "certificate"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_user_id_dedupe_key_key" ON "notification"("user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club" ADD CONSTRAINT "club_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_team_appointment" ADD CONSTRAINT "club_team_appointment_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_team_appointment" ADD CONSTRAINT "club_team_appointment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignment" ADD CONSTRAINT "event_assignment_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignment" ADD CONSTRAINT "event_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Email is the identity key, stored lowercased so no path can create a case-variant duplicate.
ALTER TABLE "user" ADD CONSTRAINT "user_email_lowercase" CHECK ("email" = lower("email"));

-- One active Lead per club.
CREATE UNIQUE INDEX "club_team_appointment_one_active_lead"
  ON "club_team_appointment" ("club_id")
  WHERE "role" = 'LEAD' AND "status" = 'ACTIVE';

-- One open appointment per (club, user, role), so two invitations cannot both be accepted.
CREATE UNIQUE INDEX "club_team_appointment_one_open_per_role"
  ON "club_team_appointment" ("club_id", "user_id", "role")
  WHERE "status" IN ('INVITED', 'ACTIVE');

-- One open membership per (user, club), PENDING included.
CREATE UNIQUE INDEX "club_membership_one_open_per_user"
  ON "club_membership" ("club_id", "user_id")
  WHERE "status" IN ('PENDING', 'ACTIVE');

-- Capacity is never exceeded, even if the counter code is wrong.
ALTER TABLE "event"
  ADD CONSTRAINT "event_capacity_bounds"
  CHECK ("capacity" > 0 AND "confirmed_count" >= 0 AND "confirmed_count" <= "capacity");

ALTER TABLE "event"
  ADD CONSTRAINT "event_time_window"
  CHECK ("starts_at" < "ends_at");

-- One open registration per (user, event). A cancelled student may register again.
CREATE UNIQUE INDEX "event_registration_one_open_per_user"
  ON "event_registration" ("event_id", "user_id")
  WHERE "status" <> 'CANCELLED';

-- One ACTIVE certificate per registration, which makes issuing idempotent.
CREATE UNIQUE INDEX "certificate_one_active_per_registration"
  ON "certificate" ("registration_id")
  WHERE "status" = 'ACTIVE';

-- The audit log is append-only. TRUNCATE is left alone: the test harness relies on it.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_no_update"
  BEFORE UPDATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();

CREATE TRIGGER "audit_log_no_delete"
  BEFORE DELETE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();
