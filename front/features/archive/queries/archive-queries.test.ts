import { describe, expect, it } from "vitest";
import {
  archiveKeys,
  archiveListQuery,
  combineArchiveListPages,
  memberArchiveSessionQuery,
} from "./archive-queries";

describe("archive query helpers", () => {
  it("scopes list keys by club and normalizes omitted page fields", () => {
    expect(archiveKeys.list({ clubSlug: "bookclub" }, undefined)).toEqual([
      "archive",
      "scope",
      "bookclub",
      "list",
      { limit: null, cursor: null },
    ]);
    expect(archiveListQuery({ clubSlug: "bookclub" }).queryKey).toEqual(
      archiveKeys.list({ clubSlug: "bookclub" }, undefined),
    );
  });

  it("scopes archive detail keys by session id and club", () => {
    expect(memberArchiveSessionQuery("session-1", { clubSlug: "bookclub" }).queryKey).toEqual([
      "archive",
      "scope",
      "bookclub",
      "detail",
      "session-1",
    ]);
  });

  it("combines cursor pages per archive surface", () => {
    const current = {
      sessions: { items: [{ sessionId: "s1" }], nextCursor: "s2" },
      questions: { items: [{ id: "q1" }], nextCursor: null },
      reviews: { items: [{ id: "r1" }], nextCursor: null },
      reports: { items: [{ sessionId: "f1" }], nextCursor: null },
    };
    const next = {
      sessions: { items: [{ sessionId: "s2" }], nextCursor: null },
      questions: { items: [], nextCursor: null },
      reviews: { items: [], nextCursor: null },
      reports: { items: [], nextCursor: null },
    };

    expect(combineArchiveListPages([current, next]).sessions.items.map((item) => item.sessionId)).toEqual([
      "s1",
      "s2",
    ]);
  });
});
