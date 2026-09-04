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
        expect(workbox!.width).toBeGreaterThanOrEqual(360);
      } else {
        expect(workbox!.y).toBeGreaterThanOrEqual(primary!.y + primary!.height);
      }

      await expectNoHorizontalOverflow(page);
      for (const control of await component.getByRole("button").all()) await expectMinimumTargetSize(control);
      for (const control of await component.getByRole("link").all()) await expectMinimumTargetSize(control);
      const firstTab = component.getByRole("tab", { name: /지금/ });
      await firstTab.focus();
      await expectVisibleFocus(firstTab);

      const row = component.getByRole("listitem", { name: /일정 확인이 필요한 멤버/ });
      const details = row.locator("details.rm-host-work-item__secondary");
      await expect(details).not.toHaveAttribute("open");
      await expect(row.getByRole("combobox", { name: /보류 기간/ })).toHaveCount(0);
      await expect(row.getByRole("button", { name: /보류$/ })).toHaveCount(0);
      await expect(row.getByRole("link", { name: "일정 확인이 필요한 멤버" })).toBeVisible();
      await row.getByText("세부 조작").click();
      await expect(details).toHaveAttribute("open");
      await expectMinimumTargetSize(row.getByRole("combobox", { name: /보류 기간/ }));
      await expectMinimumTargetSize(row.getByRole("button", { name: /보류$/ }));
    });
  });
}

const DENSITY_TYPES = [
  "SCHEDULE_UNSEEN",
  "MEMBER_APPROVAL",
  "RECORD_CLOSING",
  "INVITATION_EXPIRY",
  "NOTIFICATION_FAILURE",
] as const;

function densityItems(count: number): HostWorkboxView["items"] {
  return Array.from({ length: count }, (_, index) => ({
    ...view.items[0],
    key: `${DENSITY_TYPES[index % DENSITY_TYPES.length]}:resource-${index}:g1`,
    type: DENSITY_TYPES[index % DENSITY_TYPES.length],
    title: `작업 ${index + 1}`,
    count: index + 1,
    countLabel: String(index + 1),
    destinationHref: `/app/host/destination/${index}`,
  }));
}

test("desktop workbox shows four items and 작업함 모두 보기 until expanded", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const items = densityItems(12);
  const component = await mount(
    <main className="rm-host-operating-room">
      <aside className="rm-host-operating-room__workbox-rail">
        <HostWorkbox
          state="NOW"
          view={{ ...view, items, nextCursor: "workbox-next" }}
          disclosure={{
            visibleItems: items.slice(0, 4),
            hiddenCount: 8,
            hasMore: true,
            expanded: false,
          }}
          loading={false}
          error={null}
          pendingKey={null}
          onStateChange={() => undefined}
          onRetry={() => undefined}
          onLoadMore={() => undefined}
          onShowAll={() => undefined}
          onDefer={() => undefined}
          onUndoDeferral={() => undefined}
        />
      </aside>
    </main>,
  );

  await expect(component.getByRole("listitem")).toHaveCount(4);
  await expect(component.getByRole("button", { name: "작업함 모두 보기" })).toBeVisible();
  await expect(component.getByRole("link", { name: "작업 5" })).toHaveCount(0);
});

test("mobile workbox shows three items and 작업함 모두 보기 until expanded", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const items = densityItems(12);
  const component = await mount(
    <main className="rm-host-operating-room">
      <aside className="rm-host-operating-room__workbox-rail">
        <HostWorkbox
          state="NOW"
          view={{ ...view, items, nextCursor: null }}
          disclosure={{
            visibleItems: items.slice(0, 3),
            hiddenCount: 9,
            hasMore: true,
            expanded: false,
          }}
          loading={false}
          error={null}
          pendingKey={null}
          onStateChange={() => undefined}
          onRetry={() => undefined}
          onLoadMore={() => undefined}
          onShowAll={() => undefined}
          onDefer={() => undefined}
          onUndoDeferral={() => undefined}
        />
      </aside>
    </main>,
  );

  await expect(component.getByRole("listitem")).toHaveCount(3);
  await expect(component.getByRole("button", { name: "작업함 모두 보기" })).toBeVisible();
});
