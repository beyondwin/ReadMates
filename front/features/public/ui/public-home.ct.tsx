import { expect, test } from "@playwright/experimental-ct-react";
import type { PublicClubView } from "@/features/public/model/public-display-model";
import PublicHome from "./public-home";

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
    const readingTitle = latestRecord.locator(".reading-editorial").first();
    const readingExcerpt = latestRecord.locator(".body.reading-editorial");
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
    const expectedReadingRatio = viewport.name === "mobile" ? 1.7 : 1.65;
    const readingRoleMetrics = await Promise.all(
      [
        ["latest title", readingTitle],
        ["latest excerpt", readingExcerpt],
        ["archive title", archiveTitle],
        ["summary quotation", summaryQuotation],
      ].map(async ([name, locator]) => ({
        name,
        ...(await locator.evaluate((element) => {
          const node = element as HTMLElement;
          const style = getComputedStyle(node);
          return {
            fontFamily: style.fontFamily,
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
    for (const metrics of readingRoleMetrics) {
      expect(metrics.fontFamily, metrics.name).toContain("Iowan Old Style");
      expect.soft(metrics.lineHeightRatio, metrics.name).toBeCloseTo(expectedReadingRatio, 2);
      expect(metrics.scrollWidth, metrics.name).toBeLessThanOrEqual(metrics.clientWidth);
    }
    await expect(globalHeading).not.toHaveClass(/reading-editorial/);
    expect(await globalHeading.evaluate((element) => getComputedStyle(element).fontFamily)).not.toContain(
      "Iowan Old Style",
    );
  });
}
