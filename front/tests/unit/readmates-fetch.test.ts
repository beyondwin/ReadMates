import { afterEach, describe, expect, it, vi } from "vitest";
import { readmatesFetchResponse } from "@/shared/api/readmates";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readmatesFetchResponse", () => {
  it("redirects to login and rejects when the BFF returns 401", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign: assignMock });

    await expect(readmatesFetchResponse("/api/app/me")).rejects.toThrow("ReadMates session expired");

    expect(fetch).toHaveBeenCalledWith(
      "/api/bff/api/app/me",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("preserves FormData uploads by leaving Content-Type unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const formData = new FormData();
    formData.append("file", new File(["feedback"], "feedback.md", { type: "text/markdown" }));
    vi.stubGlobal("fetch", fetchMock);

    await readmatesFetchResponse("/api/host/sessions/session-1/feedback-document", {
      method: "POST",
      body: formData,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/sessions/session-1/feedback-document",
      expect.objectContaining({
        body: formData,
        cache: "no-store",
        method: "POST",
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).has("Content-Type")).toBe(false);
  });
});
