import { afterEach, describe, expect, it, vi } from "vitest";
import { touchClubAccess } from "./club-access-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("touchClubAccess", () => {
  it("sends one bodyless club-scoped PUT and parses only the coarse timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ lastClubAccessAt: "2026-08-29T01:02:03Z" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(touchClubAccess("reading-sai")).resolves.toEqual({
      lastClubAccessAt: "2026-08-29T01:02:03Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/me/club-access?clubSlug=reading-sai",
      expect.objectContaining({ method: "PUT", cache: "no-store" }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("rejects tracking metadata even when the timestamp is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ lastClubAccessAt: "2026-08-29T01:02:03Z", route: "/app/notes" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(touchClubAccess("reading-sai")).rejects.toThrow();
  });
});
