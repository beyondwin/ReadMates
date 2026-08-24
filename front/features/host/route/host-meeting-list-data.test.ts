import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { hostMeetingListLoaderFactory } from "./host-meeting-list-data";

const hostAuth = {
  authenticated: true,
  userId: "user-host",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.test",
  displayName: "Host",
  accountName: "Host",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function args(url: string) {
  return {
    request: new Request(url),
    params: { clubSlug: "reading-sai" },
  } as unknown as LoaderFunctionArgs;
}

afterEach(() => vi.unstubAllGlobals());

describe("hostMeetingListLoaderFactory", () => {
  it.each([
    ["meeting", "https://readmates.test/app/host/sessions"],
    ["trash", "https://readmates.test/app/host/sessions?view=trash"],
  ] as const)("returns unavailable %s data after a transient list failure", async (view, url) => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/bff/api/auth/me")) {
        return Promise.resolve(Response.json(hostAuth));
      }
      return Promise.reject(new TypeError("temporary network failure"));
    }));

    const result = await hostMeetingListLoaderFactory(client())(args(url));

    expect(result.view).toBe(view);
    if (result.view === "meeting") {
      expect(result.page).toBeNull();
    } else {
      expect(result.trashPage).toBeNull();
    }
  });

  it("keeps host auth failures fatal instead of converting them to unavailable list data", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ authenticated: false }, { status: 401 }))));

    await expect(hostMeetingListLoaderFactory(client())(args("https://readmates.test/app/host/sessions")))
      .rejects.toBeDefined();
  });

  it("keeps opposite-lifecycle contract violations fatal", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/bff/api/auth/me")) {
        return Promise.resolve(Response.json(hostAuth));
      }
      return Promise.resolve(Response.json({
        items: [{
          sessionId: "closed-1", sessionNumber: 1, title: "닫힌 모임", bookTitle: "책", bookAuthor: "저자",
          bookImageUrl: null, date: "2026-08-20", startTime: "20:00", endTime: "22:00", locationLabel: "온라인",
          state: "CLOSED", visibility: "HOST_ONLY", recordStatus: "NOT_STARTED", needsAttention: false,
          hasDraft: false, liveRevision: 0, draftRevision: null, lastModifiedAt: null,
        }],
        nextCursor: null,
        summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
      }));
    }));

    await expect(hostMeetingListLoaderFactory(client())(args("https://readmates.test/app/host/sessions")))
      .rejects.toMatchObject({ name: "ZodError" });
  });

  it("keeps arbitrary programmer TypeErrors fatal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json(hostAuth))));
    const programmerFailureClient = {
      fetchQuery: vi.fn().mockRejectedValue(new TypeError("programmer bug")),
    } as unknown as QueryClient;

    await expect(hostMeetingListLoaderFactory(programmerFailureClient)(
      args("https://readmates.test/app/host/sessions"),
    )).rejects.toThrow("programmer bug");
  });

  it("returns unavailable meeting data for an ordinary non-auth API response", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/bff/api/auth/me")) {
        return Promise.resolve(Response.json(hostAuth));
      }
      return Promise.resolve(Response.json({ message: "temporarily unavailable" }, { status: 503 }));
    }));

    await expect(hostMeetingListLoaderFactory(client())(
      args("https://readmates.test/app/host/sessions"),
    )).resolves.toMatchObject({ view: "meeting", page: null });
  });
});
