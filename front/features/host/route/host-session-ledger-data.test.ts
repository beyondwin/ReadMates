import { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostSessionLedgerLoaderFactory } from "./host-session-ledger-data";

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

const recordPage = {
  items: [{
    sessionId: "closed-1", sessionNumber: 1, title: "닫힌 모임", bookTitle: "책", bookAuthor: "저자",
    bookImageUrl: null, date: "2026-08-20", startTime: "20:00", endTime: "22:00", locationLabel: "온라인",
    state: "CLOSED", visibility: "HOST_ONLY", recordStatus: "NOT_STARTED", needsAttention: false,
    hasDraft: false, liveRevision: 0, draftRevision: null, lastModifiedAt: null,
  }],
  nextCursor: "opaque-record-cursor",
  summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
};

afterEach(() => vi.unstubAllGlobals());

describe("hostSessionLedgerLoaderFactory records boundary", () => {
  it("loads the records destination only through mode=record and never requests mode=meeting", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/bff/api/auth/me")) return Promise.resolve(Response.json(hostAuth));
      if (url.includes("mode=record")) return Promise.resolve(Response.json(recordPage));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const args = {
      request: new Request("https://readmates.test/clubs/reading-sai/app/host/records"),
      params: { clubSlug: "reading-sai" },
    } as unknown as LoaderFunctionArgs;

    const result = await hostSessionLedgerLoaderFactory(client)(args);

    expect(result.page).toEqual(recordPage);
    expect(urls.some((url) => url.includes("mode=record"))).toBe(true);
    expect(urls.some((url) => url.includes("mode=meeting"))).toBe(false);
  });
});
