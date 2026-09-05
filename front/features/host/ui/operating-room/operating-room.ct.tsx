import { expect, test } from "@playwright/experimental-ct-react";
import type {
  CurrentMeetingHeaderView,
  HostNextActionView,
  MeetingPhaseTabView,
  PreparationLedgerRowView,
} from "@/features/host/model/host-operating-room-model";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { CurrentMeetingHeader } from "./current-meeting-header";
import { HostNextAction } from "./host-next-action";
import { MeetingPhaseTabs, type MeetingPhaseTabLink } from "./meeting-phase-tabs";
import { PreparationLedger } from "./preparation-ledger";

const LONG_BOOK_TITLE = "도서 제목이 아주 길어도 표지 대체 영역과 헤더를 밀어내지 않는 책";
const LONG_BOOK_AUTHOR = "긴 이름의 저자와 공동 저자";

const longMeeting: CurrentMeetingHeaderView = {
  sessionId: "session-27",
  sessionNumber: 27,
  title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
  bookTitle: LONG_BOOK_TITLE,
  bookAuthor: LONG_BOOK_AUTHOR,
  bookImageUrl: null,
  date: "2026-09-01",
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "을지로 북살롱과 DeliberatelyLongEnglishVenueName",
  lifecycle: "OPEN",
  lifecycleLabel: "준비 중",
  reverseLifecycleAction: null,
};

const links = {
  infoHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic",
  scheduleHref: "/clubs/reading-sai/app/host/sessions/session-27?section=basic&edit=1",
  historyHref: "/clubs/reading-sai/app/host/sessions/session-27?section=history",
  previewHref: null,
  memberViewHref: "/clubs/reading-sai/app/sessions/session-27",
};

const phases: readonly MeetingPhaseTabLink[] = [
  { id: "prep", label: "준비실", availability: "available", blockedReason: null, href: "?phase=prep" },
  { id: "live", label: "현장", availability: "complete", blockedReason: null, href: "?phase=live" },
  {
    id: "closing",
    label: "마감실",
    availability: "blocked",
    blockedReason: "출석을 확정하고 모임을 마친 뒤 사용할 수 있습니다.",
    href: "?phase=closing",
  },
];

const nextAction: HostNextActionView = {
  kind: "schedule-seen",
  state: "actionable",
  workItemKey: "server/opaque:item:27",
  label: "최신 일정을 아직 보지 않은 4명이 있어요",
  reason: "대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.",
  href: "/clubs/reading-sai/app/host/sessions/session-27?section=responses&scheduleSeen=unseen",
};

const preparation: readonly PreparationLedgerRowView[] = [
  {
    id: "schedule-seen",
    label: "현재 일정 확인",
    state: "warning",
    value: "8 / 12",
    detail: "변경 전 확인 1 · 미열람 3",
    numerator: 8,
    denominator: 12,
    href: "/clubs/reading-sai/app/host/sessions/session-27?section=responses&scheduleSeen=unseen",
    workItemKey: "server/opaque:item:27",
    actionLabel: "멤버 보기",
  },
  {
    id: "rsvp",
    label: "참석 응답",
    state: "warning",
    value: "9 / 12",
    detail: "참석 7 · 불참 2 · 미응답 3",
    numerator: 9,
    denominator: 12,
    href: "/clubs/reading-sai/app/host/sessions/session-27?section=responses",
    workItemKey: null,
    actionLabel: "응답 보기",
  },
  {
    id: "questions",
    label: "발제 질문",
    state: "unavailable",
    value: "집계 준비 중",
    detail: "아주 긴 질문 집계 설명도 작은 화면에서 잘리지 않고 다시 불러올 수 있어요.",
    numerator: null,
    denominator: null,
    href: "/clubs/reading-sai/app/host/sessions/session-27?section=responses&focus=questions",
    workItemKey: null,
    actionLabel: "질문 보기",
  },
  {
    id: "place",
    label: "장소 준비",
    state: "complete",
    value: "완료",
    detail: "을지로 북살롱과 DeliberatelyLongEnglishVenueName 예약 확인",
    numerator: null,
    denominator: null,
    href: "/clubs/reading-sai/app/host/sessions/session-27?section=basic&edit=1",
    workItemKey: null,
    actionLabel: "정보 보기",
  },
];

function fixture(
  meeting: CurrentMeetingHeaderView,
  currentPhase: MeetingPhaseTabView["id"] = "prep",
) {
  return (
    <main className="rm-operating-room-ct-shell">
      <CurrentMeetingHeader meeting={meeting} badge={{ kind: "dday", label: "D-3" }} links={links} />
      <MeetingPhaseTabs phases={phases} currentPhase={currentPhase} />
      <section id="host-operating-room-phase-panel" aria-label="선택한 운영 단계">
        선택한 단계 내용
      </section>
    </main>
  );
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 960 },
]) {
  test(`meeting context remains operable at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const component = await mount(fixture(longMeeting));

    await expect(component.getByRole("heading", { level: 1 })).toContainText(LONG_BOOK_TITLE);
    await expect(component.locator(".rm-book-cover__fallback")).toBeVisible();
    await expect(component.locator(".rm-operating-room-header__kicker")).toHaveText(
      `${longMeeting.title} · ${LONG_BOOK_AUTHOR}`,
    );
    await expect(component.getByText("출석을 확정하고 모임을 마친 뒤 사용할 수 있습니다.")).toBeAttached();
    await expectNoHorizontalOverflow(page);

    for (const link of await component.getByRole("link").all()) {
      await expectMinimumTargetSize(link);
    }

    const currentTab = component.getByRole("tab", { name: /준비실/ });
    await currentTab.focus();
    await expectVisibleFocus(currentTab);

    await page.screenshot({ path: testInfo.outputPath(`operating-room-context-${viewport.name}.png`), fullPage: true });
  });
}

test("partial meeting fields remain explicit at 768px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const component = await mount(fixture({
    ...longMeeting,
    date: "",
    startTime: "",
    endTime: "",
    locationLabel: "",
  }));

  await expect(component.getByText("날짜 미정")).toBeVisible();
  await expect(component.getByText("시간 미정")).toBeVisible();
  await expect(component.getByText("장소 미정")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("meeting context stays usable at the 200 percent zoom proxy", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const component = await mount(fixture(longMeeting));

  await expect(component.getByRole("link", { name: "멤버 시야" })).toBeVisible();
  await expect(component.getByRole("tablist", { name: "모임 운영 단계" })).toBeVisible();
  await expect(component.locator(".rm-operating-room-header__kicker")).toHaveText(
    `${longMeeting.title} · ${LONG_BOOK_AUTHOR}`,
  );
  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
  await page.screenshot({ path: testInfo.outputPath("operating-room-context-200-percent.png"), fullPage: true });
});

function preparationFixture() {
  return (
    <main className="rm-operating-room-ct-shell">
      <HostNextAction action={nextAction} onDefer={() => undefined} />
      <PreparationLedger rows={preparation} onRetry={() => undefined} />
    </main>
  );
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 960 },
]) {
  test(`next action and preparation ledger remain operable at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const component = await mount(preparationFixture());

    await expect(component.getByRole("region", { name: "다음에 할 일" })).toBeVisible();
    await expect(component.getByRole("region", { name: "준비 현황" })).toBeVisible();
    await expect(component.getByRole("listitem")).toHaveCount(4);
    const detail = component.getByText("변경 전 확인 1 · 미열람 3");
    await expect(detail).toBeVisible();
    const firstRow = component.getByRole("listitem").first();
    const firstBox = await firstRow.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(firstBox!.height).toBeGreaterThanOrEqual(viewport.width <= 390 ? 44 : 62);
    await expectNoHorizontalOverflow(page);

    for (const control of await component.getByRole("link").all()) {
      await expectMinimumTargetSize(control);
    }
    for (const control of await component.getByRole("button").all()) {
      await expectMinimumTargetSize(control);
    }

    const primary = component.getByRole("link", { name: nextAction.label });
    await primary.focus();
    await expectVisibleFocus(primary);

    if (viewport.width === 390) {
      const questions = component.getByRole("listitem", { name: "발제 질문" });
      const labelBox = await questions.locator(".rm-preparation-ledger-row__label-text").boundingBox();
      const valueBox = await questions.locator(".rm-preparation-ledger-row__value").boundingBox();
      const detailBox = await questions.locator(".rm-preparation-ledger-row__detail").boundingBox();
      const questionsBox = await questions.boundingBox();
      expect(labelBox, "questions label").not.toBeNull();
      expect(valueBox, "questions value").not.toBeNull();
      expect(detailBox, "questions detail").not.toBeNull();
      expect(questionsBox, "questions row").not.toBeNull();
      expect(labelBox!.x + labelBox!.width, "label left of value").toBeLessThanOrEqual(valueBox!.x + 2);
      expect(Math.abs(valueBox!.x - detailBox!.x), "value+detail stacked").toBeLessThanOrEqual(4);
      expect(valueBox!.width, "unavailable value width").toBeGreaterThanOrEqual(80);
      expect(valueBox!.height, "unavailable value single line").toBeLessThanOrEqual(22);
      expect(questionsBox!.height, "unavailable row stays compact").toBeLessThanOrEqual(100);
      expect(firstBox!.height, "short-copy row ~48px").toBeLessThanOrEqual(56);
    }

    if (viewport.width === 1440) {
      const thirdRow = await component.getByRole("listitem", { name: "발제 질문" }).boundingBox();
      expect(thirdRow).not.toBeNull();
      expect((thirdRow?.y ?? viewport.height) + (thirdRow?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    }

    await page.screenshot({ path: testInfo.outputPath(`operating-room-preparation-${viewport.name}.png`), fullPage: true });
  });
}

test("next action and preparation ledger honor reduced motion at the 200 percent zoom proxy", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mount(preparationFixture());

  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
});
