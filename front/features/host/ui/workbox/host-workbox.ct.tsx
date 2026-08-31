import { expect, test } from "@playwright/experimental-ct-react";
import type { HostWorkboxView } from "@/features/host/model/host-workbox-model";
import { expectMinimumTargetSize, expectNoHorizontalOverflow, expectVisibleFocus } from "@/tests/e2e/support/visual-authority-contract";
import { HostWorkbox } from "./host-workbox";
import "../operating-room/operating-room.css";

const view: HostWorkboxView = {
  state: "NOW",
  evaluatedAt: "2026-08-30T09:00:00Z",
  partialWarnings: [],
  nextCursor: null,
  items: [{
    key: "SCHEDULE_UNSEEN:session-1:r7",
    type: "SCHEDULE_UNSEEN",
    state: "NOW",
    title: "일정 확인이 필요한 멤버",
    description: "변경 전 확인 1명 · 미열람 2명",
    count: 3,
    dueAt: "2026-08-31T09:00:00Z",
    deferredUntil: null,
    resolvedAt: null,
    destinationHref: "/app/host/sessions/session-1/schedule-review",
    receiptSummary: null,
    operationalLabel: "일정 미열람 확인",
    destinationCategory: "schedule-review",
    countLabel: "3",
  }],
};

function fixture() {
  return (
    <main className="rm-host-operating-room">
      <div className="rm-host-operating-room__body">
        <div className="rm-host-operating-room__primary" data-testid="preparation-column">
          <section aria-label="준비실 본문" style={{ minHeight: 420, padding: 24 }}>
            <h2>준비실</h2>
            <p>현재 모임 준비 장부</p>
          </section>
        </div>
        <aside className="rm-host-operating-room__workbox-rail" data-testid="workbox-column">
          <HostWorkbox
            state="NOW"
            view={view}
            loading={false}
            error={null}
            pendingKey={null}
            onStateChange={() => undefined}
            onRetry={() => undefined}
            onLoadMore={() => undefined}
            onDefer={() => undefined}
            onUndoDeferral={() => undefined}
          />
        </aside>
      </div>
    </main>
  );
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "threshold", width: 1199, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test(`workbox rail composition at ${viewport.width}px`, async ({ mount, page }) => {
      const component = await mount(fixture());
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const primary = await component.getByTestId("preparation-column").boundingBox();
      const workbox = await component.getByTestId("workbox-column").boundingBox();

      expect(primary).not.toBeNull();
      expect(workbox).not.toBeNull();
      if (viewport.width === 1440) {
        expect(Math.abs((primary!.width / (primary!.width + workbox!.width)) - 0.68)).toBeLessThan(0.04);
        expect(workbox!.x).toBeGreaterThan(primary!.x);
      } else {
        expect(workbox!.y).toBeGreaterThanOrEqual(primary!.y + primary!.height);
      }

      await expectNoHorizontalOverflow(page);
      for (const control of await component.getByRole("button").all()) await expectMinimumTargetSize(control);
      for (const control of await component.getByRole("link").all()) await expectMinimumTargetSize(control);
      const firstTab = component.getByRole("tab", { name: /지금/ });
      await firstTab.focus();
      await expectVisibleFocus(firstTab);
    });
  });
}
