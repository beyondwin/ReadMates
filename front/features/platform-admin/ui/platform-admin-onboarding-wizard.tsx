import { useEffect, useRef, useState } from "react";
import {
  adminCommandRecovery,
  type AdminCommandRecovery,
} from "@/features/platform-admin/model/platform-admin-command-recovery";

export type PlatformAdminOnboardingDraft = {
  club: { name: string; slug: string; tagline: string; about: string };
  firstHost: { email: string; name: string };
  domain?: { hostname: string; kind: "SUBDOMAIN" | "CUSTOM_DOMAIN" };
};

export type PlatformAdminOnboardingConfirmIntent =
  PlatformAdminOnboardingDraft & {
    previewId: string;
    idempotencyKey: string;
    existingUserConfirmation?: string;
    confirmed: boolean;
  };

export type PlatformAdminOnboardingPreviewView = {
  previewId: string;
  expiresAt: string;
  clubSlug: string;
  firstHostKind: "EXISTING_USER" | "NEW_USER";
  requiredConfirmation: string | null;
  impactCodes: string[];
  prerequisiteCodes: string[];
  requestFingerprintPrefix: string;
};

export type PlatformAdminOnboardingResultView = {
  receiptId: string;
  club: { clubId: string; name: string };
  originStatus: "SUCCEEDED";
  firstHostKind: "EXISTING_USER_ASSIGNED" | "INVITATION_CREATED";
  invitationDelivery: "NOT_REQUIRED" | "PENDING" | "SUCCEEDED" | "FAILED";
};

type Props = {
  enabled?: boolean;
  onPreview: (
    request: PlatformAdminOnboardingDraft,
  ) => Promise<PlatformAdminOnboardingPreviewView>;
  onCommit: (
    request: PlatformAdminOnboardingConfirmIntent,
  ) => Promise<PlatformAdminOnboardingResultView>;
  onViewClub?: (clubId: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onEffectPendingChange?: (isPending: boolean) => void;
};

const EMPTY_REQUEST: PlatformAdminOnboardingDraft = {
  club: { name: "", slug: "", tagline: "", about: "" },
  firstHost: { email: "", name: "" },
};
const BLOCKING_PREREQUISITES = new Set([
  "CLUB_SLUG_CONFLICT",
  "CLUB_DOMAIN_CONFLICT",
]);

export function PlatformAdminOnboardingWizard({
  enabled = true,
  onPreview,
  onCommit,
  onViewClub,
  onDirtyChange,
  onEffectPendingChange,
}: Props) {
  const [request, setRequest] =
    useState<PlatformAdminOnboardingDraft>(EMPTY_REQUEST);
  const [preview, setPreview] =
    useState<PlatformAdminOnboardingPreviewView | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [result, setResult] =
    useState<PlatformAdminOnboardingResultView | null>(null);
  const [recovery, setRecovery] = useState<AdminCommandRecovery | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [effectPending, setEffectPending] = useState(false);
  const requestEpoch = useRef(0);
  const isDirty = JSON.stringify(request) !== JSON.stringify(EMPTY_REQUEST);
  const hasBlockingPrerequisite =
    preview?.prerequisiteCodes.some((code) =>
      BLOCKING_PREREQUISITES.has(code),
    ) ?? false;
  const confirmationPhraseMatches =
    preview?.requiredConfirmation == null ||
    confirmationPhrase.trim() === preview.requiredConfirmation;
  const busy = previewPending || effectPending;
  useEffect(
    () => onDirtyChange?.(isDirty && result === null),
    [isDirty, onDirtyChange, result],
  );
  const [authorityArmed, setAuthorityArmed] = useState(enabled);

  function purgeOnboardingState() {
    requestEpoch.current += 1;
    setRequest(EMPTY_REQUEST);
    setPreview(null);
    setConfirmed(false);
    setConfirmationPhrase("");
    setIntentKey(null);
    setResult(null);
    setRecovery(null);
    setPreviewPending(false);
    setEffectPending(false);
  }

  if (!enabled && authorityArmed) {
    setAuthorityArmed(false);
    setRequest(EMPTY_REQUEST);
    setPreview(null);
    setConfirmed(false);
    setConfirmationPhrase("");
    setIntentKey(null);
    setResult(null);
    setRecovery(null);
    setPreviewPending(false);
    setEffectPending(false);
  } else if (enabled && !authorityArmed) {
    setAuthorityArmed(true);
  }

  useEffect(() => {
    if (enabled) return;
    requestEpoch.current += 1;
  }, [enabled]);

  function update(next: PlatformAdminOnboardingDraft) {
    requestEpoch.current += 1;
    setRequest(next);
    setPreview(null);
    setConfirmed(false);
    setConfirmationPhrase("");
    setIntentKey(null);
    setResult(null);
    setRecovery(null);
  }
  async function handlePreview() {
    const epoch = requestEpoch.current;
    const previewRequest = request;
    setPreviewPending(true);
    setRecovery(null);
    try {
      const next = await onPreview(previewRequest);
      if (requestEpoch.current !== epoch) return;
      setPreview(next);
      setConfirmed(false);
      setConfirmationPhrase("");
      setIntentKey(crypto.randomUUID());
    } catch (error) {
      if (requestEpoch.current !== epoch) return;
      if (isAuthorityLossError(error)) {
        purgeOnboardingState();
        return;
      }
      setRecovery(adminCommandRecovery(error));
    } finally {
      setPreviewPending(false);
    }
  }
  async function handleCommit(refreshDelivery = false) {
    if (!preview || !intentKey || hasBlockingPrerequisite) return;
    if (result && !refreshDelivery) return;
    const command = {
      previewId: preview.previewId,
      idempotencyKey: intentKey,
      ...request,
      existingUserConfirmation: confirmationPhrase.trim() || undefined,
      confirmed: true,
    };
    setEffectPending(true);
    onEffectPendingChange?.(true);
    setRecovery(null);
    try {
      const created = await onCommit(command);
      setResult(created);
    } catch (error) {
      if (isAuthorityLossError(error)) {
        purgeOnboardingState();
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
        setConfirmationPhrase("");
        setIntentKey(null);
      }
    } finally {
      setEffectPending(false);
      onEffectPendingChange?.(false);
    }
  }

  return (
    <section className="platform-admin-onboarding" aria-label="새 클럽 온보딩">
      <div className="platform-admin-onboarding__intro">
        <p className="eyebrow">Durable onboarding</p>
        <p className="body">
          먼저 정규화된 영향만 확인합니다. 생성 결과는 receipt와 전달 상태로
          다시 확인할 수 있습니다.
        </p>
      </div>
      <div className="platform-admin-onboarding__grid">
        <Field
          label="클럽 이름"
          value={request.club.name}
          onChange={(value) =>
            update({ ...request, club: { ...request.club, name: value } })
          }
          disabled={effectPending}
        />
        <Field
          label="Slug"
          value={request.club.slug}
          onChange={(value) =>
            update({ ...request, club: { ...request.club, slug: value } })
          }
          disabled={effectPending}
        />
        <Field
          label="Tagline"
          value={request.club.tagline}
          onChange={(value) =>
            update({ ...request, club: { ...request.club, tagline: value } })
          }
          disabled={effectPending}
        />
        <Field
          label="첫 호스트 이메일"
          value={request.firstHost.email}
          onChange={(value) =>
            update({
              ...request,
              firstHost: { ...request.firstHost, email: value },
            })
          }
          disabled={effectPending}
        />
        <Field
          label="첫 호스트 이름"
          value={request.firstHost.name}
          onChange={(value) =>
            update({
              ...request,
              firstHost: { ...request.firstHost, name: value },
            })
          }
          disabled={effectPending}
        />
        <label className="field-group platform-admin-onboarding__about">
          <span className="label">About</span>
          <textarea
            className="input"
            value={request.club.about}
            disabled={effectPending}
            onChange={(event) =>
              update({
                ...request,
                club: { ...request.club, about: event.target.value },
              })
            }
          />
        </label>
      </div>
      {preview ? (
        <div
          className="surface platform-admin-onboarding__preview"
          aria-live="polite"
        >
          <div>
            <p className="eyebrow">미리보기</p>
            <strong>{preview.clubSlug}</strong>
            <p className="tiny muted">첫 호스트 {preview.firstHostKind}</p>
          </div>
          <ul>
            {preview.impactCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          {preview.prerequisiteCodes.length > 0 ? (
            <p className="tiny muted">
              {preview.prerequisiteCodes.join(" · ")}
            </p>
          ) : null}
          {hasBlockingPrerequisite ? (
            <p className="tiny danger" role="alert">
              slug 또는 도메인 중복을 해결한 뒤 다시 미리 확인해 주세요.
            </p>
          ) : null}
          {preview.requiredConfirmation ? (
            <div className="platform-admin-onboarding__confirmation">
              <p className="tiny muted">
                기존 사용자에게 HOST 권한을 부여하려면 아래 문구를 직접 입력해
                주세요.
              </p>
              <code>{preview.requiredConfirmation}</code>
              <label className="field-group">
                <span className="label">확인 문구</span>
                <input
                  className="input"
                  value={confirmationPhrase}
                  disabled={effectPending}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) =>
                    setConfirmationPhrase(event.target.value)
                  }
                />
              </label>
            </div>
          ) : null}
          <p className="tiny muted">
            만료 {preview.expiresAt} · 확인 코드{" "}
            {preview.requestFingerprintPrefix}
          </p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                hasBlockingPrerequisite || result !== null || effectPending
              }
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>온보딩 영향을 확인했습니다</span>
          </label>
        </div>
      ) : null}
      {recovery ? (
        <div role="alert" className="surface platform-admin-onboarding__error">
          <strong>명령을 이어서 확인해야 합니다.</strong>
          <p className="tiny muted">{recovery.message}</p>
        </div>
      ) : null}
      {result ? (
        <div
          className="surface platform-admin-onboarding__result"
          aria-live="polite"
        >
          <p className="eyebrow">생성 결과</p>
          <strong>{result.club.name}</strong>
          <span>receipt {result.receiptId}</span>
          <span>origin {result.originStatus}</span>
          <span>첫 호스트 {result.firstHostKind}</span>
          <span>초대 전달 {result.invitationDelivery}</span>
          {onViewClub ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onViewClub(result.club.clubId)}
            >
              생성된 클럽 상세로 이동
            </button>
          ) : null}
          {result.invitationDelivery === "PENDING" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void handleCommit(true)}
            >
              전달 상태 새로고침
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="platform-admin-onboarding__actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handlePreview()}
          disabled={
            busy ||
            !request.club.name.trim() ||
            !request.club.slug.trim() ||
            !request.club.tagline.trim() ||
            !request.club.about.trim() ||
            !request.firstHost.email.trim() ||
            !request.firstHost.name.trim()
          }
        >
          미리 확인
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void handleCommit()}
          disabled={
            busy ||
            !preview ||
            !confirmed ||
            hasBlockingPrerequisite ||
            !confirmationPhraseMatches ||
            result !== null
          }
        >
          클럽 생성 확정
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-group">
      <span className="label">{label}</span>
      <input
        className="input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function isAuthorityLossError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  return status === 401 || status === 403;
}
