export const HOST_ROUTE_PATHS = {
  operatingRoom: "",
  meetings: "sessions",
  people: "people",
  records: "records",
  settings: "settings",
  notifications: "notifications",
  newSession: "sessions/new",
  sessionDetail: "sessions/:sessionId",
  sessionEdit: "sessions/:sessionId/edit",
  sessionClosing: "sessions/:sessionId/closing",
  scheduleReview: "sessions/:sessionId/schedule-review",
  personDetail: "people/:membershipId",
  today: "",
  members: "members",
  invitations: "invitations",
  operations: "operations",
  feedbackDocument: "sessions/:sessionId/feedback-document",
} as const;

function hostRouteHref(path: string) {
  return `/app/host${path ? `/${path}` : ""}`;
}

export const HOST_ROUTE_HREFS = {
  operatingRoom: hostRouteHref(HOST_ROUTE_PATHS.operatingRoom),
  meetings: hostRouteHref(HOST_ROUTE_PATHS.meetings),
  people: hostRouteHref(HOST_ROUTE_PATHS.people),
  records: hostRouteHref(HOST_ROUTE_PATHS.records),
  settings: hostRouteHref(HOST_ROUTE_PATHS.settings),
  notifications: hostRouteHref(HOST_ROUTE_PATHS.notifications),
  newSession: hostRouteHref(HOST_ROUTE_PATHS.newSession),
  sessionDetail: hostRouteHref(HOST_ROUTE_PATHS.sessionDetail),
  sessionEdit: hostRouteHref(HOST_ROUTE_PATHS.sessionEdit),
  sessionClosing: hostRouteHref(HOST_ROUTE_PATHS.sessionClosing),
  scheduleReview: hostRouteHref(HOST_ROUTE_PATHS.scheduleReview),
  personDetail: hostRouteHref(HOST_ROUTE_PATHS.personDetail),
  today: hostRouteHref(HOST_ROUTE_PATHS.today),
  members: hostRouteHref(HOST_ROUTE_PATHS.members),
  invitations: hostRouteHref(HOST_ROUTE_PATHS.invitations),
  operations: hostRouteHref(HOST_ROUTE_PATHS.operations),
  feedbackDocument: hostRouteHref(HOST_ROUTE_PATHS.feedbackDocument),
  trashCompatibility: `${hostRouteHref(HOST_ROUTE_PATHS.meetings)}?view=trash`,
} as const;

export const HOST_UTILITY_HREFS = {
  memberView: "/app",
  account: "/app/me/settings",
} as const;

export function scopedHostRouteHref(href: string) {
  return `/clubs/:slug${href}`;
}
