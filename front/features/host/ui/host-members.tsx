import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentSessionPolicy,
  HostMemberProfileErrorCode,
  HostMemberProfileResponse,
  HostMemberListPage,
  HostMemberListItem,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  ViewerMember,
} from "@/features/host/model/host-view-types";
import {
  hostMemberKeys,
  hostMemberListQuery,
} from "@/features/host/queries/host-members-queries";
import type { PageRequest } from "@/shared/model/paging";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { LifecyclePolicyDialog } from "./members/member-approval-actions";
import { actionKey, disabledProfileReason, isMembershipPending } from "./members/member-action-rules";
import { MemberActionButton } from "./members/member-list";
import { HostMemberProfileDialog } from "./members/member-profile-editor";
import { hostProfileErrorMessage, profileFailureMessage } from "./members/member-profile-errors";
import { MemberStatusFilter } from "./members/member-status-filter";
import { MemberSummary } from "./members/member-summary";
import { MemberTabPanel } from "./members/member-tab-panel";
import type {
  HostMemberLifecyclePath,
  HostMembersLinkComponent,
  HostMembersLinkProps,
  HostViewerAction,
  LifecycleDialog,
  MemberTab,
  ProfileDialog,
} from "./members/types";
export type { HostMembersLinkComponent } from "./members/types";

type JsonResponse<T> = Response & { json(): Promise<T> };

type HostMembersActions = {
  loadMembers: (page?: PageRequest) => Promise<HostMemberListPage>;
  submitLifecycle: (
    membershipId: string,
    path: HostMemberLifecyclePath,
    body?: MemberLifecycleRequest,
  ) => Promise<JsonResponse<MemberLifecycleResponse>>;
  submitProfile: (membershipId: string, displayName: string) => Promise<JsonResponse<HostMemberProfileResponse>>;
  submitViewerAction: (membershipId: string, action: HostViewerAction) => Promise<ViewerMember>;
};

type HostMembersProps = {
  initialMembers: HostMemberListPage | HostMemberListItem[];
  actions: HostMembersActions;
  LinkComponent?: HostMembersLinkComponent;
};

function RouterScopedDefaultLink({ to, children, ...props }: HostMembersLinkProps) {
  const location = useLocation();

  return (
    <a {...props} href={scopedAppLinkTarget(location.pathname, to)}>
      {children}
    </a>
  );
}

function DefaultLinkComponent(props: HostMembersLinkProps) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <RouterScopedDefaultLink {...props} />;
  }

  const { to, children, ...anchorProps } = props;

  return (
    <a {...anchorProps} href={scopedAppLinkTarget(globalThis.location.pathname, to)}>
      {children}
    </a>
  );
}

type MemberRowsState = {
  source: HostMemberListItem[];
  members: HostMemberListItem[];
};
type MemberRowsUpdate = HostMemberListItem[] | ((current: HostMemberListItem[]) => HostMemberListItem[]);
type ViewerAction = HostViewerAction;


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function hostProfileErrorCodeFromResponse(response: Response): Promise<HostMemberProfileErrorCode | null> {
  try {
    const body: unknown = await response.json();
    const code = isRecord(body) ? body.code : null;

    return typeof code === "string" ? (code as HostMemberProfileErrorCode) : null;
  } catch {
    return null;
  }
}

export default function HostMembers({ initialMembers, actions, LinkComponent = DefaultLinkComponent }: HostMembersProps) {
  const propPage = normalizeMemberPage(initialMembers);
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    ...hostMemberListQuery({ limit: 50 }),
    queryFn: async () => normalizeMemberPage(await actions.loadMembers({ limit: 50 })),
    initialData: propPage,
  });
  // Track the prop and query page identities we have already consumed. When
  // either changes identity we move the source-of-truth forward.
  const queryPage = listQuery.data ?? propPage;
  const [seen, setSeen] = useState<{ prop: HostMemberListItem[]; query: HostMemberListItem[]; active: HostMemberListPage }>(() => ({
    prop: propPage.items,
    query: queryPage.items,
    active: queryPage,
  }));
  let nextSeen = seen;
  if (propPage.items !== seen.prop) {
    nextSeen = { prop: propPage.items, query: queryPage.items, active: propPage };
  } else if (queryPage.items !== seen.query) {
    nextSeen = { prop: propPage.items, query: queryPage.items, active: queryPage };
  }
  if (nextSeen !== seen) {
    setSeen(nextSeen);
  }
  const initialPage = nextSeen.active;
  const [memberRowsState, setMemberRowsState] = useState<MemberRowsState>(() => ({
    source: initialPage.items,
    members: initialPage.items,
  }));
  const initialMembersItems = initialPage.items;
  const members = memberRowsState.source === initialMembersItems ? memberRowsState.members : initialMembersItems;
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<MemberTab>("active");
  const [dialog, setDialog] = useState<LifecycleDialog>(null);
  const [profileDialog, setProfileDialog] = useState<ProfileDialog>(null);
  const [dialogPolicy, setDialogPolicy] = useState<CurrentSessionPolicy>("APPLY_NOW");
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  const setMembers = (update: MemberRowsUpdate) => {
    setMemberRowsState((current) => {
      const source = current.source === initialMembersItems ? current.source : initialMembersItems;
      const currentMembers = current.source === initialMembersItems ? current.members : initialMembersItems;
      const nextMembers = typeof update === "function" ? update(currentMembers) : update;

      return { source, members: nextMembers };
    });
  };

  const activeMembers = useMemo(() => members.filter((member) => member.status === "ACTIVE"), [members]);
  const suspendedMembers = useMemo(() => members.filter((member) => member.status === "SUSPENDED"), [members]);
  const inactiveMembers = useMemo(
    () => members.filter((member) => member.status === "LEFT" || member.status === "INACTIVE"),
    [members],
  );
  const viewerMembers = useMemo(() => members.filter((member) => member.status === "VIEWER"), [members]);
  const currentSessionParticipants = useMemo(
    () => activeMembers.filter((member) => member.currentSessionParticipationStatus === "ACTIVE"),
    [activeMembers],
  );
  const activeMembersOutsideCurrentSession = useMemo(
    () => activeMembers.filter((member) => member.currentSessionParticipationStatus !== "ACTIVE"),
    [activeMembers],
  );

  const openDialog = (nextDialog: Exclude<LifecycleDialog, null>, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setMessage(null);
    setDialogPolicy("APPLY_NOW");
    setDialog(nextDialog);
  };

  const openProfileDialog = (member: HostMemberListItem, trigger: HTMLElement) => {
    if (isMembershipPending(member.membershipId, pendingActionsRef.current)) {
      return;
    }

    dialogTriggerRef.current = trigger;
    setMessage(null);
    setProfileDialog({ member });
  };

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

  const refreshMembers = async () => {
    await queryClient.invalidateQueries(
      { queryKey: hostMemberKeys.all },
      { throwOnError: true },
    );
  };

  const loadMoreMembers = async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setMessage(null);
    try {
      const page = normalizeMemberPage(await actions.loadMembers({ limit: 50, cursor: nextCursor }));
      setMembers((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
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
      const response = await actions.submitLifecycle(member.membershipId, path, body);
      if (!response.ok) {
        throw new Error("Member lifecycle update failed");
      }

      const result = (await response.json()) as MemberLifecycleResponse;
      setMembers((current) =>
        current.map((item) => (item.membershipId === result.member.membershipId ? result.member : item)),
      );
      setMessage({ kind: "status", text: "멤버 상태를 업데이트했습니다." });
    } catch {
      setMessage({ kind: "alert", text: "멤버 상태 업데이트에 실패했습니다. 멤버 상태를 확인한 뒤 다시 시도해 주세요." });
    } finally {
      setActionPending(key, false);
    }
  }

  const submitViewerAction = async (member: HostMemberListItem, action: ViewerAction) => {
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

      setMembers((current) => current.filter((item) => item.membershipId !== member.membershipId));
      setMessage({ kind: "status", text: successMessage });

      try {
        await refreshMembers();
      } catch {
        setMessage({ kind: "alert", text: "처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다. 새로고침해서 최신 상태를 확인해 주세요." });
      }
    } catch {
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
      const response = await actions.submitProfile(member.membershipId, displayName);
      if (!response.ok) {
        throw new Error(hostProfileErrorMessage(response.status, await hostProfileErrorCodeFromResponse(response)));
      }

      const updatedMember = (await response.json()) as HostMemberProfileResponse;
      setMembers((current) =>
        current.map((item) => (item.membershipId === updatedMember.membershipId ? updatedMember : item)),
      );
      setMessage({ kind: "status", text: "이름을 저장했습니다." });
    } catch (error) {
      throw new Error(profileFailureMessage(error));
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

  const renderProfileAction = (member: HostMemberListItem) => {
    const rowPending = isMembershipPending(member.membershipId, pendingActions);
    const profileReason = disabledProfileReason(rowPending);

    return (
      <MemberActionButton
        action="profile"
        member={member}
        label="이름 변경"
        disabled={rowPending}
        reason={profileReason}
        onClick={(event) => openProfileDialog(member, event.currentTarget)}
      />
    );
  };

  return (
    <div className="stack" style={{ "--stack": "18px" } as CSSProperties}>
      <MemberSummary
        viewerCount={viewerMembers.length}
        activeCount={activeMembers.length}
        currentSessionParticipantCount={currentSessionParticipants.length}
        activeOutsideCurrentSessionCount={activeMembersOutsideCurrentSession.length}
        suspendedCount={suspendedMembers.length}
      />

      <MemberStatusFilter activeTab={activeTab} onTabChange={setActiveTab} />

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
        activeTab={activeTab}
        activeMembers={activeMembers}
        viewerMembers={viewerMembers}
        suspendedMembers={suspendedMembers}
        inactiveMembers={inactiveMembers}
        pendingActions={pendingActions}
        nextCursor={nextCursor}
        isLoadingMore={isLoadingMore}
        LinkComponent={LinkComponent}
        renderProfileAction={renderProfileAction}
        onOpenDialog={openDialog}
        onSubmitLifecycle={submitLifecycle}
        onSubmitViewerAction={submitViewerAction}
        onLoadMore={loadMoreMembers}
      />

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
  );
}

function normalizeMemberPage(value: HostMemberListPage | HostMemberListItem[]): HostMemberListPage {
  return Array.isArray(value) ? { items: value, nextCursor: null } : value;
}
