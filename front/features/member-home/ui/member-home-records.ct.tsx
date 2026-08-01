import { expect, test } from "@playwright/experimental-ct-react";
import { ClubPulse, MobileMemberActivity } from "./member-home-records";

const reflection = {
  sessionId: "session-8",
  sessionNumber: 8,
  date: "2026-06-18",
  kind: "HIGHLIGHT" as const,
  text: "긴 한국어 회고와 deliberately expansive English reflection이 작은 화면에서도 자연스럽게 이어집니다.",
  authorName: null,
  authorShortName: null,
  avatarKey: "archive-box",
  bookTitle: "긴 제목의 다음 책",
  createdAt: "2026-06-18T12:00:00Z",
};

test("member reflection keeps the reading stack and rhythm on desktop", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  const component = await mount(<ClubPulse items={[reflection]} />);
  const copy = component.getByText(reflection.text);
  const metrics = await copy.evaluate((element) => {
    const node = element as HTMLElement;
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      lineHeight: Number.parseFloat(style.lineHeight),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    };
  });

  expect(metrics.fontFamily).toContain("Iowan Old Style");
  expect(metrics.lineHeight).toBeGreaterThanOrEqual(28);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
});

test("member reflection keeps the reading stack and rhythm on mobile", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  const component = await mount(
    <div className="mobile-only">
      <MobileMemberActivity items={[reflection]} />
    </div>,
  );
  const copy = component.getByText(reflection.text);
  const metrics = await copy.evaluate((element) => {
    const node = element as HTMLElement;
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      lineHeight: Number.parseFloat(style.lineHeight),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    };
  });

  expect(metrics.fontFamily).toContain("Iowan Old Style");
  expect(metrics.lineHeight).toBeGreaterThanOrEqual(24);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
});
