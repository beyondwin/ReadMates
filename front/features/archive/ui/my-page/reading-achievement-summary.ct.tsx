import { expect, test } from "@playwright/experimental-ct-react";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { ReadingAchievementSummary } from "./reading-achievement-summary";

const viewModel: MemberSpaceViewModel = {
  profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
  achievementHeading: "읽고, 묻고, 기록해 온 시간",
  journeyStats: [
    { kind: "sessions", label: "참여한 모임", value: "6", unit: "회" },
    { kind: "completed", label: "완독한 책", value: "6", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "21", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "아직 남긴 서평이 없어요", value: "0", unit: "편" },
  ],
};

for (const viewport of [{ width: 1280, height: 700 }, { width: 390, height: 700 }, { width: 320, height: 700 }]) {
  test(`reading ledger remains aligned at ${viewport.width}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    const component = await mount(
      <ReadingAchievementSummary viewModel={viewModel} />,
    );
    const header = component.locator(".rm-reading-achievement__header");
    const groups = component.locator(".rm-reading-achievement__groups");
    const groupSections = component.locator(".rm-reading-achievement__group");
    const kicker = component.getByText("함께 읽어 온 기록");
    const heading = component.getByRole("heading", { name: "읽고, 묻고, 기록해 온 시간" });
    const [headerBox, groupsBox, kickerBox, headingBox] = await Promise.all([
      header.boundingBox(),
      groups.boundingBox(),
      kicker.boundingBox(),
      heading.boundingBox(),
    ]);

    expect(headerBox).not.toBeNull();
    expect(groupsBox).not.toBeNull();
    expect(kickerBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(Math.abs(headingBox!.x - kickerBox!.x)).toBeLessThanOrEqual(2);
    expect(headingBox!.y).toBeGreaterThanOrEqual(kickerBox!.y + kickerBox!.height - 1);
    expect(groupsBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
    expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(component.getByRole("link", { name: "기록 보기" })).toHaveCount(0);
    await expect(component.locator("svg, .rm-reading-achievement__icon")).toHaveCount(0);
    await expect(component.getByRole("region", { name: "독서 여정" })).toHaveCount(1);
    await expect(component.getByRole("region", { name: "기록의 흔적" })).toHaveCount(1);
    await expect(groupSections).toHaveCount(2);
    expect(await groupSections.evaluateAll((sections) => sections.map((section) => {
      const box = section.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ top: expect.any(Number) }),
      expect.objectContaining({ top: expect.any(Number) }),
    ]));
    const [firstGroup, secondGroup] = await groupSections.evaluateAll((sections) => sections.map((section) => {
      const box = section.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    if (viewport.width > 768) {
      expect(Math.abs(firstGroup.top - secondGroup.top)).toBeLessThanOrEqual(2);
      expect(secondGroup.left).toBeGreaterThanOrEqual(firstGroup.right - 1);
    } else {
      expect(secondGroup.top).toBeGreaterThanOrEqual(firstGroup.bottom - 1);
    }
    const traceRows = component.locator(".rm-reading-achievement__trace");
    await expect(traceRows).toHaveCount(2);
    await expect(traceRows.locator("a, button, [role='link'], [role='button']")).toHaveCount(0);
    await expect(component.locator(".rm-reading-achievement__group > dl")).toHaveCount(2);
    expect(await component.locator(".rm-reading-achievement__list > div").evaluateAll((rows) =>
      rows.every((row) => Array.from(row.children).map((child) => child.tagName).join(",") === "DT,DD"),
    )).toBe(true);
    const rowGeometry = await component.locator(".rm-reading-achievement__metric").evaluateAll((rows) =>
      rows.map((row) => {
          const label = row.querySelector("dt");
          const value = row.querySelector("dd");
          if (!label || !value) throw new Error("reading achievement metric is incomplete");
          const labelBox = label.getBoundingClientRect();
          const valueBox = value.getBoundingClientRect();
          return {
            display: getComputedStyle(row).display,
            labelCenter: labelBox.top + labelBox.height / 2,
            valueCenter: valueBox.top + valueBox.height / 2,
            labelRight: labelBox.right,
            valueLeft: valueBox.left,
          };
        }),
    );
    expect(rowGeometry).toHaveLength(4);
    expect(rowGeometry.every(({ display }) => display === "grid")).toBe(true);
    expect(rowGeometry.every(({ labelCenter, valueCenter }) => Math.abs(labelCenter - valueCenter) <= 2)).toBe(true);
    expect(rowGeometry.every(({ labelRight, valueLeft }) => valueLeft >= labelRight)).toBe(true);
    await expect(component.getByText("나의 아바타 ·", { exact: false })).toHaveCount(0);
  });
}
