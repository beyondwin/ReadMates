import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router-dom";
import type { MyJourneyPage } from "@/features/archive/api/archive-contracts";
import { emptyMyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { myRecordsLoader } from "./my-records-data";

const api = vi.hoisted(() => ({ fetchMyJourney: vi.fn() }));
const auth = vi.hoisted(() => ({ loadArchiveMemberAuth: vi.fn() }));

vi.mock("@/features/archive/api/archive-api", () => api);
vi.mock("@/features/archive/route/archive-loader-auth", () => auth);

const journey: MyJourneyPage = {
  items: [{
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookImageUrl: null,
    date: "2026-01-24",
    readingProgress: 100,
    questionCount: 2,
    reviewCount: 1,
    feedbackDocument: { available: true, readable: true, lockedReason: null },
  }],
  nextCursor: "cursor-2",
  summary: {
    attendedSessionCount: 2,
    completedReadingCount: 1,
    questionCount: 2,
    reviewCount: 1,
    readableFeedbackDocumentCount: 1,
  },
};

const activeAccess = {
  allowed: true,
  auth: {
    authenticated: true,
    userId: "reader-user",
    membershipId: "reader-membership",
    clubId: "club-id",
    email: "reader@example.com",
    displayName: "독자",
    accountName: "책친구",
    role: "MEMBER" as const,
    membershipStatus: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
  },
};

const inactiveAuth = {
  ...activeAccess.auth,
  membershipStatus: "INACTIVE" as const,
  approvalState: "INACTIVE" as const,
};

describe("myRecordsLoader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess);
    api.fetchMyJourney.mockResolvedValue(journey);
  });

  it("loads twelve personal journey rows in the current club", async () => {
    await expect(myRecordsLoader({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/me/records"),
    } as LoaderFunctionArgs)).resolves.toEqual(journey);

    expect(api.fetchMyJourney).toHaveBeenCalledWith(
      { clubSlug: "reading-sai" },
      { limit: 12 },
    );
  });

  it("returns an empty page when member-app access is unavailable", async () => {
    auth.loadArchiveMemberAuth.mockResolvedValue({ allowed: false, auth: inactiveAuth });

    await expect(myRecordsLoader()).resolves.toEqual(emptyMyJourneyPage());
    expect(api.fetchMyJourney).not.toHaveBeenCalled();
  });
});
