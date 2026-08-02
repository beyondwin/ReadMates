import { afterEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse } from "@/shared/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("session expiry policy in readmatesFetchResponse", () => {
  it("forces reauthentication by default for unscoped member reads", async () => {
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
    expect(assignMock).toHaveBeenCalledWith("/login?returnTo=%2Fapp");
    expect(causes).toEqual([]);
  });

  it("retains a mounted guest-readable read only with explicit recovery policy", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const causes: string[] = [];
    window.addEventListener("readmates:session-expired", ((event: CustomEvent) => {
      causes.push(event.detail.cause);
    }) as EventListener, { once: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "#note",
      pathname: "/clubs/reading-sai/app/notes",
      search: "?sessionId=s1",
    });

    await expect(
      readmatesFetchResponse(
        "/api/notes/feed?sessionId=s1",
        undefined,
        { clubSlug: "reading-sai" },
        { sessionExpiry: "recover-read" },
      ),
    ).rejects.toThrow("ReadMatesSessionExpiredError");

    expect(assignMock).not.toHaveBeenCalled();
    expect(causes).toEqual(["read"]);
  });

  it("retains an unsaved scoped write only with explicit recovery policy", async () => {
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
      readmatesFetchResponse(
        "/api/sessions/current/questions",
        { method: "PUT" },
        { clubSlug: "reading-sai" },
        { sessionExpiry: "recover-write" },
      ),
    ).rejects.toThrow("ReadMatesSessionExpiredError");
    expect(assignMock).not.toHaveBeenCalled();
    expect(causes).toEqual(["write"]);
  });
});
