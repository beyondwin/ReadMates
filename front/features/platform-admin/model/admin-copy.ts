import {
  adminAuditOutcomeLanguage,
  adminNavigationLanguage,
  mapAdminSemanticLanguage,
} from "./admin-status-language";

export const ADMIN_COPY = {
  eyebrow: {
    clubs: "운영 · 클럽",
    clubDetail: "운영 · 클럽 상세",
    aiOps: "운영 · AI 작업",
    notifications: "운영 · 배달",
    takedown: "운영 · 긴급 공개 회수",
    identity: "식별",
    visibility: "공개 설정",
    domainProvisioning: "도메인 준비",
    operationsSnapshot: "운영 스냅샷",
    pipeline: "서비스 상태",
    ledger: "처리 기록",
  },
  navigation: {
    today: adminNavigationLanguage("today").primaryText,
    clubs: adminNavigationLanguage("clubs").primaryText,
    service: adminNavigationLanguage("service").primaryText,
    records: adminNavigationLanguage("records").primaryText,
  },
  search: {
    loadedCases: "이미 불러온 케이스 검색",
  },
  heading: {
    aiOps: "AI 작업",
    failureClusters: "실패 클러스터",
    replay: "재발송",
    clubsLedger: "클럽 관리 목록",
    delivery: "알림 전달 상태",
    recentChanges: "최근에 바뀐 것",
    audit: "운영 처리 기록",
    auditLedger: "처리 목록",
    access: "지원 접근",
    accessLedger: "접근 발급 기록",
    analytics: "분석 부록",
  },
  support: {
    issue: "지원 접근 발급",
    count: "접근 발급",
    unavailable: "접근 발급 확인 불가",
    retry: "접근 발급 다시 시도",
  },
  targetLedger: {
    heading: "이 대상의 최근 처리 기록",
    clubHeading: "이 클럽의 최근 처리 기록",
    more: "전체 처리 기록 보기",
    empty: "표시할 처리 기록이 없습니다.",
  },
  metric: {
    outboxPending: "발송 대기",
    outboxFailed: "발송 실패",
    deliveryPending: "배달 대기",
    deliveryFailed: "배달 실패",
    relayStale: "중계 지연",
  },
  receipt: "영수증",
  queueExit: {
    acknowledge: "확인 처리",
    hold: "보류",
    ignore: "무시",
    resolve: "해결 확인",
    holdDuration: "보류 기간",
    holdReason: "보류 사유",
    ignoreReason: "무시 사유",
    holdConfirm: "보류 확정",
    ignoreConfirm: "무시 확정",
    holdHint: "기간이 끝나면 큐로 돌아옵니다.",
    ignoreHint: "최대 7일 보류합니다. 기간이 끝나면 큐로 돌아옵니다.",
  },
  alarm: {
    attention: "주의",
    noUnacknowledged: "미확인 신호 없음",
    unacknowledged: "미확인 신호",
    serviceOk: "서비스 정상",
    serviceDegraded: "서비스 주의",
    unavailable: "신호 확인 불가",
    openToday: "오늘 열기",
    asOfSuffix: "기준",
  },
  replayWarning: "수동 재발송은 자동 재시도를 취소하지 않습니다.",
  nextRetry: "다음 재시도 예정",
} as const;

function fromMap(map: Record<string, string>) {
  return (value: string): string => mapAdminSemanticLanguage(value, map).primaryText;
}

export const clubLifecycleLabel = fromMap({
  ACTIVE: "활성",
  SETUP_REQUIRED: "설정 필요",
  SUSPENDED: "중지",
  ARCHIVED: "보관",
});

export const clubVisibilityLabel = fromMap({
  PUBLIC: "공개",
  PRIVATE: "비공개",
});

export const hostOnboardingLabel = fromMap({
  MISSING: "없음",
  INVITED: "초대됨",
  ASSIGNED: "배정됨",
});

export const supportGrantStatusLabel = fromMap({
  ACTIVE: "활성",
  EXPIRING: "만료 임박",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
});

export const supportGrantReasonLabel = fromMap({
  INCIDENT_INVESTIGATION: "사고 조사",
  MEMBER_ASSISTANCE: "회원 지원",
  DATA_CORRECTION: "데이터 정정",
  SECURITY_REVIEW: "보안 검토",
});

export const auditOutcomeLabel = (value: string): string =>
  adminAuditOutcomeLanguage(value).primaryText;

export const deliveryLedgerStatusLabel = fromMap({
  SENT: "발송됨",
  PUBLISHED: "발송됨",
  PENDING: "대기",
  PUBLISHING: "대기",
  SENDING: "대기",
  FAILED: "실패",
  DEAD: "실패",
});

export function deliveryAttemptBadge(attemptCount: number): string {
  return `${attemptCount}차 시도`;
}

export function aiJobInProgressLabel(minutes: number): string {
  return `${minutes}분째 진행`;
}

export function aiJobStallLabel(minutes: number): string {
  return `멈춤 의심 · ${minutes}분`;
}

export function aiJobConfirmAction(jobId: string, action: "FORCE_CANCEL" | "RETRY_COMMIT"): string {
  return action === "FORCE_CANCEL" ? `작업 ${jobId} 강제 취소` : `작업 ${jobId} 커밋 복구`;
}
