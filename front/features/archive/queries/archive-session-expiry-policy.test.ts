import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/archive/api/archive-api", () => ({
  fetchArchiveSessions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchMemberArchiveSession: vi.fn().mockResolvedValue(null),
  fetchMyArchiveQuestions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchMyArchiveReviews: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchMyFeedbackDocuments: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchNotesFeed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
}));

import {
  fetchArchiveSessions,
  fetchMemberArchiveSession,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
} from "@/features/archive/api/archive-api";
import { RECOVER_READ_SESSION_EXPIRY } from "@/shared/api/client";
import {
  archiveListQuery,
  memberArchiveSessionQuery,
} from "./archive-queries";

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) throw new Error("Missing queryFn");
  return query.queryFn({} as never);
}

describe("archive mounted session-expiry policy", () => {
  it("keeps the initial archive loader query on the default redirect policy", async () => {
    const context = { clubSlug: "reading-sai" };

    await runQuery(archiveListQuery(context));

    expect(fetchArchiveSessions).toHaveBeenCalledWith(context, { limit: 30 }, undefined);
    expect(fetchMyArchiveQuestions).toHaveBeenCalledWith(context, { limit: 30 }, undefined);
    expect(fetchMyArchiveReviews).toHaveBeenCalledWith(context, { limit: 30 }, undefined);
    expect(fetchMyFeedbackDocuments).toHaveBeenCalledWith(context, { limit: 30 }, undefined);
  });

  it("propagates explicit recovery only to mounted archive reads", async () => {
    const context = { clubSlug: "reading-sai" };

    await runQuery(archiveListQuery(context, undefined, RECOVER_READ_SESSION_EXPIRY));
    await runQuery(memberArchiveSessionQuery("session-7", context, RECOVER_READ_SESSION_EXPIRY));

    expect(fetchArchiveSessions).toHaveBeenLastCalledWith(
      context,
      { limit: 30 },
      RECOVER_READ_SESSION_EXPIRY,
    );
    expect(fetchMemberArchiveSession).toHaveBeenCalledWith(
      "session-7",
      context,
      RECOVER_READ_SESSION_EXPIRY,
    );
  });
});
