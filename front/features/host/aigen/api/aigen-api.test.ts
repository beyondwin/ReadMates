import { afterEach, describe, expect, it, vi } from "vitest";
import { AIGEN_OPENAI_DEFAULT_MODEL_ID } from "../ui/aigen-model-options";
import {
  cancelGeneration,
  commitGeneration,
  getClubAiDefault,
  getJob,
  getRecentJob,
  putClubAiDefault,
  regenerateItem,
  startGeneration,
} from "./aigen-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startGeneration", () => {
  it("POSTs multipart FormData to /api/host/sessions/{sid}/ai-generate/jobs and lets the browser set the Content-Type boundary", async () => {
    const fetchMock = captureFetch(
      jsonResponse(
        {
          jobId: "11111111-1111-1111-1111-111111111111",
          status: "PENDING",
          expiresAt: "2026-05-16T18:00:00Z",
        },
        202,
      ),
    );

    const transcript = new File(["hello transcript"], "transcript.txt", {
      type: "text/plain",
    });
    const result = await startGeneration("sid-1", {
      transcript,
      model: "claude-sonnet-4-6",
      authorNameMode: "alias",
      instructions: "be brief",
    });

    expect(result.jobId).toBe("11111111-1111-1111-1111-111111111111");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid-1/ai-generate/jobs");
    expect(init.method).toBe("POST");

    const headers = init.headers as Headers;
    // Content-Type must NOT be set explicitly — the browser sets multipart boundary.
    expect(headers.get("Content-Type")).toBeNull();

    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("transcript")).toBeInstanceOf(File);
    const body = form.get("body");
    expect(body).toBeInstanceOf(Blob);
    const bodyText = await (body as Blob).text();
    const parsed = JSON.parse(bodyText) as {
      model: string;
      authorNameMode: string;
      instructions: string;
    };
    expect(parsed.model).toBe("claude-sonnet-4-6");
    expect(parsed.authorNameMode).toBe("alias");
    expect(parsed.instructions).toBe("be brief");
  });

  it("omits optional fields when not provided", async () => {
    const fetchMock = captureFetch(
      jsonResponse({ jobId: "j", status: "PENDING", expiresAt: "x" }, 202),
    );

    await startGeneration("sid-9", {
      transcript: new File(["t"], "t.txt", { type: "text/plain" }),
      authorNameMode: "real",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const bodyText = await (form.get("body") as Blob).text();
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    expect(parsed.authorNameMode).toBe("real");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed).not.toHaveProperty("instructions");
  });

  it("url-encodes the session id", async () => {
    const fetchMock = captureFetch(
      jsonResponse({ jobId: "j", status: "PENDING", expiresAt: "x" }, 202),
    );

    await startGeneration("sid with space", {
      transcript: new File(["t"], "t.txt", { type: "text/plain" }),
      authorNameMode: "real",
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid%20with%20space/ai-generate/jobs");
  });
});

describe("getJob", () => {
  it("GETs /api/host/sessions/{sid}/ai-generate/jobs/{jobId}", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        jobId: "job-1",
        status: "RUNNING",
        stage: "GENERATING_SUMMARY",
        progressPct: 42,
        model: "claude-sonnet-4-6",
        result: null,
        error: null,
        tokens: { input: 10, cachedInput: 0, output: 5 },
        costEstimateUsd: "0.01",
        warnings: [],
      }),
    );

    const result = await getJob("sid-1", "job-1");
    expect(result.status).toBe("RUNNING");
    expect(result.progressPct).toBe(42);
    expect(result.tokens?.cachedInput).toBe(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job-1");
    expect(init?.method ?? "GET").toBe("GET");
  });
});

describe("getRecentJob", () => {
  it("GETs the recent session AI job and normalizes 204 to null", async () => {
    const fetchMock = captureFetch(new Response(null, { status: 204 }));

    await expect(getRecentJob("session-1")).resolves.toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/bff/api/host/sessions/session-1/ai-generate/jobs/recent");
    expect(init?.method ?? "GET").toBe("GET");
  });
});

describe("regenerateItem", () => {
  it("POSTs JSON to /jobs/{jobId}/regenerate", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        item: "summary",
        value: { summary: "rewritten" },
        tokens: { input: 1, cachedInput: 0, output: 2 },
        costEstimateUsd: "0.001",
        warnings: [],
      }),
    );

    const result = await regenerateItem("sid-1", "job-1", {
      item: "summary",
      model: AIGEN_OPENAI_DEFAULT_MODEL_ID,
      instructions: "tighter",
    });
    expect(result.item).toBe("summary");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job-1/regenerate",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({
      item: "summary",
      model: AIGEN_OPENAI_DEFAULT_MODEL_ID,
      instructions: "tighter",
    });
  });
});

describe("commitGeneration", () => {
  it("POSTs JSON to /jobs/{jobId}/commit", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        sessionId: "sid-1",
        publication: { summary: "s" },
        highlights: [],
        oneLineReviews: [],
        feedbackDocument: {
          uploaded: true,
          fileName: "f.md",
          title: "t",
          uploadedAt: null,
        },
      }),
    );

    await commitGeneration("sid-1", "job-1", { recordVisibility: "MEMBER" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job-1/commit");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({ recordVisibility: "MEMBER" });
  });

  it("forwards the optional overridden result", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        sessionId: "sid-1",
        publication: { summary: "s" },
        highlights: [],
        oneLineReviews: [],
        feedbackDocument: {
          uploaded: true,
          fileName: "f.md",
          title: "t",
          uploadedAt: null,
        },
      }),
    );

    await commitGeneration("sid-1", "job-1", {
      recordVisibility: "PUBLIC",
      result: {
        format: "readmates-session-import:v1",
        sessionNumber: 3,
        bookTitle: "B",
        meetingDate: "2026-05-16",
        summary: "s",
        highlights: [],
        oneLineReviews: [],
        feedbackDocumentFileName: "f.md",
        feedbackDocumentMarkdown: "# t",
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      result: { sessionNumber: number };
    };
    expect(parsed.result.sessionNumber).toBe(3);
  });
});

describe("cancelGeneration", () => {
  it("issues DELETE /jobs/{jobId} and resolves on 204", async () => {
    const fetchMock = captureFetch(new Response(null, { status: 204 }));

    await expect(cancelGeneration("sid-1", "job-1")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job-1");
    expect(init.method).toBe("DELETE");
  });

  it("throws when DELETE returns a non-2xx status", async () => {
    captureFetch(
      new Response(JSON.stringify({ code: "JOB_EXPIRED", title: "Gone", status: 410 }), {
        status: 410,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(cancelGeneration("sid-1", "job-1")).rejects.toBeDefined();
  });
});

describe("getClubAiDefault", () => {
  it("GETs /api/host/clubs/{slug}/ai-defaults", async () => {
    const fetchMock = captureFetch(jsonResponse({ defaultModel: "claude-sonnet-4-6" }));

    const result = await getClubAiDefault("my-club");
    expect(result.defaultModel).toBe("claude-sonnet-4-6");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/bff/api/host/clubs/my-club/ai-defaults");
    expect(init?.method ?? "GET").toBe("GET");
  });
});

describe("putClubAiDefault", () => {
  it("PUTs JSON to /api/host/clubs/{slug}/ai-defaults", async () => {
    const fetchMock = captureFetch(new Response(null, { status: 200 }));

    await putClubAiDefault("my-club", { defaultModel: AIGEN_OPENAI_DEFAULT_MODEL_ID });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/clubs/my-club/ai-defaults");
    expect(init.method).toBe("PUT");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({ defaultModel: AIGEN_OPENAI_DEFAULT_MODEL_ID });
  });
});
