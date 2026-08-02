import { afterEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse } from "@/shared/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("session expiry signals in readmatesFetchResponse", () => {
  it("retains the current read route and signals a recoverable read expiry", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const causes: string[] = [];
    window.addEventListener("readmates:session-expired", ((event: CustomEvent) => {
      causes.push(event.detail.cause);
    }) as EventListener, { once: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/app",
      search: "",
    });

    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow("ReadMatesSessionExpiredError");
    expect(assignMock).not.toHaveBeenCalled();
    expect(causes).toEqual(["read"]);
  });

  it("retains an unsaved write route and signals a write expiry", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const causes: string[] = [];
    window.addEventListener("readmates:session-expired", ((event: CustomEvent) => {
      causes.push(event.detail.cause);
    }) as EventListener, { once: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/app",
      search: "",
    });

    await expect(
      readmatesFetchResponse("/api/sessions/current/questions", { method: "PUT" }),
    ).rejects.toThrow("ReadMatesSessionExpiredError");
    expect(assignMock).not.toHaveBeenCalled();
    expect(causes).toEqual(["write"]);
  });
});
