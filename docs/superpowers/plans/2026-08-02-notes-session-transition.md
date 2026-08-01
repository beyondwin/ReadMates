# ReadMates 클럽 노트 세션 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클럽 노트의 세션 선택을 콘텐츠 범위의 짧은 교차 전환으로 연결하고, 세션 검색 예시 회차를 현재 목록의 최고 회차로 갱신한다.

**Architecture:** 기존 React Router loader와 `sessionId`/`filter` URL 계약은 유지한다. 순수 model helper가 검색 placeholder를 계산하고, archive UI가 React Router View Transition을 활성화해 상단 세션 문맥과 피드 본문만 전환한다. View Transition 미지원 브라우저와 reduced-motion 환경에서는 기존 navigation으로 안전하게 fallback한다.

**Tech Stack:** React 19, React Router 7, TypeScript, Vitest, Testing Library, Playwright CLI, Vite

## Global Constraints

- 수정 표면은 `front/features/archive/model`, `front/features/archive/ui`, 관련 frontend test와 이 plan 문서로 제한한다.
- API, BFF, server, database, pagination, route auth, club scope 계약을 변경하지 않는다.
- 전환 시간은 기존 `--motion-page` token인 190ms, easing은 `--ease-out-refined`, 이동 거리는 최대 4px을 사용한다.
- scale, blur, bounce, spring, 전역 page transition을 추가하지 않는다.
- `prefers-reduced-motion: reduce`에서는 notes transition animation과 선택 surface transition을 제거한다.
- 검색 예시는 현재 불러온 세션의 최고 `sessionNumber`를 사용하고, 빈 목록은 `책 제목 또는 세션 번호`를 사용한다.
- 이미 변경된 `front/src/styles/globals.css`와 다른 사용자 파일은 편집·stage하지 않는다. notes 전용 CSS는 `notes-feed-page.tsx`의 기존 scoped style block에 둔다.
- 현재 실행 중인 `localhost:5173` service를 종료하거나 재설정하지 않는다.
- commit은 별도 명시 권한이 있을 때만 수행한다. 권한이 없으면 각 task의 commit step을 건너뛰고 verified working-tree diff로 남긴다.
- 공개 저장소에 실제 회원 데이터, secret, private domain, deployment state, local absolute path를 추가하지 않는다.

---

## File Structure

- Create: `front/features/archive/model/notes-feed-model.test.ts`
  - search placeholder 계산의 순수 model contract를 검증한다.
- Modify: `front/features/archive/model/notes-feed-model.ts`
  - `noteSessionSearchPlaceholder()`를 제공한다.
- Modify: `front/features/archive/ui/notes-session-filter.tsx`
  - desktop/mobile 검색 placeholder를 helper에 연결한다.
  - desktop rail, mobile recent picker, mobile sheet의 session Link에 View Transition navigation과 선택 surface class를 적용한다.
- Modify: `front/features/archive/ui/notes-feed-page.tsx`
  - session context와 feed content의 named transition boundary 및 scoped CSS를 소유한다.
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
  - 실제 rendered input과 router navigation을 통해 desktop/mobile 사용자 동작을 검증한다.

---

### Task 1: 데이터 기반 세션 검색 placeholder

**Files:**
- Create: `front/features/archive/model/notes-feed-model.test.ts`
- Modify: `front/features/archive/model/notes-feed-model.ts`

**Interfaces:**
- Consumes: `NoteSessionItem.sessionNumber`, `noteSessionNumberLabel()`
- Produces: `noteSessionSearchPlaceholder(sessions: ReadonlyArray<Pick<NoteSessionItem, "sessionNumber">>): string`

- [ ] **Step 1: 최고 회차와 빈 목록을 고정하는 실패 test 작성**

```ts
import { describe, expect, it } from "vitest";
import { noteSessionSearchPlaceholder } from "./notes-feed-model";

describe("noteSessionSearchPlaceholder", () => {
  it("uses the highest session number even when sessions are not sorted", () => {
    expect(
      noteSessionSearchPlaceholder([
        { sessionNumber: 3 },
        { sessionNumber: 8 },
        { sessionNumber: 6 },
      ]),
    ).toBe("책 제목 또는 No.08");
  });

  it("uses a generic example when there are no sessions", () => {
    expect(noteSessionSearchPlaceholder([])).toBe("책 제목 또는 세션 번호");
  });
});
```

이 test가 잡는 production break는 배열 첫 항목 또는 고정 `No.06`을 사용해 최신 회차와 다른 예시를 보여주는 회귀다.

- [ ] **Step 2: test가 올바른 이유로 실패하는지 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/notes-feed-model.test.ts
```

Expected: FAIL because `noteSessionSearchPlaceholder` is not exported.

- [ ] **Step 3: 최소 helper 구현**

`noteSessionNumberLabel()` 바로 아래에 다음 순수 함수를 추가한다.

```ts
export function noteSessionSearchPlaceholder(
  sessions: ReadonlyArray<Pick<NoteSessionItem, "sessionNumber">>,
) {
  const latestSessionNumber = sessions.reduce<number | null>((latest, session) => {
    if (!Number.isFinite(session.sessionNumber)) {
      return latest;
    }

    return latest === null ? session.sessionNumber : Math.max(latest, session.sessionNumber);
  }, null);

  return latestSessionNumber === null
    ? "책 제목 또는 세션 번호"
    : `책 제목 또는 ${noteSessionNumberLabel({ sessionNumber: latestSessionNumber })}`;
}
```

- [ ] **Step 4: focused model test 통과 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/notes-feed-model.test.ts
```

Expected: 2 tests PASS with no warning or runtime error.

- [ ] **Step 5: optional commit checkpoint**

별도 commit 권한이 있을 때만 실행한다.

```bash
git add front/features/archive/model/notes-feed-model.ts front/features/archive/model/notes-feed-model.test.ts
git commit -m "fix(front): derive notes search session example"
```

---

### Task 2: desktop/mobile 검색 입력에 동적 예시 연결

**Files:**
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
- Modify: `front/features/archive/ui/notes-session-filter.tsx`

**Interfaces:**
- Consumes: `noteSessionSearchPlaceholder(noteSessions)` from Task 1
- Produces: 동일 세션 목록에 대해 desktop `세션 검색`과 mobile `세션 목록 검색`이 공유하는 placeholder 문구

- [ ] **Step 1: rendered input 기준의 실패 test 작성**

`NotesFeedPage` describe에 다음 test를 추가한다. 기존 fixture의 최고 회차는 No.09이므로 기대값을 별도 helper로 계산하지 않는다.

```tsx
it("uses the latest session number in desktop and mobile search examples", async () => {
  const user = userEvent.setup();

  renderNotesFeedPage({
    renderNoteSessions: [noteSessions[3], noteSessions[0], noteSessions[1]],
  });

  expect(screen.getByLabelText("세션 검색")).toHaveAttribute(
    "placeholder",
    "책 제목 또는 No.09",
  );

  await user.click(screen.getByRole("button", { name: "전체 보기" }));

  expect(screen.getByLabelText("세션 목록 검색")).toHaveAttribute(
    "placeholder",
    "책 제목 또는 No.09",
  );
});

it("uses a generic search example when there are no note sessions", () => {
  renderNotesFeedPage({
    renderItems: [],
    renderNoteSessions: [],
    selectedSessionId: null,
    renderSelectedSession: null,
  });

  expect(screen.getByLabelText("세션 검색")).toHaveAttribute(
    "placeholder",
    "책 제목 또는 세션 번호",
  );
});
```

이 test가 잡는 production break는 model helper가 존재해도 desktop 또는 mobile 입력이 계속 하드코딩 문자열을 사용하는 회귀다.

- [ ] **Step 2: UI test가 고정 No.06 때문에 실패하는지 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx
```

Expected: FAIL showing received placeholder `책 제목 또는 No.06`.

- [ ] **Step 3: 두 입력을 같은 helper에 연결**

`notes-session-filter.tsx`의 model import에 `noteSessionSearchPlaceholder`를 추가하고 두 input을 다음과 같이 변경한다.

```tsx
placeholder={noteSessionSearchPlaceholder(noteSessions)}
```

desktop `SessionRail`과 mobile `MobileSessionSheet` 모두 각자 받은 전체 `noteSessions`를 그대로 전달한다. 검색으로 좁혀진 `filteredSessions`를 사용하지 않는다.

- [ ] **Step 4: UI와 model focused test 통과 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/notes-feed-model.test.ts tests/unit/notes-feed-page.test.tsx
```

Expected: both files PASS. 기존 title/No.06 검색 matching test도 계속 PASS.

- [ ] **Step 5: optional commit checkpoint**

별도 commit 권한이 있을 때만 실행한다.

```bash
git add front/features/archive/ui/notes-session-filter.tsx front/tests/unit/notes-feed-page.test.tsx
git commit -m "fix(front): keep notes search examples current"
```

---

### Task 3: 세션 navigation에 scoped View Transition 적용

**Files:**
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
- Modify: `front/features/archive/ui/notes-session-filter.tsx`
- Modify: `front/features/archive/ui/notes-feed-page.tsx`

**Interfaces:**
- Consumes: React Router `LinkProps.viewTransition`, existing `sessionHref(session, filter)`, `--motion-page`, `--ease-out-refined`
- Produces: desktop rail, mobile picker, mobile sheet에서 동일한 View Transition navigation; `rm-notes-session-context-transition`와 `rm-notes-feed-content-transition` named boundaries

- [ ] **Step 1: real router navigation이 browser transition을 요청하는 실패 test 작성**

`notes-feed-page.test.tsx`에 `createMemoryRouter`, `RouterProvider`를 import하고 test-local platform boundary를 만든다.

```tsx
it("requests a view transition for desktop session navigation", async () => {
  const user = userEvent.setup();
  const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
    const updateCallbackDone = Promise.resolve().then(update);

    return {
      ready: Promise.resolve(),
      updateCallbackDone,
      finished: updateCallbackDone,
      skipTransition: vi.fn(),
    };
  });

  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: startViewTransition,
  });

  try {
    const router = createMemoryRouter(
      [
        {
          path: "/app/notes",
          element: <>{notesFeedPageElement()}<LocationProbe /></>,
        },
      ],
      { initialEntries: ["/app/notes?sessionId=session-6"] },
    );

    render(<RouterProvider router={router} />);

    await user.click(
      within(desktopRail()).getByRole("link", {
        name: "No.09 다정한 것이 살아남는다 세션 보기",
      }),
    );

    await waitFor(() => expect(startViewTransition).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("current route")).toHaveTextContent(
      "/app/notes?sessionId=session-9",
    );
  } finally {
    Reflect.deleteProperty(document, "startViewTransition");
  }
});
```

이 test가 잡는 production break는 session link에서 `viewTransition` option이 빠져 native crossfade가 시작되지 않는 회귀다. browser API만 test double로 두고 실제 `NotesFeedPage`, archive `Link`, React Router navigation을 실행한다.

- [ ] **Step 2: test가 transition 미호출로 실패하는지 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx -t "requests a view transition"
```

Expected: FAIL because `startViewTransition` has 0 calls while URL navigation succeeds.

- [ ] **Step 3: 모든 세션 선택 Link에 View Transition 활성화**

`SessionRow`의 Link와 `MobileSessionPicker`의 Link에 다음 prop/class를 적용한다. `MobileSessionSheet`는 `SessionRow`를 재사용하므로 별도 navigation 분기를 만들지 않는다.

```tsx
<Link
  viewTransition
  className="rm-notes-session-link"
  to={sessionHref(session, filter)}
  // existing aria-current, aria-label, onClick, style 유지
>
```

- [ ] **Step 4: session context와 feed content boundary 추가**

`notes-feed-page.tsx`에서 `SelectedSessionHeader`, 설명, `NotesFilterBar`를 다음 wrapper로 묶는다.

```tsx
<div className="rm-notes-session-context-transition">
  <SelectedSessionHeader session={displayedSession} />
  <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", maxWidth: 620 }}>
    세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다.
  </p>
  <NotesFilterBar filter={filter} onFilterChange={handleFilterChange} selectedSession={displayedSession} />
</div>
```

기존 feed stack에는 class만 추가한다.

```tsx
<div
  className="stack rm-notes-feed-content-transition"
  style={{ "--stack": "0px" } as CSSProperties}
>
```

`MobileSessionPicker`와 session rail은 named boundary 밖에 유지한다.

- [ ] **Step 5: notes 전용 transition CSS 추가**

`notes-feed-page.tsx`의 기존 `<style>` block에 다음 scoped 규칙을 추가한다. 사용자 변경이 있는 전역 stylesheet는 건드리지 않는다.

```css
.rm-notes-session-link {
  transition:
    background-color var(--motion-fast) var(--ease-out-refined),
    border-color var(--motion-fast) var(--ease-out-refined);
}

@supports (view-transition-name: none) {
  .rm-notes-session-context-transition {
    view-transition-name: rm-notes-session-context;
  }

  .rm-notes-feed-content-transition {
    view-transition-name: rm-notes-feed-content;
  }

  ::view-transition-group(root),
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }

  ::view-transition-group(rm-notes-session-context),
  ::view-transition-group(rm-notes-feed-content) {
    animation-duration: var(--motion-page);
    animation-timing-function: var(--ease-out-refined);
  }

  ::view-transition-old(rm-notes-session-context),
  ::view-transition-old(rm-notes-feed-content) {
    animation: rm-notes-content-out var(--motion-page) var(--ease-out-refined) both;
  }

  ::view-transition-new(rm-notes-session-context),
  ::view-transition-new(rm-notes-feed-content) {
    animation: rm-notes-content-in var(--motion-page) var(--ease-out-refined) both;
  }
}

@keyframes rm-notes-content-out {
  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes rm-notes-content-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rm-notes-session-link {
    transition: none;
  }

  ::view-transition-group(root),
  ::view-transition-group(rm-notes-session-context),
  ::view-transition-group(rm-notes-feed-content),
  ::view-transition-old(rm-notes-session-context),
  ::view-transition-new(rm-notes-session-context),
  ::view-transition-old(rm-notes-feed-content),
  ::view-transition-new(rm-notes-feed-content) {
    animation: none;
  }
}
```

- [ ] **Step 6: focused tests 통과 확인**

Run:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/notes-feed-model.test.ts tests/unit/notes-feed-page.test.tsx tests/unit/notes-page.test.tsx
```

Expected: all tests PASS, including URL filter preservation and loader revalidation regressions.

- [ ] **Step 7: optional commit checkpoint**

별도 commit 권한이 있을 때만 실행한다.

```bash
git add front/features/archive/model/notes-feed-model.ts front/features/archive/model/notes-feed-model.test.ts front/features/archive/ui/notes-session-filter.tsx front/features/archive/ui/notes-feed-page.tsx front/tests/unit/notes-feed-page.test.tsx
git commit -m "fix(front): smooth notes session transitions"
```

---

### Task 4: frontend 회귀와 실제 브라우저 검증

**Files:**
- Verify only: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: completed notes transition and placeholder behavior
- Produces: repository-level and local-runtime evidence; no new product interface

- [ ] **Step 1: frontend boundary와 canonical gates 실행**

Run in order:

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all commands exit 0. 기존 사용자 변경 때문에 실패하면 product regression과 unrelated baseline failure를 구분해 exact output을 기록한다.

- [ ] **Step 2: desktop local-runtime transition 확인**

Playwright CLI로 기존 `localhost:5173`을 사용한다. service를 재시작하지 않는다.

```bash
PWCLI="${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open 'http://localhost:5173/clubs/reading-sai/app/notes?sessionId=00000000-0000-0000-0000-000000000304&filter=highlights' --headed
"$PWCLI" snapshot
```

fixture 로그인 후 다음을 확인한다.

- desktop search placeholder가 `책 제목 또는 No.08`
- No.04 -> No.03 선택에서 shell/rail 전체가 아니라 session context와 feed만 전환
- URL이 No.03 `sessionId`와 `filter=highlights`를 함께 유지
- selected card, heading, filter count, feed가 같은 세션을 표시
- console에 transition/runtime error가 없음

- [ ] **Step 3: mobile과 reduced-motion 확인**

같은 browser session에서 390x844 viewport와 reduced-motion emulation을 각각 적용한다.

- 최근 세션 picker 선택 전환
- `전체 보기` sheet 검색 placeholder `책 제목 또는 No.08`
- sheet의 세션 선택 후 dialog가 닫히고 새 세션 콘텐츠 표시
- 390px에서 horizontal overflow 없음
- reduced-motion에서 named transition animation이 실행되지 않지만 navigation과 filter 유지 정상

필요한 final screenshot만 `output/playwright/`에 저장하고 `.playwright-cli/`, trace, screenshot output은 commit하지 않는다.

- [ ] **Step 4: diff와 공개 안전성 검사**

```bash
git diff --check -- front/features/archive/model/notes-feed-model.ts front/features/archive/model/notes-feed-model.test.ts front/features/archive/ui/notes-session-filter.tsx front/features/archive/ui/notes-feed-page.tsx front/tests/unit/notes-feed-page.test.tsx docs/superpowers/specs/2026-08-02-notes-session-transition-design.md docs/superpowers/plans/2026-08-02-notes-session-transition.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/superpowers/specs/2026-08-02-notes-session-transition-design.md docs/superpowers/plans/2026-08-02-notes-session-transition.md
```

Expected: `git diff --check` exits 0; safety scan returns no matches.

- [ ] **Step 5: final working-tree review**

```bash
git status --short --branch --untracked-files=all
git diff -- front/features/archive/model/notes-feed-model.ts front/features/archive/model/notes-feed-model.test.ts front/features/archive/ui/notes-session-filter.tsx front/features/archive/ui/notes-feed-page.tsx front/tests/unit/notes-feed-page.test.tsx docs/superpowers/specs/2026-08-02-notes-session-transition-design.md docs/superpowers/plans/2026-08-02-notes-session-transition.md
```

Confirm:

- no API/BFF/server/auth changes
- no unrelated user file staged or modified by this task
- no generated Playwright artifact tracked
- final response names frontend/UI surface, exact checks, local-runtime evidence, skipped E2E or residual browser-support risk

- [ ] **Step 6: optional final commit**

별도 commit 권한이 있을 때만 실행한다. 이전 optional checkpoint를 사용하지 않았다면 다음 한 번의 narrow commit으로 묶는다.

```bash
git add front/features/archive/model/notes-feed-model.ts front/features/archive/model/notes-feed-model.test.ts front/features/archive/ui/notes-session-filter.tsx front/features/archive/ui/notes-feed-page.tsx front/tests/unit/notes-feed-page.test.tsx docs/superpowers/specs/2026-08-02-notes-session-transition-design.md docs/superpowers/plans/2026-08-02-notes-session-transition.md
git commit -m "fix(front): smooth notes session transitions"
```
