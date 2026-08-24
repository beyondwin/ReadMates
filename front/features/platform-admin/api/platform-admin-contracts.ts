import { z } from "zod";

export type {
  AdminAuditFilters,
  AdminAuditLedgerItem,
  AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";

export type {
  AdminSupportGrantLedgerItem,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";

export type { AdminClubOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-club-operations-model";

export type {
  AdminNotificationDelivery,
  AdminNotificationFilters,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayConfirmRequest,
  AdminNotificationReplayConfirmResult,
  AdminNotificationReplayFilter,
  AdminNotificationReplayPreview,
  AdminNotificationStatusSummary,
} from "@/features/platform-admin/model/platform-admin-notifications-model";

export type {
  PlatformAdminRole,
  PlatformAdminSummaryResponse,
  PlatformAdminTodayClosingRisk,
  PlatformAdminTodayClosingRiskState,
  PlatformAdminTodayClosingRisksResponse,
  PlatformAdminAiOpsAction,
  PlatformAdminAiGenerationCapabilitiesResponse,
  PlatformAdminAiOpsSummaryResponse,
  PlatformAdminAiOpsJob,
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsFilters,
  PlatformAdminAiOpsActionResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";

const ClubLifecycleSchema = import.meta.env.DEV
  ? z.enum(["SETUP_REQUIRED", "ACTIVE", "SUSPENDED", "ARCHIVED"])
  : (null as never);
const ClubVisibilitySchema = import.meta.env.DEV
  ? z.enum(["PRIVATE", "PUBLIC"])
  : (null as never);
const FirstHostOnboardingStateSchema = import.meta.env.DEV
  ? z.enum(["MISSING", "INVITED", "ASSIGNED"])
  : (null as never);
const DomainKindSchema = import.meta.env.DEV
  ? z.enum(["SUBDOMAIN", "CUSTOM_DOMAIN"])
  : (null as never);
const DomainStatusSchema = import.meta.env.DEV
  ? z.enum([
      "REQUESTED",
      "ACTION_REQUIRED",
      "PROVISIONING",
      "ACTIVE",
      "FAILED",
      "DISABLED",
    ])
  : (null as never);
const DomainDesiredStateSchema = import.meta.env.DEV
  ? z.enum(["ENABLED", "DISABLED"])
  : (null as never);
const DomainManualActionSchema = import.meta.env.DEV
  ? z.enum(["CLOUDFLARE_PAGES_CUSTOM_DOMAIN", "NONE"])
  : (null as never);
const ConvergenceStateSchema = import.meta.env.DEV
  ? z.enum(["PENDING", "SUCCEEDED", "FAILED"])
  : (null as never);

const PlatformAdminDomainSchema = import.meta.env.DEV
  ? z
      .object({
        id: z.string().min(1),
        clubId: z.string().min(1),
        hostname: z.string(),
        kind: DomainKindSchema,
        status: DomainStatusSchema,
        desiredState: DomainDesiredStateSchema,
        manualAction: DomainManualActionSchema,
        errorCode: z.string().nullable(),
        isPrimary: z.boolean(),
        verifiedAt: z.string().nullable(),
        lastCheckedAt: z.string().nullable(),
      })
      .strict()
  : (null as never);

const PlatformAdminClubSchema = import.meta.env.DEV
  ? z
      .object({
        clubId: z.string().min(1),
        slug: z.string(),
        name: z.string(),
        tagline: z.string(),
        about: z.string(),
        status: ClubLifecycleSchema,
        publicVisibility: ClubVisibilitySchema,
        domainCount: z.number().int().nonnegative(),
        domainActionRequiredCount: z.number().int().nonnegative(),
        notificationFailureCount: z.number().int().nonnegative(),
        aiFailureCount: z.number().int().nonnegative(),
        firstHostOnboardingState: FirstHostOnboardingStateSchema,
        adminRevision: z.number().int().nonnegative(),
      })
      .strict()
  : (null as never);

const PlatformAdminClubListSchema = import.meta.env.DEV
  ? z
      .object({
        items: z.array(PlatformAdminClubSchema),
        nextCursor: z.string().min(1).nullable(),
      })
      .strict()
  : (null as never);

const PlatformAdminClubDetailSchema = import.meta.env.DEV
  ? PlatformAdminClubSchema.extend({
      domains: z.array(PlatformAdminDomainSchema),
    }).strict()
  : (null as never);

const PlatformAdminClubCommandReceiptSchema = import.meta.env.DEV
  ? z
      .object({
        receiptId: z.string().min(1),
        commandType: z.string().min(1),
        clubId: z.string().min(1),
        beforeAdminRevision: z.number().int().nonnegative().nullable(),
        afterAdminRevision: z.number().int().nonnegative(),
        outcome: z.enum(["SUCCEEDED", "PARTIAL", "FAILED"]),
        resultCode: z.string().min(1),
        targetId: z.string().min(1).nullable(),
        convergenceId: z.string().min(1).nullable(),
        convergenceState: ConvergenceStateSchema.nullable(),
      })
      .strict()
  : (null as never);

const PlatformAdminClubVisibilityPreviewSchema = import.meta.env.DEV
  ? z
      .object({
        previewId: z.string().min(1),
        expiresAt: z.string().min(1),
        currentVisibility: ClubVisibilitySchema,
        targetVisibility: ClubVisibilitySchema,
        impactCodes: z.array(z.string().min(1)),
        requestFingerprintPrefix: z.string().min(1),
      })
      .strict()
  : (null as never);

const PlatformAdminDomainCommandPreviewSchema = import.meta.env.DEV
  ? z
      .object({
        previewId: z.string().min(1),
        expiresAt: z.string().min(1),
        kind: DomainKindSchema,
        isPrimary: z.boolean(),
        impactCodes: z.array(z.string().min(1)),
        requestFingerprintPrefix: z.string().min(1),
      })
      .strict()
  : (null as never);

const PlatformAdminOnboardingPreviewSchema = import.meta.env.DEV
  ? z
      .object({
        previewId: z.string().min(1),
        expiresAt: z.string().min(1),
        clubSlug: z.string().min(1),
        firstHostKind: z.enum(["EXISTING_USER", "NEW_USER"]),
        requiredConfirmation: z.string().min(1).nullable(),
        impactCodes: z.array(z.string().min(1)),
        prerequisiteCodes: z.array(z.string().min(1)),
        requestFingerprintPrefix: z.string().min(1),
      })
      .strict()
  : (null as never);

const PlatformAdminOnboardingResultSchema = import.meta.env.DEV
  ? z
      .object({
        receiptId: z.string().min(1),
        club: PlatformAdminClubSchema,
        originStatus: z.enum(["SUCCEEDED"]),
        firstHostKind: z.enum(["EXISTING_USER_ASSIGNED", "INVITATION_CREATED"]),
        invitationDelivery: z.enum([
          "NOT_REQUIRED",
          "PENDING",
          "SUCCEEDED",
          "FAILED",
        ]),
      })
      .strict()
  : (null as never);

const PlatformAdminAiOpsCommandPreviewSchema = import.meta.env.DEV
  ? z
      .object({
        previewId: z.string().min(1),
        jobId: z.string().min(1),
        action: z.enum(["FORCE_CANCEL", "RETRY_COMMIT"]),
        jobStatus: z.string().min(1),
        jobRevision: z.number().int().nonnegative(),
        effectType: z.enum(["AI_JOB_CANCEL", "AI_COMMIT_RETRY"]),
        impactCodes: z.array(z.string().min(1)),
        expiresAt: z.string().min(1),
        fingerprintPrefix: z.string().min(1),
      })
      .strict()
  : (null as never);

const PlatformAdminAiOpsCommandReceiptSchema = import.meta.env.DEV
  ? z
      .object({
        receiptId: z.string().min(1),
        previewId: z.string().min(1),
        jobId: z.string().min(1),
        action: z.enum(["FORCE_CANCEL", "RETRY_COMMIT"]),
        beforeJobStatus: z.string().min(1),
        beforeJobRevision: z.number().int().nonnegative(),
        afterJobStatus: z.string().min(1),
        afterJobRevision: z.number().int().nonnegative(),
        originStatus: z.string().min(1),
        effectStatus: z.string().min(1),
        safeErrorCode: z.string().min(1).nullable(),
      })
      .strict()
  : (null as never);

export type PlatformAdminClubStatus = z.infer<typeof ClubLifecycleSchema>;
export type PlatformAdminClubPublicVisibility = z.infer<
  typeof ClubVisibilitySchema
>;
export type FirstHostOnboardingState = z.infer<
  typeof FirstHostOnboardingStateSchema
>;
export type PlatformAdminDomainKind = z.infer<typeof DomainKindSchema>;
export type PlatformAdminDomainStatus = z.infer<typeof DomainStatusSchema>;
export type PlatformAdminDomainDesiredState = z.infer<
  typeof DomainDesiredStateSchema
>;
export type PlatformAdminDomainManualAction = z.infer<
  typeof DomainManualActionSchema
>;
export type PlatformAdminDomainResponse = z.infer<
  typeof PlatformAdminDomainSchema
>;
export type PlatformAdminClub = z.infer<typeof PlatformAdminClubSchema>;
export type PlatformAdminClubListResponse = z.infer<
  typeof PlatformAdminClubListSchema
>;
export type PlatformAdminClubDetail = z.infer<
  typeof PlatformAdminClubDetailSchema
>;
export type PlatformAdminClubCommandReceipt = z.infer<
  typeof PlatformAdminClubCommandReceiptSchema
>;
export type PlatformAdminClubVisibilityPreviewResponse = z.infer<
  typeof PlatformAdminClubVisibilityPreviewSchema
>;
export type PlatformAdminDomainCommandPreviewResponse = z.infer<
  typeof PlatformAdminDomainCommandPreviewSchema
>;
export type PlatformAdminOnboardingPreviewResponse = z.infer<
  typeof PlatformAdminOnboardingPreviewSchema
>;
export type PlatformAdminOnboardingResultResponse = z.infer<
  typeof PlatformAdminOnboardingResultSchema
>;
export type PlatformAdminAiOpsCommandPreviewResponse = z.infer<
  typeof PlatformAdminAiOpsCommandPreviewSchema
>;
export type PlatformAdminAiOpsCommandReceiptResponse = z.infer<
  typeof PlatformAdminAiOpsCommandReceiptSchema
>;

export type PlatformAdminClubListFilters = {
  search?: string;
  lifecycle?: PlatformAdminClubStatus;
  visibility?: PlatformAdminClubPublicVisibility;
  domainStatus?: PlatformAdminDomainStatus;
  onboardingState?: FirstHostOnboardingState;
  cursor?: string;
  limit?: number;
};

export type UpdatePlatformAdminClubRequest = {
  expectedAdminRevision: number;
  name?: string;
  tagline?: string;
  about?: string;
};

export type PreviewPlatformAdminClubVisibilityRequest = {
  expectedAdminRevision: number;
  targetVisibility: PlatformAdminClubPublicVisibility;
};

export type ConfirmPlatformAdminClubVisibilityRequest =
  PreviewPlatformAdminClubVisibilityRequest & {
    previewId: string;
    idempotencyKey: string;
    confirmed: boolean;
  };

export type PreviewPlatformAdminDomainRequest = {
  expectedAdminRevision: number;
  hostname: string;
  kind: PlatformAdminDomainKind;
  isPrimary: boolean;
};

export type ConfirmPlatformAdminDomainRequest =
  PreviewPlatformAdminDomainRequest & {
    previewId: string;
    idempotencyKey: string;
    confirmed: boolean;
  };

export type RecheckPlatformAdminDomainRequest = {
  idempotencyKey: string;
  expectedStatus: PlatformAdminDomainStatus;
};

export type CreatePlatformAdminDomainRequest =
  ConfirmPlatformAdminDomainRequest;

export type PlatformAdminOnboardingCommandInput = {
  club: { name: string; slug: string; tagline: string; about: string };
  firstHost: { email: string; name: string };
  domain?: { hostname: string; kind: PlatformAdminDomainKind };
};

export type PlatformAdminOnboardingRequest =
  PlatformAdminOnboardingCommandInput;

export type ConfirmPlatformAdminOnboardingRequest = {
  previewId: string;
  idempotencyKey: string;
  existingUserConfirmation?: string;
  confirmed: boolean;
} & PlatformAdminOnboardingCommandInput;

export type ConfirmPlatformAdminAiOpsCommandRequest = {
  previewId: string;
  idempotencyKey: string;
  expectedJobRevision: number;
  confirmed: true;
};

function parseInDevelopment<T>(schema: z.ZodType<T>, value: unknown): T {
  return import.meta.env.DEV ? schema.parse(value) : (value as T);
}

export function parsePlatformAdminClubList(
  value: unknown,
): PlatformAdminClubListResponse {
  return parseInDevelopment(PlatformAdminClubListSchema, value);
}

export function parsePlatformAdminClubDetail(
  value: unknown,
): PlatformAdminClubDetail {
  return parseInDevelopment(PlatformAdminClubDetailSchema, value);
}

export function parsePlatformAdminClubCommandReceipt(
  value: unknown,
): PlatformAdminClubCommandReceipt {
  return parseInDevelopment(PlatformAdminClubCommandReceiptSchema, value);
}

export function parsePlatformAdminClubVisibilityPreview(
  value: unknown,
): PlatformAdminClubVisibilityPreviewResponse {
  return parseInDevelopment(PlatformAdminClubVisibilityPreviewSchema, value);
}

export function parsePlatformAdminDomainCommandPreview(
  value: unknown,
): PlatformAdminDomainCommandPreviewResponse {
  return parseInDevelopment(PlatformAdminDomainCommandPreviewSchema, value);
}

export function parsePlatformAdminOnboardingPreview(
  value: unknown,
): PlatformAdminOnboardingPreviewResponse {
  return parseInDevelopment(PlatformAdminOnboardingPreviewSchema, value);
}

export function parsePlatformAdminOnboardingResult(
  value: unknown,
): PlatformAdminOnboardingResultResponse {
  return parseInDevelopment(PlatformAdminOnboardingResultSchema, value);
}

export function parsePlatformAdminAiOpsCommandPreview(
  value: unknown,
): PlatformAdminAiOpsCommandPreviewResponse {
  return parseInDevelopment(PlatformAdminAiOpsCommandPreviewSchema, value);
}

export function parsePlatformAdminAiOpsCommandReceipt(
  value: unknown,
): PlatformAdminAiOpsCommandReceiptResponse {
  return parseInDevelopment(PlatformAdminAiOpsCommandReceiptSchema, value);
}
