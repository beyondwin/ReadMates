import { expect, test } from "@playwright/experimental-ct-react";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { ReadingAchievementSummary } from "./reading-achievement-summary";

const viewModel: MemberSpaceViewModel = {
  profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
  achievementHeading: "읽고, 묻고, 기록해 온 시간",
  journeyStats: [
    { kind: "sessions", label: "함께한 모임", value: "6", unit: "회" },
    { kind: "completed", label: "함께 완독한 책", value: "6", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "21", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "읽고 난 마음을 풀어낸 기록", value: "0", unit: "편" },
  ],
};

for (const viewport of [{ width: 1280, height: 700 }, { width: 390, height: 700 }, { width: 320, height: 700 }]) {
  test(`reading ledger remains aligned at ${viewport.width}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    const component = await mount(
      <ReadingAchievementSummary
        viewModel={viewModel}
        archiveSessionsHref="/app/archive?view=sessions"
      />,
    );
    const story = component.locator(".rm-reading-achievement__story");
    const traces = component.locator(".rm-reading-achievement__traces");
    const kicker = component.getByText("함께 읽어 온 기록");
    const heading = component.getByRole("heading", { name: "읽고, 묻고, 기록해 온 시간" });
    const [storyBox, tracesBox, kickerBox, headingBox] = await Promise.all([
      story.boundingBox(),
      traces.boundingBox(),
      kicker.boundingBox(),
      heading.boundingBox(),
    ]);

    expect(storyBox).not.toBeNull();
    expect(tracesBox).not.toBeNull();
    expect(kickerBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(Math.abs(headingBox!.x - kickerBox!.x)).toBeLessThanOrEqual(2);
    expect(headingBox!.y).toBeGreaterThanOrEqual(kickerBox!.y + kickerBox!.height - 1);
    if (viewport.width > 768) {
      expect(Math.abs(tracesBox!.y - kickerBox!.y)).toBeLessThanOrEqual(2);
    } else {
      expect(tracesBox!.y).toBeGreaterThanOrEqual(storyBox!.y + storyBox!.height - 1);
    }
    expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const recordsLink = component.getByRole("link", { name: "기록 보기" });
    await expect(recordsLink).toHaveCount(1);
    const recordsLinkBox = await recordsLink.boundingBox();
    expect(recordsLinkBox).not.toBeNull();
    expect(recordsLinkBox!.width).toBeGreaterThanOrEqual(44);
    expect(recordsLinkBox!.height).toBeGreaterThanOrEqual(44);
    const tracesHeadGeometry = await component.locator(".rm-reading-achievement__traces-head").evaluate((element) => {
      const heading = element.querySelector("h3");
      const link = element.querySelector("a");
      if (!heading || !link) throw new Error("reading ledger trace header is incomplete");
      const textBottom = (node: Element) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().bottom;
      };
      return {
        alignItems: getComputedStyle(element).alignItems,
        headingTextBottom: textBottom(heading),
        linkTextBottom: textBottom(link),
      };
    });
    expect(tracesHeadGeometry.alignItems).toBe("baseline");
    expect(Math.abs(tracesHeadGeometry.headingTextBottom - tracesHeadGeometry.linkTextBottom)).toBeLessThanOrEqual(1);
    const traceRows = component.locator(".rm-reading-achievement__trace");
    await expect(traceRows).toHaveCount(2);
    await expect(traceRows.locator("a, button, [role='link'], [role='button']")).toHaveCount(0);
    expect(await traceRows.evaluateAll((rows) =>
      rows.map((row) => getComputedStyle(row).borderTopWidth),
    )).toEqual(["0px", "1px"]);
    expect(await component.locator(".rm-reading-achievement__journey > div").evaluateAll((groups) =>
      groups.every((group) => Array.from(group.children).map((child) => child.tagName).join(",") === "DT,DD"),
    )).toBe(true);
    await expect(component.getByText("나의 아바타 ·", { exact: false })).toHaveCount(0);
  });
}
