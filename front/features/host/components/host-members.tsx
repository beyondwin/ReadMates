import { Link } from "@/src/app/router-link";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CurrentSessionPolicy,
  HostMemberProfileErrorCode,
  HostMemberProfileResponse,
  HostMemberListItem,
  MembershipStatus,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  SessionParticipationStatus,
  ViewerMember,
} from "@/features/host/api/host-contracts";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

type HostMemberLifecyclePath = "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove";
type HostViewerAction = "activate" | "deactivate-viewer";

type JsonResponse<T> = Response & { json(): Promise<T> };

export type HostMembersActions = {
  loadMembers: () => Promise<HostMemberListItem[]>;
  submitLifecycle: (
    membershipId: string,
    path: HostMemberLifecyclePath,
    body?: MemberLifecycleRequest,
  ) => Promise<JsonResponse<MemberLifecycleResponse>>;
  submitProfile: (membershipId: string, displayName: string) => Promise<JsonResponse<HostMemberProfileResponse>>;
  submitViewerAction: (membershipId: string, action: HostViewerAction) => Promise<ViewerMember>;
};

type HostMembersProps = {
  initialMembers: HostMemberListItem[];
  actions: HostMembersActions;
};

type MemberRowsState = {
  source: HostMemberListItem[];
  members: HostMemberListItem[];
};
type MemberRowsUpdate = HostMemberListItem[] | ((current: HostMemberListItem[]) => HostMemberListItem[]);
type MemberTab = "active" | "viewer" | "suspended" | "inactive" | "invitations";
type LifecycleDialog = null | { action: "suspend" | "deactivate"; member: HostMemberListItem };
type ProfileDialog = null | { member: HostMemberListItem };
type ViewerAction = HostViewerAction;

const tabs: Array<{ key: MemberTab; label: string }> = [
  { key: "active", label: "활성 멤버" },
  { key: "viewer", label: "둘러보기 멤버" },
  { key: "suspended", label: "정지됨" },
  { key: "inactive", label: "탈퇴/비활성" },
  { key: "invitations", label: "초대" },
];

const statusLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기 멤버",
  ACTIVE: "정식 멤버",
  SUSPENDED: "정지됨",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

const currentSessionLabels: Record<SessionParticipationStatus, string> = {
  ACTIVE: "이번 세션 참여 중",
  REMOVED: "이번 세션 제외됨",
};

const memberActionPendingReason = "멤버 상태 업데이트를 처리하는 중입니다.";
const hostProfileNotEditableMessage = "수정할 수 없는 멤버입니다.";
const hostProfileUnknownErrorMessage = "이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
const hostProfileFailureMessages = new Set([
  "이름을 입력해 주세요.",
  "이름은 20자 이하로 입력해 주세요.",
  "이름으로 쓸 수 없는 형식입니다.",
  "시스템에서 쓰는 이름은 사용할 수 없습니다.",
  "같은 클럽에서 이미 쓰고 있는 이름입니다.",
  hostProfileNotEditableMessage,
  hostProfileUnknownErrorMessage,
]);

const statusBadgeLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기",
  ACTIVE: "활성",
  SUSPENDED: "정지",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

function memberMeta(member: HostMemberListItem) {
  const sessionLabel = member.currentSessionParticipationStatus
    ? currentSessionLabels[member.currentSessionParticipationStatus]
    : "이번 세션 없음";
  return `${member.email} · ${statusLabels[member.status]} · ${sessionLabel}`;
}

function requestMeta(member: HostMemberListItem) {
  return `${member.email} · ${statusLabels[member.status]} · 요청일 ${formatDateOnlyLabel(member.createdAt)}`;
}

function joinedMeta(member: HostMemberListItem) {
  const joined = member.joinedAt ? `참여 ${formatDateOnlyLabel(member.joinedAt)}` : `요청 ${formatDateOnlyLabel(member.createdAt)}`;
  return `${member.email} · ${statusLabels[member.status]} · ${joined}`;
}

function statusBadgeClass(status: MembershipStatus) {
  if (status === "ACTIVE") {
    return "badge badge-ok badge-dot";
  }

  if (status === "VIEWER" || status === "INVITED") {
    return "badge badge-accent badge-dot";
  }

  if (status === "SUSPENDED") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

function currentSessionBadge(member: HostMemberListItem) {
  if (member.currentSessionParticipationStatus === "ACTIVE") {
    return { label: "이번 세션 참여", className: "badge badge-ok badge-dot" };
  }

  if (member.currentSessionParticipationStatus === "REMOVED") {
    return { label: "이번 세션 제외", className: "badge badge-warn badge-dot" };
  }

  return { label: "이번 세션 미포함", className: "badge" };
}

function focusMemberTab(tab: MemberTab) {
  globalThis.setTimeout(() => {
    document.getElementById(`host-members-tab-${tab}`)?.focus();
  }, 0);
}

function handleMemberTabKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  activeTab: MemberTab,
  onTabChange: (tab: MemberTab) => void,
) {
  const keys = tabs.map((tab) => tab.key);
  const currentIndex = keys.indexOf(activeTab);
  const lastIndex = keys.length - 1;
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % keys.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + keys.length) % keys.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : -1;

  if (nextIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextTab = keys[nextIndex];
  onTabChange(nextTab);
  focusMemberTab(nextTab);
}

function disabledCurrentSessionReason(member: HostMemberListItem, isParticipating: boolean) {
  if (isParticipating) {
    return member.role === "HOST"
      ? "호스트는 현재 세션에서 제외할 수 없습니다."
      : "이 멤버는 현재 정책상 이번 세션에서 제외할 수 없습니다.";
  }

  if (member.status !== "ACTIVE") {
    return "정식 활성 멤버만 이번 세션에 추가할 수 있습니다.";
  }

  return "현재 세션이 없거나 이미 다음 세션부터 반영되도록 처리되었습니다.";
}

function disabledSuspendReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canSuspend) {
    return null;
  }

  if (member.role === "HOST") {
    return "호스트는 정지할 수 없습니다.";
  }

  if (member.status !== "ACTIVE") {
    return "정식 활성 멤버만 정지할 수 있습니다.";
  }

  return "이 멤버는 현재 정책상 정지할 수 없습니다.";
}

function disabledDeactivateReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canDeactivate) {
    return null;
  }

  if (member.role === "HOST") {
    return "호스트는 탈퇴 처리할 수 없습니다.";
  }

  if (member.status === "LEFT" || member.status === "INACTIVE") {
    return "이미 탈퇴/비활성 처리된 멤버입니다.";
  }

  return "이 멤버는 현재 정책상 탈퇴 처리할 수 없습니다.";
}

function disabledViewerActivationReason(rowPending: boolean) {
  return rowPending ? memberActionPendingReason : null;
}

function disabledViewerDeactivateReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canDeactivate) {
    return null;
  }

  if (member.role === "HOST") {
    return "호스트는 둘러보기 해제할 수 없습니다.";
  }

  return "이 멤버는 현재 정책상 둘러보기 해제할 수 없습니다.";
}

function disabledProfileReason(rowPending: boolean) {
  return rowPending ? memberActionPendingReason : null;
}

function disabledRestoreReason(member: HostMemberListItem, rowPending: boolean) {
  if (rowPending) {
    return memberActionPendingReason;
  }

  if (member.canRestore) {
    return null;
  }

  if (member.status !== "SUSPENDED") {
    return "정지된 멤버만 복구할 수 있습니다.";
  }

  return "이 멤버는 현재 정책상 복구할 수 없습니다.";
}

function actionKey(member: HostMemberListItem, action: string) {
  return `${member.membershipId}:${action}`;
}

function isMembershipPending(membershipId: string, pendingActions: Set<string>) {
  for (const key of pendingActions) {
    if (key.startsWith(`${membershipId}:`)) {
      return true;
    }
  }

  return false;
}

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

function hostProfileErrorMessage(status: number, code: HostMemberProfileErrorCode | null) {
  if (status === 403 || status === 404) {
    return hostProfileNotEditableMessage;
  }

  switch (code) {
    case "DISPLAY_NAME_REQUIRED":
      return "이름을 입력해 주세요.";
    case "DISPLAY_NAME_TOO_LONG":
      return "이름은 20자 이하로 입력해 주세요.";
    case "DISPLAY_NAME_INVALID":
      return "이름으로 쓸 수 없는 형식입니다.";
    case "DISPLAY_NAME_RESERVED":
      return "시스템에서 쓰는 이름은 사용할 수 없습니다.";
    case "DISPLAY_NAME_DUPLICATE":
      return "같은 클럽에서 이미 쓰고 있는 이름입니다.";
    case "HOST_ROLE_REQUIRED":
    case "MEMBER_NOT_FOUND":
    case "MEMBERSHIP_NOT_ALLOWED":
      return hostProfileNotEditableMessage;
    default:
      return hostProfileUnknownErrorMessage;
  }
}

function profileFailureMessage(error: unknown) {
  if (error instanceof Error && hostProfileFailureMessages.has(error.message)) {
    return error.message;
  }

  return hostProfileUnknownErrorMessage;
}

export default function HostMembers({ initialMembers, actions }: HostMembersProps) {
  const [memberRowsState, setMemberRowsState] = useState<MemberRowsState>(() => ({
    source: initialMembers,
    members: initialMembers,
  }));
  const members = memberRowsState.source === initialMembers ? memberRowsState.members : initialMembers;
  const [activeTab, setActiveTab] = useState<MemberTab>("active");
  const [dialog, setDialog] = useState<LifecycleDialog>(null);
  const [profileDialog, setProfileDialog] = useState<ProfileDialog>(null);
  const [dialogPolicy, setDialogPolicy] = useState<CurrentSessionPolicy>("APPLY_NOW");
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const refreshRequestIdRef = useRef(0);

  const setMembers = (update: MemberRowsUpdate) => {
    setMemberRowsState((current) => {
      const source = current.source === initialMembers ? current.source : initialMembers;
      const currentMembers = current.source === initialMembers ? current.members : initialMembers;
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
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;

    try {
      const nextMembers = await actions.loadMembers();
      if (requestId === refreshRequestIdRef.current) {
        setMembers(nextMembers);
      }
    } catch (error) {
      if (requestId === refreshRequestIdRef.current) {
        throw error;
      }
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
      <section
        className="rm-document-panel"
        aria-label="멤버 운영 요약"
        style={{ padding: "18px 22px" }}
      >
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          멤버 상태 원장
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
            gap: 12,
          }}
        >
          <MemberCount label="둘러보기" value={viewerMembers.length} helper="둘러보기 멤버" tone={viewerMembers.length > 0 ? "accent" : "default"} />
          <MemberCount label="활성" value={activeMembers.length} helper="정식 멤버" tone="ok" />
          <MemberCount label="이번 세션" value={currentSessionParticipants.length} helper="참여 중" tone="ok" />
          <MemberCount
            label="미포함"
            value={activeMembersOutsideCurrentSession.length}
            helper="활성 중 미참여"
            tone={activeMembersOutsideCurrentSession.length > 0 ? "warn" : "default"}
          />
          <MemberCount label="정지" value={suspendedMembers.length} helper="쓰기 제한" tone={suspendedMembers.length > 0 ? "warn" : "default"} />
        </div>
      </section>

      <div
        role="tablist"
        aria-label="멤버 관리"
        className="surface"
        onKeyDown={(event) => handleMemberTabKeyDown(event, activeTab, setActiveTab)}
        style={{ padding: 6, display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`host-members-panel-${tab.key}`}
              id={`host-members-tab-${tab.key}`}
              className={`btn btn-sm ${selected ? "btn-primary" : "btn-quiet"}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {message ? (
        <p
          role={message.kind}
          className="small"
          style={{ margin: 0, color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)" }}
        >
          {message.text}
        </p>
      ) : null}

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
                    onClick={(event) => openDialog({ action: "suspend", member }, event.currentTarget)}
                  />
                  <MemberActionButton
                    action="deactivate"
                    member={member}
                    label="탈퇴 처리"
                    disabled={!member.canDeactivate || rowPending}
                    reason={deactivateReason}
                    onClick={(event) => openDialog({ action: "deactivate", member }, event.currentTarget)}
                  />
                  <CurrentSessionAction member={member} pendingActions={pendingActions} onSubmit={submitLifecycle} />
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
                    onClick={() => void submitViewerAction(member, "activate")}
                  />
                  <MemberActionButton
                    action="deactivate-viewer"
                    member={member}
                    label="둘러보기 해제"
                    disabled={!member.canDeactivate || rowPending}
                    reason={deactivateReason}
                    onClick={() => void submitViewerAction(member, "deactivate-viewer")}
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
                    onClick={() => void submitLifecycle(member, "/restore")}
                  />
                  <MemberActionButton
                    action="deactivate"
                    member={member}
                    label="탈퇴 처리"
                    disabled={!member.canDeactivate || rowPending}
                    reason={deactivateReason}
                    onClick={(event) => openDialog({ action: "deactivate", member }, event.currentTarget)}
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
            renderMeta={joinedMeta}
            renderProfileAction={renderProfileAction}
            renderActions={() => <span className="badge">기록 보존</span>}
          />
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
              <Link to="/app/host/invitations" className="btn btn-primary">
                초대 관리
              </Link>
            </div>
          </div>
        ) : null}
      </section>

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

function MemberActionButton({
  action,
  member,
  label,
  tone = "ghost",
  disabled,
  reason,
  onClick,
}: {
  action: string;
  member: HostMemberListItem;
  label: string;
  tone?: "ghost" | "primary";
  disabled: boolean;
  reason: string | null;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const reasonId = `host-member-${action}-reason-${member.membershipId}`;

  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        className={`btn ${tone === "primary" ? "btn-primary" : "btn-ghost"} btn-sm`}
        type="button"
        disabled={disabled}
        aria-describedby={reason ? reasonId : undefined}
        onClick={onClick}
      >
        {label}
      </button>
      {reason ? (
        <span id={reasonId} className="tiny" style={{ maxWidth: 180, color: "var(--text-3)", textAlign: "right" }}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

function CurrentSessionAction({
  member,
  pendingActions,
  onSubmit,
}: {
  member: HostMemberListItem;
  pendingActions: Set<string>;
  onSubmit: (member: HostMemberListItem, path: HostMemberLifecyclePath) => Promise<void>;
}) {
  const isParticipating = member.currentSessionParticipationStatus === "ACTIVE";
  const path: HostMemberLifecyclePath = isParticipating ? "/current-session/remove" : "/current-session/add";
  const enabled = isParticipating ? member.canRemoveFromCurrentSession : member.canAddToCurrentSession;
  const label = isParticipating ? "이번 세션 제외" : "이번 세션 추가";
  const rowPending = isMembershipPending(member.membershipId, pendingActions);
  const reasonId = `current-session-action-reason-${member.membershipId}`;
  const reason = rowPending ? memberActionPendingReason : !enabled ? disabledCurrentSessionReason(member, isParticipating) : null;

  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        disabled={!enabled || rowPending}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void onSubmit(member, path)}
      >
        {label}
      </button>
      {reason ? (
        <span id={reasonId} className="tiny" style={{ maxWidth: 180, color: "var(--text-3)", textAlign: "right" }}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

function MemberList({
  members,
  emptyText,
  sectionDescription,
  renderMeta,
  renderProfileAction,
  renderActions,
}: {
  members: HostMemberListItem[];
  emptyText: string;
  sectionDescription: string;
  renderMeta: (member: HostMemberListItem) => string;
  renderProfileAction: (member: HostMemberListItem) => ReactNode;
  renderActions: (member: HostMemberListItem) => ReactNode;
}) {
  if (members.length === 0) {
    return (
      <div className="surface" style={{ padding: 28 }}>
        <p className="small" style={{ color: "var(--text-2)", margin: "0 0 10px" }}>
          {sectionDescription}
        </p>
        <p className="body" style={{ margin: 0 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {sectionDescription}
      </p>
      {members.map((member) => (
        <article key={member.membershipId} className="surface" style={{ padding: "18px 22px" }}>
          <div className="row-between" style={{ alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 className="h4 editorial" style={{ margin: 0 }}>
                  {member.displayName}
                </h2>
                <span className={statusBadgeClass(member.status)}>{statusBadgeLabels[member.status]}</span>
                <span className={currentSessionBadge(member).className}>{currentSessionBadge(member).label}</span>
                {member.role === "HOST" ? <span className="badge badge-accent badge-dot">호스트</span> : null}
              </div>
              <p className="small" style={{ margin: "4px 0 0", color: "var(--text-2)" }}>
                {renderMeta(member)}
              </p>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {renderProfileAction(member)}
              {renderActions(member)}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MemberCount({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "ok" | "warn" | "accent" | "default";
}) {
  const className =
    tone === "ok"
      ? "badge badge-ok badge-dot"
      : tone === "warn"
        ? "badge badge-warn badge-dot"
        : tone === "accent"
          ? "badge badge-accent badge-dot"
          : "badge";

  return (
    <div className="surface-quiet" style={{ padding: "12px 14px" }}>
      <div className="row-between" style={{ gap: 8 }}>
        <span className="body" style={{ fontSize: "13px", fontWeight: 600 }}>
          {label}
        </span>
        <span className={className}>{value}</span>
      </div>
      <div className="tiny" style={{ marginTop: 4 }}>
        {helper}
      </div>
    </div>
  );
}

function HostMemberProfileDialog({
  member,
  submitting,
  onClose,
  onSubmit,
}: {
  member: HostMemberListItem;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (displayName: string) => Promise<void>;
}) {
  const titleId = `member-profile-title-${member.membershipId}`;
  const inputId = `member-profile-display-name-${member.membershipId}`;
  const errorId = `member-profile-error-${member.membershipId}`;
  const [value, setValue] = useState(member.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const busy = saving || submitting;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!busy) {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstElement || !focusIsInsideDialog) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !focusIsInsideDialog) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current || submitting) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await onSubmit(value.trim());
      onClose();
    } catch (profileError) {
      setError(profileFailureMessage(profileError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(420px, 100%)", padding: "24px" }}
      >
        <h2 id={titleId} style={{ margin: 0 }}>
          {member.displayName} 이름 수정
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          앱에서 멤버를 부르는 이름입니다.
        </p>

        <form onSubmit={handleSubmit} className="stack" style={{ "--stack": "16px" } as CSSProperties}>
          <div>
            <label htmlFor={inputId} className="label">
              이름
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="input"
              value={value}
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setValue(event.currentTarget.value)}
              style={{ width: "100%", marginTop: 8 }}
            />
            {error ? (
              <div id={errorId} role="alert" className="tiny" style={{ color: "var(--danger)", marginTop: 8 }}>
                {error}
              </div>
            ) : null}
          </div>

          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button className="btn btn-primary btn-sm" type="submit" aria-label="이름 저장" disabled={busy}>
              {busy ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LifecyclePolicyDialog({
  dialog,
  policy,
  submitting,
  onPolicyChange,
  onClose,
  onConfirm,
}: {
  dialog: Exclude<LifecycleDialog, null>;
  policy: CurrentSessionPolicy;
  submitting: boolean;
  onPolicyChange: (policy: CurrentSessionPolicy) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = dialog.action === "suspend" ? `${dialog.member.displayName}님을 정지할까요?` : `${dialog.member.displayName}님을 탈퇴 처리할까요?`;
  const description =
    dialog.action === "suspend"
      ? "정지하면 기존 기록은 유지되고, 새 RSVP/질문/체크인/리뷰 작성은 막힙니다."
      : '과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.';
  const applyNowLabel = dialog.action === "suspend" ? "이번 세션부터 바로 정지" : "이번 세션에서 제외";
  const nextSessionLabel = dialog.action === "suspend" ? "다음 세션부터 정지" : "다음 세션부터 제외";
  const confirmLabel = dialog.action === "suspend" ? "정지" : "탈퇴 처리";
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusTarget = cancelButtonRef.current ?? confirmButtonRef.current ?? dialogRef.current;
    focusTarget?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!submitting) {
        event.preventDefault();
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstElement || !focusIsInsideDialog) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !focusIsInsideDialog) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-lifecycle-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="member-lifecycle-title" style={{ margin: 0 }}>
          {title}
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          {description}
        </p>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">현재 세션 반영</legend>
          <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="current-session-policy"
                value="APPLY_NOW"
                checked={policy === "APPLY_NOW"}
                onChange={() => onPolicyChange("APPLY_NOW")}
              />
              <span className="small">{applyNowLabel}</span>
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input
                type="radio"
                name="current-session-policy"
                value="NEXT_SESSION"
                checked={policy === "NEXT_SESSION"}
                onChange={() => onPolicyChange("NEXT_SESSION")}
              />
              <span className="small">{nextSessionLabel}</span>
            </label>
          </div>
        </fieldset>

        <div className="actions" style={{ marginTop: "22px", justifyContent: "flex-end" }}>
          <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button ref={confirmButtonRef} className="btn btn-primary btn-sm" type="button" disabled={submitting} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
