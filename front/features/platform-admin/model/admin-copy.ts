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
  },
  heading: {
    aiOps: "AI 작업",
    failureClusters: "실패 클러스터",
    replay: "재발송",
    clubsLedger: "클럽 장부",
    delivery: "배달 원장",
    recentChanges: "최근에 바뀐 것",
  },
  metric: {
    outboxPending: "발송 대기",
    outboxFailed: "발송 실패",
    deliveryPending: "배달 대기",
    deliveryFailed: "배달 실패",
    relayStale: "중계 지연",
  },
  receipt: "영수증",
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
} as const;

function fromMap(map: Record<string, string>) {
  return (value: string): string => map[value] ?? value;
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
