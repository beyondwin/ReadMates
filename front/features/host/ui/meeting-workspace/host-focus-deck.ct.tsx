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

async function mountDiarySpread(
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
        diary={fixture.diary}
        header={fixture.header}
        facts={fixture.view.facts}
        relatedWork={<MeetingRelatedWork tasks={fixture.view.relatedTasks} />}
        projections={fixture.projections}
        recordReadiness={fixture.recordReadiness}
        publicRecordHref={fixture.publicRecordHref}
        memberViewHref={fixture.memberViewHref}
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

async function assertDiarySpread(
  component: Locator,
  page: Page,
  expected: { status: string; action: string },
) {
  await expect(component.locator(".rm-meeting-diary")).toHaveCount(1);
  await expect(component.getByRole("heading", { level: 1 })).toContainText(FOCUS_DECK_TITLE);
  await expect(component.getByText(expected.status, { exact: true })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "모임의 걸음" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "모임의 걸음" }).getByRole("listitem")).toHaveCount(6);
  await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expect(component.getByRole("region", { name: "진행 목록" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "관련 작업" })).toBeVisible();
  await expect(component.getByRole("link", { name: "멤버 시야로 보기" })).toBeVisible();
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

async function lockDiaryScreenshot(component: Locator, name: string) {
  await component.evaluate((root) => {
    for (const element of root.querySelectorAll<HTMLElement>(
      ".rm-host-session-workspace__sticky-cta, .rm-host-session-workspace__footer-cta",
    )) {
      element.style.setProperty("position", "static", "important");
    }
  });
  await expect(component).toHaveScreenshot(name, { style: STICKY_IN_FLOW_STYLE });
}

async function assertDiaryFocus(
  component: Locator,
  expected: { action: string; focusPrimary?: boolean },
) {
  const focusTarget = expected.focusPrimary === false
    ? component.getByRole("navigation", { name: "관련 작업" }).getByRole("link", { name: "참석 응답", exact: true })
    : await visiblePrimary(component);
  await focusTarget.focus();
  await expectVisibleFocus(focusTarget);
}

test("Diary spread DRAFT locks the 1440 wide editorial composition", async ({ mount, page }) => {
  const component = await mountDiarySpread(mount, page, draftFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await assertDiarySpread(component, page, { status: "작성 중", action: "멤버와 준비 시작" });
  await lockDiaryScreenshot(component, "diary-draft-1440.png");
  await assertDiaryFocus(component, { action: "멤버와 준비 시작" });
});

test("Diary spread OPEN locks the 900 tablet editorial composition", async ({ mount, page }) => {
  const component = await mountDiarySpread(mount, page, openFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.tablet);
  await assertDiarySpread(component, page, { status: "준비 중", action: "실제 출석 확인" });
  await expect(component.getByRole("region", { name: "진행 목록" }).getByText("오늘이 모임일입니다.")).toBeVisible();
  await expect(
    component.getByRole("navigation", { name: "모임의 걸음" }).locator('[aria-current="step"]'),
  ).toContainText("모임 당일(출석)");
  await lockDiaryScreenshot(component, "diary-open-900.png");
  await assertDiaryFocus(component, { action: "실제 출석 확인" });
});

test("Diary spread CLOSED locks the 768 tablet-narrow composition with recovery", async ({ mount, page }) => {
  const component = await mountDiarySpread(mount, page, closedFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.tabletNarrow);
  await assertDiarySpread(component, page, { status: "기록 정리 중", action: "정리본 올리기" });
  await expect(component.getByText("최근 출석 변경을 되돌릴 수 있습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "되돌리기" })).toBeVisible();
  await lockDiaryScreenshot(component, "diary-closed-768.png");
  await assertDiaryFocus(component, { action: "정리본 올리기" });
});

test("Diary spread PUBLISHED locks the 390 mobile composition", async ({ mount, page }) => {
  const component = await mountDiarySpread(mount, page, publishedFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await assertDiarySpread(component, page, { status: "게시됨", action: "공개 기록 보기" });
  await expect(component.getByText("게스트·멤버 노트 게시 완료")).toHaveCount(0);
  await expect(component.getByText("공개 완료")).toHaveCount(0);
  await lockDiaryScreenshot(component, "diary-published-390.png");
  await assertDiaryFocus(component, { action: "공개 기록 보기" });
});

test("Diary spread pending readiness fail-closes the 320 mobile composition", async ({ mount, page }) => {
  const component = await mountDiarySpread(
    mount,
    page,
    readinessPendingFocusDeck,
    VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow,
  );
  await assertDiarySpread(component, page, { status: "기록 정리 중", action: "다음 할 일 확인 중" });
  await expect(await visiblePrimary(component)).toBeDisabled();
  await expect(component.getByRole("button", { name: "정리본 올리기" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "게스트·멤버 노트에 기록 게시" })).toHaveCount(0);
  await expect(
    component.getByRole("region", { name: "진행 목록" }).getByText("모임 기록을 확인하는 중입니다."),
  ).toBeVisible();
  await lockDiaryScreenshot(component, "diary-readiness-pending-320.png");
  await assertDiaryFocus(component, { action: "다음 할 일 확인 중", focusPrimary: false });
});

test("Diary spread stays inside the remaining viewport matrix and 200 percent zoom", async ({ mount, page }) => {
  const component = await mountDiarySpread(mount, page, openFocusDeck, VISUAL_AUTHORITY_VIEWPORTS.desktop);
  await assertDiarySpread(component, page, { status: "준비 중", action: "실제 출석 확인" });

  await page.setViewportSize({ width: 512, height: 450 });
  await expect(component.getByRole("heading", { level: 1 })).toContainText(FOCUS_DECK_TITLE);
  await expect(component.getByRole("navigation", { name: "모임의 걸음" })).toBeVisible();
  await expect(component.getByRole("region", { name: "지금 할 일" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(await visiblePrimary(component));
});
