import { describe, expect, it } from "vitest";
import { adminCommandRecovery } from "./platform-admin-command-recovery";

describe("adminCommandRecovery", () => {
  it.each([
    "PREVIEW_NOT_FOUND",
    "PREVIEW_EXPIRED",
    "PREVIEW_CONSUMED",
    "PREVIEW_MISMATCH",
  ])("requires a fresh preview for %s", (code) => {
    expect(adminCommandRecovery({ code }).kind).toBe("RESTART_PREVIEW");
  });

  it("requires an authoritative refresh after revision conflict", () => {
    expect(adminCommandRecovery({ code: "REVISION_CONFLICT" }).kind).toBe(
      "REFRESH_STATE",
    );
  });

  it("distinguishes a conflicting intent from an in-progress replay", () => {
    expect(adminCommandRecovery({ code: "IDEMPOTENCY_CONFLICT" }).kind).toBe(
      "RESTART_INTENT",
    );
    expect(adminCommandRecovery({ code: "COMMAND_IN_PROGRESS" }).kind).toBe(
      "RETRY_SAME_INTENT",
    );
    expect(adminCommandRecovery(new Error("response lost")).kind).toBe(
      "RETRY_SAME_INTENT",
    );
  });

  it.each([
    "CLUB_SLUG_CONFLICT",
    "CLUB_DOMAIN_CONFLICT",
    "CLUB_PUBLISH_NOT_ALLOWED",
    "CLUB_HOST_REQUIRED",
    "EXISTING_USER_CONFIRMATION_REQUIRED",
    "INVALID_IDEMPOTENCY_KEY",
    "INVALID_CLUB",
    "INVALID_DOMAIN",
  ])("requires draft correction for %s", (code) => {
    expect(adminCommandRecovery({ code }).kind).toBe("CORRECT_DRAFT");
  });
});
