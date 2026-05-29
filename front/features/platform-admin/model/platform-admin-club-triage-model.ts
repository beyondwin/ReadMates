import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";

export type ClubTriageSeverity = "critical" | "attention" | "ok";
export type ClubTriageFilter = ClubTriageSeverity | "all";

const SEVERITY_RANK: Record<ClubTriageSeverity, number> = {
  critical: 0,
  attention: 1,
  ok: 2,
};

export const CLUB_TRIAGE_LABEL: Record<ClubTriageSeverity, string> = {
  critical: "긴급",
  attention: "주의",
  ok: "정상",
};

export function clubTriageReasons(club: PlatformAdminClub): string[] {
  const reasons: string[] = [];
  if (club.domainActionRequiredCount > 0) {
    reasons.push("도메인 조치 필요");
  }
  if (club.firstHostOnboardingState === "MISSING") {
    reasons.push("호스트 없음");
  } else if (club.firstHostOnboardingState === "INVITED") {
    reasons.push("호스트 초대 대기");
  }
  if (club.status === "SUSPENDED") {
    reasons.push("정지됨");
  } else if (club.status === "ARCHIVED") {
    reasons.push("보관됨");
  } else if (club.status === "SETUP_REQUIRED") {
    reasons.push("설정 미완료");
  }
  return reasons;
}

export function clubTriageSeverity(club: PlatformAdminClub): ClubTriageSeverity {
  if (club.domainActionRequiredCount > 0 || club.status === "SUSPENDED" || club.status === "ARCHIVED") {
    return "critical";
  }
  if (club.status === "SETUP_REQUIRED" || club.firstHostOnboardingState !== "ASSIGNED") {
    return "attention";
  }
  return "ok";
}

export function rankClubsByTriage(clubs: PlatformAdminClub[]): PlatformAdminClub[] {
  return [...clubs].sort(
    (a, b) => SEVERITY_RANK[clubTriageSeverity(a)] - SEVERITY_RANK[clubTriageSeverity(b)],
  );
}

export function filterClubsBySeverity(
  clubs: PlatformAdminClub[],
  filter: ClubTriageFilter,
): PlatformAdminClub[] {
  if (filter === "all") {
    return clubs;
  }
  return clubs.filter((club) => clubTriageSeverity(club) === filter);
}
