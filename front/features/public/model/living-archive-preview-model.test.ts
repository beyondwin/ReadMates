import { describe, expect, it } from "vitest";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";
import { buildLivingArchivePreviewModel } from "./living-archive-preview-model";

const sessions = [
  {
    sessionId: "session-3",
    sessionNumber: 3,
    bookTitle: "세 번째 책",
    bookAuthor: "저자 C",
    bookImageUrl: null,
    date: "2026-08-03",
    summary: "세 번째 공개 기록",
    highlightCount: 2,
    oneLinerCount: 2,
  },
  {
    sessionId: "session-2",
    sessionNumber: 2,
    bookTitle: "두 번째 책",
    bookAuthor: "저자 B",
    bookImageUrl: null,
    date: "2026-07-03",
    summary: "두 번째 공개 기록",
    highlightCount: 1,
    oneLinerCount: 0,
  },
];

const club: PublicClubResponse = {
  clubName: "읽는사이",
  tagline: "함께 읽고 기록합니다.",
  about: "공개 독서 모임입니다.",
  stats: { sessions: 3, books: 3, members: 12 },
  recentSessions: sessions,
};

const detail: PublicSessionDetailResponse = {
  sessionId: "session-3",
  sessionNumber: 3,
  bookTitle: "세 번째 책",
  bookAuthor: "저자 C",
  bookImageUrl: null,
  date: "2026-08-03",
  summary: "세 번째 공개 기록",
  oneLiners: [
    { authorName: "민지", authorShortName: "민", avatarKey: "minji", text: "첫 문장" },
    { authorName: "준호", authorShortName: "준", avatarKey: "junho", text: "둘째 문장" },
  ],
  highlights: [
    { text: "익명 하이라이트", sortOrder: 1, authorName: null, authorShortName: null, avatarKey: "" },
    { text: "셋째 문장", sortOrder: 2, authorName: "서연", authorShortName: "서", avatarKey: "seoyeon" },
    { text: "제한 밖 문장", sortOrder: 3, authorName: "도윤", authorShortName: "도", avatarKey: "doyoon" },
  ],
};

describe("buildLivingArchivePreviewModel", () => {
  it("preserves API session order and selects the first session as latest", () => {
    const model = buildLivingArchivePreviewModel(club, detail);

    expect(model.sessions).toEqual(sessions);
    expect(model.latest).toEqual(sessions[0]);
    expect(model.latestDetail).toBe(detail);
  });

  it("prefers public one-liners, then author-attributed highlights, up to three traces", () => {
    const model = buildLivingArchivePreviewModel(club, detail);

    expect(model.readerTraces).toHaveLength(3);
    expect(model.readerTraces.map((trace) => [trace.kind, trace.authorName, trace.text])).toEqual([
      ["oneLiner", "민지", "첫 문장"],
      ["oneLiner", "준호", "둘째 문장"],
      ["highlight", "서연", "셋째 문장"],
    ]);
    expect(model.readerTraces.map((trace) => trace.id)).toEqual([
      "one-liner-0",
      "one-liner-1",
      "highlight-1",
    ]);
  });

  it("keeps an empty public club empty without fabricated shelf entries or reader identities", () => {
    const emptyClub: PublicClubResponse = { ...club, recentSessions: [] };
    const model = buildLivingArchivePreviewModel(emptyClub, null);

    expect(model.sessions).toEqual([]);
    expect(model.latest).toBeNull();
    expect(model.latestDetail).toBeNull();
    expect(model.readerTraces).toEqual([]);
  });
});
