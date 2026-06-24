import { expect, test } from "@playwright/experimental-ct-react";
import type { PublicClubView } from "@/features/public/model/public-display-model";
import PublicRecordsPage from "./public-records-page";

const publicRecordsView: PublicClubView = {
  clubName: "읽는사이",
  tagline: "작게 읽고 깊게 나누는 독서모임",
  about: "서로의 질문과 문장을 따라 천천히 읽는 모임입니다.",
  stats: {
    sessions: 8,
    books: 8,
    members: 12,
  },
  recentSessions: [
    {
      sessionId: "00000000-0000-0000-0000-000000000301",
      sessionNumber: 8,
      bookTitle: "물고기는 존재하지 않는다",
      bookAuthor: "룰루 밀러",
      bookImageUrl: null,
      date: "2026-06-18",
      summary: "분류하려는 마음과 무너지는 질서 사이에서 우리가 서로를 어떻게 이해할 수 있는지 길게 이야기했습니다.",
      highlightCount: 5,
      oneLinerCount: 7,
    },
    {
      sessionId: "00000000-0000-0000-0000-000000000302",
      sessionNumber: 7,
      bookTitle: "가난한 찰리의 연감",
      bookAuthor: "찰리 멍거",
      bookImageUrl: null,
      date: "2026-05-21",
      summary: "판단의 습관, 오래 버티는 배움, 투자보다 넓은 삶의 태도를 함께 정리했습니다.",
      highlightCount: 3,
      oneLinerCount: 4,
    },
    {
      sessionId: "00000000-0000-0000-0000-000000000303",
      sessionNumber: 6,
      bookTitle: "팩트풀니스",
      bookAuthor: "한스 로슬링",
      bookImageUrl: null,
      date: "2026-04-16",
      summary: "데이터를 보는 습관과 불안을 줄이는 질문을 공개 가능한 요약으로 남겼습니다.",
      highlightCount: 2,
      oneLinerCount: 3,
    },
  ],
};

test("PublicRecordsPage renders public record index", async ({ mount }) => {
  const component = await mount(
    <div style={{ width: 480 }}>
      <PublicRecordsPage
        data={publicRecordsView}
        publicBasePath="/clubs/reading-sai"
        routePathname="/clubs/reading-sai/records"
        routeSearch=""
      />
    </div>,
  );

  await expect(component).toHaveScreenshot("public-records-index.png");
});
