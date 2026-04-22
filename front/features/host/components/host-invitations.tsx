"use client";

import { Link } from "@/src/app/router-link";
import { type CSSProperties, type FormEvent, type InvalidEvent, useRef, useState } from "react";
import {
  createInvitation,
  listInvitations,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  revokeInvitation,
} from "@/features/host/actions/invitations";
import type { HostInvitationListItem, HostInvitationResponse, InvitationStatus } from "@/shared/api/readmates";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const statusLabels: Record<InvitationStatus, string> = {
  PENDING: "대기",
  ACCEPTED: "수락됨",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
};

type HostMessage = {
  kind: "alert" | "status";
  text: string;
};

type PendingRowAction = "revoke" | "reissue";

export default function HostInvitations({ initialInvitations }: { initialInvitations: HostInvitationListItem[] }) {
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
  const nameInvalid = nameTouched && name.trim().length === 0;

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
    const response = await listInvitations();
    if (!response.ok) {
      showAlert("초대 목록 새로고침에 실패했습니다.");
      return false;
    }

    setInvitations(await parseHostInvitationListResponse(response));
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
      const response = await createInvitation({
        email: trimmedEmail,
        name: trimmedName,
        applyToCurrentSession,
      });
      if (!response.ok) {
        showAlert(response.status === 409 ? "이미 활성 멤버인 이메일입니다." : "초대 생성에 실패했습니다.");
        return;
      }

      const created = await parseHostInvitationResponse(response);
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        await refreshInvitations();
        setName("");
        setEmail("");
        setNameTouched(false);
      }
    } catch {
      showAlert("초대 생성에 실패했습니다.");
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
      showAlert("초대 링크 복사에 실패했습니다.");
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
      const response = await revokeInvitation(invitation.invitationId);
      if (!response.ok) {
        showAlert("초대 취소에 실패했습니다.");
        return;
      }

      setLastCreated((current) => (current?.invitationId === invitation.invitationId ? null : current));
      await refreshInvitations();
    } catch {
      showAlert("초대 취소에 실패했습니다.");
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
      const response = await createInvitation({
        email: invitation.email,
        name: invitation.name,
        applyToCurrentSession: invitation.applyToCurrentSession,
      });
      if (!response.ok) {
        showAlert("새 링크 발급에 실패했습니다.");
        return;
      }

      const created = await parseHostInvitationResponse(response);
      if (requestId === lastCreatedRequestRef.current) {
        setLastCreated(created);
        await refreshInvitations();
      }
    } catch {
      showAlert("새 링크 발급에 실패했습니다.");
    } finally {
      setRowPending(invitation.invitationId, null);
    }
  };

  return (
    <main>
      <section className="page-header-compact">
        <div className="container">
          <Link to="/app/host" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: "10px" }}>
            ← 운영 대시보드
          </Link>
          <div className="eyebrow">운영 · 멤버 초대</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 초대
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            초대받은 이름과 이메일을 확인하고, 멤버가 Google 계정으로 초대를 수락합니다.
          </p>
        </div>
      </section>

      <section style={{ padding: "36px 0 80px" }}>
        <div className="container">
          <form className="surface" onSubmit={submit} style={{ padding: 24, marginBottom: 24 }}>
            <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 180 }}>
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
                  style={{ maxWidth: 240 }}
                />
              </div>
              <div style={{ minWidth: 240 }}>
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
                  style={{ maxWidth: 360 }}
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
              <button className="btn btn-primary" type="submit" disabled={disableCreate}>
                초대 링크 만들기
              </button>
            </div>
            {lastCreated?.acceptUrl ? (
              <div style={{ borderTop: "1px solid var(--line-soft)", marginTop: 18, paddingTop: 16 }}>
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
                    onClick={() => void copyLastCreated()}
                  >
                    초대 링크 복사
                  </button>
                </div>
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
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Invitation list
            </div>
            <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
              {invitations.length === 0 ? (
                <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                  아직 만든 초대가 없습니다.
                </p>
              ) : (
                invitations.map((invitation) => (
                  <div key={invitation.invitationId} className="row-between" style={{ gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                        {invitation.name}
                      </div>
                      <div className="small" style={{ marginTop: 2 }}>
                        {invitation.email}
                      </div>
                      <div className="tiny">
                        {statusLabels[invitation.effectiveStatus]} · 만료 {formatDateOnlyLabel(invitation.expiresAt)}
                      </div>
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
                          새 링크 발급
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
