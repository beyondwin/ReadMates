import type { HostSecurityPurgeCode } from "@/shared/api/host-authority-event";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";

export type { HostSecurityPurgeCode } from "@/shared/api/host-authority-event";
export { isHostSecurityPurgeCode } from "@/shared/api/host-authority-event";

const messages: Record<HostSecurityPurgeCode, string> = {
  HOST_AUTHORITY_REVOKED: "이 모임의 호스트 권한이 해제되어 안전한 멤버 공간으로 이동했습니다.",
  MEMBERSHIP_SUSPENDED: "멤버십이 중지되어 호스트 작업 정보를 안전하게 정리했습니다.",
  CROSS_CLUB_SCOPE: "요청한 모임 범위가 달라 호스트 작업 정보를 안전하게 정리했습니다.",
};

export function hostAuthorityLossMessage(code: HostSecurityPurgeCode): string {
  return messages[code];
}

export function hostAuthoritySafeDestination(clubSlug: string): string {
  return `/clubs/${encodeURIComponent(clubSlug)}/app`;
}

export function requireHostClubContext(clubSlug: string | undefined): ExplicitReadmatesApiContext {
  if (!clubSlug) throw new Error("HOST_API_CONTEXT_REQUIRED");
  return { clubSlug };
}
