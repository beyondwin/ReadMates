import type { AdminCapability } from "@/features/platform-admin/model/platform-admin-permissions";

export type AdminRouteGroup = "today" | "ops" | "review";
export type AdminRouteStatus = "ready" | "coming_soon";
export type AdminRouteSlice =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup;
  groupLabel: string;
  slice: AdminRouteSlice;
  status: AdminRouteStatus;
  requiredCapability: AdminCapability;
  comingSoon?: {
    title: string;
    summary: string;
    bullets: ReadonlyArray<string>;
    docHref: string;
  };
};

const UMBRELLA_DOC = "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md";

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [
  {
    path: "today",
    label: "오늘",
    group: "today",
    groupLabel: "오늘/헬스",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_today",
  },
  {
    path: "health",
    label: "헬스",
    group: "today",
    groupLabel: "오늘/헬스",
    slice: "S2",
    status: "coming_soon",
    requiredCapability: "view_health",
    comingSoon: {
      title: "Platform Ops Health",
      summary: "DB, Redis, Kafka, AI provider, outbox, deploy 신호를 한 화면에서 봅니다.",
      bullets: [
        "서비스·큐·AI 가용성 카드 (unknown/ok/degraded/down 4-state)",
        "Outbox backlog · 알림 발송 성공률",
        "최근 deploy attempt 5건 ledger",
        "각 카드의 last-checked + drill 링크",
      ],
      docHref: `${UMBRELLA_DOC}#s2--platform-ops-health--deploy-ledger`,
    },
  },
  {
    path: "clubs",
    label: "클럽",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_clubs",
  },
  {
    path: "support",
    label: "지원",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_support",
  },
  {
    path: "notifications",
    label: "알림",
    group: "ops",
    groupLabel: "운영",
    slice: "S5",
    status: "coming_soon",
    requiredCapability: "view_notifications",
    comingSoon: {
      title: "알림/Outbox 운영",
      summary: "relay lag, dead letter, replay, 실패 cluster, 클럽별 성공률을 한 화면에서 봅니다.",
      bullets: [
        "Outbox state ledger와 dead letter 목록",
        "수동 replay (dry-run → confirm 두 단계)",
        "발송 실패 cluster (errorCode 그룹)",
        "호스트 manual notification audit cross-cut",
      ],
      docHref: `${UMBRELLA_DOC}#s5--알림outbox-운영`,
    },
  },
  {
    path: "ai-ops",
    label: "AI Ops",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_ai_ops",
  },
  {
    path: "audit",
    label: "감사",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S7",
    status: "coming_soon",
    requiredCapability: "view_audit",
    comingSoon: {
      title: "Audit / Activity ledger",
      summary: "platform admin · OWNER · SUPPORT · 클럽 lifecycle · role transition 액션을 시간순 통합 뷰로 봅니다.",
      bullets: [
        "actor / club / action / outcome 통합 ledger",
        "club · role · actor 필터",
        "출처 slice 표기 (S2/S3/S4/S5 어떤 작업이었는지)",
        "마스킹 정책 일관 적용",
      ],
      docHref: `${UMBRELLA_DOC}#s7--audit--activity-ledger-통합`,
    },
  },
  {
    path: "analytics",
    label: "분석",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S8",
    status: "coming_soon",
    requiredCapability: "view_analytics",
    comingSoon: {
      title: "분석/리포팅 lite",
      summary: "클럽별 활성 멤버, 세션 완료율, RSVP rate, AI 비용/세션, 알림 도달률 트렌드.",
      bullets: [
        "7/30/90일 시계열",
        "클럽 간 비교 (cross-club benchmark)",
        "데이터 부족 시 정직한 empty state",
        "fixture seed로 dev 환경에서도 의미 있는 차트",
      ],
      docHref: `${UMBRELLA_DOC}#s8--분석리포팅-lite`,
    },
  },
];

export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {
  path: "clubs/:clubId",
  label: "클럽 상세",
  group: "ops",
  groupLabel: "운영",
  slice: "S1",
  status: "ready",
  requiredCapability: "view_club_detail",
};
