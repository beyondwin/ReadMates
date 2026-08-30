/**
 * Writes sample valid JSON fixture files representing the key shapes
 * of zod-validated frontend API response schemas.
 *
 * Run via: pnpm zod:export-fixtures
 *
 * The fixtures are the source of truth for the server-side
 * FrontendZodSchemaContractTest, which verifies that server MockMvc responses
 * contain the same recursive object keys and representative array element
 * shapes as these fixtures.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HostSessionDetailResponseSchema,
  ManualNotificationConfirmResponseSchema,
  ManualNotificationDispatchListResponseSchema,
  ManualNotificationOptionsResponseSchema,
  ManualNotificationPreviewResponseSchema,
} from "../features/host/api/host-contracts";
import { CurrentSessionResponseSchema } from "../shared/model/current-session-contracts";
import { HostPersonDetailSchema } from "../features/host/api/host-person-contracts";
import { HostInvitationLinkHistorySchema, HostInvitationLinkListSchema } from "../features/host/api/host-invitation-link-contracts";
import { HostClubClosePreviewSchema, HostClubCloseResultSchema, HostClubSettingsSchema } from "../features/host/api/host-club-settings-contracts";
import { InvitationPreviewResponseSchema } from "../features/auth/api/auth-contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../tests/unit/__fixtures__/zod-schemas");
const topLevelFixturesDir = join(__dirname, "../tests/unit/__fixtures__");

mkdirSync(fixturesDir, { recursive: true });

const hostInvitationLinkList = HostInvitationLinkListSchema.parse({ items: [{ linkId: "00000000-0000-0000-0000-00000000e101", name: "Public fixture link", status: "ACTIVE", maxUses: 20, usedCount: 1, expiresAt: "2026-09-30T00:00:00Z", revision: 2, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" }], nextCursor: null });
const hostInvitationLinkHistory = HostInvitationLinkHistorySchema.parse({ items: [{ receiptId: "00000000-0000-0000-0000-00000000e102", revision: 2, action: "UPDATED", beforeSettings: { status: "ACTIVE" }, afterSettings: { status: "PAUSED" }, occurredAt: "2026-08-30T00:00:00Z" }], nextCursor: null });
const hostClubSettings = HostClubSettingsSchema.parse({ clubId: "00000000-0000-0000-0000-000000000101", clubSlug: "reading-sai", name: "Public fixture club", approvalPolicy: "INVITE_ONLY", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "MEMBER", revision: 0, status: "ACTIVE" });
const hostClubClosePreview = HostClubClosePreviewSchema.parse({ previewId: "00000000-0000-0000-0000-00000000e103", clubId: hostClubSettings.clubId, actorMembershipId: "00000000-0000-0000-0000-000000000201", clubRevision: 0, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T01:00:00Z" });
const hostClubCloseResult = HostClubCloseResultSchema.parse({ receiptId: "00000000-0000-0000-0000-00000000e104", status: "ARCHIVED", revision: 1, replayed: false });
const invitationPreviewEmail = InvitationPreviewResponseSchema.parse({ invitationType: "EMAIL", clubSlug: "reading-sai", clubName: "Public fixture club", canonicalPath: `/clubs/reading-sai/invite/${"e".repeat(43)}`, email: "member@example.test", name: "Public fixture member", emailHint: "m***@example.test", status: "PENDING", expiresAt: "2026-09-30T00:00:00Z", canAccept: true });
const invitationPreviewNamedLink = InvitationPreviewResponseSchema.parse({ invitationType: "NAMED_LINK", clubSlug: "reading-sai", clubName: "Public fixture club", canonicalPath: `/clubs/reading-sai/invite/lnk_${"n".repeat(43)}`, email: null, name: null, emailHint: null, status: "PENDING", expiresAt: "2026-09-30T00:00:00Z", canAccept: true });

// ---------------------------------------------------------------------------
// HostSessionDetailResponseSchema top-level keys
// ---------------------------------------------------------------------------
const hostSessionChangeReceipt = {
  changeId: "00000000-0000-0000-0000-00000000c101",
  kind: "BASIC_INFO",
  undoAvailable: true,
};

const hostSessionRestorePreview = {
  sessionId: "00000000-0000-0000-0000-00000000c301",
  changeId: "00000000-0000-0000-0000-00000000c101",
  kind: "BASIC_INFO",
  items: [
    {
      field: "title",
      subjectId: null,
      currentValue: "복원 후 제목",
      targetValue: "복원 전 제목",
      sensitive: false,
    },
  ],
  expectedCurrentHash: "a".repeat(64),
  canRestore: true,
  blockedReason: null,
};

const hostSessionHistoryRecovery = {
  items: [
    {
      id: "00000000-0000-0000-0000-00000000c401",
      type: "BASIC_INFO_UPDATED",
      createdAt: "2026-08-01T00:00:00Z",
      actorMembershipId: "00000000-0000-0000-0000-000000000201",
      changedFields: ["title"],
      attendanceTransitions: [],
      revisionId: null,
      revisionVersion: null,
      revisionSource: null,
      restoredFromRevisionId: null,
      notificationEventId: null,
      recovery: {
        action: "RESTORE_CHANGE",
        availability: "AVAILABLE",
      },
    },
  ],
  nextCursor: null,
};

const hostSessionTrashItem = {
  sessionId: "00000000-0000-0000-0000-00000000c501",
  sessionNumber: 88,
  title: "88회차 · 휴지통 계약",
  state: "DRAFT",
  deletedAt: "2026-08-01T00:00:00Z",
  purgeAfter: "2026-08-08T00:00:00Z",
};

const hostSessionTrashPage = {
  items: [hostSessionTrashItem],
  nextCursor: null,
};

const hostSessionDetail = HostSessionDetailResponseSchema.parse({
  sessionId: "00000000-0000-0000-0000-000000000301",
  sessionNumber: 1,
  title: "1회차 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookLink: null,
  bookImageUrl: null,
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  date: "2025-11-26",
  startTime: "19:30",
  endTime: "21:30",
  questionDeadlineAt: "2025-11-25T14:59:00Z",
  visibility: "PUBLIC",
  accessScope: "GUEST_READABLE",
  siteVisibility: "PUBLIC_RECORD",
  publication: null,
  state: "PUBLISHED",
  scheduleRevision: 7,
  scheduleSeenAvailability: "UNAVAILABLE",
  scheduleSeenSummary: {
    currentCount: null,
    staleCount: null,
    unseenCount: null,
    eligibleCount: null,
  },
  versions: {
    sessionRevision: 3,
    scheduleRevision: 7,
    exposureRevision: 2,
    participantSetRevision: 4,
    recordDraftRevision: null,
    liveRecordRevision: 1,
    publicationRevision: 1,
  },
  attendanceSnapshotId: "att:membership-host:6",
  attendees: [
    {
      membershipId: "00000000-0000-0000-0000-000000000201",
      displayName: "호스트",
      accountName: "김호스트",
      avatarKey: "banana-green-book",
      rsvpStatus: "GOING",
      attendanceStatus: "ATTENDED",
      participationStatus: "ACTIVE",
      attendanceRevision: 0,
      seenScheduleRevision: 7,
      scheduleSeenAt: "2026-08-29T00:00:00Z",
      scheduleSeenState: "CURRENT",
    },
  ],
  feedbackDocument: {
    uploaded: false,
    fileName: null,
    uploadedAt: null,
  },
  changeReceipt: null,
});

const hostSessionRecordEditor = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  liveRevision: 1,
  liveSessionUpdatedAt: "2026-08-22T00:00:00Z",
  liveSnapshot: {
    schema: "readmates-session-record:v1",
    visibility: "PUBLIC",
    publicationSummary: "공개 기록 요약",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: {
      fileName: "session-feedback.md",
      title: "모임 피드백",
      markdown: "# 모임 피드백",
    },
  },
  draft: null,
  draftLiveBaseStale: false,
  validationSummary: {
    valid: true,
    issues: [],
  },
};

// ---------------------------------------------------------------------------
// HostNotificationDeliveryListResponseSchema top-level keys
// ---------------------------------------------------------------------------
const hostNotificationDeliveryList = {
  items: [],
  nextCursor: null,
};

const manualNotificationOptions = ManualNotificationOptionsResponseSchema.parse({
  session: {
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 1,
    bookTitle: "공개 계약 도서",
    date: "2026-08-30",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: true,
    scheduleRevision: 7,
  },
  templates: [{
    eventType: "SESSION_REMINDER_DUE",
    contentRevision: "a".repeat(64),
    label: "모임 알림",
    enabled: true,
    disabledReason: null,
    defaultAudience: "ALL_ACTIVE_MEMBERS",
    allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS", "SELECTED_MEMBERS"],
    defaultChannels: "BOTH",
    defaultSubject: "모임을 안내합니다",
    defaultBody: "예정된 모임 정보를 확인해 주세요.",
  }],
  members: {
    items: [{
      membershipId: "00000000-0000-0000-0000-000000000202",
      displayName: "공개 계약 멤버",
      maskedEmail: "m***@example.test",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      sessionParticipationStatus: "ACTIVE",
      attendanceStatus: "UNKNOWN",
      emailEligibility: "ELIGIBLE",
      inAppEligibility: "ELIGIBLE",
    }],
    nextCursor: null,
  },
  recentDispatches: [],
});

const manualNotificationPreview = ManualNotificationPreviewResponseSchema.parse({
  previewId: "00000000-0000-0000-0000-00000000d101",
  expiresAt: "2026-08-30T12:10:00Z",
  scheduleRevision: 7,
  targetSnapshotHash: "b".repeat(64),
  contentHash: "c".repeat(64),
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "모임 알림",
    subject: "호스트가 고친 제목",
    bodyPreview: "호스트가 고친 본문",
  },
  audience: {
    baseGroup: "ALL_ACTIVE_MEMBERS",
    baseCount: 1,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 1,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 1,
    emailEligibleCount: 1,
    emailSkippedByPreferenceCount: 0,
    emailMissingCount: 0,
  },
  duplicates: { requiresResendConfirmation: false, recentDispatches: [] },
  warnings: [],
});

const hostPersonDetail = HostPersonDetailSchema.parse({
  membershipId: "00000000-0000-0000-0000-000000000206",
  displayName: "계약 멤버",
  avatarKey: "apple-green-book",
  status: "ACTIVE",
  role: "MEMBER",
  lastClubAccessAt: "2026-08-30T01:00:00Z",
  currentSchedule: null,
  currentRsvp: null,
  attendanceHistory: {
    items: [{
      sessionNumber: 6,
      scheduledAt: "2026-08-20T19:00:00",
      attendanceStatus: "ATTENDED",
    }],
    nextCursor: null,
  },
});

const manualNotificationConfirm = ManualNotificationConfirmResponseSchema.parse({
  manualDispatchId: "00000000-0000-0000-0000-00000000d201",
  eventId: "00000000-0000-0000-0000-00000000d202",
  status: "PENDING",
  createdAt: "2026-08-30T12:00:00Z",
  summary: {
    targetCount: 1,
    requestedChannels: "BOTH",
    expectedInAppCount: 1,
    expectedEmailCount: 1,
  },
});

const manualNotificationDispatchList = ManualNotificationDispatchListResponseSchema.parse({
  items: [{
    manualDispatchId: "00000000-0000-0000-0000-00000000d201",
    eventId: "00000000-0000-0000-0000-00000000d202",
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 1,
    bookTitle: "공개 계약 도서",
    requestedChannels: "BOTH",
    audience: "ALL_ACTIVE_MEMBERS",
    resend: false,
    requestedBy: "공개 계약 호스트",
    targetCount: 1,
    expectedInAppCount: 1,
    expectedEmailCount: 1,
    eventStatus: "PENDING",
    createdAt: "2026-08-30T12:00:00Z",
  }],
  nextCursor: null,
});

// ---------------------------------------------------------------------------
// HostInvitationListPageSchema top-level keys
// ---------------------------------------------------------------------------
const hostInvitationList = {
  items: [],
  nextCursor: null,
};

// ---------------------------------------------------------------------------
// AdminAnalyticsOverviewSchema top-level keys
// ---------------------------------------------------------------------------
const adminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    {
      key: "SESSION_COMPLETION",
      label: "모임 완료율",
      definition: "선택 기간의 전체 모임 중 완료 또는 공개된 모임 비율",
      unit: "PERCENT",
      availability: "AVAILABLE",
      current: 80,
      prior: 60,
      delta: 20,
      deltaDirection: "UP",
    },
  ],
  clubBenchmark: {
    availability: "AVAILABLE",
    rows: [
      {
        clubId: "00000000-0000-0000-0000-000000000001",
        slug: "reading-sai",
        name: "Reading Sai",
        activeMembers: 6,
        sessionCompletionRate: 83,
        rsvpRate: 75,
        aiCostUsd: "1.2500",
        notificationDeliveryRate: 96,
      },
    ],
  },
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [
        { bucketStart: "2026-05-01", availability: "AVAILABLE", value: 80 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// CurrentSessionResponseSchema top-level keys
// ---------------------------------------------------------------------------
const currentSession = CurrentSessionResponseSchema.parse({
  currentSession: {
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 1,
    title: "1회차 · 팩트풀니스",
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookLink: null,
    bookImageUrl: null,
    date: "2025-11-26",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2025-11-25T14:59:00Z",
    myRsvpStatus: "GOING",
    scheduleRevision: 3,
    mySeenScheduleRevision: 2,
    myScheduleSeenAt: "2026-05-18T12:00:00Z",
    myCheckin: { readingProgress: 100 },
    myQuestions: [
      {
        priority: 1,
        text: "계약 테스트 질문",
        draftThought: "계약 테스트 초안",
        authorName: "멤버5",
        authorShortName: "멤버5",
        avatarKey: "cloud-green-book",
      },
    ],
    myOneLineReview: {
      text: "계약 테스트 한줄평",
      avatarKey: "cloud-green-book",
    },
    myLongReview: {
      body: "계약 테스트 내 서평",
      avatarKey: "cloud-green-book",
    },
    board: {
      questions: [
        {
          priority: 1,
          text: "계약 테스트 질문",
          draftThought: "계약 테스트 초안",
          authorName: "멤버5",
          authorShortName: "멤버5",
          avatarKey: "cloud-green-book",
        },
      ],
      longReviews: [
        {
          authorName: "멤버5",
          authorShortName: "멤버5",
          avatarKey: "cloud-green-book",
          body: "계약 테스트 내 서평",
        },
      ],
    },
    attendees: [
      {
        membershipId: "00000000-0000-0000-0000-000000000201",
        displayName: "호스트",
        accountName: "김호스트",
        role: "HOST",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        avatarKey: "banana-green-book",
      },
    ],
  },
});

const aigenJob = {
  jobId: "00000000-0000-0000-0000-000000000401",
  status: "SUCCEEDED",
  stage: "READY",
  progressPct: 100,
  model: "gpt-5.4-mini",
  result: {
    format: "readmates-session-import:v1",
    sessionNumber: 1,
    bookTitle: "공개 합성 도서",
    meetingDate: "2026-07-14",
    summary: "공개 합성 요약",
    highlights: [{ authorName: "가람", text: "공개 합성 하이라이트" }],
    oneLineReviews: [{ authorName: "가람", text: "공개 합성 한줄평" }],
    feedbackDocumentFileName: "synthetic-feedback.md",
    feedbackDocumentMarkdown: "# 공개 합성 피드백",
  },
  error: null,
  tokens: { input: 100, cachedInput: 0, output: 50 },
  costEstimateUsd: "0.0010",
  warnings: [],
  expiresAt: "2026-07-14T12:00:00Z",
  createdAt: "2026-07-14T06:00:00Z",
  lastUpdatedAt: "2026-07-14T06:01:00Z",
  revision: 1,
  groundingStatus: "VALID",
  evidence: [
    {
      section: "SUMMARY",
      targetId: "summary-0",
      ordinal: 0,
      turnId: "t000001",
      startSeconds: 0,
      speakerName: "가람",
      excerpt: "공개 합성 발언",
      truncated: false,
    },
  ],
  sectionReviewStatuses: { SUMMARY: "PENDING_REVIEW" },
};

const aigenModels = {
  models: [{ id: "gpt-5.4-mini", provider: "OPENAI", isDefault: true }],
};

const aigenRegeneration = {
  item: "summary",
  value: { summary: "공개 합성 재생성 요약" },
  tokens: { input: 100, cachedInput: 0, output: 20 },
  costEstimateUsd: "0.0010",
  warnings: [],
  revision: 2,
  result: aigenJob.result,
  evidence: aigenJob.evidence,
  sectionReviewStatuses: { SUMMARY: "PENDING_REVIEW" },
};

const aigenExpandedEvidence = {
  turnId: "t000001",
  speakerName: "가람",
  startSeconds: 0,
  text: "공개 합성 전체 발언",
};

const aigenCommitReceipt = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  status: "COMMITTED",
  recovered: false,
  participantUpdatesCount: 1,
  draftRevision: 6,
  baseLiveRevision: 2,
  liveApplied: false,
};

const aigenProblem = {
  type: "about:blank",
  title: "Unprocessable Entity",
  status: 422,
  detail: "공개 합성 검증 오류",
  code: "TRANSCRIPT_FORMAT_INVALID",
  invalidSpeakerLabels: null,
  currentRevision: null,
};

const aigenStart = {
  jobId: "00000000-0000-0000-0000-000000000401",
  status: "PENDING",
  expiresAt: "2026-07-14T12:00:00Z",
};

const aigenRecentJob = {
  jobId: "00000000-0000-0000-0000-000000000401",
  status: "RUNNING",
  stage: "GENERATING_RECORD",
  progressPct: 50,
  model: "gpt-5.4-mini",
  error: null,
  costEstimateUsd: "0.0000",
  createdAt: "2026-07-14T06:00:00Z",
  lastUpdatedAt: "2026-07-14T06:01:00Z",
  expiresAt: "2026-07-14T12:00:00Z",
  availableActions: ["POLL", "CANCEL"],
};

const aigenClubDefault = { defaultModel: "gemini-3-flash-preview" };

const guestArchiveDetail = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  sessionNumber: 1,
  title: "1회차 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookImageUrl: null,
  date: "2025-11-26",
  attendance: 1,
  total: 1,
  state: "PUBLISHED",
  summary: "공개 요약",
  highlights: [
    {
      text: "공개 하이라이트",
      sortOrder: 1,
      authorName: null,
      authorShortName: null,
      avatarKey: null,
    },
  ],
  questions: [
    {
      priority: 1,
      text: "공개 질문",
      draftThought: null,
      authorName: "가람",
      authorShortName: "가람",
      avatarKey: "open-book",
    },
  ],
  oneLiners: [
    {
      text: "공개 한줄평",
      authorName: "가람",
      authorShortName: "가람",
      avatarKey: "open-book",
    },
  ],
  longReviews: [
    {
      title: "가람의 서평",
      content: "공개 서평",
      authorName: "가람",
      authorShortName: "가람",
      avatarKey: "open-book",
    },
  ],
};

const platformAdminClub = {
  clubId: "00000000-0000-0000-0000-00000000a101",
  slug: "public-contract-club",
  name: "Public Contract Club",
  tagline: "A public-safe contract fixture",
  about: "Synthetic public fixture data only.",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 1,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  adminRevision: 7,
};

const platformAdminClubList = {
  items: [platformAdminClub],
  nextCursor: "opaque-contract-cursor",
};

const platformAdminClubDetail = {
  ...platformAdminClub,
  domains: [
    {
      id: "00000000-0000-0000-0000-00000000a102",
      clubId: platformAdminClub.clubId,
      hostname: "club.example.test",
      kind: "CUSTOM_DOMAIN",
      status: "ACTION_REQUIRED",
      desiredState: "ENABLED",
      manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
      errorCode: null,
      isPrimary: true,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
};

const platformAdminOnboardingPreview = {
  previewId: "00000000-0000-0000-0000-00000000a103",
  expiresAt: "2026-08-24T01:00:00Z",
  clubSlug: "public-contract-club",
  firstHostKind: "NEW_USER",
  requiredConfirmation: null,
  impactCodes: ["CLUB_CREATED", "HOST_INVITED"],
  prerequisiteCodes: [],
  requestFingerprintPrefix: "abcd1234",
};

const platformAdminOnboardingResult = {
  receiptId: "00000000-0000-0000-0000-00000000a104",
  club: platformAdminClub,
  originStatus: "SUCCEEDED",
  firstHostKind: "INVITATION_CREATED",
  invitationDelivery: "PENDING",
};

function write(filename: string, data: unknown): void {
  const path = join(fixturesDir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function writeTopLevel(filename: string, data: unknown): void {
  writeFileSync(join(topLevelFixturesDir, filename), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

write("host-session-detail.json", hostSessionDetail);
write("host-session-record-editor.json", hostSessionRecordEditor);
write("host-session-change-receipt.json", hostSessionChangeReceipt);
write("host-session-restore-preview.json", hostSessionRestorePreview);
write("host-session-history-recovery.json", hostSessionHistoryRecovery);
write("host-session-trash-item.json", hostSessionTrashItem);
write("host-session-trash-page.json", hostSessionTrashPage);
write("host-notification-delivery-list.json", hostNotificationDeliveryList);
write("manual-notification-options.json", manualNotificationOptions);
write("manual-notification-preview.json", manualNotificationPreview);
write("manual-notification-confirm.json", manualNotificationConfirm);
write("manual-notification-dispatch-list.json", manualNotificationDispatchList);
write("host-person-detail.json", hostPersonDetail);
write("host-invitation-list.json", hostInvitationList);
write("admin-analytics-overview.json", adminAnalyticsOverview);
write("current-session.json", currentSession);
write("aigen-job.json", aigenJob);
write("aigen-models.json", aigenModels);
write("aigen-regeneration.json", aigenRegeneration);
write("aigen-expanded-evidence.json", aigenExpandedEvidence);
write("aigen-commit-receipt.json", aigenCommitReceipt);
write("aigen-problem.json", aigenProblem);
write("aigen-start.json", aigenStart);
write("aigen-recent-job.json", aigenRecentJob);
write("aigen-club-default.json", aigenClubDefault);
write("guest-archive-detail.json", guestArchiveDetail);
write("platform-admin-club-list.json", platformAdminClubList);
write("platform-admin-club-detail.json", platformAdminClubDetail);
write("platform-admin-onboarding-preview.json", platformAdminOnboardingPreview);
write("platform-admin-onboarding-result.json", platformAdminOnboardingResult);
write("host-invitation-link-list.json", hostInvitationLinkList);
write("host-invitation-link-history.json", hostInvitationLinkHistory);
write("host-club-settings.json", hostClubSettings);
write("host-club-close-preview.json", hostClubClosePreview);
write("host-club-close-result.json", hostClubCloseResult);
write("invitation-preview-email.json", invitationPreviewEmail);
write("invitation-preview-named-link.json", invitationPreviewNamedLink);
writeTopLevel("host-invitation-links.json", { items: [], nextCursor: null });
writeTopLevel("host-club-settings.json", hostClubSettings);
