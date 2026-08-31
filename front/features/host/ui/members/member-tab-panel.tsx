import type { ReactNode } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import {
  disabledDeactivateReason,
  disabledRestoreReason,
  disabledSuspendReason,
  isMembershipPending,
  memberActionPendingReason,
} from "./member-action-rules";
import {
  CurrentSessionAction,
  MemberActionButton,
  MemberList,
  MemberOverflowMenu,
} from "./member-list";
import { preservedRecordBadge } from "./member-list-helpers";
import type { HostMemberLifecyclePath, HostMembersLinkComponent, LifecycleDialog, MemberTab } from "./types";

export function MemberTabPanel({
  activeTab,
  activeMembers,
  suspendedMembers,
  inactiveMembers,
  pendingActions,
  nextCursor,
  isLoadingMore,
  renderProfileAction,
  onOpenDialog,
  onSubmitLifecycle,
  onLoadMore,
  personHref,
  LinkComponent,
}: {
  activeTab: MemberTab;
  activeMembers: HostMemberListItem[];
  suspendedMembers: HostMemberListItem[];
  inactiveMembers: HostMemberListItem[];
  pendingActions: Set<string>;
  nextCursor: string | null;
  isLoadingMore: boolean;
  renderProfileAction: (member: HostMemberListItem) => ReactNode;
  onOpenDialog: (dialog: Exclude<LifecycleDialog, null>, trigger: HTMLElement) => void;
  onSubmitLifecycle: (member: HostMemberListItem, path: HostMemberLifecyclePath) => Promise<void>;
  onLoadMore: () => Promise<void>;
  personHref: (membershipId: string) => string;
  LinkComponent?: HostMembersLinkComponent;
}) {
  return (
    <section
      id={`host-members-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`host-members-tab-${activeTab}`}
    >
      {activeTab === "active" ? (
        <MemberList
          members={activeMembers}
          emptyText="활성 멤버가 없습니다."
          sectionDescription="정식 멤버입니다. 이번 모임 참여 여부와 정지/탈퇴 처리를 함께 관리합니다."
          renderProfileAction={renderProfileAction}
          personHref={personHref}
          LinkComponent={LinkComponent}
          renderActions={(member) => (
            <CurrentSessionAction member={member} pendingActions={pendingActions} onSubmit={onSubmitLifecycle} />
          )}
          renderOverflow={(member) => {
            const rowPending = isMembershipPending(member.membershipId, pendingActions);
            return (
              <MemberOverflowMenu
                member={member}
                disabled={rowPending}
                reason={rowPending ? memberActionPendingReason : null}
                items={[
                  {
                    key: "suspend",
                    label: "정지",
                    disabled: !member.canSuspend || rowPending,
                    reason: disabledSuspendReason(member, rowPending),
                    onSelect: (trigger) => onOpenDialog({ action: "suspend", member }, trigger),
                  },
                  {
                    key: "deactivate",
                    label: "탈퇴 처리",
                    disabled: !member.canDeactivate || rowPending,
                    reason: disabledDeactivateReason(member, rowPending),
                    onSelect: (trigger) => onOpenDialog({ action: "deactivate", member }, trigger),
                  },
                ]}
              />
            );
          }}
        />
      ) : null}

      {activeTab === "suspended" ? (
        <MemberList
          members={suspendedMembers}
          emptyText="쉬는 멤버가 없습니다."
          sectionDescription="쉬는 멤버는 기록은 보존되지만 새 참석 응답, 질문, 체크인, 리뷰 작성이 제한됩니다."
          renderProfileAction={renderProfileAction}
          personHref={personHref}
          LinkComponent={LinkComponent}
          renderActions={(member) => {
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
          renderOverflow={(member) => {
            const rowPending = isMembershipPending(member.membershipId, pendingActions);
            return (
              <MemberOverflowMenu
                member={member}
                disabled={rowPending}
                reason={rowPending ? memberActionPendingReason : null}
                items={[
                  {
                    key: "deactivate",
                    label: "탈퇴 처리",
                    disabled: !member.canDeactivate || rowPending,
                    reason: disabledDeactivateReason(member, rowPending),
                    onSelect: (trigger) => onOpenDialog({ action: "deactivate", member }, trigger),
                  },
                ]}
              />
            );
          }}
        />
      ) : null}

      {activeTab === "inactive" ? (
        <MemberList
          members={inactiveMembers}
          emptyText="탈퇴 또는 비활성 멤버가 없습니다."
          sectionDescription="탈퇴/비활성 멤버의 과거 기록은 보존되고 새 참여는 열리지 않습니다."
          renderProfileAction={renderProfileAction}
          personHref={personHref}
          LinkComponent={LinkComponent}
          renderCurrentSessionBadge={preservedRecordBadge}
          renderActions={() => null}
        />
      ) : null}

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
