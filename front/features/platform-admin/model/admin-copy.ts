export const ADMIN_COPY = {
  eyebrow: {
    clubs: "운영 · 클럽",
    clubDetail: "운영 · 클럽 상세",
    aiOps: "운영 · AI 작업",
    notifications: "운영 · 배달",
    takedown: "운영 · 긴급 공개 회수",
  },
  heading: {
    aiOps: "AI 작업",
    failureClusters: "실패 클러스터",
    replay: "재발송",
    clubsLedger: "클럽 장부",
  },
  receipt: "영수증",
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
