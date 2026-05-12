import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse, __resetRedirectGuardForTest } from "@/shared/api/client";

beforeEach(() => {
  __resetRedirectGuardForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("redirect guard in readmatesFetchResponse", () => {
  it("redirects on first 401", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/app",
      search: "",
    });

    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow();
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it("skips redirect on rapid second 401 within cool-off and throws ReadMatesSessionExpiredError", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/app",
      search: "",
    });

    // First 401 — triggers redirect
    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow();
    expect(assignMock).toHaveBeenCalledTimes(1);

    // Advance time but stay inside cool-off (1200ms < 1500ms)
    vi.advanceTimersByTime(1200);

    // Second 401 within cool-off — no redirect
    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow("ReadMatesSessionExpiredError");
    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it("allows redirect again after cool-off expires", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/app",
      search: "",
    });

    // First 401 — triggers redirect
    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow();
    expect(assignMock).toHaveBeenCalledTimes(1);

    // Advance time beyond cool-off (1500ms + 1)
    vi.advanceTimersByTime(1501);

    // Second 401 after cool-off — redirect fires again
    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow();
    expect(assignMock).toHaveBeenCalledTimes(2);
  });
});
