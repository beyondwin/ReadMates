import { afterEach, describe, expect, it, vi } from "vitest";
import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";

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

  it("returns undefined for 204 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readmatesFetch("/api/app/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws a typed API error while preserving the existing failure message", async () => {
    const response = new Response(JSON.stringify({ message: "failed" }), {
      status: 500,
      statusText: "Internal Server Error",
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    try {
      await readmatesFetch("/api/app/me");
      throw new Error("Expected readmatesFetch to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty("message", "ReadMates API failed: 500");
      expect(isReadmatesApiError(error)).toBe(true);

      if (isReadmatesApiError(error)) {
        expect(error.status).toBe(500);
        expect(error.metadata).toMatchObject({
          status: 500,
          statusText: "Internal Server Error",
        });
        expect(error.response).toBe(response);
      }
    }
  });
});
