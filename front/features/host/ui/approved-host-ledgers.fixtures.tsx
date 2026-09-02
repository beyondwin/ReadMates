import type { ReactNode } from "react";
import type { HostMeetingTocSections } from "@/features/host/model/host-meeting-list-model";
import type { HostPersonDetailView } from "@/features/host/model/host-person-detail-model";
import type { HostInvitationLinkView, HostSettingsView } from "@/features/host/model/host-settings-model";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import type { HostMemberListItem, ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";
import { HostApprovedShell, type HostApprovedDestination } from "./approved-host-shell";
import { HostSessionLedger } from "./host-session-ledger";
import { HostMeetingList } from "./meeting-list/host-meeting-list";
import { HostPeoplePage } from "./members/host-people-page";
import { MemberList } from "./members/member-list";
import { formatMembershipTenure } from "./members/member-list-helpers";
import { MemberPendingZone } from "./members/member-pending-zone";
import { HostPersonDetail } from "./person/host-person-detail";
import { HostScheduleReviewPage } from "./schedule-review/host-schedule-review-page";
import { HostClubSettings } from "./settings/host-club-settings";
import {
  HostInvitationLinks,
  type HostInvitationCreateDraft,
} from "./settings/host-invitation-links";
import { HostSettingsColumns, HostSettingsPage } from "./settings/host-settings-page";
import "./host-editorial-ledger.css";
import "./shell/host-shell.css";
import "./workbox/host-workbox.css";

const noop = () => undefined;

function hostApprovedShell(destination: HostApprovedDestination, children: ReactNode) {
  return <HostApprovedShell destination={destination}>{children}</HostApprovedShell>;
}

const meetingSections: HostMeetingTocSections = {
  upcoming: {
    rows: [
      {
        id: "session-28",
        ordinalFolio: "No.28",
        title: "지구 끝의 온실",
        lifecycleLabel: "준비 중",
        attentionLabel: null,
        summary: "일정 확인 8/12 · 응답 9/12",
        date: "2026-09-01",
        dateLabel: "9월 1일 월요일",
        dDayLabel: "D-3",
        actionLabel: "운영실 열기",
        href: "/clubs/reading-sai/app/host/sessions/session-28",
      },
      {
        id: "session-29",
        ordinalFolio: "No.29",
        title: "작별하지 않는다",
        lifecycleLabel: "작성 중",
        attentionLabel: null,
        summary: "장소 확인 필요",
        date: "2026-09-22",
        dateLabel: "9월 22일 월요일",
        actionLabel: "일정 편집",
        href: "/clubs/reading-sai/app/host/sessions/session-29",
      },
      {
        id: "session-30",
        ordinalFolio: "No.30",
        title: "여름은 오래 그곳에 남아",
        lifecycleLabel: "작성 중",
        attentionLabel: null,
        summary: "책만 정해짐",
        date: "2026-10-13",
        dateLabel: "10월 13일 월요일",
        actionLabel: "계속 작성",
        href: "/clubs/reading-sai/app/host/sessions/session-30",
      },
    ],
    nextCursor: null,
  },
  past: {
    rows: [
      {
        id: "session-27",
        ordinalFolio: "No.27",
        title: "맡겨진 소녀",
        lifecycleLabel: "마감 필요",
        attentionLabel: null,
        summary: "기록 초안 있음",
        date: "2026-08-18",
        dateLabel: "8월 18일 화요일",
        actionLabel: "마감실 열기",
        href: "/clubs/reading-sai/app/host/sessions/session-27",
      },
      {
        id: "session-26",
        ordinalFolio: "No.26",
        title: "단 한 사람",
        lifecycleLabel: "게시됨",
        attentionLabel: null,
        summary: "참석 9/12",
        date: "2026-07-28",
        dateLabel: "7월 28일 화요일",
        actionLabel: "기록 보기",
        href: "/clubs/reading-sai/app/host/sessions/session-26",
      },
      {
        id: "session-25",
        ordinalFolio: "No.25",
        title: "아주 희미한 빛으로도",
        lifecycleLabel: "게시됨",
        attentionLabel: null,
        summary: "참석 10/12",
        date: "2026-07-07",
        dateLabel: "7월 7일 화요일",
        actionLabel: "기록 보기",
        href: "/clubs/reading-sai/app/host/sessions/session-25",
      },
    ],
    nextCursor: null,
  },
};

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
    userId: "redacted-fixture",
    email: "hidden@example.test",
    displayName,
    accountName: "redacted-fixture",
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

const peopleNow = new Date("2026-09-02T14:20:00+09:00");

const peopleMembers: HostMemberListItem[] = [
  memberRow("membership-sky", "김하늘", "mushroom-green-book", "ACTIVE", "2025-01-02T00:00:00+09:00", "2026-09-02T09:00:00+09:00"),
  memberRow("membership-park", "박서윤", "peach-green-book", "ACTIVE", "2025-10-02T00:00:00+09:00", "2026-09-01T10:00:00+09:00"),
  memberRow("membership-lee", "이도현", "banana-green-book", "ACTIVE", "2026-01-02T00:00:00+09:00", "2026-08-30T10:00:00+09:00"),
  memberRow("membership-jung", "정수아", "tulip-notebook", "ACTIVE", "2024-08-02T00:00:00+09:00", "2026-09-02T08:00:00+09:00"),
  memberRow("membership-han", "한지우", "candle-green-book", "VIEWER", "2026-08-27T00:00:00+09:00", "2026-09-02T07:00:00+09:00"),
  memberRow("membership-oh", "오민재", "apple-green-book", "SUSPENDED", "2025-07-02T00:00:00+09:00", "2026-08-21T10:00:00+09:00"),
];

const peoplePendingMembers: HostMemberListItem[] = [
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
];

const peopleLedgerFacts = {
  "membership-sky": { scheduleSeenLabel: "현재 일정 확인", rsvpLabel: "참석", lastAccessLabel: "오늘" },
  "membership-park": { scheduleSeenLabel: "변경 전 확인", rsvpLabel: "미응답", lastAccessLabel: "어제" },
  "membership-lee": { scheduleSeenLabel: "미열람", rsvpLabel: "참석", lastAccessLabel: "3일 전" },
  "membership-jung": { scheduleSeenLabel: "현재 일정 확인", rsvpLabel: "불참", lastAccessLabel: "오늘" },
  "membership-han": { scheduleSeenLabel: "일정 대상 아님", rsvpLabel: "—", lastAccessLabel: "오늘" },
  "membership-oh": { scheduleSeenLabel: "일정 대상 아님", rsvpLabel: "—", lastAccessLabel: "12일 전" },
} as const;

const recordItems: HostSessionLedgerItem[] = [
  {
    sessionId: "session-28",
    sessionNumber: 28,
    title: "스물여덟 번째 모임",
    bookTitle: "지구 끝의 온실",
    bookAuthor: "김초엽",
    bookImageUrl: null,
    date: "2026-09-01",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: true,
    liveRevision: 2,
    draftRevision: 3,
    lastModifiedAt: "2026-08-30T10:00:00+09:00",
  },
  {
    sessionId: "session-27",
    sessionNumber: 27,
    title: "스물일곱 번째 모임",
    bookTitle: "맡겨진 소녀",
    bookAuthor: "히가시노 게이고",
    bookImageUrl: null,
    date: "2026-08-18",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "COMPLETE",
    needsAttention: false,
    hasDraft: false,
    liveRevision: 4,
    draftRevision: null,
    lastModifiedAt: "2026-08-20T10:00:00+09:00",
  },
  {
    sessionId: "session-26",
    sessionNumber: 26,
    title: "스물여섯 번째 모임",
    bookTitle: "단 한 사람",
    bookAuthor: "최진영",
    bookImageUrl: null,
    date: "2026-07-28",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    state: "PUBLISHED",
    visibility: "MEMBER",
    recordStatus: "COMPLETE",
    needsAttention: false,
    hasDraft: false,
    liveRevision: 4,
    draftRevision: null,
    lastModifiedAt: "2026-07-30T10:00:00+09:00",
  },
  {
    sessionId: "session-25",
    sessionNumber: 25,
    title: "스물다섯 번째 모임",
    bookTitle: "아주 희미한 빛으로도",
    bookAuthor: "최은영",
    bookImageUrl: null,
    date: "2026-07-07",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    state: "PUBLISHED",
    visibility: "MEMBER",
    recordStatus: "COMPLETE",
    needsAttention: false,
    hasDraft: false,
    liveRevision: 3,
    draftRevision: null,
    lastModifiedAt: "2026-07-09T10:00:00+09:00",
  },
  {
    sessionId: "session-24",
    sessionNumber: 24,
    title: "스물네 번째 모임",
    bookTitle: "이처럼 사소한 것들",
    bookAuthor: "클레어 키건",
    bookImageUrl: null,
    date: "2026-06-16",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "을지로 북살롱",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "NOT_STARTED",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: "2026-06-16T21:30:00+09:00",
  },
];

const recordFacts = {
  "session-28": {
    attendanceLabel: "확정 9명",
    reflectionLabel: "8/12",
    draftLabel: "작성 중",
    feedbackLabel: "확인 필요",
    publicationLabel: "대기",
    actionLabel: "마감실 열기",
    dateLabel: "9월 1일",
  },
  "session-27": {
    attendanceLabel: "확정 10명",
    reflectionLabel: "10/12",
    draftLabel: "완료",
    feedbackLabel: "등록됨",
    publicationLabel: "게시 준비",
    actionLabel: "게시 검토",
    dateLabel: "8월 18일",
  },
  "session-26": {
    attendanceLabel: "확정 9명",
    reflectionLabel: "9/12",
    draftLabel: "완료",
    feedbackLabel: "등록됨",
    publicationLabel: "게시됨",
    actionLabel: "기록 보기",
    dateLabel: "7월 28일",
  },
  "session-25": {
    attendanceLabel: "확정 10명",
    reflectionLabel: "10/12",
    draftLabel: "완료",
    feedbackLabel: "없음",
    publicationLabel: "게시됨",
    actionLabel: "기록 보기",
    dateLabel: "7월 7일",
  },
  "session-24": {
    attendanceLabel: "확정 8명",
    reflectionLabel: "7/12",
    draftLabel: "초안 없음",
    feedbackLabel: "미등록",
    publicationLabel: "마감 필요",
    actionLabel: "마감 시작",
    dateLabel: "6월 16일",
  },
} as const;

const recordWorkItems = [
  { title: "피드백 문서 확인", meta: "1개 · 오늘", href: "/clubs/reading-sai/app/host/sessions/session-28" },
  { title: "지난 기록 게시 검토", meta: "1건 · 이번 주", href: "/clubs/reading-sai/app/host/sessions/session-27" },
  { title: "소감 수집 보류", meta: "4명 · 내일", href: "/clubs/reading-sai/app/host/sessions/session-24" },
];

const invitationLinks: HostInvitationLinkView[] = [
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
];

const clubSettings: HostSettingsView = {
  clubId: "club-reading-sai",
  clubSlug: "reading-sai",
  name: "읽는사이",
  approvalPolicy: "HOST_APPROVAL",
  defaultTimezone: "Asia/Seoul",
  scheduleReminderEnabled: true,
  recordPublicationDefault: "MEMBER",
  revision: 4,
  status: "ACTIVE",
};

const invitationCreateDraft: HostInvitationCreateDraft = {
  name: "",
  maxUses: "20",
  expiresAt: "2026-09-30",
};

const personNow = new Date("2026-09-02T14:20:00+09:00");
const personJoinedAt = "2025-10-02T00:00:00+09:00";

const person: HostPersonDetailView = {
  membershipId: "membership-park",
  displayName: "박서윤",
  avatarKey: "apple-green-book",
  status: "ACTIVE",
  role: "MEMBER",
  lastClubAccessAt: "2026-09-01T10:00:00+09:00",
  currentSchedule: {
    state: "OPEN",
    scheduleRevision: 4,
    scheduledAt: "2026-09-01T19:30:00",
  },
  currentRsvp: "NO_RESPONSE",
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

const scheduleReviewMembers = [
  { membershipId: "membership-park", displayName: "박서윤", avatarKey: "peach-green-book", scheduleSeenState: "STALE" },
  { membershipId: "membership-lee", displayName: "이도현", avatarKey: "banana-green-book", scheduleSeenState: "UNSEEN" },
  { membershipId: "membership-kang", displayName: "강유진", avatarKey: "tulip-notebook", scheduleSeenState: "UNSEEN" },
  { membershipId: "membership-moon", displayName: "문재희", avatarKey: "candle-green-book", scheduleSeenState: "UNSEEN" },
] as const;

const scheduleReviewPreview: ManualNotificationPreviewResponse = {
  previewId: "preview-schedule-28",
  expiresAt: "2026-09-02T12:00:00Z",
  scheduleRevision: 4,
  targetSnapshotHash: "b".repeat(64),
  contentHash: "c".repeat(64),
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "일정 변경 알림",
    subject: "모임 시간이 오후 7:30으로 바뀌었어요",
    bodyPreview: "이번 모임 시작 시간이 오후 7:30으로 변경되었습니다. 최신 일정을 확인해 주세요.",
  },
  audience: {
    baseGroup: "SELECTED_MEMBERS",
    baseCount: 4,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 4,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 4,
    emailEligibleCount: 4,
    emailSkippedByPreferenceCount: 0,
    emailMissingCount: 0,
  },
  duplicates: { requiresResendConfirmation: false, recentDispatches: [] },
  warnings: [],
};

export function hostMeetingsApprovedView() {
  return hostApprovedShell(
    "meetings",
    <HostMeetingList
      sections={meetingSections}
      onLoadMoreUpcoming={noop}
      onLoadMorePast={noop}
      loadingMoreUpcoming={false}
      loadingMorePast={false}
      trashHref="/clubs/reading-sai/app/host/sessions?view=trash"
      newMeetingHref="/clubs/reading-sai/app/host/sessions/new"
      now={new Date("2026-09-02T10:00:00+09:00")}
    />,
  );
}

export function hostPeopleApprovedView() {
  const personHref = (membershipId: string) => `/clubs/reading-sai/app/host/people/${membershipId}`;
  const LinkComponent = ({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) => (
    <a {...props} href={to}>{children}</a>
  );

  return hostApprovedShell(
    "people",
    <HostPeoplePage
      scheduleSeen={{ current: 8, stale: 1, unseen: 3, notTarget: 3 }}
      rosterCounts={{ all: 15, active: 12, viewer: 2, suspended: 1 }}
      unreadHref="/clubs/reading-sai/app/host/sessions/session-28/schedule-review"
      pendingZone={(
        <MemberPendingZone
          viewers={peoplePendingMembers}
          isRowPending={() => false}
          onActivate={noop}
          onRelease={noop}
          personHref={personHref}
          LinkComponent={LinkComponent}
          now={peopleNow}
        />
      )}
    >
      <MemberList
        members={peopleMembers}
        emptyText="활성 멤버가 없습니다."
        sectionDescription="멤버 원장"
        sectionMeta="현재 일정 기준 · 오늘 14:20"
        personHref={personHref}
        LinkComponent={LinkComponent}
        factsByMembershipId={peopleLedgerFacts}
        now={peopleNow}
        renderProfileAction={() => null}
        renderActions={(member) => (
          <a className="btn btn-ghost btn-sm" href={personHref(member.membershipId)}>열기</a>
        )}
      />
    </HostPeoplePage>,
  );
}

export function hostRecordsApprovedView() {
  return hostApprovedShell(
    "records",
    <HostSessionLedger
      items={recordItems}
      summary={{ needsAttentionCount: 2, incompletePublishedCount: 1, draftCount: 1 }}
      filters={{ view: "active", search: "", state: null, recordStatus: null, needsAttention: null }}
      nextCursor={null}
      loadingMore={false}
      onFiltersChange={noop}
      onLoadMore={noop}
      recordReturnHref="/clubs/reading-sai/app/host/records"
      factsBySessionId={recordFacts}
      nextAction={{
        sessionId: "session-28",
        label: "지구 끝의 온실 기록 초안을 검토해 주세요",
        meta: "출석 확정 완료 · 소감 8/12 · 피드백 문서 확인 필요",
        href: "/clubs/reading-sai/app/host/sessions/session-28",
        ctaLabel: "마감실 열기",
      }}
      workItems={recordWorkItems}
      statusCounts={{ closing: 2, drafting: 1, published: 18 }}
      workTabCounts={{ now: 2, deferred: 1 }}
    />,
  );
}

export function hostSettingsApprovedView() {
  return hostApprovedShell(
    "settings",
    <HostSettingsPage>
      <HostSettingsColumns
        invitations={(
          <HostInvitationLinks
            links={invitationLinks}
            loading={false}
            error={null}
            busy={false}
            createDraft={invitationCreateDraft}
            editDraft={null}
            sharePath={null}
            message={null}
            alert={null}
            onRetry={noop}
            onRefresh={noop}
            onCreateDraftChange={noop}
            onEditDraftChange={noop}
            onCreate={noop}
            onUpdate={noop}
            onToggle={noop}
            onRetryCommand={noop}
            onCopySharePath={noop}
            now={new Date("2026-09-02T11:04:00+09:00")}
          />
        )}
        clubSettings={(
          <HostClubSettings
            settings={clubSettings}
            draft={clubSettings}
            saving={false}
            stale={false}
            error={null}
            hostCount="1명"
            onDraftChange={noop}
            onSave={noop}
            onCloseReview={noop}
          />
        )}
      />
    </HostSettingsPage>,
  );
}

export function hostScheduleReviewApprovedView() {
  return hostApprovedShell(
    "schedule-review",
    <HostScheduleReviewPage
      returnHref="/clubs/reading-sai/app/host"
      sessionNumber={28}
      bookTitle="지구 끝의 온실"
      scheduleRevision={4}
      unreadMemberCount={4}
      excludedCurrentCount={8}
      recipients={scheduleReviewMembers}
      selectedMembershipIds={scheduleReviewMembers.map((member) => member.membershipId)}
      subject={scheduleReviewPreview.template.subject}
      body={scheduleReviewPreview.template.bodyPreview}
      requestedChannels="BOTH"
      preview={scheduleReviewPreview}
      onSelectedMembershipIdsChange={noop}
      onSubjectChange={noop}
      onBodyChange={noop}
      onRequestedChannelsChange={noop}
      onConfirm={async () => undefined}
    />,
  );
}

export function hostPersonApprovedView() {
  return hostApprovedShell(
    "person-detail",
    <HostPersonDetail
      person={person}
      attendanceItems={person.attendanceHistory.items}
      nextCursor={person.attendanceHistory.nextCursor}
      loadingMore={false}
      loadMoreError={null}
      onLoadMore={noop}
      peopleHref="/clubs/reading-sai/app/host/people"
      now={personNow}
      identity={{
        folioLabel: "FOLIO · 017",
        tenureLabel: formatMembershipTenure(personJoinedAt, personNow),
        joinedLabel: "2025년 10월 가입 · 초대 링크로 참여",
      }}
    />,
  );
}
