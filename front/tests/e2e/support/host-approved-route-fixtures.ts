import type { Page, Route } from "@playwright/test";
import type {
  HostClubOperationsResponse,
  HostMemberListItem,
  HostNotificationSummary,
  HostOperatingRoomCurrentResponse,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
  HostSessionListItem,
  HostSessionLedgerSummary,
  HostSessionListPage,
  HostSessionRecordLedgerPage,
  ManualNotificationOptionsResponse,
} from "@/features/host/api/host-contracts";
import type { HostClubSettings } from "@/features/host/api/host-club-settings-contracts";
import type { HostInvitationLink } from "@/features/host/api/host-invitation-link-contracts";
import type { HostPersonDetail } from "@/features/host/api/host-person-contracts";
import type {
  HostWorkItemType,
  HostWorkboxItem,
  HostWorkboxPage,
} from "@/features/host/api/host-workbox-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { routeHostEditorShell } from "../aigen-test-fixtures";
import {
  installApprovedRouteCatchAllAudit,
  type ApprovedRouteRequestAudit,
} from "./approved-route-request-audit";
import type { ApprovedRouteFixtureKey } from "./approved-route-scenarios";

export const HOST_APPROVED_CLUB = {
  clubId: "club-visual-authority",
  clubSlug: "visual-authority",
  clubName: "시각 권위 독서모임",
} as const;

export const HOST_APPROVED_SESSION_ID = "session-28";
export const HOST_APPROVED_PERSON_ID = "membership-sky";
export const HOST_APPROVED_HOST_MEMBERSHIP_ID = "membership-host-visual";

const EVALUATED_AT = "2026-08-30T09:00:00Z";
const CONTENT_REVISION = "e".repeat(64);
const FRONTEND_OBSERVABILITY_PATH = "/api/bff/observability/frontend-events";
const DEFAULT_WORKBOX_ITEMS = 4;

const HOST_APPROVED_FIXTURE_KEYS = new Set<ApprovedRouteFixtureKey>([
  "host-operating-room",
  "host-meetings",
  "host-people",
  "host-records",
  "host-settings",
  "host-schedule-review",
  "host-person",
]);

const WORKBOX_TYPES = [
  "SCHEDULE_UNSEEN",
  "MEMBER_APPROVAL",
  "RECORD_CLOSING",
  "INVITATION_EXPIRY",
  "NOTIFICATION_FAILURE",
] as const satisfies readonly HostWorkItemType[];

const WORKBOX_COPY: Record<HostWorkItemType, { title: string; description: string; href: string; resource: string }> = {
  SCHEDULE_UNSEEN: {
    title: "일정 확인이 필요한 멤버",
    description: "변경 전 확인 1명 · 미열람 2명",
    href: `/app/host/sessions/${HOST_APPROVED_SESSION_ID}`,
    resource: HOST_APPROVED_SESSION_ID,
  },
  MEMBER_APPROVAL: {
    title: "가입 승인 대기",
    description: "호스트 승인 대기 2명",
    href: `/app/host/people/${HOST_APPROVED_PERSON_ID}`,
    resource: HOST_APPROVED_PERSON_ID,
  },
  RECORD_CLOSING: {
    title: "지난 모임 기록 마감",
    description: "기록 초안 확인이 필요합니다.",
    href: "/app/host/sessions/session-27",
    resource: "session-27",
  },
  INVITATION_EXPIRY: {
    title: "초대 링크 만료 임박",
    description: "만료 전 링크를 확인하세요.",
    href: "/app/host/settings",
    resource: "link-summer",
  },
  NOTIFICATION_FAILURE: {
    title: "알림 전달 실패",
    description: "최근 안내 전달을 다시 확인하세요.",
    href: "/app/host",
    resource: "notification-visual",
  },
};

const SESSION_IDS = [
  "session-24",
  "session-25",
  "session-26",
  "session-27",
  HOST_APPROVED_SESSION_ID,
  "session-29",
  "session-30",
] as const;

const MEMBERSHIP_IDS = [
  HOST_APPROVED_PERSON_ID,
  "membership-park",
  "membership-lee",
  "membership-jung",
  "membership-han",
  "membership-oh",
  "membership-yoon",
  "membership-choi",
] as const;

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function memberRow(
  membershipId: string,
  displayName: string,
  avatarKey: string,
  status: HostMemberListItem["status"],
  joinedAt: string | null,
  lastClubAccessAt: string | null,
): HostMemberListItem {
  return {
    membershipId,
    userId: `user-${membershipId}`,
    email: "hidden@example.test",
    displayName,
    accountName: displayName,
    profileImageUrl: null,
    avatarKey,
    role: "MEMBER",
    status,
    joinedAt,
    createdAt: joinedAt ?? lastClubAccessAt ?? "2026-09-02T00:00:00+09:00",
    lastClubAccessAt,
    currentSessionParticipationStatus: status === "ACTIVE" ? "ACTIVE" : "REMOVED",
    canSuspend: status === "ACTIVE",
    canRestore: status === "SUSPENDED",
    canDeactivate: true,
    canAddToCurrentSession: status === "ACTIVE",
    canRemoveFromCurrentSession: status === "ACTIVE",
  };
}

function meetingItem(
  overrides: Pick<HostSessionListItem, "sessionId" | "sessionNumber" | "title" | "bookTitle" | "bookAuthor" | "date" | "state" | "recordStatus" | "needsAttention" | "hasDraft" | "liveRevision" | "draftRevision" | "lastModifiedAt">,
): HostSessionListItem {
  return {
    bookImageUrl: null,
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    visibility: "MEMBER",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    ...overrides,
  };
}

function workboxItem(type: HostWorkItemType, index: number): HostWorkboxItem {
  const copy = WORKBOX_COPY[type];
  return {
    key: `${type}:${copy.resource}:${index}`,
    type,
    state: "NOW",
    title: copy.title,
    description: copy.description,
    count: index + 1,
    dueAt: index % 2 === 0 ? "2026-08-31T09:00:00Z" : null,
    deferredUntil: null,
    resolvedAt: null,
    destinationHref: copy.href,
    receiptSummary: null,
  };
}

export function buildHostApprovedWorkboxPage(
  itemCount = DEFAULT_WORKBOX_ITEMS,
  state: HostWorkboxPage["state"] = "NOW",
): HostWorkboxPage {
  const items = state === "NOW"
    ? Array.from({ length: itemCount }, (_, index) => workboxItem(WORKBOX_TYPES[index % WORKBOX_TYPES.length], index))
    : [];
  return {
    state,
    evaluatedAt: EVALUATED_AT,
    sourceAvailability: WORKBOX_TYPES.map((type) => ({ type, state: "AVAILABLE" as const })),
    items,
    nextCursor: null,
  };
}

export function buildHostApprovedAuth(overrides: Partial<AuthMeResponse> = {}): AuthMeResponse {
  const membership = {
    clubId: HOST_APPROVED_CLUB.clubId,
    clubSlug: HOST_APPROVED_CLUB.clubSlug,
    clubName: HOST_APPROVED_CLUB.clubName,
    membershipId: HOST_APPROVED_HOST_MEMBERSHIP_ID,
    role: "HOST" as const,
    status: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
    primaryHost: null,
  };
  return {
    authenticated: true,
    userId: "user-host-visual",
    membershipId: HOST_APPROVED_HOST_MEMBERSHIP_ID,
    clubId: HOST_APPROVED_CLUB.clubId,
    email: "host-visual@example.test",
    displayName: "시각 권위 호스트",
    accountName: "시각 권위 호스트",
    role: "HOST",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    currentMembership: {
      membershipId: HOST_APPROVED_HOST_MEMBERSHIP_ID,
      clubId: HOST_APPROVED_CLUB.clubId,
      clubSlug: HOST_APPROVED_CLUB.clubSlug,
      displayName: "시각 권위 호스트",
      role: "HOST",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      avatarKey: "banana-green-book",
    },
    joinedClubs: [membership],
    platformAdmin: null,
    availableSpaces: {
      version: 1,
      kinds: ["CLUBS"],
      clubs: [{
        clubId: HOST_APPROVED_CLUB.clubId,
        clubSlug: HOST_APPROVED_CLUB.clubSlug,
        clubName: HOST_APPROVED_CLUB.clubName,
        perspectives: ["MEMBER", "HOST"],
      }],
    },
    recommendedAppEntryUrl: `/clubs/${HOST_APPROVED_CLUB.clubSlug}/app/host`,
    ...overrides,
  };
}

export function buildMemberAuthWithoutHostPerspective(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "user-member-visual",
    membershipId: HOST_APPROVED_PERSON_ID,
    clubId: HOST_APPROVED_CLUB.clubId,
    email: "member-visual@example.test",
    displayName: "김하늘",
    accountName: "김하늘",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
    currentMembership: {
      membershipId: HOST_APPROVED_PERSON_ID,
      clubId: HOST_APPROVED_CLUB.clubId,
      clubSlug: HOST_APPROVED_CLUB.clubSlug,
      displayName: "김하늘",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      avatarKey: "mushroom-green-book",
    },
    joinedClubs: [{
      clubId: HOST_APPROVED_CLUB.clubId,
      clubSlug: HOST_APPROVED_CLUB.clubSlug,
      clubName: HOST_APPROVED_CLUB.clubName,
      membershipId: HOST_APPROVED_PERSON_ID,
      role: "MEMBER",
      status: "ACTIVE",
      approvalState: "ACTIVE",
      primaryHost: null,
    }],
    platformAdmin: null,
    availableSpaces: {
      version: 1,
      kinds: ["CLUBS"],
      clubs: [{
        clubId: HOST_APPROVED_CLUB.clubId,
        clubSlug: HOST_APPROVED_CLUB.clubSlug,
        clubName: HOST_APPROVED_CLUB.clubName,
        perspectives: ["MEMBER"],
      }],
    },
    recommendedAppEntryUrl: `/clubs/${HOST_APPROVED_CLUB.clubSlug}/app`,
  };
}

function operatingRoomCurrent(): HostOperatingRoomCurrentResponse {
  return {
    currentMeeting: {
      sessionId: HOST_APPROVED_SESSION_ID,
      selection: "OPEN",
      scheduleSeenAvailability: "AVAILABLE",
    },
  };
}

function sessionDetail(sessionId = HOST_APPROVED_SESSION_ID): HostSessionDetailResponse {
  return {
    sessionId,
    sessionNumber: 28,
    title: "스물여덟 번째 모임",
    bookTitle: "지구 끝의 온실",
    bookAuthor: "김초엽",
    bookLink: null,
    bookImageUrl: null,
    locationLabel: "을지로 북살롱",
    meetingUrl: null,
    meetingPasscode: null,
    date: "2026-09-01",
    startTime: "19:30",
    endTime: "21:30",
    questionDeadlineAt: "2026-08-31T14:59:00Z",
    visibility: "MEMBER",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    publication: null,
    state: "OPEN",
    scheduleRevision: 4,
    scheduleSeenAvailability: "AVAILABLE",
    scheduleSeenSummary: { currentCount: 1, staleCount: 1, unseenCount: 1, eligibleCount: 3 },
    versions: {
      sessionRevision: 4,
      scheduleRevision: 4,
      exposureRevision: 2,
      participantSetRevision: 3,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 0,
    },
    attendanceSnapshotId: "attendance-snapshot-28",
    attendees: [
      {
        membershipId: HOST_APPROVED_PERSON_ID,
        avatarKey: "mushroom-green-book",
        displayName: "김하늘",
        accountName: "김하늘",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        attendanceRevision: 1,
        seenScheduleRevision: 4,
        scheduleSeenAt: "2026-08-30T01:00:00Z",
        scheduleSeenState: "CURRENT",
      },
      {
        membershipId: "membership-park",
        avatarKey: "peach-green-book",
        displayName: "박서윤",
        accountName: "박서윤",
        rsvpStatus: "NO_RESPONSE",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        attendanceRevision: 1,
        seenScheduleRevision: 3,
        scheduleSeenAt: "2026-08-20T01:00:00Z",
        scheduleSeenState: "STALE",
      },
      {
        membershipId: "membership-lee",
        avatarKey: "banana-green-book",
        displayName: "이도현",
        accountName: "이도현",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
        attendanceRevision: 1,
        seenScheduleRevision: null,
        scheduleSeenAt: null,
        scheduleSeenState: "UNSEEN",
      },
    ],
    feedbackDocument: {
      uploaded: false,
      fileName: null,
      uploadedAt: null,
    },
  };
}

function closingStatus(sessionId = HOST_APPROVED_SESSION_ID): HostSessionClosingStatusResponse {
  return {
    schema: "host.session_closing_status.v1",
    session: {
      sessionId,
      sessionNumber: 28,
      bookTitle: "지구 끝의 온실",
      meetingDate: "2026-09-01",
      state: "OPEN",
      recordVisibility: "MEMBER",
      sessionRevision: 4,
      participantSetRevision: 3,
      attendanceSnapshotId: "attendance-snapshot-28",
    },
    overall: { state: "NOT_STARTED", label: "모임 진행 중", primaryAction: "NONE" },
    checklist: [
      { id: "SESSION_CLOSED", state: "NOT_APPLICABLE", label: "모임 종료", detail: "아직 진행 중인 모임입니다.", href: null },
      {
        id: "RECORD_PACKAGE_SAVED",
        state: "NOT_APPLICABLE",
        label: "기록 패키지",
        detail: "마감 후 기록을 정리합니다.",
        href: `/app/host/sessions/${sessionId}`,
      },
    ],
    evidence: {
      summaryPublished: false,
      highlightCount: 0,
      oneLinerCount: 0,
      feedbackDocumentState: "MISSING",
      latestNotificationEvent: null,
      publicRecordHref: null,
      memberReflectionHref: null,
    },
  };
}

function meetingListPage(): HostSessionListPage & { summary: HostSessionLedgerSummary } {
  return {
    items: [
      meetingItem({
        sessionId: HOST_APPROVED_SESSION_ID,
        sessionNumber: 28,
        title: "스물여덟 번째 모임",
        bookTitle: "지구 끝의 온실",
        bookAuthor: "김초엽",
        date: "2026-09-01",
        state: "OPEN",
        recordStatus: "NOT_STARTED",
        needsAttention: false,
        hasDraft: false,
        liveRevision: 0,
        draftRevision: null,
        lastModifiedAt: "2026-08-30T10:00:00+09:00",
      }),
      meetingItem({
        sessionId: "session-29",
        sessionNumber: 29,
        title: "스물아홉 번째 모임",
        bookTitle: "작별하지 않는다",
        bookAuthor: "한강",
        date: "2026-09-22",
        state: "DRAFT",
        recordStatus: "NOT_STARTED",
        needsAttention: false,
        hasDraft: true,
        liveRevision: 0,
        draftRevision: 1,
        lastModifiedAt: "2026-08-28T10:00:00+09:00",
      }),
      meetingItem({
        sessionId: "session-30",
        sessionNumber: 30,
        title: "서른 번째 모임",
        bookTitle: "여름은 오래 그곳에 남아",
        bookAuthor: "김애란",
        date: "2026-10-13",
        state: "DRAFT",
        recordStatus: "NOT_STARTED",
        needsAttention: false,
        hasDraft: true,
        liveRevision: 0,
        draftRevision: 1,
        lastModifiedAt: "2026-08-27T10:00:00+09:00",
      }),
    ],
    nextCursor: "meetings-visual-next",
    summary: { needsAttentionCount: 2, incompletePublishedCount: 0, draftCount: 2 },
  };
}

function recordLedgerPage(): HostSessionRecordLedgerPage {
  return {
    items: [
      meetingItem({
        sessionId: "session-27",
        sessionNumber: 27,
        title: "스물일곱 번째 모임",
        bookTitle: "맡겨진 소녀",
        bookAuthor: "히가시노 게이고",
        date: "2026-08-18",
        state: "CLOSED",
        recordStatus: "INCOMPLETE",
        needsAttention: true,
        hasDraft: true,
        liveRevision: 4,
        draftRevision: 5,
        lastModifiedAt: "2026-08-20T10:00:00+09:00",
      }),
      meetingItem({
        sessionId: "session-24",
        sessionNumber: 24,
        title: "스물네 번째 모임",
        bookTitle: "이처럼 사소한 것들",
        bookAuthor: "클레어 키건",
        date: "2026-06-16",
        state: "CLOSED",
        recordStatus: "NOT_STARTED",
        needsAttention: true,
        hasDraft: false,
        liveRevision: 1,
        draftRevision: null,
        lastModifiedAt: "2026-06-16T21:30:00+09:00",
      }),
      meetingItem({
        sessionId: "session-26",
        sessionNumber: 26,
        title: "스물여섯 번째 모임",
        bookTitle: "단 한 사람",
        bookAuthor: "최진영",
        date: "2026-07-28",
        state: "PUBLISHED",
        recordStatus: "COMPLETE",
        needsAttention: false,
        hasDraft: false,
        liveRevision: 4,
        draftRevision: null,
        lastModifiedAt: "2026-07-30T10:00:00+09:00",
      }),
    ],
    nextCursor: "records-visual-next",
    summary: { needsAttentionCount: 2, incompletePublishedCount: 0, draftCount: 0 },
  };
}

function clubOperations(): HostClubOperationsResponse {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: EVALUATED_AT,
    club: {
      clubId: HOST_APPROVED_CLUB.clubId,
      slug: HOST_APPROVED_CLUB.clubSlug,
      name: HOST_APPROVED_CLUB.clubName,
    },
    readiness: {
      state: "READY",
      blockingReasons: [],
      nextAction: null,
    },
    sessionProgress: {
      upcomingCount: 1,
      currentOpenCount: 1,
      closedCount: 3,
      publishedRecordCount: 2,
      incompleteRecordCount: 1,
    },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.0000",
      state: "NO_ACTIVITY",
      priorFailedJobs7d: 0,
    },
  };
}

function notificationSummary(): HostNotificationSummary {
  return {
    pending: 0,
    failed: 0,
    dead: 0,
    sentLast24h: 2,
    latestFailures: [],
  };
}

function membersPage() {
  return {
    items: [
      memberRow(HOST_APPROVED_PERSON_ID, "김하늘", "mushroom-green-book", "ACTIVE", "2025-01-02T00:00:00+09:00", "2026-09-02T09:00:00+09:00"),
      memberRow("membership-park", "박서윤", "peach-green-book", "ACTIVE", "2025-10-02T00:00:00+09:00", "2026-09-01T10:00:00+09:00"),
      memberRow("membership-lee", "이도현", "banana-green-book", "ACTIVE", "2026-01-02T00:00:00+09:00", "2026-08-30T10:00:00+09:00"),
      memberRow("membership-jung", "정수아", "tulip-notebook", "ACTIVE", "2024-08-02T00:00:00+09:00", "2026-09-02T08:00:00+09:00"),
      memberRow("membership-han", "한지우", "candle-green-book", "VIEWER", "2026-08-27T00:00:00+09:00", "2026-09-02T07:00:00+09:00"),
      memberRow("membership-oh", "오민재", "apple-green-book", "SUSPENDED", "2025-07-02T00:00:00+09:00", "2026-08-21T10:00:00+09:00"),
      {
        ...memberRow("membership-yoon", "윤서진", "radish-notebook", "VIEWER", null, "2026-09-02T09:12:00+09:00"),
        createdAt: "2026-09-02T09:12:00+09:00",
        currentSessionParticipationStatus: null,
        canSuspend: false,
        canAddToCurrentSession: false,
        canRemoveFromCurrentSession: false,
      },
      {
        ...memberRow("membership-choi", "최도윤", "peach-green-book", "VIEWER", null, "2026-09-01T21:40:00+09:00"),
        createdAt: "2026-09-01T21:40:00+09:00",
        currentSessionParticipationStatus: null,
        canSuspend: false,
        canAddToCurrentSession: false,
        canRemoveFromCurrentSession: false,
      },
    ],
    nextCursor: "people-visual-next",
  };
}

function invitationLinks(): { items: HostInvitationLink[]; nextCursor: string | null } {
  return {
    items: [
      {
        linkId: "link-september",
        name: "9월 공개 초대",
        status: "ACTIVE",
        maxUses: 10,
        usedCount: 4,
        expiresAt: "2026-09-30T23:59:59Z",
        revision: 2,
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
      },
      {
        linkId: "link-friend",
        name: "친구 추천",
        status: "ACTIVE",
        maxUses: 5,
        usedCount: 2,
        expiresAt: "2027-12-31T23:59:59Z",
        revision: 1,
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
      },
      {
        linkId: "link-summer",
        name: "여름 모임",
        status: "ACTIVE",
        maxUses: 10,
        usedCount: 8,
        expiresAt: "2026-09-04T23:59:59Z",
        revision: 3,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
      },
      {
        linkId: "link-test",
        name: "테스트 링크",
        status: "PAUSED",
        maxUses: 1,
        usedCount: 1,
        expiresAt: "2026-08-01T23:59:59Z",
        revision: 4,
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-08-20T00:00:00Z",
      },
    ],
    nextCursor: null,
  };
}

function clubSettings(): HostClubSettings {
  return {
    clubId: HOST_APPROVED_CLUB.clubId,
    clubSlug: HOST_APPROVED_CLUB.clubSlug,
    name: HOST_APPROVED_CLUB.clubName,
    approvalPolicy: "HOST_APPROVAL",
    defaultTimezone: "Asia/Seoul",
    scheduleReminderEnabled: true,
    recordPublicationDefault: "MEMBER",
    revision: 4,
    status: "ACTIVE",
  };
}

function personDetail(membershipId: string): HostPersonDetail {
  const member = membersPage().items.find((item) => item.membershipId === membershipId);
  return {
    membershipId,
    displayName: member?.displayName ?? "김하늘",
    avatarKey: member?.avatarKey ?? "mushroom-green-book",
    status: member?.status ?? "ACTIVE",
    role: "MEMBER",
    lastClubAccessAt: member?.lastClubAccessAt ?? "2026-09-02T09:00:00+09:00",
    currentSchedule: {
      state: "OPEN",
      scheduleRevision: 4,
      scheduledAt: "2026-09-01T19:30:00",
    },
    currentRsvp: "GOING",
    attendanceHistory: {
      items: [
        { sessionNumber: 27, scheduledAt: "2026-08-18T19:30:00", attendanceStatus: "ATTENDED" },
        { sessionNumber: 26, scheduledAt: "2026-08-04T19:30:00", attendanceStatus: "ATTENDED" },
        { sessionNumber: 25, scheduledAt: "2026-07-21T19:30:00", attendanceStatus: "UNKNOWN" },
        { sessionNumber: 24, scheduledAt: "2026-07-07T19:30:00", attendanceStatus: "ABSENT" },
      ],
      nextCursor: "opaque-attendance-cursor",
    },
  };
}

function manualNotificationOptions(): ManualNotificationOptionsResponse {
  return {
    session: {
      sessionId: HOST_APPROVED_SESSION_ID,
      sessionNumber: 28,
      bookTitle: "지구 끝의 온실",
      date: "2026-09-01",
      state: "OPEN",
      visibility: "MEMBER",
      feedbackDocumentUploaded: false,
      scheduleRevision: 4,
    },
    templates: [{
      eventType: "SESSION_REMINDER_DUE",
      contentRevision: CONTENT_REVISION,
      label: "모임 리마인더",
      enabled: true,
      disabledReason: null,
      defaultAudience: "SELECTED_MEMBERS",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "CONFIRMED_ATTENDEES", "SELECTED_MEMBERS"],
      defaultChannels: "BOTH",
      defaultSubject: "다음 모임 일정",
      defaultBody: "다음 모임 일정을 확인해 주세요.",
    }],
    members: {
      items: [{
        membershipId: HOST_APPROVED_PERSON_ID,
        displayName: "김하늘",
        maskedEmail: "sky@example.test",
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
  };
}

function allowHostFixturePaths(requestAudit: ApprovedRouteRequestAudit): void {
  const getPaths = [
    "/api/bff/api/auth/me",
    "/api/bff/api/me/club-access",
    "/api/bff/api/me/notifications",
    "/api/bff/api/sessions/current",
    "/api/bff/api/host/capabilities",
    "/api/bff/api/host/operating-room/current",
    "/api/bff/api/host/sessions",
    "/api/bff/api/host/sessions/schedule-defaults",
    "/api/bff/api/host/sessions/trash",
    "/api/bff/api/host/club-operations",
    "/api/bff/api/host/notifications/summary",
    "/api/bff/api/host/notifications/policy",
    "/api/bff/api/host/notifications/manual/options",
    "/api/bff/api/host/notifications/manual/dispatches",
    "/api/bff/api/host/workbox",
    "/api/bff/api/host/members",
    "/api/bff/api/host/invitations",
    "/api/bff/api/host/invitation-links",
    "/api/bff/api/host/club-settings",
    "/api/bff/api/host/club-settings/history",
  ];
  for (const path of getPaths) {
    requestAudit.allowFixture({ method: "GET", path });
  }
  requestAudit.allowFixture({ method: "PUT", path: "/api/bff/api/me/club-access" });
  requestAudit.allowFixture({ method: "POST", path: FRONTEND_OBSERVABILITY_PATH });
  for (const sessionId of SESSION_IDS) {
    for (const suffix of [
      "",
      "/closing-status",
      "/history",
      "/record-editor",
      "/publication/convergence",
      "/record-apply-preview",
      "/ai-generate/jobs/recent",
      "/ai-generate/models",
    ]) {
      requestAudit.allowFixture({
        method: "GET",
        path: `/api/bff/api/host/sessions/${sessionId}${suffix}`,
      });
    }
  }
  for (const membershipId of MEMBERSHIP_IDS) {
    requestAudit.allowFixture({ method: "GET", path: `/api/bff/api/host/people/${membershipId}` });
  }
}

function isVisualAuthorityScope(url: URL): boolean {
  const clubSlug = url.searchParams.get("clubSlug");
  return clubSlug === null || clubSlug === HOST_APPROVED_CLUB.clubSlug;
}

export type InstallHostApprovedRoutesOptions = {
  workboxItems?: number;
};

export async function installHostApprovedRoutes(
  page: Page,
  fixtureKey: string,
  requestAudit: ApprovedRouteRequestAudit,
  options?: InstallHostApprovedRoutesOptions,
): Promise<void> {
  if (!HOST_APPROVED_FIXTURE_KEYS.has(fixtureKey as ApprovedRouteFixtureKey)) {
    throw new Error(`Unsupported Host fixture key: ${fixtureKey}`);
  }

  const workboxItems = options?.workboxItems ?? DEFAULT_WORKBOX_ITEMS;
  allowHostFixturePaths(requestAudit);
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await routeHostEditorShell(page, HOST_APPROVED_CLUB.clubSlug);

  await page.route("**/api/bff/api/auth/me**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get("clubSlug") && url.searchParams.get("clubSlug") !== HOST_APPROVED_CLUB.clubSlug) {
      await json(route, 403, { error: "club_mismatch" });
      return;
    }
    await json(route, 200, buildHostApprovedAuth());
  });

  await page.route("**/api/bff/api/me/club-access**", async (route) => {
    const method = route.request().method();
    if (method !== "GET" && method !== "PUT") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    if (!isVisualAuthorityScope(url)) {
      await json(route, 403, { error: "club_mismatch" });
      return;
    }
    await json(route, 200, { lastClubAccessAt: "2026-08-29T01:02:03Z" });
  });

  await page.route("**/api/bff/api/me/notifications**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await json(route, 200, { items: [], nextCursor: null, unreadCount: 0 });
  });

  await page.route("**/api/bff/api/sessions/current**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    if (!isVisualAuthorityScope(url)) {
      await json(route, 403, { error: "club_mismatch" });
      return;
    }
    await json(route, 200, { currentSession: null });
  });

  await page.route("**/api/bff/observability/frontend-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 204 });
  });

  await page.route("**/api/bff/api/host/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get("clubSlug") !== HOST_APPROVED_CLUB.clubSlug) {
      await json(route, 403, { error: "club_mismatch" });
      return;
    }

    const pathname = url.pathname;
    if (pathname === "/api/bff/api/host/operating-room/current") {
      await json(route, 200, operatingRoomCurrent());
      return;
    }
    if (pathname === "/api/bff/api/host/club-operations") {
      await json(route, 200, clubOperations());
      return;
    }
    if (pathname === "/api/bff/api/host/notifications/summary") {
      await json(route, 200, notificationSummary());
      return;
    }
    if (pathname === "/api/bff/api/host/notifications/policy") {
      await json(route, 200, {
        sessionReminderEnabled: true,
        updatedAt: "2026-08-20T10:00:00+09:00",
      });
      return;
    }
    if (pathname === "/api/bff/api/host/notifications/manual/options") {
      await json(route, 200, manualNotificationOptions());
      return;
    }
    if (pathname === "/api/bff/api/host/notifications/manual/dispatches") {
      await json(route, 200, { items: [], nextCursor: null });
      return;
    }
    if (pathname === "/api/bff/api/host/workbox") {
      const state = url.searchParams.get("state");
      if (state !== "NOW" && state !== "DEFERRED" && state !== "COMPLETED") {
        await json(route, 400, { error: "invalid_workbox_state" });
        return;
      }
      if (url.searchParams.get("cursor")) {
        await json(route, 200, buildHostApprovedWorkboxPage(0, state));
        return;
      }
      await json(route, 200, buildHostApprovedWorkboxPage(workboxItems, state));
      return;
    }
    if (pathname === "/api/bff/api/host/members") {
      await json(route, 200, membersPage());
      return;
    }
    if (pathname === "/api/bff/api/host/invitations") {
      await json(route, 200, { items: [], nextCursor: null });
      return;
    }
    if (pathname === "/api/bff/api/host/invitation-links") {
      await json(route, 200, invitationLinks());
      return;
    }
    if (pathname === "/api/bff/api/host/club-settings") {
      await json(route, 200, clubSettings());
      return;
    }
    if (pathname === "/api/bff/api/host/club-settings/history") {
      await json(route, 200, { items: [], nextCursor: null });
      return;
    }
    if (pathname === "/api/bff/api/host/capabilities") {
      await json(route, 200, {
        sessionRecordDrafts: true,
        hostActionNotificationConfirmationRequired: true,
      });
      return;
    }
    if (pathname === "/api/bff/api/host/sessions/schedule-defaults") {
      await json(route, 200, {
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "을지로 북살롱",
        meetingUrl: null,
        meetingPasscode: null,
        accessScope: "HOST_ONLY",
        suggestedDate: null,
        questionDeadlineOffsetDays: 1,
        hints: [],
      });
      return;
    }
    if (pathname === "/api/bff/api/host/sessions/trash") {
      await json(route, 200, { items: [], nextCursor: null });
      return;
    }
    if (pathname === "/api/bff/api/host/sessions") {
      if (url.searchParams.get("mode") === "record" || url.searchParams.has("needsAttention")) {
        await json(route, 200, recordLedgerPage());
        return;
      }
      await json(route, 200, meetingListPage());
      return;
    }

    const sessionMatch = /^\/api\/bff\/api\/host\/sessions\/([^/]+)(?:\/(.*))?$/.exec(pathname);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const rest = sessionMatch[2] ?? "";
      if (!SESSION_IDS.includes(sessionId as typeof SESSION_IDS[number])) {
        await route.fallback();
        return;
      }
      if (rest === "") {
        await json(route, 200, sessionDetail(sessionId));
        return;
      }
      if (rest === "closing-status") {
        await json(route, 200, closingStatus(sessionId));
        return;
      }
      if (rest === "history") {
        await json(route, 200, { items: [], nextCursor: null });
        return;
      }
      if (rest === "record-editor") {
        await json(route, 200, {
          sessionId,
          liveRevision: 0,
          liveSessionUpdatedAt: "2026-08-30T00:00:00Z",
          liveSnapshot: {
            schema: "readmates-session-record:v1",
            visibility: "HOST_ONLY",
            publicationSummary: "",
            highlights: [],
            oneLineReviews: [],
            feedbackDocument: { fileName: "", title: "", markdown: "" },
          },
          draft: null,
          draftLiveBaseStale: false,
          validationSummary: { valid: true, issues: [] },
        });
        return;
      }
      if (rest === "publication/convergence") {
        await route.fulfill({ status: 204 });
        return;
      }
      if (rest === "record-apply-preview") {
        await json(route, 200, {
          eventType: "SESSION_RECORD_UPDATED",
          expectedDraftHash: "visual-draft-hash",
        });
        return;
      }
      if (rest === "ai-generate/jobs/recent") {
        await route.fulfill({ status: 204 });
        return;
      }
      if (rest === "ai-generate/models") {
        await json(route, 200, {
          models: [{ id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: true }],
        });
        return;
      }
      await route.fallback();
      return;
    }

    const personMatch = /^\/api\/bff\/api\/host\/people\/([^/]+)$/.exec(pathname);
    if (personMatch) {
      await json(route, 200, personDetail(personMatch[1]));
      return;
    }

    await route.fallback();
  });
}
