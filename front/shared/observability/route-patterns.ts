export type FrontendRoutePattern = string;

export type FrontendApiGroup =
  | "admin-ai"
  | "admin-audit"
  | "admin-club"
  | "admin-health"
  | "admin-notification"
  | "admin-support"
  | "auth"
  | "feedback"
  | "host-member"
  | "host-notification"
  | "host-session"
  | "member"
  | "notification"
  | "public"
  | "unknown";

type PatternRule = {
  pattern: FrontendRoutePattern;
  regex: RegExp;
};

const routeRules: PatternRule[] = [
  { pattern: "/", regex: /^\/$/ },
  { pattern: "/about", regex: /^\/about\/?$/ },
  { pattern: "/records", regex: /^\/records\/?$/ },
  { pattern: "/sessions/:sessionId", regex: /^\/sessions\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug", regex: /^\/clubs\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug/about", regex: /^\/clubs\/[^/]+\/about\/?$/ },
  { pattern: "/clubs/:slug/records", regex: /^\/clubs\/[^/]+\/records\/?$/ },
  { pattern: "/clubs/:slug/sessions/:sessionId", regex: /^\/clubs\/[^/]+\/sessions\/[^/]+\/?$/ },
  { pattern: "/login", regex: /^\/login\/?$/ },
  { pattern: "/clubs/:slug/invite/:token", regex: /^\/clubs\/[^/]+\/invite\/[^/]+\/?$/ },
  { pattern: "/invite/:token", regex: /^\/invite\/[^/]+\/?$/ },
  { pattern: "/reset-password/:token", regex: /^\/reset-password\/[^/]+\/?$/ },
  { pattern: "/app", regex: /^\/app\/?$/ },
  { pattern: "/app/session/current", regex: /^\/app\/session\/current\/?$/ },
  { pattern: "/app/notes", regex: /^\/app\/notes\/?$/ },
  { pattern: "/app/archive", regex: /^\/app\/archive\/?$/ },
  { pattern: "/app/me", regex: /^\/app\/me\/?$/ },
  { pattern: "/app/notifications", regex: /^\/app\/notifications\/?$/ },
  { pattern: "/app/sessions/:sessionId", regex: /^\/app\/sessions\/[^/]+\/?$/ },
  { pattern: "/app/feedback/:sessionId", regex: /^\/app\/feedback\/[^/]+\/?$/ },
  { pattern: "/app/feedback/:sessionId/print", regex: /^\/app\/feedback\/[^/]+\/print\/?$/ },
  { pattern: "/app/pending", regex: /^\/app\/pending\/?$/ },
  { pattern: "/clubs/:slug/app", regex: /^\/clubs\/[^/]+\/app\/?$/ },
  { pattern: "/clubs/:slug/app/session/current", regex: /^\/clubs\/[^/]+\/app\/session\/current\/?$/ },
  { pattern: "/clubs/:slug/app/notes", regex: /^\/clubs\/[^/]+\/app\/notes\/?$/ },
  { pattern: "/clubs/:slug/app/archive", regex: /^\/clubs\/[^/]+\/app\/archive\/?$/ },
  { pattern: "/clubs/:slug/app/me", regex: /^\/clubs\/[^/]+\/app\/me\/?$/ },
  { pattern: "/clubs/:slug/app/notifications", regex: /^\/clubs\/[^/]+\/app\/notifications\/?$/ },
  { pattern: "/clubs/:slug/app/sessions/:sessionId", regex: /^\/clubs\/[^/]+\/app\/sessions\/[^/]+\/?$/ },
  { pattern: "/clubs/:slug/app/feedback/:sessionId", regex: /^\/clubs\/[^/]+\/app\/feedback\/[^/]+\/?$/ },
  {
    pattern: "/clubs/:slug/app/feedback/:sessionId/print",
    regex: /^\/clubs\/[^/]+\/app\/feedback\/[^/]+\/print\/?$/,
  },
  { pattern: "/clubs/:slug/app/pending", regex: /^\/clubs\/[^/]+\/app\/pending\/?$/ },
  { pattern: "/app/host", regex: /^\/app\/host\/?$/ },
  { pattern: "/app/host/members", regex: /^\/app\/host\/members\/?$/ },
  { pattern: "/app/host/invitations", regex: /^\/app\/host\/invitations\/?$/ },
  { pattern: "/app/host/notifications", regex: /^\/app\/host\/notifications\/?$/ },
  { pattern: "/app/host/sessions/new", regex: /^\/app\/host\/sessions\/new\/?$/ },
  { pattern: "/app/host/sessions/:sessionId/closing", regex: /^\/app\/host\/sessions\/[^/]+\/closing\/?$/ },
  { pattern: "/app/host/sessions/:sessionId/edit", regex: /^\/app\/host\/sessions\/[^/]+\/edit\/?$/ },
  { pattern: "/clubs/:slug/app/host", regex: /^\/clubs\/[^/]+\/app\/host\/?$/ },
  { pattern: "/clubs/:slug/app/host/members", regex: /^\/clubs\/[^/]+\/app\/host\/members\/?$/ },
  { pattern: "/clubs/:slug/app/host/invitations", regex: /^\/clubs\/[^/]+\/app\/host\/invitations\/?$/ },
  { pattern: "/clubs/:slug/app/host/notifications", regex: /^\/clubs\/[^/]+\/app\/host\/notifications\/?$/ },
  { pattern: "/clubs/:slug/app/host/sessions/new", regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/new\/?$/ },
  {
    pattern: "/clubs/:slug/app/host/sessions/:sessionId/closing",
    regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/[^/]+\/closing\/?$/,
  },
  {
    pattern: "/clubs/:slug/app/host/sessions/:sessionId/edit",
    regex: /^\/clubs\/[^/]+\/app\/host\/sessions\/[^/]+\/edit\/?$/,
  },
  { pattern: "/admin", regex: /^\/admin\/?$/ },
  { pattern: "/admin/today", regex: /^\/admin\/today\/?$/ },
  { pattern: "/admin/health", regex: /^\/admin\/health\/?$/ },
  { pattern: "/admin/notifications", regex: /^\/admin\/notifications\/?$/ },
  { pattern: "/admin/clubs", regex: /^\/admin\/clubs\/?$/ },
  { pattern: "/admin/clubs/:clubId", regex: /^\/admin\/clubs\/[^/]+\/?$/ },
  { pattern: "/admin/support", regex: /^\/admin\/support\/?$/ },
  { pattern: "/admin/ai-ops", regex: /^\/admin\/ai-ops\/?$/ },
  { pattern: "/admin/audit", regex: /^\/admin\/audit\/?$/ },
  { pattern: "/admin/analytics", regex: /^\/admin\/analytics\/?$/ },
];

export function normalizeFrontendRoutePattern(pathname: string): FrontendRoutePattern {
  if (!pathname.startsWith("/")) return "unknown";
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const normalized = pathOnly.length > 1 ? pathOnly.replace(/\/+$/, "") : pathOnly;
  return routeRules.find((rule) => rule.regex.test(normalized))?.pattern ?? "unknown";
}

export function frontendApiGroupFromPath(path: string): FrontendApiGroup {
  const pathOnly = path.split(/[?#]/, 1)[0] || "";
  if (pathOnly.startsWith("/api/admin/ai-generation")) return "admin-ai";
  if (pathOnly.startsWith("/api/admin/audit")) return "admin-audit";
  if (pathOnly.startsWith("/api/admin/clubs")) return "admin-club";
  if (pathOnly.startsWith("/api/admin/health")) return "admin-health";
  if (pathOnly.startsWith("/api/admin/notifications")) return "admin-notification";
  if (pathOnly.startsWith("/api/admin/support")) return "admin-support";
  if (pathOnly.startsWith("/api/auth") || pathOnly.includes("/invitations/")) return "auth";
  if (pathOnly.includes("/feedback-document") || pathOnly.startsWith("/api/feedback-documents")) return "feedback";
  if (pathOnly.startsWith("/api/host/members")) return "host-member";
  if (pathOnly.includes("/notifications/items/") || pathOnly.endsWith("/notifications")) return "notification";
  if (pathOnly.startsWith("/api/host/notifications")) return "host-notification";
  if (pathOnly.startsWith("/api/host/sessions") || pathOnly.startsWith("/api/sessions")) return "host-session";
  if (pathOnly.startsWith("/api/me") || pathOnly.startsWith("/api/app") || pathOnly.startsWith("/api/notes")) {
    return "member";
  }
  if (pathOnly.startsWith("/api/public") || pathOnly.startsWith("/api/archive")) return "public";
  if (pathOnly.includes("/notifications")) return "notification";
  return "unknown";
}
