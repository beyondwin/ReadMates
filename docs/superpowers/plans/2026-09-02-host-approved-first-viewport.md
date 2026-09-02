# Host Approved First-Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host 승인 시안 `07`–`17` 11장을 실제 Host 페이지로 렌더해, 사람이 첫 화면을 시안과 같은 화면으로 읽게 한다.

**Architecture:** 캡처 셸이 화면마다 현재 목적지를 갖게 하고, 시안 첫 화면 카피·랜드마크를 RED 테스트로 고정한 뒤 기존 Host 컴포넌트와 가상 픽스처를 그 상태로 조합한다. 픽셀 비율 `0.02`는 측정값이며, 폰트 예외는 독립 시각 검토가 구성을 합격한 뒤에만 켠다.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Playwright 1.61 CT/E2E, existing approved-mockup harness, bundled Pretendard Variable, book-club artwork avatars

**Spec:** `docs/superpowers/specs/2026-09-02-host-approved-first-viewport-design.md`

**Plan base:** `4f0d3d453`

ADR impact: **update** — ADR-0053 stays `Proposed`. Task 11 records Host-slice pass as independent first-viewport review. Do not Accept ADR-0053.

## Global Constraints

- 시각 권위는 Host `docs/development/host-redesign-mockups/07–17` PNG다.
- 합격은 첫 화면 구성·카피·순서·펼침의 독립 시각 검토다. `maxDiffPixelRatio` `0.02`는 manifest에 유지하고 Host 슬라이스 합격 게이트로 쓰지 않는다.
- `allowFontRasterException`은 해당 id의 첫 화면 구성이 독립 검토에서 맞은 뒤에만 허용한다. 구성 전에 켜서 CT를 통과시키지 않는다.
- 승인 PNG를 runtime background 또는 UI image로 쓰지 않는다. CSS `content` 제목과 `font-size: 0` 오버레이를 쓰지 않는다.
- 실제 Host route/페이지를 조합한다. 시안 전용 가짜 페이지를 만들지 않는다.
- 새 서버 API, DTO, mutation, BFF, deploy는 비범위다. 필요해 보이면 중단하고 재승인한다.
- Admin 파일은 수정하지 않는다.
- 기능·권한·403/409/cursor/authority-loss 계약을 약화하지 않는다. 시안에 없는 보류·필터는 기본 접힘이다.
- 아바타는 `front/shared/ui/book-club-avatar.ts` catalog와 `AvatarChip`만 사용한다.
- 실제 회원·클럽·배포 데이터, secret, private domain, 로컬 절대 경로를 tracked artifact에 넣지 않는다.
- Frontend 명령은 `CI=true npx --yes corepack@0.35.0 pnpm --dir front ...` 로 실행한다.
- ADR-0053을 `Accepted`로 올리지 않는다. 사람 30초 gate는 `pending_external_human_evidence`로 남긴다.

---

## File Structure and Ownership

### New files

- `front/features/host/ui/approved-host-shell.tsx` — Host 승인 캡처용 셸. 목적지별로 `primaryItems`와 `HostPrimaryNavigation` current를 맞춘다.
- `front/features/host/ui/approved-host-shell.test.tsx` — 목적지별 선택된 탭/유틸리티 계약.
- `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md` — Host 11장 독립 시각 검토 snapshot.

### Existing files with scoped changes

- `front/tests/e2e/support/approved-mockup-contract.ts` — `skipMismatchRatioAssertion` 추가. 기본값은 `false`라 Admin CT 동작은 그대로다.
- `front/tests/unit/approved-mockup-contract.test.ts` — skip 플래그 unit.
- `front/features/host/model/host-operating-room-model.ts` — `HostNextActionView.ctaLabel` optional presentation field.
- `front/features/host/ui/operating-room/host-next-action.tsx` + `host-next-action.test.tsx` — 문단 `label`과 버튼 `ctaLabel` 분리.
- `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx` — `07`–`09`, `15`–`16` 첫 화면 RED와 캡처.
- `front/features/host/ui/operating-room/operating-room.css` — 표지·헤더 링크가 첫 화면에 보이도록 필요한 presentation만.
- `front/features/host/ui/shell/host-utility-actions.tsx` + test — `currentId`로 `초대와 설정` `aria-current`.
- `front/features/host/ui/approved-host-ledgers.fixtures.tsx` + `approved-host-ledgers.ct.tsx` — `10`–`14`, `17`을 실제 페이지+목적지 셸로 조합.
- `front/features/host/ui/members/host-people-page.tsx`, `member-list.tsx`, `member-pending-zone.tsx` — 찾기·대기 구역이 첫 화면에 보이게 조합.
- `front/features/host/ui/host-session-ledger.tsx`, `settings/host-settings-page.tsx`, `settings/host-invitation-links.tsx`, `schedule-review/*`, `person/host-person-detail.tsx` — 시안 첫 화면 블록을 기존 컴포넌트로 살린다.
- `front/shared/ui/app-club-shell.story.tsx` — `AppClubShellHostStory`가 `approved-host-shell`을 쓰거나 동일 destination API를 받는다.
- Host E2E listed in Task 11 — 기존 클릭/403/409 기대 유지.
- `front/DESIGN.md`, `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`, `docs/development/host-redesign-mockups/README.md`, `CHANGELOG.md`, `docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md` — Host 시각 수락 문구. ADR 상태는 `Proposed`.

### Files that must not change

- `docs/development/host-redesign-mockups/07–17*.png`
- `design/mockups/2026-08-30-admin-operations-redesign/*`
- `front/features/platform-admin/**`
- `front/features/**/api`, `front/features/**/queries`
- server, BFF, migration, deploy files

---

### Task 1: Destination-aware Host approved shell and ratio-record capture

**Files:**
- Create: `front/features/host/ui/approved-host-shell.tsx`
- Create: `front/features/host/ui/approved-host-shell.test.tsx`
- Modify: `front/shared/ui/app-club-shell.story.tsx`
- Modify: `front/tests/e2e/support/approved-mockup-contract.ts`
- Modify: `front/tests/unit/approved-mockup-contract.test.ts`
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx` — `hostApprovedShell`이 destination을 받게 연결만. 본문 IA는 이후 task.

**Interfaces:**
- Produces: `export type HostApprovedDestination = "operating-room" | "meetings" | "people" | "records" | "settings" | "schedule-review" | "person-detail"`
- Produces: `export function HostApprovedShell(props: { destination: HostApprovedDestination; children: ReactNode }): JSX.Element`
- Produces: `ApprovedComparisonInput.skipMismatchRatioAssertion?: boolean` (default `false`)
- Consumes: `AppClubShell`, `HostPrimaryNavigation`, `HostUtilityActions`, `captureApprovedComparison`

- [ ] **Step 1: Write the failing destination and skip-ratio tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostApprovedShell } from "./approved-host-shell";

describe("HostApprovedShell", () => {
  it("marks people current and operating-room not current", () => {
    render(
      <HostApprovedShell destination="people">
        <main><h1>사람</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "사람" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "운영실" })).not.toHaveAttribute("aria-current");
  });

  it("marks 초대와 설정 current for settings destination", () => {
    render(
      <HostApprovedShell destination="settings">
        <main><h1>초대와 설정</h1></main>
      </HostApprovedShell>,
    );
    expect(screen.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "운영실" })).not.toHaveAttribute("aria-current");
  });
});
```

Add to `front/tests/unit/approved-mockup-contract.test.ts`:

```ts
it("does not throw above 0.02 when skipMismatchRatioAssertion is true", () => {
  expect(() => assertApprovedMismatchRatio({
    id: "host-prep-desktop",
    mismatchPixelRatio: 0.08,
    maxDiffPixelRatio: 0.02,
    skipMismatchRatioAssertion: true,
  })).not.toThrow();
});

it("still throws above 0.02 when skipMismatchRatioAssertion is omitted", () => {
  expect(() => assertApprovedMismatchRatio({
    id: "host-prep-desktop",
    mismatchPixelRatio: 0.08,
    maxDiffPixelRatio: 0.02,
  })).toThrow(/host-prep-desktop mismatch ratio 0.08 exceeds 0.02/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/approved-host-shell.test.tsx tests/unit/approved-mockup-contract.test.ts
```

Expected: FAIL — `HostApprovedShell` missing; `skipMismatchRatioAssertion` not in `assertApprovedMismatchRatio`.

- [ ] **Step 3: Implement the shell and skip flag**

`HostApprovedShell` must:

- Render `AppClubShell` `workspace="host"` with ReadMates brand, space switcher, account chip using a book-club artwork key (not a generated animal).
- Set `primaryItems[].current` and `HostPrimaryNavigation` `destinations[].current` from destination. `person-detail` uses `people`. `schedule-review` uses `operating-room`. `settings` uses all primary `current: false`.
- Put `HostUtilityActions` in utility slots. For `settings`, pass `currentId="settings"` and set `aria-current="page"` on that link. If `HostUtilityActions` has no `currentId` yet, add optional `currentId?: HostUtilityActionId` in this task and a focused test in `host-utility-actions.test.tsx`.
- Include desktop primary nav and mobile bottom nav so later mobile captures have 하단 내비.

`assertApprovedMismatchRatio` and `captureApprovedComparison`: when `skipMismatchRatioAssertion === true`, write artifacts and return the report without throwing. Default remains throw. Do not change Admin CT call sites.

Point `AppClubShellHostStory` at `HostApprovedShell` with default `destination="operating-room"` so existing story callers keep compiling.

Change `approved-host-ledgers.fixtures.tsx` `hostApprovedShell` to:

```tsx
function hostApprovedShell(destination: HostApprovedDestination, children: ReactNode) {
  return <HostApprovedShell destination={destination}>{children}</HostApprovedShell>;
}
```

Update each exported view to pass the matching destination (`meetings`, `people`, `records`, `settings`, `schedule-review`, `person-detail`). Do not restyle ledger bodies in this task.

- [ ] **Step 4: Run the tests and make sure they pass**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/approved-host-shell.test.tsx features/host/ui/shell/host-utility-actions.test.tsx tests/unit/approved-mockup-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-shell.tsx front/features/host/ui/approved-host-shell.test.tsx front/shared/ui/app-club-shell.story.tsx front/tests/e2e/support/approved-mockup-contract.ts front/tests/unit/approved-mockup-contract.test.ts front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/shell/host-utility-actions.tsx front/features/host/ui/shell/host-utility-actions.test.tsx
git commit -m "feat(front): give Host approved captures a destination-aware shell"
```

---

### Task 2: Prep desktop first-viewport (`host-prep-desktop`)

**Files:**
- Modify: `front/features/host/model/host-operating-room-model.ts`
- Modify: `front/features/host/ui/operating-room/host-next-action.tsx`
- Modify: `front/features/host/ui/operating-room/host-next-action.test.tsx`
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css` only if cover/header links are clipped
- Test: `front/features/host/ui/operating-room/host-next-action.test.tsx`

**Interfaces:**
- Consumes: `HostApprovedShell` from Task 1; `skipMismatchRatioAssertion` from Task 1
- Produces: `HostNextActionView.ctaLabel?: string`
- Produces: `HostNextAction` primary link accessible name = `ctaLabel ?? label`

- [ ] **Step 1: Write the failing CTA and prep first-viewport tests**

Add to `host-next-action.test.tsx`:

```ts
it("uses ctaLabel for the primary control and keeps label as the status sentence", () => {
  render(
    <HostNextAction
      action={{
        ...actionable,
        label: "최신 일정을 아직 보지 않은 4명이 있어요",
        ctaLabel: "대상과 문구 검토",
      }}
    />,
  );
  expect(screen.getByText("최신 일정을 아직 보지 않은 4명이 있어요")).toBeVisible();
  expect(screen.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
});
```

In `host-operating-room-responsive.ct.tsx`, before `captureHostApproved` in `prep locks the approved desktop operating room`, add:

```ts
await expect(component.getByRole("link", { name: "ReadMates" })).toBeVisible();
await expect(component.getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("link", { name: "모임 정보" })).toBeVisible();
await expect(component.getByRole("link", { name: "일정 편집" })).toBeVisible();
await expect(component.getByRole("link", { name: "변경 이력" })).toBeVisible();
await expect(component.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
await expect(component.getByRole("region", { name: "준비 현황" }).getByRole("link", { name: /보기/ }).first()).toBeVisible();
await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).toHaveCount(4);
await expect(component.getByRole("button", { name: /보류/ })).toHaveCount(0);
```

Change `captureHostApproved` for Host ids in this file to pass `skipMismatchRatioAssertion: true` and **omit** `allowFontRasterException` (do not turn the exception on).

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/operating-room/host-next-action.test.tsx
```

Expected: FAIL — `ctaLabel` is not on the type / primary name is still `label`.

- [ ] **Step 3: Implement CTA split and prep composition**

Add `ctaLabel?: string` to `HostNextActionView`. In `HostNextAction`, keep the paragraph as `action.label`. Primary control text and `aria-label` use `action.ctaLabel ?? action.label`. Defer stays `내일 09:00까지 보류` and remains in the component for later disclosure; the approved prep view must not pass `onDefer` (or wrap defer behind the existing `세부 조작` disclosure) so the default row shows 0 보류 buttons.

Update `prepApprovedView` nextAction:

```ts
label: "최신 일정을 아직 보지 않은 4명이 있어요",
ctaLabel: "대상과 문구 검토",
reason: "대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.",
```

Switch `approvedOperatingRoom` to wrap with `HostApprovedShell destination="operating-room"` instead of a one-off `AppClubShell` that can drift. Keep the same `HostOperatingRoomPage` props. Cover comes from `CurrentMeetingHeader`; if CSS hides it (`overflow: hidden`, `font-size: 0`, zero height), fix presentation CSS so the cover and header action links are visible. Do not paint titles with CSS `content`.

If model mappers construct `HostNextActionView`, leave runtime `ctaLabel` optional; production can keep using `label` as the button until a later copy pass. Approved fixtures must set `ctaLabel`.

- [ ] **Step 4: Run unit and prep CT**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/operating-room/host-next-action.test.tsx
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --project=chromium -g "prep locks the approved desktop"
```

Expected: unit PASS; CT first-viewport assertions PASS. Pixel ratio may exceed `0.02`; the test must not fail on ratio because `skipMismatchRatioAssertion` is true. If CT fails on missing copy/cover/links, fix composition, not the threshold.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/model/host-operating-room-model.ts front/features/host/ui/operating-room/host-next-action.tsx front/features/host/ui/operating-room/host-next-action.test.tsx front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/operating-room/operating-room.css
git commit -m "feat(front): lock Host prep desktop first-viewport to the approved mockup"
```

---

### Task 3: Live and closing desktop first-viewport (`host-live-desktop`, `host-closing-desktop`)

**Files:**
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css` only if live/closing first-viewport blocks are clipped
- Test: same CT file, tests `live locks the approved desktop operating room` and `closing locks the approved desktop operating room`

**Interfaces:**
- Consumes: `ctaLabel` from Task 2, `HostApprovedShell` from Task 1, `skipMismatchRatioAssertion` from Task 1
- Produces: live desktop uses mockup 08 ledger (`현장 현황`), not mockup 16 3-button board

- [ ] **Step 1: Write the failing live/closing first-viewport assertions**

In the live desktop CT, before capture:

```ts
await expect(component.getByRole("link", { name: "운영실" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("link", { name: "모임 정보" })).toBeVisible();
await expect(component.getByRole("link", { name: "출석 확인 시작" })).toBeVisible();
await expect(component.getByRole("link", { name: "모임 진행 보기" })).toBeVisible();
await expect(component.getByRole("region", { name: "현장 현황" })).toBeVisible();
await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByText("출석 미확인")).toBeVisible();
await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).not.toHaveCount(0);
```

In the closing desktop CT, before capture:

```ts
await expect(component.getByRole("link", { name: "기록 초안 검토" })).toBeVisible();
await expect(component.getByRole("region", { name: "마감 현황" }).getByRole("listitem")).toHaveCount(5);
await expect(component.getByRole("region", { name: "마감 현황" }).getByRole("link", { name: /보기|열기|확인|조건/ }).first()).toBeVisible();
await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByText("기록 초안 검토")).toBeVisible();
```

Keep desktop live content as `PhaseStatusLedger` (mockup 08). Do not mount the 3-button attendance board on desktop live.

- [ ] **Step 2: Run the CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --project=chromium -g "live locks the approved desktop|closing locks the approved desktop"
```

Expected: FAIL — primary links still use the long `label` sentence; closing/live workbox or header links missing.

- [ ] **Step 3: Implement live/closing fixture copy and visible header**

Update `liveApprovedView` / `closingApprovedView`:

```ts
// live
label: "아직 출석을 확인하지 않은 3명이 있어요",
ctaLabel: "출석 확인 시작",
// also render a secondary outline/text link "모임 진행 보기" in liveContent or next-action controls
// closing
label: "기록 초안을 검토하면 멤버에게 게시할 수 있어요",
ctaLabel: "기록 초안 검토",
```

If a second live CTA does not fit `HostNextAction`'s single primary link, add a visible `LinkComponent` in `approvedLiveContent` with name `모임 진행 보기` pointing at the agenda href already used by `liveStatusRows`. Do not add a server field.

Keep `liveWorkboxItems` / `closingWorkboxItems` populated. Do not pass `onDefer` on the approved workbox default rows.

- [ ] **Step 4: Re-run the CT**

Run the same playwright command as Step 2.

Expected: first-viewport assertions PASS. Ratio skip remains on. Do not enable `allowFontRasterException`.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/operating-room/operating-room.css front/features/host/ui/operating-room/host-next-action.tsx
git commit -m "feat(front): lock Host live and closing desktop first-viewport"
```

---

### Task 4: Operating-room mobile first-viewport (`host-prep-mobile`, `host-live-mobile`)

**Files:**
- Modify: `front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx`
- Modify: `front/features/host/ui/shell/host-shell.css` or `operating-room.css` only if cover/bottom nav/attendance board are not in the first viewport
- Test: existing mobile approved tests in the same CT file (add assertions if the tests already exist; if a test name differs, attach assertions to the tests that call `captureHostApproved` with `host-prep-mobile` and `host-live-mobile`)

**Interfaces:**
- Consumes: Task 1 shell (mobile bottom nav), Task 2 `ctaLabel`, Task 3 live/closing copy
- Produces: mobile live uses the 3-button attendance board (mockup 16). Desktop live stays mockup 08

- [ ] **Step 1: Write the failing mobile first-viewport assertions**

Prep mobile, 390×832 viewport:

```ts
await expect(component.getByRole("link", { name: "멤버 시야" })).toBeVisible();
await expect(component.getByRole("link", { name: "대상과 문구 검토" })).toBeVisible();
await expect(component.getByRole("navigation", { name: "호스트 주 메뉴 모바일" })).toBeVisible();
await expect(component.getByRole("region", { name: "준비 현황" }).getByRole("listitem")).toHaveCount(4);
await expect(component.getByRole("complementary", { name: "클럽 작업함" }).getByRole("listitem")).not.toHaveCount(0);
```

Live mobile:

```ts
await expect(component.getByRole("button", { name: /참석|출석/ }).first()).toBeVisible();
await expect(component.getByText(/8\s*\/\s*12|확인 필요 3|나머지 3명/)).toBeVisible();
await expect(component.getByRole("navigation", { name: "호스트 주 메뉴 모바일" })).toBeVisible();
await expect(component.getByRole("link", { name: "멤버 시야" })).toBeVisible();
```

Use the attendance board already defined as `approvedAttendanceBoard` **only** in the mobile live view. Do not add it to desktop live.

Align board counts with the mockup impression: 8/12, 확인 필요 3, 나머지 3명. Expand `liveAttendees` or summary copy until those strings are visible. Avatars must be catalog keys already in `liveAttendees`.

Capture both ids with `skipMismatchRatioAssertion: true` and without `allowFontRasterException`.

- [ ] **Step 2: Run the mobile CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --project=chromium -g "prep-mobile|live-mobile|mobile"
```

If grep matches extra tests, run the two tests that capture `host-prep-mobile` and `host-live-mobile` by their exact titles. Expected: FAIL on missing 멤버 시야, bottom nav, board counts, or populated workbox.

- [ ] **Step 3: Compose mobile views from the same production page**

Mount `HostApprovedShell destination="operating-room"` at `APPROVED_MOBILE_VIEWPORT`. Show cover + header actions + next action + numbered 01–04 status (prep) or attendance board (live) + workbox + mobile primary navigation. If mobile utility hides `멤버 시야` behind `⋯`, put a visible `멤버 시야` link in the operating-room header (`CurrentMeetingHeader` already has `memberViewHref`) so it is in the first viewport without deleting the utility menu.

- [ ] **Step 4: Re-run the mobile CT**

Expected: first-viewport assertions PASS. Ratio skip on. No font exception.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/operating-room/operating-room.css front/features/host/ui/shell/host-shell.css
git commit -m "feat(front): lock Host operating-room mobile first-viewport"
```

---

### Task 5: Meetings library first-viewport (`host-meetings-desktop`)

**Files:**
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.tsx` and `meeting-toc.css` only if 목록/달력 or chips are not first-viewport visible
- Test: `approved-host-ledgers.ct.tsx` meetings test

**Interfaces:**
- Consumes: `HostApprovedShell` `destination="meetings"`
- Produces: capture regions for header/nav/main (not `regions: []`)

- [ ] **Step 1: Write the failing meetings first-viewport assertions**

Replace the meetings test body assertions with:

```ts
const component = await mountApproved(mount, page, hostMeetingsApprovedView(), APPROVED_DESKTOP_VIEWPORT);
await expect(component.getByRole("link", { name: "일정과 모임" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("tab", { name: "목록" })).toBeVisible();
await expect(component.getByRole("tab", { name: "달력" })).toBeVisible();
await expect(component.getByRole("link", { name: "새 모임 만들기" })).toBeVisible();
await expect(component.getByRole("link", { name: "지구 끝의 온실", exact: true })).toBeVisible();
await expect(component.getByText("맡겨진 소녀")).toBeVisible();
```

If the approved PNG uses `맡겨진 소녀` in the past set, the fixture past rows must include that title (virtual data). Keep other rows fictional.

In `captureHostLedger`, set `skipMismatchRatioAssertion: true`, omit `allowFontRasterException`, and pass regions for nav and main from locators (4px major). Do not leave `regions: []`.

- [ ] **Step 2: Run the meetings CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "meetings library"
```

Expected: FAIL — `aria-current` still on 운영실 and/or past title mismatch and/or empty regions throw after you require regions.

- [ ] **Step 3: Compose the production meeting list inside the destination shell**

`hostMeetingsApprovedView` must render `HostApprovedShell destination="meetings"` around the production `HostMeetingList` with 목록/달력 tabs visible at default 목록. Do not replace the list with a heading-only stub. Update past-row titles to the mockup impression including `맡겨진 소녀`.

- [ ] **Step 4: Re-run the meetings CT**

Expected: first-viewport assertions PASS. Regions recorded.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/meeting-list/host-meeting-list.tsx front/features/host/ui/meeting-list/meeting-toc.css
git commit -m "feat(front): lock Host meetings first-viewport to the approved mockup"
```

---

### Task 6: People ledger first-viewport (`host-people-desktop`)

**Files:**
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/members/host-people-page.tsx` and related member UI only if search/pending zone are missing from the page the fixture mounts
- Test: `approved-host-ledgers.ct.tsx` people test

**Interfaces:**
- Consumes: `HostApprovedShell` `destination="people"`
- Produces: visible `이름으로 찾기`, `가입 승인 대기`, named ledger columns, `가입 승인 검토`

- [ ] **Step 1: Write the failing people first-viewport assertions**

```ts
await expect(component.getByRole("link", { name: "사람" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("searchbox", { name: /이름/ })).toBeVisible();
await expect(component.getByRole("region", { name: "가입 승인 대기" })).toBeVisible();
await expect(component.getByText(/가입 승인 대기\s+\d+명/)).toBeVisible();
await expect(component.getByRole("button", { name: /가입 승인 검토|승인/ }).first()).toBeVisible();
```

If the production search is not `role=searchbox`, assert the visible label `이름으로 찾기` instead, then keep that accessible name in the implementation.

Capture with regions (nav + main) and `skipMismatchRatioAssertion: true`.

- [ ] **Step 2: Run the people CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "people ledger"
```

Expected: FAIL — operating-room still current and/or pending zone not in the fixture tree.

- [ ] **Step 3: Mount the production people page with pending members**

`hostPeopleApprovedView` must use `HostApprovedShell destination="people"` and the production `HostPeoplePage` + `MemberList` + `MemberPendingZone`. Put at least two `VIEWER` rows through `MemberPendingZone` so `가입 승인 대기` is non-empty. Add the existing search field from member list chrome; do not invent a new API.

- [ ] **Step 4: Re-run the people CT**

Expected: first-viewport assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/members/host-people-page.tsx front/features/host/ui/members/member-list.tsx front/features/host/ui/members/member-pending-zone.tsx
git commit -m "feat(front): lock Host people first-viewport to the approved mockup"
```

---

### Task 7: Records and settings first-viewport (`host-records-desktop`, `host-settings-desktop`)

**Files:**
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/host-session-ledger.tsx` and `settings/host-invitation-links.tsx` / `settings/host-settings-page.tsx` only as needed for first-viewport blocks
- Test: records and settings tests in `approved-host-ledgers.ct.tsx`

**Interfaces:**
- Consumes: `HostApprovedShell` destinations `records` and `settings`
- Produces: records shows next-action card + ledger + `마감실 열기`; settings shows `새 초대 링크` + status table + club settings rows

- [ ] **Step 1: Write the failing records and settings assertions**

Records:

```ts
await expect(component.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("link", { name: /마감실 열기/ })).toBeVisible();
await expect(component.getByRole("row", { name: /단 한 사람/ })).toBeVisible();
```

Do not accept a 2-row “기록 장부 요약” stub as a substitute for the production `HostSessionLedger` used on the records route.

Settings:

```ts
await expect(component.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
await expect(component.getByRole("button", { name: "새 초대 링크" })).toBeVisible();
await expect(component.getByRole("heading", { name: "초대 링크" })).toBeVisible();
await expect(component.getByText(/활성|만료 예정|중지/)).toBeVisible();
```

Both captures: regions filled, `skipMismatchRatioAssertion: true`, no font exception.

- [ ] **Step 2: Run the two CT tests to verify they fail**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "records ledger|invites and settings"
```

Expected: FAIL on current tab/utility and/or missing 마감실 열기 / 새 초대 링크 table.

- [ ] **Step 3: Use production records and settings pages**

Records fixture: shell `records` + production ledger with a next-action/attention row whose visible action is `마감실 열기` (link href to the closing operating-room of that session). Do not hand-build a different heading tree that the records route does not use.

Settings fixture: shell `settings` + `HostSettingsPage` wrapping production `HostInvitationLinks` and `HostClubSettings`. Default view shows the link table, not an open create form covering the first viewport. `새 초대 링크` remains a button that opens create UI after click.

- [ ] **Step 4: Re-run the two CT tests**

Expected: first-viewport assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/host-session-ledger.tsx front/features/host/ui/settings/host-settings-page.tsx front/features/host/ui/settings/host-invitation-links.tsx
git commit -m "feat(front): lock Host records and settings first-viewport"
```

---

### Task 8: Schedule review first-viewport (`host-schedule-review-desktop`)

**Files:**
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/schedule-review/*` and `front/features/host/ui/notifications/manual-notification-preview.tsx` only if the two-column layout is broken
- Test: unread schedule review CT

**Interfaces:**
- Consumes: `HostApprovedShell` `destination="schedule-review"`
- Produces: two-column 대상·문구 layout and button `4명에게 안내 보내기`

- [ ] **Step 1: Write the failing schedule-review assertions**

```ts
await expect(component.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
await expect(component.getByText("미열람 4명").first()).toBeVisible();
await expect(component.getByRole("button", { name: "4명에게 안내 보내기" })).toBeVisible();
const fields = component.locator("input, textarea, [role='checkbox']");
expect(await fields.count()).toBeGreaterThan(3);
```

After mount, assert the preview confirmation is a two-column layout: bounding boxes of the recipient list and the message composer must not overlap (use `boundingBox()`; fail if one box intersects the other).

Capture with regions and `skipMismatchRatioAssertion: true`.

- [ ] **Step 2: Run the schedule-review CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "unread schedule review"
```

Expected: FAIL on overlapping columns or missing send button.

- [ ] **Step 3: Compose the production preview confirmation**

Use `HostScheduleReviewHeader` + `ManualNotificationPreviewConfirmation` (or the production schedule-review page tree the route renders). CSS must keep two columns at 1536px. Do not leave a single mashed column. Recipients fixture stays 4 unread fictional members.

- [ ] **Step 4: Re-run the CT**

Expected: first-viewport assertions PASS, columns do not overlap.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/schedule-review front/features/host/ui/notifications/manual-notification-preview.tsx
git commit -m "feat(front): lock Host schedule-review first-viewport"
```

---

### Task 9: Person mobile first-viewport (`host-person-mobile`)

**Files:**
- Modify: `front/features/host/ui/approved-host-ledgers.fixtures.tsx`
- Modify: `front/features/host/ui/approved-host-ledgers.ct.tsx`
- Modify: `front/features/host/ui/person/host-person-detail.tsx` and `host-person-detail.css` only if FOLIO/01–04 blocks are missing
- Test: person detail mobile CT

**Interfaces:**
- Consumes: `HostApprovedShell` `destination="person-detail"` (people current)
- Produces: `← 사람` (or visible 사람 목록으로), FOLIO/tenure, 01–04 현재 일정 / 참석 응답 / 실제 출석 / 멤버십. Member `내 클럽` shell is forbidden

- [ ] **Step 1: Write the failing person-mobile assertions**

```ts
await expect(component.getByRole("link", { name: /사람/ })).toBeVisible();
await expect(component.getByRole("link", { name: "내 클럽" })).toHaveCount(0);
await expect(component.getByText(/No\.\s*\d+|FOLIO|회차/)).toBeVisible();
await expect(component.getByText("현재 일정")).toBeVisible();
await expect(component.getByText("참석 응답")).toBeVisible();
await expect(component.getByText("실제 출석")).toBeVisible();
await expect(component.getByText("멤버십")).toBeVisible();
```

If production copy uses `사람 목록으로` instead of `← 사람`, keep that accessible name and add a visible back control; do not switch the page into the member `내 클럽` chrome.

Capture with regions and `skipMismatchRatioAssertion: true`.

- [ ] **Step 2: Run the person CT to verify it fails**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "person detail"
```

Expected: FAIL on member shell and/or missing 01–04 sections.

- [ ] **Step 3: Mount production `HostPersonDetail` in the Host people destination shell**

Use catalog artwork for the person avatar. Structure the first viewport as four labeled blocks matching the mockup order. Do not lead with a `현재 상태` definition list that replaces those blocks.

- [ ] **Step 4: Re-run the CT**

Expected: first-viewport assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/approved-host-ledgers.fixtures.tsx front/features/host/ui/approved-host-ledgers.ct.tsx front/features/host/ui/person/host-person-detail.tsx front/features/host/ui/person/host-person-detail.css
git commit -m "feat(front): lock Host person-mobile first-viewport"
```

---

### Task 10: Independent visual review of Host 11 ids

**Files:**
- Create: `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md`
- Modify: Host CT capture call sites only after review, to set `allowFontRasterException: true` **per id that passed IA**
- Modify: `skipMismatchRatioAssertion` — leave `true` for ids that fail IA; for IA-pass ids set `skipMismatchRatioAssertion: false` and `allowFontRasterException: true` (desktop ceiling `0.10`, mobile `0.15`)

**Interfaces:**
- Consumes: `test:ct:approved` artifacts under Playwright output `approved-mockup/<id>-{reference,candidate,overlay,diff,report.json}`
- Produces: per-id verdict `PASS-with-font-raster` | `FAIL` with reason; overall Host slice FAIL unless 11/11 first-viewport match

- [ ] **Step 1: Generate Host comparison artifacts**

Run:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:approved
```

Do not treat this command as visual PASS. Confirm 11 Host `*-report.json` files exist and `referenceSha256` matches the manifest.

- [ ] **Step 2: Independent review (reviewer did not implement Tasks 2–9)**

For every Host id, open reference, candidate, 50% overlay, diff, and JSON regions. Fail the id if first-viewport IA/copy/order/disclosure differs from the PNG. Glyph halo after matching IA is `PASS-with-font-raster`. Empty `regions` is FAIL. Write the table into `docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md` with the same honesty rules as `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md`.

- [ ] **Step 3: If any id FAILs, stop and return to that id's task**

Do not enable font exception on a FAIL id. Do not raise `maxDiffPixelRatio`. Do not rewrite the PNG. Do not claim Host slice complete.

- [ ] **Step 4: Enable font exception only on IA-pass ids**

For each `PASS-with-font-raster` id, set `allowFontRasterException: true` and `skipMismatchRatioAssertion: false` at that capture call. Host mobile ids use `HOST_MOBILE_FONT_RASTER_EXCEPTION_MAX_RATIO`. Re-run `test:ct:approved`. Pixel ratio above `0.02` is allowed only under the reviewed exception. Ratios still go in the report.

- [ ] **Step 5: Commit**

```bash
git add docs/reports/2026-09-02-host-approved-first-viewport-acceptance.md front/features/host/ui/operating-room/host-operating-room-responsive.ct.tsx front/features/host/ui/approved-host-ledgers.ct.tsx
git commit -m "test(front): record Host first-viewport independent visual review"
```

---

### Task 11: Functional non-regression, docs, ADR-0053 verification note

**Files:**
- Modify: `CHANGELOG.md` Unreleased
- Modify: `front/DESIGN.md`
- Modify: `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`
- Modify: `docs/development/host-redesign-mockups/README.md`
- Modify: `docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md` 검증 칸 only; 상태 stays `Proposed`
- Modify: ADR `관련` line to also cite `docs/superpowers/specs/2026-09-02-host-approved-first-viewport-design.md`
- Test: existing Host E2E below; do not weaken assertions

**Interfaces:**
- Consumes: Task 10 report
- Produces: honest Host-slice closeout. ADR-0053 remains `Proposed`

- [ ] **Step 1: Run functional gates**

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front lint
CI=true npx --yes corepack@0.35.0 pnpm --dir front test
CI=true npx --yes corepack@0.35.0 pnpm --dir front build
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/host-lifecycle-route-continuity.spec.ts tests/e2e/host-authority-loss.spec.ts tests/e2e/host-workbox-stage4.spec.ts --project=chromium
```

Expected: lint 0 errors; unit/build pass; E2E keep 403/409/continuity clicks. If an E2E fails because a visible name changed to mockup copy, update the test to the new visible name without dropping recovery coverage. If `test:ct` SIGKILL, record skipped and do not call it PASS.

- [ ] **Step 2: Update CHANGELOG Unreleased Highlights**

Replace the existing pixel-fidelity highlight sentence with an honest Host-slice note. Do not claim pixel-identical or ADR-0053 Accepted. Example:

```md
- Host 승인 시안 07–17의 첫 화면 구성(선택 탭, 표지, 주 행동, 원장·작업함)을 실제 Host 페이지로 맞췄습니다. 픽셀 비율 0.02와 ADR-0053 Accept, 사람 30초 gate는 남아 있습니다.
```

- [ ] **Step 3: Update Host active design and ADR-0053 verification**

In ADR-0053 검증, keep `Proposed`. Add one factual paragraph:

```md
Host 슬라이스(`docs/superpowers/specs/2026-09-02-host-approved-first-viewport-design.md`)의 합격은 11장 독립 시각 검토의 첫 화면 구성이다. `maxDiffPixelRatio` 0.02는 측정값으로 유지한다. Admin 잔여 FAIL과 사람 30초 gate가 비어 있으므로 Accepted로 올리지 않는다.
```

Do not rewrite the 결정 section. `front/DESIGN.md` and the 2026-08-29 Host design doc must say Host first-viewport independent review status from the Task 10 report, not “픽셀 수락 완료”.

- [ ] **Step 4: Confirm ADR status is still Proposed**

`docs/development/adr/README.md` and `docs/development/technical-decisions.md` stay `Proposed` for 0053. Do not flip them.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md front/DESIGN.md docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md docs/development/host-redesign-mockups/README.md docs/development/adr/0053-approved-mockup-pixel-fidelity-gate.md
git commit -m "docs(front): record Host first-viewport visual acceptance without accepting ADR-0053"
```

---

## Self-review

Spec coverage:

| Spec section | Task |
| --- | --- |
| Destination-aware real pages, no stub trees | 1, 5–9 |
| Prep/live/closing desktop first-viewport | 2, 3 |
| Mobile prep/live and person | 4, 9 |
| Meetings/people/records/settings/schedule | 5–8 |
| No API, no Admin, no PNG-as-UI | Global + file denylist |
| Skip ratio until IA review; font exception after | 1, 10 |
| Independent review report | 10 |
| E2E + docs + ADR Proposed | 11 |
| Human 30s pending; no Accept 0053 | 10–11 |

No TBD placeholders. `ctaLabel`, `HostApprovedDestination`, `skipMismatchRatioAssertion`, and `HostApprovedShell` names are defined in Task 1–2 and reused later.
