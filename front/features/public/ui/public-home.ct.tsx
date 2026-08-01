import { expect, test } from "@playwright/experimental-ct-react";
import type { PublicClubView, PublicSessionDetailView } from "@/features/public/model/public-display-model";
import PublicHome from "./public-home";
import PublicSession from "./public-session";

const publicHomeView: PublicClubView = {
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
      bookTitle: "긴 한국어 제목과 An Expansive English Title",
      bookAuthor: "테스트 저자",
      bookImageUrl: null,
      date: "2026-06-18",
      summary:
        "기록의 문장이 작은 화면에서도 잘리지 않고 자연스럽게 이어지도록 충분히 긴 한국어와 English words를 함께 둡니다.",
      highlightCount: 5,
      oneLinerCount: 7,
    },
  ],
};

const publicSessionView: PublicSessionDetailView = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  sessionNumber: 8,
  bookTitle: "긴 한국어 제목과 An Expansive English Title",
  bookAuthor: "테스트 저자",
  bookImageUrl: null,
  date: "2026-06-18",
  summary: "회차 전체를 아우르는 긴 요약은 공공 기록에서 다른 본문과 같은 읽기 크기를 유지해야 합니다.",
  highlights: [
    {
      text: "긴 하이라이트 문장도 독자가 작은 화면과 큰 화면에서 부담 없이 읽을 수 있는 본문 크기를 유지해야 합니다.",
      sortOrder: 1,
      authorName: "테스트 독자",
      authorShortName: "테",
      avatarKey: "hedgehog-green-book",
    },
  ],
  oneLiners: [
    {
      text: "긴 한줄평도 같은 본문 크기 범위 안에서 자연스럽게 줄바꿈됩니다.",
      authorName: "테스트 멤버",
      authorShortName: "테",
      avatarKey: "hedgehog-green-book",
    },
  ],
};

test("PublicSession keeps long public copy within the body scale", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const component = await mount(<PublicSession session={publicSessionView} />);
  const longCopyMetrics = await Promise.all(
    [
      ["session summary", component.locator(".public-session-summary-text")],
      ["highlight quote", component.locator(".public-note-highlight-row__quote")],
      ["one-liner quote", component.locator(".public-note-oneliner-card__quote")],
    ].map(async ([name, locator]) => ({
      name,
      ...(await locator.evaluate((element) => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        return {
          fontFamily: style.fontFamily,
          fontSize: Number.parseFloat(style.fontSize),
          lineHeightRatio: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        };
      })),
    })),
  );

  for (const metrics of longCopyMetrics) {
    expect(metrics.fontFamily, metrics.name).toContain("Pretendard");
    expect(metrics.fontSize, metrics.name).toBeGreaterThanOrEqual(16);
    expect(metrics.fontSize, metrics.name).toBeLessThanOrEqual(17);
    expect(metrics.lineHeightRatio, metrics.name).toBeGreaterThanOrEqual(1.6);
    expect(metrics.scrollWidth, metrics.name).toBeLessThanOrEqual(metrics.clientWidth);
  }
});

for (const viewport of [
  { name: "desktop", width: 1200, height: 900 },
  { name: "mobile", width: 320, height: 720 },
] as const) {
  test(`PublicHome keeps the latest record flat and readable on ${viewport.name}`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const component = await mount(<PublicHome data={publicHomeView} />);
    const latestRecord = component.locator(".public-latest-record");
    const latestTitle = latestRecord.locator(".h2.editorial");
    const latestExcerpt = latestRecord.locator(".body");
    const archiveTitle = component.locator(".public-archive-row__title").first();
    const summaryQuotation = component.locator(".quote-card__quote").first();
    const globalHeading = component.getByRole("heading", { name: "읽는사이", level: 1 });

    const recordStyle = await latestRecord.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        left: bounds.left,
        right: bounds.right,
      };
    });
    const publicCopyMetrics = await Promise.all(
      [
        ["latest title", latestTitle],
        ["latest excerpt", latestExcerpt],
        ["archive title", archiveTitle],
        ["summary quotation", summaryQuotation],
      ].map(async ([name, locator]) => ({
        name,
        ...(await locator.evaluate((element) => {
          const node = element as HTMLElement;
          const style = getComputedStyle(node);
          return {
            fontFamily: style.fontFamily,
            fontSize: Number.parseFloat(style.fontSize),
            lineHeightRatio: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
          };
        })),
      })),
    );

    expect(recordStyle.borderLeftWidth).toBe("0px");
    expect(recordStyle.borderRightWidth).toBe("0px");
    expect(recordStyle.borderTopWidth).toBe("1px");
    expect(recordStyle.borderBottomWidth).toBe("1px");
    expect(recordStyle.paddingLeft).toBe("0px");
    expect(recordStyle.paddingRight).toBe("0px");
    expect(recordStyle.left).toBeGreaterThanOrEqual(0);
    expect(recordStyle.right).toBeLessThanOrEqual(viewport.width);
    for (const metrics of publicCopyMetrics) {
      expect(metrics.fontFamily, metrics.name).toContain("Pretendard");
      expect(metrics.fontFamily, metrics.name).not.toContain("Iowan Old Style");
      expect(metrics.fontSize, metrics.name).toBeGreaterThanOrEqual(16);
      expect(metrics.lineHeightRatio, metrics.name).toBeGreaterThanOrEqual(1.6);
      expect(metrics.scrollWidth, metrics.name).toBeLessThanOrEqual(metrics.clientWidth);
    }
    await expect(globalHeading).not.toHaveClass(/reading-editorial/);
    expect(await globalHeading.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain(
      "Iowan Old Style",
    );
  });
}
