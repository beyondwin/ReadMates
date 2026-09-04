import { describe, expect, it } from "vitest";
import {
  classifyApprovedEffectKind,
  createApprovedRouteRequestAudit,
  PREVIEW_NOTIFICATION_PATH,
} from "./approved-route-request-audit";

describe("approved route request audit", () => {
  it("permits only registered fixture traffic and a validated preview POST", () => {
    const audit = createApprovedRouteRequestAudit();
    audit.allowFixture({ method: "GET", path: "/api/bff/api/auth/me" });
    audit.allowValidatedPreview({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      validate: (request) => request.postData?.includes('"preview":true') === true,
    });

    expect(audit.observe({
      method: "GET",
      url: "https://readmates.example/api/bff/api/auth/me",
    }).classification).toBe("fixture");

    expect(audit.observe({
      method: "POST",
      url: `https://readmates.example${PREVIEW_NOTIFICATION_PATH}`,
      postData: '{"preview":true}',
    }).classification).toBe("preview");

    expect(audit.observe({
      method: "GET",
      url: "https://readmates.example/api/bff/api/admin/operations/cases",
    }).classification).toBe("unmatched");

    expect(audit.observe({
      method: "POST",
      url: "https://readmates.example/api/bff/api/host/notifications/manual/send",
      postData: "{}",
    }).classification).toBe("effecting");
  });

  it("rejects an unmatched or effecting BFF request", () => {
    const unmatched = createApprovedRouteRequestAudit();
    unmatched.observe({
      method: "GET",
      url: "https://readmates.example/api/bff/api/host/workbox",
    });
    expect(() => unmatched.assertNoUnmatchedOrEffecting()).toThrow(/unmatched/i);

    const effecting = createApprovedRouteRequestAudit();
    effecting.observe({
      method: "POST",
      url: "https://readmates.example/api/bff/api/host/invitations",
      postData: "{}",
    });
    expect(() => effecting.assertNoUnmatchedOrEffecting()).toThrow(/effecting/i);
  });

  it("rejects a preview POST that fails explicit validation", () => {
    const audit = createApprovedRouteRequestAudit();
    audit.allowValidatedPreview({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      validate: (request) => request.postData?.includes('"preview":true') === true,
    });
    const observed = audit.observe({
      method: "POST",
      url: `https://readmates.example${PREVIEW_NOTIFICATION_PATH}`,
      postData: '{"confirm":true}',
    });
    expect(observed.classification).toBe("effecting");
    expect(observed.effectKind).toBe("notification-confirm");
    expect(() => audit.assertNoUnmatchedOrEffecting()).toThrow(/effecting/i);
  });

  it("maps known mutation paths to closed effect kinds", () => {
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/attendance")).toBe("attendance-mutation");
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/notifications/manual/confirm")).toBe("notification-confirm");
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/notifications/manual/send")).toBe("notification-send");
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/invitations")).toBe("invitation-create");
    expect(classifyApprovedEffectKind("PATCH", "/api/bff/api/host/settings")).toBe("settings-update");
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/sessions/close")).toBe("session-close");
    expect(classifyApprovedEffectKind("POST", "/api/bff/api/host/people/membership-sky/status")).toBe("membership-mutation");
    expect(classifyApprovedEffectKind("DELETE", "/api/bff/api/host/unknown")).toBe("other-effecting-request");
  });

  it("passes the request url into preview validation", () => {
    const audit = createApprovedRouteRequestAudit();
    const seen: string[] = [];
    audit.allowValidatedPreview({
      method: "POST",
      path: PREVIEW_NOTIFICATION_PATH,
      validate: (request) => {
        seen.push(request.url ?? "");
        return request.url?.includes("clubSlug=visual-authority") === true;
      },
    });

    expect(audit.observe({
      method: "POST",
      url: `https://readmates.example${PREVIEW_NOTIFICATION_PATH}?clubSlug=visual-authority`,
      postData: "{}",
    }).classification).toBe("preview");
    expect(seen[0]).toContain("clubSlug=visual-authority");

    expect(audit.observe({
      method: "POST",
      url: `https://readmates.example${PREVIEW_NOTIFICATION_PATH}?clubSlug=other-club`,
      postData: "{}",
    }).classification).toBe("effecting");
  });

  it("ignores non-BFF traffic", () => {
    const audit = createApprovedRouteRequestAudit();
    expect(audit.observe({
      method: "GET",
      url: "https://readmates.example/assets/app.js",
    }).classification).toBe("ignored");
    audit.assertNoUnmatchedOrEffecting();
  });
});
