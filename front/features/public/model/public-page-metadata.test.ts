import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_PAGE_METADATA,
  PUBLIC_MISSING_SESSION_METADATA,
  buildPublicClubPageMetadata,
  buildPublicRecordsPageMetadata,
  buildPublicSessionPageMetadata,
} from "./public-page-metadata";

const club = {
  clubName: "읽는사이",
  tagline: "작게 읽고 깊게 나누는 모임",
  about: "책을 읽고 서로의 관점을 기록하는 공개 소개입니다.",
  stats: { sessions: 7, books: 7, members: 12 },
  recentSessions: [],
};

const session = {
  sessionId: "s1",
  sessionNumber: 7,
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookImageUrl: null,
  date: "2026-06-18",
  summary: "함께 읽은 핵심 질문과 공개 가능한 하이라이트를 정리했습니다.",
  highlights: [],
  oneLiners: [],
};

describe("public page metadata", () => {
  it("keeps a stable default title and description", () => {
    expect(DEFAULT_PUBLIC_PAGE_METADATA).toEqual({
      title: "ReadMates",
      description: "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
    });
  });

  it("builds club home metadata from visible club copy", () => {
    expect(buildPublicClubPageMetadata(club, "home")).toEqual({
      title: "읽는사이 | ReadMates",
      description: "작게 읽고 깊게 나누는 모임",
    });
  });

  it("builds about metadata from visible introduction copy", () => {
    expect(buildPublicClubPageMetadata(club, "about")).toEqual({
      title: "읽는사이 소개 | ReadMates",
      description: "책을 읽고 서로의 관점을 기록하는 공개 소개입니다.",
    });
  });

  it("builds records metadata with a public count label", () => {
    expect(buildPublicRecordsPageMetadata(club)).toEqual({
      title: "읽는사이 공개 기록 | ReadMates",
      description: "읽는사이에서 공개한 독서 모임 기록 총 7개를 모았습니다.",
    });
  });

  it("builds session metadata from visible session copy", () => {
    expect(buildPublicSessionPageMetadata(session)).toEqual({
      title: "팩트풀니스 | 읽는사이 공개 기록",
      description: "한스 로슬링 · 2026.06.18 · 함께 읽은 핵심 질문과 공개 가능한 하이라이트를 정리했습니다.",
    });
  });

  it("uses explicit missing-session metadata", () => {
    expect(PUBLIC_MISSING_SESSION_METADATA).toEqual({
      title: "공개 기록을 찾을 수 없습니다 | ReadMates",
      description: "요청한 공개 독서 모임 기록을 찾을 수 없습니다. 공개 기록 목록에서 다시 확인해 주세요.",
    });
  });
});
