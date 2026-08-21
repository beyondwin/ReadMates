import type { SessionState } from "@/shared/model/readmates-types";

export type SessionAccessScope = "HOST_ONLY" | "GUEST_READABLE";
export type PublicSiteVisibility = "HIDDEN" | "PUBLIC_RECORD";
export type CompatibilitySessionVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

export type SessionExposure = {
  accessScope: SessionAccessScope;
  siteVisibility: PublicSiteVisibility;
};

export const compatibilityExposureLabel = {
  HOST_ONLY: "호스트 전용",
  MEMBER: "게스트 공개",
  PUBLIC: "게스트 공개 · 공개 기록에 게시",
} as const satisfies Record<CompatibilitySessionVisibility, string>;

export const sessionAccessScopeCopy: Record<SessionAccessScope, { label: string; helper: string }> = {
  HOST_ONLY: { label: "호스트만 보기", helper: "게스트와 멤버 화면에는 표시하지 않습니다." },
  GUEST_READABLE: { label: "게스트와 멤버에게 보이기", helper: "초대된 클럽의 게스트와 로그인 멤버가 읽을 수 있습니다." },
};

export function sessionExposureCopy(
  accessScope: SessionAccessScope,
  siteVisibility: PublicSiteVisibility,
) {
  return {
    accessLabel: sessionAccessScopeCopy[accessScope].label,
    siteLabel: siteVisibility === "PUBLIC_RECORD" ? "공개 기록에 게시" : "공개 기록에 게시 안 함",
  };
}

export function sessionExposureFromCompatibility(
  state: SessionState,
  visibility: CompatibilitySessionVisibility,
): SessionExposure {
  const accessScope: SessionAccessScope = visibility === "HOST_ONLY" ? "HOST_ONLY" : "GUEST_READABLE";
  return {
    accessScope,
    siteVisibility: accessScope === "GUEST_READABLE"
      && visibility === "PUBLIC"
      && (state === "CLOSED" || state === "PUBLISHED")
      ? "PUBLIC_RECORD"
      : "HIDDEN",
  };
}

export function resolvedSessionExposure(input: {
  state: SessionState;
  visibility: CompatibilitySessionVisibility;
  accessScope?: SessionAccessScope;
  siteVisibility?: PublicSiteVisibility;
}): SessionExposure {
  const compatibility = sessionExposureFromCompatibility(input.state, input.visibility);
  const canonical = input.accessScope !== undefined && input.siteVisibility !== undefined
    ? { accessScope: input.accessScope, siteVisibility: input.siteVisibility }
    : compatibility;
  return {
    accessScope: canonical.accessScope,
    siteVisibility: canonical.accessScope === "GUEST_READABLE"
      && (input.state === "CLOSED" || input.state === "PUBLISHED")
      ? canonical.siteVisibility
      : "HIDDEN",
  };
}

export function compatibilityVisibilityForExposure(
  accessScope: SessionAccessScope,
  siteVisibility: PublicSiteVisibility,
): CompatibilitySessionVisibility {
  if (accessScope === "HOST_ONLY") return "HOST_ONLY";
  return siteVisibility === "PUBLIC_RECORD" ? "PUBLIC" : "MEMBER";
}

export function buildSessionAccessScopeRequest(accessScope: SessionAccessScope) {
  return { accessScope };
}

export function buildSessionPublicationRequest(
  publicSummary: string,
  siteVisibility: PublicSiteVisibility,
) {
  return { publicSummary, siteVisibility };
}
