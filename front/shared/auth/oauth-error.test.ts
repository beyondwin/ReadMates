import { describe, expect, it } from "vitest";
import {
  classifyOAuthError,
  isHtmlDocumentNavigation,
  oauthErrorLocation,
  oauthErrorViewModel,
} from "./oauth-error";

describe("OAuth error contract", () => {
  it.each([
    [404, "authorization", "oauth_unavailable"],
    [404, "callback", "unexpected"],
    [400, "authorization", "request_invalid"],
    [401, "authorization", "session_required"],
    [403, "authorization", "access_denied"],
    [409, "authorization", "request_expired"],
    [410, "callback", "request_expired"],
    [429, "authorization", "rate_limited"],
    [500, "authorization", "internal_error"],
    [502, "authorization", "service_unavailable"],
    [503, "callback", "service_unavailable"],
    [504, "authorization", "service_unavailable"],
    [599, "callback", "service_unavailable"],
    [418, "authorization", "unexpected"],
    [null, "authorization", "service_unavailable"],
  ] as const)("classifies status %s during %s as %s", (status, phase, expected) => {
    expect(classifyOAuthError(status, phase)).toBe(expected);
  });

  it("limits translation to HTML document navigation", () => {
    expect(isHtmlDocumentNavigation(new Headers({ Accept: "text/html,application/xhtml+xml" }))).toBe(true);
    expect(
      isHtmlDocumentNavigation(new Headers({ Accept: "text/html", "Sec-Fetch-Dest": "document" })),
    ).toBe(true);
    expect(
      isHtmlDocumentNavigation(new Headers({ Accept: "text/html", "Sec-Fetch-Dest": "empty" })),
    ).toBe(false);
    expect(isHtmlDocumentNavigation(new Headers({ Accept: "application/json" }))).toBe(false);
    expect(isHtmlDocumentNavigation(new Headers())).toBe(false);
  });

  it("keeps only an allowlisted kind and safe relative return path in the error location", () => {
    const location = oauthErrorLocation({
      requestUrl:
        "https://readmates.example.test/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinClub=reading-sai&joinIntent=opaque-placeholder&state=provider-placeholder&inviteToken=invite-placeholder",
      status: 404,
      phase: "authorization",
    });

    expect(location).toBe(
      "/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
    expect(location).not.toMatch(/joinIntent|state|inviteToken|opaque-placeholder|provider-placeholder/);
  });

  it.each([
    "https://other.example.test/app",
    "//other.example.test/app",
    "/oauth2/authorization/google",
    "/auth/error",
    "/",
    "/clubs/reading-sai/app%ZZ",
  ])("drops unsafe return path %s", (returnTo) => {
    const sourceUrl = new URL("https://readmates.example.test/oauth2/authorization/google");
    sourceUrl.searchParams.set("returnTo", returnTo);

    expect(
      oauthErrorLocation({
        requestUrl: sourceUrl.toString(),
        status: 404,
        phase: "authorization",
      }),
    ).toBe("/auth/error?kind=oauth_unavailable");
  });

  it("falls back unknown kinds without exposing the raw value", () => {
    const view = oauthErrorViewModel("provider_internal_detail", "/clubs/reading-sai/app");

    expect(view.kind).toBe("unexpected");
    expect(view.heading).toBe("요청을 계속할 수 없습니다.");
    expect(view.primaryAction).toEqual({
      href: "/clubs/reading-sai/app",
      label: "클럽으로 돌아가기",
    });
    expect(JSON.stringify(view)).not.toContain("provider_internal_detail");
  });

  it.each([
    ["oauth_unavailable", "로그인을 시작할 수 없습니다.", "클럽으로 돌아가기"],
    ["session_required", "로그인을 다시 시작해 주세요.", "로그인으로 이동"],
    ["access_denied", "이 요청을 계속할 수 없습니다.", "클럽으로 돌아가기"],
    ["request_expired", "로그인 요청이 만료되었습니다.", "클럽으로 돌아가기"],
    ["rate_limited", "요청이 잠시 많습니다.", "클럽으로 돌아가기"],
    ["internal_error", "요청을 마치지 못했습니다.", "다시 시작하기"],
    ["service_unavailable", "로그인 서비스 연결이 원활하지 않습니다.", "잠시 후 다시 시도"],
  ] as const)("maps %s to fixed recovery copy", (kind, heading, actionLabel) => {
    const view = oauthErrorViewModel(kind, "/clubs/reading-sai/app");

    expect(view.heading).toBe(heading);
    expect(view.primaryAction.label).toBe(actionLabel);
    expect(view.secondaryAction).toEqual({ href: "/", label: "공개 홈" });
    expect(view.heading).not.toMatch(/\b(?:404|500|503)\b/);
  });
});
