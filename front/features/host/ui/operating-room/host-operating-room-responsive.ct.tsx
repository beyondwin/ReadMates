import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement, ReactNode } from "react";
import type { HostOperatingRoomView } from "@/features/host/model/host-operating-room-model";
import type { HostWorkboxView } from "@/features/host/model/host-workbox-model";
import { HostApprovedShell } from "../approved-host-shell";
import {
  expectGeometryWithinTolerance,
  expectLocatorGeometry,
  isSemanticDocumentOrder,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { MeetingResponseLedger, AttendanceBoardChrome } from "../meeting-workspace/meeting-response-ledger";
import { PhaseStatusLedger } from "./phase-status-ledger";
import { HostWorkbox } from "../workbox/host-workbox";
import { OperatingRoomPhaseContinuityStory } from "./host-operating-room-phase-continuity-ct-harness";
import {
  HostOperatingRoomPage,
  type AttendanceRecoveryView,
} from "./host-operating-room-page";
import type { CurrentMeetingBadge } from "./current-meeting-header";
import {
  HOST_BODY_DESKTOP_GEOMETRY as BODY_DESKTOP_GEOMETRY,
  HOST_CT_LIVE_MOBILE_BOARD_GEOMETRY as CT_LIVE_MOBILE_BOARD_GEOMETRY,
  HOST_OR_LIVE_MOBILE_MAIN_GEOMETRY as LIVE_MOBILE_MAIN_GEOMETRY,
  HOST_MOBILE_NAV_GEOMETRY as MOBILE_NAV_GEOMETRY,
  HOST_PREP_MOBILE_MAIN_GEOMETRY as PREP_MOBILE_MAIN_GEOMETRY,
  HOST_WORKBOX_DESKTOP_GEOMETRY as WORKBOX_DESKTOP_GEOMETRY,
} from "@/tests/e2e/support/approved-route-geometry";

const APPROVED_DESKTOP_VIEWPORT = { width: 1536, height: 1024 } as const;
const APPROVED_MOBILE_VIEWPORT = { width: 390, height: 832 } as const;

const phaseLinks = [
  { id: "prep", label: "준비실", availability: "available", blockedReason: null, href: "?phase=prep" },
  { id: "live", label: "현장", availability: "complete", blockedReason: null, href: "?phase=live" },
  { id: "closing", label: "마감실", availability: "complete", blockedReason: null, href: "?phase=closing" },
] as const;

const view: HostOperatingRoomView = {
  meeting: {
    sessionId: "public-safe-session-27",
    sessionNumber: 27,
    title: "경계가 긴 한글 모임 제목과 A deliberately long English meeting title without clipping",
    bookTitle: "이미지가 없어도 운영 문맥을 잃지 않는 아주 긴 책 제목",
    bookAuthor: "Long Public-safe Author Name",
    bookImageUrl: "/assets/avatars/book-club/milk-green-book.webp",
    date: "2026-09-01",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인과 오프라인을 함께 설명하는 DeliberatelyLongEnglishVenueName",
    lifecycle: "OPEN",
    lifecycleLabel: "준비 중",
    reverseLifecycleAction: null,
  },
  phases: phaseLinks,
  phase: "prep",
  nextAction: {
    kind: "schedule-seen",
    state: "actionable",
    workItemKey: "public-safe-work-item-27",
    label: "최신 일정을 확인하지 않은 참여자 검토",
    reason: "긴 한국어와 English recovery copy가 함께 있어도 다음 행동이 잘리지 않습니다.",
    href: "/clubs/public-safe/app/host/sessions/public-safe-session-27/schedule-review",
  },
  preparation: [
    {
      id: "schedule-seen",
      label: "현재 일정 확인",
      state: "warning",
      value: "0 / 12,345",
      detail: "변경 전 확인 1 · 미열람 12,344",
      numerator: 0,
      denominator: 12_345,
      href: "/clubs/public-safe/app/host/sessions/public-safe-session-27/schedule-review",
      workItemKey: "public-safe-work-item-27",
      actionLabel: "멤버 보기",
    },
    {
      id: "rsvp",
      label: "참석 응답",
      state: "complete",
      value: "12,345 / 12,345",
      detail: "모든 참여자가 응답했습니다.",
      numerator: 12_345,
      denominator: 12_345,
      href: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=responses",
      workItemKey: null,
      actionLabel: "응답 보기",
    },
    {
      id: "questions",
      label: "발제 질문",
      state: "unavailable",
      value: "집계 준비 중",
      detail: "일부 질문 행을 불러오지 못했습니다. 성공한 다른 준비 정보는 그대로 유지합니다.",
      numerator: null,
      denominator: null,
      href: null,
      workItemKey: null,
      actionLabel: "질문 보기",
    },
    {
      id: "place",
      label: "장소",
      state: "normal",
      value: "장소 확인 필요",
      detail: "장문 장소 설명도 작은 화면에서 온전히 줄바꿈됩니다.",
      numerator: null,
      denominator: null,
      href: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic",
      workItemKey: null,
      actionLabel: "정보 보기",
    },
  ],
  partialFailures: [],
  closing: null,
};

const workboxView: HostWorkboxView = {
  state: "NOW",
  evaluatedAt: "2026-08-30T09:00:00Z",
  partialWarnings: [{
    type: "NOTIFICATION_FAILURE",
    operationalLabel: "알림 실패 확인",
    failureCode: "NOTIFICATION_SOURCE_UNAVAILABLE",
    message: "알림 실패 확인 일부 행을 불러오지 못했어요.",
  }],
  nextCursor: "public-safe-next-page",
  items: [
    {
      key: "public-safe-zero-item",
      type: "SCHEDULE_UNSEEN",
      state: "NOW",
      title: "일정 확인이 필요한 참여자",
      description: "수량 0도 숨기지 않고 서버가 준 값을 그대로 보여 줍니다.",
      count: 0,
      countLabel: "0",
      dueAt: null,
      deferredUntil: null,
      resolvedAt: null,
      destinationHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27/schedule-review",
      receiptSummary: null,
      operationalLabel: "일정 미열람 확인",
      destinationCategory: "schedule-review",
    },
    {
      key: "public-safe-large-item",
      type: "MEMBER_APPROVAL",
      state: "NOW",
      title: "A deliberately long English workbox destination that must remain operable",
      description: "긴 작업 설명과 12,345 같은 큰 수량도 레일과 단일 열 모두에서 잘리지 않습니다.",
      count: 12_345,
      countLabel: "12,345",
      dueAt: "2026-09-01T09:00:00Z",
      deferredUntil: null,
      resolvedAt: null,
      destinationHref: "/clubs/public-safe/app/host/people",
      receiptSummary: null,
      operationalLabel: "가입 승인 검토",
      destinationCategory: "people",
    },
  ],
};

const APPROVED_WORKBOX_FOOTER = {
  text: "어제 19:30 자동 리마인드 전달됨",
  historyHref: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=history",
} as const;

function hostWorkbox(overrides: {
  view?: HostWorkboxView | null;
  loading?: boolean;
  error?: string | null;
} = {}) {
  return (
    <HostWorkbox
      state="NOW"
      view={overrides.view === undefined ? workboxView : overrides.view}
      loading={overrides.loading ?? false}
      error={overrides.error ?? null}
      pendingKey={null}
      footerNote={APPROVED_WORKBOX_FOOTER}
      onStateChange={() => undefined}
      onRetry={() => undefined}
      onLoadMore={() => undefined}
    />
  );
}

async function expectApprovedWorkboxRow(row: Locator) {
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/rm-host-work-item/);
  await expect(row.locator("details")).toHaveCount(0);
  await expect(row).not.toContainText("세부 조작");
  const destination = row.locator("a.rm-host-work-item__destination");
  await expect(destination).toBeVisible();
  await expect(destination.locator(".rm-icon-badge")).toBeVisible();
  await expect(destination.locator(".rm-host-work-item__title")).toBeVisible();
  await expect(destination.locator(".rm-host-work-item__meta")).toBeVisible();
  await expect(destination.locator('[data-icon="chevron-right"]')).toBeVisible();
  await expect(row.locator(".rm-host-work-item__deferral")).toHaveCount(0);
  await expect(row.getByRole("combobox", { name: /보류 기간/ })).toHaveCount(0);
  await expect(row.getByRole("button", { name: /보류$/ })).toHaveCount(0);
}

function operatingRoomFixture(
  recovery: AttendanceRecoveryView | null = null,
  workboxContent: ReactNode = hostWorkbox(),
) {
  return (
    <HostOperatingRoomPage
      view={view}
      badge={{ kind: "dday", label: "D-1" }}
      headerLinks={{
        infoHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic",
        scheduleHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic&edit=1",
        historyHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=history",
        previewHref: null,
        memberViewHref: "/clubs/public-safe/app/sessions/public-safe-session-27",
      }}
      phaseLinks={phaseLinks}
      phaseNormalizationReason={null}
      optionalFailureMessages={[]}
      recovery={recovery}
      liveContent={<section aria-label="현장 운영">현장 운영</section>}
      closingContent={<section aria-label="마감 운영">마감 운영</section>}
      workboxContent={workboxContent}
      createMeetingHref="/clubs/public-safe/app/host/sessions/new"
      onPhaseChange={() => undefined}
      onRetryPreparation={() => undefined}
      onRetryOptional={() => undefined}
      nextActionPending={false}
      onDeferNextAction={() => undefined}
    />
  );
}

const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 767, height: 900 },
  { width: 768, height: 900 },
  { width: 900, height: 900 },
  { width: 1024, height: 900 },
  { width: 1199, height: 900 },
  { width: 1200, height: 900 },
  { width: 1440, height: 960 },
] as const;

for (const viewport of viewports) {
  test(`operating room locks responsive semantics at ${viewport.width}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    const component = await mount(operatingRoomFixture());

    const context = component.getByRole("group", { name: "현재 모임" });
    const phases = component.getByRole("navigation", { name: "모임 운영 단계" });
    const nextAction = component.getByRole("region", { name: "다음에 할 일" });
    const preparation = component.getByRole("region", { name: "준비 현황" });
    const primary = component.locator(".rm-host-operating-room__primary");
    const workbox = component.getByRole("complementary", { name: "클럽 작업함" });

    await expect(context).toBeVisible();
    await expect(phases).toBeVisible();
    await expect(nextAction).toBeVisible();
    await expect(preparation).toBeVisible();
    await expect(workbox).toBeVisible();
    await expect(component.getByText("0 / 12,345")).toBeVisible();
    await expect(workbox.locator("li.rm-host-work-item")).toHaveCount(2);
    await expect(component.getByText("알림 실패 확인 일부 행을 불러오지 못했어요.")).toBeVisible();
    for (const row of await workbox.locator("li.rm-host-work-item").all()) {
      await expectApprovedWorkboxRow(row);
    }
    await expect(workbox).not.toContainText("세부 조작");
    await expect(component.getByRole("combobox", { name: /보류 기간/ })).toHaveCount(0);

    const order = [context, phases, nextAction, preparation, workbox];
    expect(await isSemanticDocumentOrder(order)).toBe(true);

    const nextBox = await nextAction.boundingBox();
    expect(nextBox).not.toBeNull();
    expect(nextBox!.y + Math.min(nextBox!.height, 44)).toBeLessThanOrEqual(viewport.height);

    const primaryBox = await primary.boundingBox();
    const workboxBox = await workbox.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(workboxBox).not.toBeNull();
    if (viewport.width < 1200) {
      expect(workboxBox!.y).toBeGreaterThanOrEqual(primaryBox!.y + primaryBox!.height - 1);
    } else {
      expect(workboxBox!.x).toBeGreaterThan(primaryBox!.x);
      expect(Math.abs(primaryBox!.width / (primaryBox!.width + workboxBox!.width) - 0.62)).toBeLessThan(0.04);
    }

    await expect(nextAction.getByRole("link")).toHaveCount(1);

    const prep = component.getByRole("tab", { name: /준비실/ });
    await prep.focus();
    await expectVisibleFocus(prep);
    await expectNoHorizontalOverflow(page);
    expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
    for (const control of await component.locator("button:visible, a[href]:visible, select:visible").all()) {
      await expectMinimumTargetSize(control);
    }
  });
}

test("operating room phase tabs keep current-meeting continuity", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const component = await mount(<OperatingRoomPhaseContinuityStory />);
  await expect(component.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(component.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");
  await component.getByRole("tab", { name: /현장/ }).click();
  await expect(component.getByRole("tab", { name: /현장/ })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(component.getByRole("tabpanel", { name: /현장 운영/ })).toBeVisible();
  await component.getByRole("tab", { name: /마감실/ }).click();
  await expect(component.getByRole("tab", { name: /마감실/ })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(component.getByRole("tabpanel", { name: /마감실 운영/ })).toBeVisible();
  await component.getByRole("tab", { name: /준비실/ }).click();
  await expect(component.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tabpanel", { name: /준비실 운영/ })).toBeVisible();
});

test("operating room supports keyboard roving, visible focus and reduced motion at the zoom proxy", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 350 });
  const component = await mount(operatingRoomFixture());

  const prep = component.getByRole("tab", { name: /준비실/ });
  await prep.focus();
  await page.keyboard.press("End");
  await expect(component.getByRole("tab", { name: /마감실/ })).toBeFocused();

  const deferred = component.getByRole("tab", { name: "보류" });
  await deferred.focus();
  await page.keyboard.press("End");
  const completed = component.getByRole("tab", { name: "완료", exact: true });
  await expect(completed).toBeFocused();
  await expectVisibleFocus(completed);

  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
});

test("operating room loading keeps current-meeting context", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const component = await mount(operatingRoomFixture(null, hostWorkbox({ view: null, loading: true })));
  await expect(component.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(component.getByRole("heading", { name: view.meeting!.bookTitle! })).toBeVisible();
  await expect(component.getByRole("status")).toContainText("작업함을 불러오는 중입니다.");
  await expect(component.getByRole("region", { name: "다음에 할 일" })).toBeVisible();
  expect(await isSemanticDocumentOrder([
    component.getByRole("group", { name: "현재 모임" }),
    component.getByRole("navigation", { name: "모임 운영 단계" }),
    component.getByRole("region", { name: "다음에 할 일" }),
  ])).toBe(true);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
});

test("operating room empty workbox stays usable", async ({ mount, page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  const component = await mount(operatingRoomFixture(null, hostWorkbox({
    view: { ...workboxView, items: [], partialWarnings: [], nextCursor: null },
  })));
  await expect(component.getByRole("group", { name: "현재 모임" })).toBeVisible();
  await expect(component.getByText("지금 처리할 작업이 없습니다.")).toBeVisible();
  await expect(component.getByRole("region", { name: "다음에 할 일" }).getByRole("link")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
});

test("operating room stale workbox keeps loaded rows and a retry path", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const component = await mount(operatingRoomFixture(null, hostWorkbox({
    error: "작업함을 불러오지 못했습니다. 보이는 항목은 그대로 유지합니다.",
  })));
  const retry = component.locator(".rm-host-workbox__error").getByRole("button", { name: "다시 불러오기", exact: true });
  await expect(component.locator(".rm-host-workbox__error")).toContainText("작업함을 불러오지 못했습니다");
  await expect(retry).toBeVisible();
  await expectMinimumTargetSize(retry);
  await expect(component.getByRole("listitem", { name: workboxView.items[0]!.title })).toBeVisible();
  await expect(component.getByRole("listitem", { name: workboxView.items[1]!.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("operating room partial warning keeps unaffected rows usable", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const component = await mount(operatingRoomFixture());
  await expect(component.getByText("알림 실패 확인 일부 행을 불러오지 못했어요.")).toBeVisible();
  await expect(component.getByRole("button", { name: "현재 묶음 다시 불러오기" })).toBeVisible();
  await expect(component.getByRole("listitem", { name: workboxView.items[0]!.title })).toBeVisible();
  const row = component.getByRole("listitem", { name: workboxView.items[1]!.title });
  await expectApprovedWorkboxRow(row);
  await expectNoHorizontalOverflow(page);
});

test("operating room long Korean and English titles wrap without overflow", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const component = await mount(operatingRoomFixture());
  const title = component.getByRole("heading", { name: view.meeting!.bookTitle! });
  await expect(title).toBeVisible();
  const metrics = await title.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowWrap: style.overflowWrap,
      scrollWidth: Math.ceil((element as HTMLElement).scrollWidth),
      clientWidth: (element as HTMLElement).clientWidth,
    };
  });
  expect(["anywhere", "break-word"]).toContain(metrics.overflowWrap);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expect(component.getByRole("listitem", { name: workboxView.items[1]!.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
});

test("mobile unknown-outcome recovery controls remain visible and unclipped", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount(operatingRoomFixture({
    kind: "unknown",
    canonicalLabel: "현재 확인된 출석",
    onReconcile: () => undefined,
    historyHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=history",
  }));

  const recovery = component.getByRole("status", { name: "출석 변경 결과 확인" });
  await expect(recovery).toContainText("같은 변경을 다시 보내지 않습니다");
  for (const control of await recovery.locator("button:visible, a[href]:visible").all()) {
    await expectMinimumTargetSize(control);
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await expectNoHorizontalOverflow(page);
});

const approvedMeeting = {
  sessionId: "public-safe-session-27",
  sessionNumber: 27,
  title: "지구 끝의 온실",
  bookTitle: "지구 끝의 온실",
  bookAuthor: "김초엽",
  bookImageUrl: "/assets/avatars/book-club/milk-green-book.webp",
  date: "2026-09-01",
  startTime: "19:30",
  endTime: "21:30",
  locationLabel: "을지로 북살롱",
  lifecycle: "OPEN" as const,
  lifecycleLabel: "준비 중",
  reverseLifecycleAction: null,
};

const approvedPhaseLinks = [
  { id: "prep" as const, label: "준비실", availability: "available" as const, blockedReason: null, href: "?phase=prep" },
  { id: "live" as const, label: "현장", availability: "available" as const, blockedReason: null, href: "?phase=live" },
  { id: "closing" as const, label: "마감실", availability: "available" as const, blockedReason: null, href: "?phase=closing" },
];

const approvedHeaderLinks = {
  infoHref: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=basic",
  scheduleHref: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=basic&edit=1",
  historyHref: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=history",
  previewHref: null as string | null,
  memberViewHref: "/clubs/reading-sai/app/sessions/public-safe-session-27",
};

function workboxItem(
  key: string,
  type: HostWorkboxView["items"][number]["type"],
  title: string,
  operationalLabel: string,
  count: number,
  countLabel: string,
  destinationHref: string,
  destinationCategory: HostWorkboxView["items"][number]["destinationCategory"],
): HostWorkboxView["items"][number] {
  return {
    key,
    type,
    state: "NOW",
    title,
    description: title,
    count,
    countLabel,
    dueAt: null,
    deferredUntil: null,
    resolvedAt: null,
    destinationHref,
    receiptSummary: null,
    operationalLabel,
    destinationCategory,
  };
}

function approvedWorkbox(items: HostWorkboxView["items"]): ReactElement {
  return (
    <HostWorkbox
      state="NOW"
      view={{
        state: "NOW",
        evaluatedAt: "2026-08-30T09:00:00Z",
        partialWarnings: [],
        nextCursor: "public-safe-next-page",
        items,
      }}
      loading={false}
      error={null}
      pendingKey={null}
      footerNote={APPROVED_WORKBOX_FOOTER}
      onStateChange={() => undefined}
      onRetry={() => undefined}
      onLoadMore={() => undefined}
    />
  );
}

function phaseStatusLedger(
  title: string,
  rows: readonly {
    label: string;
    value: string;
    detail: string;
    href: string;
    action: string;
    tone: "ok" | "warn" | "danger" | "muted";
  }[],
) {
  return <PhaseStatusLedger title={title} rows={rows} />;
}

function approvedOperatingRoom(input: {
  phase: HostOperatingRoomView["phase"];
  badge: CurrentMeetingBadge;
  nextAction: HostOperatingRoomView["nextAction"];
  nextActionSecondary?: { href: string; label: string };
  liveContent?: ReactNode;
  compactLiveContent?: ReactNode;
  closingContent?: ReactNode;
  workboxItems: HostWorkboxView["items"];
}) {
  const view: HostOperatingRoomView = {
    meeting: {
      ...approvedMeeting,
      lifecycle: input.phase === "closing" ? "CLOSED" : "OPEN",
      lifecycleLabel: input.phase === "live" ? "진행 중" : input.phase === "closing" ? "마감 중" : "준비 중",
    },
    phases: approvedPhaseLinks,
    phase: input.phase,
    nextAction: input.nextAction,
    preparation: [
      {
        id: "schedule-seen",
        label: "현재 일정 확인",
        state: "warning",
        value: "8 / 12",
        detail: "변경 전 확인 1 · 미열람 3",
        numerator: 8,
        denominator: 12,
        href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27/schedule-review",
        workItemKey: "public-safe-work-item-27",
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
        href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=responses",
        workItemKey: null,
        actionLabel: "응답 보기",
      },
      {
        id: "questions",
        label: "발제 질문",
        state: "normal",
        value: "6개",
        detail: "2명은 아직 작성 전",
        numerator: 6,
        denominator: null,
        href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=responses&focus=questions",
        workItemKey: null,
        actionLabel: "질문 보기",
      },
      {
        id: "place",
        label: "장소 준비",
        state: "complete",
        value: "완료",
        detail: "을지로 북살롱 예약 확인",
        numerator: null,
        denominator: null,
        href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=basic",
        workItemKey: null,
        actionLabel: "정보 보기",
      },
    ],
    partialFailures: [],
    closing: null,
  };

  return (
    <HostApprovedShell destination="operating-room">
      <HostOperatingRoomPage
        view={view}
        badge={input.badge}
        headerLinks={{
          ...approvedHeaderLinks,
          previewHref: input.phase === "closing"
            ? "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=records"
            : null,
        }}
        phaseLinks={approvedPhaseLinks}
        phaseNormalizationReason={null}
        optionalFailureMessages={[]}
        recovery={null}
        liveContent={input.liveContent ?? <section aria-label="현장 운영">현장 운영</section>}
        compactLiveContent={input.compactLiveContent}
        closingContent={input.closingContent ?? <section aria-label="마감 운영">마감 운영</section>}
        workboxContent={approvedWorkbox(input.workboxItems)}
        createMeetingHref="/clubs/reading-sai/app/host/sessions/new"
        onPhaseChange={() => undefined}
        onRetryPreparation={() => undefined}
        onRetryOptional={() => undefined}
        nextActionPending={false}
        nextActionSecondary={input.nextActionSecondary}
      />
    </HostApprovedShell>
  );
}

const prepWorkboxItems = [
  workboxItem("prep-schedule", "SCHEDULE_UNSEEN", "일정 확인이 필요한 참여자", "일정 미열람 확인", 4, "4명 · 오늘", "/clubs/reading-sai/app/host/sessions/public-safe-session-27/schedule-review", "schedule-review"),
  workboxItem("prep-approval", "MEMBER_APPROVAL", "가입 승인 검토", "가입 승인 검토", 2, "2명 · 오늘", "/clubs/reading-sai/app/host/people", "people"),
  workboxItem("prep-record", "RECORD_CLOSING", "지난 모임 기록 마감", "지난 모임 기록 마감", 1, "1건 · 이번 주", "/clubs/reading-sai/app/host/records", "records"),
  workboxItem("prep-invite", "INVITATION_EXPIRY", "초대 링크 만료 확인", "초대 링크 만료 확인", 2, "2일 남음", "/clubs/reading-sai/app/host/settings", "invitation-settings"),
] as const;

const liveWorkboxItems = [
  workboxItem("live-attendance", "SCHEDULE_UNSEEN", "출석 미확인", "출석 미확인", 3, "3명 · 지금", "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance", "schedule-review"),
  workboxItem("live-late", "NOTIFICATION_FAILURE", "늦게 도착 예정", "늦게 도착 예정", 1, "1명 · 10분", "/clubs/reading-sai/app/host/sessions/public-safe-session-27", "notifications"),
  workboxItem("live-memo", "RECORD_CLOSING", "현장 메모 확인", "현장 메모 확인", 3, "3개 · 모임 후", "/clubs/reading-sai/app/host/records", "records"),
  workboxItem("live-approval", "MEMBER_APPROVAL", "가입 승인 검토", "가입 승인 검토", 2, "2명 · 내일", "/clubs/reading-sai/app/host/people", "people"),
] as const;

const closingWorkboxItems = [
  workboxItem("closing-draft", "RECORD_CLOSING", "기록 초안 검토", "기록 초안 검토", 1, "1건 · 오늘", "/clubs/reading-sai/app/host/records", "records"),
  workboxItem("closing-notes", "SCHEDULE_UNSEEN", "소감 미작성 확인", "소감 미작성 확인", 4, "4명 · 내일", "/clubs/reading-sai/app/host/sessions/public-safe-session-27", "schedule-review"),
  workboxItem("closing-feedback", "NOTIFICATION_FAILURE", "피드백 문서 확인", "피드백 문서 확인", 1, "1개 · 오늘", "/clubs/reading-sai/app/host/records", "notifications"),
  workboxItem("closing-place", "INVITATION_EXPIRY", "다음 모임 장소 확정", "다음 모임 장소 확정", 3, "3일 남음", "/clubs/reading-sai/app/host/meetings", "invitation-settings"),
] as const;

const liveStatusRows = [
  { label: "실제 출석", value: "8 / 12", detail: "참석 8 · 알린 불참 1 · 확인 필요 3", href: "?section=attendance", action: "출석 보기", tone: "warn" },
  { label: "참석 응답", value: "9 / 12", detail: "참석 7 · 불참 2 · 미응답 3", href: "?section=responses", action: "응답 보기", tone: "warn" },
  { label: "진행 순서", value: "2 / 5", detail: "첫 질문 나누는 중", href: "?section=agenda", action: "진행 보기", tone: "muted" },
  { label: "현장 메모", value: "3개", detail: "호스트만 볼 수 있어요", href: "?section=notes", action: "메모 열기", tone: "muted" },
] as const;

const liveAttendanceCensus = {
  attended: 8,
  all: 12,
  pending: 3,
} as const;

const closingStatusRows = [
  { label: "출석 확정", value: "완료", detail: "9명 · 어제 21:42", href: "?section=attendance", action: "출석 보기", tone: "ok" },
  { label: "소감 수집", value: "8 / 12", detail: "미작성 4명", href: "?section=notes", action: "대상 보기", tone: "warn" },
  { label: "기록 초안", value: "작성 중", detail: "마지막 저장 오늘 10:18", href: "?section=records", action: "초안 열기", tone: "muted" },
  { label: "피드백 문서", value: "확인 필요", detail: "파일 1개", href: "?section=feedback", action: "문서 확인", tone: "warn" },
  { label: "멤버 게시", value: "대기", detail: "앞선 2단계 남음", href: "?section=publish", action: "게시 조건", tone: "muted" },
] as const;

const liveAttendees = [
  { membershipId: "m-1", displayName: "박서윤", avatarKey: "mushroom-green-book", rsvpStatus: "GOING" as const, attendanceStatus: "ATTENDED" as const, attendanceRevision: 1 },
  { membershipId: "m-2", displayName: "김도윤", avatarKey: "apple-green-book", rsvpStatus: "GOING" as const, attendanceStatus: "ATTENDED" as const, attendanceRevision: 1 },
  { membershipId: "m-3", displayName: "이하린", avatarKey: "banana-green-book", rsvpStatus: "NO_RESPONSE" as const, attendanceStatus: "UNKNOWN" as const, attendanceRevision: 1 },
  { membershipId: "m-4", displayName: "정우진", avatarKey: "mushroom-green-book", rsvpStatus: "DECLINED" as const, attendanceStatus: "ABSENT" as const, attendanceRevision: 1 },
  { membershipId: "m-5", displayName: "최아연", avatarKey: "apple-green-book", rsvpStatus: "GOING" as const, attendanceStatus: "ATTENDED" as const, attendanceRevision: 1 },
  { membershipId: "m-6", displayName: "오민재", avatarKey: "banana-green-book", rsvpStatus: "NO_RESPONSE" as const, attendanceStatus: "UNKNOWN" as const, attendanceRevision: 1 },
  { membershipId: "m-7", displayName: "한지수", avatarKey: "mushroom-green-book", rsvpStatus: "GOING" as const, attendanceStatus: "ATTENDED" as const, attendanceRevision: 1 },
];

function approvedAttendanceBoard() {
  const preview = liveAttendees.slice(0, 1);
  return (
    <section className="rm-host-operating-room__compact-live" aria-labelledby="meeting-day-attendance-title">
      <AttendanceBoardChrome
        agendaHref="/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=agenda"
        census={liveAttendanceCensus}
      />
      <MeetingResponseLedger
        presentation="attendanceBoard"
        hideChrome
        attendanceCensus={liveAttendanceCensus}
        rows={preview.map((attendee) => ({
          membershipId: attendee.membershipId,
          displayName: attendee.displayName,
          secondaryLabel: attendee.displayName,
          avatarKey: attendee.avatarKey,
          response: attendee.rsvpStatus === "GOING"
            ? "GOING"
            : attendee.rsvpStatus === "DECLINED"
              ? "NOT_GOING"
              : "NO_RESPONSE",
          attendance: attendee.attendanceStatus,
          attendanceRevision: attendee.attendanceRevision,
          questionCount: null,
          recentResponseLabel: null,
        }))}
        onAttendanceChange={() => undefined}
        onBulkAttendanceChange={() => undefined}
      />
      <a
        className="rm-host-operating-room__attendance-disclose"
        href="/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance"
      >
        {`출석 ${liveAttendanceCensus.all}명 모두 보기`}
      </a>
    </section>
  );
}

function approvedLiveContent() {
  return phaseStatusLedger("현장 현황", liveStatusRows);
}

function prepApprovedView() {
  return approvedOperatingRoom({
    phase: "prep",
    badge: { kind: "dday", label: "D-3" },
    nextAction: {
      kind: "schedule-seen",
      state: "actionable",
      workItemKey: "public-safe-work-item-27",
      label: "최신 일정을 아직 보지 않은 4명이 있어요",
      ctaLabel: "대상과 문구 검토",
      note: "일정이 어제 19:30에 변경되었어요",
      reason: "대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.",
      href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27/schedule-review",
    },
    workboxItems: prepWorkboxItems,
  });
}

function liveApprovedView(badge: CurrentMeetingBadge = { kind: "today", label: "오늘" }) {
  return approvedOperatingRoom({
    phase: "live",
    badge,
    nextAction: {
      kind: "attendance",
      state: "actionable",
      workItemKey: "public-safe-work-item-live",
      label: "아직 출석을 확인하지 않은 3명이 있어요",
      ctaLabel: "출석 확인 시작",
      note: "오후 7:26 · 현장 모드가 열렸어요",
      reason: "참석 응답과 실제 출석은 별개로 기록해요.",
      href: "/clubs/reading-sai/app/host/sessions/public-safe-session-27?section=attendance",
    },
    nextActionSecondary: {
      href: liveStatusRows.find((row) => row.label === "진행 순서")!.href,
      label: "모임 진행 보기",
    },
    liveContent: approvedLiveContent(),
    compactLiveContent: approvedAttendanceBoard(),
    workboxItems: liveWorkboxItems,
  });
}

function closingApprovedView() {
  return approvedOperatingRoom({
    phase: "closing",
    badge: { kind: "dday", label: "D+1" },
    nextAction: {
      kind: "closing",
      state: "actionable",
      workItemKey: "public-safe-work-item-closing",
      label: "기록 초안을 검토하면 멤버에게 게시할 수 있어요",
      ctaLabel: "기록 초안 검토",
      note: "게시 전에 피드백 문서를 확인해 주세요",
      reason: "출석은 확정됐고, 소감 4개를 기다리고 있어요.",
      href: "/clubs/reading-sai/app/host/records",
    },
    closingContent: phaseStatusLedger("마감 현황", closingStatusRows),
    workboxItems: closingWorkboxItems,
  });
}

async function regionFromLocator(
  locator: Locator,
  name: string,
  expected: ApprovedRegion["expected"],
  toleranceCssPx: 2 | 4,
): Promise<ApprovedRegion> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name} has no bounding box`);
  const actual = { x: box.x, y: box.y, width: box.width, height: box.height };
  try {
    expectGeometryWithinTolerance(actual, expected, toleranceCssPx);
  } catch (error) {
    throw new Error(
      `${name} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
      { cause: error },
    );
  }
  return { name, actual, expected, toleranceCssPx };
}

async function mountApproved(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  node: ReactElement,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addStyleTag({
    content: "html, body, #root, .rm-app-club-shell { height: 100%; margin: 0; overflow: hidden; }",
  });
  const component = await mount(node);
  await expectNoHorizontalOverflow(page);
  return component;
}

test("prep locks the approved desktop operating room", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, prepApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  const context = component.getByRole("group", { name: "현재 모임" });
  const phases = component.getByRole("navigation", { name: "모임 운영 단계" });
  const nextAction = component.getByRole("region", { name: "다음에 할 일" });
  const preparation = component.getByRole("region", { name: "준비 현황" });
  const workbox = component.getByRole("complementary", { name: "클럽 작업함" });
  const order = [context, phases, nextAction, preparation, workbox];
  expect(await isSemanticDocumentOrder(order)).toBe(true);
  await expect(component.getByRole("heading", { name: "지구 끝의 온실" })).toBeVisible();
  await expect(nextAction).toContainText("최신 일정을 아직 보지 않은 4명이 있어요");
  await expect(preparation.getByRole("listitem")).toHaveCount(4);
  await expect(workbox.getByRole("listitem")).toHaveCount(4);
  await expect(workbox.getByRole("combobox", { name: /보류 기간/ })).toHaveCount(0);
  await regionFromLocator(component.locator(".rm-host-operating-room__body"), "body", BODY_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room__workbox-rail"), "workbox", WORKBOX_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__body"), BODY_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__workbox-rail"), WORKBOX_DESKTOP_GEOMETRY, 4);
  await expect(component.getByRole("link", { name: "ReadMates" })).toBeVisible();
  await expect(component.getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("link", { name: "모임 정보" })).toBeVisible();
  await expect(component.getByRole("link", { name: "일정 편집" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "현재 모임 작업" }).getByRole("link", { name: "변경 이력" })).toBeVisible();
  await expect(component.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
  await expect(component.getByRole("region", { name: "준비 현황" }).getByRole("link", { name: /보기/ }).first()).toBeVisible();
  await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).toHaveCount(4);
  await expect(component.getByRole("button", { name: /보류/ })).toHaveCount(0);
  const cover = component.locator(".rm-operating-room-header__cover .rm-book-cover");
  await expect(cover).toBeVisible();
  const coverBox = await cover.boundingBox();
  expect(coverBox, "cover cell").not.toBeNull();
  expect(coverBox!.width).toBeGreaterThan(48);
  expect(coverBox!.height).toBeGreaterThan(48);
  await expect(cover.locator(".rm-book-cover__image")).toBeVisible();
  await expect(cover.locator(".rm-book-cover__fallback")).toHaveCount(0);
  const prepIcons = component.getByRole("region", { name: "준비 현황" });
  await expect(prepIcons.locator("svg[data-icon='calendar']")).toBeVisible();
  await expect(prepIcons.locator("svg[data-icon='people']")).toBeVisible();
  await expect(prepIcons.locator("svg[data-icon='notes']")).toBeVisible();
  await expect(prepIcons.locator("svg[data-icon='pin']")).toBeVisible();
  const headerActions = component.getByRole("navigation", { name: "현재 모임 작업" });
  await expect(headerActions.locator("svg[data-icon='info']")).toBeVisible();
  await expect(headerActions.locator("svg[data-icon='edit']")).toBeVisible();
  await expect(headerActions.locator("svg[data-icon='history']")).toBeVisible();
  await expect(headerActions.locator("svg[data-icon='eye']")).toHaveCount(0);
  await expect(headerActions).not.toContainText("멤버 시야");
  const workboxTitle = workbox.getByRole("heading", { name: "호스트 작업함" });
  await expect(workboxTitle).toBeVisible();
  expect(await workboxTitle.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(10);
  expect(await workboxTitle.evaluate((node) => getComputedStyle(node, "::after").content)).toBe("none");
  await expect(nextAction.getByText("일정이 어제 19:30에 변경되었어요")).toBeVisible();
  expect(await nextAction.evaluate((node) => getComputedStyle(node, "::after").content)).toBe("none");
});

test("live locks the approved desktop operating room", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(
    mount,
    page,
    liveApprovedView(),
    APPROVED_DESKTOP_VIEWPORT,
  );
  await expect(component.getByRole("region", { name: "다음에 할 일" })).toContainText("아직 출석을 확인하지 않은 3명이 있어요");
  await expect(component.getByRole("region", { name: "현장 현황" })).toBeVisible();
  await expect(component.getByText("실제 출석", { exact: true })).toBeVisible();
  await expect(component.getByRole("region", { name: "현장 현황" }).getByText("참석 응답")).toBeVisible();
  await expect(component.getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
  await expect(component.getByRole("link", { name: "모임 정보" })).toBeVisible();
  await expect(component.getByRole("link", { name: "출석 확인 시작" })).toBeVisible();
  await expect(component.getByRole("link", { name: "모임 진행 보기" })).toBeVisible();
  await expect(component.getByRole("link", { name: "모임 진행 보기" }).locator("svg[data-icon='list']")).toBeVisible();
  await expect(component.getByRole("region", { name: "현장 현황" })).toBeVisible();
  const liveLedger = component.getByRole("region", { name: "현장 현황" });
  await expect(liveLedger.locator("svg[data-icon='person']")).toBeVisible();
  await expect(liveLedger.locator("svg[data-icon='people']")).toBeVisible();
  await expect(liveLedger.locator("svg[data-icon='list']")).toBeVisible();
  await expect(liveLedger.locator("svg[data-icon='notes']")).toBeVisible();
  await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem", { name: "출석 미확인" })).toBeVisible();
  await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).not.toHaveCount(0);
  await expect(component.getByRole("heading", { name: "출석 확인" })).toHaveCount(0);
  await expect(component.locator(".rm-meeting-response-ledger--attendance-board")).toHaveCount(0);
  await expect(component.getByRole("region", { name: "다음에 할 일" }).getByText("오후 7:26 · 현장 모드가 열렸어요")).toBeVisible();
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__body"), BODY_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__workbox-rail"), WORKBOX_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room__body"), "body", BODY_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room__workbox-rail"), "workbox", WORKBOX_DESKTOP_GEOMETRY, 4);
});

test("closing locks the approved desktop operating room", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, closingApprovedView(), APPROVED_DESKTOP_VIEWPORT);
  await expect(component.getByRole("region", { name: "다음에 할 일" })).toContainText("기록 초안을 검토하면 멤버에게 게시할 수 있어요");
  await expect(component.getByRole("region", { name: "다음에 할 일" }).getByRole("link", { name: "기록 초안 검토" })).toBeVisible();
  await expect(component.getByRole("region", { name: "마감 현황" }).getByRole("listitem")).toHaveCount(5);
  const closingItems = component.getByRole("region", { name: "마감 현황" }).getByRole("listitem");
  await expect(closingItems).toHaveCount(5);
  for (const index of [1, 2, 3, 4, 5]) {
    await expect(closingItems.nth(index - 1).locator("[data-index]")).toHaveText(String(index));
  }
  await expect(component.getByRole("region", { name: "마감 현황" }).getByRole("link", { name: /보기|열기|확인|조건/ }).first()).toBeVisible();
  await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem", { name: "기록 초안 검토" })).toBeVisible();
  await expect(component.getByRole("region", { name: "다음에 할 일" }).getByText("게시 전에 피드백 문서를 확인해 주세요")).toBeVisible();
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__body"), BODY_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(component.locator(".rm-host-operating-room__workbox-rail"), WORKBOX_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room__body"), "body", BODY_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room__workbox-rail"), "workbox", WORKBOX_DESKTOP_GEOMETRY, 4);
});

test("prep locks the approved mobile operating room", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(mount, page, prepApprovedView(), APPROVED_MOBILE_VIEWPORT);
  const nextAction = component.getByRole("region", { name: "다음에 할 일" });
  const preparation = component.getByRole("region", { name: "준비 현황" });
  const workbox = component.getByRole("complementary", { name: "클럽 작업함" });
  const bottomNav = component.locator('[data-club-shell-region="mobile-primary"]');
  await expect(component.getByRole("link", { name: "멤버 시야" })).toBeVisible();
  await expect(component.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "호스트 주 메뉴 모바일" })).toBeVisible();
  await expect(component.getByRole("region", { name: "준비 현황" }).getByRole("listitem")).toHaveCount(4);
  await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).not.toHaveCount(0);
  await expect(nextAction).toBeVisible();
  await expect(nextAction).toContainText("대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.");
  await expect(nextAction.getByText("일정이 어제 19:30에 변경되었어요")).toBeVisible();
  await expect(preparation.getByText("변경 전 확인 1 · 미열람 3")).toBeVisible();
  await expect(preparation.getByText("참석 7 · 불참 2 · 미응답 3")).toBeVisible();
  await expect(preparation.getByText("2명은 아직 작성 전")).toBeVisible();
  await expect(preparation.getByText("을지로 북살롱 예약 확인")).toBeVisible();
  await expect(preparation.getByRole("listitem")).toHaveCount(4);
  for (const index of [1, 2, 3, 4]) {
    const marker = preparation.getByRole("listitem").nth(index - 1).locator("[data-prep-index]");
    await expect(marker).toBeVisible();
    await expect(marker).toHaveText(String(index).padStart(2, "0"));
  }
  await expect(workbox.getByRole("listitem")).toHaveCount(4);
  await expect(workbox.getByRole("combobox", { name: /보류 기간/ })).toHaveCount(0);
  await expect(bottomNav).toBeVisible();
  const cover = component.locator(".rm-operating-room-header__cover .rm-book-cover");
  await expect(cover).toBeVisible();
  const coverBox = await cover.boundingBox();
  expect(coverBox, "cover cell").not.toBeNull();
  expect(coverBox!.width).toBeGreaterThan(48);
  expect(coverBox!.height).toBeGreaterThan(48);
  const frame = { x: 0, y: 0, width: 390, height: 832 };
  await expect(bottomNav).toHaveCSS("position", "fixed");
  const navBox = await bottomNav.boundingBox();
  expect(navBox, "bottom-nav").not.toBeNull();
  expect(navBox!.y).toBeGreaterThanOrEqual(frame.height - 140);
  expect(navBox!.y).toBeLessThan(frame.height);
  const firstWorkboxRow = workbox.getByRole("listitem").first();
  await expect(firstWorkboxRow).toBeVisible();
  for (const [name, locator] of [
    ["next-action", nextAction],
    ["prep-row-1", preparation.getByRole("listitem").first()],
    ["prep-row-4", preparation.getByRole("listitem").nth(3)],
  ] as const) {
    const box = await locator.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x, name).toBeGreaterThanOrEqual(frame.x);
    expect(box!.y, name).toBeGreaterThanOrEqual(frame.y);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(frame.width + 1);
    expect(
      box!.y + box!.height,
      `${name} y=${box!.y} h=${box!.height} navY=${navBox!.y}`,
    ).toBeLessThanOrEqual(navBox!.y + 2);
  }
  await regionFromLocator(bottomNav, "nav", MOBILE_NAV_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room"), "main", PREP_MOBILE_MAIN_GEOMETRY, 4);
});

test("live locks the approved mobile attendance board", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApproved(
    mount,
    page,
    liveApprovedView({ kind: "live", label: "진행 중" }),
    APPROVED_MOBILE_VIEWPORT,
  );
  await expect(component.getByRole("button", { name: /참석|출석/ }).first()).toBeVisible();
  await expect(component.getByText(/8\s*\/\s*12/)).toBeVisible();
  await expect(component.getByText(/확인 필요 3/)).toBeVisible();
  await expect(component.getByRole("link", { name: "출석 12명 모두 보기" })).toBeVisible();
  await expect(component.getByRole("navigation", { name: "호스트 주 메뉴 모바일" })).toBeVisible();
  await expect(component.getByRole("link", { name: "멤버 시야" })).toBeVisible();
  await expect(component.getByText("진행 중")).toBeVisible();
  await expect(component.getByRole("heading", { name: "출석 확인" })).toBeVisible();
  await expect(component.locator(".rm-meeting-response-ledger--attendance-board")).toBeVisible();
  await expect(component.getByRole("region", { name: "현장 현황" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "박서윤 참석" })).toHaveAttribute("aria-pressed", "true");
  await expect(component.getByRole("button", { name: "박서윤 불참" })).toBeVisible();
  await expect(component.getByRole("button", { name: "박서윤 미확인" })).toBeVisible();
  await expect(component.getByRole("button", { name: "이하린 미확인" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: /나머지 .*명 모두 참석/ })).toHaveCount(0);
  await expect(component.locator(".rm-meeting-response-ledger--attendance-board .rm-avatar-chip").first()).toBeVisible();
  await expect(component.getByRole("button", { name: "실행 취소" })).toHaveCount(0);
  const board = component.locator(".rm-meeting-response-ledger--attendance-board");
  const roster = board.getByRole("listitem");
  await expect(roster).toHaveCount(1);
  const bottomNav = component.locator('[data-club-shell-region="mobile-primary"]');
  const frame = { x: 0, y: 0, width: 390, height: 832 };
  await expect(bottomNav).toHaveCSS("position", "fixed");
  const navBox = await bottomNav.boundingBox();
  expect(navBox, "bottom-nav").not.toBeNull();
  expect(navBox!.y).toBeGreaterThanOrEqual(frame.height - 140);
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(frame.height + 1);
  const disclose = component.getByRole("link", { name: "출석 12명 모두 보기" });
  for (const [name, locator] of [
    ["roster-row-1", roster.first()],
    ["disclose", disclose],
  ] as const) {
    const box = await locator.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x, name).toBeGreaterThanOrEqual(frame.x);
    expect(box!.y, name).toBeGreaterThanOrEqual(frame.y);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(frame.width + 1);
    expect(box!.y + box!.height, `${name} y=${box!.y} h=${box!.height} navY=${navBox!.y}`).toBeLessThanOrEqual(navBox!.y + 2);
  }
  await regionFromLocator(bottomNav, "nav", MOBILE_NAV_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-host-operating-room"), "main", LIVE_MOBILE_MAIN_GEOMETRY, 4);
  await regionFromLocator(board, "board", CT_LIVE_MOBILE_BOARD_GEOMETRY, 4);
});

test("empty operating room primary stays readable without a phase overlay", async ({ mount, page }) => {
  await page.setViewportSize(APPROVED_DESKTOP_VIEWPORT);
  const component = await mount(
    <HostOperatingRoomPage
      view={{
        meeting: null,
        phases: [],
        phase: "prep",
        nextAction: {
          kind: "create-meeting",
          state: "actionable",
          workItemKey: null,
          label: "첫 모임 만들기",
          reason: "운영실에서 준비할 첫 모임을 만드세요.",
          href: "/clubs/reading-sai/app/host/sessions/new",
        },
        preparation: [],
        partialFailures: [],
        closing: null,
      }}
      badge={null}
      headerLinks={null}
      phaseLinks={[]}
      phaseNormalizationReason={null}
      optionalFailureMessages={[]}
      recovery={null}
      liveContent={null}
      closingContent={null}
      workboxContent={<aside>작업함</aside>}
      createMeetingHref="/clubs/reading-sai/app/host/sessions/new"
      onPhaseChange={() => undefined}
      onRetryPreparation={() => undefined}
      onRetryOptional={() => undefined}
      nextActionPending={false}
      onDeferNextAction={() => undefined}
    />,
  );
  const primary = component.locator("a.rm-operating-room-next-action__primary");
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText("첫 모임 만들기");
  const fontSize = await primary.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(fontSize).toBeGreaterThan(10);
  expect(await primary.evaluate((node) => getComputedStyle(node, "::after").content)).toBe("none");
});
