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

export function sessionExposureCopy(
  accessScope: SessionAccessScope,
  siteVisibility: PublicSiteVisibility,
) {
  return {
    accessLabel: accessScope === "HOST_ONLY" ? "호스트 전용" : "게스트 공개",
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
  return {
    accessScope: input.accessScope ?? compatibility.accessScope,
    siteVisibility: input.siteVisibility ?? compatibility.siteVisibility,
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
