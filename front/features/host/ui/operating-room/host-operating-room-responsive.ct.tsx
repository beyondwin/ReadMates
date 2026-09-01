import { expect, test } from "@playwright/experimental-ct-react";
import type { ReactNode } from "react";
import type { HostOperatingRoomView } from "@/features/host/model/host-operating-room-model";
import type { HostWorkboxView } from "@/features/host/model/host-workbox-model";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { HostWorkbox } from "../workbox/host-workbox";
import {
  HostOperatingRoomPage,
  type AttendanceRecoveryView,
} from "./host-operating-room-page";

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
    bookImageUrl: null,
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
      value: "현재 일정 확인 0/12,345",
      detail: "변경 전 확인 1 · 미열람 12,344",
      numerator: 0,
      denominator: 12_345,
      href: "/clubs/public-safe/app/host/sessions/public-safe-session-27/schedule-review",
      workItemKey: "public-safe-work-item-27",
    },
    {
      id: "rsvp",
      label: "참석 응답",
      state: "complete",
      value: "응답 12,345/12,345",
      detail: "모든 참여자가 응답했습니다.",
      numerator: 12_345,
      denominator: 12_345,
      href: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=responses",
      workItemKey: null,
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

export function Link({ to, children, ...props }: { to: string; children: ReactNode; className?: string; "aria-label"?: string }) {
  return <a {...props} href={to}>{children}</a>;
}

function operatingRoomFixture(recovery: AttendanceRecoveryView | null = null) {
  const workbox = (
    <HostWorkbox
      state="NOW"
      view={workboxView}
      loading={false}
      error={null}
      pendingKey={null}
      onStateChange={() => undefined}
      onRetry={() => undefined}
      onLoadMore={() => undefined}
      onDefer={() => undefined}
      onUndoDeferral={() => undefined}
      LinkComponent={Link}
    />
  );

  return (
    <HostOperatingRoomPage
      view={view}
      dDayLabel="D-1"
      headerLinks={{
        infoHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic",
        scheduleHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=basic&edit=1",
        historyHref: "/clubs/public-safe/app/host/sessions/public-safe-session-27?section=history",
        memberViewHref: "/clubs/public-safe/app/sessions/public-safe-session-27",
      }}
      phaseLinks={phaseLinks}
      phaseNormalizationReason={null}
      optionalFailureMessages={[]}
      recovery={recovery}
      liveContent={<section aria-label="현장 운영">현장 운영</section>}
      closingContent={<section aria-label="마감 운영">마감 운영</section>}
      workboxContent={workbox}
      createMeetingHref="/clubs/public-safe/app/host/sessions/new"
      onPhaseChange={() => undefined}
      onRetryPreparation={() => undefined}
      onRetryOptional={() => undefined}
      nextActionPending={false}
      onDeferNextAction={() => undefined}
      LinkComponent={Link}
    />
  );
}

const viewports = [
  { width: 390, height: 844 },
  { width: 767, height: 900 },
  { width: 768, height: 900 },
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
    await expect(component.getByText("현재 일정 확인 0/12,345")).toBeVisible();
    await expect(component.getByText("수량").first()).toBeVisible();
    await expect(component.getByText("12,345", { exact: true }).last()).toBeVisible();
    await expect(component.getByText("알림 실패 확인 일부 행을 불러오지 못했어요.")).toBeVisible();

    const semanticOrder = await component.evaluate((root) => {
      const selectors = [
        '[aria-label="현재 모임"]',
        'nav[aria-label="모임 운영 단계"]',
        '[aria-labelledby="rm-operating-room-next-action-title"]',
        '[aria-labelledby="rm-preparation-ledger-title"]',
        'aside[aria-label="클럽 작업함"]',
      ];
      const nodes = selectors.map((selector) => root.querySelector(selector));
      return nodes.every((node, index) => node && (index === 0 || Boolean(nodes[index - 1]?.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)));
    });
    expect(semanticOrder).toBe(true);

    const primaryBox = await primary.boundingBox();
    const workboxBox = await workbox.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(workboxBox).not.toBeNull();
    if (viewport.width < 1200) {
      expect(workboxBox!.y).toBeGreaterThanOrEqual(primaryBox!.y + primaryBox!.height - 1);
    } else {
      expect(workboxBox!.x).toBeGreaterThan(primaryBox!.x);
      expect(Math.abs(primaryBox!.width / (primaryBox!.width + workboxBox!.width) - 0.68)).toBeLessThan(0.04);
    }

    await expectNoHorizontalOverflow(page);
    for (const control of await component.locator("button:visible, a[href]:visible, select:visible").all()) {
      await expectMinimumTargetSize(control);
    }
  });
}

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
