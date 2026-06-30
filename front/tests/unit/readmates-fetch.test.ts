import { afterEach, describe, expect, it, vi } from "vitest";
import { readmatesApiPath, readmatesFetch, readmatesFetchResponse, ReadMatesSessionExpiredError, __resetRedirectGuardForTest } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";
import { frontendObservability } from "@/shared/observability/frontend-observability";
import { normalizedClubSlug } from "@/shared/security/club-slug";

afterEach(() => {
  __resetRedirectGuardForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("readmatesFetchResponse", () => {
  it("normalizes club slugs through the shared BFF helper contract", () => {
    expect(normalizedClubSlug(" Reading-Sai ")).toBe("reading-sai");
    expect(normalizedClubSlug("bad--slug")).toBe("");
    expect(normalizedClubSlug("bad_slug")).toBe("");
    expect(normalizedClubSlug(null)).toBe("");
  });

  it("redirects to login and rejects when the BFF returns 401", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      assign: assignMock,
      hash: "",
      pathname: "/clubs/reading-sai/app/feedback/session-1",
      search: "?from=email",
    });

    await expect(readmatesFetchResponse("/api/app/me", undefined, { clubSlug: undefined })).rejects.toThrow(
      ReadMatesSessionExpiredError,
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/bff/api/app/me",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
    expect(assignMock).toHaveBeenCalledWith(
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
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

  it("adds the current scoped app club slug to BFF API requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/clubs/reading-sai/app/host/sessions/new");

    await readmatesFetchResponse("/api/host/dashboard?draft=true");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/dashboard?draft=true&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not overwrite an explicit club slug on BFF API requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/clubs/reading-sai/app");

    await readmatesFetchResponse("/api/auth/me?clubSlug=sample-book-club");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me?clubSlug=sample-book-club",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("adds an explicit club context to club-scoped auth preview requests", () => {
    expect(
      readmatesApiPath("/api/clubs/reading-sai/invitations/raw-token", {
        clubSlug: "reading-sai",
      }),
    ).toBe("/api/clubs/reading-sai/invitations/raw-token?clubSlug=reading-sai");
  });

  it("does not use browser location fallback when an explicit empty API context is provided", () => {
    window.history.pushState({}, "", "/clubs/reading-sai/app");

    expect(readmatesApiPath("/api/host/dashboard", { clubSlug: undefined })).toBe("/api/host/dashboard");
  });

  it("keeps explicit empty API context through readmatesFetchResponse", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/clubs/reading-sai/app");

    await readmatesFetchResponse("/api/host/dashboard", undefined, { clubSlug: undefined });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/dashboard",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns undefined for 204 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readmatesFetch("/api/app/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws API errors with parsed server code message and status", async () => {
    const response = new Response(
      JSON.stringify({
        code: "SESSION_NOT_FOUND",
        message: "요청한 세션을 찾을 수 없습니다.",
        status: 404,
      }),
      {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(readmatesFetch("/api/archive/sessions/missing")).rejects.toMatchObject({
      name: "ReadmatesApiError",
      message: "요청한 세션을 찾을 수 없습니다.",
      status: 404,
      code: "SESSION_NOT_FOUND",
      fallback: false,
    });
  });

  it("throws API errors with parsed RFC 7807 problem detail", async () => {
    const response = new Response(
      JSON.stringify({
        type: "/problems/aigen/cost-cap-exceeded",
        title: "Cost cap exceeded",
        status: 429,
        detail: "이번 달 AI 생성 비용 한도를 초과했습니다.",
        code: "COST_CAP_EXCEEDED",
      }),
      {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Content-Type": "application/problem+json" },
      },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(readmatesFetch("/api/host/sessions/s1/ai-generate/jobs")).rejects.toMatchObject({
      name: "ReadmatesApiError",
      message: "이번 달 AI 생성 비용 한도를 초과했습니다.",
      status: 429,
      code: "COST_CAP_EXCEEDED",
      fallback: false,
    });
  });

  it("throws API errors with safe fallback body when the response body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(readmatesFetch("/api/host/dashboard")).rejects.toMatchObject({
      name: "ReadmatesApiError",
      message: "이 작업을 수행할 권한이 없습니다.",
      status: 403,
      code: "PERMISSION_DENIED",
      fallback: true,
    });
  });

  it("throws API errors with safe fallback body when the response body is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{not-json", {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(readmatesFetch("/api/app/me")).rejects.toMatchObject({
      name: "ReadmatesApiError",
      status: 500,
      code: "INTERNAL_ERROR",
      fallback: true,
    });
  });

  it("records frontend API failure telemetry with safe path grouping", async () => {
    const recordSpy = vi.spyOn(frontendObservability, "record");
    const flushSpy = vi.spyOn(frontendObservability, "flush").mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "INTERNAL_ERROR", message: "server failed", status: 500 }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readmatesFetch("/api/host/sessions/session-7?clubSlug=reading-sai")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    expect(recordSpy).toHaveBeenCalledWith({
      type: "API_FAILURE",
      routePattern: expect.any(String),
      apiGroup: "host-session",
      statusClass: "5xx",
      errorCode: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(recordSpy.mock.calls)).not.toContain("reading-sai");
    expect(JSON.stringify(recordSpy.mock.calls)).not.toContain("session-7");
    expect(flushSpy).toHaveBeenCalled();
  });

  it("throws API errors with safe fallback body when body status disagrees with HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "SESSION_NOT_FOUND",
            message: "요청한 세션을 찾을 수 없습니다.",
            status: 404,
          }),
          {
            status: 500,
            statusText: "Internal Server Error",
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(readmatesFetch("/api/archive/sessions/missing")).rejects.toMatchObject({
      name: "ReadmatesApiError",
      message: "서비스 오류가 발생했습니다.",
      status: 500,
      code: "INTERNAL_ERROR",
      fallback: true,
    });
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
      expect(error).toHaveProperty("message", "서비스 오류가 발생했습니다.");
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
