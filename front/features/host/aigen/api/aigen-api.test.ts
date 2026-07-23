import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiGenerationApiError,
  cancelGeneration,
  commitGeneration,
  expandEvidence,
  getAvailableModels,
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
      instructions: string;
    };
    expect(parsed.model).toBe("claude-sonnet-4-6");
    expect(parsed).not.toHaveProperty("authorNameMode");
    expect(parsed.instructions).toBe("be brief");
  });

  it("omits optional fields when not provided", async () => {
    const fetchMock = captureFetch(
      jsonResponse({ jobId: "j", status: "PENDING", expiresAt: "x" }, 202),
    );

    await startGeneration("sid-9", {
      transcript: new File(["t"], "t.txt", { type: "text/plain" }),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const bodyText = await (form.get("body") as Blob).text();
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("authorNameMode");
    expect(parsed).not.toHaveProperty("model");
    expect(parsed).not.toHaveProperty("instructions");
  });

  it("url-encodes the session id", async () => {
    const fetchMock = captureFetch(
      jsonResponse({ jobId: "j", status: "PENDING", expiresAt: "x" }, 202),
    );

    await startGeneration("sid with space", {
      transcript: new File(["t"], "t.txt", { type: "text/plain" }),
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid%20with%20space/ai-generate/jobs");
  });
});

describe("getAvailableModels", () => {
  it("loads the authorized session-scoped model list", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        models: [
          { id: "claude-sonnet-4-6", provider: "CLAUDE", isDefault: true },
        ],
      }),
    );

    await expect(getAvailableModels("sid /1")).resolves.toMatchObject({
      models: [{ id: "claude-sonnet-4-6", isDefault: true }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/host/sessions/sid%20%2F1/ai-generate/models",
    );
  });
});

describe("AI-specific problem details", () => {
  it("retains bounded safe invalid speaker labels from a trusted 422 response", async () => {
    captureFetch(
      jsonResponse(
        {
          type: "about:blank",
          title: "Unprocessable Entity",
          status: 422,
          detail: "대본의 화자 이름을 확인해 주세요.",
          code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
          invalidSpeakerLabels: ["화자 하나", "화자 둘"],
        },
        422,
      ),
    );

    const error = await startGeneration("sid-1", {
      transcript: new File(["화자 하나 00:00\n안녕하세요"], "transcript.txt", {
        type: "text/plain",
      }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiGenerationApiError);
    expect(error).toMatchObject({
      status: 422,
      problem: {
        code: "TRANSCRIPT_SPEAKER_NOT_MEMBER",
        detail: "대본의 화자 이름을 확인해 주세요.",
        invalidSpeakerLabels: ["화자 하나", "화자 둘"],
      },
    });
  });

  it("does not trust non-JSON upstream failures", async () => {
    captureFetch(new Response("provider secret shaped failure", { status: 502 }));

    const error = await getJob("sid-1", "job-1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiGenerationApiError);
    expect(error).toMatchObject({
      status: 502,
      problem: {
        code: "AI_GENERATION_REQUEST_FAILED",
        detail: "AI 요청을 처리할 수 없습니다.",
      },
    });
  });
});

describe("getJob", () => {
  it("rejects a malformed success payload in development instead of trusting an unchecked cast", async () => {
    captureFetch(
      jsonResponse({
        jobId: "job-1",
        status: "RUNNING",
        stage: "GENERATING_SUMMARY",
        progressPct: 42,
        model: "claude-sonnet-4-6",
        result: null,
        error: null,
        tokens: null,
        costEstimateUsd: "0.01",
      }),
    );

    await expect(getJob("sid-1", "job-1")).rejects.toThrow();
  });

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

  it("keeps grounded drafts inaccessible until result, valid grounding, revision, and evidence are complete", async () => {
    const leakedResult = {
      format: "readmates-session-import:v1",
      sessionNumber: 1,
      bookTitle: "합성 책",
      meetingDate: "2026-07-14",
      summary: "노출되면 안 되는 초안",
      highlights: [],
      oneLineReviews: [],
      feedbackDocumentFileName: "feedback.md",
      feedbackDocumentMarkdown: "# 초안",
    };
    captureFetch(
      jsonResponse({
        jobId: "job-1",
        status: "RUNNING",
        stage: "VALIDATING_GROUNDING",
        progressPct: 90,
        model: "gpt-5.4-mini",
        result: leakedResult,
        error: null,
        tokens: null,
        costEstimateUsd: "0.00",
        warnings: [],
        revision: 1,
        groundingStatus: "PENDING",
        evidence: [],
        sectionReviewStatuses: { SUMMARY: "PENDING_REVIEW" },
      }),
    );

    await expect(getJob("sid-1", "job-1")).resolves.toMatchObject({
      result: null,
      evidence: null,
      sectionReviewStatuses: null,
    });
  });

  it("retains only a complete grounded success payload", async () => {
    const result = {
      format: "readmates-session-import:v1",
      sessionNumber: 1,
      bookTitle: "합성 책",
      meetingDate: "2026-07-14",
      summary: "검증된 결과",
      highlights: [],
      oneLineReviews: [],
      feedbackDocumentFileName: "feedback.md",
      feedbackDocumentMarkdown: "# 결과",
    };
    captureFetch(
      jsonResponse({
        jobId: "job-1",
        status: "SUCCEEDED",
        stage: "READY",
        progressPct: 100,
        model: "gpt-5.4-mini",
        result,
        error: null,
        tokens: null,
        costEstimateUsd: "0.00",
        warnings: [],
        revision: 2,
        groundingStatus: "VALID",
        evidence: [],
        sectionReviewStatuses: { SUMMARY: "PENDING_REVIEW" },
      }),
    );

    await expect(getJob("sid-1", "job-1")).resolves.toMatchObject({
      revision: 2,
      result: { summary: "검증된 결과" },
      evidence: [],
    });
  });

  it("retains a legacy result when server-shaped grounded fields are null", async () => {
    const result = {
      format: "readmates-session-import:v1",
      sessionNumber: 1,
      bookTitle: "합성 책",
      meetingDate: "2026-07-14",
      summary: "레거시 결과",
      highlights: [],
      oneLineReviews: [],
      feedbackDocumentFileName: "feedback.md",
      feedbackDocumentMarkdown: "# 결과",
    };
    captureFetch(jsonResponse({
      jobId: "legacy-job",
      status: "SUCCEEDED",
      stage: "READY",
      progressPct: 100,
      model: "gpt-5.4-mini",
      result,
      error: null,
      tokens: null,
      costEstimateUsd: "0.00",
      warnings: [],
      revision: null,
      groundingStatus: null,
      evidence: null,
      sectionReviewStatuses: null,
    }));

    await expect(getJob("sid-1", "legacy-job")).resolves.toMatchObject({
      result: { summary: "레거시 결과" },
    });
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

  it("validates and returns recent job metadata", async () => {
    captureFetch(
      jsonResponse({
        jobId: "job-1",
        status: "FAILED",
        stage: null,
        progressPct: 0,
        model: "gpt-5.4-mini",
        error: { code: "PROVIDER_UNAVAILABLE", message: "safe" },
        costEstimateUsd: "0.0000",
        createdAt: "2026-07-14T00:00:00Z",
        lastUpdatedAt: "2026-07-14T00:01:00Z",
        expiresAt: "2026-07-14T06:00:00Z",
        availableActions: ["START_NEW"],
      }),
    );

    await expect(getRecentJob("session-1")).resolves.toMatchObject({
      jobId: "job-1",
      availableActions: ["START_NEW"],
    });
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
      model: "gpt-5.4-mini",
      instructions: "tighter",
      expectedRevision: 7,
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
      model: "gpt-5.4-mini",
      instructions: "tighter",
      expectedRevision: 7,
    });
  });
});

describe("commitGeneration", () => {
  it("POSTs JSON to /jobs/{jobId}/commit", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        sessionId: "sid-1",
        status: "COMMITTED",
        recovered: false,
        participantUpdatesCount: 1,
        draftRevision: 6,
        baseLiveRevision: 2,
        liveApplied: false,
      }),
    );

    await commitGeneration("sid-1", "job-1", {
      recordVisibility: "MEMBER",
      expectedRevision: 3,
      sectionReviews: {
        SUMMARY: "AI_GROUNDED_REVIEWED",
        HIGHLIGHTS: "AI_GROUNDED_REVIEWED",
        ONE_LINE_REVIEWS: "AI_GROUNDED_REVIEWED",
        FEEDBACK_DOCUMENT: "AI_GROUNDED_REVIEWED",
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job-1/commit");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({ recordVisibility: "MEMBER", expectedRevision: 3 });
  });

  it("forwards the optional overridden result", async () => {
    const fetchMock = captureFetch(
      jsonResponse({
        sessionId: "sid-1",
        status: "COMMITTED",
        recovered: false,
        participantUpdatesCount: 1,
        draftRevision: 6,
        baseLiveRevision: 2,
        liveApplied: false,
      }),
    );

    await commitGeneration("sid-1", "job-1", {
      recordVisibility: "PUBLIC",
      expectedDraftRevision: 5,
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
    expect(parsed.expectedDraftRevision).toBe(5);
  });
});

describe("expandEvidence", () => {
  it("URL-encodes job/turn IDs and sends the current revision", async () => {
    const fetchMock = captureFetch(
      jsonResponse({ turnId: "turn /1", speakerName: "회원", startSeconds: 3, text: "전문" }),
    );

    await expandEvidence("sid-1", "job /1", "turn /1", 9);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/bff/api/host/sessions/sid-1/ai-generate/jobs/job%20%2F1/evidence/turn%20%2F1?revision=9",
    );
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

  it("normalizes the rolling-deploy Gemini alias for the canonical dropdown", async () => {
    captureFetch(jsonResponse({ defaultModel: "gemini-3-flash" }));

    await expect(getClubAiDefault("my-club")).resolves.toEqual({
      defaultModel: "gemini-3-flash-preview",
    });
  });
});

describe("putClubAiDefault", () => {
  it("PUTs JSON to /api/host/clubs/{slug}/ai-defaults", async () => {
    const fetchMock = captureFetch(new Response(null, { status: 200 }));

    await putClubAiDefault("my-club", { defaultModel: "gpt-5.4-mini" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/api/host/clubs/my-club/ai-defaults");
    expect(init.method).toBe("PUT");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({ defaultModel: "gpt-5.4-mini" });
  });
});
