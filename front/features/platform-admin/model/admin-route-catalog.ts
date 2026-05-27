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
    status: "ready",
    requiredCapability: "view_health",
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
    status: "ready",
    requiredCapability: "view_notifications",
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
    status: "ready",
    requiredCapability: "view_audit",
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
