import type { ReactNode } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import {
  disabledDeactivateReason,
  disabledRestoreReason,
  disabledSuspendReason,
  disabledViewerActivationReason,
  disabledViewerDeactivateReason,
  isMembershipPending,
} from "./member-action-rules";
import {
  CurrentSessionAction,
  MemberActionButton,
  MemberList,
} from "./member-list";
import { inactiveMeta, joinedMeta, memberMeta, preservedRecordBadge, requestMeta } from "./member-list-helpers";
import type { HostMemberLifecyclePath, HostMembersLinkComponent, HostViewerAction, LifecycleDialog, MemberTab } from "./types";

export function MemberTabPanel({
  activeTab,
  activeMembers,
  viewerMembers,
  suspendedMembers,
  inactiveMembers,
  pendingActions,
  nextCursor,
  isLoadingMore,
  LinkComponent,
  renderProfileAction,
  onOpenDialog,
  onSubmitLifecycle,
  onSubmitViewerAction,
  onLoadMore,
}: {
  activeTab: MemberTab;
  activeMembers: HostMemberListItem[];
  viewerMembers: HostMemberListItem[];
  suspendedMembers: HostMemberListItem[];
  inactiveMembers: HostMemberListItem[];
  pendingActions: Set<string>;
  nextCursor: string | null;
  isLoadingMore: boolean;
  LinkComponent: HostMembersLinkComponent;
  renderProfileAction: (member: HostMemberListItem) => ReactNode;
  onOpenDialog: (dialog: Exclude<LifecycleDialog, null>, trigger: HTMLElement) => void;
  onSubmitLifecycle: (member: HostMemberListItem, path: HostMemberLifecyclePath) => Promise<void>;
  onSubmitViewerAction: (member: HostMemberListItem, action: HostViewerAction) => Promise<void>;
  onLoadMore: () => Promise<void>;
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
          sectionDescription="정식 멤버입니다. 이번 세션 참여 여부와 정지/탈퇴 처리를 함께 관리합니다."
          renderMeta={memberMeta}
          renderProfileAction={renderProfileAction}
          renderActions={(member) => {
            const rowPending = isMembershipPending(member.membershipId, pendingActions);
            const suspendReason = disabledSuspendReason(member, rowPending);
            const deactivateReason = disabledDeactivateReason(member, rowPending);

            return (
              <>
                <MemberActionButton
                  action="suspend"
                  member={member}
                  label="정지"
                  disabled={!member.canSuspend || rowPending}
                  reason={suspendReason}
                  onClick={(event) => onOpenDialog({ action: "suspend", member }, event.currentTarget)}
                />
                <MemberActionButton
                  action="deactivate"
                  member={member}
                  label="탈퇴 처리"
                  disabled={!member.canDeactivate || rowPending}
                  reason={deactivateReason}
                  onClick={(event) => onOpenDialog({ action: "deactivate", member }, event.currentTarget)}
                />
                <CurrentSessionAction member={member} pendingActions={pendingActions} onSubmit={onSubmitLifecycle} />
              </>
            );
          }}
        />
      ) : null}

      {activeTab === "viewer" ? (
        <MemberList
          members={viewerMembers}
          emptyText="둘러보기 멤버가 없습니다."
          sectionDescription="Google로 들어온 둘러보기 멤버입니다. 정식 멤버로 승인하거나 둘러보기 상태를 해제합니다."
          renderMeta={requestMeta}
          renderProfileAction={renderProfileAction}
          renderActions={(member) => {
            const rowPending = isMembershipPending(member.membershipId, pendingActions);
            const activateReason = disabledViewerActivationReason(rowPending);
            const deactivateReason = disabledViewerDeactivateReason(member, rowPending);

            return (
              <>
                <MemberActionButton
                  action="activate-viewer"
                  member={member}
                  label="정식 멤버로 전환"
                  tone="primary"
                  disabled={rowPending}
                  reason={activateReason}
                  onClick={() => void onSubmitViewerAction(member, "activate")}
                />
                <MemberActionButton
                  action="deactivate-viewer"
                  member={member}
                  label="둘러보기 해제"
                  disabled={!member.canDeactivate || rowPending}
                  reason={deactivateReason}
                  onClick={() => void onSubmitViewerAction(member, "deactivate-viewer")}
                />
              </>
            );
          }}
        />
      ) : null}

      {activeTab === "suspended" ? (
        <MemberList
          members={suspendedMembers}
          emptyText="정지된 멤버가 없습니다."
          sectionDescription="정지된 멤버는 기록은 보존되지만 새 RSVP, 질문, 체크인, 리뷰 작성이 제한됩니다."
          renderMeta={joinedMeta}
          renderProfileAction={renderProfileAction}
          renderActions={(member) => {
            const rowPending = isMembershipPending(member.membershipId, pendingActions);
            const restoreReason = disabledRestoreReason(member, rowPending);
            const deactivateReason = disabledDeactivateReason(member, rowPending);

            return (
              <>
                <MemberActionButton
                  action="restore"
                  member={member}
                  label="복구"
                  tone="primary"
                  disabled={!member.canRestore || rowPending}
                  reason={restoreReason}
                  onClick={() => void onSubmitLifecycle(member, "/restore")}
                />
                <MemberActionButton
                  action="deactivate"
                  member={member}
                  label="탈퇴 처리"
                  disabled={!member.canDeactivate || rowPending}
                  reason={deactivateReason}
                  onClick={(event) => onOpenDialog({ action: "deactivate", member }, event.currentTarget)}
                />
              </>
            );
          }}
        />
      ) : null}

      {activeTab === "inactive" ? (
        <MemberList
          members={inactiveMembers}
          emptyText="탈퇴 또는 비활성 멤버가 없습니다."
          sectionDescription="탈퇴/비활성 멤버의 과거 기록은 보존되고 새 참여는 열리지 않습니다."
          renderMeta={inactiveMeta}
          renderProfileAction={renderProfileAction}
          renderCurrentSessionBadge={preservedRecordBadge}
          renderActions={() => null}
        />
      ) : null}

      {activeTab !== "invitations" && nextCursor ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={isLoadingMore}
          onClick={() => void onLoadMore()}
        >
          {isLoadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}

      {activeTab === "invitations" ? (
        <div className="surface" style={{ padding: 24 }}>
          <div className="row-between" style={{ gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                초대
              </div>
              <h2 className="h3 editorial" style={{ margin: 0 }}>
                초대 링크 관리
              </h2>
              <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
                새 멤버 초대와 링크 상태는 초대 화면에서 관리합니다.
              </p>
            </div>
            <LinkComponent to="/app/host/invitations" className="btn btn-primary">
              초대 관리
            </LinkComponent>
          </div>
        </div>
      ) : null}
    </section>
  );
}
