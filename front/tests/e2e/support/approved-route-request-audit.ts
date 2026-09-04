import type { Page } from "@playwright/test";
import type { ApprovedEffectKind } from "./approved-route-scenarios";

export const PREVIEW_NOTIFICATION_PATH = "/api/bff/api/host/notifications/manual/preview";

export type ApprovedRouteRequestClassification =
  | "fixture"
  | "preview"
  | "unmatched"
  | "effecting"
  | "ignored";

export type ApprovedRouteRequestRecord = {
  method: string;
  url: string;
  path: string;
  classification: ApprovedRouteRequestClassification;
  effectKind?: ApprovedEffectKind;
};

export type ApprovedRouteRequestAudit = {
  allowFixture(input: { method: string; path: string }): void;
  allowValidatedPreview(input: {
    method: "POST";
    path: typeof PREVIEW_NOTIFICATION_PATH;
    validate: (request: { method: string; path: string; postData: string | null; url?: string }) => boolean;
  }): void;
  observe(request: { method: string; url: string; postData?: string | null }): ApprovedRouteRequestRecord;
  records(): readonly ApprovedRouteRequestRecord[];
  unmatched(): readonly ApprovedRouteRequestRecord[];
  effecting(): readonly ApprovedRouteRequestRecord[];
  previewPosts(): readonly ApprovedRouteRequestRecord[];
  assertNoUnmatchedOrEffecting(): void;
};

const EFFECTING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function bffPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://visual-authority.readmates.invalid");
    if (!parsed.pathname.startsWith("/api/bff/")) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

export function classifyApprovedEffectKind(method: string, path: string, postData?: string | null): ApprovedEffectKind {
  const normalized = path.toLowerCase();
  const body = postData ?? "";
  if (normalized.includes("/attendance")) return "attendance-mutation";
  if (normalized.includes("/notifications/manual/confirm") || /"confirm"\s*:\s*true/.test(body)) {
    return "notification-confirm";
  }
  if (normalized.includes("/notifications/manual/send") || /"send"\s*:\s*true/.test(body)) {
    return "notification-send";
  }
  if (normalized.includes("/invitation")) return "invitation-create";
  if (normalized.includes("/settings")) return "settings-update";
  if (normalized.includes("/sessions/close") || normalized.endsWith("/close")) return "session-close";
  if (normalized.includes("/people/") || normalized.includes("/membership")) return "membership-mutation";
  if (EFFECTING_METHODS.has(method.toUpperCase())) return "other-effecting-request";
  return "other-effecting-request";
}

export function createApprovedRouteRequestAudit(): ApprovedRouteRequestAudit {
  const fixtures = new Set<string>();
  const previews: Array<{
    method: "POST";
    path: string;
    validate: (request: { method: string; path: string; postData: string | null; url?: string }) => boolean;
  }> = [];
  const observed: ApprovedRouteRequestRecord[] = [];

  const allowFixture = (input: { method: string; path: string }) => {
    fixtures.add(`${input.method.toUpperCase()} ${input.path}`);
  };

  const allowValidatedPreview: ApprovedRouteRequestAudit["allowValidatedPreview"] = (input) => {
    previews.push(input);
  };

  const observe: ApprovedRouteRequestAudit["observe"] = (request) => {
    const path = bffPathFromUrl(request.url);
    if (path == null) {
      const record: ApprovedRouteRequestRecord = {
        method: request.method,
        url: request.url,
        path: "",
        classification: "ignored",
      };
      observed.push(record);
      return record;
    }
    const method = request.method.toUpperCase();
    const postData = request.postData ?? null;
    if (fixtures.has(`${method} ${path}`)) {
      const record: ApprovedRouteRequestRecord = { method, url: request.url, path, classification: "fixture" };
      observed.push(record);
      return record;
    }
    const preview = previews.find((entry) => entry.method === method && entry.path === path);
    if (preview) {
      if (preview.validate({ method, path, postData, url: request.url })) {
        const record: ApprovedRouteRequestRecord = { method, url: request.url, path, classification: "preview" };
        observed.push(record);
        return record;
      }
      const record: ApprovedRouteRequestRecord = {
        method,
        url: request.url,
        path,
        classification: "effecting",
        effectKind: classifyApprovedEffectKind(method, path, postData),
      };
      observed.push(record);
      return record;
    }
    if (EFFECTING_METHODS.has(method)) {
      const record: ApprovedRouteRequestRecord = {
        method,
        url: request.url,
        path,
        classification: "effecting",
        effectKind: classifyApprovedEffectKind(method, path, postData),
      };
      observed.push(record);
      return record;
    }
    const record: ApprovedRouteRequestRecord = { method, url: request.url, path, classification: "unmatched" };
    observed.push(record);
    return record;
  };

  return {
    allowFixture,
    allowValidatedPreview,
    observe,
    records: () => observed,
    unmatched: () => observed.filter((item) => item.classification === "unmatched"),
    effecting: () => observed.filter((item) => item.classification === "effecting"),
    previewPosts: () => observed.filter((item) => item.classification === "preview"),
    assertNoUnmatchedOrEffecting: () => {
      const unmatched = observed.filter((item) => item.classification === "unmatched");
      const effecting = observed.filter((item) => item.classification === "effecting");
      if (unmatched.length > 0) {
        throw new Error(`Unmatched BFF traffic: ${unmatched.map((item) => `${item.method} ${item.path}`).join(", ")}`);
      }
      if (effecting.length > 0) {
        throw new Error(`Effecting BFF traffic: ${effecting.map((item) => `${item.method} ${item.path}`).join(", ")}`);
      }
    },
  };
}

export async function installApprovedRouteCatchAllAudit(
  page: Page,
  audit: ApprovedRouteRequestAudit,
): Promise<void> {
  await page.route("**/api/bff/**", async (route) => {
    const request = route.request();
    const record = audit.observe({
      method: request.method(),
      url: request.url(),
      postData: request.postData(),
    });
    if (record.classification === "unmatched" || record.classification === "effecting") {
      await route.fulfill({
        status: 599,
        contentType: "application/json",
        body: JSON.stringify({
          error: record.classification,
          path: record.path,
          effectKind: record.effectKind ?? null,
        }),
      });
      return;
    }
    await route.fallback();
  });
}
