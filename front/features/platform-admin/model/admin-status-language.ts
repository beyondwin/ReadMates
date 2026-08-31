export const ADMIN_UNKNOWN_PRIMARY_TEXT = "확인 필요";

export type AdminSemanticLanguage = Readonly<{
  primaryText: string;
  technicalDisclosure: Readonly<{
    label: "기술 값";
    value: string;
  }> | null;
}>;

const NAVIGATION_LABELS = {
  today: "오늘 할 일",
  clubs: "클럽 관리",
  service: "서비스 상태",
  records: "처리 기록",
  emergency: "긴급 공개 회수",
} as const;

const CASE_LIFECYCLE_LABELS = {
  OPEN: "확인 전",
  ACKNOWLEDGED: "확인함",
  SNOOZED: "잠시 미룸",
  RESOLVED: "처리함",
} as const;

const PLATFORM_ROLE_LABELS = {
  OWNER: "소유자",
  OPERATOR: "운영자",
  SUPPORT: "지원 담당",
} as const;

const AUDIT_ACTOR_ROLE_LABELS = {
  ...PLATFORM_ROLE_LABELS,
  HOST: "호스트",
  MEMBER: "멤버",
  SYSTEM: "시스템",
  UNKNOWN: ADMIN_UNKNOWN_PRIMARY_TEXT,
} as const;

const AUDIT_OUTCOME_LABELS = {
  SUCCESS: "완료",
  FAILED: "실패",
  DENIED: "차단됨",
  PREPARED: "실행 전 준비됨",
  UNKNOWN: "결과 확인 필요",
} as const;

const HEALTH_AVAILABILITY_LABELS = {
  AVAILABLE: "확인 가능",
  PARTIAL: "일부 확인 불가",
  UNAVAILABLE: "확인 불가",
  DISABLED: "사용 안 함",
} as const;

const HEALTH_FRESHNESS_LABELS = {
  FRESH: "최신",
  REFRESHING: "갱신 중",
  STALE: "오래됨",
  UNAVAILABLE: "확인 불가",
} as const;

const SUPPORT_COMMAND_OUTCOME_LABELS = {
  SUCCEEDED: "완료",
  PARTIAL: "일부 처리됨",
  FAILED: "실패",
} as const;

const SUPPORT_RECEIPT_STATUS_LABELS = {
  ABSENT: "없음",
  ACTIVE: "활성",
  EXPIRING: "만료 임박",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
} as const;

const DOMAIN_STATUS_LABELS = {
  REQUESTED: "요청됨",
  ACTION_REQUIRED: "조치 필요",
  PROVISIONING: "준비 중",
  ACTIVE: "활성",
  FAILED: "실패",
  DISABLED: "사용 안 함",
} as const;

export function adminNavigationLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, NAVIGATION_LABELS);
}

export function adminCaseLifecycleLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, CASE_LIFECYCLE_LABELS);
}

export function adminPlatformRoleLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, PLATFORM_ROLE_LABELS);
}

export function adminAuditActorRoleLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, AUDIT_ACTOR_ROLE_LABELS);
}

export function adminAuditOutcomeLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, AUDIT_OUTCOME_LABELS);
}

export function adminHealthAvailabilityLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, HEALTH_AVAILABILITY_LABELS);
}

export function adminHealthFreshnessLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, HEALTH_FRESHNESS_LABELS);
}

export function adminSupportCommandOutcomeLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, SUPPORT_COMMAND_OUTCOME_LABELS);
}

export function adminSupportReceiptStatusLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, SUPPORT_RECEIPT_STATUS_LABELS);
}

export function adminDomainStatusLanguage(value: string): AdminSemanticLanguage {
  return mapAdminSemanticLanguage(value, DOMAIN_STATUS_LABELS);
}

export function mapAdminSemanticLanguage(
  value: string,
  labels: Readonly<Record<string, string>>,
): AdminSemanticLanguage {
  const technicalValue = value.trim();
  return {
    primaryText: labels[value] ?? ADMIN_UNKNOWN_PRIMARY_TEXT,
    technicalDisclosure: technicalValue
      ? { label: "기술 값", value: technicalValue }
      : null,
  };
}
