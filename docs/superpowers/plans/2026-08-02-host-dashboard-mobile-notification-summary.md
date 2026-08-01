# Host Dashboard Mobile Notification Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 호스트 대시보드의 알림 발송 요약을 중첩 카드와 불균형 배지 없이 읽기 쉬운 3열 상태 rail과 명확한 장부 이동 행으로 재구성한다.

**Architecture:** `HostNotificationLedger`는 기존 desktop markup을 유지하고 `mobile`일 때만 전용 semantic section을 렌더링한다. 모바일 전용 스타일은 이미 로드되는 `front/shared/styles/mobile.css`에 `.mobile-only .rm-host-mobile-notifications*` 범위로 추가하며, API·라우트·발송 동작은 바꾸지 않는다.

**Tech Stack:** React 19, TypeScript, React Router link abstraction, CSS, Vitest + Testing Library, Playwright

## Global Constraints

- 모바일 상태는 `대기`, `실패`, `중단`의 `repeat(3, minmax(0, 1fr))` 한 줄 metric rail이어야 한다.
- 모바일 `HostNotificationLedger`에 `m-card-quiet`, 공통 `badge`, `badge-dot`을 사용하지 않는다.
- `알림 발송 장부 열기` 링크는 club-scoped href 계약과 최소 44px 터치 영역을 유지한다.
- 최근 실패는 최대 3건만 표시하고 기존 이메일 마스킹을 유지한다.
- 320x844와 390x844에서 텍스트 겹침, 가로 overflow, 비대칭 status 폭이 없어야 한다.
- 데스크톱 알림 요약, API, query, BFF, server, migration, 실제 알림 발송·재처리 동작은 변경하지 않는다.
- 기존 사용자 변경이 있는 `front/src/styles/globals.css`는 수정하지 않는다.
- 커밋에는 이 기능의 spec, plan, 구현, 테스트만 포함한다.

---

### Task 1: 모바일 알림 요약의 의미 구조와 회귀 계약

**Files:**
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/dashboard/host-notification-ledger.tsx`

**Interfaces:**
- Consumes: `HostNotificationSummary`, `HostDashboardLinkComponent`, `nonNegativeCount()`
- Produces: 모바일 region `.rm-host-mobile-notifications`, description list `.rm-host-mobile-notifications__metrics`, 상태별 `data-status`, 링크 `.rm-host-mobile-notifications__ledger-link`

- [ ] **Step 1: Write the failing semantic-layout test**

```tsx
it("renders the mobile notification summary as an equal metric rail without nested cards", () => {
  const { container } = render(
    <HostDashboardForTest current={current} data={dashboard} notifications={notificationSummary} />,
  );
  const mobile = getMobileView(container);
  const region = mobile.getByRole("region", { name: "알림 발송" });

  expect(region).toHaveClass("rm-host-mobile-notifications");
  expect(region).not.toHaveClass("m-card-quiet");
  const metrics = region.querySelector(".rm-host-mobile-notifications__metrics");
  expect(metrics?.querySelectorAll(":scope > div")).toHaveLength(3);
  expect(within(region).getByText("대기").parentElement).toHaveTextContent("2");
  expect(within(region).getByText("실패").parentElement).toHaveTextContent("1");
  expect(within(region).getByText("중단").parentElement).toHaveTextContent("1");
  expect(region.querySelector(".badge")).toBeNull();
  expect(within(region).getByRole("link", { name: "알림 발송 장부 열기" })).toHaveAttribute(
    "href",
    "/app/host/notifications",
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/host-dashboard.test.tsx -t "renders the mobile notification summary as an equal metric rail without nested cards"
```

Expected: FAIL because the current mobile section has `m-card-quiet`, no named region or metric `dl`, and still renders badges.

- [ ] **Step 3: Implement the mobile-only semantic branch**

Add a mobile branch before the existing desktop body:

```tsx
if (mobile) {
  const metrics = [
    { key: "pending", label: "대기", value: notifications.pending },
    { key: "failed", label: "실패", value: notifications.failed },
    { key: "dead", label: "중단", value: notifications.dead },
  ] as const;

  return (
    <section className="rm-host-mobile-notifications" aria-labelledby="host-mobile-notifications-title">
      <header className="rm-host-mobile-notifications__header">
        <h2 id="host-mobile-notifications-title">알림 발송</h2>
        <span>최근 24시간 {nonNegativeCount(notifications.sentLast24h)}건</span>
      </header>
      <dl className="rm-host-mobile-notifications__metrics">
        {metrics.map(({ key, label, value }) => (
          <div key={key} data-status={key} data-active={value > 0 ? "true" : "false"}>
            <dt>{label}</dt>
            <dd className="ledger-number">{nonNegativeCount(value)}</dd>
          </div>
        ))}
      </dl>
      {failures.length > 0 ? (
        <ul className="rm-host-mobile-notifications__failures" aria-label="최근 실패 알림">
          {failures.map((failure) => (
            <li key={failure.id}>
              <span>
                <strong className="mono">{failure.eventType}</strong>
                <small>{maskEmail(failure.recipientEmail)}</small>
              </span>
              <small className="mono">{nonNegativeCount(failure.attemptCount)}회 시도</small>
            </li>
          ))}
        </ul>
      ) : null}
      <LinkComponent to="/app/host/notifications" className="rm-host-mobile-notifications__ledger-link">
        <span>알림 발송 장부 열기</span>
        <span aria-hidden="true"><Icon name="arrow-right" size={14} /></span>
      </LinkComponent>
    </section>
  );
}
```

Keep the existing desktop body and `badgeClass()` behavior unchanged. Render failure items in compact rows with `maskEmail()` and `attemptCount`; do not introduce mutations or dispatch controls.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/host-dashboard.test.tsx -t "renders the mobile notification summary as an equal metric rail without nested cards"
```

Expected: PASS.

### Task 2: 모바일 320/390px 레이아웃과 터치 계약

**Files:**
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/e2e/host-club-operations.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `.rm-host-mobile-notifications*` selectors와 `data-status`, `data-active`
- Produces: 균등 3열 rail, 단일 divider 구조, 44px 이상 action row, responsive wrap/overflow 보장

- [ ] **Step 1: Write the failing responsive browser assertions**

Inside the mobile viewport branch, open the `운영 도구` disclosure and assert:

```ts
const tools = page.getByText("운영 도구", { exact: true }).locator("xpath=ancestor::details");
await tools.locator("summary").click();
const notifications = tools.getByRole("region", { name: "알림 발송" });
const metricCells = notifications.locator(".rm-host-mobile-notifications__metrics > div");
await expect(metricCells).toHaveCount(3);
const widths = await metricCells.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
await expect(notifications).toHaveCSS("border-top-width", "0px");
await expect(notifications).toHaveCSS("border-bottom-width", "0px");
const ledgerLink = notifications.getByRole("link", { name: "알림 발송 장부 열기" });
expect((await ledgerLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
```

Run:

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts --grep "priority-ledger visual evidence"
```

Expected: FAIL because the named mobile region and equal metric cells do not exist yet or lack the new CSS.

- [ ] **Step 2: Add scoped mobile styles**

Add to `front/shared/styles/mobile.css`:

```css
.mobile-only .rm-host-mobile-notifications {
  padding: 16px 0 4px;
}
.mobile-only .rm-host-mobile-notifications__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
}
.mobile-only .rm-host-mobile-notifications__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 14px 0 0;
  padding: 14px 0;
  border-block: 1px solid var(--line-soft);
}
.mobile-only .rm-host-mobile-notifications__metrics > div {
  display: grid;
  justify-items: center;
  gap: 4px;
  border-left: 1px solid var(--line-soft);
}
.mobile-only .rm-host-mobile-notifications__metrics > div:first-child {
  border-left: 0;
}
.mobile-only .rm-host-mobile-notifications__ledger-link {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
}
```

Also add explicit type sizes, neutral/non-zero tones through `data-status` and `data-active`, compact failure rows, `overflow-wrap`, and a visible `:focus-visible` outline. Do not add an outer border or radius to the notification section.

- [ ] **Step 3: Run responsive E2E and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts --grep "priority-ledger visual evidence"
```

Expected: PASS at mobile-320 and mobile-390 with equal widths, no nested section border, action height at least 44px, and no document overflow.

### Task 3: 회귀 검증과 기능 전용 커밋

**Files:**
- Verify: `front/features/host/ui/dashboard/host-notification-ledger.tsx`
- Verify: `front/shared/styles/mobile.css`
- Verify: `front/tests/unit/host-dashboard.test.tsx`
- Verify: `front/tests/e2e/host-club-operations.spec.ts`
- Verify: `docs/superpowers/specs/2026-08-02-host-dashboard-mobile-notification-summary-design.md`
- Verify: `docs/superpowers/plans/2026-08-02-host-dashboard-mobile-notification-summary.md`

**Interfaces:**
- Consumes: completed mobile summary implementation and tests
- Produces: lint/test/build/browser evidence and one scoped git commit

- [ ] **Step 1: Run focused unit regressions**

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx tests/unit/host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the focused E2E file**

```bash
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run the frontend gate**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all PASS without new warnings.

- [ ] **Step 4: Inspect the live route at 320x844 and 390x844**

Open `/clubs/reading-sai/app/host`, expand `운영 도구`, and verify the status rail, divider count, failure rows, focus affordance, touch target, and horizontal overflow. Capture screenshots only as local ignored evidence.

- [ ] **Step 5: Review and commit only the feature files**

```bash
git diff --check -- \
  docs/superpowers/specs/2026-08-02-host-dashboard-mobile-notification-summary-design.md \
  docs/superpowers/plans/2026-08-02-host-dashboard-mobile-notification-summary.md \
  front/features/host/ui/dashboard/host-notification-ledger.tsx \
  front/shared/styles/mobile.css \
  front/tests/unit/host-dashboard.test.tsx \
  front/tests/e2e/host-club-operations.spec.ts
git add -- <same six files>
git diff --cached --check
git commit -m "fix: redesign mobile notification summary"
```

Expected: one commit containing no unrelated user changes.
