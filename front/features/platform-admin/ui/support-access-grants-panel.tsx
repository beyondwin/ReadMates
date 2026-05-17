import { useState } from "react";
import type { PlatformAdminSelectedClubBrief } from "@/features/platform-admin/model/platform-admin-workbench-model";

type SupportAccessGrantScope = "METADATA_READ" | "HOST_SUPPORT_READ";

export type SupportAccessGrantView = {
  id: string;
  clubId: string;
  grantedByUserId: string;
  granteeUserId: string;
  scope: SupportAccessGrantScope;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateSupportAccessGrantFields = {
  granteeUserId: string;
  scope: SupportAccessGrantScope;
  reason: string;
  expiresAt: string;
};

type SupportAccessGrantsPanelProps = {
  selectedClub: PlatformAdminSelectedClubBrief;
  grants: SupportAccessGrantView[];
  loading?: boolean;
  loadError?: string | null;
  canCreateGrant?: boolean;
  canRevokeGrant?: boolean;
  onCreateGrant?: (fields: CreateSupportAccessGrantFields) => Promise<void>;
  onRevokeGrant?: (grantId: string) => Promise<void>;
};

function defaultExpiresAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function SupportAccessGrantsPanel({
  selectedClub,
  grants,
  loading = false,
  loadError = null,
  canCreateGrant = false,
  canRevokeGrant = false,
  onCreateGrant,
  onRevokeGrant,
}: SupportAccessGrantsPanelProps) {
  const [granteeUserId, setGranteeUserId] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokingIds, setRevokingIds] = useState<ReadonlySet<string>>(new Set());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !expiresAt || !onCreateGrant) return;

    setCreating(true);
    setCreateError(null);
    try {
      await onCreateGrant({
        granteeUserId: granteeUserId.trim(),
        scope: "HOST_SUPPORT_READ",
        reason: reason.trim(),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      setGranteeUserId("");
      setReason("");
      setExpiresAt(defaultExpiresAt());
    } catch {
      setCreateError("지원 접근 권한 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(grantId: string) {
    if (!onRevokeGrant) return;
    setRevokingIds((current) => new Set(current).add(grantId));
    try {
      await onRevokeGrant(grantId);
    } catch {
      // revoke failure is silent — the grant stays in the list
    } finally {
      setRevokingIds((current) => {
        const next = new Set(current);
        next.delete(grantId);
        return next;
      });
    }
  }

  const submitDisabled = creating || !onCreateGrant || !canCreateGrant;

  return (
    <section className="platform-admin-support-grants" aria-labelledby="support-grants-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Support access</p>
          <h3 id="support-grants-title" className="h4 editorial">
            긴급 지원 접근 권한
          </h3>
          <p className="tiny muted">
            대상 클럽: {selectedClub.name} ({selectedClub.slug})
          </p>
        </div>
      </div>

      <form className="platform-admin-support-grants__form" onSubmit={handleCreate} aria-label="지원 접근 권한 생성">
        <div className="platform-admin-support-grants__fields">
          <label className="field-group">
            <span className="label">Grantee User ID</span>
            <input
              className="input"
              type="text"
              value={granteeUserId}
              onChange={(e) => setGranteeUserId(e.target.value)}
              required
              placeholder="사용자 UUID"
            />
          </label>
          <label className="field-group">
            <span className="label">사유 (reason)</span>
            <input
              className="input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="예: 고객 에스컬레이션 티켓 #1234"
            />
          </label>
          <label className="field-group">
            <span className="label">만료 시각 (expiresAt)</span>
            <input
              className="input"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              required
            />
          </label>
        </div>
        {createError ? <p className="tiny danger">{createError}</p> : null}
        {!canCreateGrant ? (
          <p className="tiny muted">현재 역할은 지원 접근 권한을 생성할 수 없습니다.</p>
        ) : null}
        <button type="submit" className="btn btn-ghost btn-sm" disabled={submitDisabled}>
          {creating ? "생성 중…" : "권한 생성"}
        </button>
      </form>

      {loadError ? <p className="tiny danger">{loadError}</p> : null}
      {loading ? <p className="tiny muted">지원 접근 권한을 불러오는 중…</p> : null}

      {grants.length > 0 ? (
        <div className="platform-admin-domain-list">
          {grants.map((grant) => (
            <SupportAccessGrantRow
              key={grant.id}
              grant={grant}
              isRevoking={revokingIds.has(grant.id)}
              onRevoke={onRevokeGrant && canRevokeGrant ? handleRevoke : undefined}
            />
          ))}
        </div>
      ) : !loading && !loadError ? (
        <p className="muted platform-admin-domain-empty">활성 지원 접근 권한이 없습니다.</p>
      ) : null}
    </section>
  );
}

function SupportAccessGrantRow({
  grant,
  isRevoking,
  onRevoke,
}: {
  grant: SupportAccessGrantView;
  isRevoking: boolean;
  onRevoke?: (grantId: string) => void;
}) {
  return (
    <article className="surface platform-admin-domain-row">
      <div className="platform-admin-domain-row__main">
        <p className="platform-admin-domain-row__hostname">{grant.clubId}</p>
        <p className="tiny muted">
          grantee: {grant.granteeUserId} · scope: {grant.scope} · expires:{" "}
          {new Date(grant.expiresAt).toLocaleString("ko-KR")}
        </p>
        <p className="tiny muted">
          <span>사유: </span>
          <span>{grant.reason}</span>
        </p>
      </div>
      {onRevoke ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm platform-admin-domain-row__check"
          onClick={() => onRevoke(grant.id)}
          disabled={isRevoking}
        >
          {isRevoking ? "취소 중…" : "권한 취소"}
        </button>
      ) : null}
    </article>
  );
}
