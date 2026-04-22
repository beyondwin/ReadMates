import { Link } from "@/src/app/router-link";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CurrentSessionPolicy,
  HostMemberListItem,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  MembershipStatus,
  SessionParticipationStatus,
  ViewerMember,
} from "@/shared/api/readmates";
import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/readmates";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

type HostMembersProps = {
  initialMembers: HostMemberListItem[];
};

type MemberRowsState = {
  source: HostMemberListItem[];
  members: HostMemberListItem[];
};
type MemberRowsUpdate = HostMemberListItem[] | ((current: HostMemberListItem[]) => HostMemberListItem[]);
type MemberTab = "active" | "viewer" | "suspended" | "inactive" | "invitations";
type LifecycleDialog = null | { action: "suspend" | "deactivate"; member: HostMemberListItem };
type ViewerAction = "activate" | "deactivate-viewer";

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

function encodeMembershipId(member: HostMemberListItem) {
  return encodeURIComponent(member.membershipId);
}

export default function HostMembers({ initialMembers }: HostMembersProps) {
  const [memberRowsState, setMemberRowsState] = useState<MemberRowsState>(() => ({
    source: initialMembers,
    members: initialMembers,
  }));
  const members = memberRowsState.source === initialMembers ? memberRowsState.members : initialMembers;
  const [activeTab, setActiveTab] = useState<MemberTab>("active");
  const [dialog, setDialog] = useState<LifecycleDialog>(null);
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

  const openDialog = (nextDialog: Exclude<LifecycleDialog, null>, trigger: HTMLElement) => {
    dialogTriggerRef.current = trigger;
    setMessage(null);
    setDialogPolicy("APPLY_NOW");
    setDialog(nextDialog);
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

  const refreshMembers = async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;

    try {
      const nextMembers = await readmatesFetch<HostMemberListItem[]>("/api/host/members");
      if (requestId === refreshRequestIdRef.current) {
        setMembers(nextMembers);
      }
    } catch (error) {
      if (requestId === refreshRequestIdRef.current) {
        throw error;
      }
    }
  };

  async function submitLifecycle(member: HostMemberListItem, path: string, body?: MemberLifecycleRequest) {
    const key = actionKey(member, path);
    if (isMembershipPending(member.membershipId, pendingActionsRef.current)) {
      return;
    }

    setActionPending(key, true);
    setMessage(null);

    try {
      const response = await readmatesFetchResponse(`/api/host/members/${encodeMembershipId(member)}${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        throw new Error("Member lifecycle update failed");
      }

      const result = (await response.json()) as MemberLifecycleResponse;
      setMembers((current) =>
        current.map((item) => (item.membershipId === result.member.membershipId ? result.member : item)),
      );
      setMessage({ kind: "status", text: "멤버 상태를 업데이트했습니다." });
    } catch {
      setMessage({ kind: "alert", text: "멤버 상태 업데이트에 실패했습니다." });
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
      await readmatesFetch<ViewerMember>(`/api/host/members/${encodeMembershipId(member)}/${action}`, {
        method: "POST",
      });

      setMembers((current) => current.filter((item) => item.membershipId !== member.membershipId));
      setMessage({ kind: "status", text: successMessage });

      try {
        await refreshMembers();
      } catch {
        setMessage({ kind: "alert", text: "처리는 완료됐지만 멤버 목록 새로고침에 실패했습니다." });
      }
    } catch {
      setMessage({
        kind: "alert",
        text: action === "activate" ? "정식 멤버 전환에 실패했습니다." : "둘러보기 해제에 실패했습니다.",
      });
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

  return (
    <div className="stack" style={{ "--stack": "18px" } as CSSProperties}>
      <div
        role="tablist"
        aria-label="멤버 관리"
        className="surface"
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
            renderMeta={memberMeta}
            renderActions={(member) => {
              const rowPending = isMembershipPending(member.membershipId, pendingActions);

              return (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={!member.canSuspend || rowPending}
                    onClick={(event) => openDialog({ action: "suspend", member }, event.currentTarget)}
                  >
                    정지
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={!member.canDeactivate || rowPending}
                    onClick={(event) => openDialog({ action: "deactivate", member }, event.currentTarget)}
                  >
                    탈퇴 처리
                  </button>
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
            renderMeta={requestMeta}
            renderActions={(member) => {
              const rowPending = isMembershipPending(member.membershipId, pendingActions);

              return (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={rowPending}
                    onClick={() => void submitViewerAction(member, "activate")}
                  >
                    정식 멤버로 전환
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={!member.canDeactivate || rowPending}
                    onClick={() => void submitViewerAction(member, "deactivate-viewer")}
                  >
                    둘러보기 해제
                  </button>
                </>
              );
            }}
          />
        ) : null}

        {activeTab === "suspended" ? (
          <MemberList
            members={suspendedMembers}
            emptyText="정지된 멤버가 없습니다."
            renderMeta={joinedMeta}
            renderActions={(member) => {
              const rowPending = isMembershipPending(member.membershipId, pendingActions);

              return (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={!member.canRestore || rowPending}
                    onClick={() => void submitLifecycle(member, "/restore")}
                  >
                    복구
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={!member.canDeactivate || rowPending}
                    onClick={(event) => openDialog({ action: "deactivate", member }, event.currentTarget)}
                  >
                    탈퇴 처리
                  </button>
                </>
              );
            }}
          />
        ) : null}

        {activeTab === "inactive" ? (
          <MemberList
            members={inactiveMembers}
            emptyText="탈퇴 또는 비활성 멤버가 없습니다."
            renderMeta={joinedMeta}
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
    </div>
  );
}

function CurrentSessionAction({
  member,
  pendingActions,
  onSubmit,
}: {
  member: HostMemberListItem;
  pendingActions: Set<string>;
  onSubmit: (member: HostMemberListItem, path: string) => Promise<void>;
}) {
  const isParticipating = member.currentSessionParticipationStatus === "ACTIVE";
  const path = isParticipating ? "/current-session/remove" : "/current-session/add";
  const enabled = isParticipating ? member.canRemoveFromCurrentSession : member.canAddToCurrentSession;
  const label = isParticipating ? "이번 세션 제외" : "이번 세션 추가";
  const rowPending = isMembershipPending(member.membershipId, pendingActions);

  return (
    <button
      className="btn btn-ghost btn-sm"
      type="button"
      disabled={!enabled || rowPending}
      onClick={() => void onSubmit(member, path)}
    >
      {label}
    </button>
  );
}

function MemberList({
  members,
  emptyText,
  renderMeta,
  renderActions,
}: {
  members: HostMemberListItem[];
  emptyText: string;
  renderMeta: (member: HostMemberListItem) => string;
  renderActions: (member: HostMemberListItem) => ReactNode;
}) {
  if (members.length === 0) {
    return (
      <div className="surface" style={{ padding: 28 }}>
        <p className="body" style={{ margin: 0 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      {members.map((member) => (
        <article key={member.membershipId} className="surface" style={{ padding: "18px 22px" }}>
          <div className="row-between" style={{ alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 className="h4 editorial" style={{ margin: 0 }}>
                  {member.displayName}
                </h2>
                {member.role === "HOST" ? <span className="badge badge-accent badge-dot">호스트</span> : null}
              </div>
              <p className="small" style={{ margin: "4px 0 0", color: "var(--text-2)" }}>
                {renderMeta(member)}
              </p>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {renderActions(member)}
            </div>
          </div>
        </article>
      ))}
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
