import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import {
  disabledRestoreReason,
  isMembershipPending,
} from "./member-action-rules";
import {
  MemberActionButton,
  MemberList,
  type MemberLedgerFacts,
} from "./member-list";
import type { HostPeopleStatusFilter } from "./host-people-page";
import type { HostMemberLifecyclePath, HostMembersLinkComponent } from "./types";

const PANEL_LABEL: Record<HostPeopleStatusFilter, string> = {
  all: "전체",
  active: "활동",
  viewer: "둘러보기",
  suspended: "쉬는 중",
};

function membersForFilter(
  statusFilter: HostPeopleStatusFilter,
  activeMembers: HostMemberListItem[],
  viewerMembers: HostMemberListItem[],
  suspendedMembers: HostMemberListItem[],
  inactiveMembers: HostMemberListItem[],
): HostMemberListItem[] {
  if (statusFilter === "active") {
    return activeMembers;
  }
  if (statusFilter === "viewer") {
    return viewerMembers;
  }
  if (statusFilter === "suspended") {
    return suspendedMembers;
  }
  return [...activeMembers, ...suspendedMembers, ...inactiveMembers];
}

export function MemberTabPanel({
  statusFilter,
  activeMembers,
  viewerMembers,
  suspendedMembers,
  inactiveMembers,
  pendingActions,
  nextCursor,
  isLoadingMore,
  onSubmitLifecycle,
  onLoadMore,
  personHref,
  LinkComponent,
  factsByMembershipId,
}: {
  statusFilter: HostPeopleStatusFilter;
  activeMembers: HostMemberListItem[];
  viewerMembers: HostMemberListItem[];
  suspendedMembers: HostMemberListItem[];
  inactiveMembers: HostMemberListItem[];
  pendingActions: Set<string>;
  nextCursor: string | null;
  isLoadingMore: boolean;
  onSubmitLifecycle: (member: HostMemberListItem, path: HostMemberLifecyclePath) => Promise<void>;
  onLoadMore: () => Promise<void>;
  personHref: (membershipId: string) => string;
  LinkComponent?: HostMembersLinkComponent;
  factsByMembershipId?: Readonly<Record<string, MemberLedgerFacts>>;
}) {
  const members = membersForFilter(
    statusFilter,
    activeMembers,
    viewerMembers,
    suspendedMembers,
    inactiveMembers,
  );
  const emptyText =
    statusFilter === "viewer"
      ? "둘러보기 멤버가 없습니다."
      : statusFilter === "suspended"
        ? "쉬는 멤버가 없습니다."
        : statusFilter === "active"
          ? "활성 멤버가 없습니다."
          : "멤버가 없습니다.";

  return (
    <section
      id={`host-members-panel-${statusFilter}`}
      role="tabpanel"
      aria-label={PANEL_LABEL[statusFilter]}
    >
      <MemberList
        members={members}
        emptyText={emptyText}
        sectionDescription="멤버 원장"
        factsByMembershipId={factsByMembershipId}
        personHref={personHref}
        LinkComponent={LinkComponent}
        renderActions={(member) => {
          if (member.status !== "SUSPENDED") {
            return null;
          }
          const rowPending = isMembershipPending(member.membershipId, pendingActions);
          const restoreReason = disabledRestoreReason(member, rowPending);
          return (
            <MemberActionButton
              action="restore"
              member={member}
              label="복구"
              tone="primary"
              disabled={!member.canRestore || rowPending}
              reason={restoreReason}
              onClick={() => void onSubmitLifecycle(member, "/restore")}
            />
          );
        }}
      />

      {nextCursor ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={isLoadingMore}
          onClick={() => void onLoadMore()}
        >
          {isLoadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
    </section>
  );
}
