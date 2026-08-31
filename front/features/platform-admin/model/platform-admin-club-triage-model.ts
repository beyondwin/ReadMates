import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  clubLifecycleLabel,
  clubVisibilityLabel,
  hostOnboardingLabel,
} from "./admin-copy";
import { ADMIN_UNKNOWN_PRIMARY_TEXT } from "./admin-status-language";

export type ClubTriageSeverity = "critical" | "attention" | "ok";
export type ClubTriageFilter = ClubTriageSeverity | "all";

export type ClubManagementRow = Readonly<{
  name: string;
  currentState: string;
  requiredAction: string | null;
  recentSignal: string | null;
  emphasis: "quiet" | "actionable";
  technicalDisclosure: readonly Readonly<{
    label: string;
    value: string;
  }>[];
}>;

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
  if (club.notificationFailureCount > 0) {
    reasons.push(`알림 실패 ${club.notificationFailureCount}건`);
  }
  if (club.aiFailureCount > 0) {
    reasons.push(`AI 실패 ${club.aiFailureCount}건`);
  }
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
  if (
    club.notificationFailureCount > 0 ||
    club.aiFailureCount > 0 ||
    club.domainActionRequiredCount > 0 ||
    club.status === "SUSPENDED" ||
    club.status === "ARCHIVED"
  ) {
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

export function buildClubManagementRow(club: PlatformAdminClub): ClubManagementRow {
  const lifecycle = clubLifecycleLabel(club.status);
  const visibility = clubVisibilityLabel(club.publicVisibility);
  const onboarding = hostOnboardingLabel(club.firstHostOnboardingState);
  const reasons = clubTriageReasons(club);
  const requiredAction = clubRequiredAction({
    club,
    lifecycle,
    visibility,
    onboarding,
  });

  return {
    name: club.name,
    currentState: `${lifecycle} · ${visibility}`,
    requiredAction,
    recentSignal: reasons.length > 0 ? reasons.join(" · ") : null,
    emphasis: requiredAction ? "actionable" : "quiet",
    technicalDisclosure: [
      { label: "클럽 ID", value: club.clubId },
      { label: "Slug", value: club.slug },
      { label: "수명주기 값", value: club.status },
      { label: "공개 상태 값", value: club.publicVisibility },
      { label: "호스트 준비 값", value: club.firstHostOnboardingState },
      { label: "도메인 수", value: String(club.domainCount) },
      { label: "도메인 조치 수", value: String(club.domainActionRequiredCount) },
    ],
  };
}

function clubRequiredAction({
  club,
  lifecycle,
  visibility,
  onboarding,
}: {
  club: PlatformAdminClub;
  lifecycle: string;
  visibility: string;
  onboarding: string;
}): string | null {
  if (
    lifecycle === ADMIN_UNKNOWN_PRIMARY_TEXT ||
    visibility === ADMIN_UNKNOWN_PRIMARY_TEXT ||
    onboarding === ADMIN_UNKNOWN_PRIMARY_TEXT
  ) {
    return "상태 확인";
  }
  if (club.notificationFailureCount > 0 || club.aiFailureCount > 0) {
    return "실패 신호 확인";
  }
  if (club.domainActionRequiredCount > 0) {
    return "도메인 상태 확인";
  }
  if (club.status === "SUSPENDED" || club.status === "ARCHIVED") {
    return "상태 확인";
  }
  if (club.status === "SETUP_REQUIRED" || club.firstHostOnboardingState !== "ASSIGNED") {
    return "운영 준비 확인";
  }
  return null;
}
