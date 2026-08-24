export const HOST_ROUTE_PATHS = {
  today: "",
  members: "members",
  invitations: "invitations",
  notifications: "notifications",
  operations: "operations",
  meetings: "sessions",
  records: "records",
  newSession: "sessions/new",
  sessionDetail: "sessions/:sessionId",
  sessionEdit: "sessions/:sessionId/edit",
  sessionClosing: "sessions/:sessionId/closing",
  feedbackDocument: "sessions/:sessionId/feedback-document",
} as const;

function hostRouteHref(path: string) {
  return `/app/host${path ? `/${path}` : ""}`;
}

export const HOST_ROUTE_HREFS = {
  today: hostRouteHref(HOST_ROUTE_PATHS.today),
  meetings: hostRouteHref(HOST_ROUTE_PATHS.meetings),
  members: hostRouteHref(HOST_ROUTE_PATHS.members),
  records: hostRouteHref(HOST_ROUTE_PATHS.records),
  invitations: hostRouteHref(HOST_ROUTE_PATHS.invitations),
  notifications: hostRouteHref(HOST_ROUTE_PATHS.notifications),
  operations: hostRouteHref(HOST_ROUTE_PATHS.operations),
  newSession: hostRouteHref(HOST_ROUTE_PATHS.newSession),
  sessionDetail: hostRouteHref(HOST_ROUTE_PATHS.sessionDetail),
  sessionEdit: hostRouteHref(HOST_ROUTE_PATHS.sessionEdit),
  sessionClosing: hostRouteHref(HOST_ROUTE_PATHS.sessionClosing),
  feedbackDocument: hostRouteHref(HOST_ROUTE_PATHS.feedbackDocument),
  trashCompatibility: `${hostRouteHref(HOST_ROUTE_PATHS.meetings)}?view=trash`,
} as const;

export function scopedHostRouteHref(href: string) {
  return `/clubs/:slug${href}`;
}
