"use client";

import { type CSSProperties, type FormEvent, type InvalidEvent, useRef, useState } from "react";
import type {
  CreateHostInvitationRequest,
  HostInvitationListItem,
  HostInvitationResponse,
  InvitationStatus,
} from "@/features/host/api/host-contracts";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const statusLabels: Record<InvitationStatus, string> = {
  PENDING: "대기",
  ACCEPTED: "수락됨",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
};

const statusDetailLabels: Record<InvitationStatus, string> = {
  PENDING: "수락 전입니다. 필요하면 취소하거나 새 링크를 발급하세요.",
  ACCEPTED: "이미 사용된 초대입니다. 멤버 목록에서 상태를 확인하세요.",
  EXPIRED: "만료된 링크입니다. 같은 대상에게 새 링크를 발급할 수 있습니다.",
  REVOKED: "취소된 링크입니다. 더 이상 사용할 수 없습니다.",
};

type HostMessage = {
  kind: "alert" | "status";
  text: string;
};

type PendingRowAction = "revoke" | "reissue";

export type HostInvitationsActions = {
  listInvitations: () => Promise<Response>;
  createInvitation: (request: CreateHostInvitationRequest) => Promise<Response>;
  revokeInvitation: (invitationId: string) => Promise<Response>;
  parseInvitation: (response: Response) => Promise<HostInvitationResponse>;
  parseInvitationList: (response: Response) => Promise<HostInvitationListItem[]>;
};

function inviteStatusClass(status: InvitationStatus) {
  if (status === "PENDING") {
    return "badge badge-accent badge-dot";
  }

  if (status === "ACCEPTED") {
    return "badge badge-ok badge-dot";
  }

  if (status === "EXPIRED") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

function inviteCounts(invitations: HostInvitationListItem[]) {
  return {
    pending: invitations.filter((invitation) => invitation.effectiveStatus === "PENDING").length,
    used: invitations.filter((invitation) => invitation.effectiveStatus === "ACCEPTED").length,
    expired: invitations.filter((invitation) => invitation.effectiveStatus === "EXPIRED").length,
    revoked: invitations.filter((invitation) => invitation.effectiveStatus === "REVOKED").length,
  };
}

export default function HostInvitations({
  initialInvitations,
  actions,
}: {
  initialInvitations: HostInvitationListItem[];
  actions: HostInvitationsActions;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [applyToCurrentSession, setApplyToCurrentSession] = useState(true);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [lastCreated, setLastCreated] = useState<HostInvitationResponse | null>(null);
  const [message, setMessage] = useState<HostMessage | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const [pendingRows, setPendingRows] = useState<Record<string, PendingRowAction>>({});
  const lastCreatedRequestRef = useRef(0);

  const hasPendingRow = Object.keys(pendingRows).length > 0;
  const disableCreate = isCreating || hasPendingRow;
  const createDisabledReason = isCreating
    ? "초대 링크를 만드는 중입니다."
    : hasPendingRow
      ? "목록 작업이 끝난 뒤 새 초대 링크를 만들 수 있습니다."
      : null;
  const copyDisabledReason = copyPending
    ? "초대 링크를 복사하는 중입니다."
    : isCreating
      ? "초대 링크 생성이 끝난 뒤 복사할 수 있습니다."
      : hasPendingRow
        ? "목록 작업이 끝난 뒤 생성된 링크를 복사할 수 있습니다."
        : null;
  const nameInvalid = nameTouched && name.trim().length === 0;
  const counts = inviteCounts(invitations);
  const shareHref = lastCreated?.acceptUrl
    ? `mailto:${encodeURIComponent(lastCreated.email)}?subject=${encodeURIComponent("ReadMates 초대 링크")}&body=${encodeURIComponent(
        `${lastCreated.name}님, ReadMates 초대 링크입니다.\n\n${lastCreated.acceptUrl}`,
      )}`
    : null;

  const showAlert = (text: string) => setMessage({ kind: "alert", text });
  const showStatus = (text: string) => setMessage({ kind: "status", text });

  const setRowPending = (invitationId: string, action: PendingRowAction | null) => {
    setPendingRows((current) => {
      const next = { ...current };
      if (action) {
        next[invitationId] = action;
      } else {
        delete next[invitationId];
      }
      return next;
    });
  };

  const refreshInvitations = async () => {
    const response = await actions.listInvitations();
    if (!response.ok) {
      showAlert("초대 목록 새로고침에 실패했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      return false;
    }

    setInvitations(await actions.parseInvitationList(response));
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setNameTouched(true);

    if (disableCreate) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      showAlert("이름을 입력해 주세요.");
      return;
    }

    setLastCreated(null);
    const requestId = ++lastCreatedRequestRef.current;
    setIsCreating(true);

    try {
      const response = await actions.createInvitation({
        email: trimmedEmail,
        name: trimmedName,
        applyToCurrentSession,
      });
      if (!response.ok) {
        showAlert(
          response.status === 409
            ? "이미 활성 멤버인 이메일입니다. 멤버 목록에서 상태를 확인해 주세요."
            : "초대 생성에 실패했습니다. 이메일과 이름을 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }

      const created = await actions.parseInvitation(response);
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        await refreshInvitations();
        setName("");
        setEmail("");
        setNameTouched(false);
      }
    } catch {
      showAlert("초대 생성에 실패했습니다. 이메일과 이름을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleNameInvalid = (event: InvalidEvent<HTMLInputElement>) => {
    event.preventDefault();
    setNameTouched(true);
    showAlert("이름을 입력해 주세요.");
  };

  const copyLastCreated = async () => {
    if (!lastCreated?.acceptUrl || copyPending || isCreating || hasPendingRow) {
      return;
    }

    setCopyPending(true);
    setMessage(null);
    try {
      await navigator.clipboard.writeText(lastCreated.acceptUrl);
      showStatus("초대 링크를 복사했습니다.");
    } catch {
      showAlert("초대 링크 복사에 실패했습니다. 브라우저 권한을 허용하거나 URL을 직접 선택해 복사해 주세요.");
    } finally {
      setCopyPending(false);
    }
  };

  const revoke = async (invitation: HostInvitationListItem) => {
    if (pendingRows[invitation.invitationId] || isCreating) {
      return;
    }

    setMessage(null);
    setRowPending(invitation.invitationId, "revoke");
    try {
      const response = await actions.revokeInvitation(invitation.invitationId);
      if (!response.ok) {
        showAlert("초대 취소에 실패했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
        return;
      }

      setLastCreated((current) => (current?.invitationId === invitation.invitationId ? null : current));
      await refreshInvitations();
    } catch {
      showAlert("초대 취소에 실패했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
    } finally {
      setRowPending(invitation.invitationId, null);
    }
  };

  const reissue = async (invitation: HostInvitationListItem) => {
    if (pendingRows[invitation.invitationId] || isCreating) {
      return;
    }

    setName(invitation.name);
    setEmail(invitation.email);
    setApplyToCurrentSession(invitation.applyToCurrentSession);
    setMessage(null);
    setLastCreated(null);
    setRowPending(invitation.invitationId, "reissue");
    const requestId = ++lastCreatedRequestRef.current;

    try {
      const response = await actions.createInvitation({
        email: invitation.email,
        name: invitation.name,
        applyToCurrentSession: invitation.applyToCurrentSession,
      });
      if (!response.ok) {
        showAlert("새 링크 발급에 실패했습니다. 대상 이메일을 확인한 뒤 다시 시도해 주세요.");
        return;
      }

      const created = await actions.parseInvitation(response);
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        await refreshInvitations();
      }
    } catch {
      showAlert("새 링크 발급에 실패했습니다. 대상 이메일을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setRowPending(invitation.invitationId, null);
    }
  };

  return (
    <main>
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">운영 · 멤버 초대</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 초대 관리
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            초대 링크 생성부터 수락, 만료, 취소 상태까지 한곳에서 확인합니다.
          </p>
        </div>
      </section>

      <section style={{ padding: "36px 0 80px" }}>
        <div className="container">
          <section
            className="rm-document-panel"
            aria-label="초대 상태 요약"
            style={{ padding: "18px 22px", marginBottom: 24 }}
          >
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              초대 상태
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 12,
              }}
            >
              <InviteCount label="대기" value={counts.pending} helper="아직 수락 전" tone={counts.pending > 0 ? "accent" : "default"} />
              <InviteCount label="사용됨" value={counts.used} helper="수락 완료" tone="ok" />
              <InviteCount label="만료" value={counts.expired} helper="새 링크 필요" tone={counts.expired > 0 ? "warn" : "default"} />
              <InviteCount label="취소" value={counts.revoked} helper="사용 불가" tone="default" />
            </div>
          </section>

          <form className="surface" onSubmit={submit} style={{ padding: 24, marginBottom: 24 }}>
            <div className="row-between" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  초대 생성
                </div>
                <h2 className="h3 editorial" style={{ margin: 0 }}>
                  이름과 이메일로 새 링크 만들기
                </h2>
                <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
                  생성된 링크는 바로 복사하거나 메일로 공유할 수 있습니다.
                </p>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={disableCreate}
                aria-describedby={createDisabledReason ? "invite-create-disabled-reason" : undefined}
              >
                {isCreating ? "초대 링크를 만드는 중" : "초대 링크 만들기"}
              </button>
            </div>
            {createDisabledReason ? (
              <p id="invite-create-disabled-reason" className="tiny" style={{ margin: "-8px 0 12px", color: "var(--text-3)" }}>
                {createDisabledReason}
              </p>
            ) : null}
            <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 180, flex: "1 1 180px" }}>
                <label className="label" htmlFor="invite-name">
                  이름
                </label>
                <input
                  id="invite-name"
                  className="input"
                  type="text"
                  value={name}
                  onBlur={() => setNameTouched(true)}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (event.target.value.trim()) {
                      setNameTouched(false);
                    }
                  }}
                  onInvalid={handleNameInvalid}
                  placeholder="새멤버"
                  autoComplete="name"
                  required
                  aria-invalid={nameInvalid ? "true" : undefined}
                />
              </div>
              <div style={{ minWidth: 240, flex: "1 1 240px" }}>
                <label className="label" htmlFor="invite-email">
                  초대 이메일
                </label>
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="member@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <label className="row" style={{ gap: 8, alignItems: "center", minHeight: 42 }}>
                <input
                  type="checkbox"
                  checked={applyToCurrentSession}
                  onChange={(event) => setApplyToCurrentSession(event.currentTarget.checked)}
                />
                <span className="small">수락하면 이번 세션에도 추가</span>
              </label>
            </div>
            {lastCreated?.acceptUrl ? (
              <div className="surface-quiet" style={{ marginTop: 18, padding: 18 }}>
                <label className="label" htmlFor="created-invite-url">
                  생성된 초대 링크
                </label>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <input
                    id="created-invite-url"
                    className="input"
                    readOnly
                    value={lastCreated.acceptUrl}
                    style={{ maxWidth: 520 }}
                  />
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={copyPending || isCreating || hasPendingRow}
                    aria-describedby={copyDisabledReason ? "invite-copy-disabled-reason" : undefined}
                    onClick={() => void copyLastCreated()}
                  >
                    {copyPending ? "복사하는 중" : "초대 링크 복사"}
                  </button>
                  {shareHref ? (
                    <a className="btn btn-quiet" href={shareHref}>
                      메일로 공유
                    </a>
                  ) : null}
                </div>
                <p className="tiny" style={{ margin: "8px 0 0", color: "var(--text-3)" }}>
                  이 URL은 생성 직후에만 표시됩니다. 나중에 다시 공유해야 하면 새 링크를 발급하세요.
                </p>
                {copyDisabledReason ? (
                  <p id="invite-copy-disabled-reason" className="tiny" style={{ margin: "4px 0 0", color: "var(--text-3)" }}>
                    {copyDisabledReason}
                  </p>
                ) : null}
              </div>
            ) : null}
            {message ? (
              <p
                className="small"
                role={message.kind}
                style={{ margin: "12px 0 0", color: message.kind === "alert" ? "var(--danger)" : undefined }}
              >
                {message.text}
              </p>
            ) : null}
          </form>

          <div className="surface" style={{ padding: 24 }}>
            <div className="row-between" style={{ gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  초대 목록
                </div>
                <h2 className="h3 editorial" style={{ margin: 0 }}>
                  대기 · 사용 · 만료 기록
                </h2>
              </div>
              <span className="badge">{invitations.length}개</span>
            </div>
            <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
              {invitations.length === 0 ? (
                <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                  아직 만든 초대가 없습니다.
                </p>
              ) : (
                invitations.map((invitation) => (
                  <div
                    key={invitation.invitationId}
                    className="rm-ledger-row"
                    style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16 }}
                  >
                    <div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div className="body" style={{ fontSize: 14, fontWeight: 600 }}>
                          {invitation.name}
                        </div>
                        <span className={inviteStatusClass(invitation.effectiveStatus)}>
                          {statusLabels[invitation.effectiveStatus]}
                        </span>
                        {invitation.applyToCurrentSession ? <span className="badge">이번 세션 포함</span> : null}
                      </div>
                      <div className="small" style={{ marginTop: 2 }}>
                        {invitation.email}
                      </div>
                      <div className="tiny">
                        {statusLabels[invitation.effectiveStatus]} · 만료 {formatDateOnlyLabel(invitation.expiresAt)}
                      </div>
                      <div className="tiny" style={{ marginTop: 4, color: "var(--text-3)" }}>
                        {statusDetailLabels[invitation.effectiveStatus]}
                      </div>
                      {invitation.effectiveStatus === "PENDING" ? (
                        <div className="tiny" style={{ marginTop: 4, color: "var(--text-3)" }}>
                          기존 링크는 목록에서 다시 복사할 수 없습니다. 새 공유가 필요하면 새 링크 발급을 사용하세요.
                        </div>
                      ) : null}
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {invitation.canRevoke ? (
                        <button
                          aria-label={`${invitation.email} 초대 취소`}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={isCreating || Boolean(pendingRows[invitation.invitationId])}
                          onClick={() => void revoke(invitation)}
                        >
                          초대 취소
                        </button>
                      ) : null}
                      {invitation.canReissue ? (
                        <button
                          aria-label={`${invitation.email} 새 링크 발급`}
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={isCreating || Boolean(pendingRows[invitation.invitationId])}
                          onClick={() => void reissue(invitation)}
                        >
                          {pendingRows[invitation.invitationId] === "reissue" ? "새 링크 발급 중" : "새 링크 발급"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function InviteCount({
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
        <span className="body" style={{ fontSize: 13, fontWeight: 600 }}>
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
