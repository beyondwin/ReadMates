import { describe, expect, it } from "vitest";
import { loginPathForReturnTo, oauthHrefForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";

describe("login return helpers", () => {
  it("keeps safe relative app paths with query and hash", () => {
    expect(safeRelativeReturnTo("/clubs/reading-sai/app/sessions/session-1?tab=notes#top")).toBe(
      "/clubs/reading-sai/app/sessions/session-1?tab=notes#top",
    );
  });

  it("rejects absolute protocol-relative backslash and control-character targets", () => {
    expect(safeRelativeReturnTo("https://evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("//evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\\evil")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\nnext")).toBeNull();
  });

  it("does not preserve login reset invite oauth or root paths", () => {
    expect(safeRelativeReturnTo("/login")).toBeNull();
    expect(safeRelativeReturnTo("/oauth2/authorization/google")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/invite/token")).toBeNull();
    expect(safeRelativeReturnTo("/reset-password/token")).toBeNull();
    expect(safeRelativeReturnTo("/")).toBeNull();
  });

  it("builds login and oauth urls with encoded returnTo only when safe", () => {
    expect(loginPathForReturnTo("/clubs/reading-sai/app/feedback/session-1?from=email")).toBe(
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
    expect(oauthHrefForReturnTo("/clubs/reading-sai/app/feedback/session-1?from=email")).toBe(
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
    expect(loginPathForReturnTo("https://evil.example/app")).toBe("/login");
    expect(oauthHrefForReturnTo("//evil.example/app")).toBe("/oauth2/authorization/google");
  });
});
