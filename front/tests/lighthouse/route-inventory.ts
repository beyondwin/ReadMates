import type { LighthouseRouteDefinition, LighthouseRouteFilters } from "./types";

export const READING_SAI_FIXTURES = {
  clubId: "00000000-0000-0000-0000-000000000001",
  slug: "reading-sai",
  publicSessionId: "00000000-0000-0000-0000-000000000301",
  memberSessionId: "00000000-0000-0000-0000-000000000301",
} as const;

const scopedClubPath = `/clubs/${READING_SAI_FIXTURES.slug}`;
const publicSessionPath = `${scopedClubPath}/sessions/${READING_SAI_FIXTURES.publicSessionId}`;
const memberSessionPath = `${scopedClubPath}/app/sessions/${READING_SAI_FIXTURES.memberSessionId}`;
const feedbackPath = `${scopedClubPath}/app/feedback/${READING_SAI_FIXTURES.memberSessionId}`;
const hostSessionPath = `${scopedClubPath}/app/host/sessions/${READING_SAI_FIXTURES.memberSessionId}`;

export const LIGHTHOUSE_ROUTE_INVENTORY: LighthouseRouteDefinition[] = [
  { id: "public-home", group: "public", path: "/", mode: "navigation", auth: "none", description: "Unscoped public home", expectedText: "읽는사이" },
  { id: "public-about", group: "public", path: "/about", mode: "navigation", auth: "none", description: "Unscoped public about", expectedText: "읽는사이" },
  { id: "public-records", group: "public", path: "/records", mode: "navigation", auth: "none", description: "Unscoped public records", expectedText: "공개 기록" },
  { id: "public-session", group: "public", path: `/sessions/${READING_SAI_FIXTURES.publicSessionId}`, mode: "navigation", auth: "none", description: "Unscoped public session detail", expectedText: "팩트풀니스" },
  { id: "club-home", group: "public", path: scopedClubPath, mode: "navigation", auth: "none", description: "Scoped public club home", expectedText: "읽는사이" },
  { id: "club-about", group: "public", path: `${scopedClubPath}/about`, mode: "navigation", auth: "none", description: "Scoped public club about", expectedText: "읽는사이" },
  { id: "club-records", group: "public", path: `${scopedClubPath}/records`, mode: "navigation", auth: "none", description: "Scoped public records", expectedText: "공개 기록" },
  { id: "club-session", group: "public", path: publicSessionPath, mode: "navigation", auth: "none", description: "Scoped public session detail", expectedText: "팩트풀니스" },
  { id: "login", group: "public", path: "/login", mode: "navigation", auth: "none", description: "Login entry page", expectedText: "Google" },
  { id: "reset-password-retired", group: "public", path: "/reset-password/sample-token", mode: "navigation", auth: "none", description: "Retired password reset route", expectedText: "Google" },
  { id: "public-not-found", group: "public", path: "/missing-lighthouse-diagnostic-route", mode: "navigation", auth: "none", description: "Public route error page", expectedText: "찾을 수" },
  { id: "member-home", group: "member", path: `${scopedClubPath}/app`, mode: "snapshot", auth: "member", description: "Member home", expectedText: "멤버" },
  { id: "member-current-session", group: "member", path: `${scopedClubPath}/app/session/current`, mode: "timespan", auth: "member", description: "Current session route", expectedText: "세션" },
  { id: "member-notes", group: "member", path: `${scopedClubPath}/app/notes`, mode: "snapshot", auth: "member", description: "Member notes feed", expectedText: "노트" },
  { id: "member-archive", group: "member", path: `${scopedClubPath}/app/archive`, mode: "snapshot", auth: "member", description: "Member archive", expectedText: "아카이브" },
  { id: "member-me", group: "member", path: `${scopedClubPath}/app/me`, mode: "snapshot", auth: "member", description: "Member profile page", expectedText: "내" },
  { id: "member-notifications", group: "member", path: `${scopedClubPath}/app/notifications`, mode: "snapshot", auth: "member", description: "Member notification inbox", expectedText: "알림" },
  { id: "member-session-detail", group: "member", path: memberSessionPath, mode: "snapshot", auth: "member", description: "Member session detail", expectedText: "팩트풀니스" },
  { id: "member-feedback", group: "member", path: feedbackPath, mode: "snapshot", auth: "member", description: "Member feedback document", expectedText: "피드백" },
  { id: "member-feedback-print", group: "member", path: `${feedbackPath}/print`, mode: "snapshot", auth: "member", description: "Feedback print document", expectedText: "피드백" },
  { id: "host-dashboard", group: "host", path: `${scopedClubPath}/app/host`, mode: "timespan", auth: "host", description: "Host dashboard", expectedText: "운영" },
  { id: "host-members", group: "host", path: `${scopedClubPath}/app/host/members`, mode: "snapshot", auth: "host", description: "Host members ledger", expectedText: "멤버" },
  { id: "host-invitations", group: "host", path: `${scopedClubPath}/app/host/invitations`, mode: "snapshot", auth: "host", description: "Host invitations ledger", expectedText: "초대" },
  { id: "host-notifications", group: "host", path: `${scopedClubPath}/app/host/notifications`, mode: "snapshot", auth: "host", description: "Host notifications ledger", expectedText: "알림" },
  { id: "host-new-session", group: "host", path: `${scopedClubPath}/app/host/sessions/new`, mode: "snapshot", auth: "host", description: "Host session editor create route", expectedText: "세션" },
  { id: "host-edit-session", group: "host", path: `${hostSessionPath}/edit`, mode: "snapshot", auth: "host", description: "Host session editor detail route", expectedText: "팩트풀니스" },
  { id: "host-session-closing", group: "host", path: `${hostSessionPath}/closing`, mode: "snapshot", auth: "host", description: "Host closing board", expectedText: "클로징" },
  { id: "admin-today", group: "admin", path: "/admin/today", mode: "timespan", auth: "admin", description: "Platform admin today ledger", expectedText: "오늘" },
  { id: "admin-health", group: "admin", path: "/admin/health", mode: "snapshot", auth: "admin", description: "Platform admin health", expectedText: "헬스" },
  { id: "admin-clubs", group: "admin", path: "/admin/clubs", mode: "snapshot", auth: "admin", description: "Platform admin clubs", expectedText: "클럽" },
  { id: "admin-support", group: "admin", path: "/admin/support", mode: "snapshot", auth: "admin", description: "Platform admin support", expectedText: "지원" },
  { id: "admin-notifications", group: "admin", path: "/admin/notifications", mode: "snapshot", auth: "admin", description: "Platform admin notifications", expectedText: "알림" },
  { id: "admin-ai-ops", group: "admin", path: "/admin/ai-ops", mode: "snapshot", auth: "admin", description: "Platform admin AI operations", expectedText: "AI" },
  { id: "admin-audit", group: "admin", path: "/admin/audit", mode: "snapshot", auth: "admin", description: "Platform admin audit", expectedText: "감사" },
  { id: "admin-analytics", group: "admin", path: "/admin/analytics", mode: "snapshot", auth: "admin", description: "Platform admin analytics", expectedText: "분석" },
  { id: "admin-club-detail", group: "admin", path: `/admin/clubs/${READING_SAI_FIXTURES.clubId}`, mode: "snapshot", auth: "admin", description: "Platform admin club detail", expectedText: "읽는사이" },
];

export function filterRoutes(routes: LighthouseRouteDefinition[], filters: LighthouseRouteFilters) {
  let filtered = routes;
  if (filters.group) {
    filtered = filtered.filter((route) => route.group === filters.group);
  }
  if (filters.routeId) {
    filtered = filtered.filter((route) => route.id === filters.routeId);
  }
  if (filters.limit !== undefined) {
    filtered = filtered.slice(0, filters.limit);
  }
  return filtered;
}
