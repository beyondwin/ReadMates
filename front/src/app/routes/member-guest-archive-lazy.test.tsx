import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/src/pages/guest-archive");
  vi.resetModules();
});

describe("member route guest archive boundary", () => {
  it("does not evaluate the guest archive presentation while route definitions load", async () => {
    let guestArchiveEvaluated = false;
    vi.resetModules();
    vi.doMock("@/src/pages/guest-archive", () => {
      guestArchiveEvaluated = true;
      return { GuestArchiveContent: () => null };
    });

    await import("./member");

    expect(guestArchiveEvaluated).toBe(false);
  });
});
