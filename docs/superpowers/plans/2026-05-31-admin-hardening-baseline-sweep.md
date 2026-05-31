# Admin 하드닝 베이스라인 스윕 (H 슬라이스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 shipped된 admin 전 라우트(+host dashboard)에 접근성·empty/에러·일관성 베이스라인을 일관 적용하고, 그 기준을 후속 슬라이스(A/M/P)가 재사용할 문서화된 체크리스트 + 자동 가드레일로 고정한다.

**Architecture:** 신규 a11y 의존성(axe 등)을 추가하지 않는다. 프로젝트의 기존 testing-library 역할/랜드마크/이름 기반 검증 컨벤션을 따른다. 의존성 없는 공유 헬퍼(`findUnnamedInteractiveElements`)로 "이름 없는 상호작용 요소" 회귀를 막고, 각 라우트의 기존 테스트 파일에 a11y 어서션을 co-locate로 추가한다. 색 대비·모바일 레이아웃처럼 단위 테스트로 검증 불가한 항목은 문서화된 수동 게이트로 둔다.

**Tech Stack:** React + Vite, TanStack Query, react-router-dom, Vitest + @testing-library/react, react-router `MemoryRouter`.

**Scope note:** 이 plan은 엄브렐러(`docs/superpowers/specs/2026-05-31-post-admin-vnext-enhancement-umbrella-design.md`)의 **H 슬라이스 한정**이다. A/M/P는 H 완료 후 자기 plan을 따로 갖는다.

---

## File Structure

생성:

- `docs/development/admin-hardening-baseline.md` — 베이스라인 체크리스트(게이트 SSOT 산출물).
- `front/shared/testing/accessibility-checks.ts` — 의존성 없는 a11y 가드 헬퍼.
- `front/shared/testing/accessibility-checks.test.ts` — 헬퍼 단위 테스트.

수정:

- `front/features/platform-admin/route/admin-shell-layout.tsx` — skip-link + 랜드마크 라벨 보강.
- `front/features/platform-admin/route/admin-shell-layout.test.tsx` — 랜드마크/skip-link 어서션.
- 각 admin 라우트의 **기존** 테스트 파일(아래 Task 5~13)에 a11y 어서션 추가.
- `front/features/host/ui/host-dashboard.tsx` 의 테스트(없으면 신규 co-located 테스트 생성).

---

## Task 1: 베이스라인 체크리스트 문서

**Files:**
- Create: `docs/development/admin-hardening-baseline.md`

- [ ] **Step 1: 체크리스트 문서 작성**

아래 내용을 그대로 생성한다.

````markdown
# Admin 하드닝 베이스라인 체크리스트

이 문서는 Post–Admin vNext 고도화 엄브렐러의 H 슬라이스 산출물이며,
A/M/P 슬라이스의 공통 게이트로 재사용된다.

각 admin 라우트(+host dashboard)는 아래를 만족해야 한다.

## 1. 접근성 (자동 검증 가능)
- [ ] 라우트 본문에 heading이 1개 이상 존재한다 (`getAllByRole("heading")`).
- [ ] 모든 상호작용 요소(`button`, `a[href]`, `[role=button]`, `[role=link]`)가
      접근 가능한 이름(가시 텍스트 / `aria-label` / `aria-labelledby` / `title`)을 가진다.
      → `findUnnamedInteractiveElements(container)` 가 빈 배열.
- [ ] error/empty 상태가 `role="status"` 또는 `role="alert"` 영역으로 노출된다.

## 2. 접근성 (수동 검증)
- [ ] 키보드 Tab 순서가 시각 순서와 일치하고, 포커스 링이 보인다.
- [ ] admin shell 진입 시 본문으로 건너뛰는 skip-link가 동작한다.
- [ ] 텍스트/배경 색 대비가 WCAG AA(본문 4.5:1, 큰 텍스트 3:1)를 만족한다.

## 3. 모바일 (수동 검증)
- [ ] 360px 폭에서 nav·테이블·카드가 가로 스크롤 없이 사용 가능하다.
- [ ] 터치 타깃이 충분한 크기를 가진다.

## 4. Empty / 에러 카피 안전성
- [ ] 데이터가 얇을 때 정직한 empty state를 보여준다(가짜 데이터 금지).
- [ ] 실패 카피가 provider raw error / private data / token-shaped 예시를 노출하지 않는다.

## 5. 일관성
- [ ] 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치한다.

## 적용 대상 라우트
today · health · clubs · clubs/:clubId · notifications · ai-ops · support · audit · analytics · (host dashboard)
````

- [ ] **Step 2: 커밋**

```bash
git add docs/development/admin-hardening-baseline.md
git commit -m "docs: add admin hardening baseline checklist (H slice gate)"
```

---

## Task 2: 공유 a11y 가드 헬퍼

**Files:**
- Create: `front/shared/testing/accessibility-checks.ts`
- Test: `front/shared/testing/accessibility-checks.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/shared/testing/accessibility-checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findUnnamedInteractiveElements } from "./accessibility-checks";

function makeContainer(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("findUnnamedInteractiveElements", () => {
  it("returns elements that have no accessible name", () => {
    const container = makeContainer(`
      <button>저장</button>
      <button class="icon-only"></button>
      <a href="/x">링크</a>
      <a href="/y" class="icon-only"></a>
    `);
    const unnamed = findUnnamedInteractiveElements(container);
    expect(unnamed).toHaveLength(2);
    expect(unnamed.every((el) => el.classList.contains("icon-only"))).toBe(true);
  });

  it("treats aria-label, aria-labelledby, and title as accessible names", () => {
    const container = makeContainer(`
      <button aria-label="닫기"></button>
      <button title="메뉴"></button>
      <span id="lbl">재시도</span>
      <button aria-labelledby="lbl"></button>
    `);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("returns an empty array when there are no interactive elements", () => {
    expect(findUnnamedInteractiveElements(makeContainer(`<p>본문</p>`))).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --dir front exec vitest run shared/testing/accessibility-checks.test.ts`
Expected: FAIL — `findUnnamedInteractiveElements` is not defined / module not found.

- [ ] **Step 3: 최소 구현 작성**

`front/shared/testing/accessibility-checks.ts`:

```ts
const INTERACTIVE_SELECTOR = "button, a[href], [role='button'], [role='link']";

export function findUnnamedInteractiveElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
  );
  return elements.filter((el) => {
    const text = (el.textContent ?? "").trim();
    const ariaLabel = el.getAttribute("aria-label")?.trim();
    const labelledBy = el.getAttribute("aria-labelledby")?.trim();
    const title = el.getAttribute("title")?.trim();
    return !text && !ariaLabel && !labelledBy && !title;
  });
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `pnpm --dir front exec vitest run shared/testing/accessibility-checks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add front/shared/testing/accessibility-checks.ts front/shared/testing/accessibility-checks.test.ts
git commit -m "test: add dependency-free unnamed-interactive-element a11y guard"
```

---

## Task 3: Admin shell 랜드마크 + skip-link 보강

**Files:**
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Test: `front/features/platform-admin/route/admin-shell-layout.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`admin-shell-layout.test.tsx` 의 `describe` 블록 안에 아래 테스트를 추가한다(파일의 기존 render 헬퍼를 재사용; 없으면 기존 테스트가 쓰는 렌더 방식을 그대로 사용).

```ts
it("exposes navigation and main landmarks with a skip link to main content", () => {
  const { container } = renderShell(); // 파일의 기존 렌더 헬퍼명 사용
  expect(screen.getByRole("navigation", { name: "Admin 콘솔" })).toBeInTheDocument();
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("id", "admin-main");
  const skipLink = screen.getByRole("link", { name: "본문으로 건너뛰기" });
  expect(skipLink).toHaveAttribute("href", "#admin-main");
  expect(findUnnamedInteractiveElements(container)).toEqual([]);
});
```

파일 상단 import에 추가:

```ts
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx`
Expected: FAIL — skip link / main id / nav accessible name not found.

- [ ] **Step 3: shell 구현 수정**

`admin-shell-layout.tsx` 의 `AdminShellLayoutInner` return을 아래처럼 보강한다(skip-link, main id, nav aria-label 추가). 변경 부분만 표시:

```tsx
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="admin-shell__skip-link">
        본문으로 건너뛰기
      </a>
      <header className="admin-shell__header">
        {/* ...기존 header 내용 그대로... */}
      </header>
      <AdminStatusStrip metrics={stripMetrics} error={stripError} />
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <nav aria-label="Admin 콘솔">
            <AdminLayoutNav role={role} />
          </nav>
        </aside>
        <main id="admin-main" className="admin-shell__main">
          <Outlet />
        </main>
      </div>
      {/* ...onboarding modal 그대로... */}
    </div>
  );
```

주의: `AdminLayoutNav` 가 이미 내부에서 `<nav>` 를 렌더한다면 위에서 `<nav>` 를 중첩하지 말고 `AdminLayoutNav` 에 `aria-label="Admin 콘솔"` 을 전달하도록 해당 컴포넌트를 수정한다(랜드마크 중복 금지). 먼저 `admin-layout-nav.tsx` 를 열어 `<nav>` 존재 여부를 확인한 뒤 한쪽만 `<nav>` 를 갖게 한다.

- [ ] **Step 4: skip-link 스타일 추가**

skip-link는 평소 숨기고 포커스 시 노출한다. admin shell 스타일 파일(`admin-shell` 클래스가 정의된 CSS; `grep -rl "admin-shell__main" front/**/*.css` 로 위치 확인)에 추가:

```css
.admin-shell__skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 1000;
}
.admin-shell__skip-link:focus {
  left: 0;
  padding: 0.5rem 1rem;
  background: var(--surface, #fff);
  outline: 2px solid var(--focus, #2563eb);
}
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/ui/admin-layout-nav.tsx
git commit -m "feat: add admin shell skip-link and labeled nav/main landmarks"
```

---

## Per-route a11y 어서션 (Task 4 패턴)

Task 5~13은 모두 **동일한 패턴**을 각 라우트의 **기존 테스트 파일**에 적용한다. 각 Task는 자기 파일 경로만 다르다. 아래 Task 4가 그 패턴을 analytics 라우트에 완전한 형태로 보여주는 reference 구현이다. Task 5~13은 같은 코드를 자기 라우트 테스트 파일에 추가하되, 그 파일의 **기존 render 헬퍼**(예: `renderRoute()`)를 재사용한다.

---

## Task 4: analytics 라우트 a11y 어서션 (reference)

**Files:**
- Test: `front/features/platform-admin/route/admin-analytics-route.test.tsx`

- [ ] **Step 1: 실패할 수 있는 어서션 추가**

파일 상단 import에 추가:

```ts
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
```

`describe("AdminAnalyticsRoute", ...)` 안에 추가(파일의 기존 `renderRoute` 헬퍼 재사용):

```ts
it("renders a heading and no unnamed interactive controls", () => {
  const { container } = renderRoute();
  expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  expect(findUnnamedInteractiveElements(container)).toEqual([]);
});
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-analytics-route.test.tsx`
Expected: PASS이면 이 라우트는 이미 베이스라인 통과 → Step 4로. FAIL이면(이름 없는 버튼/링크 발견) Step 3.

- [ ] **Step 3: 위반 수정 (FAIL인 경우만)**

실패 출력의 요소를 라우트 UI에서 찾아 접근 가능한 이름을 부여한다. 아이콘 전용 컨트롤이면 `aria-label`(한글, 동작 기준: 예 `aria-label="필터 초기화"`)을 추가한다. 텍스트가 시각적으로만 숨겨진 경우 가시 텍스트 또는 `aria-label`을 추가한다. 수정 후 Step 2 재실행하여 PASS 확인.

- [ ] **Step 4: 체크리스트 수동 항목 확인**

`docs/development/admin-hardening-baseline.md` 의 수동 항목(키보드 순서·skip-link·색 대비·모바일 360px·empty/에러 카피 안전성)을 이 라우트에서 점검한다. 위반 발견 시 해당 UI를 수정하고 위 자동 테스트를 다시 실행한다.

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/route/admin-analytics-route.test.tsx
# 라우트 UI 수정이 있었다면 해당 파일도 add
git commit -m "test: assert analytics route a11y baseline (heading + named controls)"
```

---

## Task 5: today 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-today-route.test.tsx`

- [ ] **Step 1: 어서션 추가** — Task 4 Step 1의 코드 블록을 이 파일에 추가한다. import 추가:

```ts
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
```

`describe` 안에(파일의 기존 render 헬퍼 재사용):

```ts
it("renders a heading and no unnamed interactive controls", () => {
  const { container } = renderRoute();
  expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  expect(findUnnamedInteractiveElements(container)).toEqual([]);
});
```

- [ ] **Step 2: 실행** — `pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx` → PASS면 Step 4, FAIL이면 Step 3.
- [ ] **Step 3: 위반 수정** — 아래 "공통 per-route 절차" (c)(이름 없는 컨트롤에 한글 `aria-label` 부여), 재실행 PASS.
- [ ] **Step 4: 수동 체크리스트** — "공통 per-route 절차" (d).
- [ ] **Step 5: 커밋** — `git commit -m "test: assert today route a11y baseline"`

---

## 공통 per-route 절차 (Task 6~12에 그대로 적용)

각 Task는 대상 테스트 파일만 다르다. 모든 Task가 아래 4단계를 자기 파일에 적용한다.

**(a) import 추가** (파일 상단):

```ts
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
```

**(b) 어서션 추가** (파일의 기존 `describe` 안, 그 파일의 기존 render 헬퍼 재사용 — 예: `renderRoute()`):

```ts
it("renders a heading and no unnamed interactive controls", () => {
  const { container } = renderRoute();
  expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  expect(findUnnamedInteractiveElements(container)).toEqual([]);
});
```

**(c) 실행 → FAIL이면 위반 수정:** 실패 출력의 요소를 라우트 UI에서 찾아 접근 가능한 이름을 부여한다. 아이콘 전용 컨트롤이면 동작 기준의 한글 `aria-label`(예: `aria-label="필터 초기화"`)을 추가한다. 재실행하여 PASS 확인.

**(d) 수동 체크리스트:** `docs/development/admin-hardening-baseline.md` 의 수동 항목(키보드 순서·skip-link·색 대비·모바일 360px·empty/에러 카피 안전성)을 이 라우트에서 점검하고, 위반 시 UI 수정 후 (c) 재실행.

---

## Task 6: health 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-health-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 를 이 파일에 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-health-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c) 로 수정 후 재실행 PASS.
- [ ] **Step 4:** 공통 절차 (d) 수동 체크리스트.
- [ ] **Step 5:** `git add` 후 `git commit -m "test: assert health route a11y baseline"` (UI 수정 시 해당 파일도 add).

---

## Task 7: clubs 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-clubs-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-clubs-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert clubs route a11y baseline"`.

---

## Task 8: clubs/:clubId 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert club detail route a11y baseline"`.

---

## Task 9: notifications 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-notifications-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-notifications-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert notifications route a11y baseline"`.

---

## Task 10: ai-ops 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert ai-ops route a11y baseline"`.

---

## Task 11: support 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-support-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert support route a11y baseline"`.

---

## Task 12: audit 라우트 a11y 어서션

**Files:**
- Test: `front/features/platform-admin/route/admin-audit-route.test.tsx`

- [ ] **Step 1:** 공통 절차 (a)+(b) 적용.
- [ ] **Step 2:** `pnpm --dir front exec vitest run features/platform-admin/route/admin-audit-route.test.tsx` → PASS면 Step 4.
- [ ] **Step 3:** FAIL이면 공통 절차 (c).
- [ ] **Step 4:** 공통 절차 (d).
- [ ] **Step 5:** `git commit -m "test: assert audit route a11y baseline"`.

---

## Task 13: host dashboard a11y 어서션

**Files:**
- Source: `front/features/host/ui/host-dashboard.tsx`
- Test: `front/features/host/ui/host-dashboard.test.tsx` (없으면 신규 생성)

- [ ] **Step 1: 기존 테스트 확인**

Run: `ls front/features/host/ui/host-dashboard.test.tsx`
- 존재하면: Task 5 Step 1 코드 블록을 그 파일에 추가하고 그 파일의 기존 render 헬퍼를 재사용한다.
- 없으면: Step 2로.

- [ ] **Step 2: 신규 co-located 테스트 작성 (없을 때만)**

`host-dashboard.tsx` 의 export/props를 먼저 읽고, props가 순수 데이터면 직접 props로, Query 의존이면 analytics 테스트 패턴(QueryClientProvider + MemoryRouter)으로 렌더한다. 예시 골격:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { HostDashboard } from "./host-dashboard"; // 실제 export명 확인 후 맞춤

describe("HostDashboard a11y baseline", () => {
  it("renders a heading and no unnamed interactive controls", () => {
    const { container } = render(
      <MemoryRouter>
        {/* host-dashboard.tsx 의 실제 필수 props를 채운다 */}
        <HostDashboard /* ...props... */ />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });
});
```

- [ ] **Step 3: 실행** — `pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx`.
- [ ] **Step 4: 위반 수정** — "공통 per-route 절차" (c).
- [ ] **Step 5: 수동 체크리스트** — "공통 per-route 절차" (d)(특히 모바일 360px — host dashboard는 멤버/호스트가 모바일에서 자주 본다).
- [ ] **Step 6: 커밋** — `git commit -m "test: assert host dashboard a11y baseline"`

---

## Task 14: 전체 게이트 실행 + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 전체 프론트 게이트 실행**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```
Expected: 셋 다 PASS. 실패 시 해당 Task로 돌아가 수정.

- [ ] **Step 2: route/full-flow 변경이 있으므로 e2e 실행**

```bash
pnpm --dir front test:e2e
```
Expected: PASS. (shell skip-link/landmark 변경이 기존 e2e를 깨지 않는지 확인.)

- [ ] **Step 3: CHANGELOG Unreleased 갱신**

`CHANGELOG.md` 의 `## Unreleased` → `### Engineering` 아래에 추가:

```markdown
- **platform-admin/a11y:** admin 전 라우트와 host dashboard에 하드닝 베이스라인을 적용했습니다. admin shell에 skip-link와 라벨된 nav/main 랜드마크를 추가하고, 이름 없는 상호작용 요소를 막는 의존성 없는 테스트 가드(`findUnnamedInteractiveElements`)와 각 라우트 a11y 어서션을 도입했습니다. 색 대비·키보드 순서·모바일 360px는 `docs/development/admin-hardening-baseline.md` 의 수동 게이트로 문서화했습니다.
```

- [ ] **Step 4: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin hardening baseline sweep in changelog"
```

---

## Self-Review 메모

- **Spec 커버리지(H 슬라이스):** 접근성(자동/수동), empty/에러 카피, 모바일, 일관성, "문서화된 체크리스트 = 게이트" 산출물 모두 Task 1~14에 매핑됨. 일관성·색대비·모바일은 단위 테스트 불가 → 체크리스트 수동 게이트로 정직하게 분류.
- **신규 의존성 없음:** axe 미도입, 기존 testing-library 컨벤션 준수.
- **타입 일관성:** `findUnnamedInteractiveElements(container: HTMLElement): HTMLElement[]` 시그니처를 Task 2에서 정의하고 Task 3~13에서 동일하게 사용.
- **실행 중 확인 필요(실측 의존, plan에서 단정 불가):** 각 라우트 테스트 파일의 기존 render 헬퍼명, `AdminLayoutNav` 의 `<nav>` 중첩 여부, host-dashboard export/props, admin-shell CSS 파일 경로. 각 Task에 "먼저 확인" 지시를 명시함.
