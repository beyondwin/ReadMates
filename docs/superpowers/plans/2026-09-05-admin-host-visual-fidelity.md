# Admin·Host Visual Fidelity (Composition Residue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin 승인 시안 7장과 Host 승인 시안 11장(총 18장)이 실제 authenticated route에서 시안과 같아 보이도록, 공유 크롬을 셸 기본값으로 올리고 아이콘을 하나의 primitive로 통합한 뒤 화면별 구성 잔여(E)와 시각 토큰(A)을 닫는다.

**Architecture:** 승인 크롬(내비 아이콘·헤더 상태 띠·계정 크롬·공간 전환 pill·유틸 아이콘)은 `AdminShellLayout`/`AdminLayoutNav`와 `TopNav`/`MobileHeader` host variant의 **기본 렌더**가 되고, `admin-*.css`의 `.admin-shell:has(...)` route fork 125개는 삭제된다. 아이콘은 `front/shared/ui/icon.tsx` 하나(`ReadmatesIcon`)가 소유하며 CSS data URI 아이콘은 unit guard로 막는다. 18장 각 scenario에 시안에서 읽은 **구조 계약**(요소 존재/부재)을 추가해 구성 drift를 자동으로 잡고, 화면별 구조 패스는 시안 번호 순으로 E → A를 닫는다. 승인 PNG, 0.02 gate, 출석 1행, item cap, 운영실 문서 순서는 건드리지 않는다.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Vite, Vitest, Playwright E2E/CT, CSS custom properties, bundled Pretendard Variable, pinned Playwright Jammy Docker image

**Spec:** `docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md`

**Plan base:** 로컬 `main` `a48f0eda5` (`docs: scope admin/host visual fidelity slice to composition residue`). `origin/main`이 아니다.

ADR impact: **update (ADR-0045)** — 아이콘 primitive와 "CSS data URI 아이콘 금지·route-scoped 셸 override 금지"를 ADR-0045 본문에 한 절로 추가한다(Task 1). ADR-0053은 `Proposed` 유지. 이 계획은 ADR-0053을 `Accepted`로 올리지 않는다.

## Global Constraints

- 범위는 Admin `01`–`07`, Host `07`–`17` 18장. Public·Member 화면, 서버 API, BFF, persistence, deploy는 건드리지 않는다.
- 승인 reference PNG와 `approved-mockup-manifest.ts`의 `sha256`은 수정하지 않는다. `maxDiffPixelRatio`는 `0.02` 고정, mask는 추가하지 않는다. broad font-raster 예외 API를 부활시키지 않는다.
- 제품 예외(spec §6)는 유지한다: 현장 compact 출석 **1행 + `출석 N명 모두 보기`**, Admin Today 기본 **3건**, Host 작업함 desktop **4** / mobile **3** + `작업함 모두 보기`, 운영실 문서 순서 `현재 모임 → 단계 → 다음에 할 일 → 상태 안내 → 준비 현황/출석 → 작업함`, 전역 공간 전환 크롬(ADR-0051), 승인 PNG를 runtime 배경/카피로 고정하지 않음, Today CTA는 서버 `allowedActions` 의미를 따름.
- spec §5.3 결정: 현재 모임 **H1은 책 제목**, 모임 제목/회차는 kicker. Host 데스크톱 헤더 유틸은 `초대와 설정`·`멤버 시야`·알림(종)·아바타·`새 모임`. 운영실 헤더 액션은 `모임 정보`·`일정 편집`(마감실 `기록 미리보기`)·`변경 이력` 3개이며 `멤버 시야`를 중복 노출하지 않는다.
- 셸 아이콘은 React 컴포넌트(`ReadmatesIcon`)다. CSS `mask-image`/`background-image`의 `data:image/svg+xml`로 아이콘을 그리지 않는다. `.admin-shell:has(` 로 시작하는 selector를 새로 추가하지 않는다. 두 규칙은 `front/tests/unit/shell-chrome-guards.test.ts`가 baseline 카운트로 감시하고, Task 9 종료 시 baseline은 0이다.
- `ui`는 props/callback만 렌더하고 API/query/route를 import하지 않는다. 데이터 우선순위와 `전체 보기` 대상은 route/model이 계산한다(`frontend-boundaries.test.ts` GREEN 유지).
- geometry 기대값은 E/A를 고친 뒤 **새 구성 실측**으로만 갱신한다. 하지 않기로 한 구성(시안 16 여러 행 출석)에는 맞추지 않는다. 구조 계약(`approved-route-structure.ts`)은 시안에서 읽은 요소만 담고 구현에 맞춰 완화하지 않는다.
- 캔버스: Admin desktop `1672×941`, Admin mobile viewport `390×844`, Host desktop `1536×1024`, Host mobile viewport `390×832`. Admin 타입 스케일 desktop `36/28/20/17/16/14/12px`, mobile `28/20/17/16/14/12px`. 정상 상태는 조용한 텍스트, 초록 배지 벽 금지.
- strict receipt는 `DOCKER_CONTEXT=colima-readmates-va` Jammy 컨테이너에서만 만든다. `docker context use`로 기본 context를 바꾸지 않는다. 로컬 macOS 스크린샷을 receipt로 쓰지 않는다.
- 모든 저장소 명령은 `CI=true npx --yes corepack@0.35.0 pnpm --dir front ...` 형태로 실행하고 그대로 보고한다. 아래 단계의 `pnpm --dir front`는 이 launcher를 앞에 붙인 것으로 읽는다.
- 전용 브랜치 `feat/admin-host-visual-fidelity`에서 작업한다. 로컬 `main`에 직접 커밋하지 않는다. `origin/main`에 push하지 않는다.
- 매 Task 시작 전 `git status --short --branch --untracked-files=all`. owned path에 남의 변경이 있으면 멈춘다. 디렉터리/glob을 stage하지 않고 Task가 바꾼 파일만 stage한다.
- `front/test-results/`, Playwright report, `.tmp/visual-authority-compare/` 이미지는 커밋하지 않는다. 분류표는 Markdown 텍스트만 커밋한다.
- 실제 회원 데이터, secret, 로컬 절대 경로, private domain, OCID, token 형태 예시를 넣지 않는다.
- 각 Task는 RED 증거 → 최소 구현 → focused GREEN → 커밋. 시각 묶음(Phase) 끝에 Jammy 18장 재캡처 비율을 **측정값 그대로** 분류표에 적는다. 비율이 줄어도 0.02 초과면 fail이라고 적는다.

---

## File Structure and Ownership

### 새로 만드는 파일

| 파일 | 책임 |
| --- | --- |
| `front/shared/ui/icon.tsx` | `ReadmatesIcon`(stroke 아이콘 단일 소스), `ReadmatesIconBadge`(색 원형 채움 variant), `ReadmatesIconName` union |
| `front/shared/ui/icon.test.tsx` | 이름별 렌더, `data-icon`, `aria-hidden`, size prop |
| `front/tests/unit/shell-chrome-guards.test.ts` | CSS data URI 아이콘 0건, `.admin-shell:has(` 0건 baseline guard |
| `front/tests/e2e/support/approved-route-structure.ts` | 18 id별 구조 계약(존재/부재/텍스트 부재) |
| `front/tests/e2e/support/approved-route-structure.test.ts` | 18 id 모두 등록, selector 비어 있지 않음 |
| `front/features/platform-admin/route/admin-shell-status-context.tsx` | route가 헤더 상태 문장을 셸에 전달하는 context + `useAdminShellStatus` |
| `front/features/host/ui/workbox/host-work-item-icon.tsx` | `HostWorkItemType` → `ReadmatesIconBadge` tone/name 매핑 |
| `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md` | 18장 E/A/B/C/D 분류표 + 단계별 재캡처 비율 |

### 고치는 파일 (소유 단위별)

| 소유 단위 | 파일 |
| --- | --- |
| ADR | `docs/development/adr/0045-*.md`, `docs/development/adr/README.md` |
| Admin shell | `front/features/platform-admin/route/admin-shell-layout.tsx`, `front/features/platform-admin/ui/admin-layout-nav.tsx`, `front/features/platform-admin/ui/admin-mobile-navigation.tsx`, `front/features/platform-admin/ui/admin-alarm-bar.tsx`, `front/features/platform-admin/ui/admin-shell.css` |
| Admin route fork 삭제 | `front/features/platform-admin/ui/admin-today.css`, `admin-club-management.css`, `admin-processing-records.css`, `admin-editorial-ledger.css` |
| Admin 원장 | `admin-clubs-ledger.tsx` + `admin-club-management.css`, `admin-health-grid.tsx` + `admin-health-route.tsx` + `admin-service-status.css`, `admin-audit-ledger.tsx` + `admin-processing-records.css` |
| Host shell | `front/shared/ui/top-nav.tsx`, `front/shared/ui/mobile-header.tsx`, `front/shared/ui/mobile-tab-bar.tsx`, `front/features/host/ui/shell/host-utility-actions.tsx`, `front/features/host/ui/shell/host-shell.css`, `front/src/styles/globals.css`(`.topnav` host variant만) |
| Host 운영실 | `front/features/host/ui/operating-room/current-meeting-header.tsx`, `meeting-phase-tabs.tsx`, `host-next-action.tsx`, `preparation-ledger-row.tsx`, `phase-status-ledger.tsx`, `host-operating-room-page.tsx`, `operating-room.css`, `operating-room-glyph.tsx`(삭제), `front/features/host/model/host-operating-room-model.ts` |
| Host 작업함 | `front/features/host/ui/workbox/host-work-item.tsx`, `host-workbox.tsx`, `host-workbox.css`, `front/features/host/route/host-dashboard-route.tsx` |
| Host 원장 | `meeting-list/host-meeting-list.tsx` + `meeting-toc.css`, `members/member-list.tsx` + `host-members.tsx` + `member-ledger.css`, `host-session-ledger.tsx`, `settings/*.tsx` + `host-invitations.tsx`, `schedule-review/*.tsx` + `host-schedule-review.css`, `person/host-person-detail.tsx` + `host-person-detail.css` |
| Fixture | `front/tests/e2e/support/host-approved-route-fixtures.ts`(No.28 중복), `admin-approved-route-fixtures.ts`(clubs facts 값) |
| Gate | `front/tests/e2e/support/approved-route-harness.ts`, `approved-mockup-contract.ts`, `approved-route-geometry.ts`, `front/scripts/run-visual-authority-docker.ts`, `front/tests/e2e/admin-today.spec.ts` |
| Docs | `front/DESIGN.md`, `CHANGELOG.md` Unreleased |

### 병렬 규칙

Phase 1 Task 5(icon)는 다른 모든 Task의 선행이다. Task 6–9(Admin shell)와 Task 10–12(Host shell)는 파일이 겹치지 않아 병렬 가능하다. Phase 3(Admin 원장 3장)과 Phase 4(Host 원장 6장)는 서로 병렬 가능하되, 같은 Phase 안에서는 CSS 파일이 겹치지 않는 Task만 병렬로 돈다. 재캡처(Docker)는 한 번에 하나만 돈다.

---

## Phase 0 — 브랜치, ADR, 게이트 보강, 펀치 리스트

### Task 1: 전용 브랜치와 ADR-0045 update 절

**Files:**
- Modify: `docs/development/adr/0045-host-admin-composition-*.md` (실제 파일명은 `ls docs/development/adr/0045-*`로 확인)
- Modify: `docs/development/adr/README.md` (ADR-0045 행의 갱신일)

**Interfaces:**
- Produces: ADR-0045 "## 공유 아이콘 primitive와 셸 fork 금지 (2026-09-05 update)" 절. 이후 Task는 이 절을 근거로 인용한다.

- [ ] **Step 1: 브랜치 생성**

```bash
git status --short --branch --untracked-files=all
git switch -c feat/admin-host-visual-fidelity
```

Expected: `## feat/admin-host-visual-fidelity`, 변경 없음.

- [ ] **Step 2: ADR-0045에 update 절 추가**

파일 상단 메타에 `- 갱신일: 2026-09-05` 줄을 `결정일` 아래에 추가하고, `## 검증` 앞에 아래 절을 넣는다.

```markdown
## 공유 아이콘 primitive와 셸 fork 금지 (2026-09-05 update)

paper/ink primitive에 **아이콘 primitive**를 추가한다. Host와 platform admin의 제품 셸·원장·작업함 아이콘은 `front/shared/ui/icon.tsx`의 `ReadmatesIcon`(24 viewBox, stroke 1.75, size 16/20/24, `data-icon` 이름, `aria-hidden` 기본)과 채움 variant `ReadmatesIconBadge` 하나에서 나온다.

다음을 durable 제약으로 둔다.

- 제품 셸의 아이콘은 React 컴포넌트다. CSS `mask-image`/`background-image`의 `data:image/svg+xml`로 아이콘을 그리지 않는다. DOM에 없는 아이콘은 접근성·typography·구조 검사에 잡히지 않기 때문이다.
- 셸 크롬은 route와 무관하게 같다. route가 셸을 바꾸려면 셸 컴포넌트에 명시적 prop/slot/context를 추가한다. `.admin-shell:has(<route class>)` 같은 route-scoped 후행 override로 셸을 fork하지 않는다.
- 두 규칙은 `front/tests/unit/shell-chrome-guards.test.ts`가 감시한다.

근거: 2026-09-05 18장 승인 PNG 대조에서 Today route만 시안 크롬을 갖고 나머지 route는 옛 셸을 그리는 원인이 `admin-today.css`의 route-scoped override 44개와 CSS data URI 아이콘이었다. 이 절은 ADR-0045의 결정을 바꾸지 않고 공유 primitive 범위를 넓힌다.
```

- [ ] **Step 3: README 행 갱신**

`docs/development/adr/README.md`에서 ADR-0045 행의 날짜 열을 `2026-08-26 (update 2026-09-05)`로 바꾼다. 상태는 `Accepted` 그대로.

- [ ] **Step 4: 검사와 커밋**

```bash
git diff --check -- docs/development/adr/
git add docs/development/adr/0045-*.md docs/development/adr/README.md
git commit -m "docs(adr): add shared icon primitive and shell-fork ban to ADR-0045"
```

---

### Task 2: 셸 크롬 guard unit (baseline → 0)

**Files:**
- Create: `front/tests/unit/shell-chrome-guards.test.ts`

**Interfaces:**
- Produces: `SHELL_FORK_BASELINE`, `DATA_URI_ICON_BASELINE` 상수. Task 9와 Task 12가 baseline을 0으로 내린다.

- [ ] **Step 1: 현재 카운트 측정**

```bash
cd front && for f in features/platform-admin/ui/*.css features/host/ui/**/*.css features/host/ui/*.css shared/**/*.css src/styles/*.css; do [ -f "$f" ] && printf "%s data-uri=%s has=%s\n" "$f" "$(grep -c 'data:image/svg+xml' "$f")" "$(grep -c '\.admin-shell:has(' "$f")"; done | grep -v "data-uri=0 has=0"
```

Expected(기록 시점): `admin-today.css` data-uri 약 14 / has 44, `admin-club-management.css` has 34, `admin-processing-records.css` has 47, `admin-editorial-ledger.css` data-uri 8 / has 약 10. 실측값을 Step 2 baseline에 그대로 적는다.

- [ ] **Step 2: guard 테스트 작성**

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cssRoots = ["features", "shared", "src/styles"];

// Baselines record the count at plan start. They may only go DOWN. Task 9 and Task 12 set them to 0.
const DATA_URI_ICON_BASELINE: Record<string, number> = {
  "features/platform-admin/ui/admin-today.css": 14,
  "features/platform-admin/ui/admin-editorial-ledger.css": 8,
};
const SHELL_FORK_BASELINE: Record<string, number> = {
  "features/platform-admin/ui/admin-today.css": 44,
  "features/platform-admin/ui/admin-club-management.css": 34,
  "features/platform-admin/ui/admin-processing-records.css": 47,
  "features/platform-admin/ui/admin-editorial-ledger.css": 10,
};

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(p));
    else if (entry.isFile() && p.endsWith(".css")) out.push(p);
  }
  return out;
}

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("shell chrome guards (ADR-0045 update 2026-09-05)", () => {
  const files = cssRoots.flatMap((root) => cssFiles(path.join(projectRoot, root)));

  it("draws no icon from a CSS data URI outside the recorded baseline", () => {
    for (const file of files) {
      const rel = path.relative(projectRoot, file).split(path.sep).join("/");
      const actual = count(fs.readFileSync(file, "utf8"), "data:image/svg+xml");
      const allowed = DATA_URI_ICON_BASELINE[rel] ?? 0;
      expect(actual, `${rel} data URI icons`).toBeLessThanOrEqual(allowed);
    }
  });

  it("forks the admin shell by route only within the recorded baseline", () => {
    for (const file of files) {
      const rel = path.relative(projectRoot, file).split(path.sep).join("/");
      const actual = count(fs.readFileSync(file, "utf8"), ".admin-shell:has(");
      const allowed = SHELL_FORK_BASELINE[rel] ?? 0;
      expect(actual, `${rel} route-scoped shell overrides`).toBeLessThanOrEqual(allowed);
    }
  });
});
```

- [ ] **Step 3: 실행 (baseline과 같으면 GREEN)**

```bash
pnpm --dir front exec vitest run tests/unit/shell-chrome-guards.test.ts
```

Expected: 2 passed. 실패하면 Step 1 실측으로 baseline 숫자를 맞춘다(올리기는 지금 한 번만 허용).

- [ ] **Step 4: 커밋**

```bash
git add front/tests/unit/shell-chrome-guards.test.ts
git commit -m "test(front): guard CSS data-URI icons and admin shell route forks at baseline"
```

---

### Task 3: 구조 계약 (18 id, 시안에서 읽은 존재/부재)

**Files:**
- Create: `front/tests/e2e/support/approved-route-structure.ts`
- Create: `front/tests/e2e/support/approved-route-structure.test.ts`
- Modify: `front/tests/e2e/support/approved-mockup-contract.ts:28-94` (`structure` 필드, required fields, verdict)
- Modify: `front/tests/e2e/support/approved-route-harness.ts:441-600` (`structure` 측정)
- Modify: `front/scripts/run-visual-authority-docker.ts` (summary `structurePass`)

**Interfaces:**
- Produces:
  ```ts
  export type StructureRule =
    | { name: string; selector: string; presence: "present"; minCount?: number }
    | { name: string; selector: string; presence: "absent" }
    | { name: string; selector: string; presence: "text-absent"; text: string };
  export const APPROVED_ROUTE_STRUCTURE: Record<ApprovedMockupId, readonly StructureRule[]>;
  export async function measureStructure(page: Page, rules: readonly StructureRule[]): Promise<ApprovedComparisonReport["structure"]>;
  ```
- `ApprovedComparisonReport.structure: Array<{ name: string; selector: string; presence: StructureRule["presence"]; passed: boolean; detail: string }>`

- [ ] **Step 1: 구조 계약 파일 작성**

selector는 아래 Task들이 만드는 이름을 미리 확정한다(`data-icon`은 Task 5 `ReadmatesIcon`이 붙인다).

```ts
import type { Page } from "@playwright/test";
import type { ApprovedMockupId } from "./approved-mockup-manifest";
import type { ApprovedComparisonReport } from "./approved-mockup-contract";

export type StructureRule =
  | { name: string; selector: string; presence: "present"; minCount?: number }
  | { name: string; selector: string; presence: "absent" }
  | { name: string; selector: string; presence: "text-absent"; text: string };

const ADMIN_DESKTOP_SHELL: readonly StructureRule[] = [
  { name: "nav-icons", selector: '.admin-layout-nav__item [data-icon]', presence: "present", minCount: 4 },
  { name: "nav-active-check", selector: '.admin-layout-nav__item--active [data-icon="check-circle-filled"]', presence: "present" },
  { name: "header-status", selector: ".admin-shell__status [data-icon]", presence: "present" },
  { name: "header-account-icon", selector: '.admin-shell__account-control [data-icon="person-circle"]', presence: "present" },
  { name: "nav-logout-icon", selector: '.admin-layout-nav__logout [data-icon="logout"]', presence: "present" },
  { name: "no-account-login-copy", selector: ".admin-shell__header", presence: "text-absent", text: "다른 계정으로 로그인" },
];

const ADMIN_MOBILE_SHELL: readonly StructureRule[] = [
  { name: "tab-icons", selector: ".admin-mobile-navigation__link [data-icon]", presence: "present", minCount: 4 },
  { name: "header-account", selector: ".admin-shell__account-control", presence: "present" },
];

const HOST_DESKTOP_SHELL: readonly StructureRule[] = [
  { name: "space-switcher", selector: '.topnav-global-context [aria-label^="공간 전환"], .topnav-global-context .rm-global-space-switcher__trigger', presence: "present" },
  { name: "utility-settings-icon", selector: '.rm-host-utility-actions__item [data-icon="person-plus"]', presence: "present" },
  { name: "utility-member-view-icon", selector: '.rm-host-utility-actions__item [data-icon="eye"]', presence: "present" },
  { name: "utility-bell", selector: '.rm-host-utility-actions__item [data-icon="bell"]', presence: "present" },
  { name: "utility-avatar", selector: ".topnav-account-actions .rm-avatar-chip", presence: "present" },
  { name: "utility-new-meeting", selector: ".rm-host-utility-actions__item.is-create", presence: "present" },
  { name: "no-text-alarm-link", selector: ".rm-host-utility-actions", presence: "text-absent", text: "알림" },
  { name: "no-detail-ops-leak", selector: "main", presence: "text-absent", text: "세부 조작" },
];

const HOST_MOBILE_SHELL: readonly StructureRule[] = [
  { name: "mobile-space-title", selector: '[data-club-shell-region="mobile-spine"] .rm-mobile-header__space', presence: "present" },
  { name: "mobile-bell", selector: '[data-club-shell-region="mobile-spine"] [data-icon="bell"]', presence: "present" },
  { name: "mobile-avatar", selector: '[data-club-shell-region="mobile-spine"] .rm-avatar-chip', presence: "present" },
  { name: "tab-icons", selector: ".rm-mobile-tab-bar [data-icon]", presence: "present", minCount: 4 },
  { name: "no-ellipsis-menu", selector: '[data-club-shell-region="mobile-spine"]', presence: "text-absent", text: "…" },
  { name: "no-detail-ops-leak", selector: "main", presence: "text-absent", text: "세부 조작" },
];

const HOST_OPERATING_ROOM: readonly StructureRule[] = [
  { name: "cover-image", selector: ".rm-operating-room-header__cover img", presence: "present" },
  { name: "fact-icons", selector: ".rm-operating-room-header__facts [data-icon]", presence: "present", minCount: 3 },
  { name: "header-actions-3", selector: ".rm-operating-room-header__action", presence: "present", minCount: 3 },
  { name: "header-no-member-view", selector: ".rm-operating-room-header__actions", presence: "text-absent", text: "멤버 시야" },
  { name: "phase-tabs", selector: '.rm-operating-room-phases__tab[role="tab"]', presence: "present", minCount: 3 },
  { name: "workbox-row-icon", selector: ".rm-host-work-item .rm-icon-badge", presence: "present" },
  { name: "workbox-row-chevron", selector: '.rm-host-work-item [data-icon="chevron-right"]', presence: "present" },
  { name: "workbox-footer", selector: ".rm-host-workbox__footer", presence: "present" },
];

export const APPROVED_ROUTE_STRUCTURE: Record<ApprovedMockupId, readonly StructureRule[]> = {
  "admin-today-desktop": [...ADMIN_DESKTOP_SHELL],
  "admin-clubs-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "club-tabs", selector: '.admin-clubs-ledger [role="tablist"] [role="tab"]', presence: "present", minCount: 3 },
    { name: "club-tab-count", selector: '.admin-clubs-ledger [role="tab"] .admin-clubs-ledger__count', presence: "present", minCount: 3 },
    { name: "club-fact-icons", selector: ".admin-clubs-ledger__facts [data-icon]", presence: "present", minCount: 4 },
    { name: "club-review-section", selector: ".admin-clubs-ledger__review", presence: "present" },
    { name: "no-tech-info-row-label", selector: ".admin-clubs-ledger__list", presence: "text-absent", text: "기술 정보" },
  ],
  "admin-service-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "status-table", selector: '.admin-service-status table, .admin-service-status [role="table"]', presence: "present" },
    { name: "status-columns", selector: '.admin-service-status [role="columnheader"], .admin-service-status th', presence: "present", minCount: 5 },
    { name: "expanded-row-summary", selector: ".admin-service-status__expanded .admin-service-status__facts", presence: "present" },
    { name: "last-full-check", selector: ".admin-shell__status-aside", presence: "present" },
    { name: "no-recent-changes-panel", selector: "main", presence: "text-absent", text: "최근에 바뀐 것" },
    { name: "no-refresh-button-heading", selector: "main h1", presence: "text-absent", text: "서비스 건강" },
  ],
  "admin-records-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "search-icon", selector: '.admin-audit__search [data-icon="search"]', presence: "present" },
    { name: "period-filter", selector: ".admin-audit__period", presence: "present" },
    { name: "row-status-icon", selector: ".admin-audit__row [data-icon]", presence: "present" },
    { name: "detail-sections", selector: ".admin-audit__detail-section", presence: "present", minCount: 5 },
  ],
  "admin-space-switcher-desktop": [
    ...ADMIN_DESKTOP_SHELL,
    { name: "menu-check-icon", selector: '[role="menu"] [data-icon="check-circle-filled"]', presence: "present" },
  ],
  "admin-today-mobile": [...ADMIN_MOBILE_SHELL,
    { name: "status-band", selector: ".admin-shell__status--band", presence: "present" },
    { name: "row-chevron", selector: '.admin-operations-queue [data-icon="chevron-right"]', presence: "present" },
  ],
  "admin-work-detail-mobile": [...ADMIN_MOBILE_SHELL,
    { name: "back-chevron", selector: '[data-icon="chevron-left"]', presence: "present" },
  ],
  "host-prep-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "next-action-secondary", selector: ".rm-operating-room-next-action__secondary", presence: "present" },
    { name: "prep-columns", selector: ".rm-preparation-ledger__head", presence: "present" },
    { name: "prep-row-action-label", selector: ".rm-preparation-ledger-row__link", presence: "text-absent", text: "자세히 보기" },
  ],
  "host-live-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "live-badge", selector: '.rm-operating-room-header__lifecycle[data-badge="today"], .rm-operating-room-header__lifecycle[data-badge="live"]', presence: "present" },
    { name: "next-action-attendance", selector: '.rm-operating-room-next-action[data-kind="attendance"]', presence: "present" },
  ],
  "host-closing-desktop": [
    ...HOST_DESKTOP_SHELL, ...HOST_OPERATING_ROOM,
    { name: "closing-preview-action", selector: '.rm-operating-room-header__action [data-icon="document"]', presence: "present" },
    { name: "step-numbers", selector: ".rm-session-closing-board__step-index", presence: "present", minCount: 5 },
  ],
  "host-meetings-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "view-toggle-icons", selector: '.rm-meeting-toc__view-toggle [data-icon]', presence: "present", minCount: 2 },
    { name: "status-tabs", selector: '.rm-meeting-toc__filters [role="tab"]', presence: "present", minCount: 4 },
    { name: "status-dot", selector: ".rm-meeting-toc__status-dot", presence: "present" },
    { name: "month-timeline", selector: ".rm-meeting-toc__timeline", presence: "present" },
    { name: "footer-total", selector: ".rm-meeting-toc__footer", presence: "present" },
    { name: "no-page-create-button", selector: ".rm-meeting-toc__header", presence: "text-absent", text: "새 모임 만들기" },
    { name: "no-breadcrumb", selector: "main", presence: "text-absent", text: "예정과 기록" },
  ],
  "host-people-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "pending-flat-table", selector: ".rm-member-ledger__pending-row", presence: "present" },
    { name: "schedule-icon", selector: ".rm-member-ledger__schedule [data-icon]", presence: "present" },
    { name: "rsvp-icon", selector: ".rm-member-ledger__rsvp [data-icon]", presence: "present" },
    { name: "open-link", selector: ".rm-member-ledger__open", presence: "present" },
    { name: "current-schedule-rail", selector: ".rm-member-ledger__rail-row", presence: "present", minCount: 4 },
    { name: "no-inline-rename", selector: ".rm-member-ledger", presence: "text-absent", text: "이름 변경" },
    { name: "no-inline-exclude", selector: ".rm-member-ledger", presence: "text-absent", text: "모임 제외" },
  ],
  "host-records-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "status-tabs-underline", selector: '.rm-record-ledger__tabs [role="tab"]', presence: "present", minCount: 4 },
    { name: "export-icon", selector: '.rm-record-ledger__export [data-icon="export"]', presence: "present" },
    { name: "next-closing-banner", selector: ".rm-record-ledger__next .rm-icon-badge", presence: "present" },
    { name: "rail-work-rows", selector: ".rm-record-ledger__rail .rm-host-work-item", presence: "present" },
    { name: "publish-history-footer", selector: ".rm-record-ledger__footer", presence: "present" },
  ],
  "host-settings-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "page-cta", selector: ".rm-host-settings__header .btn-primary", presence: "present" },
    { name: "link-tabs", selector: '.rm-host-invitations__tabs [role="tab"]', presence: "present", minCount: 3 },
    { name: "club-end-row", selector: ".rm-host-settings__end", presence: "present" },
    { name: "no-revision-copy", selector: "main", presence: "text-absent", text: "revision" },
    { name: "no-save-button", selector: "main", presence: "text-absent", text: "설정 저장" },
  ],
  "host-schedule-review-desktop": [
    ...HOST_DESKTOP_SHELL,
    { name: "breadcrumb", selector: ".rm-schedule-review__breadcrumb", presence: "present" },
    { name: "change-table", selector: ".rm-schedule-review__changes", presence: "present" },
    { name: "target-table-header", selector: ".rm-schedule-review__targets thead", presence: "present" },
    { name: "select-all", selector: '.rm-schedule-review__select-all input[type="checkbox"]', presence: "present" },
    { name: "excluded-link", selector: ".rm-schedule-review__excluded", presence: "present" },
    { name: "body-counter", selector: ".rm-schedule-review__counter", presence: "present" },
    { name: "defer-secondary", selector: ".rm-schedule-review__defer", presence: "present" },
    { name: "cancel-link", selector: ".rm-schedule-review__cancel", presence: "present" },
  ],
  "host-prep-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "cover-image", selector: ".rm-operating-room-header__cover img", presence: "present" },
    { name: "fact-icons", selector: ".rm-operating-room-header__facts [data-icon]", presence: "present", minCount: 2 },
    { name: "prep-row-chevron", selector: '.rm-preparation-ledger-row [data-icon="chevron-right"]', presence: "present" },
    { name: "workbox-title", selector: "#host-workbox-title", presence: "present" },
    { name: "workbox-row-icon", selector: ".rm-host-work-item .rm-icon-badge", presence: "present" },
  ],
  "host-live-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "live-badge", selector: '.rm-operating-room-header__lifecycle[data-badge="live"], .rm-operating-room-header__lifecycle[data-badge="today"]', presence: "present" },
    { name: "attendance-control-icons", selector: ".rm-attendance-choice [data-icon]", presence: "present" },
    { name: "compact-preview-one-row", selector: ".rm-meeting-response-ledger__row", presence: "present", minCount: 1 },
  ],
  "host-person-mobile": [
    ...HOST_MOBILE_SHELL,
    { name: "back-row", selector: '.rm-person-detail__back [data-icon="arrow-left"]', presence: "present" },
    { name: "folio-number", selector: ".rm-person-detail__folio", presence: "present" },
    { name: "section-icons", selector: ".rm-person-detail__section [data-icon]", presence: "present", minCount: 3 },
    { name: "more-menu", selector: '.rm-person-detail__more [data-icon="more"]', presence: "present" },
    { name: "no-ledger-back-copy", selector: "main", presence: "text-absent", text: "사람 관리 원장으로" },
  ],
};

export async function measureStructure(
  page: Page,
  rules: readonly StructureRule[],
): Promise<ApprovedComparisonReport["structure"]> {
  const out: ApprovedComparisonReport["structure"] = [];
  for (const rule of rules) {
    const locator = page.locator(rule.selector);
    const count = await locator.count();
    if (rule.presence === "present") {
      const min = rule.minCount ?? 1;
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: count >= min, detail: `count=${count} min=${min}` });
    } else if (rule.presence === "absent") {
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: count === 0, detail: `count=${count}` });
    } else {
      const texts = count === 0 ? [] : await locator.allInnerTexts();
      const leaked = texts.some((t) => t.includes(rule.text));
      out.push({ name: rule.name, selector: rule.selector, presence: rule.presence, passed: !leaked, detail: leaked ? `text "${rule.text}" present` : "ok" });
    }
  }
  return out;
}
```

- [ ] **Step 2: contract 타입·필드 확장**

`approved-mockup-contract.ts`에서:
- `ApprovedComparisonReport`에 `structure: Array<{ name: string; selector: string; presence: "present" | "absent" | "text-absent"; passed: boolean; detail: string }>;`를 `interactions` 아래에 추가.
- `ApprovedRouteAssertionResults`에 `structure: ApprovedComparisonReport["structure"];` 추가.
- `APPROVED_COMPARISON_REPORT_REQUIRED_FIELDS`에 `"structure"` 추가(`"interactions"` 뒤).
- 264행 근처 기본값 객체에 `structure: [],` 추가.
- 302행 근처 verdict 계산에 `&& input.results.structure.every((item) => item.passed)` 추가.
- 389행 근처 실패 목록에 `...report.structure.filter((item) => !item.passed).map((item) => \`structure:${item.name}\`),` 추가.

- [ ] **Step 3: harness에서 측정**

`approved-route-harness.ts` 상단 import에 `import { APPROVED_ROUTE_STRUCTURE, measureStructure } from "./approved-route-structure";` 추가. `runActualRouteAuthority` 안에서 `interactions` 측정 직후, `restoreCanonical` 전에:

```ts
  const structure = await measureStructure(page, APPROVED_ROUTE_STRUCTURE[scenario.id]);
```

`results` 객체에 `structure,` 추가.

- [ ] **Step 4: docker summary에 structurePass**

`front/scripts/run-visual-authority-docker.ts`에서 `geometryPass`를 계산하는 줄 옆에 `structurePass: report.structure.every((item) => item.passed),`를 추가한다(같은 객체 리터럴).

- [ ] **Step 5: 등록 테스트**

```ts
import { describe, expect, it } from "vitest";
import { APPROVED_MOCKUPS } from "./approved-mockup-manifest";
import { APPROVED_ROUTE_STRUCTURE } from "./approved-route-structure";

describe("approved route structure contract", () => {
  it("registers rules for all 18 approved ids", () => {
    expect(Object.keys(APPROVED_ROUTE_STRUCTURE).sort()).toEqual(APPROVED_MOCKUPS.map((e) => e.id).sort());
    for (const rules of Object.values(APPROVED_ROUTE_STRUCTURE)) {
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.selector.trim().length).toBeGreaterThan(0);
        if (rule.presence === "text-absent") expect(rule.text.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 6: unit GREEN, e2e RED 확인**

```bash
pnpm --dir front exec vitest run tests/e2e/support/approved-route-structure.test.ts tests/unit/approved-mockup-contract.test.ts tests/e2e/support/approved-route-scenarios.test.ts
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```

Expected: unit 3 files pass. Docker: 18/18 fail이며 report.json마다 `structure`에 `passed:false` 항목이 있다(이것이 RED 증거). `summary.json`에 `structurePass:false` 18개.

- [ ] **Step 7: 커밋**

```bash
git add front/tests/e2e/support/approved-route-structure.ts front/tests/e2e/support/approved-route-structure.test.ts front/tests/e2e/support/approved-mockup-contract.ts front/tests/e2e/support/approved-route-harness.ts front/scripts/run-visual-authority-docker.ts
git commit -m "test(front): add mockup-derived structure contract to approved-route authority"
```

---

### Task 4: 펀치 리스트 문서

**Files:**
- Create: `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md`

- [ ] **Step 1: 표 생성**

spec §4.2의 18행을 그대로 옮기고 열을 `id | 시안 | E(구성) | A(토큰) | B | C | D | 결함 | 0단계 ratio | 1단계 ratio | 2단계 | 3단계 | 4단계 | structure`로 둔다. `0단계 ratio` 열은 Task 3 Step 6 `summary.json`의 `pct` 값을 그대로 적는다. 상단에 "비율은 측정값 그대로. 0.02 초과는 fail" 문장을 넣는다.

- [ ] **Step 2: 검사와 커밋**

```bash
git diff --check -- docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git add docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git commit -m "docs: seed admin/host visual fidelity punch list with baseline ratios"
```

---

## Phase 1 — 공유 크롬

### Task 5: `ReadmatesIcon` primitive

**Files:**
- Create: `front/shared/ui/icon.tsx`
- Create: `front/shared/ui/icon.test.tsx`
- Modify: `front/src/styles/globals.css` (`.rm-icon`, `.rm-icon-badge` 규칙 추가, 파일 끝)

**Interfaces:**
- Produces:
  ```ts
  export type ReadmatesIconName =
    | "check-circle" | "check-circle-filled" | "alert-circle" | "alert-circle-filled" | "x-circle" | "question-circle" | "minus-circle" | "info"
    | "calendar" | "clock" | "pin" | "people" | "person" | "person-plus" | "person-circle" | "eye" | "bell" | "mail" | "link" | "document" | "notes" | "shield-check" | "search" | "list" | "export" | "history" | "edit" | "logout" | "home" | "more"
    | "chevron-right" | "chevron-left" | "chevron-down" | "arrow-left" | "arrow-right";
  export function ReadmatesIcon(props: { name: ReadmatesIconName; size?: 16 | 20 | 24; strokeWidth?: number; className?: string; title?: string }): JSX.Element;
  export type ReadmatesIconTone = "neutral" | "warn" | "ok" | "info" | "danger" | "accent";
  export function ReadmatesIconBadge(props: { name: ReadmatesIconName; tone: ReadmatesIconTone; size?: 32 | 40; className?: string }): JSX.Element;
  ```
- 모든 svg는 `data-icon={name}`, `aria-hidden` (title 없을 때), `className="rm-icon"`.

- [ ] **Step 1: 테스트**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadmatesIcon, ReadmatesIconBadge } from "./icon";

describe("ReadmatesIcon", () => {
  it("renders a stroke svg with data-icon and aria-hidden by default", () => {
    const { container } = render(<ReadmatesIcon name="calendar" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-icon")).toBe("calendar");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("exposes a title as an accessible name when given", () => {
    const { getByRole } = render(<ReadmatesIcon name="bell" title="알림" />);
    expect(getByRole("img", { name: "알림" })).toBeTruthy();
  });

  it("renders filled variants without stroke", () => {
    const { container } = render(<ReadmatesIcon name="check-circle-filled" size={16} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("currentColor");
  });

  it("wraps a badge with tone", () => {
    const { container } = render(<ReadmatesIconBadge name="alert-circle" tone="warn" />);
    const badge = container.querySelector(".rm-icon-badge")!;
    expect(badge.getAttribute("data-tone")).toBe("warn");
    expect(badge.querySelector('[data-icon="alert-circle"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm --dir front exec vitest run shared/ui/icon.test.tsx
```
Expected: FAIL, `Cannot find module './icon'`.

- [ ] **Step 3: 구현**

```tsx
import type { SVGProps } from "react";

export type ReadmatesIconName =
  | "check-circle" | "check-circle-filled" | "alert-circle" | "alert-circle-filled" | "x-circle" | "question-circle" | "minus-circle" | "info"
  | "calendar" | "clock" | "pin" | "people" | "person" | "person-plus" | "person-circle" | "eye" | "bell" | "mail" | "link" | "document" | "notes" | "shield-check" | "search" | "list" | "export" | "history" | "edit" | "logout" | "home" | "more"
  | "chevron-right" | "chevron-left" | "chevron-down" | "arrow-left" | "arrow-right";

export type ReadmatesIconTone = "neutral" | "warn" | "ok" | "info" | "danger" | "accent";

type IconProps = {
  name: ReadmatesIconName;
  size?: 16 | 20 | 24;
  strokeWidth?: number;
  className?: string;
  title?: string;
};

// Stroke paths on a 24×24 grid. Keep every path here; no other file defines icon geometry.
const STROKE_PATHS: Record<Exclude<ReadmatesIconName, "check-circle-filled" | "alert-circle-filled">, string[]> = {
  "check-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12.5 11 15.5 16.5 9"],
  "alert-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5v5.5", "M12 16.5h.01"],
  "x-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9 9l6 6M15 9l-6 6"],
  "question-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7", "M12 17h.01"],
  "minus-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12h8"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v6", "M12 7.5h.01"],
  calendar: ["M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8 3v4M16 3v4M3 10h18"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5V12l3 2"],
  pin: ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z", "M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"],
  people: ["M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3.5 20c.8-3.6 3-5.5 5.5-5.5s4.7 1.9 5.5 5.5", "M17 11.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z", "M16 14.6c2.2.4 3.8 2.1 4.5 5.4"],
  person: ["M12 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M5 20c1-4.2 3.5-6.5 7-6.5s6 2.3 7 6.5"],
  "person-plus": ["M10 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3 20c1-4.2 3.5-6.5 7-6.5 1.4 0 2.6.4 3.6 1", "M18 14v6M15 17h6"],
  "person-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6.5 18.5c1.2-2.6 3.1-3.9 5.5-3.9s4.3 1.3 5.5 3.9"],
  eye: ["M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z", "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  bell: ["M6 10a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z", "M9.5 19a2.7 2.7 0 0 0 5 0"],
  mail: ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "m3.5 7.5 8.5 6 8.5-6"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"],
  document: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h8M8 17h6"],
  notes: ["M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 8h8M8 12h8M8 16h5"],
  "shield-check": ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "m20 20-3.5-3.5"],
  list: ["M8 6h13M8 12h13M8 18h13", "M4 6h.01M4 12h.01M4 18h.01"],
  export: ["M12 15V4", "m7.5 8.5 4.5-4.5 4.5 4.5", "M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"],
  history: ["M12 21a8 8 0 1 0-7.5-10.9", "M4 4v5h5", "M12 8v4.5l3 1.8"],
  edit: ["M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z", "m13.5 7.5 3 3"],
  logout: ["M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10", "M10 12h9", "m16 8.5 3.5 3.5-3.5 3.5"],
  home: ["M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z"],
  more: ["M6 12h.01M12 12h.01M18 12h.01"],
  "chevron-right": ["m9 6 6 6-6 6"],
  "chevron-left": ["m15 6-6 6 6 6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "arrow-left": ["M19 12H5", "m11 6-6 6 6 6"],
  "arrow-right": ["M5 12h14", "m13 6 6 6-6 6"],
};

export function ReadmatesIcon({ name, size = 20, strokeWidth = 1.75, className, title }: IconProps) {
  const common: SVGProps<SVGSVGElement> = {
    className: className ? `rm-icon ${className}` : "rm-icon",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "data-icon": name,
    focusable: "false",
    ...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true }),
  };

  if (name === "check-circle-filled" || name === "alert-circle-filled") {
    return (
      <svg {...common} fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        {name === "check-circle-filled" ? (
          <path d="M7 12.2 10.4 15.5 17 8.5" fill="none" stroke="var(--rm-icon-contrast, #fff)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 7v6M12 16.5h.01" fill="none" stroke="var(--rm-icon-contrast, #fff)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }

  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {STROKE_PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export function ReadmatesIconBadge({
  name, tone, size = 32, className,
}: { name: ReadmatesIconName; tone: ReadmatesIconTone; size?: 32 | 40; className?: string }) {
  return (
    <span className={className ? `rm-icon-badge ${className}` : "rm-icon-badge"} data-tone={tone} data-size={size} aria-hidden="true">
      <ReadmatesIcon name={name} size={size === 40 ? 20 : 16} />
    </span>
  );
}
```

- [ ] **Step 4: 공용 CSS** (`globals.css` 끝에 추가)

```css
/* ReadmatesIcon primitive (ADR-0045 update 2026-09-05) */
.rm-icon { flex: none; display: inline-block; vertical-align: middle; }
.rm-icon-badge {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--bg-sub); color: var(--text-2);
}
.rm-icon-badge[data-size="40"] { width: 40px; height: 40px; }
.rm-icon-badge[data-tone="warn"]   { background: color-mix(in oklch, var(--warn) 22%, var(--bg)); color: var(--warn); }
.rm-icon-badge[data-tone="ok"]     { background: color-mix(in oklch, var(--ok) 20%, var(--bg)); color: var(--ok); }
.rm-icon-badge[data-tone="info"]   { background: color-mix(in oklch, var(--accent) 16%, var(--bg)); color: var(--accent); }
.rm-icon-badge[data-tone="danger"] { background: color-mix(in oklch, var(--danger) 18%, var(--bg)); color: var(--danger); }
.rm-icon-badge[data-tone="accent"] { background: var(--accent); color: #fff; }
```

- [ ] **Step 5: GREEN, boundaries, 커밋**

```bash
pnpm --dir front exec vitest run shared/ui/icon.test.tsx tests/unit/frontend-boundaries.test.ts
git add front/shared/ui/icon.tsx front/shared/ui/icon.test.tsx front/src/styles/globals.css
git commit -m "feat(front): add ReadmatesIcon primitive as the single shell icon source"
```

---

### Task 6: Admin 셸 기본값 — 내비 아이콘·활성 pill·카운트·로그아웃

**Files:**
- Modify: `front/features/platform-admin/ui/admin-layout-nav.tsx`
- Modify: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-shell.css:225-300, 420-433`

**Interfaces:**
- Consumes: `ReadmatesIcon` (Task 5).
- Produces: 내비 항목 DOM `a.admin-layout-nav__item > svg[data-icon] + span.admin-layout-nav__item-label (+ span.admin-layout-nav__count)`. 활성 항목은 `data-icon="check-circle-filled"`. 로그아웃 버튼은 `svg[data-icon="logout"]` + sr-only 텍스트.
- `ADMIN_NAV_ICONS: Record<AdminRouteOwner, ReadmatesIconName>` export.

- [ ] **Step 1: 테스트 추가** (`admin-layout-nav.test.tsx`에 케이스 추가)

```tsx
it("renders one icon per area and a filled check on the active area", () => {
  render(<AdminLayoutNav capabilities={ALL_VIEW_CAPABILITIES} currentOwner="clubs" renderLink={renderLink} todayCount={3} onLogout={() => {}} />);
  const items = screen.getAllByRole("link");
  expect(items.filter((el) => el.querySelector("[data-icon]"))).toHaveLength(4);
  expect(screen.getByRole("link", { name: /클럽 관리/ }).querySelector('[data-icon="check-circle-filled"]')).toBeTruthy();
  expect(screen.getByRole("link", { name: /오늘 할 일/ }).querySelector('[data-icon="check-circle"]')).toBeTruthy();
  expect(screen.getByRole("button", { name: "다른 계정으로 로그인" }).querySelector('[data-icon="logout"]')).toBeTruthy();
});
```
(`ALL_VIEW_CAPABILITIES`와 `renderLink`는 그 테스트 파일에 이미 있는 헬퍼를 쓴다. 없으면 파일 상단의 기존 render 방식과 같은 값을 재사용한다.)

- [ ] **Step 2: RED**

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-layout-nav.test.tsx
```

- [ ] **Step 3: 구현**

`admin-layout-nav.tsx`:

```tsx
import { ReadmatesIcon, type ReadmatesIconName } from "@/shared/ui/icon";

export const ADMIN_NAV_ICONS: Record<string, ReadmatesIconName> = {
  today: "check-circle",
  clubs: "people",
  service: "shield-check",
  records: "document",
  emergency: "alert-circle",
};
```

areas map 안의 children을:

```tsx
children: (
  <>
    <ReadmatesIcon name={areaActive ? "check-circle-filled" : (ADMIN_NAV_ICONS[area.id] ?? "document")} size={20} />
    <span className="admin-layout-nav__item-label">{area.label}</span>
    {area.id === "today" && todayCount != null && todayCount > 0 ? (
      <span className="admin-layout-nav__count ledger-number" aria-hidden="true">{todayCount}</span>
    ) : null}
  </>
),
```

로그아웃 버튼:

```tsx
<button type="button" className="admin-layout-nav__logout" disabled={accountBusy} onClick={onLogout}>
  <ReadmatesIcon name="logout" size={22} />
  <span className="sr-only">{accountBusy ? "로그아웃 중" : "다른 계정으로 로그인"}</span>
</button>
```
(`aria-label` 제거, sr-only가 이름을 제공한다. `sr-only` 클래스가 globals에 없으면 `rm-sr-only`를 쓴다. 저장소에서 `grep -rn "\.sr-only\b\|\.rm-sr-only" front/src/styles/globals.css`로 확인.)

`admin-shell.css` — `.admin-layout-nav__item` 블록을 기본값으로 교체(옛 underline 활성 표시 삭제):

```css
.admin-layout-nav__eyebrow { margin: 0 0 16px; padding: 0 10px; color: var(--text-3); font-size: 12px; font-weight: 700; }
.admin-layout-nav__areas { gap: 8px; }
.admin-layout-nav__item {
  display: flex; align-items: center; justify-content: flex-start; gap: 10px;
  min-height: 56px; padding: 16px 12px; border: 1px solid transparent; border-radius: 10px;
  color: var(--text-2); font-size: 14px; font-weight: 700; text-decoration: none;
}
.admin-layout-nav__item:hover { color: var(--text); }
.admin-layout-nav__item--active {
  background: var(--surface, #fff); color: var(--ink-900); border-color: var(--line);
  box-shadow: inset -3px 0 0 var(--ink-900);
}
.admin-layout-nav__count { margin-left: auto; color: var(--text-3); font-weight: 700; font-variant-numeric: tabular-nums; }
.admin-layout-nav__item--active .admin-layout-nav__count {
  color: var(--ink-900); background: var(--bg-sub); border-radius: 8px; min-width: 28px; padding: 2px 8px; text-align: center;
}
.admin-layout-nav__logout {
  display: flex; align-items: center; margin-top: auto; width: 100%; min-height: 44px;
  padding: 8px 10px; border: 0; border-top: 1px solid var(--line); background: transparent; color: var(--text-2); cursor: pointer;
}
.admin-shell__nav { display: flex; height: calc(100vh - 86px); min-height: 0; }
.admin-layout-nav { display: flex; flex-direction: column; flex: 1 1 auto; gap: 22px; height: 100%; min-height: 0; }
```

기존 `.admin-layout-nav__item--active { border-bottom-color ... }`와 `.admin-layout-nav__item { border-bottom: 1px solid transparent; ... }` 규칙은 삭제한다.

- [ ] **Step 4: GREEN + shell CT**

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-layout-nav.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx
```

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/ui/admin-layout-nav.tsx front/features/platform-admin/ui/admin-layout-nav.test.tsx front/features/platform-admin/ui/admin-shell.css
git commit -m "feat(admin): render approved nav icons and active pill as shell default"
```

---

### Task 7: Admin 셸 기본값 — 헤더 상태 문장·계정 크롬·모바일 탭 아이콘

**Files:**
- Create: `front/features/platform-admin/route/admin-shell-status-context.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx:54-100`
- Modify: `front/features/platform-admin/ui/admin-alarm-bar.tsx`
- Modify: `front/features/platform-admin/ui/admin-mobile-navigation.tsx`
- Modify: `front/features/platform-admin/ui/admin-shell.css` (header grid)
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type AdminShellStatus = { tone: "ok" | "warn" | "danger" | "neutral"; text: string; aside?: string | null };
  export function AdminShellStatusProvider(props: { children: ReactNode }): JSX.Element;
  export function useAdminShellStatus(status: AdminShellStatus | null): void;   // route가 호출. unmount 시 해제
  export function useAdminShellStatusValue(): AdminShellStatus | null;          // 셸이 읽음
  ```
- 헤더 DOM: `header.admin-shell__header > span.admin-shell__wordmark | div.admin-shell__space-control | p.admin-shell__status > svg[data-icon] + span | (span.admin-shell__status-aside) | div.admin-shell__header-actions > div.admin-shell__account-control > button > svg[data-icon="person-circle"] + svg[data-icon="chevron-down"]`.
- 기본 상태(route가 설정하지 않음): alarm summary에서 `서비스는 정상이며, 확인할 일이 N건 있습니다.`(tone ok) / `unavailable`이면 tone danger + `ADMIN_COPY.alarm.unavailable`.
- 모바일: `.admin-shell__status--band` (tinted 띠), 탭 `a.admin-mobile-navigation__link > svg[data-icon] + span`.

- [ ] **Step 1: 테스트**

`admin-shell-layout.test.tsx`에 추가:

```tsx
it("shows the alarm sentence in the header with a check icon and hides login copy", () => {
  renderShell({ alarm: { state: "ready", summary: { serviceState: "ok", attention: { count: 3, headline: null }, unacknowledged: 0, asOf: null } } });
  const status = screen.getByText("서비스는 정상이며, 확인할 일이 3건 있습니다.").closest(".admin-shell__status")!;
  expect(status.querySelector('[data-icon="check-circle"]')).toBeTruthy();
  expect(screen.queryByText("다른 계정으로 로그인")).toBeNull();
  expect(screen.getByRole("button", { name: "계정" }).querySelector('[data-icon="person-circle"]')).toBeTruthy();
});
```
(`renderShell`은 그 테스트 파일의 기존 렌더 헬퍼 이름에 맞춘다. `summary` 타입은 `AdminAlarmSummary` 필드에 맞춰 채운다.)

- [ ] **Step 2: RED** `pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx`

- [ ] **Step 3: context 구현**

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminShellStatus = { tone: "ok" | "warn" | "danger" | "neutral"; text: string; aside?: string | null };

type Ctx = { value: AdminShellStatus | null; set: (next: AdminShellStatus | null) => void };
const AdminShellStatusContext = createContext<Ctx | null>(null);

export function AdminShellStatusProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<AdminShellStatus | null>(null);
  const ctx = useMemo(() => ({ value, set }), [value]);
  return <AdminShellStatusContext.Provider value={ctx}>{children}</AdminShellStatusContext.Provider>;
}

export function useAdminShellStatus(status: AdminShellStatus | null) {
  const ctx = useContext(AdminShellStatusContext);
  const tone = status?.tone; const text = status?.text; const aside = status?.aside ?? null;
  useEffect(() => {
    if (!ctx) return;
    ctx.set(text && tone ? { tone, text, aside } : null);
    return () => ctx.set(null);
  }, [ctx, tone, text, aside]);
}

export function useAdminShellStatusValue(): AdminShellStatus | null {
  return useContext(AdminShellStatusContext)?.value ?? null;
}
```

- [ ] **Step 4: 셸 헤더 구현**

`admin-shell-layout.tsx`: `AdminShellLayout` 본문을 `AdminShellStatusProvider`로 감싸고 헤더를 아래로 교체. `AdminBreadcrumb`는 헤더에서 제거하고 `main` 상단(`AdminAlarmBar` 자리)으로 옮긴다(모바일 detail 뒤로가기 줄이 필요한 route는 route가 그린다).

```tsx
function AdminShellHeaderStatus({ alarm }: { alarm: AdminShellLayoutProps["alarm"] }) {
  const routeStatus = useAdminShellStatusValue();
  const fallback = defaultShellStatus(alarm);
  const status = routeStatus ?? fallback;
  if (!status) return null;
  const icon = status.tone === "ok" ? "check-circle" : status.tone === "danger" || status.tone === "warn" ? "alert-circle" : "info";
  return (
    <>
      <p className="admin-shell__status" data-tone={status.tone} role={status.tone === "danger" ? "status" : undefined}>
        <ReadmatesIcon name={icon} size={20} />
        <span>{status.text}</span>
      </p>
      {status.aside ? <span className="admin-shell__status-aside"><ReadmatesIcon name="clock" size={16} />{status.aside}</span> : null}
    </>
  );
}

function defaultShellStatus(alarm: AdminShellLayoutProps["alarm"]): AdminShellStatus | null {
  if (alarm.state === "unavailable") return { tone: "danger", text: ADMIN_COPY.alarm.unavailable };
  if (alarm.state !== "ready" || !alarm.summary) return null;
  const count = alarm.summary.attention.count;
  if (alarm.summary.serviceState === "ok") {
    return { tone: count > 0 ? "ok" : "neutral", text: count > 0 ? `서비스는 정상이며, 확인할 일이 ${count}건 있습니다.` : "서비스는 정상입니다." };
  }
  return { tone: "warn", text: `${ADMIN_COPY.alarm.serviceDegraded} · ${ADMIN_COPY.alarm.attention} ${count}건` };
}
```

헤더 JSX:

```tsx
<header className="admin-shell__header">
  <span className="admin-shell__wordmark">ReadMates</span>
  <div key={spaceControlEpoch} className="admin-shell__space-control admin-shell__space-switcher">{spaceSwitcher}</div>
  <AdminShellHeaderStatus alarm={alarm} />
  <div className="admin-shell__header-actions">
    <div className="admin-shell__account-control">
      <button type="button" className="admin-shell__account-button" disabled={accountBusy} onClick={onOtherAccountLogin} aria-label={accountBusy ? "로그아웃 중" : "계정"}>
        <ReadmatesIcon name="person-circle" size={24} />
        <ReadmatesIcon name="chevron-down" size={16} />
      </button>
      {accountError ? <p role="alert">{accountError}</p> : null}
    </div>
  </div>
</header>
```
`workspaceAccountLabel`은 헤더에서 사라지므로 space switcher 열림 상태의 이름 표시(시안 05 `김은영 계정`)는 `GlobalSpaceSwitcher`가 이미 그리는지 확인하고, 아니면 `admin-shell__account-button` 옆에 `<span className="admin-shell__account-name">{workspaceAccountLabel}</span>`을 두고 CSS로 `:has(.rm-global-space-switcher__trigger[aria-expanded="true"])`가 **아닌** 명시 prop `accountNameVisible`로만 보인다(셸 자체의 상태이므로 fork가 아니다).

`AdminAlarmBar`: `banner` span 제거(헤더가 소유). 나머지 live/secondary/today/asof는 유지하되 컴포넌트 루트에 `className="admin-alarm-bar rm-sr-only"`를 기본 적용하고 `state === "unavailable"`일 때만 보이게 한다. Today CSS의 absolute 배치 규칙은 Task 9에서 삭제된다.

`admin-shell.css` 헤더:

```css
.admin-shell__header {
  display: grid; grid-template-columns: 260px auto minmax(0, 1fr) auto auto; align-items: center;
  height: 86px; padding: 0 32px 0 0; border-bottom: 1px solid var(--line); background: var(--bg);
}
.admin-shell__wordmark { padding-left: 32px; color: var(--ink-900); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.admin-shell__space-control { min-width: 160px; }
.admin-shell__status { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 0 16px; color: var(--ink-800); font-size: 16px; font-weight: 500; }
.admin-shell__status[data-tone="ok"] .rm-icon { color: var(--ink-900); }
.admin-shell__status[data-tone="warn"] .rm-icon, .admin-shell__status[data-tone="danger"] .rm-icon { color: var(--warn); }
.admin-shell__status-aside { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 14px; }
.admin-shell__account-button { display: inline-flex; align-items: center; gap: 4px; min-width: 44px; min-height: 44px; border: 0; background: transparent; color: var(--ink-900); cursor: pointer; }
@media (max-width: 767px) {
  .admin-shell__header { grid-template-columns: auto auto minmax(0, 1fr) auto; height: 70px; padding: 0 16px; }
  .admin-shell__wordmark { padding-left: 0; font-size: 20px; }
  .admin-shell__status { grid-column: 1 / -1; grid-row: 2; margin: 0 -16px; padding: 14px 16px; background: var(--bg-sub); border-block: 1px solid var(--line-soft); font-size: 16px; }
  .admin-shell__header:has(.admin-shell__status) { height: auto; }
  .admin-shell__account-button { min-width: 52px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 13px; font-weight: 650; }
  .admin-shell__account-button .rm-icon { display: none; }
  .admin-shell__account-button::after { content: "계정"; }
}
```
모바일 상태 띠에는 클래스 `admin-shell__status--band`를 추가로 렌더한다(`AdminShellHeaderStatus`에서 `className="admin-shell__status admin-shell__status--band"`). 데스크톱 CSS에서는 `--band`가 아무 규칙도 갖지 않는다.

- [ ] **Step 5: 모바일 탭 아이콘**

`admin-mobile-navigation.tsx`에서 `children: MOBILE_SHORT_LABELS[area.id] ?? area.label`을:

```tsx
children: (
  <>
    <ReadmatesIcon name={ADMIN_MOBILE_ICONS[area.id] ?? "document"} size={24} />
    <span>{MOBILE_SHORT_LABELS[area.id] ?? area.label}</span>
  </>
),
```
`const ADMIN_MOBILE_ICONS: Record<string, ReadmatesIconName> = { today: "calendar", clubs: "people", service: "shield-check", records: "document" };` 추가. inline style의 `padding`을 `"16px 4px 8px"`, `flexDirection: "column"`, `gap: 4`, `minHeight: 110`으로 바꿔 시안 06의 탭 높이를 맞춘다. 활성 표시는 `borderTop` 3px 유지.

- [ ] **Step 6: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/ui/admin-alarm-bar.test.tsx features/platform-admin/ui/admin-mobile-navigation.test.tsx tests/unit/frontend-boundaries.test.ts
git add front/features/platform-admin/route/admin-shell-status-context.tsx front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/ui/admin-alarm-bar.tsx front/features/platform-admin/ui/admin-mobile-navigation.tsx front/features/platform-admin/ui/admin-shell.css
git commit -m "feat(admin): move status sentence, account chrome, and tab icons into the shell default"
```

---

### Task 8: route별 헤더 상태 문장 연결

**Files:**
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`, `admin-clubs-route.tsx`, `admin-health-route.tsx`, `admin-audit-route.tsx`
- Modify: 각 route의 `.test.tsx`

**Interfaces:**
- Consumes: `useAdminShellStatus` (Task 7).
- 문장 규칙(시안 01–04, runtime 값은 데이터): Today는 셸 기본값 사용(호출 안 함). Clubs `운영 중인 클럽 {total}곳 중 확인할 곳이 {needsReview}곳 있습니다.`(needsReview>0이면 tone warn, 아니면 ok). Service `대체로 정상이며, {영향 서비스명} 전달을 확인해야 합니다.`(degraded 1개 이상) / `모든 서비스가 정상입니다.`, aside `마지막 전체 확인 {HH:mm}`. Records 고정 문장 `누가 무엇을 왜 처리했는지 확인합니다.` tone neutral.

- [ ] **Step 1: 각 route 테스트에 헤더 문장 단언 추가** (route test는 셸을 렌더하지 않으므로 `useAdminShellStatus`를 `vi.mock`해 호출 인자를 검사)

```tsx
vi.mock("@/features/platform-admin/route/admin-shell-status-context", () => ({ useAdminShellStatus: vi.fn() }));
// ...
expect(useAdminShellStatus).toHaveBeenCalledWith({ tone: "warn", text: "운영 중인 클럽 24곳 중 확인할 곳이 2곳 있습니다.", aside: null });
```

- [ ] **Step 2: RED → 구현 → GREEN**

각 route 컴포넌트에서 데이터가 준비되면 `useAdminShellStatus(status)`를 호출하고 loading/error 중에는 `null`.

- [ ] **Step 3: 커밋**

```bash
git add front/features/platform-admin/route/admin-clubs-route.tsx front/features/platform-admin/route/admin-health-route.tsx front/features/platform-admin/route/admin-audit-route.tsx front/features/platform-admin/route/*.test.tsx
git commit -m "feat(admin): routes provide header status sentences to the shell"
```

---

### Task 9: route-scoped 셸 fork 삭제 (baseline → 0)

**Files:**
- Modify: `front/features/platform-admin/ui/admin-today.css` (524–840, 1491–1560 블록)
- Modify: `front/features/platform-admin/ui/admin-club-management.css:368-470`
- Modify: `front/features/platform-admin/ui/admin-processing-records.css:282-393`
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.css:1608-1630, 3195-3241`
- Modify: `front/tests/unit/shell-chrome-guards.test.ts` (baseline 0)

- [ ] **Step 1: baseline을 0으로**

`DATA_URI_ICON_BASELINE`와 `SHELL_FORK_BASELINE`를 각각 `{}`로 바꾼다. 실행하면 RED.

- [ ] **Step 2: 규칙 삭제/이전**

원칙: `.admin-shell:has(.X) .admin-shell__*` / `.admin-layout-nav*` / `.admin-alarm-bar*` / `.admin-breadcrumb` 규칙은 **삭제**(Task 6–7 기본값이 대체). `.admin-shell:has(.X) .admin-page-frame*` / `.X__*` 같은 **본문** 규칙은 prefix를 떼고 `.X .admin-page-frame*` 또는 `.X__*`로 옮겨 해당 route CSS에 남긴다. `admin-today.css`의 `100vh/overflow:hidden` split 잠금은 `.admin-today-ledger[data-content-layout="split"]`의 상위인 `.admin-shell__main`에 걸 수 없으므로, `admin-shell-layout.tsx`가 `<div className="admin-shell" data-content-layout={outletContext.contentLayout ?? "flow"}>`로 route가 준 명시 값을 받고 CSS는 `.admin-shell[data-content-layout="split"]`을 쓴다(`contentLayout`은 Today route가 outlet context를 통해 넘긴다. 이는 명시 prop이므로 허용).

- [ ] **Step 3: GREEN**

```bash
pnpm --dir front exec vitest run tests/unit/shell-chrome-guards.test.ts
pnpm --dir front lint
pnpm --dir front exec vitest run features/platform-admin
```

- [ ] **Step 4: 영향 CT (Docker)**

```bash
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker -- features/platform-admin
```
Expected: semantic 계약은 통과. tracked snapshot 3장(`admin-shell-mobile-390.png`, `admin-shell-long-copy-320.png`, `editorial-ledger-emergency-takedown-390.png`)은 의도한 크롬 변화로 다를 수 있다. **지금 갱신하지 않는다.** 실패 목록을 펀치 리스트 "CT 대기" 절에 적고 Task 12b 재캡처 뒤 2026-09-04 spec §3 순서로 갱신한다.

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/ui/admin-today.css front/features/platform-admin/ui/admin-club-management.css front/features/platform-admin/ui/admin-processing-records.css front/features/platform-admin/ui/admin-editorial-ledger.css front/features/platform-admin/route/admin-shell-layout.tsx front/tests/unit/shell-chrome-guards.test.ts
git commit -m "refactor(admin): delete route-scoped shell forks and CSS data-URI icons"
```

---

### Task 10: Host 데스크톱 헤더 — 전폭, 공간 전환 pill, 유틸 아이콘, 종, 아바타

**Files:**
- Modify: `front/features/host/ui/shell/host-utility-actions.tsx`
- Modify: `front/features/host/ui/shell/host-utility-actions.test.tsx`
- Modify: `front/features/host/ui/shell/host-shell.css:151-200`
- Modify: `front/shared/ui/top-nav.tsx:280-360` (`TopNavFrame` host variant 컨테이너)
- Modify: `front/src/styles/globals.css` (`.topnav[data-variant="host"]` 규칙 추가)
- Modify: `front/src/app/layouts/app-route-layout.tsx:743-760` (`unreadNotifications` 실제 값 연결은 범위 밖; 0 유지)

**Interfaces:**
- Consumes: `ReadmatesIcon`, 기존 `AvatarChip`(계정 control이 이미 렌더).
- Produces: 유틸 DOM `nav.rm-host-utility-actions > ul > li > a.rm-host-utility-actions__item[data-action=settings|member-view|notifications|new-meeting] > svg[data-icon] + span`. 알림은 아이콘만(sr-only 라벨)이고 `unreadNotifications>0`이면 `span.rm-host-utility-actions__dot`. `new-meeting`은 아이콘 없이 테두리 버튼(`is-create`).
- `TopNavFrame`은 `variant==="host"`일 때 `header.topnav[data-variant="host"] > div.topnav-inner.topnav-inner--fluid`(container max-width 해제, 32px 거터).

- [ ] **Step 1: 테스트** (`host-utility-actions.test.tsx`)

```tsx
it("renders icon utilities, an icon-only bell with unread dot, and a bordered create action", () => {
  render(<HostUtilityActions settingsHref="/s" memberViewHref="/m" notificationsHref="/n" newMeetingHref="/new" unreadNotifications={2} permissionLimits={[]} />);
  expect(screen.getByRole("link", { name: "초대와 설정" }).querySelector('[data-icon="person-plus"]')).toBeTruthy();
  expect(screen.getByRole("link", { name: "멤버 시야" }).querySelector('[data-icon="eye"]')).toBeTruthy();
  const bell = screen.getByRole("link", { name: "알림, 읽지 않은 알림 2개" });
  expect(bell.querySelector('[data-icon="bell"]')).toBeTruthy();
  expect(bell.querySelector(".rm-host-utility-actions__dot")).toBeTruthy();
  expect(bell.textContent?.trim()).toBe("");
  expect(screen.getByRole("link", { name: "새 모임" })).toHaveClass("is-create");
});
```

- [ ] **Step 2: RED** `pnpm --dir front exec vitest run features/host/ui/shell/host-utility-actions.test.tsx`

- [ ] **Step 3: 구현**

```tsx
import { ReadmatesIcon, type ReadmatesIconName } from "@/shared/ui/icon";

const ICONS: Record<HostUtilityActionId, ReadmatesIconName | null> = {
  settings: "person-plus", "member-view": "eye", notifications: "bell", "new-meeting": null,
};
```
링크 내부:
```tsx
<LinkComponent to={action.href} className={className} data-action={action.id} aria-label={notificationLabel} aria-current={action.id === currentId ? "page" : undefined}>
  {ICONS[action.id] ? <ReadmatesIcon name={ICONS[action.id]!} size={20} /> : null}
  {action.id === "notifications" ? (
    unreadCount > 0 ? <span className="rm-host-utility-actions__dot" aria-hidden="true" /> : null
  ) : <span>{action.label}</span>}
</LinkComponent>
```
`rm-host-utility-actions__count` 숫자 배지는 제거(시안은 점).

`host-shell.css`:
```css
.rm-host-utility-actions ul { gap: 4px; align-items: center; }
.rm-host-utility-actions__item { gap: 6px; padding: 8px 10px; font-size: 15px; font-weight: 500; color: var(--text); }
.rm-host-utility-actions__item[data-action="notifications"] { position: relative; width: 44px; padding: 0; justify-content: center; }
.rm-host-utility-actions__dot { position: absolute; top: 9px; right: 11px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.rm-host-utility-actions__item.is-create { margin-left: 8px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 6px; color: var(--accent); font-weight: 600; }
.rm-host-primary-navigation__item { padding: 8px 14px; font-size: 16px; font-weight: 500; color: var(--text); }
.rm-host-primary-navigation__item[aria-current="page"] { font-weight: 700; text-underline-offset: 24px; text-decoration-thickness: 3px; }
```

`top-nav.tsx` `TopNavFrame`:
```tsx
<header className="topnav" data-variant={variant}>
  <div className={variant === "host" ? "topnav-inner topnav-inner--fluid" : "container topnav-inner"}>
```
`globals.css`:
```css
.topnav[data-variant="host"] { height: 92px; border-bottom: 1px solid var(--line); }
.topnav-inner--fluid { width: 100%; max-width: none; height: 100%; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.topnav[data-variant="host"] .topnav-global-context .editorial { font-size: 22px; }
```

- [ ] **Step 4: 공간 전환 pill 확인**

host desktop candidate에 `AppGlobalSpaceSwitcherBridge`가 보이지 않는 원인을 확인한다:
```bash
grep -n "host\|club\|return null" front/src/app/global-space-switcher-bridge.tsx | head -30
```
bridge가 host workspace에서 `null`을 돌려주면, 클럽 컨텍스트가 있을 때 `GlobalSpaceSwitcher`를 `variant="club"`으로 렌더하도록 고쳐 trigger 텍스트가 `{clubName} · 호스트 운영실`이 되게 한다(ADR-0051: 전역 공간 전환은 제품 셸). trigger CSS는 `.rm-global-space-switcher__trigger { min-height: 44px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 6px; }`를 globals에 두어 admin과 host가 같은 pill을 쓴다.

- [ ] **Step 5: GREEN + shell CT + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/shell shared/ui/top-nav.test.tsx tests/unit/frontend-boundaries.test.ts
git add front/features/host/ui/shell/host-utility-actions.tsx front/features/host/ui/shell/host-utility-actions.test.tsx front/features/host/ui/shell/host-shell.css front/shared/ui/top-nav.tsx front/src/styles/globals.css front/src/app/global-space-switcher-bridge.tsx
git commit -m "feat(host): approved desktop header chrome as the shell default"
```

---

### Task 11: Host 모바일 헤더와 탭 바 아이콘

**Files:**
- Modify: `front/shared/ui/mobile-header.tsx` (host presentation)
- Modify: `front/shared/ui/mobile-header.ct.tsx` 또는 `mobile-header-cycle.test.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx` (`TabIcon` → `ReadmatesIcon`, host 탭 아이콘)
- Modify: `front/src/app/layouts/app-route-layout.tsx:782-786` (`HostMobileUtilityMenu` 대신 종+아바타)

**Interfaces:**
- host 모바일 헤더 DOM: `header.rm-mobile-header[data-variant="host"] > (a.rm-mobile-header__back svg[data-icon="arrow-left"] + span)? | button.rm-mobile-header__space(공간 전환 trigger; 텍스트 `{club} · 호스트 운영실` + chevron-down) | div.rm-mobile-header__utility > a[data-icon="bell"] + account avatar`.
- 탭: host는 `home`(운영실) · `calendar`(모임) · `people`(사람) · `document`(기록). `TabIconName`은 `ReadmatesIconName`의 alias로 유지하고 `TabIcon`은 `ReadmatesIcon`을 감싸는 얇은 함수로 남긴다(외부 import 호환).

- [ ] **Step 1: 테스트**

```tsx
it("host mobile header shows space trigger, bell, and avatar without an ellipsis menu", () => {
  render(<MobileHeader variant="host" presentation={{ title: "운영실", brandHref: "/app/host" }} accountControl={<span className="rm-avatar-chip" />} spaceControl={<button className="rm-mobile-header__space">읽는사이 · 호스트 운영실</button>} utilityControl={<a href="/n" aria-label="알림"><svg data-icon="bell" /></a>} />);
  expect(screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
  expect(screen.queryByText("…")).toBeNull();
});
```
`MobileHeaderProps`에 `spaceControl?: ReactNode; utilityControl?: ReactNode;`를 추가한다.

- [ ] **Step 2: RED → 구현**

host variant 렌더: 제목 텍스트 대신 `spaceControl`(있으면)을 첫 칸에, `utilityControl` + `accountControl`을 끝 칸에 둔다. 뒤로 가기가 있으면 첫 칸은 `a.rm-mobile-header__back`(`ReadmatesIcon name="arrow-left"` + label). 기존 `…` 유틸 메뉴 버튼 분기는 host에서 제거.

`app-route-layout.tsx`: `AppClubShell`에 host일 때 `spaceSwitcher.mobile`을 헤더로 옮긴다. `AppClubShell`이 `mobileHeaderSpaceControl`/`mobileHeaderUtility` prop을 받아 `MobileHeader`에 넘기고, `mobile-context` 영역은 host에서 비운다. `mobileHeaderUtility`는 `<HostUtilityActions ... compact />`의 알림 링크 하나만 렌더하는 `HostMobileBell`(같은 파일에 작은 컴포넌트)로 만든다.

`mobile-tab-bar.tsx`: `hostTabs`의 icon을 `"home" | "calendar" | "people" | "document"`로 바꾸고 `TabIcon`을 `export function TabIcon({ name }: { name: TabIconName }) { return <ReadmatesIcon name={name} size={24} strokeWidth={1.6} />; }`로 교체. `TabIconName`은 `ReadmatesIconName`으로 재export. 기존 member 탭 이름(`session`, `notes`, `archive`, `me`, `host`, `notify`, `invite`, `approve`)은 `ReadmatesIconName`에 없으므로 매핑 상수 `LEGACY_TAB_ICON: Record<string, ReadmatesIconName> = { session: "calendar", notes: "notes", archive: "document", me: "person", host: "home", notify: "bell", invite: "mail", approve: "people", edit: "edit", notifications: "bell", home: "home" }`로 변환한다(member 화면 시각은 이 범위 밖이지만 아이콘 소스는 하나여야 한다).

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run shared/ui tests/unit/frontend-boundaries.test.ts
git add front/shared/ui/mobile-header.tsx front/shared/ui/mobile-tab-bar.tsx front/shared/ui/mobile-header-cycle.test.tsx front/shared/ui/app-club-shell.tsx front/src/app/layouts/app-route-layout.tsx
git commit -m "feat(host): mobile header space trigger, bell, avatar and shared tab icons"
```

---

### Task 12: `세부 조작` 누출 정리와 워크박스 행

**Files:**
- Modify: `front/features/host/ui/workbox/host-work-item.tsx`, `host-work-item.test.tsx`
- Create: `front/features/host/ui/workbox/host-work-item-icon.tsx`
- Modify: `front/features/host/ui/workbox/host-workbox.tsx`, `host-workbox.css:182-350`
- Modify: `front/features/host/ui/operating-room/host-next-action.tsx`(`세부 조작` details 제거)
- Modify: 누출 위치 6곳(`grep -rn "세부 조작" front/features/host/ui front/features/platform-admin/ui --include=*.tsx`)

**Interfaces:**
- Produces:
  ```ts
  export function workItemIcon(type: HostWorkItemType): { name: ReadmatesIconName; tone: ReadmatesIconTone };
  // SCHEDULE_UNSEEN → alert-circle/warn, MEMBER_APPROVAL → person/ok, RECORD_CLOSING → document/info,
  // INVITATION_EXPIRY → link/danger, NOTIFICATION_FAILURE → bell/warn
  ```
- 행 DOM: `li.rm-host-work-item > a.rm-host-work-item__destination > span.rm-icon-badge + strong.rm-host-work-item__title + span.rm-host-work-item__meta(수량 · 기한) + svg[data-icon="chevron-right"]`. 보류/되돌리기/receipt 컨트롤은 행에서 제거하고 `HostWorkbox`가 `onOpenItem(key)`로 목적지 route에 넘긴다(목적지 화면이 이미 보류 UI를 소유. 소유하지 않는 목적지는 `host-dashboard-route.tsx`의 기존 defer 핸들러를 `작업함 모두 보기` 화면에서 노출).
- 워크박스 rail 하단: `footer.rm-host-workbox__footer > svg[data-icon="clock"] + span(마지막 receipt 문장) + a(변경 이력) svg[data-icon="chevron-right"]`. 문장은 `HostWorkboxView.items`의 최신 `resolvedAt`/`receiptSummary`에서 route가 계산해 `footerNote` prop으로 넘긴다.

- [ ] **Step 1: 테스트**

```tsx
it("renders a toned icon badge, title, count·due, and chevron with no detail-ops summary", () => {
  render(<HostWorkItem item={{ ...baseItem, type: "SCHEDULE_UNSEEN", title: "일정 미열람 확인", countLabel: "4명", dueAt: null }} pending={false} onDefer={vi.fn()} onUndoDeferral={vi.fn()} />);
  const row = screen.getByRole("listitem");
  expect(row.querySelector('.rm-icon-badge[data-tone="warn"] [data-icon="alert-circle"]')).toBeTruthy();
  expect(row.querySelector('[data-icon="chevron-right"]')).toBeTruthy();
  expect(row.textContent).not.toContain("세부 조작");
  expect(screen.queryByRole("group")).toBeNull();
});
```

- [ ] **Step 2: RED → 구현**

`host-work-item.tsx`의 `details.rm-host-work-item__secondary` 블록과 `deferralControls`, `facts`, `receipt` 렌더를 삭제. 링크 내부를 위 DOM으로. `dueLabel`은 유지(`기한 지남`은 `data-overdue`).

CSS:
```css
.rm-host-work-item { padding: 0; border-bottom: 1px solid var(--line-soft); background: transparent; }
.rm-host-work-item__destination {
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 16px; align-items: center; column-gap: 14px;
  min-height: 84px; padding: 0 24px; text-decoration: none; color: var(--text);
}
.rm-host-work-item__title { font-size: 16px; font-weight: 500; }
.rm-host-work-item__meta { display: inline-flex; gap: 6px; color: var(--text-2); font-size: 14px; font-variant-numeric: tabular-nums; }
.rm-host-work-item__meta > span + span::before { content: "·"; margin-right: 6px; color: var(--text-4); }
.rm-host-workbox__footer { display: flex; align-items: center; gap: 8px; margin: 24px 24px 0; padding-top: 20px; border-top: 1px solid var(--line-soft); color: var(--text-2); font-size: 14px; }
.rm-host-workbox__footer a { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; }
@media (max-width: 767px) { .rm-host-work-item__destination { min-height: 72px; padding: 0 16px; } }
```

`host-next-action.tsx`: `details.rm-operating-room-next-action__more`를 제거하고, `canDefer`면 secondary 자리에 `<button className="rm-operating-room-next-action__secondary" onClick={deferAction}><ReadmatesIcon name="clock" size={18} />내일 09:00까지 보류</button>`을 렌더. `secondaryAction` 링크가 함께 있으면 링크가 먼저, 보류 버튼이 뒤. 보류 문구는 `deferLabel` prop(기본 `내일 09:00까지 보류`)으로 route가 phase에 맞게 넘긴다(마감실 `내일 18:00까지 보류`).

나머지 4곳(`host-members.tsx`, `host-session-ledger.tsx`, `host-invitations.tsx`/`settings`, `host-schedule-review-page.tsx`, `host-person-detail.tsx`): `<summary>세부 조작</summary>`를 쓰는 `details`를 찾아 (a) 내용이 행 액션이면 Phase 4 해당 Task에서 시안의 행 액션으로 대체될 때까지 `<summary className="rm-sr-only">`로 숨기지 **않고** 시안에 없는 컨트롤이면 삭제, (b) 내용이 위험 액션(모임 제외 등)이면 route가 소유하는 상세 화면 링크(`열기 ›`)로 대체. 이 Task에서는 `rm-sr-only`가 아닌 **삭제 또는 링크 대체**만 한다.

- [ ] **Step 3: GREEN**

```bash
pnpm --dir front exec vitest run features/host/ui/workbox features/host/ui/operating-room/host-next-action.test.tsx features/host tests/unit/frontend-boundaries.test.ts
grep -rn "세부 조작" front/features/host/ui front/features/platform-admin/ui --include=*.tsx | grep -v "\.test\." ; echo "expect: no output"
pnpm --dir front exec playwright test tests/e2e/host-lifecycle-operating-room.spec.ts --project=chromium --retries=0
```

- [ ] **Step 4: 커밋**

```bash
git add front/features/host/ui/workbox front/features/host/ui/operating-room/host-next-action.tsx front/features/host/route/host-dashboard-route.tsx front/features/host/ui/host-members.tsx front/features/host/ui/host-session-ledger.tsx front/features/host/ui/host-invitations.tsx front/features/host/ui/schedule-review/host-schedule-review-page.tsx front/features/host/ui/person/host-person-detail.tsx
git commit -m "feat(host): approved workbox rows and remove detail-ops disclosure leaks"
```

---

### Task 12b: Phase 1 재캡처와 펀치 리스트 갱신

- [ ] **Step 1: 재캡처**

```bash
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```

- [ ] **Step 2: 기록**

`summary.json`의 `pct`와 `structurePass`를 펀치 리스트 `1단계 ratio`/`structure` 열에 그대로 적는다. 공유 크롬 관련 structure rule(`nav-icons`, `header-status`, `utility-*`, `mobile-*`, `workbox-row-*`, `no-detail-ops-leak`)은 18/18 `passed:true`여야 한다. 아니면 이 Task에서 고친다. 화면별 rule은 아직 RED가 정상.

- [ ] **Step 3: CT snapshot**

Phase 1로 의도 변경된 tracked snapshot 3장은 실제 route 재캡처를 사람이 reference와 나란히 검토한 뒤(펀치 리스트에 "검토자: 세션/날짜" 기록) Docker update mode로 갱신한다:
```bash
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker -- --update-snapshots features/platform-admin/route/admin-shell-layout.ct.tsx features/platform-admin/ui/admin-editorial-ledger.ct.tsx
```
갱신 후 전체 `test:ct:docker` 통과를 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md front/features/platform-admin/**/__snapshots__/*.png
git commit -m "test(front): phase 1 recapture ratios and reviewed shell snapshots"
```
(`__snapshots__` 실제 경로는 `git status`로 확인해 파일 단위로 stage한다.)

---

## Phase 2 — Host 운영실 5장 (07·08·09·15·16)

### Task 13: 현재 모임 헤더 — 책 제목 H1, 표지 이미지, 배지, 아이콘 facts, 액션 3개

**Files:**
- Modify: `front/features/host/ui/operating-room/current-meeting-header.tsx`, `current-meeting-header.test.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css:1-140, 1043-1100, 1245-1280`
- Modify: `front/features/host/route/host-dashboard-route.tsx` (`headerLinks`에서 `memberViewHref` 제거, `previewHref` 추가, `badge` 계산)
- Delete: `front/features/host/ui/operating-room/operating-room-glyph.tsx` (사용처를 `ReadmatesIcon`으로 교체 후)

**Interfaces:**
- Consumes: `ReadmatesIcon`, `BookCover`(이미지 URL이 있으면 `<img>`를 그려야 함. `BookCover`가 현재 텍스트 타일만 그리면 `imageUrl`이 있을 때 `<img className="rm-book-cover__image">`를 그리도록 `front/shared/ui/book-cover.tsx`를 함께 고친다).
- Produces:
  ```ts
  export type CurrentMeetingHeaderLinks = { infoHref: string; scheduleHref: string; historyHref: string; previewHref: string | null };
  export type CurrentMeetingBadge = { kind: "dday"; label: string } | { kind: "today"; label: "오늘" } | { kind: "live"; label: "진행 중" } | { kind: "closing"; label: string } | null;
  ```
  `CurrentMeetingHeaderProps.dDayLabel` → `badge: CurrentMeetingBadge`. `links.previewHref`가 있으면(마감실) 두 번째 액션이 `기록 미리보기`(`document`), 없으면 `일정 편집`(`edit`).
- DOM: `header.rm-operating-room-header > div.__cover(img) + div.__identity(h1.__title=책 제목, span.__lifecycle[data-badge], p.__kicker=모임 제목 · 저자) + ul.__facts(li>svg[data-icon=calendar]+time · li>svg[data-icon=clock]+span · li>svg[data-icon=pin]+span) + nav.__actions(a×3 > svg + label)`.

- [ ] **Step 1: 테스트**

```tsx
it("uses the book title as h1, meeting title as kicker, icon facts, and three actions without member view", () => {
  render(<CurrentMeetingHeader meeting={{ ...meeting, title: "스물여덟 번째 모임", bookTitle: "지구 끝의 온실", bookAuthor: "김초엽", bookImageUrl: "/covers/x.webp", date: "2026-09-01", startTime: "19:30", endTime: "21:30", locationLabel: "을지로 북살롱" }} badge={{ kind: "dday", label: "D-3" }} links={{ infoHref: "/i", scheduleHref: "/s", historyHref: "/h", previewHref: null }} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("지구 끝의 온실");
  expect(screen.getByText(/스물여덟 번째 모임/)).toBeTruthy();
  expect(screen.getByRole("img", { name: /지구 끝의 온실/ })).toBeTruthy();
  expect(screen.getByRole("list", { name: "모임 일정과 장소" }).querySelectorAll("[data-icon]")).toHaveLength(3);
  const actions = within(screen.getByRole("navigation", { name: "현재 모임 작업" })).getAllByRole("link");
  expect(actions.map((a) => a.textContent)).toEqual(["모임 정보", "일정 편집", "변경 이력"]);
  expect(screen.getByText("D-3")).toBeTruthy();
});
it("shows 기록 미리보기 when previewHref is given", () => { /* previewHref: "/p" → actions[1] === "기록 미리보기" */ });
```

- [ ] **Step 2: RED → 구현**

```tsx
const title = displayText(meeting.bookTitle, displayText(meeting.title, "모임 제목 미정"));
const kicker = [displayText(meeting.title, ""), displayText(meeting.bookAuthor, "")].filter(Boolean).join(" · ");
const actions = [
  { label: "모임 정보", href: links.infoHref, icon: "info" as const },
  links.previewHref ? { label: "기록 미리보기", href: links.previewHref, icon: "document" as const } : { label: "일정 편집", href: links.scheduleHref, icon: "edit" as const },
  { label: "변경 이력", href: links.historyHref, icon: "history" as const },
];
```
facts:
```tsx
<ul className="rm-operating-room-header__facts" aria-label="모임 일정과 장소">
  <li><ReadmatesIcon name="calendar" size={18} /><time dateTime={meeting.date ?? undefined}>{formatDateWithWeekday(meeting.date, "날짜 미정")}</time></li>
  <li><ReadmatesIcon name="clock" size={18} /><span>{formatKoreanTime(meeting.startTime, "시간 미정")}</span></li>
  <li><ReadmatesIcon name="pin" size={18} /><span>{placeLabel}</span></li>
</ul>
```
`formatDateWithWeekday`("9월 1일 월요일")와 `formatKoreanTime`("오후 7:30")은 `front/shared/ui/readmates-display.ts`에 있으면 재사용, 없으면 거기에 추가하고 unit 2건을 붙인다(끝 시간은 시안에 없으므로 헤더에서 생략).
배지: `<span className="rm-operating-room-header__lifecycle" data-badge={badge.kind}>{badge.label}</span>`(null이면 생략). 기존 `__lifecycle-mark`와 `lifecycleLabel` 텍스트는 제거.

route(`host-dashboard-route.tsx`): `badge`는 `phase==="live"`이면 `{kind:"live",label:"진행 중"}`(모바일)·`{kind:"today",label:"오늘"}`(데스크톱은 시안 08 `오늘`; 하나로 통일하려면 `오늘`로 하고 mobile-16 `진행 중`은 C로 기록), `phase==="closing"`이면 `{kind:"dday", label: "D+1" 형태}`, prep이면 `D-n`. `previewHref`는 `phase==="closing"`일 때 기록 초안 경로, 아니면 `null`. `memberViewHref`는 제거(헤더 유틸이 소유).

CSS(데스크톱):
```css
.rm-operating-room-header { --rm-operating-room-cover-width: 112px; grid-template-columns: var(--rm-operating-room-cover-width) minmax(0,1fr) auto; column-gap: 40px; padding: 28px 32px 20px; border-bottom: 1px solid var(--line-soft); }
.rm-operating-room-header__cover .rm-book-cover { border-radius: 8px; overflow: hidden; }
.rm-operating-room-header__cover img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
h1.rm-operating-room-header__title { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; max-width: none; }
.rm-operating-room-header__lifecycle { margin-left: 16px; font-size: 20px; font-weight: 500; color: var(--ok); }
.rm-operating-room-header__lifecycle[data-badge="today"], .rm-operating-room-header__lifecycle[data-badge="live"] { padding: 2px 10px; border-radius: 6px; background: color-mix(in oklch, var(--ok) 14%, var(--bg)); font-size: 15px; }
.rm-operating-room-header__facts { display: flex; gap: 12px; margin: 14px 0 0; color: var(--text-2); font-size: 16px; }
.rm-operating-room-header__facts li { display: inline-flex; align-items: center; gap: 8px; }
.rm-operating-room-header__facts li + li::before { content: "·"; margin-right: 4px; color: var(--text-4); }
.rm-operating-room-header__actions { display: flex; gap: 32px; align-self: center; }
.rm-operating-room-header__action { display: inline-flex; align-items: center; gap: 8px; color: var(--text); font-size: 16px; text-decoration: none; }
```
모바일(≤767px): cover 150px, facts는 2행(달력+시계 한 행, 핀 한 행), actions는 숨기고 `멤버 시야`만 `a.rm-operating-room-header__member-view`(eye 아이콘)로 facts 우측에 둔다 — 이 링크는 모바일 헤더 유틸이 아바타만 갖기 때문에 시안 15/16이 여기 둔 것이다. `memberViewHref`를 그래서 `links.memberViewHref?: string`로 **모바일 전용 optional**로 남긴다.

- [ ] **Step 3: glyph 파일 삭제**

`grep -rln "operating-room-glyph" front/features` 의 모든 import를 `ReadmatesIcon`으로 바꾸고(`OperatingRoomGlyphName` → `ReadmatesIconName`, `chat` → `notes`, `person`/`people`/`calendar`/`pin`/`info`/`edit`/`history`/`eye`/`list` 동일 이름), 파일을 삭제한다.

- [ ] **Step 4: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/operating-room shared/ui/book-cover.ct.tsx shared/ui/readmates-display.test.ts features/host/route/host-dashboard-route.test.tsx
git add front/features/host/ui/operating-room front/features/host/route/host-dashboard-route.tsx front/shared/ui/book-cover.tsx front/shared/ui/readmates-display.ts
git rm front/features/host/ui/operating-room/operating-room-glyph.tsx
git commit -m "feat(host): approved current-meeting header with book title h1 and icon facts"
```

---

### Task 14: 단계 탭 compact + 구분선

**Files:**
- Modify: `front/features/host/ui/operating-room/meeting-phase-tabs.tsx`, `meeting-phase-tabs.test.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css:181-280, 1129-1160`

- [ ] **Step 1: 테스트** — 탭 3개, 현재 탭만 `aria-current="page"`, `__state` 라벨(`현재`, `완료`, `잠김`)은 sr-only로만 존재(시안에는 텍스트 없음):

```tsx
expect(screen.getByRole("tab", { name: /준비실/ }).querySelector(".rm-operating-room-phases__state")).toHaveClass("rm-sr-only");
```

- [ ] **Step 2: 구현**

`__state` span에 `rm-sr-only` 추가. CSS:
```css
.rm-operating-room-phases { padding: 0 32px; border-bottom: 1px solid var(--line-soft); }
.rm-operating-room-phases__list { display: flex; gap: 0; }
.rm-operating-room-phases__item { flex: none; display: flex; align-items: center; }
.rm-operating-room-phases__item + .rm-operating-room-phases__item::before { content: ""; width: 1px; height: 20px; background: var(--line); }
.rm-operating-room-phases__tab { min-width: 108px; padding: 18px 24px; font-size: 17px; font-weight: 500; color: var(--text-2); text-align: center; }
.rm-operating-room-phases__tab[aria-current="page"] { color: var(--accent); font-weight: 700; }
.rm-operating-room-phases__tab[aria-current="page"]::after { height: 3px; background: var(--accent); }
@media (max-width: 767px) { .rm-operating-room-phases { padding: 0 16px; } .rm-operating-room-phases__tab { flex: 1; min-width: 0; padding: 14px 8px; font-size: 18px; } }
```
(모바일 시안 15/16은 3등분이므로 모바일만 `flex:1` 유지.)

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/operating-room/meeting-phase-tabs.test.tsx
git add front/features/host/ui/operating-room/meeting-phase-tabs.tsx front/features/host/ui/operating-room/meeting-phase-tabs.test.tsx front/features/host/ui/operating-room/operating-room.css
git commit -m "style(host): compact phase tabs with dividers per approved mockups"
```

---

### Task 15: 다음에 할 일 — 문장형 라벨, 보류 secondary, 상태 줄

**Files:**
- Modify: `front/features/host/model/host-operating-room-model.ts:428-500` (`label` 문장, `deferLabel`, phase 우선순위)
- Modify: `front/features/host/model/host-operating-room-model.test.ts`
- Modify: `front/features/host/ui/operating-room/host-next-action.tsx`, `host-next-action.test.tsx`
- Modify: `front/features/host/ui/operating-room/operating-room.css` (next-action 블록)

**Interfaces:**
- `HostNextActionView`에 `deferLabel: string | null` 추가(`actionable`일 때 `내일 09:00까지 보류`, closing은 `내일 18:00까지 보류`, 그 외 null). `label`은 문장형: schedule-seen `최신 일정을 아직 보지 않은 {n}명이 있어요`, attendance `아직 출석을 확인하지 않은 {n}명이 있어요`, closing `기록 초안을 검토하면 멤버에게 게시할 수 있어요`. `reason`은 보조 문장(`대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.` 등). `note`는 상태 줄(`일정이 어제 19:30에 변경되었어요` / `오후 7:26 · 현장 모드가 열렸어요`)로 route/model이 채운다.
- **phase 우선순위**: `resolveNextAction`에 `phase` 인자를 넘겨 `phase === "live"`면 `unknownAttendanceCount > 0` 분기를 preparation 경고보다 먼저(현재도 그렇다), 그리고 `phase === "live"`인데 unknown이 0이고 preparation 경고가 남아 있으면 **live 문맥 라벨**(`진행 순서 확인`)로 바꾸지 않고 기존 로직 유지 — 단, `liveAvailable` 계산이 `phases`의 availability에만 의존하므로 fixture에서 live가 `available`인데도 candidate가 prep 액션을 보인 원인(`unknownAttendanceCount`가 0인 fixture `attendanceMix`)을 확인해 fixture의 live 상태가 `UNKNOWN` 3명을 갖도록 `host-approved-route-fixtures.ts`를 고친다(C 결함 수정, 시안 08 `확인 필요 3`과 일치).

- [ ] **Step 1: model 테스트**

```ts
it("prefers attendance in live phase and yields sentence labels with a defer label", () => {
  const view = buildHostOperatingRoomView({ ...input, requestedPhase: "live", meeting: withUnknownAttendance(meeting, 3) });
  expect(view.nextAction.kind).toBe("attendance");
  expect(view.nextAction.label).toBe("아직 출석을 확인하지 않은 3명이 있어요");
  expect(view.nextAction.deferLabel).toBe("내일 09:00까지 보류");
});
```

- [ ] **Step 2: UI 테스트**

```tsx
it("renders label, reason, primary, defer secondary, and note", () => {
  render(<HostNextAction action={{ ...action, label: "최신 일정을 아직 보지 않은 4명이 있어요", reason: "대상과 문구를 확인한 뒤 직접 보내세요.", deferLabel: "내일 09:00까지 보류", note: "일정이 어제 19:30에 변경되었어요" }} onDefer={vi.fn()} />);
  expect(screen.getByRole("button", { name: "내일 09:00까지 보류" }).querySelector('[data-icon="clock"]')).toBeTruthy();
  expect(screen.getByText("일정이 어제 19:30에 변경되었어요").closest(".rm-operating-room-next-action__note")?.querySelector("[data-icon]")).toBeTruthy();
  expect(screen.queryByText("지금 처리")).toBeNull();
});
```

- [ ] **Step 3: 구현**

`host-next-action.tsx`: `__state` 라벨(`지금 처리` 등)은 `rm-sr-only`. `data-kind={action.kind}`를 section에 추가(구조 계약 `next-action-attendance`). note는 `<p className="__note"><ReadmatesIcon name={action.state === "deferred" ? "clock" : "info"} size={16} />{note}</p>`. 보류 버튼은 Task 12에서 만든 secondary 자리에 `deferLabel`로.

CSS:
```css
.rm-operating-room-next-action { padding: 32px 32px 24px; }
.rm-operating-room-next-action h2 { font-size: 14px; font-weight: 500; color: var(--text-2); margin: 0 0 12px; }
.rm-operating-room-next-action__label { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; }
.rm-operating-room-next-action__reason { color: var(--text-2); font-size: 16px; margin: 0 0 20px; }
.rm-operating-room-next-action__controls { display: flex; gap: 36px; align-items: center; }
.rm-operating-room-next-action__primary { min-height: 48px; padding: 0 40px; font-size: 16px; }
.rm-operating-room-next-action__secondary { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 24px; border: 1px solid var(--accent); border-radius: 4px; background: transparent; color: var(--accent); font-size: 16px; font-weight: 600; }
.rm-operating-room-next-action__note { display: inline-flex; align-items: center; gap: 8px; margin: 20px 0 0; color: var(--text-2); font-size: 14px; }
```
모바일: `__label` 24px, `__controls`는 primary가 텍스트 링크(시안 15 `대상과 문구 검토 · 보류` 한 줄) — `@media (max-width:767px)`에서 `__primary { background: transparent; color: var(--accent); border-bottom: 2px solid var(--accent); padding: 0 4px 6px; border-radius: 0; }`.

- [ ] **Step 4: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/model/host-operating-room-model.test.ts features/host/ui/operating-room/host-next-action.test.tsx tests/e2e/support/host-approved-route-fixtures.test.ts
git add front/features/host/model/host-operating-room-model.ts front/features/host/model/host-operating-room-model.test.ts front/features/host/ui/operating-room/host-next-action.tsx front/features/host/ui/operating-room/host-next-action.test.tsx front/features/host/ui/operating-room/operating-room.css front/features/host/route/host-dashboard-route.tsx front/tests/e2e/support/host-approved-route-fixtures.ts
git commit -m "feat(host): sentence next-action with defer secondary and live attendance priority"
```

---

### Task 16: 준비/현장/마감 원장 — 열 헤더, 구체 액션 라벨, 아이콘 상태

**Files:**
- Modify: `front/features/host/ui/operating-room/preparation-ledger.tsx`, `preparation-ledger-row.tsx`, `preparation-ledger.test.tsx`
- Modify: `front/features/host/ui/operating-room/phase-status-ledger.tsx`, `phase-status-ledger.test.tsx`
- Modify: `front/features/host/model/host-operating-room-model.ts` (`PreparationLedgerRowView.actionLabel`)
- Modify: `front/features/host/ui/session-closing-board.tsx`, `session-closing-board.css` (단계 번호 원형 `__step-index`, 상태 색)
- Modify: `front/features/host/ui/operating-room/operating-room.css`

**Interfaces:**
- `PreparationLedgerRowView`에 `actionLabel: string` 추가: schedule-seen `멤버 보기`, rsvp `응답 보기`, questions `질문 보기`, place `정보 보기`. `PhaseStatusLedgerRowView.action`은 이미 있음(`출석 보기`, `응답 보기`, `진행 보기`, `메모 열기`).
- DOM(데스크톱): `section.rm-preparation-ledger > h2(준비 현황) + div.rm-preparation-ledger__head(항목·현황·세부 내용·관리) + ol > li.rm-preparation-ledger-row > span.__label(svg[data-icon] + 라벨) + span.__value(숫자 `8 / 12` 초록/`완료`) + span.__detail + a.__link(actionLabel + svg[data-icon="chevron-right"])`. `__state` 텍스트(`확인 필요` 등)는 sr-only. 모바일: `__index`(01–04) 표시, `__label` 아이콘 24px, 값+detail 2줄, 링크는 chevron만(aria-label은 actionLabel).
- 마감 원장: `li > span.rm-session-closing-board__step-index(1–5 원형) + 라벨 + 상태(완료 초록/작성 중 파랑/확인 필요 주황/대기 회색) + detail + 액션 링크 + chevron`.

- [ ] **Step 1: 테스트**

```tsx
it("renders column head, specific action labels, and hides generic state words", () => {
  render(<PreparationLedger rows={rows} />);
  expect(screen.getByText("세부 내용")).toBeTruthy();
  expect(screen.getByRole("link", { name: "현재 일정 확인 멤버 보기" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /자세히 보기/ })).toBeNull();
  expect(screen.getByText("확인 필요")).toHaveClass("rm-sr-only");
});
```

- [ ] **Step 2: 구현 + CSS**

```css
.rm-preparation-ledger { padding: 24px 32px; }
.rm-preparation-ledger h2 { font-size: 17px; font-weight: 700; margin: 0 0 16px; }
.rm-preparation-ledger__head, .rm-preparation-ledger-row { display: grid; grid-template-columns: minmax(180px, 1.2fr) minmax(100px, .8fr) minmax(0, 2fr) auto; column-gap: 24px; align-items: center; }
.rm-preparation-ledger__head { padding: 0 0 10px; color: var(--text-3); font-size: 14px; border-bottom: 1px solid var(--line); }
.rm-preparation-ledger-row { min-height: 60px; border-bottom: 1px solid var(--line-soft); font-size: 16px; }
.rm-preparation-ledger-row__label { display: inline-flex; align-items: center; gap: 12px; }
.rm-preparation-ledger-row__value { font-weight: 600; font-variant-numeric: tabular-nums; }
.rm-preparation-ledger-row[data-state="complete"] .rm-preparation-ledger-row__value, .rm-preparation-ledger-row[data-state="normal"] .rm-preparation-ledger-row__value { color: var(--ok); }
.rm-preparation-ledger-row[data-state="warning"] .rm-preparation-ledger-row__value { color: var(--warn); }
.rm-preparation-ledger-row__detail { color: var(--text-2); }
.rm-preparation-ledger-row__link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; text-decoration: none; }
@media (max-width: 767px) {
  .rm-preparation-ledger { padding: 20px 16px; }
  .rm-preparation-ledger__head { display: none; }
  .rm-preparation-ledger-row { grid-template-columns: 36px 28px minmax(0,1fr) auto; min-height: 96px; grid-template-areas: "index icon label link" "index icon value link" "index icon detail link"; }
  .rm-preparation-ledger-row__link span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
}
```
같은 grid를 `phase-status-ledger`(현장 현황)에도 적용(클래스 접두 `rm-phase-status-ledger`). 마감 원장 `__step-index`: `width:24px;height:24px;border:1px solid var(--line);border-radius:50%;display:inline-grid;place-items:center;font-size:12px;`.

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/operating-room features/host/ui/session-closing-board.test.tsx features/host/model/host-operating-room-model.test.ts
git add front/features/host/ui/operating-room front/features/host/ui/session-closing-board.tsx front/features/host/ui/session-closing-board.css front/features/host/model/host-operating-room-model.ts
git commit -m "feat(host): approved ledger columns, action labels, and step indices"
```

---

### Task 17: 운영실 rail 제목·탭·하단 이벤트 줄, 데스크톱 grid 폭

**Files:**
- Modify: `front/features/host/ui/workbox/host-workbox.tsx`, `host-workbox.css:1-60, 60-130`
- Modify: `front/features/host/route/host-dashboard-route.tsx` (`footerNote`, 탭 카운트 `지금 N`은 **전체 건수**로 유지 — 목록 4/3건 cap과 별개)

**Interfaces:**
- `HostWorkboxProps`에 `footerNote?: { text: string; historyHref: string } | null`, `title?: string`(기본 `호스트 작업함`) 추가.
- 데스크톱 rail: `.rm-host-operating-room__body { width: 100%; max-width: none; grid-template-columns: minmax(0, 62fr) minmax(360px, 38fr); border-inline: 0; }`(시안 07: 본문 ~950px / rail ~500px on 1536). 탭은 underline(`지금 4` 파랑, `보류 1`, `완료`), 탭 텍스트 17px.

- [ ] **Step 1: 테스트**

```tsx
it("renders rail title, underline tabs with full counts, capped rows, and a footer note", () => {
  render(<HostWorkbox view={viewWith12Items} visibleLimit={4} footerNote={{ text: "어제 19:30 자동 리마인드 전달됨", historyHref: "/h" }} ... />);
  expect(screen.getByRole("heading", { name: "호스트 작업함" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /지금 12/ })).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByRole("link", { name: "변경 이력" })).toBeTruthy();
  expect(screen.getByText("어제 19:30 자동 리마인드 전달됨").parentElement?.querySelector('[data-icon="clock"]')).toBeTruthy();
});
```
(`시안 07`의 `지금 4`는 fixture 건수 4의 결과이고 제품 계약은 전체 건수 표시다. 여기서는 12를 그대로 두고 펀치 리스트 C로 기록한다.)

- [ ] **Step 2: 구현 + CSS**

```css
.rm-host-workbox__header { padding: 28px 24px 0; border: 0; }
.rm-host-workbox__header h2 { font-size: 20px; font-weight: 700; }
.rm-host-workbox__tabs { display: flex; gap: 8px; padding: 16px 24px 0; border-bottom: 1px solid var(--line); }
.rm-host-workbox__tabs [role="tab"] { padding: 8px 20px 14px; border: 0; background: transparent; color: var(--text-2); font-size: 17px; font-weight: 500; }
.rm-host-workbox__tabs [role="tab"][aria-selected="true"] { color: var(--accent); font-weight: 700; box-shadow: inset 0 -3px 0 var(--accent); }
.rm-host-workbox__show-all { display: block; margin: 16px auto 0; color: var(--accent); background: transparent; border: 0; font-weight: 600; }
.rm-host-operating-room__workbox-rail { background: transparent; border-inline-start: 1px solid var(--line); }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/workbox features/host/route/host-dashboard-route.test.tsx
git add front/features/host/ui/workbox front/features/host/route/host-dashboard-route.tsx
git commit -m "feat(host): approved workbox rail title, tabs, footer note, and body grid"
```

---

### Task 18: 모바일 현장(16) 출석 컨트롤 아이콘·`현장 운영` kicker·토스트 위치, Phase 2 재캡처

**Files:**
- Modify: `front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx`, `meeting-response-ledger.css`, `meeting-response-ledger.test.tsx`
- Modify: `front/features/host/route/host-dashboard-route.tsx` (compact live 제목 `출석 확인`, kicker `현장 운영`, `진행 순서 보기 ›`)
- Modify: `front/tests/e2e/support/approved-route-geometry.ts` (Phase 2 새 구성 실측으로 갱신)

- [ ] **Step 1: 테스트** — 컨트롤 3개(참석 check-circle / 불참 x-circle / 미확인 question-circle) 아이콘, 선택된 버튼만 아이콘 표시, 1행 미리보기와 `출석 N명 모두 보기` 유지, `나머지 N명` 숨김 로직(`previewTruncated`) 유지.

```tsx
expect(screen.getByRole("radio", { name: "참석" }).querySelector('[data-icon="check-circle"]')).toBeTruthy();
expect(screen.getAllByRole("row")).toHaveLength(1);
expect(screen.getByRole("button", { name: "출석 6명 모두 보기" })).toBeTruthy();
expect(screen.queryByText(/나머지 \d+명/)).toBeNull();
```
(컨트롤이 radio가 아니라 button이면 기존 role을 따른다. 컨트롤 span에 `className="rm-attendance-choice"`를 붙인다.)

- [ ] **Step 2: 구현**

행: `li.rm-meeting-response-ledger__row > AvatarChip(44px) + div(이름 + 응답 상태 회색) + div.rm-attendance-choice-group(버튼 3개, 선택은 accent 테두리 + 아이콘, 불참 선택은 danger)`. kicker/제목/`진행 순서 보기`/info 줄은 route가 compact live 콘텐츠 상단에 렌더한다. 저장 토스트(`출석 8명 저장됨 · 실행 취소`)는 목록 아래 고정이 아니라 목록 끝 다음(시안 16)에 둔다.

- [ ] **Step 3: geometry 갱신 규칙**

Phase 2 변경으로 host 5개 id의 `HOST_*` geometry 상수가 4px 밖으로 벗어난다. Jammy 재캡처의 `report.json` `regions[].actual`을 읽어 **실측값**으로 갱신한다. 단, `HOST_OR_LIVE_MOBILE_BOARD_GEOMETRY`(1행 보드)는 1행 구성의 실측이어야 하며 시안 16의 여러 행 높이로 올리지 않는다.

- [ ] **Step 4: 재캡처와 기록**

```bash
pnpm --dir front exec playwright test tests/e2e/host-lifecycle-operating-room.spec.ts --project=chromium --retries=0
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker -- features/host
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```
펀치 리스트 `2단계` 열에 host 5 id의 `pct`/`structurePass`를 적는다. `HOST_OPERATING_ROOM` rule과 07·08·09·15·16 화면별 rule은 `passed:true`여야 한다. CT snapshot(`host-operating-room-responsive`, `host-workbox.ct`)은 사람이 실제 route를 검토한 뒤 update mode로 갱신한다(Task 12b Step 3과 같은 절차).

- [ ] **Step 5: 커밋**

```bash
git add front/features/host/ui/meeting-workspace front/features/host/route/host-dashboard-route.tsx front/tests/e2e/support/approved-route-geometry.ts docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git commit -m "feat(host): mobile live attendance controls and phase 2 recapture"
```

---

## Phase 3 — Admin 원장 3장 (02·03·04)

각 Task의 Step 0은 같다: 해당 id의 구조 계약(Task 3)이 RED임을 직전 `summary.json`에서 확인하고, `reference.png`/`candidate.png`를 나란히 열어 펀치 리스트 E/A 칸을 갱신한다.

### Task 19: Admin 클럽 관리 (02)

**Files:**
- Modify: `front/features/platform-admin/ui/admin-clubs-ledger.tsx`, `admin-clubs-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-management.css`
- Modify: `front/features/platform-admin/route/admin-clubs-route.tsx`, `admin-clubs-data.ts` (탭 카운트·리뷰 항목 view model)
- Modify: `front/tests/e2e/support/admin-approved-route-fixtures.ts` (clubs fixture: 호스트/멤버/공개 기록/도메인 값, `needsReview` 클럽 1개)

**Interfaces:**
- view model(`admin-clubs-data.ts`):
  ```ts
  export type AdminClubsLedgerView = {
    tabs: { id: "all" | "needs-review" | "active"; label: "전체" | "확인 필요" | "운영 중"; count: number }[];
    rows: { clubId: string; name: string; statusLabel: string; needsReview: boolean; updatedAgo: string; href: string }[];
    selected: { name: string; facts: { icon: "people" | "person" | "document" | "link"; label: string; value: string }[]; review: { text: string }[]; primary: { label: "운영 상태 변경 검토"; href: string }; secondary: { label: "접근 권한 보기"; href: string }; tertiary: { label: string; href: string } | null } | null;
  };
  ```
- DOM: `section.admin-clubs-ledger > div.admin-clubs-ledger__list(h2 클럽 찾기 + div[role=tablist] > button[role=tab] > span + span.admin-clubs-ledger__count + ul > li.admin-clubs-ledger__row(선택 행은 좌측 3px warn 바 + 배경, `!` 아이콘, 이름, 상태 문구(warn 색), 시각, chevron)) + section.admin-clubs-ledger__detail(eyebrow 선택한 클럽 + h1 + h3 운영 상태 + ul.admin-clubs-ledger__facts(li > svg[data-icon] + label + value, 구분선) + section.admin-clubs-ledger__review(h3 확인할 내용 + li > svg[data-icon="alert-circle"] + text) + h3 운영 상태 변경 검토 + p + 버튼 3개)`.
- 시안에 없는 것 제거: 페이지 헤더 `새 클럽` 버튼(생성 권한이 있으면 리스트 헤더 우측 `+` 아이콘 링크로 이동, `CREATE_CLUB` capability 유지), 행의 `기술 정보` 라벨(기술 정보는 detail 하단 `기술 정보 펼치기` disclosure로).

- [ ] **Step 1: 테스트**

```tsx
it("renders three counted tabs, a warn-marked selected row, icon facts, and a review section", () => {
  render(<AdminClubsLedger view={view} onSelectTab={vi.fn()} />);
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(screen.getByRole("tab", { name: /확인 필요 2/ })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("문장과 사람들");
  expect(screen.getByRole("list", { name: "운영 상태" }).querySelectorAll("[data-icon]")).toHaveLength(4);
  expect(screen.getByRole("heading", { name: "확인할 내용" })).toBeTruthy();
  expect(screen.queryByText("기술 정보", { selector: ".admin-clubs-ledger__row *" })).toBeNull();
});
```

- [ ] **Step 2: RED → 구현 → CSS**

```css
.admin-clubs-ledger { display: grid; grid-template-columns: 38fr 62fr; min-height: calc(100vh - 86px); }
.admin-clubs-ledger__list { border-right: 1px solid var(--line); padding: 32px 0 0; }
.admin-clubs-ledger__list h2 { margin: 0 32px 20px; font-size: 20px; font-weight: 700; }
.admin-clubs-ledger [role="tablist"] { display: flex; gap: 32px; padding: 0 32px; border-bottom: 1px solid var(--line); }
.admin-clubs-ledger [role="tab"] { display: inline-flex; align-items: center; gap: 12px; padding: 0 0 18px; border: 0; background: transparent; font-size: 17px; color: var(--text-2); }
.admin-clubs-ledger [role="tab"][aria-selected="true"] { color: var(--ink-900); font-weight: 700; box-shadow: inset 0 -3px 0 var(--ink-900); }
.admin-clubs-ledger__count { min-width: 40px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 999px; font-size: 14px; text-align: center; }
.admin-clubs-ledger [role="tab"][aria-selected="true"] .admin-clubs-ledger__count { background: var(--ink-900); color: #fff; border-color: var(--ink-900); }
.admin-clubs-ledger__row { display: grid; grid-template-columns: 24px minmax(0,1fr) auto 16px; column-gap: 16px; align-items: center; min-height: 120px; padding: 0 32px; border-bottom: 1px solid var(--line-soft); }
.admin-clubs-ledger__row[aria-selected="true"] { background: color-mix(in oklch, var(--warn) 8%, var(--bg)); box-shadow: inset 4px 0 0 var(--warn); }
.admin-clubs-ledger__detail { padding: 32px 40px; }
.admin-clubs-ledger__facts { display: flex; margin: 16px 0 0; padding: 0; list-style: none; }
.admin-clubs-ledger__facts li { display: inline-flex; align-items: center; gap: 10px; padding: 0 28px; border-left: 1px solid var(--line); font-size: 16px; }
.admin-clubs-ledger__facts li:first-child { padding-left: 0; border-left: 0; }
.admin-clubs-ledger__review li { display: inline-flex; gap: 12px; align-items: center; color: var(--text); }
.admin-clubs-ledger__review li .rm-icon { color: var(--warn); }
```
Task 9에서 `.admin-shell:has(.admin-clubs-ledger)`를 떼고 남긴 본문 규칙은 이 블록으로 통합하고 중복은 삭제.

- [ ] **Step 3: fixture**

`admin-approved-route-fixtures.ts`의 clubs 응답에 클럽 24개 중 `needsReview` 2개, 선택 클럽의 host/member/publicRecord/domain 값을 채운다(가상 값). 숫자는 시안과 같을 필요 없다(C).

- [ ] **Step 4: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-clubs-ledger.test.tsx features/platform-admin/route/admin-clubs-route.test.tsx features/platform-admin/route/admin-clubs-data.test.ts
git add front/features/platform-admin/ui/admin-clubs-ledger.tsx front/features/platform-admin/ui/admin-clubs-ledger.test.tsx front/features/platform-admin/ui/admin-club-management.css front/features/platform-admin/route/admin-clubs-route.tsx front/features/platform-admin/route/admin-clubs-data.ts front/tests/e2e/support/admin-approved-route-fixtures.ts
git commit -m "feat(admin): approved clubs ledger with counted tabs, icon facts, and review section"
```

### Task 20: Admin 서비스 상태 (03)

**Files:**
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`, `admin-health-grid.test.tsx`, `admin-health-card.tsx`
- Modify: `front/features/platform-admin/ui/admin-service-status.css`
- Modify: `front/features/platform-admin/route/admin-health-route.tsx`, `admin-health-data.ts`

**Interfaces:**
- 헤더 상태(Task 8): `대체로 정상이며, 알림 전달을 확인해야 합니다.` + aside `마지막 전체 확인 오늘 14:22`.
- DOM: `section.admin-service-status > table(caption sr-only) > thead(서비스·상태·마지막 확인·영향·조치·(펼침)) > tbody > tr.admin-service-status__row(td 상태는 `svg[data-icon="alert-circle-filled"]`(warn) + 텍스트 또는 조용한 `정상`; 조치 `새로 확인` 버튼; 마지막 td chevron-down/up 버튼 `aria-expanded`) + tr.admin-service-status__expanded > td[colspan=6] > div(`!` + 한 줄 문장 + div.admin-service-status__facts(영향 범위 · 최근 정상 전달 · 복구 조치(버튼 `실패한 안내만 다시 보내기`))) + footer `기술 정보 펼치기` disclosure`.
- 삭제: 페이지 제목 `서비스 건강`, `새로고침` 버튼(행별 `새로 확인`이 대체), `최근에 바뀐 것` 패널(배포 이력은 `기술 정보 펼치기` 안으로).

- [ ] **Step 1: 테스트**

```tsx
it("renders a full-width status table with five columns, quiet ok rows, and an expandable summary", () => {
  render(<AdminHealthGrid view={view} expandedId="notifications" onToggle={vi.fn()} onRecheck={vi.fn()} />);
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["서비스", "상태", "마지막 확인", "영향", "조치", ""]);
  expect(within(screen.getByRole("row", { name: /앱과 API/ })).queryByRole("img")).toBeNull();
  expect(screen.getByRole("button", { name: "알림 상세 접기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("영향 범위").closest(".admin-service-status__facts")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "최근에 바뀐 것" })).toBeNull();
});
```
(정상 행에는 상태 아이콘이 없어야 한다. 아이콘 svg는 `aria-hidden`이므로 `img` role이 잡히지 않는다.)

- [ ] **Step 2: 구현 + CSS**

```css
.admin-service-status { padding: 24px 32px; }
.admin-service-status table { width: 100%; border-collapse: collapse; font-size: 16px; }
.admin-service-status th { padding: 0 0 18px; color: var(--text-2); font-weight: 500; text-align: left; border-bottom: 1px solid var(--line); }
.admin-service-status__row td { padding: 30px 0; border-bottom: 1px solid var(--line-soft); }
.admin-service-status__row td:first-child { font-weight: 600; }
.admin-service-status__status { display: inline-flex; align-items: center; gap: 10px; }
.admin-service-status__status .rm-icon { color: var(--warn); }
.admin-service-status__expanded td { padding: 0 0 24px; }
.admin-service-status__expanded > td > div { padding: 24px 32px; border: 1px solid var(--line); background: color-mix(in oklch, var(--warn) 6%, var(--bg)); }
.admin-service-status__facts { display: grid; grid-template-columns: repeat(3, auto); gap: 32px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--line-soft); justify-content: start; }
.admin-service-status__facts > div + div { padding-left: 32px; border-left: 1px solid var(--line); }
.admin-service-status__facts dt { color: var(--text-2); font-size: 14px; margin-bottom: 8px; }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-health-grid.test.tsx features/platform-admin/ui/admin-health-card.test.tsx features/platform-admin/route/admin-health-route.test.tsx
git add front/features/platform-admin/ui/admin-health-grid.tsx front/features/platform-admin/ui/admin-health-grid.test.tsx front/features/platform-admin/ui/admin-health-card.tsx front/features/platform-admin/ui/admin-service-status.css front/features/platform-admin/route/admin-health-route.tsx front/features/platform-admin/route/admin-health-data.ts
git commit -m "feat(admin): approved service status table with expandable row summary"
```

### Task 21: Admin 처리 기록 (04)

**Files:**
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`, `admin-audit-ledger.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-processing-records.css`
- Modify: `front/features/platform-admin/route/admin-audit-route.tsx`, `admin-audit-data.ts`

**Interfaces:**
- DOM 좌측(38%): `h2 처리 기록 + label.admin-audit__search(svg[data-icon="search"] + input placeholder 기록 찾기) + button.admin-audit__period(`오늘` + chevron-down; 옵션 오늘/이번 주/이번 달/기간 지정 — 기존 날짜 범위 상태를 그대로 쓰되 표시만 라벨) + ul > li.admin-audit__row(svg[data-icon="check-circle"](완료 warn 색 선택 행/기본 text-3) + 제목 + `14:52 · 운영자` + 우측 `정상`)`. 우측(62%): `eyebrow 선택한 기록 + h1(아이콘 `check-circle-filled` warn + 제목) + p 요약 + section.admin-audit__detail-section ×5(처리한 이유·영향 범위·변경 전·변경 후·처리 결과) + 기술 정보 펼치기`.
- 삭제: 페이지 상단 중복 `처리 기록` h1(하나만), 날짜 범위 raw 텍스트, `▶ 기술 정보` details marker(공유 `admin-technical-disclosure` 스타일 사용).

- [ ] **Step 1: 테스트**

```tsx
it("renders search with icon, period filter, status-iconed rows, and five detail sections", () => {
  render(<AdminAuditLedger view={view} onSelect={vi.fn()} onPeriodChange={vi.fn()} onSearch={vi.fn()} />);
  expect(screen.getByRole("searchbox", { name: "기록 찾기" }).closest(".admin-audit__search")?.querySelector('[data-icon="search"]')).toBeTruthy();
  expect(screen.getByRole("button", { name: /오늘/ })).toHaveClass("admin-audit__period");
  expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  expect(document.querySelectorAll(".admin-audit__detail-section")).toHaveLength(5);
  expect(document.querySelectorAll('.admin-audit__row [data-icon="check-circle"]').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 구현 + CSS**

```css
.admin-audit { display: grid; grid-template-columns: 38fr 62fr; }
.admin-audit__list { border-right: 1px solid var(--line); padding: 32px 0 0; }
.admin-audit__list h2 { margin: 0 32px 20px; font-size: 20px; font-weight: 700; }
.admin-audit__search { display: flex; align-items: center; gap: 12px; margin: 0 32px 16px; padding: 0 16px; min-height: 48px; border: 1px solid var(--line); border-radius: 8px; }
.admin-audit__search input { flex: 1; border: 0; background: transparent; font-size: 16px; }
.admin-audit__period { display: inline-flex; align-items: center; gap: 6px; margin: 0 32px 20px; border: 0; background: transparent; color: var(--accent); font-size: 16px; }
.admin-audit__row { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; column-gap: 16px; align-items: center; min-height: 112px; padding: 0 32px; border-bottom: 1px solid var(--line-soft); }
.admin-audit__row[aria-selected="true"] { background: color-mix(in oklch, var(--warn) 8%, var(--bg)); box-shadow: inset 4px 0 0 var(--warn); }
.admin-audit__row[aria-selected="true"] .rm-icon { color: var(--warn); }
.admin-audit__detail { padding: 32px 40px; }
.admin-audit__detail h1 { display: flex; align-items: center; gap: 16px; font-size: 24px; }
.admin-audit__detail h1 .rm-icon { color: var(--warn); }
.admin-audit__detail-section { padding: 20px 0; border-bottom: 1px solid var(--line-soft); }
.admin-audit__detail-section h3 { margin: 0 0 8px; font-size: 17px; font-weight: 700; }
```

- [ ] **Step 3: GREEN, Phase 3 재캡처, 커밋**

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-audit-ledger.test.tsx features/platform-admin/route/admin-audit-route.test.tsx
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker -- features/platform-admin
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```
펀치 리스트 `3단계` 열에 admin 7 id의 `pct`/`structurePass`를 적는다. 02·03·04 화면별 rule은 `passed:true`. Admin geometry 상수(`ADMIN_LEDGER_*`, `ADMIN_SERVICE_TABLE_GEOMETRY`)는 새 구성 실측으로 갱신하고, 사람이 reference와 나란히 검토한 뒤 admin CT snapshot을 update mode로 갱신한다.

```bash
git add front/features/platform-admin/ui/admin-audit-ledger.tsx front/features/platform-admin/ui/admin-audit-ledger.test.tsx front/features/platform-admin/ui/admin-processing-records.css front/features/platform-admin/route/admin-audit-route.tsx front/features/platform-admin/route/admin-audit-data.ts front/tests/e2e/support/approved-route-geometry.ts docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git commit -m "feat(admin): approved processing-records ledger and phase 3 recapture"
```

---

## Phase 4 — Host 원장 6장 (10·11·12·13·14·17)

Step 0은 Phase 3과 같다(구조 계약 RED 확인, reference/candidate 나란히 검토, 펀치 리스트 갱신). 모든 Task는 `HOST_DESKTOP_SHELL`/`HOST_MOBILE_SHELL` rule이 이미 GREEN인 상태(Phase 1)에서 시작한다.

### Task 22: 일정과 모임 (10)

**Files:**
- Modify: `front/features/host/ui/meeting-list/host-meeting-list.tsx`, `host-meeting-list.test.tsx`, `meeting-toc.css`
- Modify: `front/features/host/route/host-meeting-list-route.tsx`
- Modify: `front/tests/e2e/support/host-approved-route-fixtures.ts:230-265` (No.28 중복 제거)

**Interfaces:**
- DOM: `header.rm-meeting-toc__header(h1 일정과 모임 + p + div.rm-meeting-toc__view-toggle(button 목록 svg[data-icon="list"] · button 달력 svg[data-icon="calendar"]) + div.rm-meeting-toc__filters[role=tablist](전체·준비 중·마감 필요·게시됨 underline))` + `section 다가오는 모임(table 모임·일정·상태·요약·작업; 행 60px; `No. 28 · 제목`; 일정 2줄(날짜 / D-3); 상태 `span.rm-meeting-toc__status-dot[data-tone]` + 문구; 요약 `일정 확인 8/12 · 응답 9/12` 숫자 초록; 작업 링크 + chevron; 현재 모임 행 좌측 accent 바 + 배경)` + `section 지난 모임(같은 표)` + `footer.rm-meeting-toc__footer(총 N개의 모임 · 말소된 모임 보기 ›)` + 우측 `aside 이번 달(h2 + 9월 + ol.rm-meeting-toc__timeline(li: dot + 날짜 + 배지 `현재 모임`/`다음 모임` + No · 제목) + a 달력에서 보기(calendar 아이콘 + chevron))`.
- 삭제: `새 모임 만들기` 페이지 버튼(헤더 유틸 `새 모임`이 canonical), breadcrumb `호스트 · 예정과 기록`.
- 요약 열 값은 route가 `HostSessionListPage` 항목의 `liveRevision`/응답 집계로 계산; 집계가 없으면 `장소 확인 필요`/`책만 정해짐` 같은 기존 상태 문구.

- [ ] **Step 1: fixture 결함 수정**

`buildHostApprovedMeetingList`에서 지난 모임 목록(`approvedMeetingSections.past` 또는 records 기반)이 `HOST_APPROVED_SESSION_ID`(No.28)를 포함하지 않도록 필터하고 unit(`host-approved-route-fixtures.test.ts`)에 `expect(past.map(r => r.sessionNumber)).not.toContain(28)`을 추가한다.

- [ ] **Step 2: 컴포넌트 테스트**

```tsx
it("renders view toggle icons, underline filters, dot statuses, timeline, and footer without a page create button", () => {
  render(<HostMeetingList view={view} />);
  expect(document.querySelectorAll(".rm-meeting-toc__view-toggle [data-icon]")).toHaveLength(2);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(document.querySelectorAll(".rm-meeting-toc__status-dot").length).toBeGreaterThan(0);
  expect(document.querySelector(".rm-meeting-toc__timeline")).toBeTruthy();
  expect(screen.getByText(/총 \d+개의 모임/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "새 모임 만들기" })).toBeNull();
});
```

- [ ] **Step 3: 구현 + CSS**

```css
.rm-meeting-toc { padding: 32px 32px 40px; display: grid; grid-template-columns: minmax(0, 1fr) 340px; column-gap: 48px; }
.rm-meeting-toc__header { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; column-gap: 48px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.rm-meeting-toc__header h1 { font-size: 32px; margin: 0 0 8px; }
.rm-meeting-toc__view-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.rm-meeting-toc__view-toggle button { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 20px; border: 0; background: transparent; font-size: 16px; }
.rm-meeting-toc__view-toggle button[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--accent); color: var(--accent); }
.rm-meeting-toc__filters { display: flex; gap: 40px; }
.rm-meeting-toc__filters [role="tab"] { padding: 0 8px 12px; border: 0; background: transparent; font-size: 17px; color: var(--text-2); }
.rm-meeting-toc__filters [role="tab"][aria-selected="true"] { color: var(--accent); font-weight: 700; box-shadow: inset 0 -3px 0 var(--accent); }
.rm-meeting-toc table { width: 100%; border-collapse: collapse; font-size: 16px; }
.rm-meeting-toc th { padding: 12px 16px; color: var(--text-2); font-size: 14px; font-weight: 500; text-align: left; border-bottom: 1px solid var(--line); }
.rm-meeting-toc td { padding: 18px 16px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.rm-meeting-toc tr[data-current="true"] { background: color-mix(in oklch, var(--accent) 6%, var(--bg)); box-shadow: inset 4px 0 0 var(--accent); }
.rm-meeting-toc__status-dot { display: inline-block; width: 8px; height: 8px; margin-right: 10px; border-radius: 50%; background: var(--text-4); }
.rm-meeting-toc__status-dot[data-tone="warn"] { background: var(--warn); } .rm-meeting-toc__status-dot[data-tone="ok"] { background: var(--ok); } .rm-meeting-toc__status-dot[data-tone="info"] { background: var(--accent); }
.rm-meeting-toc__footer { display: flex; justify-content: space-between; padding: 20px 16px 0; color: var(--text-2); }
.rm-meeting-toc__timeline { list-style: none; margin: 16px 0 0; padding: 0 0 0 28px; border-left: 2px solid var(--line); }
.rm-meeting-toc__timeline li { position: relative; padding-bottom: 32px; }
.rm-meeting-toc__timeline li::before { content: ""; position: absolute; left: -35px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); }
.rm-meeting-toc__timeline li[data-next="true"]::before { background: var(--bg); border: 2px solid var(--text-3); }
```

- [ ] **Step 4: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/meeting-list features/host/route/host-meeting-list-route.test.tsx tests/e2e/support/host-approved-route-fixtures.test.ts
git add front/features/host/ui/meeting-list front/features/host/route/host-meeting-list-route.tsx front/tests/e2e/support/host-approved-route-fixtures.ts front/tests/e2e/support/host-approved-route-fixtures.test.ts
git commit -m "feat(host): approved meetings ledger with view toggle, filters, timeline; fix duplicate current row"
```

### Task 23: 사람 (11)

**Files:**
- Modify: `front/features/host/ui/members/member-list.tsx`, `member-list.test.tsx`, `member-ledger.css`
- Modify: `front/features/host/ui/host-members.tsx`, `host-members.test.tsx`
- Modify: `front/features/host/route/host-members-route.tsx`

**Interfaces:**
- DOM: `header(h1 사람 + p + label 검색(svg[data-icon="search"]) + div.rm-member-ledger__segments(전체 15 · 활동 12 · 둘러보기 2 · 쉬는 중 1 — 첫 세그먼트 채움))` + `section.rm-member-ledger__pending(h2 가입 승인 대기 N명 + 안내 문장 + ul > li.rm-member-ledger__pending-row(avatar 44 · 이름 · 경로 · 시각 · a 검토) + 우측 btn-primary 가입 승인 검토)` + `section.rm-member-ledger(h2 멤버 원장 + `현재 일정 기준 · 오늘 14:20` + table 멤버·상태·최신 일정·참석 응답·최근 접속·함께한 기간·관리(row: avatar+이름 · 상태 pill(활동 초록 테두리/둘러보기 파랑/쉬는 중 회색, 텍스트 pill 하나만) · span.rm-member-ledger__schedule(svg calendar|mail|minus-circle + 문구) · span.rm-member-ledger__rsvp(svg check-circle ok|question-circle|x-circle danger|— ) · 최근 접속 · 기간 · a.rm-member-ledger__open 열기 + chevron))` + `aside(h2 현재 일정 확인 + ul.rm-member-ledger__rail(li.rm-member-ledger__rail-row ×4: svg + 라벨 + 우측 숫자) + a 미열람 멤버 보기 › + p.info(svg info + 최근 접속은 클럽 공간 기준…))`.
- 삭제: 행 내 `이름 변경`·`모임 제외`·`…`(사람 상세 route가 소유), `이번 모임 참여` 초록 배지, 가입 승인 카드 배경/테두리, 우측 rail의 설명 문단 2개.
- rail 4행 값은 route가 members 목록에서 `scheduleSeen` 집계(`현재 일정 확인`/`변경 전 확인`/`미열람`/`대상 아님`).

- [ ] **Step 1: 테스트**

```tsx
it("renders flat pending rows, icon schedule/rsvp cells, a single open link per row, and a 4-row rail", () => {
  render(<HostMembers view={view} />);
  expect(document.querySelectorAll(".rm-member-ledger__pending-row").length).toBeGreaterThan(0);
  expect(document.querySelectorAll(".rm-member-ledger__schedule [data-icon]").length).toBeGreaterThan(0);
  expect(document.querySelectorAll(".rm-member-ledger__rsvp [data-icon]").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: /열기/ }).length).toBe(view.members.length);
  expect(document.querySelectorAll(".rm-member-ledger__rail-row")).toHaveLength(4);
  expect(screen.queryByRole("button", { name: /이름 변경/ })).toBeNull();
  expect(screen.queryByText("이번 모임 참여")).toBeNull();
});
```

- [ ] **Step 2: 구현 + CSS 요점**

```css
.rm-host-people { padding: 32px 32px 40px; }
.rm-member-ledger__segments { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.rm-member-ledger__segments button { min-height: 48px; padding: 0 20px; border: 0; border-left: 1px solid var(--line); background: transparent; font-size: 16px; }
.rm-member-ledger__segments button:first-child { border-left: 0; }
.rm-member-ledger__segments button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.rm-member-ledger__pending { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 48px; align-items: start; padding: 24px 0; border-bottom: 1px solid var(--line); }
.rm-member-ledger__pending-row { display: grid; grid-template-columns: 44px minmax(0,1fr) auto auto; column-gap: 16px; align-items: center; min-height: 56px; border-bottom: 1px solid var(--line-soft); }
.rm-member-ledger table td { padding: 16px 12px; border-bottom: 1px solid var(--line-soft); }
.rm-member-ledger__pill { display: inline-block; padding: 4px 12px; border: 1px solid var(--ok); border-radius: 4px; color: var(--ok); font-size: 14px; background: color-mix(in oklch, var(--ok) 8%, var(--bg)); }
.rm-member-ledger__pill[data-tone="info"] { border-color: var(--accent); color: var(--accent); background: color-mix(in oklch, var(--accent) 8%, var(--bg)); }
.rm-member-ledger__pill[data-tone="neutral"] { border-color: var(--line); color: var(--text-2); background: transparent; }
.rm-member-ledger__schedule, .rm-member-ledger__rsvp { display: inline-flex; align-items: center; gap: 10px; }
.rm-member-ledger__rsvp [data-icon="check-circle"] { color: var(--ok); } .rm-member-ledger__rsvp [data-icon="x-circle"] { color: var(--danger); }
.rm-member-ledger__rail-row { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; column-gap: 14px; align-items: center; min-height: 64px; border-bottom: 1px solid var(--line-soft); }
.rm-member-ledger__rail-row .rm-icon { color: var(--accent); }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/members features/host/ui/host-members.test.tsx features/host/route/host-members-route.test.tsx
git add front/features/host/ui/members front/features/host/ui/host-members.tsx front/features/host/ui/host-members.test.tsx front/features/host/route/host-members-route.tsx
git commit -m "feat(host): approved people ledger with icon cells, flat pending rows, and schedule rail"
```

### Task 24: 기록 (12)

**Files:**
- Modify: `front/features/host/ui/host-session-ledger.tsx`, `host-session-ledger.test.tsx`
- Create: `front/features/host/ui/host-session-ledger.css` (708행 파일의 인라인 스타일을 여기로)
- Modify: `front/features/host/route/host-session-ledger-route.tsx`

**Interfaces:**
- DOM: `header(h1 기록 + p)` + `div.rm-record-ledger__tabs[role=tablist](전체 · 마감 필요 2(danger) · 작성 중 1(warn) · 게시됨 18(ok) underline) + a.rm-record-ledger__export(svg[data-icon="export"] 내보내기)` + `section.rm-record-ledger__next(ReadmatesIconBadge alert-circle warn 40 + eyebrow 다음에 마감할 기록 + h2 + facts 문장 + btn-primary 마감실 열기)` + `section.rm-record-ledger(h2 기록 원장 + table 모임·출석·소감·기록 초안·피드백 문서·게시·작업; 값 색: 작성 중 warn, 확인 필요 warn, 완료 ok, 초안 없음/미등록/마감 필요 danger, 게시 준비 accent; 작업 `button.btn-outline`)` + `aside.rm-record-ledger__rail(h2 마감 작업 + 워크박스 탭 지금/보류/완료 + ul.rm-host-workbox__items > HostWorkItem(Task 12 행) ×N)` + `footer.rm-record-ledger__footer(svg check-circle ok + `7월 30일 · No. 26 기록 게시됨` + a 게시 이력 ›)`.
- rail은 `HostWorkbox`를 `title="마감 작업"`, 항목은 `RECORD_CLOSING`/`NOTIFICATION_FAILURE` 종류만 필터한 view로 재사용(route가 필터).
- 삭제: segmented 버튼 탭, 요약 카운트 3행(rail이 대체), `세부 조작`.

- [ ] **Step 1: 테스트**

```tsx
it("renders underline tabs with toned counts, export icon, next-closing banner, work rows in rail, and publish footer", () => {
  render(<HostSessionLedger view={view} workbox={workboxView} />);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("link", { name: "내보내기" }).querySelector('[data-icon="export"]')).toBeTruthy();
  expect(document.querySelector(".rm-record-ledger__next .rm-icon-badge")).toBeTruthy();
  expect(document.querySelectorAll(".rm-record-ledger__rail .rm-host-work-item").length).toBeGreaterThan(0);
  expect(document.querySelector(".rm-record-ledger__footer")).toBeTruthy();
});
```

- [ ] **Step 2: 구현 + CSS 요점**

```css
.rm-record-ledger { padding: 32px 32px 0; display: grid; grid-template-columns: minmax(0,1fr) 400px; column-gap: 48px; }
.rm-record-ledger__tabs { display: flex; gap: 40px; border-bottom: 1px solid var(--line); }
.rm-record-ledger__tabs [role="tab"] { display: inline-flex; gap: 10px; padding: 0 4px 14px; border: 0; background: transparent; font-size: 17px; color: var(--text-2); }
.rm-record-ledger__tabs [role="tab"] .rm-record-ledger__count[data-tone="danger"] { color: var(--danger); } /* warn, ok 동일 패턴 */
.rm-record-ledger__tabs [role="tab"][aria-selected="true"] { color: var(--accent); font-weight: 700; box-shadow: inset 0 -3px 0 var(--accent); }
.rm-record-ledger__next { display: grid; grid-template-columns: 40px minmax(0,1fr) auto; column-gap: 24px; align-items: center; padding: 24px 0; border-bottom: 1px solid var(--line); }
.rm-record-ledger__next h2 { margin: 4px 0; font-size: 20px; }
.rm-record-ledger table td { padding: 20px 12px; border-bottom: 1px solid var(--line-soft); }
.rm-record-ledger td[data-tone="warn"] { color: var(--warn); } .rm-record-ledger td[data-tone="ok"] { color: var(--ok); } .rm-record-ledger td[data-tone="danger"] { color: var(--danger); } .rm-record-ledger td[data-tone="accent"] { color: var(--accent); }
.rm-record-ledger__footer { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; margin-top: 24px; padding: 24px 0; border-top: 1px solid var(--line); }
.rm-record-ledger__footer a { margin-left: auto; color: var(--accent); font-weight: 600; }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/host-session-ledger.test.tsx features/host/route/host-session-ledger-route.test.tsx
git add front/features/host/ui/host-session-ledger.tsx front/features/host/ui/host-session-ledger.test.tsx front/features/host/ui/host-session-ledger.css front/features/host/route/host-session-ledger-route.tsx
git commit -m "feat(host): approved records ledger with toned tabs, next-closing banner, and work rail"
```

### Task 25: 초대와 설정 (13)

**Files:**
- Modify: `front/features/host/ui/host-invitations.tsx`, `settings/host-invitation-links.tsx`, `settings/host-club-settings.tsx` + tests
- Modify: `front/features/host/route/host-settings-route.tsx`
- Create: `front/features/host/ui/settings/host-settings.css`

**Interfaces:**
- DOM: `header.rm-host-settings__header(h1 초대와 설정 + p + a.btn.btn-primary 새 초대 링크)` + 좌측 `section.rm-host-invitations(h2 초대 링크 + p + div.rm-host-invitations__tabs[role=tablist](활성 2 · 만료 예정 1 · 중지 1 underline) + table 이름·상태(dot+문구; 활성 ok/만료 예정 warn/중지 danger)·사용·만료·관리(`링크 보기 | 복사`, `연장 | 중지`, `이력` — 구분선 `|`) + a 만료·중지된 링크 보기 + p(svg clock + `오늘 11:04 · 친구 추천 링크가 사용됨`))` + 우측 `section.rm-host-settings(h2 클럽 설정 + dl 행(라벨 · 값 · a 수정/변경/설정) + h3 권한과 운영 + 행 2개 + a.rm-host-settings__end(클럽 운영 종료 danger + 설명 + chevron))`.
- 삭제: `revision 4`, `설정 저장`(행별 변경 링크가 각 편집 route로 감), `종료 검토` 텍스트 버튼(`__end` 행으로 통합), 탭 행 안의 `새 초대 링크` 버튼(헤더로), `세부 조작`.

- [ ] **Step 1: 테스트**

```tsx
it("puts the create CTA in the page header, underline link tabs, and a club-end row", () => {
  render(<HostSettingsPage view={view} />);
  expect(document.querySelector(".rm-host-settings__header .btn-primary")).toHaveTextContent("새 초대 링크");
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(document.querySelector(".rm-host-settings__end")).toHaveTextContent("클럽 운영 종료");
  expect(screen.queryByText(/revision/)).toBeNull();
  expect(screen.queryByRole("button", { name: "설정 저장" })).toBeNull();
});
```

- [ ] **Step 2: 구현 + CSS 요점**

```css
.rm-host-settings-page { padding: 32px 32px 40px; display: grid; grid-template-columns: minmax(0,1fr) 560px; column-gap: 48px; }
.rm-host-settings__header { grid-column: 1 / -1; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.rm-host-settings__header .btn-primary { margin-top: 20px; min-height: 52px; padding: 0 24px; }
.rm-host-invitations__tabs { display: flex; gap: 40px; border-bottom: 1px solid var(--line); margin-top: 20px; }
.rm-host-invitations table td { padding: 20px 12px; border-bottom: 1px solid var(--line-soft); }
.rm-host-invitations__manage a + a::before { content: "|"; margin: 0 12px; color: var(--line); }
.rm-host-settings dl div { display: grid; grid-template-columns: 180px minmax(0,1fr) auto; align-items: center; min-height: 56px; border-bottom: 1px solid var(--line-soft); }
.rm-host-settings dl a { color: var(--accent); font-weight: 600; }
.rm-host-settings__end { display: grid; grid-template-columns: minmax(0,1fr) 24px; align-items: center; padding: 24px 0; border-top: 1px solid var(--line); color: var(--danger); font-weight: 600; text-decoration: none; }
.rm-host-settings__end p { margin: 4px 0 0; color: var(--text-2); font-weight: 400; font-size: 14px; }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/settings features/host/ui/host-invitations.test.tsx features/host/route/host-settings-route.test.tsx features/host/route/host-invitations-route.test.tsx
git add front/features/host/ui/settings front/features/host/ui/host-invitations.tsx front/features/host/ui/host-invitations.test.tsx front/features/host/route/host-settings-route.tsx
git commit -m "feat(host): approved invites and settings utility composition"
```

### Task 26: 일정 미열람 안내 (14)

**Files:**
- Modify: `front/features/host/ui/schedule-review/host-schedule-review-header.tsx`, `host-schedule-review-page.tsx`, `host-schedule-review.css`, tests
- Modify: `front/features/host/ui/notifications/manual-notification-preview.tsx`
- Modify: `front/features/host/route/host-schedule-review-route.tsx`

**Interfaces:**
- 좌측: `nav.rm-schedule-review__breadcrumb(운영실 / 일정 미열람 확인)` + `h1 일정 미열람 안내` + p + `p.rm-schedule-review__revision(svg clock + 현재 일정 revision N · 어제 19:30 변경)` + `section 변경 내용(table.rm-schedule-review__changes: 시작 시간 `오후 7:00 → 오후 7:30`(→는 svg arrow-right, 새 값 accent) / 장소 `을지로 복살롱 · 변경 없음` / 변경 사유)` + `section 안내 대상 N명(+ `현재 일정 확인 M명은 자동으로 제외했어요` + table.rm-schedule-review__targets(thead: checkbox·이름·최신 일정 상태(svg info)·최근 클럽 접속; tbody: checkbox·avatar+이름·dot+상태·접속) + div.rm-schedule-review__select-all(checkbox 전체 선택 + a.rm-schedule-review__excluded 제외된 M명 보기 ›)` + `p.info(svg info + 최근 접속은 클럽 공간 기준이며 페이지별 활동은 표시하지 않아요.)`.
- 우측: `h2 보낼 안내` + dl(대상 `선택한 N명` / 전달 방식) + label 제목 input + label 본문 textarea(우하단 `span.rm-schedule-review__counter 72 / 140`) + checkbox `변경 내용 포함` + div(btn-primary `N명에게 안내 보내기` + button.rm-schedule-review__defer(svg clock + 내일 09:00까지 보류)) + a.rm-schedule-review__cancel 취소하고 운영실로 + p.info(자동 발송하지 않아요…) + footer(svg clock + 이전 안내 없음 · a 변경 이력).
- 변경 diff의 이전 값은 route가 `HostSessionDetailResponse`의 이전 revision 정보에서 얻는다. 서버가 이전 값을 주지 않으면 `변경 내용` 표는 현재 값 + `변경 없음`만 보여주고 펀치 리스트에 C로 기록한다(서버 API 변경은 비범위).
- `알림 미리보기` 버튼은 유지되되 `보내기` 앞 단계로 흐름을 바꾸지 않는다(기존 `preview` POST 1건 계약 유지: request audit `p1`).

- [ ] **Step 1: 테스트**

```tsx
it("renders breadcrumb, change table, target table header, select-all, counter, defer, and cancel", () => {
  render(<HostScheduleReviewPage view={view} />);
  expect(document.querySelector(".rm-schedule-review__breadcrumb")).toHaveTextContent("운영실");
  expect(document.querySelector(".rm-schedule-review__changes")).toBeTruthy();
  expect(document.querySelector(".rm-schedule-review__targets thead")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "전체 선택" })).toBeTruthy();
  expect(screen.getByText(/\/ 140/)).toHaveClass("rm-schedule-review__counter");
  expect(screen.getByRole("button", { name: "내일 09:00까지 보류" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "취소하고 운영실로" })).toBeTruthy();
});
```

- [ ] **Step 2: 구현 + CSS 요점**

```css
.rm-schedule-review { padding: 24px 40px 40px; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); column-gap: 80px; }
.rm-schedule-review__breadcrumb { grid-column: 1 / -1; color: var(--text-2); font-size: 15px; margin-bottom: 24px; }
.rm-schedule-review h1 { font-size: 32px; margin: 0 0 8px; }
.rm-schedule-review__changes td, .rm-schedule-review__targets td, .rm-schedule-review__targets th { padding: 14px 8px; border-bottom: 1px solid var(--line-soft); text-align: left; }
.rm-schedule-review__changes td:first-child { color: var(--text-2); width: 140px; }
.rm-schedule-review__changes [data-new] { color: var(--accent); font-weight: 600; }
.rm-schedule-review__select-all { display: flex; justify-content: space-between; padding: 16px 8px 0; }
.rm-schedule-review textarea { min-height: 180px; }
.rm-schedule-review__counter { display: block; text-align: right; color: var(--text-3); font-size: 14px; margin-top: -32px; padding-right: 16px; }
.rm-schedule-review__actions { display: flex; gap: 24px; margin-top: 24px; }
.rm-schedule-review__actions .btn-primary { min-height: 52px; padding: 0 44px; }
.rm-schedule-review__defer { display: inline-flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 28px; border: 1px solid var(--accent); border-radius: 4px; background: transparent; color: var(--accent); font-weight: 600; }
```

- [ ] **Step 3: GREEN + 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/schedule-review features/host/ui/notifications features/host/route/host-schedule-review-route.test.tsx
git add front/features/host/ui/schedule-review front/features/host/ui/notifications/manual-notification-preview.tsx front/features/host/route/host-schedule-review-route.tsx
git commit -m "feat(host): approved unread-schedule review composition"
```

### Task 27: 모바일 사람 상세 (17), Phase 4 재캡처

**Files:**
- Modify: `front/features/host/ui/person/host-person-detail.tsx`, `host-person-detail.css`, `host-person-detail.test.tsx`
- Modify: `front/features/host/route/host-person-detail-route.tsx`
- Modify: `front/tests/e2e/support/approved-route-geometry.ts` (Phase 4 host 6 id 실측 갱신)

**Interfaces:**
- DOM: `a.rm-person-detail__back(svg arrow-left + 사람)` + `header(avatar 108px + span.rm-person-detail__folio(FOLIO · 017) + h1 이름 + p(활동 ok · 11개월) + p(2025년 10월 가입 · 초대 링크로 참여) + button.rm-person-detail__more(svg more, aria-label 더 보기))` + `section.rm-person-detail__section ×4(번호 01–04 + h2; 01 현재 일정: svg calendar + 모임 · 일시, `svg alert-circle warn + 변경 전 확인`, revision 3줄, info 문장(svg info), 링크 2개(일정 안내 검토 › / 변경 이력 보기 ›); 02 참석 응답: svg question-circle warn + 미응답 + 최종 응답 없음 + a 응답 내역 ›; 03 실제 출석: 행 4개(날짜 · 제목 · 우측 svg check-circle ok 참석 / question-circle 미확인 / x-circle danger 불참) + a 전체 출석 보기 ›; 04 멤버십: `초대 링크 · 2025.10.03 · 활동 중 · 멤버` + chevron-down 펼침 + a 멤버 정보 관리 ›)`.
- `__more`는 기존 `세부 조작`(이름 변경·모임 제외 등)을 메뉴로 옮긴 것이다(route가 소유하는 dialog/menu, 시안 `…`).
- 삭제: `사람 관리 원장으로` 링크, `세부 조작` 텍스트.

- [ ] **Step 1: 테스트**

```tsx
it("renders back row, folio, section icons, attendance state icons, and a more menu without leaked ops text", () => {
  render(<HostPersonDetail view={view} />);
  expect(document.querySelector('.rm-person-detail__back [data-icon="arrow-left"]')).toBeTruthy();
  expect(document.querySelector(".rm-person-detail__folio")).toHaveTextContent(/FOLIO/);
  expect(document.querySelectorAll(".rm-person-detail__section [data-icon]").length).toBeGreaterThanOrEqual(3);
  expect(screen.getByRole("button", { name: "더 보기" }).querySelector('[data-icon="more"]')).toBeTruthy();
  expect(screen.queryByText("세부 조작")).toBeNull();
  expect(screen.queryByText("사람 관리 원장으로")).toBeNull();
});
```

- [ ] **Step 2: 구현 + CSS 요점**

```css
.rm-person-detail { padding: 0 16px 24px; }
.rm-person-detail__back { display: inline-flex; align-items: center; gap: 12px; min-height: 48px; color: var(--text); font-size: 17px; text-decoration: none; }
.rm-person-detail__header { display: grid; grid-template-columns: 108px minmax(0,1fr) 44px; column-gap: 20px; padding: 16px 0 24px; border-bottom: 1px solid var(--line); }
.rm-person-detail__folio { color: var(--text-3); font-size: 12px; letter-spacing: .08em; }
.rm-person-detail__header h1 { margin: 4px 0; font-size: 28px; }
.rm-person-detail__section { display: grid; grid-template-columns: 32px minmax(0,1fr); column-gap: 12px; padding: 24px 0; border-bottom: 1px solid var(--line-soft); }
.rm-person-detail__section > span { color: var(--text-3); font-size: 14px; padding-top: 4px; }
.rm-person-detail__section h2 { margin: 0 0 16px; font-size: 20px; }
.rm-person-detail__row { display: flex; align-items: center; gap: 10px; min-height: 40px; }
.rm-person-detail__row[data-tone="warn"] { color: var(--warn); }
.rm-person-detail__links { display: flex; gap: 32px; margin-top: 16px; }
.rm-person-detail__links a { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; }
.rm-person-detail__attendance li { display: grid; grid-template-columns: minmax(0,1fr) auto; min-height: 56px; align-items: center; border-bottom: 1px solid var(--line-soft); }
.rm-person-detail__attendance [data-tone="ok"] { color: var(--ok); } .rm-person-detail__attendance [data-tone="danger"] { color: var(--danger); }
```

- [ ] **Step 3: GREEN, Phase 4 재캡처, 기록, 커밋**

```bash
pnpm --dir front exec vitest run features/host/ui/person features/host/route/host-person-detail-route.test.tsx
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker -- features/host
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```
펀치 리스트 `4단계` 열에 18 id의 `pct`/`structurePass`를 적는다. 목표는 `structurePass` 18/18 true. host 6 id geometry 상수를 실측으로 갱신하고 사람이 검토한 뒤 host CT snapshot을 update mode로 갱신한다.

```bash
git add front/features/host/ui/person front/features/host/route/host-person-detail-route.tsx front/tests/e2e/support/approved-route-geometry.ts docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git commit -m "feat(host): approved mobile person detail and phase 4 recapture"
```

---

## Phase 5 — 테스트·카피 정직성 (Phase 1 이후 언제든 병렬)

### Task 28: Today spec과 액션 카피

**Files:**
- Modify: `front/tests/e2e/admin-today.spec.ts:159-239`
- Modify: `front/features/platform-admin/ui/admin-operation-state-actions.tsx:12-16` + test
- Modify: `front/features/platform-admin/model/platform-admin-operations-model.ts` (케이스별 CTA 카피 view model)
- Modify: `front/DESIGN.md` (Today 액션 카피 문단)

**Interfaces:**
- `APPROVED_TODAY_ACTION_COPY`를 삭제하고 `actionCopyFor(kind: AdminOperationCase["kind"], action: LifecycleAction): string`을 model에 둔다. 알림 지연 케이스: `ACKNOWLEDGE → 다시 보내기 검토`, `SNOOZE → 30분 뒤 다시 보기`, `RESOLVE → 자세히 보기`(시안 01). 그 외 케이스: 서버 액션 의미 그대로 `확인함` / `잠시 미룸` / `처리함`. 버튼의 `aria-label`은 항상 서버 의미(`확인함` 등)를 포함해 spec의 `getByRole("button", { name: "확인함" })`이 안정적으로 잡히게 한다(예: `aria-label="확인함 · 다시 보내기 검토"`는 금지, 대신 `<button aria-describedby>`로 시안 카피를 시각 텍스트로 두고 `aria-label`은 서버 의미).

- [ ] **Step 1: model 테스트**

```ts
it("uses mockup copy only for notification-delay cases and server meaning elsewhere", () => {
  expect(actionCopyFor("NOTIFICATION_DELAY", "ACKNOWLEDGE")).toBe("다시 보내기 검토");
  expect(actionCopyFor("PUBLIC_RECORD_REVIEW", "ACKNOWLEDGE")).toBe("확인함");
});
```

- [ ] **Step 2: spec 정합**

`admin-today.spec.ts`의 `getByRole("heading", { name: "오늘 할 일" })`을 `getByRole("heading", { level: 1, name: "오늘 할 일" })`로, `getByRole("button", { name: "확인함" })`은 `aria-label` 기반으로 유지. 로컬 실행:
```bash
pnpm --dir front exec playwright test tests/e2e/admin-today.spec.ts --project=chromium --retries=0
```
Expected: 통과. 실패하면 spec을 제품 의미에 맞게 고치되 시안 카피에 맞추지 않는다.

- [ ] **Step 3: DESIGN.md 문단**

`front/DESIGN.md` Editorial Operations Ledger 절의 Today 액션 설명을 "서버 `allowedActions` 의미(`확인함`·`잠시 미룸`·`처리함`)가 접근성 이름이고, 알림 지연 케이스만 시안 01 카피를 시각 텍스트로 쓴다"로 고친다.

- [ ] **Step 4: 커밋**

```bash
git add front/tests/e2e/admin-today.spec.ts front/features/platform-admin/ui/admin-operation-state-actions.tsx front/features/platform-admin/ui/admin-operation-state-actions.test.tsx front/features/platform-admin/model/platform-admin-operations-model.ts front/features/platform-admin/model/platform-admin-operations-model.test.ts front/DESIGN.md
git commit -m "fix(admin): scope mockup action copy to notification-delay cases; align today spec"
```

### Task 29: browser smoke 재측정과 CT 겹침 단언

**Files:**
- Modify: `front/tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts` (heading level, 카피)
- Modify: `front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx`, `front/features/host/ui/workbox/host-workbox.ct.tsx`, `front/features/platform-admin/route/admin-shell-layout.ct.tsx` (겹침 단언)

- [ ] **Step 1: smoke 재측정**

```bash
READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:visual-authority-browsers
```
결과(passed/failed 수)를 펀치 리스트 "smoke" 절에 그대로 적는다. 실패 원인이 `오늘 할 일` heading 중복이면 `level: 1`, `클럽`/`운영 처리 기록` heading 이름이면 현재 h1 텍스트(`클럽 찾기`는 h2, 페이지 h1은 없음 → 시안 02에 h1이 없으므로 smoke는 `getByRole("heading", { name: "클럽 찾기" })`)로 고친다. `확인함` enabled는 Task 28로 해결된다.

- [ ] **Step 2: 겹침 단언 헬퍼**

`front/tests/ct/support/expect-no-overlap.ts`(없으면 생성):
```ts
import type { Locator } from "@playwright/experimental-ct-react";
export async function expectNoTextOverlap(container: Locator) {
  const boxes = await container.locator("a, button, strong, span, p, h1, h2, h3").evaluateAll((nodes) =>
    nodes.filter((n) => (n.textContent ?? "").trim().length > 0).map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, t: (n.textContent ?? "").trim().slice(0, 20), depth: (function d(e: Element | null, k = 0): number { return e ? d(e.parentElement, k + 1) : k; })(n) }; }));
  const leaves = boxes.filter((b) => !boxes.some((o) => o !== b && o.depth > b.depth && o.x >= b.x && o.y >= b.y && o.x + o.w <= b.x + b.w + 1 && o.y + o.h <= b.y + b.h + 1));
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    const overlap = a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2;
    if (overlap) throw new Error(`text overlap: "${a.t}" × "${b.t}"`);
  }
}
```
워크박스 행 CT, admin clubs 헤더 CT, admin shell header CT(space switcher 열림)에서 `await expectNoTextOverlap(component)`를 호출한다.

- [ ] **Step 3: 실행 + 커밋**

```bash
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
git add front/tests/e2e/admin-editorial-ledger-browser-smoke.spec.ts front/tests/ct/support/expect-no-overlap.ts front/features/platform-admin/ui/admin-editorial-ledger.ct.tsx front/features/host/ui/workbox/host-workbox.ct.tsx front/features/platform-admin/route/admin-shell-layout.ct.tsx docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md
git commit -m "test(front): re-measure visual-authority browser smoke and assert no text overlap in CT"
```

### Task 30: 최종 게이트, 문서, 정직한 마감 기록

**Files:**
- Modify: `front/DESIGN.md` (suite 표를 이번 측정값으로), `CHANGELOG.md` Unreleased, `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md`, `docs/development/host-redesign-mockups/README.md`(현재 권위 기록 문장), `docs/development/adr/0045-*.md` 검증 절(구현 완료 사실)

- [ ] **Step 1: 전체 게이트**

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front lint
CI=true npx --yes corepack@0.35.0 pnpm --dir front test
CI=true npx --yes corepack@0.35.0 pnpm --dir front build
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts tests/unit/shell-chrome-guards.test.ts
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/admin-today.spec.ts tests/e2e/host-lifecycle-operating-room.spec.ts tests/e2e/host-workbox-stage4.spec.ts --project=chromium --retries=0
```
각 exit code와 숫자를 펀치 리스트 "최종 게이트" 표에 적는다. pixel은 18/18 비율을 그대로 적고, 0.02 초과는 `not_passed_0.02`라고 쓴다. `structurePass`, E/A 잔여, D 잔여를 분리해 적는다.

- [ ] **Step 2: 문서 정합**

`front/DESIGN.md`: 아이콘 primitive 절 추가(ADR-0045 update 인용), suite 표를 Step 1 값으로, Host primary chrome 절에 유틸 5개·헤더 액션 3개·H1 책 제목 규칙 추가. `CHANGELOG.md` Unreleased Changed에 "Admin·Host 셸 크롬을 승인 시안 기본값으로 통합, 아이콘 primitive 도입, route-scoped 셸 override 제거" 한 줄. Fixed에 "host meetings 원장의 현재 모임 중복 표시" 한 줄.

- [ ] **Step 3: 마감 커밋**

```bash
git diff --check -- front/DESIGN.md CHANGELOG.md docs/
git add front/DESIGN.md CHANGELOG.md docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md docs/development/host-redesign-mockups/README.md docs/development/adr/0045-*.md
git commit -m "docs: record admin/host visual fidelity closeout with measured gates"
```

- [ ] **Step 4: 완료 보고에 반드시 넣을 것**

바뀐 표면(frontend UI/route/model, tests, docs; 서버·BFF 없음), 실행한 명령과 exit code, pixel 18/18 비율(그대로), structure 18/18, 남은 E/A 항목과 그 화면, D 잔여, 갱신한 CT snapshot 목록과 검토자, ADR-0045 update / ADR-0053 Proposed 유지, `origin/main` 미푸시. 사람 30초 gate·VoiceOver/Safari·NVDA/Chrome·원격 CI는 `not measured`로 적는다.

---

## Acceptance Matrix 선택

- 선택 row: **UI or runtime state** — desktop/mobile 18 viewport, wrapping, 대표 fixture 밀도(0·3·10건 Admin queue, 0·4·12건 Host workbox는 기존 stress spec `approved-route-stress.spec.ts`가 Phase 1 이후 영향 id로 다시 돈다), 출석 disclose.
- 제외 row와 이유: Actor/authorization·Club context·BFF/OAuth·Persistence·Async/cache·Public projection·Emergency takedown·Host-client rollout — 이 계획은 서버 API, BFF, 권한, 저장 의미를 바꾸지 않고 fixture 값(가상)만 조정한다. 인접 고위험 row인 `모임 lifecycle`은 phase 우선순위(Task 15)가 **표시 순서**만 바꾸고 전이 규칙을 바꾸지 않으므로 제외하되, `host-lifecycle-operating-room.spec.ts`를 Task 12·18·30에서 돌린다.

## Non-goals, Skipped Validation, Follow-ups

- Non-goal: Public·Member 시각, 서버 API, 배포, 승인 PNG 갱신, 0.02 완화, mask, 출석 1행 철회, ADR-0053 Accepted.
- 계획이 자동으로 닫지 않는 것: 사람 30초 discovery, VoiceOver/Safari, NVDA/Chrome, 원격 CI, Chrome 200%. 완료 보고에 `not measured`로 남긴다.
- 서버 follow-up(별도 슬라이스): schedule-review의 이전 revision 값(변경 diff), Host 알림 unread 카운트(현재 `unreadNotifications={0}`), Admin clubs facts 실데이터. 이 값들은 시안에 있으나 서버가 주지 않으면 C로 기록한다.
- Task 3의 구조 계약은 selector 이름을 미리 확정한다. 구현 중 더 나은 이름이 필요하면 **계약 파일과 구현을 같은 커밋에서** 바꾸고 커밋 메시지에 이유를 적는다. 계약을 구현에 맞춰 느슨하게 만들지 않는다.

## Self-Review 기록

- Spec coverage: §4.1 네 원인 → Task 6–12; §4.2 18행 → Task 6–27(각 id 1개 이상); §4.3 sidecar → Global Constraints·Task 6/7 수치; §5.1 분류 → Task 4·12b·18·21·27; §5.2 접근 1–5 → Task 5–12, 13–17, 15(모델); §5.3 결정 4개 → Task 13(H1·액션 3개), Task 10(유틸 5개), Task 2·5·9(아이콘·fork); §5.4 구조 계약 → Task 3; §6 예외 → Global Constraints; §7 1–5 → Task 28·29; §8 금지 → Global Constraints; §9 완료 기준 → Task 30; §10 단계 → Phase 0–5.
- Placeholder scan: "TBD/TODO/나중에" 없음. Task 20 Step 1의 첫 초안에 있던 잘못된 단언 줄은 `within(...).queryByRole("img")` 단언으로 교체됨.
- Type consistency: `ReadmatesIcon`/`ReadmatesIconBadge`/`ReadmatesIconName`/`ReadmatesIconTone`(Task 5) ↔ Task 6·7·10–27 사용 이름 일치. `StructureRule`/`APPROVED_ROUTE_STRUCTURE`/`measureStructure`(Task 3) ↔ harness. `useAdminShellStatus`/`AdminShellStatus`(Task 7) ↔ Task 8. `CurrentMeetingHeaderLinks.previewHref`·`badge`(Task 13) ↔ route. `HostNextActionView.deferLabel`(Task 15) ↔ Task 12 secondary 버튼. `HostWorkboxProps.footerNote`·`title`(Task 17) ↔ Task 24 rail 재사용. `workItemIcon`(Task 12) ↔ Task 24.
