import type { ReactNode } from "react";
import {
  approvedClubSettings,
  approvedInvitationLinks,
  approvedMeetingSections,
  approvedPeopleLedgerFacts,
  approvedPeopleMembers,
  approvedPeopleNow,
  approvedPeoplePendingMembers,
  approvedPerson,
  approvedPersonJoinedAt,
  approvedPersonNow,
  approvedRecordFacts,
  approvedRecordItems,
  approvedRecordLedgerSummary,
  approvedRecordWorkItems,
  approvedScheduleReviewMembers,
  approvedScheduleReviewPreview,
} from "./approved-host-ledgers.data";
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

function peoplePersonHref(membershipId: string) {
  return `/clubs/reading-sai/app/host/people/${membershipId}`;
}

function hostApprovedShell(destination: HostApprovedDestination, children: ReactNode) {
  return <HostApprovedShell destination={destination}>{children}</HostApprovedShell>;
}

const meetingSections = approvedMeetingSections;
const peopleNow = approvedPeopleNow;
const peopleMembers = approvedPeopleMembers;
const peoplePendingMembers = approvedPeoplePendingMembers;
const peopleLedgerFacts = approvedPeopleLedgerFacts;
const recordItems = approvedRecordItems;
const recordFacts = approvedRecordFacts;
const recordWorkItems = approvedRecordWorkItems;
const invitationLinks = approvedInvitationLinks;
const clubSettings = approvedClubSettings;
const personNow = approvedPersonNow;
const personJoinedAt = approvedPersonJoinedAt;
const person = approvedPerson;
const scheduleReviewMembers = approvedScheduleReviewMembers;
const scheduleReviewPreview = approvedScheduleReviewPreview;


const invitationCreateDraft: HostInvitationCreateDraft = {
  name: "",
  maxUses: "20",
  expiresAt: "2026-09-30",
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
          personHref={peoplePersonHref}
          now={peopleNow}
        />
      )}
    >
      <MemberList
        members={peopleMembers}
        emptyText="활성 멤버가 없습니다."
        sectionDescription="멤버 원장"
        sectionMeta="현재 일정 기준 · 오늘 14:20"
        personHref={peoplePersonHref}
        factsByMembershipId={peopleLedgerFacts}
        now={peopleNow}
        renderProfileAction={() => null}
        renderActions={() => null}
      />
    </HostPeoplePage>,
  );
}

export function hostRecordsApprovedView() {
  return hostApprovedShell(
    "records",
    <HostSessionLedger
      items={recordItems}
      summary={approvedRecordLedgerSummary}
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
