# Quiet Desk 호스트·어드민 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 71장 코드 네이티브 시안을 실제 인증 라우트에서 그대로 재현하고, 시안·구현·검증이 같은 CSS·토큰·픽스처·`data-spec` 계약을 공유하는 파이프라인으로 기존 PNG 픽셀 게이트를 대체한다.

**Architecture:** 시안 생성기(`design/mockups/2026-09-06-quiet-desk/gen`)가 런타임 CSS(`front/shared/styles/quiet-desk.css`)와 토큰을 읽어 아트보드를 만들고, Playwright 추출기가 아트보드에서 `data-spec` 계약 JSON을 뽑는다. 런타임은 프래그먼트와 1:1인 공용 컴포넌트(`front/shared/ui/quiet-desk/`)로 화면을 조립하고, `design-contract.spec.ts`가 실제 라우트를 계약과 비교한다. 슬라이스 0(기반)·1(공유 셸)을 먼저 끝내고, 2~7(화면 묶음)은 독립 실행, 8(레거시 정리)로 닫는다.

**Tech Stack:** React 19, TypeScript, React Router 8, TanStack Query 5, Vite 8, Vitest 4, Playwright 1.61(E2E/CT, pinned Jammy Docker), CSS custom properties, Pretendard Variable(번들), Python 3 + fontTools(시안 생성기만)

**Spec:** `docs/superpowers/specs/2026-09-06-quiet-desk-host-admin-redesign-design.md`

**Plan base:** 로컬 `main` `dab09b66d` (+ 미커밋 `design/mockups/2026-09-06-quiet-desk/`)

**이 문서의 범위:** 슬라이스 0과 1은 태스크 단위로 완전히 적었다. 슬라이스 2~8은 태스크 목록·파일·인터페이스·종료 기준까지 적고, 각 슬라이스를 시작할 때 같은 템플릿으로 상세 계획을 `docs/superpowers/plans/2026-MM-DD-quiet-desk-slice-N.md`에 쓴 뒤 `/pre-sdd-review`를 거친다. 그 상세 계획은 이 문서와 스펙을 함께 읽는다.

## Global Constraints

- 라우트 URL은 바꾸지 않는다. 서버 API·BFF·DB·`availableSpaces`·`allowedActions`·revision·receipt·cursor 계약은 그대로다.
- 시안 전용 CSS는 없다. 컴포넌트 클래스는 `front/shared/styles/quiet-desk.css` 한 파일에 있고 모두 `qd-` 접두를 가진다. `tokens.css`의 `.btn*`, `.badge*`, `.h1~.h4`, `.small`, `.tiny`, `.mono`만 접두 없이 재사용하고 quiet-desk에서 재정의하지 않는다(`.btn-danger`는 quiet-desk가 추가). 생성기 `gen/lib.py`는 이 파일과 `design/system/src/styles/tokens.css`를 읽어 인라인한다.
- `registry.json`·`SCREENS.md`·아트보드는 파이썬 생성기 출력물, `design-contract/<Screen>.json`은 Node 추출기 출력물이다. 어느 쪽도 손으로 고치지 않는다. `implemented`·`interactions`는 `gen/registry.py`의 `IMPLEMENTED`·`INTERACTIONS` 상수에서 나온다.
- `data-spec` 이름은 `역할.화면.영역[.하위]`(소문자·하이픈). 컴포넌트는 이름을 props로 받지 않고 고정으로 낸다. 한 화면에 같은 이름은 한 번.
- 컴포넌트 DOM 골격(태그·클래스·순서)은 대응 프래그먼트와 같다. `aria-*`·`id`·`.rm-sr-only`는 서명에서 제외한다.
- 메뉴 라벨: 멤버 `오늘 · 노트 · 기록`, 호스트 `오늘 · 모임 · 멤버 · 기록` + `설정` + `새 모임`, 어드민 `오늘 · 클럽 · 서비스 · 기록` + `긴급 공개 회수`.
- 용어: `운영실→오늘`, `일정과 모임→모임`, `사람→멤버`, `준비실·현장·마감실→준비 현황·당일 출석·모임 기록`, `다음에 할 일/작업함→할 일`, `초대와 설정→설정`, `마감/정리→기록 작성/게시`, `미열람→아직 안 봄`, `말소→휴지통`, `세부 조작/자세히 보기` 삭제.
- 출석 컨트롤은 `출석 | 불참` 텍스트 두 칸 64×36, 아이콘 없음, 미확인은 둘 다 비움(ADR-0024). 체크박스 20px, 선택 시 `--accent` + 흰 체크 13px stroke 3.
- 밀도: 데스크톱 헤더 64, 원장 행 56(셀 좌우 12, 표 마진 -12), 할 일 행 60, 두 열 62/38; 모바일 헤더 52, `.m-row` 최소 60 + 상하 12, 탭바 64 + safe-area, 컨트롤 최소 44.
- 상태는 색만으로 말하지 않는다. 정상은 조용한 텍스트, 초록 배지 벽 금지.
- 픽셀 비교는 보고용(`docs/reports`)이고 게이트가 아니다. 게이트는 존재·순서·DOM 서명·geometry(±4/±2px)·typography·오버플로·ARIA다.
- 공개 저장소 안전: 실제 멤버 데이터·비밀·사설 도메인·절대 경로 금지. 시안·픽스처 데이터는 `gen/fixtures.json`의 가상 값만.
- 패키지 매니저는 Corepack: `npx --yes corepack@0.35.0 pnpm --dir front ...`. Docker 컨텍스트 `colima-readmates-va`(`DOCKER_CONTEXT=colima-readmates-va`), `docker context use` 금지.
- 매 태스크 시작 전 `git status --short --branch --untracked-files=all`. 파일 단위로만 stage. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 기존 401/403 purge, 409 보존, unknown-outcome 무재시도, receipt/history, 전환 안전(dirty/pending/unknown-outcome) 계약은 손대지 않는다.

---

## File Structure

### 신규

- `front/shared/styles/quiet-desk.css` — 호스트·어드민·공유 셸 컴포넌트 클래스(생성기 `lib.py CSS`의 컴포넌트 부분을 그대로 이관). 토큰 값은 들어 있지 않다.
- `design/mockups/2026-09-06-quiet-desk/gen/fixtures.json` — 시안 데이터. `club`, `meetings[]`, `members[]`, `todos[]`, `admin.cases[]`, `admin.clubs[]`, `admin.services[]`, `admin.audit[]`.
- `design/mockups/2026-09-06-quiet-desk/gen/registry.py` — 아트보드에서 `data-spec` 레지스트리와 `SCREENS.md`를 생성.
- `design/mockups/2026-09-06-quiet-desk/README.md` — 소스 오브 트루스 계층, 빌드 명령, 커밋 규칙.
- `design/mockups/2026-09-06-quiet-desk/.gitignore` — `readmates-quiet-desk.html`, `.venv/`, `*.png`.
- `front/tests/e2e/support/design-contract/registry.json` — 화면 ↔ 라우트 ↔ 뷰포트 ↔ `data-spec[]`.
- `front/tests/e2e/support/design-contract/<Screen>.json` — 추출된 계약(§2.4 형식).
- `front/tests/e2e/support/design-contract-fixtures.ts` — `fixtures.json` → BFF 응답 변환, `installDesignContractFixtures(page, role, variant?)`(auth/me mock 포함).
- `front/tests/e2e/support/expect-no-text-overlap.ts` — `front/tests/ct/support/expect-no-overlap.ts`의 `expectNoTextOverlap(locator)`를 E2E 지원 폴더로 복사(같은 시그니처).
- `front/tests/e2e/design-contract-stress.spec.ts` — 320px·200% 확대 proxy·장문·빈 목록·오류 상태 스트레스(기존 `approved-route-stress.spec.ts` 대체).
- `front/tests/e2e/space-transition.spec.ts` — 전환 안전 E2E(`admin-approved-routes.spec.ts`의 `admin-space-switcher-desktop` 메뉴 시나리오 포팅 + dirty/pending/unknown-outcome 시나리오 신규 작성).
- `front/tests/unit/quiet-desk-css-disjoint.test.ts` — quiet-desk 선택자와 런타임 CSS 선택자의 교집합이 재사용 목록과 같음.
- `front/tests/e2e/support/dom-signature.ts` (+`.test.ts`) — 브라우저·노드 공용 DOM 서명 함수.
- `front/scripts/extract-design-contract.ts` — 아트보드 렌더 → 계약 JSON.
- `front/scripts/run-design-contract-docker.ts` — pinned Jammy 이미지에서 게이트 실행.
- `front/tests/e2e/design-contract.spec.ts` — 게이트.
- `front/tests/unit/quiet-desk-css-parity.test.ts` — 커밋된 아트보드의 `<style>`이 `quiet-desk.css` + `tokens.css`와 일치.
- `front/tests/unit/design-contract-registry.test.ts` — 레지스트리의 모든 `data-spec`이 컴포넌트 상수(`SPEC`)에 있고 화면 내 중복이 없다.
- `front/shared/ui/quiet-desk/spec-names.ts` — `data-spec` 상수 `SPEC`.
- `front/shared/ui/quiet-desk/*.tsx` — §5.1 컴포넌트(각 파일 하나, 테스트 co-locate).
- `front/shared/ui/quiet-desk/club-shell-header.tsx`, `club-mobile-header.tsx`, `club-mobile-tab-bar.tsx`, `account-menu.tsx`, `account-sheet.tsx`, `club-menu.tsx`, `perspective-toggle.tsx`.
- `front/features/platform-admin/ui/admin-shell-quiet.tsx` — 새 어드민 셸(사이드바·상단바·계정 메뉴·모바일).
- `docs/development/adr/0054-code-native-design-contract.md`.

### 수정

- `design/mockups/2026-09-06-quiet-desk/gen/lib.py` — `CSS` 문자열 제거, 파일 읽기; 프래그먼트가 `fixtures.json` 값을 쓰도록.
- `design/mockups/2026-09-06-quiet-desk/gen/*.py` — 데이터 하드코딩 → fixtures 참조, `data-spec` 보강.
- `front/shared/ui/readmates-copy.ts`, `front/features/platform-admin/model/admin-copy.ts`, `admin-status-language.ts` — 라벨 사전.
- `front/src/styles/globals.css` — `@import "../../shared/styles/quiet-desk.css"` 추가.
- `front/src/app/layouts/app-route-layout.tsx` — 새 셸 조립, `AppGlobalSpaceSwitcherBridge` 제거.
- `front/src/app/routes/admin.tsx`, `front/features/platform-admin/route/admin-shell-layout.tsx` — 새 어드민 셸.
- `front/package.json` — `test:e2e:design-contract`, `test:e2e:design-contract:docker`, `design-contract:extract` 스크립트.
- `.github/workflows/ci.yml` — 시각 권위 잡을 design-contract 잡으로 교체.
- `front/DESIGN.md`, `docs/agents/design.md`, `docs/development/adr/README.md`, `CHANGELOG.md`.

### 삭제 (슬라이스 8에서만)

스펙 §9 목록.

---

## 슬라이스 0 — 기반

### Task 0.0: ADR-0054 Proposed와 문서 연결 (첫 커밋)

**Files:**
- Create: `docs/development/adr/0054-code-native-design-contract.md`
- Modify: `docs/development/adr/README.md`(0054 행 추가 `Proposed`; 0053 비고 "ADR-0054로 supersede 예정"; 0045·0048·0050·0051 비고 "ADR-0054 §영향에 따라 update 예정(라벨·셸 표현)"), `front/DESIGN.md`(맨 위에 "다음 권위: quiet-desk 계약, 슬라이스 진행 중" 절), `docs/agents/design.md`(코드 네이티브 시안 절 3줄), `design/mockups/2026-09-06-quiet-desk/README.md`, `.gitignore`
- Check: `git diff --check -- docs design front/DESIGN.md`, `python3 scripts/agent-preflight.py`

- [ ] ADR 본문은 스펙 §10 첫 항목 그대로(컨텍스트·결정·근거·대안·결과·검증·후속). 상태 `Proposed`. 커밋 `docs(adr): ADR-0054 code-native design contract (proposed)`

루트 `AGENTS.md`는 durable decision의 `Proposed` ADR을 구현 **전**에 요구하므로 이 태스크가 슬라이스 0의 첫 커밋이다.

### Task 0.1: 시안 CSS를 런타임 파일로 이관하고 생성기가 읽게 한다

**Files:**
- Create: `front/shared/styles/quiet-desk.css`
- Modify: `design/mockups/2026-09-06-quiet-desk/gen/lib.py` (`CSS` 상수 → 파일 읽기, 클래스 `qd-` 개명), `gen/*.py`(프래그먼트 클래스 개명), `gen/build.py`(`--no-font`, `--check`)
- Modify: `front/src/styles/globals.css:4` (import 추가)
- Test: `front/tests/unit/quiet-desk-css-parity.test.ts`, `front/tests/unit/quiet-desk-css-disjoint.test.ts`

**Interfaces:**
- Produces: `quiet-desk.css`에 §5.1의 모든 클래스가 `qd-` 접두로 (`.qd-topnav` `.qd-seg` `.util-link` `.page` `.page-header` `.kicker` `.status-line` `.tabs` `.tab` `.back-bar` `.two-col` `table.ledger` `.todo-first` `.todo-row` `.rail-foot` `.sec` `.check` `.field` `.input` `.radio` `.checkbox` `.side-index` `.summary-card` `.att` `.pill-seg` `.m-hdr` `.m-tabbar` `.m-tab` `.m-row` `.m-title` `.m-tabs` `.m-sticky-cta` `.adm` `.adm-side` `.adm-nav` `.adm-top` `.adm-main` `.adm-body` `.queue` `.case` `.docket` `.exp-sum` `.step-bar` `.stat` `.card` `.kv` `.banner` `.badge*` `.btn*` `.circ` `.dot` `.avatar` `.brand-mark` `.menu*` `.cover` `.state` `.facts` `.meeting-head` `.frame` `.info-line` → 모두 `qd-` 접두; 위 목록의 `.badge*`·`.btn*`는 제외). `.btn*`·`.badge*`·`.h1~.h4`·`.small`·`.tiny`·`.mono`는 파일에 없다(tokens.css 재사용), `.btn-danger`만 있다.
- Produces: `build.py --no-font`(폰트 서브셋 생략), `build.py --check`(생성 결과와 커밋 파일을 `@font-face` 블록 제거 후 비교, 다르면 exit 1).
- Produces: `lib.wrap(body)`는 `<style>{tokens.css 내용}{quiet-desk.css 내용}</style>`를 낸다.

- [ ] **Step 1: 실패하는 parity 테스트 작성**

```ts
// front/tests/unit/quiet-desk-css-parity.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const MOCKUPS = resolve(ROOT, "design/mockups/2026-09-06-quiet-desk");
const normalize = (css: string) => css.replace(/\s+/g, " ").trim();

describe("quiet-desk CSS parity", () => {
  const tokens = normalize(readFileSync(resolve(ROOT, "design/system/src/styles/tokens.css"), "utf8"));
  const grammar = normalize(readFileSync(resolve(ROOT, "front/shared/styles/quiet-desk.css"), "utf8"));

  it("every committed artboard inlines tokens.css followed by quiet-desk.css verbatim", () => {
    const boards = readdirSync(MOCKUPS).filter((f) => f.endsWith(".dc.html"));
    expect(boards.length).toBeGreaterThan(60);
    for (const board of boards) {
      const html = readFileSync(resolve(MOCKUPS, board), "utf8");
      const style = normalize(html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "");
      const withoutFont = style.replace(/@font-face \{[^}]*\}/g, "").trim();
      expect(withoutFont, board).toContain(tokens);
      expect(withoutFont, board).toContain(grammar);
    }
  });

  it("quiet-desk.css declares no raw colors or font sizes outside tokens", () => {
    expect(grammar).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(grammar).not.toMatch(/font-family:\s*['"]?(Noto|Inter|Roboto)/);
  });
});
```

```ts
// front/tests/unit/quiet-desk-css-disjoint.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const classes = (css: string) => new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const REUSED = new Set(["btn", "btn-primary", "btn-secondary", "btn-ghost", "btn-quiet", "btn-lg", "btn-sm", "badge", "badge-accent", "badge-warn", "badge-ok", "h1", "h2", "h3", "h4", "small", "tiny", "mono"]);

describe("quiet-desk selectors do not collide with runtime CSS", () => {
  const qd = classes(readFileSync(resolve(ROOT, "front/shared/styles/quiet-desk.css"), "utf8"));
  const runtime = new Set<string>();
  for (const f of ["design/system/src/styles/tokens.css", "front/src/styles/globals.css", "front/shared/styles/mobile.css"]) {
    for (const c of classes(readFileSync(resolve(ROOT, f), "utf8"))) runtime.add(c);
  }
  it("every quiet-desk class is qd- prefixed except btn-danger", () => {
    for (const c of qd) if (c !== "btn-danger") expect(c, c).toMatch(/^qd-/);
  });
  it("quiet-desk defines none of the reused token classes and nothing that runtime already defines", () => {
    for (const c of qd) { expect(REUSED.has(c), c).toBe(false); expect(runtime.has(c), c).toBe(false); }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx --yes corepack@0.35.0 pnpm --dir front vitest run tests/unit/quiet-desk-css-parity.test.ts tests/unit/quiet-desk-css-disjoint.test.ts`
Expected: FAIL — `quiet-desk.css` 없음(ENOENT).

- [ ] **Step 3: `quiet-desk.css` 생성 (개명 포함)**

`gen/lib.py`의 `CSS` 문자열에서 `:root { ... }` 블록(토큰 복사본), `html, body`·`*`·`a`·`button`·`img`·`p` 기본 규칙, 그리고 재사용 목록(`.btn*` `.badge*` `.h1~.h4` `.small` `.tiny` `.mono`)의 규칙을 **제외한** 컴포넌트 규칙 전체를 `front/shared/styles/quiet-desk.css`로 옮기고, 남은 모든 클래스 선택자에 `qd-` 접두를 붙인다(`.topnav`→`.qd-topnav`, `.m-row`→`.qd-m-row`, `[data-role]`·`[data-on]` 같은 속성 선택자는 그대로). `.btn-danger`는 유지. 파일 머리말:

```css
/* ============================================
   읽는사이 — Quiet Desk grammar
   Host · admin · shared shell component classes.
   Single source: the design generator (design/mockups/2026-09-06-quiet-desk/gen/lib.py)
   inlines this file verbatim. Never add styles here that the artboards do not use.
   Token values live in @readmates/design-system/tokens.css only.
   ============================================ */
```

`.qd-frame`, `.qd-m-root`(시안 프레임 전용)은 런타임에서 쓰지 않는다는 주석을 붙인다. `.qd-ico`, `.qd-muted`, `.qd-nowrap`은 quiet-desk에 둔다. 같은 커밋에서 `gen/lib.py`·`gen/*.py`의 모든 `class="..."` 문자열과 `icon()`의 `ico` 클래스를 같은 규칙으로 개명한다(정규식 치환 후 `grep -n 'class="[^"]*\b\(topnav\|m-row\|page-header\|input\)\b' gen/*.py`가 0건). 재사용 클래스(`btn` 등)는 개명하지 않는다.

- [ ] **Step 4: 생성기가 파일을 읽도록 수정**

```python
# gen/lib.py (교체)
ROOT = pathlib.Path(__file__).resolve().parents[4]
TOKENS_CSS = (ROOT / "design/system/src/styles/tokens.css").read_text(encoding="utf-8")
GRAMMAR_CSS = (ROOT / "front/shared/styles/quiet-desk.css").read_text(encoding="utf-8")

def wrap(body: str, font_face: str = "") -> str:
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>{font_face}{TOKENS_CSS}
{GRAMMAR_CSS}</style>
</helmet>
{body}
</x-dc>
</body>
</html>
"""
```

`CSS` 상수를 삭제한다. tokens.css의 `[data-theme="dark"]`·`[data-theme="light"]` 블록은 그대로 들어가도 아트보드는 light로 렌더된다(html에 data-theme 없음).

- [ ] **Step 4b: `build.py` 플래그**

최종형(Task 0.3 이후). **Task 0.1 시점에는 아래에서 아트보드와 `canvas.json` 비교만 구현**하고, `registry.json`·`SCREENS.md` 비교(`reg`, `REGISTRY_OUT`, `render_screens_md`)는 Task 0.3에서 추가한다.

```python
# gen/build.py main()
import argparse
ap = argparse.ArgumentParser(); ap.add_argument("--no-font", action="store_true"); ap.add_argument("--check", action="store_true")
args = ap.parse_args()
face = "" if args.no_font else font_face(list(boards.values()))
strip = lambda t: re.sub(r"@font-face \{[^}]*\}", "", t)
if args.check:
    bad = [n for n, html in boards.items() if strip((ROOT / n).read_text()) != strip(html)]
    expected = {"canvas.json": json.dumps(canvas({}), ensure_ascii=False, indent=2) + "\n",
                "SCREENS.md": render_screens_md(reg), }
    stale = [n for n, text in expected.items() if (ROOT / n).read_text() != text]
    if (REGISTRY_OUT.read_text() != json.dumps(reg, ensure_ascii=False, indent=2) + "\n"): stale.append("registry.json")
    if bad or stale: sys.exit(f"stale generated files: {bad + stale}")
    sys.exit(0)
# reg = build_registry(ROOT, canvas({}))  (Task 0.3), REGISTRY_OUT = front/tests/e2e/support/design-contract/registry.json
```

- [ ] **Step 5: globals.css에 import 추가**

```css
@import "@readmates/design-system/styles.css";
@import "../../shared/styles/mobile.css";
@import "../../shared/styles/quiet-desk.css";
```

- [ ] **Step 6: 아트보드 재생성 후 테스트 통과 확인**

Run: `cd design/mockups/2026-09-06-quiet-desk && .venv/bin/python gen/build.py && cd - && npx --yes corepack@0.35.0 pnpm --dir front vitest run tests/unit/quiet-desk-css-parity.test.ts`
Expected: parity·disjoint 둘 다 PASS. 이어서 `npx --yes corepack@0.35.0 pnpm --dir front build` PASS, `.venv/bin/python gen/build.py --check` exit 0. 개명 뒤 캔버스를 재조립·재게시하고, 재사용으로 값이 달라진 곳(`.btn` 색 상속 등)이 있으면 사용자 확인을 받는다.

- [ ] **Step 7: 커밋**

```bash
git add front/shared/styles/quiet-desk.css front/src/styles/globals.css front/tests/unit/quiet-desk-css-parity.test.ts front/tests/unit/quiet-desk-css-disjoint.test.ts design/mockups/2026-09-06-quiet-desk/gen/lib.py design/mockups/2026-09-06-quiet-desk/gen/build.py design/mockups/2026-09-06-quiet-desk/gen/host_desktop.py design/mockups/2026-09-06-quiet-desk/gen/host_mobile.py design/mockups/2026-09-06-quiet-desk/gen/mobile_more.py design/mockups/2026-09-06-quiet-desk/gen/admin.py design/mockups/2026-09-06-quiet-desk/gen/extra.py design/mockups/2026-09-06-quiet-desk/*.dc.html design/mockups/2026-09-06-quiet-desk/canvas.json
git commit -m "feat(design): move quiet-desk grammar CSS to runtime and inline it into artboards"
```

### Task 0.2: 시안 데이터를 `fixtures.json`으로 분리하고 E2E 픽스처 변환기를 만든다

**Files:**
- Create: `design/mockups/2026-09-06-quiet-desk/gen/fixtures.json`
- Modify: `gen/host_desktop.py`, `gen/host_mobile.py`, `gen/mobile_more.py`, `gen/admin.py`, `gen/extra.py` (하드코딩 값 → `FX[...]`)
- Create: `front/tests/e2e/support/design-contract-fixtures.ts`, `.test.ts`

**Interfaces:**
- Produces: `fixtures.json` 스키마
  ```json
  {"club": {"name": "을지로 북살롱", "slug": "euljiro", "memberCount": 12},
   "host": {"name": "김하늘", "avatar": "candle-green-book.webp"},
   "meetings": [{"no": 28, "book": "지구 끝의 온실", "author": "김초엽", "date": "2026-09-01", "time": "19:30", "place": "을지로 북살롱", "lifecycle": "OPEN", "responses": {"yes": 7, "no": 2, "none": 3}, "seen": {"latest": 8, "previous": 1, "none": 3}, "questions": 6}, ...],
   "members": [{"id": "m1", "name": "정민재", "avatar": "star-notebook.webp", "role": "MEMBER", "seen": "NONE", "rsvp": "NONE", "lastSeen": "5일 전", "tenure": "8개월"}, ...],
   "pending": [...], "todos": [...], "invites": [...],
   "admin": {"cases": [...], "clubs": [...], "services": [...], "audit": [...], "operator": {"name": "김은영"}}}
  ```
- Produces(모두 `design-contract-fixtures.ts`): `type HostBffPayloads`, `type AdminBffPayloads`(이 파일에서 정의; 기존 `installHostApprovedRoutes`/`installAdminApprovedRoutes`가 `page.route`에 넣는 응답 객체와 같은 형태), `toHostBffFixtures(fx): HostBffPayloads`, `toAdminBffFixtures(fx): AdminBffPayloads`, `installDesignContractFixtures(page: Page, role: "host" | "admin", variant?: "long-copy" | "empty" | "error"): Promise<void>`(기존 `installHostApprovedRoutes`/`installAdminApprovedRoutes`와 같은 `page.route` 패턴으로 BFF 경로를 가로채며, **인증도 같은 방식**으로 `**/api/bff/api/auth/me**` 응답을 role에 맞는 `AuthMeResponse` 픽스처로 mock한다 — 별도 `loginAs`는 없다. 매치되지 않는 BFF 트래픽은 fail-closed).

- [ ] **Step 1: 변환기 테스트**

```ts
// front/tests/e2e/support/design-contract-fixtures.test.ts
import { describe, expect, it } from "vitest";
import fixtures from "../../../../design/mockups/2026-09-06-quiet-desk/gen/fixtures.json";
import { toAdminBffFixtures, toHostBffFixtures } from "./design-contract-fixtures";

describe("design-contract fixtures", () => {
  it("host fixtures carry the artboard numbers", () => {
    const host = toHostBffFixtures(fixtures);
    expect(host.club.name).toBe("을지로 북살롱");
    expect(host.currentMeeting.book.title).toBe("지구 끝의 온실");
    expect(host.members).toHaveLength(12);
    expect(host.pendingApprovals).toHaveLength(2);
    expect(host.scheduleSeen).toEqual({ latest: 8, previous: 1, none: 3, total: 12 });
  });
  it("admin fixtures carry three today cases and fourteen clubs", () => {
    const admin = toAdminBffFixtures(fixtures);
    expect(admin.today.cases.map((c) => c.title)).toEqual(["알림 전달 지연", "공개 기록 확인", "AI 요약 결과 확인"]);
    expect(admin.clubs.total).toBe(14);
  });
  it("uses only fictional identities", () => {
    const text = JSON.stringify(fixtures);
    expect(text).not.toMatch(/@growv\.com|readmates\.app\/admin/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `vitest run tests/e2e/support/design-contract-fixtures.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: `fixtures.json` 작성** — 현재 아트보드에 보이는 모든 값을 옮긴다(클럽·모임 28/27/26/25/24/29·멤버 12명·승인 대기 2·할 일 4·초대 링크 2·어드민 케이스 3·클럽 14 중 표에 보이는 5·서비스 5·audit 5). 이름은 모두 현재 시안의 가상 인물.

- [ ] **Step 4: 생성기가 `FX`를 읽도록 교체** — `lib.py`에 `FX = json.loads((pathlib.Path(__file__).parent / "fixtures.json").read_text())`. 각 화면 함수의 리터럴을 `FX["meetings"][0]["book"]` 식으로 바꾼다. 빌드 후 `git diff --stat -- '*.dc.html'`가 0이어야 한다(값이 같으니 출력 동일).

- [ ] **Step 5: 변환기·설치기 구현** — 기존 `host-approved-route-fixtures.ts`의 `installHostApprovedRoutes`가 등록하는 경로·응답 형태를 읽고 같은 형태를 `fixtures.json`에서 만든다(`HostBffPayloads` 타입을 이 파일에 정의). `installDesignContractFixtures`를 export한다(auth/me mock 포함). 기존 파일은 손대지 않는다(슬라이스 8에서 삭제).

- [ ] **Step 6: 통과 확인** — vitest PASS, `build.py` 후 아트보드 diff 0.

- [ ] **Step 7: 커밋** — `feat(design): single fixtures.json shared by artboards and design-contract E2E`

### Task 0.3: `data-spec` 보강과 레지스트리·SCREENS.md 생성

**Files:**
- Modify: `gen/mobile_more.py`(M13·M14·M17·M18·M20·M24), `gen/host_desktop.py`(D16 `host.settings.club`), `gen/extra.py`(M24 `host.invites.new`)
- Create: `gen/registry.py`; Modify: `gen/build.py`(호출)
- Create: `front/tests/e2e/support/design-contract/registry.json`, `design/mockups/2026-09-06-quiet-desk/SCREENS.md`
- Create: `front/shared/ui/quiet-desk/spec-names.ts`
- Test: `front/tests/unit/design-contract-registry.test.ts`

**Interfaces:**
- Produces(`gen/registry.py`): `build_registry(root, canvas) -> dict`, `render_screens_md(reg: dict) -> str`, 상수 `ROUTES`, `INTERACTIONS`, `IMPLEMENTED`; `build.py`의 `REGISTRY_OUT = <repo>/front/tests/e2e/support/design-contract/registry.json`.
- Produces: `registry.json` = `{ screens: [{ id: "Main", file: "Main.dc.html", route: "/app/host", role: "host", viewport: {width: 1440, height: 960}, specs: ["shell.header", ...], interactions: [], implemented: false }] }`. 라우트는 스펙 §4 표. 어드민 `A13`은 `/admin/today`, `D21`은 `/app`, `M22`는 `/app/host`. `interactions`는 `INTERACTIONS = {"D21-ShellMenus": ["open:shell.club-menu", "open:shell.account-menu"], "M22-AccountSheet": ["open:shell.account-sheet"], "A13-AccountMenu": ["open:admin.shell.account-menu"], "AM8-AccountSheet": ["open:admin.shell.account-sheet"]}`, `implemented`는 `IMPLEMENTED: set[str] = set()`에서 나온다. 두 상수는 `gen/registry.py`에 있다.
- Produces: `D09`·`M02`의 `host.live.attendance-control`은 출석 목록 컨테이너(`div.qd-att-list`) 한 곳으로 이동(`att_row`는 이름 없음).
- Produces: `SPEC` 상수 — `export const SPEC = { shellHeader: "shell.header", ... } as const;` 레지스트리의 고유 이름 전부(생성).

- [ ] **Step 1: 레지스트리 테스트**

```ts
// front/tests/unit/design-contract-registry.test.ts
import { describe, expect, it } from "vitest";
import registry from "../e2e/support/design-contract/registry.json";
import { SPEC } from "@/shared/ui/quiet-desk/spec-names";

const known = new Set(Object.values(SPEC));
describe("design-contract registry", () => {
  it("has 71 screens with routes and viewports", () => {
    expect(registry.screens).toHaveLength(71);
    for (const s of registry.screens) {
      expect(s.route.startsWith("/")).toBe(true);
      expect([390, 1440]).toContain(s.viewport.width);
    }
  });
  it("every spec name is declared in SPEC and unique within a screen", () => {
    for (const s of registry.screens) {
      expect(new Set(s.specs).size, s.id).toBe(s.specs.length);
      for (const name of s.specs) expect(known.has(name), `${s.id}:${name}`).toBe(true);
    }
  });
  it("carries deterministic implemented/interactions flags", () => {
    for (const s of registry.screens) expect(typeof s.implemented).toBe("boolean");
    expect(registry.screens.find((x) => x.id === "D21-ShellMenus")!.interactions).toEqual(["open:shell.club-menu", "open:shell.account-menu"]);
  });
  it("live screens name the attendance control once, on the container", () => {
    for (const id of ["D09-TodayLive", "M02-TodayLive"]) {
      const s = registry.screens.find((x) => x.id === id)!;
      expect(s.specs.filter((n) => n === "host.live.attendance-control")).toHaveLength(1);
    }
  });
  it("mobile task screens carry a body region, not just the header", () => {
    for (const id of ["M13-RecordDraft", "M14-FeedbackDoc", "M17-SettingsClub", "M18-SettingsCoHost", "M20-SettingsClose", "M24-NewInvite"]) {
      const s = registry.screens.find((x) => x.id === id)!;
      expect(s.specs.filter((n) => !n.startsWith("shell.")).length, id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL(registry.json 없음).

- [ ] **Step 3: `data-spec` 보강** — 여섯 모바일 화면과 D16에 스펙 §2.3의 이름을 붙인다. `lib.att_row`에서 `data-spec`을 제거하고 `D09`·`M02`의 출석 목록 래퍼 `<div class="qd-att-list" data-spec="host.live.attendance-control">`에 한 번만 붙인다. 중복은 `registry.py`가 exit 1로 막는다.

- [ ] **Step 4: `registry.py`**

```python
# gen/registry.py
import json, pathlib, re
ROUTES = {"Main": "/app/host", "D01-TodayStart": "/app/host", "D02-SettingsInvites": "/app/host/settings#invitations", ...}  # 스펙 §4 표 전체
def build_registry(root: pathlib.Path, canvas: dict) -> dict:
    screens = []
    for board in canvas["artboards"]:
        stem = board["file"].removesuffix(".dc.html")
        html = (root / board["file"]).read_text(encoding="utf-8")
        specs, seen = [], set()
        for name in re.findall(r'data-spec="([^"]+)"', html):
            if name in seen: raise SystemExit(f"{stem}: duplicate data-spec {name}")
            seen.add(name); specs.append(name)
        screens.append({"id": stem, "file": board["file"], "route": ROUTES[stem],
                        "role": "admin" if stem[0] == "A" else "host",
                        "viewport": {"width": board["w"], "height": board["h"]}, "specs": specs,
                        "interactions": INTERACTIONS.get(stem, []), "implemented": stem in IMPLEMENTED})
    return {"screens": screens}
```

`build.py`는 `registry.json`을 `front/tests/e2e/support/design-contract/`에, `SCREENS.md`(id·화면 제목·라우트·specs 표)를 시안 폴더에 쓴다. `spec-names.ts`는 레지스트리에서 생성한다(camelCase 키). 화면을 끝낸 슬라이스는 `IMPLEMENTED`에 id를 추가하고 `build.py`를 다시 돌려 `registry.json`을 갱신한다. 손으로 `registry.json`을 고치지 않는다(`--check`가 잡는다).

- [ ] **Step 5: 통과 확인·커밋** — `feat(design): data-spec registry, SCREENS.md and SPEC constants`

### Task 0.4: DOM 서명 함수와 계약 추출기

**Files:**
- Create: `front/tests/e2e/support/dom-signature.ts`, `dom-signature.test.ts`
- Create: `front/scripts/extract-design-contract.ts`, `front/tests/e2e/support/collect-regions.ts`(브라우저에서 실행되는 `collect(sig: string): Region[]` — 추출기와 게이트가 같은 함수를 쓴다)
- Create: `front/scripts/run-design-contract-docker.ts` (pinned Jammy 이미지에서 `--extract [--check]` 또는 게이트 spec 실행; 기존 `run-visual-authority-docker.ts`의 docker 호출 패턴을 따름 — Task 0.5는 이 파일에 게이트 실행 분기만 추가)
- Modify: `front/package.json` (`"design-contract:extract": "tsx scripts/run-design-contract-docker.ts --extract"`, `"design-contract:extract:check": "tsx scripts/run-design-contract-docker.ts --extract --check"`)

**Interfaces:**
- Produces: `domSignature(el: Element): string` — 자기 태그+클래스, `>`, 직계 자식들의 태그+클래스를 `+`로 연결. 클래스는 알파벳 정렬, `rm-sr-only` 제외, 속성 무시. 예: `div.qd-state>span.qd-accent.qd-dot+b+span+span+span+a.qd-text-link`.
- Produces: `domSignatureSource: string` — 같은 파일이 `readFileSync(new URL(import.meta.url))`로 자기 소스를 읽어 `export ` 접두를 제거한 문자열(브라우저 `page.evaluate`에 주입용).
- Produces: 계약 JSON의 `artboardSha256` = 커밋된 아트보드 파일 바이트의 SHA-256.
- Produces: `collect`(`support/collect-regions.ts`):

```ts
export type Region = { spec: string; order: number; box: { x: number; y: number; w: number; h: number }; dom: string; type: { selector: string; family: string; size: number; weight: number; lineHeight: number; color: string }; rows: { y: number; h: number }[] };
export const ROW_SELECTOR = "table.qd-ledger tbody tr, .qd-todo-row, .qd-m-row, .qd-att, .qd-check";
export function collect(sig: string): Region[] {
  const fn = new Function("el", sig) as (el: Element) => string;
  return [...document.querySelectorAll("[data-spec]")].map((el, order) => {
    const r = el.getBoundingClientRect();
    const t = el.querySelector("h1,h2,h3,b,.qd-t,.qd-a") ?? el;
    const cs = getComputedStyle(t);
    const rows = [...el.querySelectorAll(ROW_SELECTOR)].map((row) => { const b = row.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height) }; });
    return { spec: el.getAttribute("data-spec")!, order,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      dom: fn(el),
      type: { selector: t === el ? "self" : t.tagName.toLowerCase(), family: cs.fontFamily.split(",")[0].replace(/["']/g, ""), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), lineHeight: parseFloat(cs.lineHeight), color: cs.color },
      rows };
  });
}
```

`page.evaluate(collect, sig)`로 쓴다(함수는 직렬화되어 브라우저에서 실행되므로 외부 참조 금지).
- Produces: 계약 JSON(스펙 §2.4).

- [ ] **Step 1: 서명 테스트(jsdom)**

```ts
// front/tests/e2e/support/dom-signature.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { domSignature } from "./dom-signature";

describe("domSignature", () => {
  it("serializes tag and sorted classes of self and direct children", () => {
    document.body.innerHTML = `<div class="qd-state" data-spec="x"><span class="qd-dot qd-accent"></span><b>모임까지 3일</b><span class="rm-sr-only">숨김</span><a class="qd-text-link" href="#">›</a></div>`;
    expect(domSignature(document.querySelector("[data-spec=x]")!)).toBe("div.qd-state>span.qd-accent.qd-dot+b+a.qd-text-link");
  });
  it("ignores aria and id attributes", () => {
    document.body.innerHTML = `<nav class="qd-tabs" id="t" aria-label="탭"><span class="qd-tab" aria-selected="true">a</span></nav>`;
    expect(domSignature(document.querySelector("nav")!)).toBe("nav.qd-tabs>span.qd-tab");
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 구현**

```ts
// front/tests/e2e/support/dom-signature.ts
const IGNORED_CLASSES = new Set(["rm-sr-only"]);
function token(el: Element): string {
  const classes = [...el.classList].filter((c) => !IGNORED_CLASSES.has(c)).sort();
  return el.tagName.toLowerCase() + (classes.length ? "." + classes.join(".") : "");
}
export function domSignature(el: Element): string {
  const children = [...el.children].filter((c) => !c.classList.contains("rm-sr-only")).map(token);
  return children.length ? `${token(el)}>${children.join("+")}` : token(el);
}
```

- [ ] **Step 4: 추출기**

```ts
// front/scripts/extract-design-contract.ts
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import registry from "../tests/e2e/support/design-contract/registry.json";
import { domSignatureSource } from "../tests/e2e/support/dom-signature";

const ROOT = resolve(import.meta.dirname, "../..");
const MOCKUPS = resolve(ROOT, "design/mockups/2026-09-06-quiet-desk");
const OUT = resolve(ROOT, "front/tests/e2e/support/design-contract");
const PRETENDARD = resolve(ROOT, "front/node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css");
const check = process.argv.includes("--check");
const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

const browser = await chromium.launch();
for (const screen of registry.screens) {
  const file = resolve(MOCKUPS, screen.file);
  const bytes = readFileSync(file);
  const page = await browser.newPage({ viewport: screen.viewport, deviceScaleFactor: 1 });
  await page.goto(`file://${file}`, { waitUntil: "load" });
  await page.addStyleTag({ content: "" }); // no-op keeps ordering explicit
  await page.evaluate(() => { for (const s of document.querySelectorAll("style")) s.textContent = s.textContent!.replace(/@font-face \{[^}]*\}/g, ""); });
  await page.addStyleTag({ path: PRETENDARD });
  await page.evaluate(() => document.fonts.ready);
  const regions = await page.evaluate(collect, `${domSignatureSource}; return domSignature(el);`);
  mkdirSync(OUT, { recursive: true });
  const out = JSON.stringify({ screen: screen.id, route: screen.route, viewport: screen.viewport, artboardSha256: sha256(bytes), regions }, null, 2) + "\n";
  const target = resolve(OUT, `${screen.id}.json`);
  if (check) { if (readFileSync(target, "utf8") !== out) { console.error(`stale contract: ${screen.id}`); process.exitCode = 1; } }
  else writeFileSync(target, out);
  await page.close();
}
await browser.close();
```

`file://` 문서에서 로컬 스타일시트를 넣을 때 `<link href=file://>`는 `about:blank`에서 막히므로 반드시 `page.goto(file://)` + `addStyleTag({ path })`를 쓴다. 실행은 pinned Jammy 이미지 안에서(`run-design-contract-docker.ts --extract [--check]`) 해 폰트 래스터를 게이트와 같게 한다. 기존 스크립트(`front/scripts/run-visual-authority-docker.ts`)처럼 `import.meta.dirname`을 쓴다(`__dirname` 금지).

- [ ] **Step 5: 계약 71개 생성·커밋** — `design-contract:extract` 실행, `design-contract/*.json` 71개 확인. 커밋 `feat(design): extract data-spec contracts from artboards`

### Task 0.5: 게이트 spec과 CI 잡 교체

**Files:**
- Create: `front/tests/e2e/design-contract.spec.ts`
- Modify: `front/scripts/run-design-contract-docker.ts`(게이트 실행 분기 추가), `front/package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `registry.json`(`implemented`, `interactions`), `design-contract/*.json`(`artboardSha256`, `rows`), `installDesignContractFixtures`(Task 0.2, auth mock 포함), `domSignatureSource`(Task 0.4), `visual-authority-contract.ts`의 `expectNoHorizontalOverflow`·`expectNoSeriousAccessibilityFindings`·`expectVisibleFocus`, `expect-no-text-overlap.ts`의 `expectNoTextOverlap(locator)`(Task 0.5에서 CT 지원 파일을 복사).
- Produces: 화면당 `test(screen.id)`; `implemented: false`면 `test.skip`. 슬라이스는 `gen/registry.py`의 `IMPLEMENTED`에 id를 넣고 `build.py`를 다시 돌려 켠다.

- [ ] **Step 1: spec 작성**

```ts
// front/tests/e2e/design-contract.spec.ts
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import registry from "./support/design-contract/registry.json";
import { installDesignContractFixtures } from "./support/design-contract-fixtures";
import { domSignatureSource } from "./support/dom-signature";
import { expectNoTextOverlap } from "./support/expect-no-text-overlap";
import { expectNoHorizontalOverflow, expectNoSeriousAccessibilityFindings, expectVisibleFocus } from "./support/visual-authority-contract";
import { collect, type Region } from "./support/collect-regions"; // Task 0.4와 같은 함수

const MOCKUPS = resolve(import.meta.dirname, "../../../design/mockups/2026-09-06-quiet-desk");

for (const screen of registry.screens) {
  test(screen.id, async ({ page }, info) => {
    test.skip(!screen.implemented, "not implemented yet");
    const contract = JSON.parse(readFileSync(resolve(import.meta.dirname, `support/design-contract/${screen.id}.json`), "utf8"));
    const current = createHash("sha256").update(readFileSync(resolve(MOCKUPS, screen.file))).digest("hex");
    expect(current, "stale contract: re-run design-contract:extract").toBe(contract.artboardSha256);
    await page.setViewportSize(screen.viewport);
    await installDesignContractFixtures(page, screen.role);
    await page.goto(screen.route);
    await page.evaluate(() => document.fonts.ready);
    const openable = new Set(screen.interactions.map((s) => s.split(":")[1]));
    const staticRegions = contract.regions.filter((r) => !openable.has(r.spec));
    const actual: Region[] = await page.evaluate(collect, `${domSignatureSource}; return domSignature(el);`);
    const compare = (got: Region, exp: Region) => {
      expect(got.dom, exp.spec).toBe(exp.dom);
      for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(got.box[k] - exp.box[k]), `${exp.spec}.${k}`).toBeLessThanOrEqual(4);
      expect(got.type, exp.spec).toEqual(exp.type);
      expect(got.rows.length, `${exp.spec} rows`).toBe(exp.rows.length);
      for (const [j, row] of exp.rows.entries()) {
        expect(Math.abs(got.rows[j].h - row.h), `${exp.spec} row ${j} height`).toBeLessThanOrEqual(2);
        if (j > 0) expect(Math.abs((got.rows[j].y - got.rows[j - 1].y) - (row.y - exp.rows[j - 1].y)), `${exp.spec} row ${j} gap`).toBeLessThanOrEqual(2);
      }
    };
    expect(actual.map((r) => r.spec)).toEqual(staticRegions.map((r) => r.spec));
    for (const [i, exp] of staticRegions.entries()) compare(actual[i], exp);
    for (const step of screen.interactions) {
      const spec = step.split(":")[1];
      await page.locator(`[data-spec-trigger="${spec}"]`).click();
      const region = page.locator(`[data-spec="${spec}"]`);
      await expect(region).toBeVisible();
      const got = (await page.evaluate(collect, `${domSignatureSource}; return domSignature(el);`)).find((r) => r.spec === spec)!;
      compare(got, contract.regions.find((r) => r.spec === spec)!);
      await page.keyboard.press("Escape");
      await expect(region).toBeHidden();
      await expect(page.locator(`[data-spec-trigger="${spec}"]`)).toBeFocused();
    }
    await expectNoHorizontalOverflow(page);
    await expectNoTextOverlap(page.locator("body"));
    await expectNoSeriousAccessibilityFindings(page);
    // keyboard: toggle/tabs arrow keys, menus close on Escape and return focus to trigger
    const toggle = page.locator('[data-spec="shell.perspective-toggle"] [role="radio"][aria-checked="true"]');
    if (await toggle.count()) { await toggle.focus(); await page.keyboard.press("ArrowRight"); await expectVisibleFocus(page.locator(":focus")); }
    const shot = await page.screenshot();
    await info.attach("candidate.png", { body: shot, contentType: "image/png" });
  });
}
```

- [ ] **Step 2: 실행해서 전부 skip 확인** — `DOCKER_CONTEXT=colima-readmates-va npx --yes corepack@0.35.0 pnpm --dir front test:e2e:design-contract:docker` → 71 skipped.

- [ ] **Step 3: CI 잡 교체** — `ci.yml`의 시각 권위 잡 명령을 `test:e2e:design-contract:docker`로, 신선도 검사 스텝 두 개 추가: `python3 design/mockups/2026-09-06-quiet-desk/gen/build.py --no-font --check`(fontTools 불필요), `pnpm --dir front design-contract:extract:check`. 옛 `approved-routes` 스텝은 `if: false`로 비활성(삭제는 슬라이스 8).
- [ ] **Step 3b: `expect-no-text-overlap.ts` 복사** — `front/tests/ct/support/expect-no-overlap.ts`의 `expectNoTextOverlap(container: Locator)`를 `front/tests/e2e/support/expect-no-text-overlap.ts`로 복사하되 `Locator` import를 `@playwright/experimental-ct-react`에서 `@playwright/test`로 바꾼다.

- [ ] **Step 4: 커밋** — `test(front): design-contract gate replaces approved-routes pixel job`

### Task 0.6: 라벨 사전

**Files:**
- Modify: `front/shared/ui/readmates-copy.ts`, `front/features/platform-admin/model/admin-copy.ts`, `admin-status-language.ts`(내비 라벨만)
- Test: 기존 co-located 테스트 갱신 + `front/shared/ui/readmates-copy.test.ts`

- [ ] **Step 1: 테스트**

```ts
import { READMATES_PRIMARY_NAV_LABELS, READMATES_MOBILE_TAB_LABELS, READMATES_TODAY_LABELS } from "./readmates-copy";
it("host and member share today/records grammar", () => {
  expect(Object.values(READMATES_PRIMARY_NAV_LABELS.host)).toEqual(["오늘", "모임", "멤버", "기록"]);
  expect(READMATES_MOBILE_TAB_LABELS.host).toEqual(["오늘", "모임", "멤버", "기록"]);
  expect(READMATES_TODAY_LABELS.sections).toEqual(["준비 현황", "당일 출석", "모임 기록"]);
  expect(READMATES_TODAY_LABELS.todo).toBe("할 일");
});
```

- [ ] **Step 2~4**: 실패 확인 → 사전 교체(옛 키는 남기되 값만 바꾸고 `@deprecated` 주석; 새 키 `READMATES_TODAY_LABELS`, `READMATES_SETTINGS_LABELS`(`설정`, `초대 링크`, `공동 호스트`, `변경 이력`, `운영 종료`, `보낸 안내`), `READMATES_STATE_WORDS`(`아직 안 봄`, `변경 전 확인`, `확인`, `작성 필요`, `작성 중`, `게시됨`, `휴지통`)) → 영향받는 기존 테스트의 기대 문자열 갱신 → PASS.
- [ ] **Step 5: 커밋** — `feat(copy): quiet-desk label dictionary`

### Task 0.7: 공용 primitive 컴포넌트 ①

**Files:**
- Create: `front/shared/ui/quiet-desk/checkbox.tsx`, `pill-seg.tsx`, `field.tsx`, `radio-card.tsx`, `banner.tsx`, `stat.tsx`, `step-bar.tsx`, `badge.tsx`, `circ-icon.tsx` (+ 각 `.test.tsx`)
- Create: `front/shared/ui/quiet-desk/dom-signature.test-helper.ts` (jsdom에서 `domSignature`로 계약 `dom`과 비교)

**Interfaces:**
- Produces:
  ```ts
  export function Checkbox(props: { checked: boolean; label: string; onChange?: (v: boolean) => void; disabled?: boolean }): JSX.Element // <label class="checkbox-label"><span class="checkbox" data-on> ...
  export function PillSeg(props: { value: "yes" | "no" | null; onChange: (v: "yes" | "no" | null) => void; labels?: [string, string]; ariaLabel: string }): JSX.Element // .qd-pill-seg, 두 <button>, 같은 값 재클릭 → null, data-spec 없음(컨테이너 AttendanceList가 가짐)
  export function Field(props: { label: string; optional?: boolean; hint?: ReactNode; children: ReactNode }): JSX.Element
  export function RadioCard(props: { checked: boolean; title: string; description?: string; onSelect: () => void }): JSX.Element
  export function Banner(props: { tone: "warn" | "danger"; title: string; description?: string; action?: ReactNode }): JSX.Element
  export function Stat(props: { label: ReactNode; value: ReactNode; tone?: "warn" | "ok" | "danger" }): JSX.Element
  export function StepBar(props: { steps: string[]; current: number }): JSX.Element
  export function CircIcon(props: { name: ReadmatesIconName; tone: "ok" | "warn" | "danger" | "accent" | "neutral" }): JSX.Element
  ```

- [ ] **Step 1: PillSeg 테스트(예시, 다른 컴포넌트도 같은 3항목: 렌더 서명·상호작용·접근성)**

```tsx
// front/shared/ui/quiet-desk/pill-seg.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PillSeg } from "./pill-seg";
import { expectSignature } from "./dom-signature.test-helper";

describe("PillSeg", () => {
  it("renders the attendance control signature from the contract", () => {
    const { container } = render(<PillSeg value="yes" onChange={() => {}} ariaLabel="김하늘 출석" />);
    expectSignature(container.firstElementChild!, "span.qd-pill-seg>button+button");
    expect(screen.getByRole("radio", { name: "출석" })).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector("svg")).toBeNull(); // 아이콘 없음
  });
  it("toggles back to unknown when the selected pill is pressed again", () => {
    const onChange = vi.fn();
    render(<PillSeg value="yes" onChange={onChange} ariaLabel="x" />);
    fireEvent.click(screen.getByRole("radio", { name: "출석" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

`expectSignature(el, expected)`는 `domSignature(el)`을 계산해 비교한다. 계약 JSON의 `dom` 문자열을 그대로 기대값으로 쓴다(`Main.json`의 `host.live.attendance-control` 등).

- [ ] **Step 2: 실패 확인 → 구현 → 통과** (컴포넌트별 반복). 마크업은 생성기 프래그먼트와 글자 단위로 같게 한다. 예:

```tsx
export function PillSeg({ value, onChange, labels = ["출석", "불참"], ariaLabel }: Props) {
  const pick = (v: "yes" | "no") => onChange(value === v ? null : v);
  return (
    <span className="qd-pill-seg" role="radiogroup" aria-label={ariaLabel}>
      <button type="button" role="radio" aria-checked={value === "yes"} data-on={value === "yes" ? "yes" : ""} onClick={() => pick("yes")}>{labels[0]}</button>
      <button type="button" role="radio" aria-checked={value === "no"} data-on={value === "no" ? "no" : ""} onClick={() => pick("no")}>{labels[1]}</button>
    </span>
  );
}
```

시안 프래그먼트 `att_row`는 `<span>` 자식을 쓰므로 **생성기를 `<button>`으로 바꾼다**(같은 커밋, 계약 재추출). 서명은 `span.qd-pill-seg>button+button`. `.qd-pill-seg button`에 `font: inherit; border: 0; background:` 규칙을 `quiet-desk.css`에 추가한다. `expectSignature`의 기대값은 항상 계약 JSON에서 읽는다(문자열 하드코딩 금지).

- [ ] **Step 3: 커밋** — `feat(ui): quiet-desk primitives (checkbox, pill-seg, field, radio-card, banner, stat, step-bar)`

### Task 0.8: 공용 컴포넌트 ② — 페이지 골격

**Files:** `page-header.tsx`, `back-bar.tsx`, `side-index.tsx`, `status-tabs.tsx`, `summary-card.tsx`, `ledger.tsx`, `todo-rail.tsx`, `record-card.tsx` (+테스트)

**Interfaces:**
```ts
export function PageHeader(p: { spec: string; kicker: string; title: ReactNode; status: ReactNode; actions?: ReactNode }): JSX.Element
// spec은 화면별 *.header 상수(SPEC.hostMembersHeader 등)만 허용: type PageHeaderSpec = typeof SPEC[keyof typeof SPEC] & `${string}.header`
export function BackBar(p: { back: { label: string; to: string }; context?: { book: string; when: string }; right?: ReactNode }): JSX.Element
export function SideIndex(p: { spec: string; items: { id: string; label: string; href: string; step?: number }[]; currentId: string }): JSX.Element
export function StatusTabs(p: { spec: string; tabs: { id: string; label: string; count?: number; tone?: "warn" | "danger"; href?: string }[]; currentId: string; trailing?: ReactNode }): JSX.Element
export function Ledger<T>(p: { spec: string; columns: { key: string; label: string; width?: string; align?: "right" }[]; rows: T[]; renderRow: (row: T) => ReactNode[]; selectedId?: string; rowId: (row: T) => string }): JSX.Element
export function TodoRail(p: { count: number; held: number; first: { title: string; why: string; primary: { label: string; to?: string; onClick?: () => void }; secondary?: { label: string; onClick: () => void } } | null; rows: { icon: ReadmatesIconName; tone: CircTone; title: string; meta: string; to: string }[]; footer: { event: string; moreLabel: string; moreTo: string } }): JSX.Element
export function RecordCard(p: { spec: string; kicker: string; title: string; badge?: ReactNode; rows: { icon: ReadmatesIconName; tone: CircTone; title: string; meta?: ReactNode; action?: { label: string; to: string } }[] }): JSX.Element
```

- [ ] 각 컴포넌트: 계약 `dom` 서명 테스트 → 구현 → PASS → 커밋 `feat(ui): quiet-desk page grammar components`. `TodoRail`의 첫 항목이 `null`이면 `.todo-first`를 렌더하지 않고 빈 상태 문장(`지금 필요한 조치 없음`)을 낸다(계약 화면에는 없음, 단위 테스트만).

### Task 0.9: 공용 컴포넌트 ③ — 이번 모임·체크리스트·출석·어드민 골격

**Files:** `meeting-head.tsx`, `meeting-section.tsx`, `checklist.tsx`, `attendance-list.tsx`, `attendance-row.tsx`, `case-queue.tsx`, `case-docket.tsx`, `expandable-row.tsx` (+테스트)

**Interfaces:**
```ts
export type TodayState = "start" | "prep" | "live" | "record";
export function MeetingHead(p: { kicker: string; title: string; badge: { label: string; tone: "accent" | "ok" | "warn" }; state: ReactNode; facts: { date: string; time: string; place: string; editTo: string }; actions: ReactNode; cover?: { imageUrl?: string; title: string; author?: string } }): JSX.Element
export function MeetingSection(p: { spec: "host.today.prep" | "host.today.live" | "host.today.record"; index: 1 | 2 | 3; title: string; state: "done" | "current" | "todo"; summary?: ReactNode; children?: ReactNode }): JSX.Element
export function Checklist(p: { spec: string; items: { state: "done" | "current" | "todo"; title: string; detail: string; action?: { label: string; to?: string; onClick?: () => void } }[] }): JSX.Element
export function AttendanceList(p: { children: ReactNode }): JSX.Element // <div class="qd-att-list" data-spec="host.live.attendance-control">
export function AttendanceRow(p: { member: { name: string; avatarKey: string }; rsvp: string; value: "yes" | "no" | null; onChange: (v: "yes" | "no" | null) => void }): JSX.Element // <div class="qd-att">, data-spec 없음
export function CaseQueue(p: { cases: { id: string; title: string; sub: string; when: string; selected: boolean; to: string }[]; lastChecked: string; moreTo: string }): JSX.Element
export function CaseDocket(p: { title: string; meta: string; sections: { heading: string; body: ReactNode }[]; actions: ReactNode; footer: ReactNode }): JSX.Element
export function ExpandableRow(p: { expanded: boolean; cells: ReactNode[]; summary: { label: string; value: ReactNode }[] }): JSX.Element
```

- [ ] 계약 서명 테스트 → 구현 → PASS → 커밋 `feat(ui): quiet-desk meeting and admin grammar components`

### Task 0.11: 스트레스 E2E 뼈대

**Files:**
- Create: `front/tests/e2e/design-contract-stress.spec.ts`
- Modify: `front/tests/e2e/support/design-contract-fixtures.ts` (`variant` 분기 구현)
- Modify: `front/package.json` (`test:e2e:design-contract:docker`가 stress spec도 포함)

**Interfaces:**
- Consumes: `installDesignContractFixtures(page, role, variant?)`(Task 0.2 시그니처의 `variant`) — `long-copy`는 클럽·책·멤버 이름을 60자 한·영 혼합으로, `empty`는 목록을 빈 배열로, `error`는 한 BFF 경로를 500으로.
- Produces: 화면당 3변형 × 뷰포트 {320×350(200% proxy), 390×844, 1440×900}에서 `expectNoHorizontalOverflow`, `expectNoTextOverlap`, `expectMinimumTargetSize`(모든 `a,button`) 검사. `implemented: false`면 skip.

- [ ] **Step 1**: spec 작성(위 매트릭스 루프) → 전부 skip 확인 → 커밋 `test(front): design-contract stress matrix (long copy, empty, error)`

**슬라이스 0 종료 기준:** `pnpm --dir front lint/test/build` 초록, `test:ct:docker` 초록(새 컴포넌트 CT 포함), `design-contract`·stress 전부 skipped, CI 잡 교체(신선도 검사 두 개 초록), 아트보드·레지스트리·계약 `--check` diff 0, ADR-0054 Proposed 커밋이 슬라이스 첫 커밋.

---

## 슬라이스 1 — 공유 셸

### Task 1.1: `PerspectiveToggle`과 `ClubMenu`

**Files:**
- Create: `front/shared/ui/quiet-desk/perspective-toggle.tsx`, `club-menu.tsx` (+테스트)
- Consumes: `front/src/app/global-space-transition-controller.tsx`의 `useGlobalSpaceTransitionController()` → `{ currentIdentity, availableIdentities, requestTransition(identity): Promise<SpaceTransitionRequestResult> }`(기존 `AppGlobalSpaceSwitcherBridge`가 쓰는 것과 동일), `front/shared/auth/available-spaces.ts`의 `NormalizedAuthMeResponse.availableSpaces`, `SpaceIdentity`. `GlobalSpaceSelectionResult`(UI 타입)는 쓰지 않는다.

**Interfaces:**
```ts
export function PerspectiveToggle(p: { current: "member" | "host"; hostAvailable: boolean; pending?: { reason: string } | null; onSelect: (p: "member" | "host") => void }): JSX.Element | null
// hostAvailable=false → null. 마크업: <span class="qd-seg" data-spec="shell.perspective-toggle" role="radiogroup" aria-label="시야"><button role="radio" data-on>멤버</button><button role="radio" data-on>호스트</button></span>
export function ClubMenu(p: { clubs: { id: string; slug: string; name: string; avatarKey: string; perspectives: ("member" | "host")[]; current: boolean }[]; open: boolean; onSelect: (slug: string) => void }): JSX.Element
```

- [ ] **Step 1: 테스트** — (a) `hostAvailable=false`면 렌더 없음, (b) 현재 칸 `aria-checked=true`·`data-on="true"`, (c) 다른 칸 클릭 → `onSelect("host")`, (d) `pending`이면 두 버튼 `aria-disabled`와 `title=reason`, (e) 서명 `span.qd-seg>button+button`(생성기 `desktop_header`의 세그먼트를 `<button>`으로 바꾸고 계약 재추출), (f) 방향키 좌우로 포커스 이동. `ClubMenu`·`AccountMenu`·`AccountSheet`의 트리거 요소는 `data-spec-trigger="<열리는 spec>"`을 내고, `open=false`일 때 메뉴·시트의 `[data-spec]` 요소는 **렌더하지 않는다**(숨김이 아니라 unmount; 게이트의 정적 비교 전제).
- [ ] **Step 2~4**: 실패 → 구현 → PASS → 커밋 `feat(shell): perspective toggle and club menu`

### Task 1.2: `AccountMenu` / `AccountSheet`

**Interfaces:**
```ts
export function AccountMenu(p: { name: string; email: string; avatarKey: string; platformAdmin: boolean; open: boolean; onToggle: () => void; items: { profileTo: string; notificationSettingsTo: string; platformTo: string; onLogout: () => void } }): JSX.Element
export function AccountSheet(p: AccountMenuProps & { clubs: ClubMenuProps["clubs"]; onSelectClub: (slug: string) => void; perspective: PerspectiveToggleProps }): JSX.Element
```
- [ ] 테스트(`platformAdmin=false`면 `플랫폼 운영` 항목 없음; Escape·바깥 클릭으로 닫힘; 포커스 트리거 복귀) → 구현 → 커밋 `feat(shell): account menu and mobile account sheet`

### Task 1.3: `ClubShellHeader`, `ClubMobileHeader`, `ClubMobileTabBar`

**Interfaces:**
```ts
export function ClubShellHeader(p: { role: "member" | "host"; clubName: string; clubs: ClubMenuProps["clubs"]; nav: { label: string; to: string; current: boolean }[]; perspective: PerspectiveToggleProps; settings?: { to: string; current: boolean }; newMeetingTo?: string; notifications: { to: string; unread: boolean }; account: AccountMenuProps }): JSX.Element
export function ClubMobileHeader(p: { kicker: string; title: string; back?: { label: string; to: string }; perspective?: PerspectiveToggleProps; notifications?: { to: string; unread: boolean }; account?: { avatarKey: string; onOpen: () => void } }): JSX.Element
export function ClubMobileTabBar(p: { items: { label: string; icon: ReadmatesIconName; to: string; current: boolean }[] }): JSX.Element
```
- [ ] 계약 서명(`D21-ShellMenus.json`의 `shell.header`, `Main.json`의 `shell.primary-nav`, `M01-TodayPrep.json`의 `shell.mobile-header`/`shell.mobile-tabbar`) 테스트 → 구현 → CT(1440·768·390 오버플로 없음, 긴 클럽명 말줄임) → 커밋 `feat(shell): quiet-desk club shell header, mobile header and tab bar`

### Task 1.4: 앱 레이아웃에 새 셸 연결, 어드민 항목 제거

**Files:**
- Modify: `front/src/app/layouts/app-route-layout.tsx:680-790` — `TopNav`/`MobileHeader`/`MobileTabBar`/`AppClubShell` 자리에 `ClubShellHeader`·`ClubMobileHeader`·`ClubMobileTabBar`; `AppGlobalSpaceSwitcherBridge` import 제거.
- Modify: `front/src/app/global-space-switcher-bridge.tsx` → `usePerspectiveTransition()` 훅으로 축소(현재 identity, 옵션, `requestTransition` 노출). 컴포넌트 export는 슬라이스 8까지 남긴다(테스트 의존).
- Modify: `front/shared/routing/host-route-destinations.ts` — `HOST_UTILITY_HREFS.settings = "/app/host/settings"` 추가.
- Test: `front/src/app/layouts/app-route-layout.test.tsx`(기존) 갱신. **Create** `front/tests/e2e/space-transition.spec.ts`: (a) `front/tests/e2e/admin-approved-routes.spec.ts`의 전환기 메뉴 시나리오(`admin-space-switcher-desktop`, 열기·Escape·포커스 복귀)를 새 세그먼트(`[data-spec="shell.perspective-toggle"]`)와 계정 메뉴 `플랫폼 운영`/`내 클럽으로`로 포팅하고, (b) dirty·pending·unknown-outcome 전환은 E2E에 아직 없으므로 `front/src/app/global-space-transition-controller.test.tsx`의 해당 단위 케이스(blocked-pending, blocked-unknown, dirty confirm)를 행동 기준으로 **새로** 쓴다. BFF 지연은 `page.route`의 응답 지연으로 만든다. 기존 파일은 슬라이스 8까지 그대로.

- [ ] **Step 1**: 레이아웃 테스트에 "호스트 시야 헤더에 `플랫폼 운영` 텍스트가 없고 계정 메뉴에만 있다", "호스트 권한 없는 클럽에서 세그먼트가 없다" 추가 → FAIL → 구현 → PASS.
- [ ] **Step 2**: `space-transition.spec.ts`: 세그먼트 클릭으로 멤버↔호스트, dirty 폼에서 확인 대화상자, pending 중 비활성(응답 지연 route), unknown-outcome(응답 유실 route) 뒤 receipt 재조정, 계정 메뉴로 어드민 진입·복귀 — 포팅 1건 + 신규 시나리오 전부 통과.
- [ ] **Step 3**: `gen/registry.py`의 `IMPLEMENTED`에 `D21-ShellMenus`, `M22-AccountSheet` 추가 → `build.py` → `design-contract:extract`(불변이므로 diff 0) → `test:e2e:design-contract:docker` 2 passed(나머지 skip).
- [ ] **Step 4**: 커밋 `feat(shell): mount quiet-desk club shell; remove platform switcher from club chrome`

### Task 1.5: 어드민 셸

**Files:**
- Create: `front/features/platform-admin/ui/admin-shell-quiet.tsx` (`AdminSidebar`, `AdminTopBar`, `AdminAccountMenu`, `AdminMobileHeader`, `AdminMobileTabBar`, `AdminAccountSheet`)
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx:90-125` — 새 셸 사용; 옛 `AdminLayoutNav`·`AdminMobileNavigation`·`GlobalSpaceSwitcher` 제거(파일 삭제는 슬라이스 8).
- Consumes: 기존 shell controller의 capability·alarm summary(`attention.count`)·account action·authority loss; `admin-route-catalog.ts`의 visible area.

**Interfaces:**
```ts
export function AdminShellQuiet(p: { current: "today" | "clubs" | "service" | "records"; todayCount: number; status: { tone: "ok" | "warn"; sentence: string; to: string }; operator: { name: string; avatarKey: string }; returnToClub: { label: string; to: string } | null; onLogout: () => void; children: ReactNode }): JSX.Element
```
- [ ] 서명 테스트(`A02-Today.json`의 `admin.shell.sidebar`/`admin.shell.topbar`, `A13`의 `admin.shell.account-menu`, `AM1`의 모바일 둘, `AM8`의 시트) → 구현 → 기존 어드민 라우트 테스트 갱신(라벨 `오늘 · 클럽 · 서비스 · 기록`) → `IMPLEMENTED`에 `A13-AccountMenu`·`AM8-AccountSheet` 추가 후 재빌드, 게이트 2장 추가 통과 → 커밋 `feat(admin): quiet-desk admin shell with account menu exit to club`

**슬라이스 1 종료 기준:** 게이트 4장(D21, M22, A13, AM8) 통과, `space-transition.spec.ts` 통과, lint/test/build 초록, CHANGELOG Unreleased에 "공간 전환을 세그먼트로, 어드민 진입은 계정 메뉴로" 한 줄.

---

## 슬라이스 2 — 호스트 오늘

상세 계획은 시작 시 작성. 태스크 골격:

| Task | 파일 | 핵심 | 종료 |
| --- | --- | --- | --- |
| 2.1 `resolveTodayState(meeting, now, phaseQuery): TodayState` | `features/host/model/today-state.ts` + test | start/prep/live/record 판정, `?phase` 호환 | 단위 |
| 2.2 `buildStateSentence(state, meeting, nextMeeting): ReactNode` | `features/host/ui/today/state-sentence.tsx` | 스펙 §6.1 네 문장 | 단위 |
| 2.3 `mergeTodo(nextAction, workbox): TodoRailProps` | `features/host/model/todo-merge.ts` | 첫 항목 = nextAction, 같은 source 제외, cap 4/2 | 단위 |
| 2.4 `HostTodayPage` | `features/host/ui/today/host-today-page.tsx` | MeetingHead + 3 MeetingSection + TodoRail, 모바일 순서 | CT 1440/390 |
| 2.5 시작 전 | `host-today-start.tsx` | 체크리스트 3항(settings revision, invites, meetings) | 단위·CT |
| 2.6 당일 출석 | `today-live-section.tsx` | AttendanceRow ×N, 되돌리기, `모임 마치기` | 기존 attendance mutation 재사용 |
| 2.7 기록 작성 섹션 | `today-record-section.tsx` | Checklist 5단계 ← closing board 데이터 | 단위 |
| 2.8 라우트 연결 | `features/host/route/host-dashboard-route.tsx` | `HostOperatingRoomPage` → `HostTodayPage` | host-lifecycle E2E |
| 2.9 게이트 | `gen/registry.py` `IMPLEMENTED` += D01 Main D09 D10 M11 M01 M02 M03, 재빌드 | 8장 통과 + stress 통과 | design-contract |

## 슬라이스 3 — 호스트 모임

| Task | 핵심 | 화면 |
| --- | --- | --- |
| 3.1 `MeetingForm` 4절 + `SideIndex` + `SummaryCard`, `BookCover` 미리보기 | 기존 `basic-session-panel` 필드 이관 | D04 M05 |
| 3.2 수정 모드(4절 = 변경 사유와 알림, 저장 후 `/schedule-review` 제안) | 기존 lifecycle confirm | D06 M12 |
| 3.3 모임 목록(예정/지난, 월 rail, 상태 점) | 기존 `host-meeting-list` 데이터 | D14 M04 |
| 3.4 휴지통 | `?view=trash` 기존 호환 | D24 |
| 3.5 지난 모임 상세 = `HostTodayPage`의 모임 지정 모드 + `RecordCard` | `/sessions/:id` | D15 M15 |

## 슬라이스 4 — 호스트 멤버

| Task | 핵심 | 화면 |
| --- | --- | --- |
| 4.1 멤버 페이지(승인 대기 표 인라인 승인/거절, 탭, 원장, rail) | 기존 approval actions·status filter·name query | D03 M06 |
| 4.2 멤버 상세 | 4행 + 함께한 모임 + 멤버십 | D08 M07 |
| 4.3 일정 안내 보내기(간소화) | 기존 preview/confirm | D07 M10 |
| 4.4 새 초대 링크 대화상자 | 기존 named link 생성 | D23 M24 |

## 슬라이스 5 — 호스트 기록·설정

| Task | 핵심 | 화면 |
| --- | --- | --- |
| 5.1 기록 원장 + 배너 + 탭 | 기존 records cursor | D13 M08 |
| 5.2 기록 초안 편집기 + 소감 rail | 기존 record workspace·aigen | D11 M13 |
| 5.3 피드백 문서 | 기존 feedback document | D12 M14 |
| 5.4 멤버에게 게시 | 기존 publish + site visibility | D22 M23 |
| 5.5 설정 5절 + 목차 + 모바일 목록 | 기존 settings components | D02 D16~D19 M09 M16~M20 |
| 5.6 보낸 안내 | 기존 notifications utility | D20 M21 |

## 슬라이스 6 — 어드민 오늘·클럽

| Task | 핵심 | 화면 |
| --- | --- | --- |
| 6.1 오늘 큐·상세(`CaseQueue`/`CaseDocket`, 조치 링크 첫 버튼) | `allowedActions` 유지 | A02 AM1 AM2 |
| 6.2 오늘 빈 상태 | audit 최근 3 | A01 AM5 |
| 6.3 클럽 목록 + 하위 탭 | 기존 clubs ledger | A09 AM3 |
| 6.4 새 클럽 개설 3단계 | 기존 onboarding wizard | A04 |
| 6.5 클럽 상세 + 행동 rail | 기존 club operations | A05 AM6 |
| 6.6 지원 접근 발급 | 기존 support preview/confirm | A11 |

## 슬라이스 7 — 어드민 서비스·기록·긴급

| Task | 핵심 | 화면 |
| --- | --- | --- |
| 7.1 서비스 전체 표(`ExpandableRow`) + 하위 탭 | 기존 health grid | A06 AM4 |
| 7.2 알림 전달(실패 묶음 체크·재발송) | 기존 replay receipt | A03 AM9 |
| 7.3 AI 처리 | 기존 ai-ops | A10 |
| 7.4 처리 기록 + 상세 rail, 분석 | 기존 audit cursor·analytics | A07 A12 AM7 AM10 |
| 7.5 긴급 공개 회수(쉬운 용어) | 기존 takedown preview/confirm | A08 |

## 슬라이스 8 — 레거시 정리와 승격

| Task | 내용 |
| --- | --- |
| 8.1 | 선행 조건: `space-transition.spec.ts`·`design-contract-stress.spec.ts`가 존재하고 초록. 그다음 스펙 §9 삭제 목록 실행(파일 단위 커밋 여러 개), `package.json` 스크립트 정리, CI 옛 스텝 삭제 |
| 8.2 | `GlobalSpaceSwitcher`·`workspace-selector`·`approved-host-shell` 삭제, 남은 import 정리 |
| 8.3 | 화면별 CSS 삭제 후 `quiet-desk-css-parity`·게이트 71/71 재확인 |
| 8.4 | ADR-0054 `Accepted`, ADR-0053 `Superseded by ADR-0054`, ADR-0045/0048/0050/0051 update 절 추가, `front/DESIGN.md` 전면 갱신, `docs/agents/design.md`, README, CHANGELOG |
| 8.5 | `docs/reports/2026-MM-DD-quiet-desk-acceptance.md`: 게이트 결과, 픽셀 비율 보고, 사람 30초·보조기술 측정/미측정 |
| 8.6 | `docs/development/release-readiness-review.md`에 따라 `origin/main..HEAD` 검토 |

---

## Self-Review

- **Spec coverage:** §2 파이프라인 → Task 0.1~0.5. §3 셸 → 1.1~1.5. §4 화면 71장 → 슬라이스 2~7 표(모든 아트보드 id가 한 번씩 등장). §5 문법 → 0.7~0.9. §6 동작 → 2.x·3.2·4.3·5.4·6.1·7.x. §7 검증 → 0.5와 각 종료 기준. §8 순서 → 슬라이스 구조. §9 → 8.1~8.3. §10 → 0.10, 8.4. §11 위험 중 "DOM 서명 엄격도"는 0.4의 `IGNORED_CLASSES`와 속성 무시로, "생성기 언어"는 0.5의 `--no-font --check`로 다뤘다.
- **Placeholder scan:** 슬라이스 2~8은 의도적으로 골격이며 "각 슬라이스 시작 시 상세 계획 + pre-sdd-review"를 헤더에 명시했다. 슬라이스 0·1에는 TBD가 없다.
- **Type consistency:** `TodayState`(0.9, 2.1), `PerspectiveToggleProps`(1.1→1.2·1.3), `ClubMenuProps`(1.1→1.2·1.3), `AccountMenuProps`(1.2→1.3), `CircTone`(0.7 `CircIcon`→0.8 `TodoRail`/`RecordCard`), `HostBffPayloads`/`AdminBffPayloads`·`installDesignContractFixtures`(0.2→0.5·0.11), `domSignature`/`domSignatureSource`(0.4→0.5·0.7), `IMPLEMENTED`/`INTERACTIONS`(0.3→0.5·1.4·1.5·2.9), `SpaceTransitionRequestResult`·`useGlobalSpaceTransitionController`(1.1·1.4) 이름을 통일했다.
- **Pre-SDD review 최종 잔여 반영(READY 뒤):** PSDR-201 파일 구조 문구, PSDR-202 `loginAs` 잔존 삭제, PSDR-203 닫힌 메뉴 unmount 규칙, PSDR-204 `--check` 최종형 표기와 `render_screens_md` 인터페이스, PSDR-205 도커 러너를 Task 0.4에서 생성, PSDR-206 게이트의 `Region`·`collect` import 정리, PSDR-107 vitest 테스트 `import.meta.dirname`.
- **Pre-SDD review 2차 반영:** PSDR-101 전환 E2E는 포팅 1건 + 신규 작성, PSDR-102 `loginAs` 제거(auth/me mock), PSDR-103 interaction별 수집·Escape, PSDR-104 `rows[]`와 공용 `collect`, PSDR-105 `--check`에 registry·SCREENS 포함, PSDR-106 문구·stage 목록. 매핑 밖 LOW PSDR-107(vitest 테스트의 `__dirname`)은 실행자가 `import.meta.dirname`으로 통일해도 무방하며 검증 의미에는 영향 없음.
- **Pre-SDD review 반영(2026-09-06):** PSDR-001 출석 컨트롤 컨테이너 명명, PSDR-002 `implemented` 생성기 상수, PSDR-003 `qd-` 접두와 disjoint 테스트, PSDR-004 실제 헬퍼·설치기 이름과 키보드 스텝, PSDR-005 `interactions`와 `data-spec-trigger`, PSDR-006 `file://`+`addStyleTag`·해시·`--check`·`import.meta.dirname`, PSDR-007 ADR을 Task 0.0으로, PSDR-008 `space-transition.spec.ts`·stress spec, PSDR-009 계약은 Node 추출기만.
