import { useState } from "react";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";

export type PlatformAdminOnboardingRequest = {
  club: {
    name: string;
    slug: string;
    tagline: string;
    about: string;
  };
  firstHost: {
    email: string;
    name: string;
  };
  domain?: {
    hostname: string;
    kind: "SUBDOMAIN" | "CUSTOM_DOMAIN";
  };
  existingUserConfirmation?: string;
};

export type PlatformAdminOnboardingPreviewResponse = {
  club: {
    slug: string;
    available: boolean;
  };
  firstHost: {
    kind: "EXISTING_USER" | "NEW_USER";
    email: string;
    existingUserId: string | null;
    existingUserName: string | null;
    requiredConfirmation: string | null;
  };
  domain: null | {
    hostname: string;
    available: boolean;
  };
};

export type PlatformAdminOnboardingResultResponse = {
  club: PlatformAdminClubRegistryItem;
  hostOnboarding: {
    kind: "EXISTING_USER_ASSIGNED" | "INVITATION_CREATED";
    email: string;
    userId: string | null;
    invitationId: string | null;
    acceptUrl: string | null;
    emailDelivery: {
      status: "SENT" | "FAILED" | "SKIPPED";
    };
  };
  domain: null | {
    hostname: string;
    status: string;
  };
};

type Props = {
  onPreview: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingPreviewResponse>;
  onCommit: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingResultResponse>;
  onCreated?: (result: PlatformAdminOnboardingResultResponse) => void;
};

export function PlatformAdminOnboardingWizard({ onPreview, onCommit, onCreated }: Props) {
  const [request, setRequest] = useState<PlatformAdminOnboardingRequest>({
    club: { name: "", slug: "", tagline: "", about: "" },
    firstHost: { email: "", name: "" },
  });
  const [preview, setPreview] = useState<PlatformAdminOnboardingPreviewResponse | null>(null);
  const [confirmedExistingUser, setConfirmedExistingUser] = useState(false);
  const [result, setResult] = useState<PlatformAdminOnboardingResultResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const existingUserConfirmation =
    confirmedExistingUser && preview?.firstHost.requiredConfirmation ? preview.firstHost.requiredConfirmation : undefined;
  const canCommit =
    preview != null &&
    preview.club.available &&
    (preview.firstHost.kind !== "EXISTING_USER" || confirmedExistingUser);

  async function handlePreview() {
    setBusy(true);
    try {
      setPreview(await onPreview(request));
      setConfirmedExistingUser(false);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    try {
      const created = await onCommit({ ...request, existingUserConfirmation });
      setResult(created);
      onCreated?.(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="platform-admin-onboarding" aria-label="새 클럽 온보딩">
      <div className="platform-admin-onboarding__grid">
        <label className="field-group">
          <span className="label">클럽 이름</span>
          <input
            className="input"
            value={request.club.name}
            onChange={(event) => setRequest({ ...request, club: { ...request.club, name: event.target.value } })}
          />
        </label>
        <label className="field-group">
          <span className="label">Slug</span>
          <input
            className="input"
            value={request.club.slug}
            onChange={(event) => setRequest({ ...request, club: { ...request.club, slug: event.target.value } })}
          />
        </label>
        <label className="field-group">
          <span className="label">Tagline</span>
          <input
            className="input"
            value={request.club.tagline}
            onChange={(event) => setRequest({ ...request, club: { ...request.club, tagline: event.target.value } })}
          />
        </label>
        <label className="field-group">
          <span className="label">첫 호스트 이메일</span>
          <input
            className="input"
            value={request.firstHost.email}
            onChange={(event) => setRequest({ ...request, firstHost: { ...request.firstHost, email: event.target.value } })}
          />
        </label>
        <label className="field-group">
          <span className="label">첫 호스트 이름</span>
          <input
            className="input"
            value={request.firstHost.name}
            onChange={(event) => setRequest({ ...request, firstHost: { ...request.firstHost, name: event.target.value } })}
          />
        </label>
        <label className="field-group platform-admin-onboarding__about">
          <span className="label">About</span>
          <textarea
            className="input"
            value={request.club.about}
            onChange={(event) => setRequest({ ...request, club: { ...request.club, about: event.target.value } })}
          />
        </label>
      </div>

      {preview ? (
        <div className="platform-admin-onboarding__preview" aria-live="polite">
          <span className="platform-admin-domain-status">{preview.club.available ? "slug available" : "slug unavailable"}</span>
          <span className="tiny muted">{preview.firstHost.kind}</span>
        </div>
      ) : null}

      {preview?.firstHost.kind === "EXISTING_USER" ? (
        <div className="surface platform-admin-onboarding__confirmation">
          <p className="eyebrow">기존 사용자 확인 필요</p>
          <p className="body">{preview.firstHost.existingUserName} 계정에 이 클럽의 HOST 권한을 부여합니다.</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmedExistingUser}
              onChange={(event) => setConfirmedExistingUser(event.target.checked)}
            />
            <span>이 기존 사용자에게 HOST 권한을 부여합니다.</span>
          </label>
        </div>
      ) : null}

      {result ? (
        <div className="surface platform-admin-onboarding__result">
          <p className="eyebrow">생성 결과</p>
          <strong>{result.club.slug}</strong>
          <span>{result.hostOnboarding.kind}</span>
          <span>메일: {result.hostOnboarding.emailDelivery.status}</span>
          {result.domain ? <span>도메인: {result.domain.hostname} · {result.domain.status}</span> : null}
          {result.hostOnboarding.acceptUrl ? <code>{result.hostOnboarding.acceptUrl}</code> : null}
        </div>
      ) : null}

      <div className="platform-admin-onboarding__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handlePreview} disabled={busy}>
          미리 확인
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleCommit} disabled={busy || !canCommit}>
          {preview?.firstHost.kind === "EXISTING_USER" ? "기존 사용자에게 HOST 권한 부여" : "클럽 생성"}
        </button>
      </div>
    </section>
  );
}
