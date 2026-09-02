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
import { MemberPendingZone } from "./members/member-pending-zone";
import { ManualNotificationPreviewConfirmation } from "./notifications/manual-notification-preview";
import { HostPersonDetail } from "./person/host-person-detail";
import { HostScheduleReviewHeader } from "./schedule-review/host-schedule-review-header";
import { HostClubSettings } from "./settings/host-club-settings";
import {
  HostInvitationLinks,
  type HostInvitationCreateDraft,
} from "./settings/host-invitation-links";
import { HostSettingsPage } from "./settings/host-settings-page";
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
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "COMPLETE",
    needsAttention: false,
    hasDraft: false,
    liveRevision: 4,
    draftRevision: null,
    lastModifiedAt: "2026-07-30T10:00:00+09:00",
  },
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

const person: HostPersonDetailView = {
  membershipId: "membership-park",
  displayName: "박서윤",
  avatarKey: "banana-green-book",
  status: "ACTIVE",
  role: "MEMBER",
  lastClubAccessAt: "2026-08-29T10:00:00+09:00",
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
  { id: "membership-park", name: "박서윤", state: "변경 전 확인" },
  { id: "membership-lee", name: "이도현", state: "미열람" },
  { id: "membership-kang", name: "강유진", state: "미열람" },
  { id: "membership-moon", name: "문재희", state: "미열람" },
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
          onReview={noop}
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
    <main className="rm-host-editorial-ledger rm-host-editorial-ledger--context">
      <section className="page-header-compact">
        <div className="container rm-host-editorial-ledger__context">
          <h1 className="h1 editorial rm-host-editorial-ledger__heading">기록</h1>
          <p className="small rm-host-editorial-ledger__lede">
            모임이 끝난 뒤 남겨야 할 기록과 게시 이력을 관리하세요.
          </p>
        </div>
      </section>
      <section className="container rm-host-editorial-ledger__body">
        <HostSessionLedger
          items={recordItems}
          summary={{ needsAttentionCount: 2, incompletePublishedCount: 1, draftCount: 1 }}
          filters={{ view: "active", search: "", state: null, recordStatus: null, needsAttention: null }}
          nextCursor={null}
          loadingMore={false}
          onFiltersChange={noop}
          onLoadMore={noop}
          recordReturnHref="/clubs/reading-sai/app/host/records"
        />
      </section>
    </main>,
  );
}

export function hostSettingsApprovedView() {
  return hostApprovedShell(
    "settings",
    <HostSettingsPage>
      <div className="rm-host-editorial-ledger--split">
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
        />
        <HostClubSettings
          settings={clubSettings}
          draft={clubSettings}
          saving={false}
          stale={false}
          error={null}
          onDraftChange={noop}
          onSave={noop}
        />
      </div>
    </HostSettingsPage>,
  );
}

export function hostScheduleReviewApprovedView() {
  return hostApprovedShell(
    "schedule-review",
    <main className="rm-schedule-review">
      <HostScheduleReviewHeader
        returnHref="/clubs/reading-sai/app/host"
        sessionNumber={28}
        bookTitle="지구 끝의 온실"
        scheduleRevision={4}
        unreadMemberCount={4}
      />
      <div className="rm-schedule-review__layout">
        <section className="rm-schedule-review__recipients" aria-labelledby="schedule-review-recipients-title">
          <div className="rm-schedule-review__section-heading">
            <h2 id="schedule-review-recipients-title">안내 대상 4명</h2>
            <span>미열람 4명</span>
          </div>
          <p>현재 일정 확인 8명은 자동으로 제외했어요. 미리보기 뒤에만 보냅니다.</p>
          <ul>
            {scheduleReviewMembers.map((member) => (
              <li key={member.id} data-state={member.state === "미열람" ? "UNSEEN" : "STALE"}>
                <label>
                  <input type="checkbox" defaultChecked readOnly />
                  <span><strong>{member.name}</strong><small>{member.state}</small></span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section className="rm-schedule-review__composer" aria-labelledby="schedule-review-composer-title">
          <h2 id="schedule-review-composer-title">보낼 안내</h2>
          <p>대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.</p>
          <label>
            <span>알림 제목</span>
            <input aria-label="알림 제목" readOnly value={scheduleReviewPreview.template.subject} />
          </label>
          <label>
            <span>알림 본문</span>
            <textarea aria-label="알림 본문" readOnly rows={6} value={scheduleReviewPreview.template.bodyPreview} />
          </label>
          <button type="button" className="rm-schedule-review__preview">알림 미리보기</button>
          <ManualNotificationPreviewConfirmation
            preview={scheduleReviewPreview}
            busy={false}
            presentation="side-sheet"
            onConfirm={async () => undefined}
          />
        </section>
      </div>
    </main>,
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
      now={new Date("2026-08-30T10:00:00+09:00")}
    />,
  );
}
