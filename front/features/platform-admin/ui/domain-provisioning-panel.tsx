import { useRef, useState } from "react";
import {
  adminCommandRecovery,
  type AdminCommandRecovery,
} from "@/features/platform-admin/model/platform-admin-command-recovery";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";

type DomainKind = "SUBDOMAIN" | "CUSTOM_DOMAIN";
type DomainStatus =
  | "REQUESTED"
  | "ACTION_REQUIRED"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

export type DomainProvisioningItem = {
  id: string;
  hostname: string;
  kind: DomainKind;
  status: DomainStatus;
  desiredState: "ENABLED" | "DISABLED";
  errorCode: string | null;
};

export type DomainProvisioningPreview = {
  previewId: string;
  expiresAt: string;
  kind: DomainKind;
  isPrimary: boolean;
  impactCodes: string[];
  requestFingerprintPrefix: string;
};

export type DomainProvisioningReceipt = {
  receiptId: string;
  resultCode: string;
  convergenceState: "PENDING" | "SUCCEEDED" | "FAILED" | null;
};

type DomainPreviewRequest = {
  expectedAdminRevision: number;
  hostname: string;
  kind: DomainKind;
  isPrimary: boolean;
};

type DomainConfirmRequest = DomainPreviewRequest & {
  previewId: string;
  idempotencyKey: string;
  confirmed: boolean;
};

type DomainRecheckRequest = {
  idempotencyKey: string;
  expectedStatus: DomainStatus;
};

type AdminClubDomainCommandPanelProps = {
  revision: number;
  domains: DomainProvisioningItem[];
  canManageDomains: boolean;
  previewPending: boolean;
  confirmPending: boolean;
  recheckPending: boolean;
  onRefresh: () => void;
  onPreview: (
    request: DomainPreviewRequest,
  ) => Promise<DomainProvisioningPreview>;
  onConfirm: (
    request: DomainConfirmRequest,
  ) => Promise<DomainProvisioningReceipt>;
  onRecheck: (
    domainId: string,
    request: DomainRecheckRequest,
  ) => Promise<DomainProvisioningReceipt>;
};

export function AdminClubDomainCommandPanel(
  props: AdminClubDomainCommandPanelProps,
) {
  return (
    <AdminClubDomainCommandPanelInner
      key={props.canManageDomains ? "manage" : "view"}
      {...props}
    />
  );
}

function AdminClubDomainCommandPanelInner({
  revision,
  domains,
  canManageDomains,
  previewPending,
  confirmPending,
  recheckPending,
  onRefresh,
  onPreview,
  onConfirm,
  onRecheck,
}: AdminClubDomainCommandPanelProps) {
  const [draft, setDraft] = useState<{
    hostname: string;
    kind: DomainKind;
    isPrimary: boolean;
  }>({ hostname: "", kind: "CUSTOM_DOMAIN", isPrimary: false });
  const [preview, setPreview] = useState<DomainProvisioningPreview | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DomainProvisioningReceipt | null>(
    null,
  );
  const [recovery, setRecovery] = useState<AdminCommandRecovery | null>(null);
  const [confirmInFlight, setConfirmInFlight] = useState(false);
  const draftEpoch = useRef(0);
  const recheckIntentKeys = useRef(new Map<string, string>());
  const draftLocked = confirmPending || confirmInFlight;

  function purgeCommandState() {
    draftEpoch.current += 1;
    recheckIntentKeys.current.clear();
    setDraft({ hostname: "", kind: "CUSTOM_DOMAIN", isPrimary: false });
    setPreview(null);
    setConfirmed(false);
    setIntentKey(null);
    setReceipt(null);
    setRecovery(null);
    setConfirmInFlight(false);
  }

  function updateDraft(next: typeof draft) {
    draftEpoch.current += 1;
    setDraft(next);
    setPreview(null);
    setConfirmed(false);
    setIntentKey(null);
    setReceipt(null);
    setRecovery(null);
  }
  async function previewIntent() {
    const epoch = draftEpoch.current;
    const request = {
      expectedAdminRevision: revision,
      ...draft,
    };
    setRecovery(null);
    try {
      const next = await onPreview(request);
      if (draftEpoch.current !== epoch) return;
      setPreview(next);
      setConfirmed(false);
      setIntentKey(crypto.randomUUID());
      setReceipt(null);
    } catch (error) {
      if (draftEpoch.current !== epoch) return;
      if (isAuthorityLossError(error)) {
        purgeCommandState();
        return;
      }
      setRecovery(adminCommandRecovery(error));
    }
  }
  async function confirmIntent() {
    if (!preview || !intentKey) return;
    const epoch = draftEpoch.current;
    const command = {
      previewId: preview.previewId,
      idempotencyKey: intentKey,
      expectedAdminRevision: revision,
      ...draft,
      confirmed: true,
    };
    setConfirmInFlight(true);
    try {
      const next = await onConfirm(command);
      if (draftEpoch.current !== epoch) return;
      setReceipt(next);
      setRecovery(null);
    } catch (error) {
      if (draftEpoch.current !== epoch) return;
      if (isAuthorityLossError(error)) {
        purgeCommandState();
        return;
      }
      const nextRecovery = adminCommandRecovery(error);
      setRecovery(nextRecovery);
      if (
        nextRecovery.kind === "RESTART_PREVIEW" ||
        nextRecovery.kind === "RESTART_INTENT" ||
        nextRecovery.kind === "REFRESH_STATE" ||
        nextRecovery.kind === "CORRECT_DRAFT"
      ) {
        setPreview(null);
        setConfirmed(false);
        setIntentKey(null);
      }
      if (nextRecovery.kind === "REFRESH_STATE") onRefresh();
    } finally {
      setConfirmInFlight(false);
    }
  }
  async function recheck(domain: DomainProvisioningItem) {
    const intentKey =
      recheckIntentKeys.current.get(domain.id) ?? crypto.randomUUID();
    recheckIntentKeys.current.set(domain.id, intentKey);
    try {
      const next = await onRecheck(domain.id, {
        idempotencyKey: intentKey,
        expectedStatus: domain.status,
      });
      setReceipt(next);
      recheckIntentKeys.current.delete(domain.id);
      setRecovery(null);
    } catch (error) {
      if (isAuthorityLossError(error)) {
        purgeCommandState();
        return;
      }
      const nextRecovery = adminCommandRecovery(error);
      setRecovery(nextRecovery);
      if (nextRecovery.kind !== "RETRY_SAME_INTENT") {
        recheckIntentKeys.current.delete(domain.id);
      }
    }
  }

  return (
    <section
      className="surface admin-club-detail__panel admin-club-domains"
      aria-labelledby="platform-admin-domains-title"
    >
      <div className="admin-club-detail__panel-heading">
        <div>
          <p className="eyebrow">{ADMIN_COPY.eyebrow.domainProvisioning}</p>
          <h2 id="platform-admin-domains-title" className="h3 editorial">
            도메인
          </h2>
        </div>
        <span className="admin-club-detail__state">{domains.length}개</span>
      </div>
      {domains.length > 0 ? (
        <div className="admin-club-domains__list">
          {domains.map((domain) => (
            <article className="admin-club-domains__row" key={domain.id}>
              <div>
                <strong>{domain.hostname}</strong>
                <p className="tiny muted">
                  {domain.kind} · {domain.desiredState}
                </p>
              </div>
              <div>
                <span className="platform-admin-domain-status">
                  {domain.status}
                </span>
                {domain.errorCode ? (
                  <p className="tiny danger">{domain.errorCode}</p>
                ) : null}
              </div>
              {canManageDomains &&
              domain.status !== "ACTIVE" &&
              domain.status !== "DISABLED" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={recheckPending}
                  onClick={() => void recheck(domain)}
                  aria-label={`상태 다시 확인: ${domain.hostname}`}
                >
                  상태 다시 확인
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">등록된 도메인이 없습니다.</p>
      )}
      {canManageDomains ? (
        <div className="admin-club-domains__create">
          <h3 className="h4">도메인 추가</h3>
          <div className="admin-club-detail__form">
            <label className="field-group">
              <span className="label">Hostname</span>
              <input
                className="input"
                value={draft.hostname}
                disabled={draftLocked}
                onChange={(event) =>
                  updateDraft({ ...draft, hostname: event.target.value })
                }
              />
            </label>
            <label className="field-group">
              <span className="label">종류</span>
              <select
                className="input"
                value={draft.kind}
                disabled={draftLocked}
                onChange={(event) => {
                  updateDraft({
                    ...draft,
                    kind:
                      event.target.value === "SUBDOMAIN"
                        ? "SUBDOMAIN"
                        : "CUSTOM_DOMAIN",
                  });
                }}
              >
                <option value="CUSTOM_DOMAIN">Custom domain</option>
                <option value="SUBDOMAIN">ReadMates subdomain</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                disabled={draftLocked}
                onChange={(event) => {
                  updateDraft({ ...draft, isPrimary: event.target.checked });
                }}
              />
              <span>기본 도메인</span>
            </label>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!draft.hostname || previewPending || draftLocked}
            onClick={() => void previewIntent()}
          >
            도메인 추가 미리보기
          </button>
          {preview ? (
            <div className="admin-club-detail__review" aria-live="polite">
              <p>
                <strong>
                  {preview.kind}
                  {preview.isPrimary ? " · primary" : ""}
                </strong>
              </p>
              <ul>
                {preview.impactCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <p className="tiny muted">
                만료 {preview.expiresAt} · 확인 코드{" "}
                {preview.requestFingerprintPrefix}
              </p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={receipt !== null || draftLocked}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>도메인 영향을 확인했습니다</span>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!confirmed || draftLocked || receipt !== null}
                onClick={() => void confirmIntent()}
              >
                도메인 추가 확정
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {canManageDomains && recovery ? (
        <div className="danger" role="alert">
          <p>{recovery.message}</p>
          {recovery.kind === "REFRESH_STATE" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRefresh}
            >
              최신 상태 불러오기
            </button>
          ) : null}
        </div>
      ) : null}
      {canManageDomains && receipt ? (
        <div className="admin-club-detail__receipt" aria-live="polite">
          <strong>{ADMIN_COPY.receipt} — 명령 접수</strong>
          <span>receipt {receipt.receiptId}</span>
          <span>
            {receipt.resultCode}
            {receipt.convergenceState ? ` · ${receipt.convergenceState}` : ""}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function isAuthorityLossError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  return status === 401 || status === 403;
}
