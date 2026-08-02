import { expect, test } from "@playwright/experimental-ct-react";
import type { MemberHomeRecentRecordEntry } from "@/features/member-home/model/member-home-view-model";
import {
  ClubPulse,
  MobileMemberActivity,
  MobileRecentRecordEntry,
  RecentRecordEntry,
} from "./member-home-records";

const reflection = {
  sessionId: "session-8",
  sessionNumber: 8,
  date: "2026-06-18",
  kind: "QUESTION" as const,
  text: "긴 한국어 회고와 deliberately expansive English reflection이 작은 화면에서도 자연스럽게 이어집니다.",
  authorName: "아주 긴 이름의 멤버",
  authorShortName: "긴 이름",
  avatarKey: "cloud-green-book",
  bookTitle: "긴 제목의 다음 책",
  createdAt: "2026-06-18T12:00:00Z",
};

const recentEntry: MemberHomeRecentRecordEntry = {
  sessionId: "session-8",
  sessionNumber: 8,
  bookTitle: "긴 한국어 제목과 deliberately expansive English title이 함께 있는 다음 책",
  date: "2026-06-18",
  kindLabels: ["질문", "한줄평", "하이라이트"],
  href: "/app/sessions/session-8",
  feedbackHref: "/app/feedback/session-8",
  feedbackState: "UNKNOWN",
  feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
  returnStateLabel: "지난 모임 회고",
  summary: "긴 제목의 기록과 피드백을 이어 읽을 수 있어요.",
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
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    };
  });

  expect(metrics.fontFamily).toContain("Pretendard");
  expect(metrics.fontFamily).not.toContain("Iowan Old Style");
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThanOrEqual(1.6);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect((await component.locator(".rm-avatar-chip").boundingBox())?.width).toBe(30);
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
      fontSize: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    };
  });

  expect(metrics.fontFamily).toContain("Pretendard");
  expect(metrics.fontFamily).not.toContain("Iowan Old Style");
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThanOrEqual(1.6);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect((await component.locator(".rm-avatar-chip").boundingBox())?.width).toBe(32);
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("recent record separates copy and document rows on desktop", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  const component = await mount(<RecentRecordEntry entry={recentEntry} />);
  const copy = component.locator(".rm-recent-record__copy");
  const documents = component.getByRole("navigation", { name: "지난 모임 문서" });
  const [copyBox, documentsBox, linkBoxes] = await Promise.all([
    copy.boundingBox(),
    documents.boundingBox(),
    documents.getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      }),
    ),
  ]);

  expect(copyBox).not.toBeNull();
  expect(documentsBox).not.toBeNull();
  expect(Math.abs(documentsBox!.y - copyBox!.y)).toBeLessThanOrEqual(1);
  expect(documentsBox!.x).toBeGreaterThanOrEqual(copyBox!.x + copyBox!.width - 1);
  expect(linkBoxes.every(({ height }) => height >= 44)).toBe(true);
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(component).toHaveScreenshot("member-home-recent-record-desktop.png");
});

test("recent record stacks full-width document rows on mobile", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const component = await mount(
    <div className="mobile-only">
      <MobileRecentRecordEntry entry={recentEntry} />
    </div>,
  );
  const copy = component.locator(".rm-recent-record__copy");
  const documents = component.getByRole("navigation", { name: "지난 모임 문서" });
  const [copyBox, documentsBox, linkBoxes] = await Promise.all([
    copy.boundingBox(),
    documents.boundingBox(),
    documents.getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      }),
    ),
  ]);

  expect(copyBox).not.toBeNull();
  expect(documentsBox).not.toBeNull();
  expect(documentsBox!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height - 1);
  expect(linkBoxes.every(({ height }) => height >= 44)).toBe(true);
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(component).toHaveScreenshot("member-home-recent-record-mobile.png");

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    await documents.getByRole("link").evaluateAll((links) =>
      links.every((link) => link.getBoundingClientRect().height >= 44),
    ),
  ).toBe(true);
});
