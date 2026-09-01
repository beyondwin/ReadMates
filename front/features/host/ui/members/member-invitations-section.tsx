import { type CSSProperties, type FormEvent, type ReactElement, useState } from "react";
import type { HostInvitationListItem, InvitationStatus } from "@/features/host/model/host-view-types";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import "./member-ledger.css";

const statusLabels: Record<InvitationStatus, string> = {
  PENDING: "대기",
  ACCEPTED: "수락됨",
  EXPIRED: "만료됨",
  REVOKED: "중지",
};

const statusDetailLabels: Record<InvitationStatus, string> = {
  PENDING: "수락 전입니다. 필요하면 중지하거나 재발송하세요.",
  ACCEPTED: "이미 사용된 초대입니다. 멤버 목록에서 상태를 확인하세요.",
  EXPIRED: "만료된 초대입니다. 같은 대상에게 재발송할 수 있습니다.",
  REVOKED: "중지된 초대입니다. 더 이상 사용할 수 없지만 이력은 보존됩니다.",
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

export function maskInvitationEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return "숨김";
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!local || !domain) {
    return "숨김";
  }

  return `${local[0]}***@${domain}`;
}

export function MemberInvitationsSection({
  invitations,
  pendingCount,
  onCreate,
  onRevoke,
  onReissue,
  busyId,
}: {
  invitations: readonly HostInvitationListItem[];
  pendingCount: number;
  onCreate: (
    request: { email: string; name: string; applyToCurrentSession: boolean },
    publication: { accepted: () => void; failed: () => void },
  ) => Promise<void>;
  onRevoke: (invitationId: string, publication: { accepted: () => void; failed: () => void }) => Promise<void>;
  onReissue: (invitation: HostInvitationListItem, publication: { accepted: () => void; failed: () => void }) => Promise<void>;
  busyId: string | null;
}): ReactElement {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [applyToCurrentSession, setApplyToCurrentSession] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<null | { kind: "alert" | "status"; text: string }>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [copyPendingId, setCopyPendingId] = useState<string | null>(null);

  const createBusy = isCreating || busyId !== null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setMessage({ kind: "alert", text: "이름을 입력해 주세요." });
      return;
    }
    if (!trimmedEmail || createBusy) {
      return;
    }

    setIsCreating(true);
    await onCreate({
        email: trimmedEmail,
        name: trimmedName,
        applyToCurrentSession,
      }, {
        accepted: () => {
          setName("");
          setEmail("");
          setMessage({ kind: "status", text: "초대를 보냈습니다." });
          setIsCreating(false);
        },
        failed: () => {
          setMessage({ kind: "alert", text: "초대 생성에 실패했습니다. 이메일과 이름을 확인한 뒤 다시 시도해 주세요." });
          setIsCreating(false);
        },
      });
  };

  const revealEmail = (invitationId: string) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      next.add(invitationId);
      return next;
    });
  };

  const copyEmail = async (invitation: HostInvitationListItem) => {
    if (copyPendingId || createBusy) {
      return;
    }

    setCopyPendingId(invitation.invitationId);
    setMessage(null);
    try {
      await navigator.clipboard.writeText(invitation.email);
      setMessage({ kind: "status", text: "이메일을 복사했습니다." });
    } catch {
      setMessage({ kind: "alert", text: "이메일 복사에 실패했습니다." });
    } finally {
      setCopyPendingId(null);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setMessage(null);
    await onRevoke(invitationId, {
      accepted: () => setMessage({ kind: "status", text: "초대를 중지했습니다." }),
      failed: () => setMessage({ kind: "alert", text: "초대 중지에 실패했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요." }),
    });
  };

  const handleReissue = async (invitation: HostInvitationListItem) => {
    setMessage(null);
    await onReissue(invitation, {
      accepted: () => setMessage({ kind: "status", text: "초대를 재발송했습니다." }),
      failed: () => setMessage({ kind: "alert", text: "재발송에 실패했습니다. 대상 이메일을 확인한 뒤 다시 시도해 주세요." }),
    });
  };

  return (
    <section className="rm-document-panel" aria-label="초대" style={{ padding: "18px 22px" }}>
      <header className="stack" style={{ "--stack": "6px", marginBottom: 14 } as CSSProperties}>
        <div className="eyebrow" style={{ margin: 0 }}>
          초대
        </div>
        <h2 className="h4 editorial" style={{ margin: 0 }}>
          응답을 기다리는 초대 {pendingCount}건
        </h2>
        <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          이메일 초대 상태와 재발송·중지를 한곳에서 관리합니다.
        </p>
      </header>

      <form className="surface" onSubmit={(event) => void submit(event)} style={{ padding: 16, marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 140, flex: "1 1 140px" }}>
            <label className="label" htmlFor="member-invite-name">
              이름
            </label>
            <input
              id="member-invite-name"
              className="input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="새멤버"
              autoComplete="name"
              required
            />
          </div>
          <div style={{ minWidth: 200, flex: "1 1 200px" }}>
            <label className="label" htmlFor="member-invite-email">
              초대 이메일
            </label>
            <input
              id="member-invite-email"
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
            <span className="small">수락하면 이번 모임에도 추가</span>
          </label>
          <button className="btn btn-primary btn-sm" type="submit" disabled={createBusy}>
            {isCreating ? "보내는 중" : "초대 보내기"}
          </button>
        </div>
      </form>

      {message ? (
        <p
          role={message.kind}
          className="small"
          style={{ margin: "0 0 12px", color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)" }}
        >
          {message.text}
        </p>
      ) : null}

      {invitations.length === 0 ? (
        <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          아직 보낸 초대가 없습니다.
        </p>
      ) : (
        <div className="stack" style={{ "--stack": "0" } as CSSProperties}>
          <table className="rm-host-member-ledger">
            <caption className="rm-host-member-ledger__caption rm-sr-only">초대 원장</caption>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">이메일</th>
                <th scope="col">상태</th>
                <th scope="col" className="rm-host-member-ledger__num">
                  만료·수락
                </th>
                <th scope="col">
                  <span className="rm-sr-only">액션</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((item) => {
                const revealed = revealedIds.has(item.invitationId);
                const rowBusy = busyId !== null || isCreating;
                const timestamp =
                  item.effectiveStatus === "ACCEPTED" && item.acceptedAt
                    ? `수락 ${formatDateOnlyLabel(item.acceptedAt)}`
                    : `만료 ${formatDateOnlyLabel(item.expiresAt)}`;

                return (
                  <tr key={item.invitationId} className="rm-host-member-ledger__row">
                    <td className="rm-host-member-ledger__fact">
                      <span className="h4" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                        {item.name}
                      </span>
                    </td>
                    <td className="rm-host-member-ledger__meta">
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="small" style={{ margin: 0 }}>
                          {revealed ? item.email : maskInvitationEmail(item.email)}
                        </span>
                        {!revealed ? (
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            onClick={() => revealEmail(item.invitationId)}
                          >
                            전체 보기
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="rm-host-member-ledger__status">
                      <div className="stack" style={{ "--stack": "2px" } as CSSProperties}>
                        <span className={inviteStatusClass(item.effectiveStatus)}>
                          {statusLabels[item.effectiveStatus]}
                        </span>
                        <span className="tiny" style={{ color: "var(--text-3)" }}>
                          {statusDetailLabels[item.effectiveStatus]}
                        </span>
                      </div>
                    </td>
                    <td className="rm-host-member-ledger__num rm-host-member-ledger__time">{timestamp}</td>
                    <td className="rm-host-member-ledger__manage">
                      <div className="rm-host-member-ledger__actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={rowBusy || copyPendingId === item.invitationId}
                          aria-label={`${item.email} 복사`}
                          onClick={() => void copyEmail(item)}
                        >
                          복사
                        </button>
                        {item.canReissue ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={rowBusy}
                            aria-label={`${item.email} 재발송`}
                            onClick={() => void handleReissue(item)}
                          >
                            재발송
                          </button>
                        ) : null}
                        {item.canRevoke ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={rowBusy}
                            aria-label={`${item.email} 중지`}
                            onClick={() => void handleRevoke(item.invitationId)}
                          >
                            중지
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
