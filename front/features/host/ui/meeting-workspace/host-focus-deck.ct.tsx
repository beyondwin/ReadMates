import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { HostMeetingWorkspace } from "./host-meeting-workspace";
import {
  FOCUS_DECK_TITLE,
  closedFocusDeck,
  draftFocusDeck,
  openFocusDeck,
  publishedFocusDeck,
  readinessPendingFocusDeck,
  type FocusDeckFixture,
} from "./host-focus-deck.fixtures";
import { MeetingRelatedWork } from "./meeting-related-work";

const FOLIO_LANDMARKS = [
  "현재 모임 작업",
  "모임 작업 목차",
  "실행 전 확인",
  "지금 확인할 일",
] as const;

const STICKY_IN_FLOW_STYLE = `
  .rm-host-session-workspace__sticky-cta,
  .rm-host-session-workspace__footer-cta {
    position: static !important;
  }
`;

async function mountFocusDeck(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  fixture: FocusDeckFixture,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  const component = await mount(
    <div style={{ width: "100%" }}>
      <HostMeetingWorkspace
        view={fixture.view}
        header={fixture.header}
        facts={fixture.view.facts}
        relatedWork={<MeetingRelatedWork tasks={fixture.view.relatedTasks} />}
        projections={fixture.projections}
        recordReadiness={fixture.recordReadiness}
        publicRecordHref={fixture.publicRecordHref}
        pendingUndo={fixture.pendingUndo}
        onCreateRevision={fixture.onCreateRevision}
        onPrimaryAction={() => undefined}
      />
    </div>,
  );
  await expectReducedMotion(page);
  return component;
}

async function visiblePrimary(component: Locator) {
  const desktop = component.locator(".rm-host-session-workspace__cta--desktop");
  if (await desktop.isVisible()) return desktop;
  return component.locator(".rm-host-session-workspace__cta--mobile");
}

async function assertFocusDeck(
  component: Locator,
  page: Page,
  expected: { status: string; action: string },
) {
  await expect(component.getByRole("heading", { level: 1 })).toContainText(FOCUS_DECK_TITLE);
  await expect(component.getByText(expected.status, { exact: true })).toBeVisible();
  await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expect(component.getByRole("region", { name: "진행 목록" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "관련 작업" })).toBeVisible();
  await expect(component.getByRole("tablist")).toHaveCount(0);
  for (const name of FOLIO_LANDMARKS) {
    await expect(component.getByRole("navigation", { name })).toHaveCount(0);
    await expect(component.getByRole("complementary", { name })).toHaveCount(0);
    await expect(component.getByRole("button", { name })).toHaveCount(0);
  }

  const primary = await visiblePrimary(component);
  await expect(primary).toContainText(expected.action);
  await expectMinimumTargetSize(primary);
  await expectNoHorizontalOverflow(page);
}

async function lockFocusDeckScreenshot(component: Locator, name: string) {
  await component.evaluate((root) => {
    for (const element of root.querySelectorAll<HTMLElement>(
      ".rm-host-session-workspace__sticky-cta, .rm-host-session-workspace__footer-cta",
    )) {
      element.style.setProperty("position", "static", "important");
    }
  });
  await expect(component).toHaveScreenshot(name, { style: STICKY_IN_FLOW_STYLE });
}

async function assertFocusDeckFocus(
  component: Locator,
  expected: { action: string; focusPrimary?: boolean },
) {
  const focusTarget = expected.focusPrimary === false
    ? component.getByRole("link", { name: "참석 응답" })
    : await visiblePrimary(component);
  await focusTarget.focus();
  await expectVisibleFocus(focusTarget);
}

test("Focus Deck DRAFT locks the 1440 wide editorial composition", async ({ mount, page }) => {
  const component = await mountFocusDeck(mount, page, draftFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await assertFocusDeck(component, page, { status: "모임 작성 중", action: "멤버와 준비 시작" });
  await lockFocusDeckScreenshot(component, "focus-deck-draft-1440.png");
  await assertFocusDeckFocus(component, { action: "멤버와 준비 시작" });
});

test("Focus Deck OPEN locks the 900 tablet editorial composition", async ({ mount, page }) => {
  const component = await mountFocusDeck(mount, page, openFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.tablet);
  await assertFocusDeck(component, page, { status: "멤버와 준비 중", action: "실제 출석 확인" });
  await expect(component.getByText("오늘이 모임일입니다.")).toBeVisible();
  await lockFocusDeckScreenshot(component, "focus-deck-open-900.png");
  await assertFocusDeckFocus(component, { action: "실제 출석 확인" });
});

test("Focus Deck CLOSED locks the 768 tablet-narrow composition with recovery", async ({ mount, page }) => {
  const component = await mountFocusDeck(mount, page, closedFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.tabletNarrow);
  await assertFocusDeck(component, page, { status: "기록 정리 중", action: "정리본 올리기" });
  await expect(component.getByText("최근 출석 변경을 되돌릴 수 있습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "되돌리기" })).toBeVisible();
  await lockFocusDeckScreenshot(component, "focus-deck-closed-768.png");
  await assertFocusDeckFocus(component, { action: "정리본 올리기" });
});

test("Focus Deck PUBLISHED locks the 390 mobile composition", async ({ mount, page }) => {
  const component = await mountFocusDeck(mount, page, publishedFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await assertFocusDeck(component, page, { status: "공개 완료", action: "공개 기록 보기" });
  await expect(component.getByText("게스트·멤버 노트 게시 완료")).toHaveCount(0);
  await lockFocusDeckScreenshot(component, "focus-deck-published-390.png");
  await assertFocusDeckFocus(component, { action: "공개 기록 보기" });
});

test("Focus Deck pending readiness fail-closes the 320 mobile composition", async ({ mount, page }) => {
  const component = await mountFocusDeck(
    mount,
    page,
    readinessPendingFocusDeck,
    VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow,
  );
  await assertFocusDeck(component, page, { status: "기록 정리 중", action: "다음 할 일 확인 중" });
  await expect(await visiblePrimary(component)).toBeDisabled();
  await expect(component.getByRole("button", { name: "정리본 올리기" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "게스트·멤버 노트에 기록 게시" })).toHaveCount(0);
  await expect(component.getByText("모임 기록을 확인하는 중입니다.")).toBeVisible();
  await lockFocusDeckScreenshot(component, "focus-deck-readiness-pending-320.png");
  await assertFocusDeckFocus(component, { action: "다음 할 일 확인 중", focusPrimary: false });
});

test("Focus Deck stays inside the remaining viewport matrix and 200 percent zoom", async ({ mount, page }) => {
  const component = await mountFocusDeck(mount, page, openFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.desktop);
  await assertFocusDeck(component, page, { status: "멤버와 준비 중", action: "실제 출석 확인" });

  await page.setViewportSize({ width: 512, height: 450 });
  await expect(component.getByRole("heading", { level: 1 })).toContainText(FOCUS_DECK_TITLE);
  await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(await visiblePrimary(component));
});
