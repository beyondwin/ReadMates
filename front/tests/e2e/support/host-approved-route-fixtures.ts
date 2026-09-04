import type { Page, Route } from "@playwright/test";
import type {
  HostClubOperationsResponse,
  HostNotificationSummary,
  HostOperatingRoomCurrentResponse,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
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
import {
  approvedClubSettings,
  approvedInvitationLinks,
  approvedMeetingSections,
  approvedPeopleLedgerFacts,
  approvedPeopleMembers,
  approvedPeoplePendingMembers,
  approvedPerson,
  approvedRecordItems,
  approvedRecordLedgerSummary,
  approvedScheduleReviewMembers,
  approvedScheduleReviewPreview,
} from "@/features/host/ui/approved-host-ledgers.data";
import { routeHostEditorShell } from "../aigen-test-fixtures";
import {
  installApprovedRouteCatchAllAudit,
  PREVIEW_NOTIFICATION_PATH,
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
const CLIENT_CONTRACT_STATUS_PATH = "/api/bff/__internal/client-contract-status";
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

export type HostApprovedCopyVariant = "default" | "long-korean" | "long-english" | "unbroken-token";
export type HostApprovedWorkboxState = "ready" | "partial" | "unavailable";
export type HostApprovedCurrentMeeting = "present" | "none";
export type HostApprovedLiveMutation = "none" | "conflict" | "unknown";

export type InstallHostApprovedRoutesOptions = {
  workboxItems?: number;
  copy?: HostApprovedCopyVariant;
  workboxState?: HostApprovedWorkboxState;
  currentMeeting?: HostApprovedCurrentMeeting;
  liveMutation?: HostApprovedLiveMutation;
};

const HOST_STRESS_COPY: Record<Exclude<HostApprovedCopyVariant, "default">, string> = {
  "long-korean": "일정 확인이 필요한 멤버가 늘어 호스트가 변경 전 확인과 미열람 인원을 다시 살펴봐야 하는 상태입니다",
  "long-english": "Schedule confirmation is overdue and the host must review unseen members before continuing the current operating-room work.",
  "unbroken-token": "A".repeat(160),
};

const SESSION_IDS = [...new Set([
  ...approvedMeetingSections.upcoming.rows.map((row) => row.id),
  ...approvedMeetingSections.past.rows.map((row) => row.id),
  ...approvedRecordItems.map((item) => item.sessionId),
])];

const MEMBERSHIP_IDS = [...new Set([
  ...approvedPeopleMembers.map((member) => member.membershipId),
  ...approvedPeoplePendingMembers.map((member) => member.membershipId),
  ...approvedScheduleReviewMembers.map((member) => member.membershipId),
  approvedPerson.membershipId,
])];

const SESSION_ID_SET = new Set(SESSION_IDS);
const MEMBERSHIP_ID_SET = new Set(MEMBERSHIP_IDS);

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function workboxItem(
  type: HostWorkItemType,
  index: number,
  copy: HostApprovedCopyVariant = "default",
): HostWorkboxItem {
  const base = WORKBOX_COPY[type];
  const title = index === 0 && copy !== "default" ? HOST_STRESS_COPY[copy] : base.title;
  return {
    key: `${type}:${base.resource}:${index}`,
    type,
    state: "NOW",
    title,
    description: base.description,
    count: index + 1,
    dueAt: index % 2 === 0 ? "2026-08-31T09:00:00Z" : null,
    deferredUntil: null,
    resolvedAt: null,
    destinationHref: base.href,
    receiptSummary: null,
  };
}

export function buildHostApprovedWorkboxPage(
  itemCount = DEFAULT_WORKBOX_ITEMS,
  state: HostWorkboxPage["state"] = "NOW",
  options?: { copy?: HostApprovedCopyVariant; partial?: boolean },
): HostWorkboxPage {
  const copy = options?.copy ?? "default";
  const items = state === "NOW"
    ? Array.from({ length: itemCount }, (_, index) => workboxItem(WORKBOX_TYPES[index % WORKBOX_TYPES.length], index, copy))
    : [];
  return {
    state,
    evaluatedAt: EVALUATED_AT,
    sourceAvailability: WORKBOX_TYPES.map((type) => (
      options?.partial && type === "RECORD_CLOSING"
        ? { type, state: "UNAVAILABLE" as const, failureCode: "RECORD_SOURCE_UNAVAILABLE" as const }
        : { type, state: "AVAILABLE" as const }
    )),
    items,
    nextCursor: null,
  };
}

type CursorPage<T> = { items: T[]; nextCursor: string | null };

export function resolveHostApprovedCursorPage<T extends CursorPage<unknown>>(
  firstPage: T,
  cursor: string | null,
): T | null {
  if (cursor == null || cursor === "") return firstPage;
  if (firstPage.nextCursor !== null && cursor === firstPage.nextCursor) {
    return { ...firstPage, items: [], nextCursor: null };
  }
  return null;
}

function folioNumber(folio: string): number {
  const match = /No\.(\d+)/.exec(folio);
  return match ? Number(match[1]) : 0;
}

function rsvpFromLedgerLabel(label: string | undefined): HostPersonDetail["currentRsvp"] {
  if (label === "참석") return "GOING";
  if (label === "불참") return "DECLINED";
  if (label === "미응답") return "NO_RESPONSE";
  return null;
}

function scheduleSeenFromLedgerLabel(label: string | undefined): "CURRENT" | "STALE" | "UNSEEN" {
  if (label === "현재 일정 확인") return "CURRENT";
  if (label === "변경 전 확인") return "STALE";
  return "UNSEEN";
}

export function buildHostApprovedRecordLedger(): HostSessionRecordLedgerPage {
  return {
    items: approvedRecordItems.map((item) => ({ ...item })),
    nextCursor: "records-visual-next",
    summary: { ...approvedRecordLedgerSummary },
  };
}

export function buildHostApprovedMeetingList(): HostSessionListPage & { summary: HostSessionLedgerSummary } {
  const venue = approvedRecordItems[0];
  return {
    items: approvedMeetingSections.upcoming.rows.map((row) => {
      const record = approvedRecordItems.find((item) => item.sessionId === row.id);
      const draft = row.lifecycleLabel === "작성 중";
      return {
        sessionId: row.id,
        sessionNumber: record?.sessionNumber ?? folioNumber(row.ordinalFolio),
        title: record?.title ?? row.title,
        bookTitle: record?.bookTitle ?? row.title,
        bookAuthor: record?.bookAuthor ?? "",
        bookImageUrl: record?.bookImageUrl ?? null,
        date: row.date,
        startTime: record?.startTime ?? venue?.startTime ?? "19:30",
        endTime: record?.endTime ?? venue?.endTime ?? "21:30",
        locationLabel: record?.locationLabel ?? venue?.locationLabel ?? "을지로 북살롱",
        state: row.id === HOST_APPROVED_SESSION_ID ? "OPEN" : "DRAFT",
        visibility: record?.visibility ?? "MEMBER",
        recordStatus: record?.recordStatus ?? "NOT_STARTED",
        needsAttention: false,
        hasDraft: draft,
        liveRevision: record?.liveRevision ?? 0,
        draftRevision: draft ? 1 : null,
        lastModifiedAt: record?.lastModifiedAt ?? null,
      };
    }),
    nextCursor: "meetings-visual-next",
    summary: {
      needsAttentionCount: approvedRecordLedgerSummary.needsAttentionCount,
      incompletePublishedCount: approvedRecordLedgerSummary.incompletePublishedCount,
      draftCount: approvedMeetingSections.upcoming.rows.filter((row) => row.lifecycleLabel === "작성 중").length,
    },
  };
}

export type HostApprovedSessionDetailOptions = {
  lifecycle?: HostSessionDetailResponse["state"];
  attendanceMix?: boolean;
};

function sessionAttendees(
  sessionId: string,
  attendanceMix = false,
): HostSessionDetailResponse["attendees"] {
  if (sessionId !== HOST_APPROVED_SESSION_ID) return [];
  const fromPeople = approvedPeopleMembers
    .filter((member) => member.status === "ACTIVE")
    .map((member) => {
      const facts = approvedPeopleLedgerFacts[member.membershipId as keyof typeof approvedPeopleLedgerFacts];
      const seen = scheduleSeenFromLedgerLabel(facts?.scheduleSeenLabel);
      return {
        membershipId: member.membershipId,
        avatarKey: member.avatarKey ?? "apple-green-book",
        displayName: member.displayName,
        accountName: member.accountName,
        rsvpStatus: rsvpFromLedgerLabel(facts?.rsvpLabel) ?? "NO_RESPONSE",
        attendanceStatus: "UNKNOWN" as const,
        participationStatus: "ACTIVE" as const,
        attendanceRevision: 1,
        seenScheduleRevision: seen === "CURRENT" ? 4 : seen === "STALE" ? 3 : null,
        scheduleSeenAt: seen === "UNSEEN" ? null : member.lastClubAccessAt,
        scheduleSeenState: seen,
      };
    });
  const extra = approvedScheduleReviewMembers
    .filter((member) => !fromPeople.some((attendee) => attendee.membershipId === member.membershipId))
    .map((member) => ({
      membershipId: member.membershipId,
      avatarKey: member.avatarKey,
      displayName: member.displayName,
      accountName: member.displayName,
      rsvpStatus: "NO_RESPONSE" as const,
      attendanceStatus: "UNKNOWN" as const,
      participationStatus: "ACTIVE" as const,
      attendanceRevision: 1,
      seenScheduleRevision: member.scheduleSeenState === "STALE" ? 3 : null,
      scheduleSeenAt: null,
      scheduleSeenState: member.scheduleSeenState,
    }));
  const attendees = [...fromPeople, ...extra];
  if (!attendanceMix) return attendees;
  return attendees.map((attendee, index) => ({
    ...attendee,
    attendanceStatus: index < 8 ? "ATTENDED" : index === 8 ? "ABSENT" : "UNKNOWN",
  }));
}

export function buildHostApprovedSessionDetail(
  sessionId: string,
  options?: HostApprovedSessionDetailOptions,
): HostSessionDetailResponse | null {
  if (!SESSION_ID_SET.has(sessionId)) return null;
  const upcoming = approvedMeetingSections.upcoming.rows.find((row) => row.id === sessionId);
  const past = approvedMeetingSections.past.rows.find((row) => row.id === sessionId);
  const record = approvedRecordItems.find((item) => item.sessionId === sessionId);
  const row = upcoming ?? past;
  if (!record && !row) return null;

  const currentOpen = sessionId === HOST_APPROVED_SESSION_ID;
  const state = options?.lifecycle
    ?? (currentOpen ? "OPEN" : record?.state ?? (upcoming ? "DRAFT" : "CLOSED"));
  const attendees = sessionAttendees(sessionId, Boolean(options?.attendanceMix) && state === "OPEN");
  const eligible = attendees.filter((attendee) => attendee.participationStatus === "ACTIVE");
  return {
    sessionId,
    sessionNumber: record?.sessionNumber ?? (row ? folioNumber(row.ordinalFolio) : 0),
    title: record?.title ?? row?.title ?? "",
    bookTitle: record?.bookTitle ?? row?.title ?? "",
    bookAuthor: record?.bookAuthor ?? "",
    bookLink: null,
    bookImageUrl: record?.bookImageUrl ?? null,
    locationLabel: record?.locationLabel ?? "을지로 북살롱",
    meetingUrl: null,
    meetingPasscode: null,
    date: record?.date ?? row?.date ?? "",
    startTime: record?.startTime ?? "19:30",
    endTime: record?.endTime ?? "21:30",
    questionDeadlineAt: `${record?.date ?? row?.date ?? "2026-08-31"}T14:59:00Z`.replace(
      /^(\d{4}-\d{2}-)(\d{2})/,
      (_, prefix: string, day: string) => `${prefix}${String(Math.max(1, Number(day) - 1)).padStart(2, "0")}`,
    ),
    visibility: record?.visibility ?? "MEMBER",
    accessScope: "GUEST_READABLE",
    siteVisibility: "HIDDEN",
    publication: null,
    state,
    scheduleRevision: 4,
    scheduleSeenAvailability: currentOpen ? "AVAILABLE" : "UNAVAILABLE",
    scheduleSeenSummary: currentOpen
      ? {
        currentCount: eligible.filter((attendee) => attendee.scheduleSeenState === "CURRENT").length,
        staleCount: eligible.filter((attendee) => attendee.scheduleSeenState === "STALE").length,
        unseenCount: eligible.filter((attendee) => attendee.scheduleSeenState === "UNSEEN").length,
        eligibleCount: eligible.length,
      }
      : { currentCount: null, staleCount: null, unseenCount: null, eligibleCount: null },
    versions: {
      sessionRevision: record?.liveRevision ?? 4,
      scheduleRevision: 4,
      exposureRevision: 2,
      participantSetRevision: attendees.length,
      recordDraftRevision: record?.draftRevision ?? null,
      liveRecordRevision: record?.liveRevision ?? null,
      publicationRevision: record?.state === "PUBLISHED" ? 1 : 0,
    },
    attendanceSnapshotId: `attendance-snapshot-${sessionId}`,
    attendees,
    feedbackDocument: {
      uploaded: false,
      fileName: null,
      uploadedAt: null,
    },
  };
}

export function buildHostApprovedPersonDetail(membershipId: string): HostPersonDetail | null {
  if (!MEMBERSHIP_ID_SET.has(membershipId)) return null;
  const member = [...approvedPeopleMembers, ...approvedPeoplePendingMembers]
    .find((item) => item.membershipId === membershipId);
  const review = approvedScheduleReviewMembers.find((item) => item.membershipId === membershipId);
  const facts = approvedPeopleLedgerFacts[membershipId as keyof typeof approvedPeopleLedgerFacts];
  if (membershipId === approvedPerson.membershipId) {
    return {
      ...approvedPerson,
      displayName: member?.displayName ?? approvedPerson.displayName,
      avatarKey: member?.avatarKey ?? approvedPerson.avatarKey,
      lastClubAccessAt: member?.lastClubAccessAt ?? approvedPerson.lastClubAccessAt,
      currentRsvp: rsvpFromLedgerLabel(facts?.rsvpLabel) ?? approvedPerson.currentRsvp,
    };
  }
  if (!member && !review) return null;
  return {
    membershipId,
    displayName: member?.displayName ?? review?.displayName ?? membershipId,
    avatarKey: member?.avatarKey ?? review?.avatarKey ?? "apple-green-book",
    status: member?.status ?? "ACTIVE",
    role: "MEMBER",
    lastClubAccessAt: member?.lastClubAccessAt ?? null,
    currentSchedule: {
      state: "OPEN",
      scheduleRevision: 4,
      scheduledAt: "2026-09-01T19:30:00",
    },
    currentRsvp: rsvpFromLedgerLabel(facts?.rsvpLabel),
    attendanceHistory: {
      items: approvedPerson.attendanceHistory.items.map((item) => ({ ...item })),
      nextCursor: approvedPerson.attendanceHistory.nextCursor,
    },
  };
}

export function buildHostApprovedMembersPage() {
  return {
    items: [...approvedPeopleMembers, ...approvedPeoplePendingMembers],
    nextCursor: "people-visual-next",
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

function requestedOperatingPhase(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).searchParams.get("phase");
  } catch {
    return null;
  }
}

export function hostApprovedCurrentSelection(
  fixtureKey: ApprovedRouteFixtureKey,
  pageUrl: string,
): "OPEN" | "UPCOMING_DRAFT" | "CLOSING_REQUIRED" {
  if (fixtureKey === "host-records" || requestedOperatingPhase(pageUrl) === "closing") {
    return "CLOSING_REQUIRED";
  }
  return "OPEN";
}

export function hostApprovedSessionDetailOptionsFor(
  fixtureKey: ApprovedRouteFixtureKey,
  pageUrl: string,
  sessionId: string,
): HostApprovedSessionDetailOptions | undefined {
  if (sessionId !== HOST_APPROVED_SESSION_ID) return undefined;
  if (hostApprovedCurrentSelection(fixtureKey, pageUrl) === "CLOSING_REQUIRED") {
    return { lifecycle: "CLOSED" };
  }
  return { attendanceMix: true };
}

function operatingRoomCurrent(
  page: Page,
  fixtureKey: ApprovedRouteFixtureKey,
  options?: InstallHostApprovedRoutesOptions,
): HostOperatingRoomCurrentResponse {
  if (options?.currentMeeting === "none") {
    return { currentMeeting: null };
  }
  return buildHostApprovedOperatingRoomCurrent(hostApprovedCurrentSelection(fixtureKey, page.url()));
}

export function buildHostApprovedOperatingRoomCurrent(
  selection: "OPEN" | "UPCOMING_DRAFT" | "CLOSING_REQUIRED" = "OPEN",
): HostOperatingRoomCurrentResponse {
  const closing = selection === "CLOSING_REQUIRED";
  return {
    currentMeeting: {
      sessionId: HOST_APPROVED_SESSION_ID,
      selection,
      scheduleSeenAvailability: "AVAILABLE",
    },
  };
}

export function buildHostApprovedClosingStatus(
  sessionId: string,
  options?: HostApprovedSessionDetailOptions,
): HostSessionClosingStatusResponse | null {
  const detail = buildHostApprovedSessionDetail(sessionId, options);
  if (!detail) return null;
  const closed = detail.state === "CLOSED" || detail.state === "PUBLISHED";
  return {
    schema: "host.session_closing_status.v1",
    session: {
      sessionId: detail.sessionId,
      sessionNumber: detail.sessionNumber,
      bookTitle: detail.bookTitle,
      meetingDate: detail.date,
      state: detail.state,
      recordVisibility: detail.visibility,
      sessionRevision: detail.versions.sessionRevision,
      participantSetRevision: detail.versions.participantSetRevision,
      attendanceSnapshotId: detail.attendanceSnapshotId,
    },
    overall: closed
      ? { state: "IN_PROGRESS", label: "기록 정리 중", primaryAction: "IMPORT_RECORDS" }
      : { state: "NOT_STARTED", label: "모임 진행 중", primaryAction: "NONE" },
    checklist: closed
      ? [
        { id: "SESSION_CLOSED", state: "DONE", label: "모임 종료", detail: "출석이 확정되었습니다.", href: null },
        {
          id: "MEMBER_NOTIFICATION_SENT",
          state: "ACTION_REQUIRED",
          label: "소감 수집",
          detail: "멤버 회고 안내를 확인하세요.",
          href: `/app/host/sessions/${sessionId}`,
        },
        {
          id: "RECORD_PACKAGE_SAVED",
          state: "ACTION_REQUIRED",
          label: "기록 패키지",
          detail: "정리본을 검토하세요.",
          href: `/app/host/sessions/${sessionId}?section=records`,
        },
        {
          id: "FEEDBACK_DOCUMENT_READY",
          state: "ACTION_REQUIRED",
          label: "피드백 문서",
          detail: "게시 전에 피드백 문서를 확인해 주세요.",
          href: `/app/host/sessions/${sessionId}`,
        },
        {
          id: "PUBLIC_RECORD_VISIBLE",
          state: "ACTION_REQUIRED",
          label: "멤버 게시",
          detail: "게시 조건을 확인하세요.",
          href: `/app/host/sessions/${sessionId}`,
        },
      ]
      : [
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

function invitationLinks(): { items: HostInvitationLink[]; nextCursor: string | null } {
  return {
    items: approvedInvitationLinks.map((link) => ({ ...link })),
    nextCursor: null,
  };
}

function clubSettings(): HostClubSettings {
  return {
    ...approvedClubSettings,
    clubId: HOST_APPROVED_CLUB.clubId,
    clubSlug: HOST_APPROVED_CLUB.clubSlug,
    name: HOST_APPROVED_CLUB.clubName,
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

export function isApprovedHostPreviewPost(request: {
  method: string;
  path: string;
  postData: string | null;
  url?: string;
}): boolean {
  if (request.method.toUpperCase() !== "POST" || request.path !== PREVIEW_NOTIFICATION_PATH) {
    return false;
  }
  let clubSlug: string | null = null;
  try {
    clubSlug = new URL(request.url ?? "", "https://visual-authority.readmates.invalid").searchParams.get("clubSlug");
  } catch {
    return false;
  }
  if (clubSlug !== HOST_APPROVED_CLUB.clubSlug || !request.postData) return false;
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(request.postData);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    payload = parsed as Record<string, unknown>;
  } catch {
    return false;
  }
  const selected = Array.isArray(payload.selectedMembershipIds)
    ? [...payload.selectedMembershipIds].map(String).sort()
    : [];
  const expected = [...approvedScheduleReviewMembers.map((member) => member.membershipId)].sort();
  return payload.sessionId === HOST_APPROVED_SESSION_ID
    && payload.eventType === "SESSION_REMINDER_DUE"
    && payload.sendMode === "NOW"
    && payload.contentRevision === CONTENT_REVISION
    && payload.scheduleRevision === approvedScheduleReviewPreview.scheduleRevision
    && payload.subject === approvedScheduleReviewPreview.template.subject
    && payload.body === approvedScheduleReviewPreview.template.bodyPreview
    && payload.audience === "SELECTED_MEMBERS"
    && selected.length === expected.length
    && selected.every((id, index) => id === expected[index]);
}

function manualNotificationOptions(): ManualNotificationOptionsResponse {
  const preview = approvedScheduleReviewPreview;
  const session = buildHostApprovedSessionDetail(HOST_APPROVED_SESSION_ID);
  return {
    session: {
      sessionId: HOST_APPROVED_SESSION_ID,
      sessionNumber: session?.sessionNumber ?? 28,
      bookTitle: session?.bookTitle ?? "지구 끝의 온실",
      date: session?.date ?? "2026-09-01",
      state: session?.state ?? "OPEN",
      visibility: session?.visibility ?? "MEMBER",
      feedbackDocumentUploaded: false,
      scheduleRevision: preview.scheduleRevision,
    },
    templates: [{
      eventType: preview.template.eventType,
      contentRevision: CONTENT_REVISION,
      label: preview.template.label,
      enabled: true,
      disabledReason: null,
      defaultAudience: preview.audience.baseGroup,
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "CONFIRMED_ATTENDEES", "SELECTED_MEMBERS"],
      defaultChannels: preview.channels.requested,
      defaultSubject: preview.template.subject,
      defaultBody: preview.template.bodyPreview,
    }],
    members: {
      items: approvedScheduleReviewMembers.map((member) => ({
        membershipId: member.membershipId,
        displayName: member.displayName,
        maskedEmail: `${member.membershipId.replace("membership-", "")}@example.test`,
        role: "MEMBER" as const,
        membershipStatus: "ACTIVE" as const,
        sessionParticipationStatus: "ACTIVE" as const,
        attendanceStatus: "UNKNOWN" as const,
        emailEligibility: "ELIGIBLE" as const,
        inAppEligibility: "ELIGIBLE" as const,
      })),
      nextCursor: null,
    },
    recentDispatches: preview.duplicates.recentDispatches,
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
  requestAudit.allowFixture({ method: "GET", path: CLIENT_CONTRACT_STATUS_PATH });
  requestAudit.allowValidatedPreview({
    method: "POST",
    path: PREVIEW_NOTIFICATION_PATH,
    validate: isApprovedHostPreviewPost,
  });
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

async function fulfillCursorPage<T extends CursorPage<unknown>>(
  route: Route,
  firstPage: T,
): Promise<void> {
  const cursor = new URL(route.request().url()).searchParams.get("cursor");
  const page = resolveHostApprovedCursorPage(firstPage, cursor);
  if (page == null) {
    await route.fallback();
    return;
  }
  await json(route, 200, page);
}

export async function installHostApprovedRoutes(
  page: Page,
  fixtureKey: ApprovedRouteFixtureKey,
  requestAudit: ApprovedRouteRequestAudit,
  options?: InstallHostApprovedRoutesOptions,
): Promise<void> {
  if (!HOST_APPROVED_FIXTURE_KEYS.has(fixtureKey)) {
    throw new Error(`Unsupported Host fixture key: ${fixtureKey}`);
  }

  const workboxItems = options?.workboxItems ?? DEFAULT_WORKBOX_ITEMS;
  let conflictRefetchAbsentsSky = false;
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
      await json(route, 200, operatingRoomCurrent(page, fixtureKey, options));
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
      if (options?.workboxState === "unavailable") {
        await json(route, 503, { error: "workbox_unavailable" });
        return;
      }
      const state = url.searchParams.get("state");
      if (state !== "NOW" && state !== "DEFERRED" && state !== "COMPLETED") {
        await json(route, 400, { error: "invalid_workbox_state" });
        return;
      }
      await fulfillCursorPage(route, buildHostApprovedWorkboxPage(workboxItems, state, {
        copy: options?.copy,
        partial: options?.workboxState === "partial",
      }));
      return;
    }
    if (pathname === "/api/bff/api/host/members") {
      await fulfillCursorPage(route, buildHostApprovedMembersPage());
      return;
    }
    if (pathname === "/api/bff/api/host/invitations") {
      await json(route, 200, { items: [], nextCursor: null });
      return;
    }
    if (pathname === "/api/bff/api/host/invitation-links") {
      await fulfillCursorPage(route, invitationLinks());
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
      const firstPage = url.searchParams.get("mode") === "record" || url.searchParams.has("needsAttention")
        ? buildHostApprovedRecordLedger()
        : buildHostApprovedMeetingList();
      await fulfillCursorPage(route, firstPage);
      return;
    }

    const sessionMatch = /^\/api\/bff\/api\/host\/sessions\/([^/]+)(?:\/(.*))?$/.exec(pathname);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const rest = sessionMatch[2] ?? "";
      if (!SESSION_ID_SET.has(sessionId)) {
        await route.fallback();
        return;
      }
      if (rest === "") {
        const detail = buildHostApprovedSessionDetail(
          sessionId,
          hostApprovedSessionDetailOptionsFor(fixtureKey, page.url(), sessionId),
        );
        if (!detail) {
          await route.fallback();
          return;
        }
        await json(route, 200, conflictRefetchAbsentsSky
          ? {
            ...detail,
            attendees: detail.attendees.map((attendee) => attendee.membershipId === HOST_APPROVED_PERSON_ID
              ? { ...attendee, attendanceStatus: "ABSENT" as const, attendanceRevision: attendee.attendanceRevision + 1 }
              : attendee),
          }
          : detail);
        return;
      }
      if (rest === "closing-status") {
        const status = buildHostApprovedClosingStatus(
          sessionId,
          hostApprovedSessionDetailOptionsFor(fixtureKey, page.url(), sessionId),
        );
        if (!status) {
          await route.fallback();
          return;
        }
        await json(route, 200, status);
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
      const person = buildHostApprovedPersonDetail(personMatch[1]);
      if (!person) {
        await route.fallback();
        return;
      }
      const attendance = resolveHostApprovedCursorPage(
        person.attendanceHistory,
        url.searchParams.get("cursor"),
      );
      if (!attendance) {
        await route.fallback();
        return;
      }
      await json(route, 200, { ...person, attendanceHistory: attendance });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/bff/api/host/notifications/manual/preview**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const request = route.request();
    let postData = request.postData();
    if (postData == null) {
      try {
        const parsed = request.postDataJSON();
        postData = parsed == null ? null : JSON.stringify(parsed);
      } catch {
        postData = null;
      }
    }
    const record = requestAudit.observe({
      method: request.method(),
      url: request.url(),
      postData,
    });
    if (record.classification !== "preview") {
      await route.fulfill({
        status: 599,
        contentType: "application/json",
        body: JSON.stringify({
          error: record.classification,
          path: record.path,
          effectKind: record.effectKind ?? null,
        }),
      });
      return;
    }
    await json(route, 200, approvedScheduleReviewPreview);
  });

  await page.route("**/api/bff/__internal/client-contract-status**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        schemaVersion: 1,
        supportedHostClientContracts: ["v2", "v3"],
      }),
    });
  });

  const liveMutation = options?.liveMutation ?? "none";
  if (liveMutation !== "none") {
    await page.route(`**/api/bff/api/host/sessions/${HOST_APPROVED_SESSION_ID}/attendance**`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      if (liveMutation === "conflict") {
        conflictRefetchAbsentsSky = true;
        await new Promise((resolve) => setTimeout(resolve, 150));
        await json(route, 409, {
          code: "REVISION_CONFLICT",
          message: "출석 상태가 바뀌었습니다.",
          status: 409,
        });
        return;
      }
      await route.abort("failed");
    });
    if (liveMutation === "unknown") {
      await page.route("**/api/bff/api/host/mutations/**", async (route) => {
        if (route.request().method() !== "GET") {
          await route.fallback();
          return;
        }
        await json(route, 200, {
          status: "PENDING",
          receipt: null,
          current: null,
          attendanceVersions: null,
          attendanceSnapshotId: null,
        });
      });
    }
  }
}
