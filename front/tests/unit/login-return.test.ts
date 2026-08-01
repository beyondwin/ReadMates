import { describe, expect, it } from "vitest";
import { loginPathForReturnTo, oauthHrefForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";

describe("login return helpers", () => {
  it("keeps safe relative app paths with query and hash", () => {
    expect(safeRelativeReturnTo("/clubs/reading-sai/app?from=login#note")).toBe(
      "/clubs/reading-sai/app?from=login#note",
    );
  });

  it("rejects absolute protocol-relative backslash and control-character targets", () => {
    expect(safeRelativeReturnTo("https://evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("//evil.example/app")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\\evil")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/app\nnext")).toBeNull();
    expect(safeRelativeReturnTo("/%5Clogin")).toBeNull();
    expect(safeRelativeReturnTo("/%0Alogin")).toBeNull();
    expect(safeRelativeReturnTo(`/${"a".repeat(2048)}`)).toBeNull();
  });

  it("does not preserve login reset invite oauth or root paths", () => {
    expect(safeRelativeReturnTo("/login")).toBeNull();
    expect(safeRelativeReturnTo("/oauth2/authorization/google")).toBeNull();
    expect(safeRelativeReturnTo("/clubs/reading-sai/invite/token")).toBeNull();
    expect(safeRelativeReturnTo("/reset-password/token")).toBeNull();
    expect(safeRelativeReturnTo("/")).toBeNull();
  });

  it("classifies excluded routes with React Router case insensitivity", () => {
    expect(safeRelativeReturnTo("/LOGIN")).toBeNull();
    expect(safeRelativeReturnTo("/%4Cogin")).toBeNull();
  });

  it("rejects dot-segment paths that browsers resolve to excluded route families", () => {
    [
      "/member/..",
      "/member/../login",
      "/member/../oauth2/authorization/google",
      "/member/../login/oauth2/code/google",
      "/member/../reset-password/token",
      "/member/../invite/token",
      "/clubs/reading-sai/app/../invite/token",
    ].forEach((returnTo) => expect(safeRelativeReturnTo(returnTo), returnTo).toBeNull());
  });

  it("rejects percent-encoded static segments that React Router resolves to excluded routes", () => {
    [
      "/%2e%2e",
      "/%6Cogin",
      "/%6fauth2/authorization/google",
      "/%6cogin/%6fauth2/code/google",
      "/%72eset-password/token",
      "/%69nvite/token",
      "/clubs/reading-sai/%69nvite/token",
    ].forEach((returnTo) => expect(safeRelativeReturnTo(returnTo), returnTo).toBeNull());
  });

  it("rejects malformed percent escapes in paths and preserved suffixes", () => {
    ["/%", "/%2", "/%GG", "/clubs/reading-sai/app?from=%GG"].forEach((returnTo) =>
      expect(safeRelativeReturnTo(returnTo), returnTo).toBeNull(),
    );
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

  it("adds only the ReadMates account-choice intent when recovery requests it", () => {
    expect(oauthHrefForReturnTo("/clubs/reading-sai/app", { chooseAccount: true })).toBe(
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&chooseAccount=true",
    );
    expect(oauthHrefForReturnTo(null, { chooseAccount: true })).toBe(
      "/oauth2/authorization/google?chooseAccount=true",
    );
    expect(oauthHrefForReturnTo("https://evil.example/app", { chooseAccount: true })).toBe(
      "/oauth2/authorization/google?chooseAccount=true",
    );
  });
});
