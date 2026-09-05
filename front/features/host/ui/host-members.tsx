import { type CSSProperties, useMemo, useRef, useState } from "react";
import type {
  CurrentSessionPolicy,
  HostMemberListPage,
  HostMemberListItem,
  MemberLifecycleRequest,
} from "@/features/host/model/host-view-types";
import {
  HostMemberProfileActionError,
  type HostMembersActions,
} from "@/features/host/model/host-member-actions";
import { isTransitionOwnerObsoleteError } from "@/shared/ui/use-transition-safety-owner";
import { LifecyclePolicyDialog } from "./members/member-approval-actions";
import { actionKey, isMembershipPending } from "./members/member-action-rules";
import { HostMemberProfileDialog } from "./members/member-profile-editor";
import { hostProfileErrorMessage, profileFailureMessage } from "./members/member-profile-errors";
import { HostPeoplePage, type HostPeopleScheduleSeenCounts, type HostPeopleStatusFilter } from "./members/host-people-page";
import { MemberPendingZone } from "./members/member-pending-zone";
import { MemberTabPanel } from "./members/member-tab-panel";
import { aggregateHostPeopleScheduleSeen } from "./members/member-list-helpers";
import type { MemberLedgerFacts } from "./members/member-list";
import type {
  HostMemberLifecyclePath,
  HostMembersLinkComponent,
  HostViewerAction,
  LifecycleDialog,
  ProfileDialog,
} from "./members/types";
export type { HostMembersLinkComponent } from "./members/types";

const DefaultPeopleLink: HostMembersLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

type HostMembersProps = {
  initialMembers: HostMemberListPage | HostMemberListItem[];
  actions: HostMembersActions;
  settingsHref?: string;
  LinkComponent?: HostMembersLinkComponent;
  factsByMembershipId?: Readonly<Record<string, MemberLedgerFacts>>;
  scheduleSeen?: HostPeopleScheduleSeenCounts | null;
  unreadHref?: string;
};

type MemberRowsState = {
  source: HostMemberListItem[];
  members: HostMemberListItem[];
  nextCursor: HostMemberListPage["nextCursor"];
};
type MemberRowsUpdate = HostMemberListItem[] | ((current: HostMemberListItem[]) => HostMemberListItem[]);

export default function HostMembers({
  initialMembers,
  actions,
  settingsHref = "/app/host/settings",
  LinkComponent = DefaultPeopleLink,
  factsByMembershipId,
  scheduleSeen: scheduleSeenProp,
  unreadHref,
}: HostMembersProps) {
  const initialPage = useMemo(() => normalizeMemberPage(initialMembers), [initialMembers]);
  const initialMembersItems = initialPage.items;
  const initialRowsState = (): MemberRowsState => ({
    source: initialMembersItems,
    members: initialMembersItems,
    nextCursor: initialPage.nextCursor,
  });
  const [memberRowsState, setMemberRowsState] = useState<MemberRowsState>(() => ({
    source: initialMembersItems,
    members: initialMembersItems,
    nextCursor: initialPage.nextCursor,
  }));
  const visibleRowsState = memberRowsState.source === initialMembersItems ? memberRowsState : initialRowsState();
  const members = visibleRowsState.members;
  const visibleNextCursor = visibleRowsState.nextCursor;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<HostPeopleStatusFilter>("all");
  const [dialog, setDialog] = useState<LifecycleDialog>(null);
  const [profileDialog, setProfileDialog] = useState<ProfileDialog>(null);
  const [dialogPolicy, setDialogPolicy] = useState<CurrentSessionPolicy>("APPLY_NOW");
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const completedViewerMembershipIdsRef = useRef<Set<string>>(new Set());
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  const setMembers = (update: MemberRowsUpdate) => {
    setMemberRowsState((current) => {
      const activeState = current.source === initialMembersItems ? current : initialRowsState();
      const nextMembers = typeof update === "function" ? update(activeState.members) : update;

      return { ...activeState, members: nextMembers };
    });
  };
  const replaceMembersFromPage = (page: HostMemberListPage | HostMemberListItem[]) => {
    const nextPage = normalizeMemberPage(page);
    const completedViewerMembershipIds = completedViewerMembershipIdsRef.current;

    setMemberRowsState({
      source: initialMembersItems,
      members: nextPage.items.filter(
        (item) => item.status !== "VIEWER" || !completedViewerMembershipIds.has(item.membershipId),
      ),
      nextCursor: nextPage.nextCursor,
    });
  };

  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);
  const suspendedMembers = useMemo(() => members.filter((member) => member.status === "SUSPENDED"), [members]);
  const inactiveMembers = useMemo(
    () => members.filter((member) => member.status === "LEFT" || member.status === "INACTIVE"),
    [members],
  );
  const viewerMembers = useMemo(() => members.filter((member) => member.status === "VIEWER"), [members]);
  const setActionPending = (key: string, isPending: boolean) => {
    const nextPendingActions = new Set(pendingActionsRef.current);
    if (isPending) {
      nextPendingActions.add(key);
    } else {
      nextPendingActions.delete(key);
    }

    pendingActionsRef.current = nextPendingActions;
    setPendingActions(nextPendingActions);
  };

  const closeDialog = () => {
    setDialog(null);
    dialogTriggerRef.current?.focus();
    dialogTriggerRef.current = null;
  };

  const closeProfileDialog = () => {
    setProfileDialog(null);
    dialogTriggerRef.current?.focus();
    dialogTriggerRef.current = null;
  };

  const refreshMembers = () => actions.refreshMembers();

  const loadMoreMembers = async () => {
    if (!visibleNextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setMessage(null);
    try {
      const page = normalizeMemberPage(await actions.loadMembers({ limit: 50, cursor: visibleNextCursor }));
      setMemberRowsState((current) => {
        const activeState = current.source === initialMembersItems ? current : initialRowsState();

        return {
          ...activeState,
          members: [...activeState.members, ...page.items],
          nextCursor: page.nextCursor,
        };
      });
    } catch {
      setMessage({ kind: "alert", text: "멤버 목록을 더 불러오지 못했습니다." });
    } finally {
      setIsLoadingMore(false);
    }
  };

  async function submitLifecycle(member: HostMemberListItem, path: HostMemberLifecyclePath, body?: MemberLifecycleRequest) {
    const key = actionKey(member, path);
    if (isMembershipPending(member.membershipId, pendingActionsRef.current)) {
      return;
    }

    setActionPending(key, true);
    setMessage(null);

    try {
      const result = await actions.submitLifecycle(member.membershipId, path, body);
      setMembers((current) =>
        current.map((item) => (item.membershipId === result.member.membershipId ? result.member : item)),
      );
      setMessage({ kind: "status", text: "멤버 상태를 업데이트했습니다." });
    } catch (error) {
      if (isTransitionOwnerObsoleteError(error)) return;
      setMessage({ kind: "alert", text: "멤버 상태 업데이트에 실패했습니다. 멤버 상태를 확인한 뒤 다시 시도해 주세요." });
    } finally {
      setActionPending(key, false);
    }
  }

  const submitViewerAction = async (member: HostMemberListItem, action: HostViewerAction) => {
    if (isMembershipPending(member.membershipId, pendingActionsRef.current)) {
      return;
    }

    const key = actionKey(member, action);
    setActionPending(key, true);
    setMessage(null);
    const successMessage =
      action === "activate" ? "정식 멤버로 전환했습니다." : "둘러보기 멤버를 해제했습니다.";

    try {
      await actions.submitViewerAction(member.membershipId, action);

      completedViewerMembershipIdsRef.current.add(member.membershipId);
      setMembers((current) => current.filter((item) => item.membershipId !== member.membershipId));
      setMessage({ kind: "status", text: successMessage });

      try {
        replaceMembersFromPage(await refreshMembers());
      } catch {
        setMessage({ kind: "alert", text: "처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다. 새로고침해서 최신 상태를 확인해 주세요." });
      }
    } catch (error) {
      if (isTransitionOwnerObsoleteError(error)) return;
      setMessage({
        kind: "alert",
        text:
          action === "activate"
            ? "정식 멤버 전환에 실패했습니다. 요청 상태를 확인한 뒤 다시 시도해 주세요."
            : "둘러보기 해제에 실패했습니다. 요청 상태를 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setActionPending(key, false);
    }
  };

  const submitProfile = async (member: HostMemberListItem, displayName: string) => {
    if (isMembershipPending(member.membershipId, pendingActionsRef.current)) {
      return;
    }

    const key = actionKey(member, "profile");
    setActionPending(key, true);
    setMessage(null);

    try {
      const updatedMember = await actions.submitProfile(member.membershipId, displayName);
      setMembers((current) =>
        current.map((item) => (item.membershipId === updatedMember.membershipId ? updatedMember : item)),
      );
      setMessage({ kind: "status", text: "이름을 저장했습니다." });
    } catch (error) {
      if (isTransitionOwnerObsoleteError(error)) return;
      const failure = error instanceof HostMemberProfileActionError
        ? new Error(hostProfileErrorMessage(error.status, error.code), { cause: error })
        : error;
      throw new Error(profileFailureMessage(failure), { cause: error });
    } finally {
      setActionPending(key, false);
    }
  };

  const confirmDialog = async () => {
    if (!dialog) {
      return;
    }

    const path = dialog.action === "suspend" ? "/suspend" : "/deactivate";
    await submitLifecycle(dialog.member, path, { currentSessionPolicy: dialogPolicy });
    closeDialog();
  };

  const handleStatusFilterChange = (nextFilter: HostPeopleStatusFilter) => {
    setStatusFilter(nextFilter);
  };

  const personHref = (membershipId: string) => `/app/host/people/${encodeURIComponent(membershipId)}`;
  const scheduleSeen = scheduleSeenProp ?? aggregateHostPeopleScheduleSeen(members, factsByMembershipId);
  const pendingZone = (
    <MemberPendingZone
      viewers={viewerMembers}
      isRowPending={(membershipId) => isMembershipPending(membershipId, pendingActions)}
      onActivate={(membershipId) => {
        const member = viewerMembers.find((item) => item.membershipId === membershipId);
        if (member) {
          void submitViewerAction(member, "activate");
        }
      }}
      onRelease={(membershipId) => {
        const member = viewerMembers.find((item) => item.membershipId === membershipId);
        if (member) {
          void submitViewerAction(member, "deactivate-viewer");
        }
      }}
      personHref={personHref}
      LinkComponent={LinkComponent}
    />
  );

  return (
    <HostPeoplePage
      rosterCounts={{
        all: members.length,
        active: activeMembers.length,
        viewer: viewerMembers.length,
        suspended: suspendedMembers.length,
      }}
      scheduleSeen={scheduleSeen}
      unreadHref={unreadHref}
      pendingZone={pendingZone}
      statusFilter={statusFilter}
      onStatusFilterChange={handleStatusFilterChange}
    >
      <div className="stack" style={{ "--stack": "18px" } as CSSProperties}>
        {message ? (
          <p
            role={message.kind}
            className="small"
            style={{ margin: 0, color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)" }}
          >
            {message.text}
          </p>
        ) : null}

        <MemberTabPanel
          statusFilter={statusFilter}
          activeMembers={activeMembers}
          viewerMembers={viewerMembers}
          suspendedMembers={suspendedMembers}
          inactiveMembers={inactiveMembers}
          pendingActions={pendingActions}
          nextCursor={visibleNextCursor}
          isLoadingMore={isLoadingMore}
          onSubmitLifecycle={submitLifecycle}
          onLoadMore={loadMoreMembers}
          personHref={personHref}
          LinkComponent={LinkComponent}
          factsByMembershipId={factsByMembershipId}
        />

        <LinkComponent to={settingsHref} className="rm-host-people__settings-link">
          초대와 설정 열기 ›
        </LinkComponent>

        {dialog ? (
          <LifecyclePolicyDialog
            dialog={dialog}
            policy={dialogPolicy}
            submitting={pendingActions.has(actionKey(dialog.member, dialog.action === "suspend" ? "/suspend" : "/deactivate"))}
            onPolicyChange={setDialogPolicy}
            onClose={closeDialog}
            onConfirm={() => void confirmDialog()}
          />
        ) : null}

        {profileDialog ? (
          <HostMemberProfileDialog
            member={profileDialog.member}
            submitting={pendingActions.has(actionKey(profileDialog.member, "profile"))}
            onClose={closeProfileDialog}
            onSubmit={(displayName) => submitProfile(profileDialog.member, displayName)}
          />
        ) : null}
      </div>
    </HostPeoplePage>
  );
}

function normalizeMemberPage(value: HostMemberListPage | HostMemberListItem[]): HostMemberListPage {
  return Array.isArray(value) ? { items: value, nextCursor: null } : value;
}
