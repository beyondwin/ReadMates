# Quiet Desk — 호스트·어드민 리디자인과 코드 네이티브 시안 계약

- 상태: Approved design (2026-09-06 브레인스토밍에서 사용자 승인), implementation not started
- 범위: 호스트 앱(`/app/host/**`, `/clubs/:slug/app/host/**`)과 플랫폼 어드민(`/admin/**`)의 전 화면 재구성, 멤버·호스트·어드민 공유 셸과 공간 전환 UX, 시안 → 구현 → 검증을 잇는 새 시각 권위 파이프라인, 기존 PNG 권위·픽셀 게이트 레거시 정리
- 비범위: 서버 API·BFF 프로토콜·DB 스키마 변경, 멤버·공개·게스트 화면 composition 변경(공유 셸 헤더만 예외), 새 서버 기능(시안에 `제안` 배지가 붙은 항목 중 서버 의미가 필요한 것은 클라이언트 표현만 바꾸고 서버 계약은 유지)
- ADR impact: **new** ADR-0054(코드 네이티브 시안 계약, ADR-0053 supersede), **update** ADR-0048(호스트 라벨·오늘 구성·할 일 통합), ADR-0050(어드민 라벨·하위 탭·조치 링크·빈 상태), ADR-0051(공간 전환 표현: 어드민 분리, 세그먼트 토글), ADR-0045(공용 문법 primitive 확장)
- 시안 소스: `design/mockups/2026-09-06-quiet-desk/` (생성기 `gen/*.py`, 아트보드 `*.dc.html` 71장, `canvas.json`). 리뷰 캔버스: https://claude.ai/code/artifact/b76a5cd3-073c-4bd7-b346-287dc910a9e4 (참고용, 권위는 커밋된 소스)
- 관련: `docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md`(이 문서가 대체), `docs/reports/2026-09-05-admin-host-visual-fidelity-punch-list.md`, `front/DESIGN.md`, `docs/agents/design.md`, `design/system/src/styles/tokens.css`

## 0. 왜 다시 하는가

1. 기존 시안 18장은 이미지 모델이 생성한 래스터 PNG였다. 폰트·간격·토큰이 없는 "그림"을 구현 세션이 눈대중으로 옮겼고, 픽셀 게이트(ADR-0053, 0.02)는 2026-09-06 재측정에서 18/18 실패했다. 구성이 시안과 같은 화면은 5장 안팎이었다. 이 실패는 구현 능력 문제가 아니라 **시안이 측정 불가능한 형식**이었기 때문이다.
2. 현재 호스트 UX는 `운영실 · 일정과 모임 · 사람 · 기록`, `준비실 · 현장 · 마감실`처럼 시스템 은유가 많고, `다음에 할 일`과 `작업함`이 같은 내용을 두 번 보여 준다. 공간 전환은 2단계 드롭다운(현재 범위 → 이동할 범위 → 내 클럽 → 클럽 → 시야)이라 멤버↔호스트 왕복이 번거롭고 지금 어디인지 보이지 않는다.
3. 로컬 `main`이 `origin/main`보다 86커밋 앞서 있으나 시각 권위 CI 잡이 실패해 push하지 못한다. 새 파이프라인은 이 잡을 대체해야 한다.

## 1. 결정 요약

| # | 결정 |
| --- | --- |
| 1 | 시안은 코드 네이티브 HTML 아트보드(`.dc.html`)로 만들고 저장소에 커밋한다. PNG 18장과 픽셀 게이트는 폐기한다. |
| 2 | 시안과 구현은 **같은 CSS 파일과 같은 토큰**을 쓴다. 시안 생성기는 런타임 CSS를 읽어 인라인한다. 시안에만 있는 스타일은 없다. |
| 3 | 시안의 모든 의미 영역에는 `data-spec` 이름이 있고, 구현 컴포넌트는 같은 이름과 같은 DOM 골격을 낸다. "시안대로 구현됐다"의 정의는 `data-spec` 계약(존재·순서·DOM 서명·geometry·typography) 통과다. |
| 4 | 시안과 E2E 픽스처는 **같은 가상 데이터 파일**을 쓴다. 같은 렌더러·같은 폰트·같은 데이터이므로 실제 라우트 스크린샷과 시안 렌더를 픽셀 비교할 수 있지만, 픽셀 비교는 보조 지표이고 게이트는 아니다. |
| 5 | 메뉴는 세 역할이 같은 문법: 멤버 `오늘 · 노트 · 기록`, 호스트 `오늘 · 모임 · 멤버 · 기록` + `설정` + `새 모임`, 어드민 `오늘 · 클럽 · 서비스 · 기록` + `긴급 공개 회수`. 첫 메뉴는 항상 `오늘`, 끝은 `기록`. |
| 6 | 호스트 `오늘`은 상태 문장 한 줄 + 이번 모임 3섹션(준비 현황 · 당일 출석 · 모임 기록, 상태에 맞는 것만 펼침) + 할 일(첫 항목 펼침). 진행 표시·단계 탭·`운영실`·`준비실/현장/마감실`·`초대와 설정`·`작업함`·`마감/정리` 라벨은 없어진다. |
| 7 | 어드민은 클럽 헤더에서 빠진다. 진입은 `/admin` 직접 URL과 계정 메뉴 `플랫폼 운영`(권한 있을 때만), 출구는 계정 메뉴 `내 클럽으로`. 클럽 안에서는 클럽명(정적, 2개 이상일 때만 ▾) + `[멤버 | 호스트]` 세그먼트 한 번 클릭으로 시야를 바꾼다. |
| 8 | 모든 라우트 URL은 유지한다. 바뀌는 것은 라벨·구성·컴포넌트·CSS다. 서버 계약(availableSpaces, allowedActions, revision, receipt, cursor)은 그대로다. |
| 9 | 코드에 없는 기능은 시안에 넣지 않는다. 새 제안(`제안` 배지)은 클라이언트 계산으로 구현 가능한 것만이다: 오늘 시작 전 체크리스트, 할 일 통합 rail, 상태 문장, 멤버 페이지 초대 링크 보조 액션, 어드민 클럽 상세의 `이 클럽으로 이동`. |
| 10 | 새 게이트가 초록이 된 뒤 레거시(PNG, manifest, 픽셀 헬퍼, approved-routes E2E 18개, `GlobalSpaceSwitcher`, 옛 라벨 사전, 실패 중인 CT/E2E)를 삭제한다. 삭제는 마지막 슬라이스다. |

## 2. 시각 권위 파이프라인

### 2.1 소스 오브 트루스 계층

| 계층 | 파일 | 역할 |
| --- | --- | --- |
| 토큰 | `design/system/src/styles/tokens.css` | 색·타입·간격·반경·모션. 변경 없음 |
| 문법 CSS | `front/shared/styles/quiet-desk.css` (**신규**) | 호스트·어드민·공유 셸의 컴포넌트 클래스. 모든 클래스는 `qd-` 접두로 시작한다(예: `.qd-topnav`, `.qd-m-row`). 예외로 `tokens.css`의 `.btn*`, `.badge*`, `.h1~.h4`, `.small`, `.tiny`, `.mono`는 접두 없이 그대로 재사용하고 quiet-desk에서 다시 정의하지 않는다(`.btn-danger`만 quiet-desk가 추가). 시안 생성기가 이 파일을 읽어 아트보드에 인라인한다. 시안 전용 CSS는 없다 |
| 가상 데이터 | `design/mockups/2026-09-06-quiet-desk/gen/fixtures.json` (**신규**) | 클럽·모임·멤버·할 일·어드민 케이스 등 시안에 보이는 모든 값. E2E 픽스처(`front/tests/e2e/support/*-approved-route-fixtures.ts`)가 같은 파일을 import한다 |
| 아트보드 | `design/mockups/2026-09-06-quiet-desk/*.dc.html` | 화면 composition 권위. 생성기 출력물이며 손으로 고치지 않는다 |
| 계약 | `front/tests/e2e/support/design-contract/<Screen>.json` (**신규**) | 아트보드에서 Node 추출기(§2.4)가 뽑은 `data-spec` 계약. 파이썬 생성기의 출력물이 아니다 |
| 최종 실행 권위 | 실제 인증 라우트 | 계약과 비교되는 대상 |

현재 `gen/lib.py`는 토큰과 문법 CSS를 파이썬 문자열로 들고 있고, 그 클래스 35개(`.topnav`, `.nav-link`, `.page-header`, `.input`, `.m-hdr`, `.m-row`, `.m-tabbar` 등)가 멤버·공개 화면이 쓰는 `tokens.css`·`globals.css`·`mobile.css`의 클래스와 이름이 겹친다. 런타임에 그대로 넣으면 멤버 화면이 바뀐다. Task 0.1에서 (1) 토큰은 `tokens.css`를 읽어 인라인, (2) 문법 CSS는 `qd-` 접두로 일괄 개명해 `quiet-desk.css`로 옮기고 생성기 프래그먼트의 클래스도 같은 커밋에서 개명, (3) `tokens.css` 재사용 목록(위 표)에 있는 클래스는 quiet-desk와 생성기에서 정의를 삭제한다. 단위 테스트가 quiet-desk 선택자와 `tokens.css`·`globals.css`·`mobile.css` 선택자의 교집합이 재사용 목록과 정확히 같음을 검사한다. 이 이동이 끝나기 전에는 어떤 화면도 구현하지 않는다. 개명 뒤 아트보드를 다시 빌드해 캔버스로 재게시하고, 재사용으로 값이 달라진 곳이 있으면(예: `.btn` 색) 캔버스에서 다시 확인받는다.

### 2.2 생성기 (`design/mockups/2026-09-06-quiet-desk/gen/`)

- `build.py`: 아트보드 71장 + `canvas.json` + `front/tests/e2e/support/design-contract/registry.json` + `SCREENS.md`(화면 ↔ 라우트 ↔ data-spec ↔ 카피 표)를 생성한다. 계약 JSON(`design-contract/<Screen>.json`)은 만들지 않는다. 그것은 §2.4의 Node 추출기만 만든다. 플래그: `--no-font`(폰트 서브셋 생략), `--check`(출력과 커밋된 파일을 `@font-face` 블록을 제거한 뒤 비교, 다르면 종료 코드 1). Pretendard Variable을 사용 글자만 서브셋해 각 아트보드에 심는다(리뷰 캔버스 표시용, `fonttools` `brotli` 필요, 없으면 폰트 없이 생성하고 경고).
- `lib.py`: 아이콘(`front/shared/ui/icon.tsx`와 같은 path), 셸 프래그먼트. 프래그먼트 함수 하나 = 런타임 컴포넌트 하나(§5.1 표).
- `host_desktop.py`, `host_mobile.py`, `mobile_more.py`, `admin.py`, `extra.py`: 화면 함수.
- 커밋하지 않는 것: `readmates-quiet-desk.html`(조립된 캔버스, 11MB), Playwright 스크린샷. `.gitignore`에 추가.
- 실행: `python3 -m venv .venv && .venv/bin/pip install fonttools brotli && .venv/bin/python gen/build.py`. Node 스크립트로 옮기지 않는다(fontTools가 필요하고 CI에서는 폰트 없이 돌려도 계약 추출은 같다).

### 2.3 `data-spec` 이름 규칙과 레지스트리

- 형식: `역할.화면.영역[.하위]`, 소문자와 하이픈. 역할은 `shell` `host` `admin`.
- 셸: `shell.header` `shell.primary-nav` `shell.perspective-toggle` `shell.club-menu` `shell.account-menu` `shell.account-sheet` `shell.back-bar` `shell.mobile-header` `shell.mobile-tabbar`, 어드민은 `admin.shell.sidebar` `admin.shell.topbar` `admin.shell.account-menu` `admin.shell.account-sheet` `admin.shell.mobile-header` `admin.shell.mobile-tabbar`.
- 화면 영역은 §4 표의 마지막 열이다. 고유 이름 수는 `registry.json`이 계산한다(2026-09-06 아트보드 기준 112개).
- 열림 상태가 있는 영역(`shell.club-menu`, `shell.account-menu`, `shell.account-sheet`, `admin.shell.account-menu`, `admin.shell.account-sheet`)은 아트보드에 열린 채 그려져 있다. 레지스트리의 화면 항목은 `interactions: ["open:<spec>"]`로 이를 선언하고, 런타임은 그 영역을 여는 트리거에 `data-spec-trigger="<spec>"`을 붙인다. `open=false`일 때 메뉴·시트의 `[data-spec]` 요소는 렌더하지 않는다(숨김이 아니라 unmount). 게이트는 이를 전제로 먼저 열림 영역을 제외한 나머지를 수집·비교하고, 그다음 interaction을 **하나씩** 처리한다: 트리거 클릭 → 그 영역만 수집·비교 → Escape → 숨김·포커스 복귀 확인. 아트보드에는 여러 메뉴가 동시에 열려 있어도 각 메뉴는 absolute 배치라 서로의 박스에 영향을 주지 않으므로 개별 비교가 성립한다.
- 규칙: 한 화면에서 같은 이름은 한 번만 나온다. 반복 행(출석 행, 원장 행, 할 일 행)은 이름을 갖지 않고 **컨테이너**가 이름을 갖는다. 현재 아트보드 `D09`(7회)·`M02`(6회)는 `host.live.attendance-control`을 행마다 내는데 이는 이 규칙과 어긋나므로 Task 0.3에서 출석 목록 컨테이너 한 곳으로 옮긴다(행은 `.qd-att`로 반복 행 허용 오차 ±2px 검사). 런타임 컴포넌트는 이름을 props로 받지 않고 자기 이름을 고정으로 낸다(같은 컴포넌트가 다른 화면에서 쓰이면 같은 이름). 이름을 바꾸면 시안·계약·구현 세 곳이 함께 바뀐다.
- **Task 0 보강 대상**: 모바일 M13·M14·M17·M18·M20·M24는 헤더 외 `data-spec`이 없다. 데스크톱 짝과 같은 이름(`host.record-draft.editor`, `host.feedback-doc.form`, `host.settings.club`, `host.settings.cohost`, `host.settings.close`, `host.invites.new`)을 붙인다. D16의 클럽 설정 폼도 `host.settings.club`을 붙인다. `D09`·`M02`의 `host.live.attendance-control`은 행에서 떼어 출석 목록 컨테이너에 한 번만 붙인다.

### 2.3.1 레지스트리 스키마

`registry.json`은 생성기 출력물이며 손으로 고치지 않는다. 화면 항목: `{ id, file, route, role, viewport, specs[], interactions[], implemented }`. `implemented`는 `gen/registry.py`의 `IMPLEMENTED` 집합에서 나오며, 슬라이스가 화면을 끝내면 그 집합에 id를 추가하고 재빌드한다. 게이트는 `implemented: false`인 화면을 `skip`으로 보고한다.

### 2.4 계약 추출 (`front/scripts/extract-design-contract.ts`, 신규)

Playwright(저장소 pinned Jammy 이미지)로 각 아트보드 파일을 `page.goto("file://…")`로 열고, 서브셋 `@font-face`를 제거한 뒤 `page.addStyleTag({ path: node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css })`로 번들 Pretendard를 넣어 프레임 크기(1440 또는 390)로 렌더하고 `data-spec` 요소마다 다음을 기록한다. `artboardSha256`은 커밋된 아트보드 파일 바이트의 해시다.

```json
{
  "screen": "Main", "route": "/app/host", "viewport": {"width": 1440, "height": 960},
  "regions": [
    {"spec": "host.today.state", "order": 4,
     "box": {"x": 137, "y": 158, "w": 380, "h": 25},
     "dom": "div.qd-state>span.qd-accent.qd-dot+b+span+span+span+a.qd-text-link",
     "type": {"selector": "b", "family": "Pretendard Variable", "size": 16, "weight": 600, "lineHeight": 24.8, "color": "oklch(0.18 0.02 255)"},
     "rows": []}
  ]
}
```

- `order`: 문서 순서. `dom`: 직계 자식까지의 태그·클래스 서명(텍스트 제외). `type`: 영역 안 대표 텍스트 노드(첫 `h1/h2/h3/b/.qd-t/.qd-a` 우선)의 계산 값. `rows`: 영역 안 반복 행(`table.qd-ledger tbody tr, .qd-todo-row, .qd-m-row, .qd-att, .qd-check`)의 `{y, h}` 목록(없으면 빈 배열).
- 폰트 서브셋 `@font-face`는 추출 시 제거하고 저장소 번들 Pretendard(`pretendard/dist/web/variable`)를 로드한다. 런타임과 같은 폰트 파일이다.

### 2.5 게이트 (`front/tests/e2e/design-contract.spec.ts`, 신규; 기존 `approved-routes` 대체)

실제 인증 라우트를 같은 픽스처로 렌더하고 계약과 비교한다. 화면당 한 시나리오, 뷰포트는 계약 파일이 정한다.

| 검사 | 기준 | 실패 시 |
| --- | --- | --- |
| 존재·순서 | 계약의 `data-spec`이 모두 있고 문서 순서가 같다 | 게이트 실패 |
| DOM 서명 | `dom` 문자열 일치 | 게이트 실패 |
| geometry | 주요 영역 박스 ±4 CSS px; 영역 안 반복 행(`table.qd-ledger tbody tr`, `.qd-todo-row`, `.qd-m-row`, `.qd-att`, `.qd-check`)은 계약의 `rows[]`(각 행의 y·h)와 비교해 행 높이·행 간격 ±2 px | 게이트 실패 |
| typography | family·size·weight·line-height·color 일치 | 게이트 실패 |
| 오버플로 | 가로 스크롤 없음, 텍스트 겹침 없음(기존 helper) | 게이트 실패 |
| ARIA·키보드 | 기존 `visual-authority-contract.ts` DOM/ARIA 검사, 탭·세그먼트 방향키, 포커스 복귀 | 게이트 실패 |
| 픽셀 | 시안 렌더 vs 라우트, `maxDiffPixelRatio` 0.01 | **보고만** (`docs/reports`), 게이트 아님 |
| 스트레스 | `design-contract-stress.spec.ts`: 320px, 200% 확대 proxy(320×350), 장문 클럽·책 이름 픽스처 변형, 빈 목록, 오류 상태에서 가로 오버플로·겹침·44px 타깃 | 게이트 실패(기존 `approved-route-stress.spec.ts` 대체, 슬라이스 0에서 만든 뒤 슬라이스 8에서 옛 것 삭제) |

- 실행: `pnpm --dir front test:e2e:design-contract:docker`. CI의 시각 권위 잡은 이 명령으로 교체한다. 기존 `test:e2e:approved-routes:docker`는 레거시 정리 슬라이스에서 삭제한다.
- 픽스처는 `gen/fixtures.json`을 import해 BFF 응답으로 변환한다. 시안 숫자와 픽스처 숫자가 어긋나면 게이트가 아니라 빌드가 실패한다(fixture 변환 단위 테스트).
- 무효화: `quiet-desk.css`, `tokens.css`, 공유 컴포넌트, `fixtures.json`, 아트보드가 바뀌면 계약을 다시 생성해야 한다. 게이트는 시나리오 시작 전에 현재 아트보드 파일의 SHA-256과 계약의 `artboardSha256`을 비교하고 다르면 실패한다(`stale contract`).
- 키보드: `shell.perspective-toggle`과 `.qd-tabs`는 방향키로 이동, 메뉴·시트는 Escape로 닫히고 포커스가 트리거로 돌아온다. 게이트가 화면마다 이 동작을 실행한다.

### 2.6 리뷰 루프

1. 아트보드 수정은 생성기 파이썬만 고친다. `build.py` → 캔버스 재조립(`seed-canvas.mjs`) → 아티팩트 재게시.
2. 캔버스에서 손으로 조정한 결과는 소스가 아니다. 반영하려면 생성기에 옮기고 다시 빌드한다.
3. 승인된 아트보드 변경은 계약 재생성과 함께 커밋한다. 커밋 하나에 아트보드·계약·구현이 함께 바뀌는 것이 정상이다.

## 3. 공유 셸과 공간 전환

### 3.1 데스크톱 클럽 셸 (`shell.header`)

```
ReadMates  을지로 북살롱[▾]   오늘  모임  멤버  기록      [+ 새 모임] [멤버|호스트]  ⚙ 설정  🔔  ◉ 하늘 ▾
```

- 높이 64px, 좌우 32px. 호스트 시야는 하단선 2px `--accent`, 멤버 시야는 1px `--line`.
- 클럽명은 정적 15px/600. `availableSpaces.clubs.length > 1`일 때만 `chevron-down` 16px과 `shell.club-menu`(폭 320, 항목 44px, 클럽만 나열, 클럽 전환 시 시야 유지·불가하면 멤버) 활성.
- `shell.perspective-toggle`: 36px 세그먼트, 두 칸 `멤버` `호스트`, 현재 칸 `--accent` 채움. 이 클럽에 host perspective가 없으면 렌더하지 않는다. 클릭은 기존 `GlobalSpaceTransitionController` 경로(dirty/pending/unknown-outcome 규칙 유지)를 그대로 호출한다. pending 중 `aria-disabled`와 이유 `title`.
- 호스트 오른쪽 그룹 순서: `새 모임`(primary, plus 16) → 세그먼트 → `설정`(gear 18) → 종 → 계정. 멤버 시야: 세그먼트 → 종 → 계정.
- `shell.account-menu`(폭 280): 프로필 헤더 → 내 프로필 · 알림 설정 → (권한 시) `플랫폼 운영 ›` → 로그아웃. 어드민 항목은 여기에만 있다.
- 기존 `GlobalSpaceSwitcher`, `topnav-global-context`, `.rm-workspace-switch`는 새 셸이 들어온 뒤 삭제한다(§9).

### 3.2 모바일 클럽 셸

- `shell.mobile-header` 52px: 왼쪽 kicker(`호스트 · 오늘` / `멤버`, 12px text-3) + 클럽명(15px/600, 한 줄 말줄임). 오른쪽 `swap` 아이콘 버튼(접근 이름 "호스트로 전환"/"멤버로 전환") · 종 · 아바타. 작업 화면(새 모임, 일정 안내, 기록 초안 등)은 `← 뒤로` + 제목, 오른쪽 비움.
- `shell.mobile-tabbar` 64px + safe-area: `오늘 · 모임 · 멤버 · 기록`, 아이콘 24 stroke 1.6, 라벨 12/600, 현재 탭 상단 4px 점.
- `shell.account-sheet`: 하단 시트. 프로필 → 클럽 목록 → `멤버/호스트 시야로 전환` → 내 프로필 → (권한 시) 플랫폼 운영 → 로그아웃.
- 작업 화면의 주 버튼은 `.m-sticky-cta`(하단 고정, 탭바 위 또는 화면 맨 아래).

### 3.3 어드민 셸

- 좌측 `admin.shell.sidebar` 208px `--bg-sub`: 브랜드(`ReadMates` / `플랫폼 운영`) → 그룹 라벨 `운영` → `오늘(N) · 클럽 · 서비스 · 기록`(44px, 활성은 왼쪽 2px `--accent` + 600 + 아이콘 accent, 배경 없음) → 하단 `긴급 공개 회수`(danger 톤).
- 상단 `admin.shell.topbar` 72px: 상태 문장 링크(`서비스는 정상이며, 확인할 일이 3건 있습니다 ›` → `/admin/health`; 이탈 시 warn 아이콘·문구) + 계정 메뉴(`내 클럽으로` → 마지막 클럽·시야 return target, 없으면 클럽 선택; `긴급 공개 회수`; `로그아웃`).
- 콘텐츠 `.adm-main` 최대 1240px, 좌우 40px. 오늘은 `.adm-body` 38/62 큐·상세.
- 모바일: `admin.shell.mobile-header` + 4탭 `오늘 · 클럽 · 서비스 · 기록`. 조치(재발송·개설·지원 접근·긴급 회수)는 모바일에서 하지 않고 데스크톱 안내 문장을 둔다. `admin.shell.account-sheet`에 `내 클럽으로`·`긴급 공개 회수`.

## 4. 여정과 화면 목록

번호는 실제 사용 순서다. 라우트는 현재 코드 그대로다. 아트보드 파일은 `design/mockups/2026-09-06-quiet-desk/`.

### 4.1 호스트 데스크톱 (24)

| # | 화면 | 라우트 | 아트보드 | 화면 고유 `data-spec` |
| --- | --- | --- | --- | --- |
| ① | 오늘 · 시작 전(모임 없음) | `/app/host` | `D01-TodayStart` | `host.today.start`, `host.today.start-checklist` |
| ② | 설정 › 초대 링크 | `/app/host/settings#invitations` (기존 canonical fragment; 다른 절도 기존 section id를 fragment로 사용) | `D02-SettingsInvites` | `host.settings.header`, `host.settings.index`, `host.settings.invites` |
| ②′ | 새 초대 링크(대화상자) | 같은 라우트 | `D23-NewInvite` | `host.invites.new` |
| ③ | 멤버 · 가입 승인 | `/app/host/people` | `D03-Members` | `host.members.header`, `.pending`, `.ledger`, `.schedule-rail` |
| ④ | 새 모임 | `/app/host/sessions/new` | `D04-NewMeeting` | `host.meeting-form.header`, `.index`, `.book`, `.cover-preview`, `.schedule`, `.audience`, `.review` |
| ⑤ | 오늘 · 준비 중 | `/app/host` | `Main` | `host.today.meeting-header`, `.state`, `.schedule-facts`, `.prep`, `.live`, `.record`, `.todo` |
| ⑥ | 모임 수정 | `/app/host/sessions/:id/edit` | `D06-EditMeeting` | ④와 동일 + 변경 사유 필드 |
| ⑦ | 일정 안내 보내기 | `/app/host/sessions/:id/schedule-review` | `D07-ScheduleNotice` | `host.schedule-notice.header`, `.composer`, `.recipients` |
| ⑧ | 멤버 상세 | `/app/host/people/:membershipId` | `D08-Person` | `host.person.header`, `.current`, `.history`, `.membership` |
| ⑨ | 오늘 · 당일 출석 | `/app/host` (모임 당일) | `D09-TodayLive` | ⑤ + `host.live.attendance-control` |
| ⑩ | 오늘 · 기록 작성 | `/app/host` (모임 후) | `D10-TodayRecord` | ⑤와 동일, `host.today.record` 펼침 |
| ⑪ | 기록 초안 | `/app/host/sessions/:id/closing?section=records` | `D11-RecordDraft` | `host.record-draft.header`, `.editor`, `.notes` |
| ⑫ | 피드백 문서 | `/app/host/sessions/:id/feedback-document` | `D12-FeedbackDoc` | `host.feedback-doc.header`, `.form`, `.preview` |
| ⑫′ | 멤버에게 게시 | `/app/host/sessions/:id/closing?section=publish` | `D22-Publish` | `host.publish.header`, `.preview`, `.confirm` |
| ⑬ | 기록 | `/app/host/records` | `D13-Records` | `host.records.header`, `.banner`, `.tabs`, `.ledger` |
| ⑭ | 모임 | `/app/host/sessions` | `D14-Meetings` | `host.meetings.header`, `.upcoming`, `.past`, `.month` |
| ⑭′ | 모임 · 휴지통 | `/app/host/sessions?view=trash` | `D24-Trash` | `host.meetings.trash` |
| ⑮ | 지난 모임 상세 | `/app/host/sessions/:id` | `D15-PastMeeting` | ⑤ 헤더 + `host.past-meeting.record` |
| ⑯ | 설정 › 클럽 설정 | `/app/host/settings` | `D16-SettingsClub` | `host.settings.club` |
| ⑰ | 설정 › 공동 호스트 | `/app/host/settings#co-host-title` | `D17-SettingsCoHost` | `host.settings.cohost` |
| ⑱ | 설정 › 변경 이력 | `/app/host/settings#settings-history-title` | `D18-SettingsHistory` | `host.settings.history` |
| ⑲ | 설정 › 운영 종료 | `/app/host/settings#close-club-title` | `D19-SettingsClose` | `host.settings.close` |
| ⑳ | 알림 · 보낸 안내 | `/app/host/notifications` | `D20-Notifications` | `host.notifications.header`, `.ledger` |
| — | 공유 셸 · 멤버 시야 + 메뉴 | `/app` | `D21-ShellMenus` | `shell.club-menu`, `shell.account-menu` |

### 4.2 호스트 모바일 (24, 390×844)

`M11 시작 전`, `M05 새 모임`, `M01 준비 중`, `M10 일정 안내`, `M02 당일 출석`, `M03 기록 작성`, `M04 모임`, `M06 멤버`, `M07 멤버 상세`, `M08 기록`, `M09 설정(목록)`, `M12 모임 수정`, `M13 기록 초안`, `M14 피드백 문서`, `M15 지난 모임 상세`, `M16~M20 설정 각 절`, `M21 보낸 안내`, `M22 계정·클럽 시트`, `M23 멤버에게 게시`, `M24 새 초대 링크`. 라우트와 `data-spec`은 데스크톱 짝과 같다. 모바일 고유: `shell.mobile-header`, `shell.mobile-tabbar`, `shell.account-sheet`.

### 4.3 어드민 데스크톱 (13)

| # | 화면 | 라우트 | 아트보드 | 화면 고유 `data-spec` |
| --- | --- | --- | --- | --- |
| ① | 오늘 · 확인할 일 없음 | `/admin/today` | `A01-TodayQuiet` | `admin.today.quiet`, `admin.today.header` |
| ② | 오늘 · 할 일 + 상세 | `/admin/today?case=…` | `A02-Today` | `admin.today`, `.queue`, `.docket`, `.actions` |
| ③ | 서비스 › 알림 전달(조치) | `/admin/notifications` | `A03-Notifications` | `admin.service.notifications`, `admin.service.header`, `admin.subtabs`, `admin.service.replay` |
| ④ | 클럽 목록 | `/admin/clubs` | `A09-Clubs` | `admin.clubs`, `.header`, `.ledger`, `admin.subtabs` |
| ⑤ | 새 클럽 개설 | `/admin/clubs` (onboarding) | `A04-NewClub` | `admin.clubs.new`, `.header`, `.steps` |
| ⑥ | 클럽 상세 | `/admin/clubs/:clubId` | `A05-ClubDetail` | `admin.clubs.detail`, `.header`, `.actions` |
| ⑦ | 지원 접근 발급 | `/admin/support` | `A11-SupportAccess` | `admin.clubs.support`, `admin.support.header` |
| ⑧ | 서비스 · 전체 | `/admin/health` | `A06-Service` | `admin.service`, `.header`, `.table`, `admin.subtabs` |
| ⑨ | 서비스 › AI 처리 | `/admin/ai-ops` | `A10-AIOps` | `admin.service.ai`, `.ai-recovery` |
| ⑩ | 기록 · 처리 기록 | `/admin/audit` | `A07-Records` | `admin.records`, `.header`, `.filters`, `.ledger`, `.detail` |
| ⑪ | 기록 › 분석 | `/admin/analytics` | `A12-Analytics` | `admin.records.analytics`, `admin.analytics.kpis` |
| ⑫ | 긴급 공개 회수 | `/admin/public-takedown` | `A08-Takedown` | `admin.takedown`, `.header`, `.steps`, `.target`, `.confirm` |
| ⑬ | 계정 메뉴 · 내 클럽으로 | 어느 화면 | `A13-AccountMenu` | `admin.shell.account-menu` |

### 4.4 어드민 모바일 (10)

`AM1 오늘 목록`, `AM2 할 일 상세`, `AM3 클럽`, `AM4 서비스`, `AM5 오늘 없음`, `AM6 클럽 상세`(`admin.clubs.detail.info`, `.stats`), `AM7 기록`, `AM9 알림 전달 상태`, `AM10 분석`, `AM8 계정 시트`.

### 4.5 아트보드 없이 구현하는 화면

승인 거절 확인, 공동 호스트 선택, 당일 진행 순서(`?section=agenda`), 지원 접근 확인·영수증, 긴급 회수 3단계 영수증, 오류·권한 없음·로딩 상태. 모두 §5의 문법(`StatePanel`, `Banner`, 대화상자 = `D23` 형태)으로 짓고 새 `data-spec`은 `역할.화면.영역` 규칙으로 추가한다. 추가하면 아트보드도 만든다(추가 시점의 슬라이스에서).

## 5. 공용 문법과 CSS 계약

### 5.1 프래그먼트 ↔ 컴포넌트 ↔ 클래스

표의 클래스는 개명 전 이름이다. Task 0.1 뒤 실제 클래스는 `qd-` 접두가 붙는다(`.topnav` → `.qd-topnav`). `.btn*`, `.badge*`는 `tokens.css` 것을 그대로 쓴다.

| 생성기 프래그먼트 | 런타임 컴포넌트(신규 `front/shared/ui/quiet-desk/`) | 루트 클래스 | `data-spec` |
| --- | --- | --- | --- |
| `desktop_header` | `ClubShellHeader` | `.topnav[data-role]` | `shell.header`, `shell.primary-nav`, `shell.perspective-toggle`, `shell.club-menu`, `shell.account-menu` |
| `mobile_header` / `mobile_tabbar` | `ClubMobileHeader` / `ClubMobileTabBar` | `.m-hdr` / `.m-tabbar` | `shell.mobile-header`, `shell.mobile-tabbar` |
| `page_header` | `PageHeader` | `.page-header` | 화면별 `*.header` |
| `back_bar` + `meeting_ctx` | `BackBar` | `.back-bar` | `shell.back-bar` |
| `meeting_head` | `MeetingHead` | `.meeting-head` | `host.today.meeting-header`, `.state`, `.schedule-facts` |
| 섹션(`.sec`) | `MeetingSection` | `.sec[data-state]` | `host.today.prep/live/record` |
| `prep_rows` + `table.ledger` | `Ledger` | `table.ledger` | 화면별 `*.ledger` |
| `todo_rail` | `TodoRail` | `aside` + `.todo-first` + `.todo-row` | `host.today.todo` |
| `att_row` ×N (컨테이너) | `AttendanceList` → `AttendanceRow` | `.qd-att-list` > `.qd-att` + `.qd-pill-seg` | `host.live.attendance-control`(컨테이너에만) |
| `.check` | `Checklist` | `.check[data-state]` | `host.today.start-checklist`, `host.today.record` |
| `.tabs`/`admin_tabs` | `StatusTabs` | `.tabs` `.tab[aria-selected]` | `host.records.tabs`, `admin.subtabs` |
| `.side-index` | `SideIndex` | `.side-index` | `host.settings.index`, `host.meeting-form.index` |
| `.summary-card` | `SummaryCard` | `.summary-card` | `host.meeting-form.review`, `admin.clubs.new` 요약 |
| `.banner` | `Banner` | `.banner` | `host.records.banner` 등 |
| `checkbox` / `.radio` / `.field` / `.input` | `Checkbox` / `RadioCard` / `Field` | 동명 | — |
| `.card` + `.todo-row` 조합 | `RecordCard` | — | `host.past-meeting.record`, `admin.takedown.target` |
| `admin_shell` | `AdminShell` | `.adm` `.adm-side` `.adm-top` | `admin.shell.*` |
| `.case` / `.docket` | `CaseQueue` / `CaseDocket` | `.case` `.docket` | `admin.today.queue`, `.docket`, `.actions` |
| `.exp-sum` | `ExpandableRow` | `tr` + `.exp-sum` | `admin.service.table` |
| `.step-bar` | `StepBar` | `.step-bar` | `admin.clubs.new.steps`, `admin.takedown.steps` |
| `.stat` | `Stat` | `.stat` | `admin.clubs.detail.stats`, `admin.analytics.kpis` |
| 기존 `StatePanel` | 유지, 클래스만 `quiet-desk.css`로 | `.rm-state-panel` | — |

규칙: 컴포넌트는 프래그먼트와 **같은 DOM 골격**을 낸다(태그·클래스·순서). 텍스트·숫자·링크만 props다. 새 클래스가 필요하면 `quiet-desk.css`와 생성기 프래그먼트를 같은 커밋에서 바꾼다. 기존 `admin-*.css`, `host-editorial-ledger.css` 등 화면별 CSS는 슬라이스마다 해당 화면에서 제거되고, 마지막 슬라이스에서 파일이 삭제된다.

### 5.2 밀도·타입 수치 (토큰 별칭으로 표현)

| 항목 | 데스크톱 | 모바일 |
| --- | --- | --- |
| 헤더 | 64px, 좌우 32 | 52px, 좌우 14 |
| 콘텐츠 최대폭 | 호스트 1472(거터 32) / 어드민 1240(좌우 40) | 390, 좌우 18 |
| 페이지 제목 | h1 28/600 `-0.015em` | 24/600 |
| kicker · 상태 문장 | 14 text-3 · 16 text-2 | 12 · 14 |
| 섹션 제목 | 20/600 | 17/600 |
| 원장 행 | 56px, 셀 좌우 12, 표는 `-12px` 마진 | `.m-row` 최소 60, 상하 12 |
| 할 일 행 · rail 행 | 60px, 원형 아이콘 32 | 52px, 아이콘 28 |
| 컨트롤 | 버튼 38 / lg 46, 입력 44, 세그먼트 36, 체크박스 20 | 최소 44 |
| 두 열 | 62/38, rail 왼쪽 선 1px + 패딩 32 | 단일 열 |
| 모션 | `--motion-fast/page/reveal`, reduced-motion 0.001ms | 동일 |

### 5.3 상태·톤 규칙

- 값 열은 톤 색 + 텍스트(`확인` ok, `아직 안 봄` warn, `작성 필요` danger, `초안` accent). 색만으로 상태를 말하지 않는다. 배지는 상태 하나(`D-3`, `오늘`, `게시됨`, `설정 필요`)에만.
- 정상은 조용한 텍스트, 주의·지연·실패만 톤. 초록 배지 벽 금지.
- 출석 컨트롤은 `출석 | 불참` 텍스트 두 칸, 각 64×36, 선택은 soft 배경 + 600, 아이콘 없음. 미확인은 둘 다 비움(ADR-0024 명시적 UNKNOWN).
- 체크박스 20px, 미선택 테두리 `--ink-500`, 선택 `--accent` 채움 + 흰 체크 13px/stroke 3. 표 셀 안에서도 체크는 흰색.

### 5.4 용어 사전 (추가·변경, `readmates-copy.ts`·`admin-copy.ts`에 반영)

| 이전 | 이후 |
| --- | --- |
| 운영실 · 일정과 모임 · 사람 · 기록 | 오늘 · 모임 · 멤버 · 기록 |
| 준비실 · 현장 · 마감실 | 준비 현황 · 당일 출석 · 모임 기록 (섹션 이름) |
| 다음에 할 일 / 작업함 | 할 일 |
| 초대와 설정 | 설정 (안에 초대 링크 절) |
| 마감 · 정리 · 기록 마감 | 기록 작성 · 게시 |
| 미열람 | 아직 안 봄 |
| 말소된 모임 | 휴지통 · 7일 안에 복구 |
| 멤버 시야 (유틸 링크) | 세그먼트 `멤버` |
| 플랫폼 운영 / 내 클럽 (전환기) | 계정 메뉴 `플랫폼 운영` / `내 클럽으로` |
| 오늘 할 일 · 클럽 관리 · 서비스 상태 · 처리 기록 (어드민 내비) | 오늘 · 클럽 · 서비스 · 기록 (페이지 제목은 그대로 `처리 기록` 등) |
| 회수 · 영수증 · 캐시 무효화 (긴급 회수 화면 카피) | 내리기 · 기록 페이지에 남아요 · 사이트에서 사라지는 데 몇 분 |
| 세부 조작 · 자세히 보기 | 삭제. 링크는 대상 명사 + 동사(`응답 보기`) |

## 6. 화면 동작 명세

각 화면의 구현 계획 항목은 아래 여덟 줄을 채운다. 여기서는 새 로직이 있는 화면만 적는다. 나머지는 기존 라우트 컨트롤러·쿼리를 그대로 쓰고 표현만 바꾼다.

### 6.1 호스트 오늘 (`/app/host`)

- **상태 결정**(클라이언트 파생, 서버 값 변경 없음): 서버가 고른 현재 모임이 없으면 `start`; 있으면 lifecycle과 날짜로 `prep`(공개 전/준비), `live`(모임 당일 00:00~종료 전, 또는 `?phase=live`), `record`(CLOSED 이후 PUBLISHED 전). 기존 `phase` 쿼리는 호환 유지(`prep→prep`, `live→live`, `closing→record`).
- **상태 문장** `host.today.state`: `start` 없음 / `prep` `모임까지 N일 · 멤버에게 공개됨|초안 · 다음 모임 M월 D일 ›` / `live` `오늘 오후 h:mm · 장소 · 참석 예정 N명` / `record` `모임 끝 · 기록 작성 중 · M월 D일 모임 · 다음 모임 ›`. 다음 모임 링크는 예정 모임이 있을 때만.
- **이번 모임 섹션**: `.sec[data-state]`는 상태에 따라 `done|current|todo`. current만 펼침. done/todo는 한 줄 요약 + 선택적 링크(`미리 보기 ›`, `고치기 ›`). 섹션 클릭으로 펼침 전환은 하지 않는다(요약 링크만).
- **할 일** `host.today.todo`: 기존 `resolveNextAction` 결과가 첫 항목(제목·이유·primary·보류). 기존 workbox 항목(일정 미열람·가입 승인·기록 작성·초대 만료·알림 실패)이 나머지 행. 첫 항목과 같은 source의 workbox 항목은 제외(중복 제거). 데스크톱 4행·모바일 2행 + `완료한 일 ›`/`할 일 N개 더 ›`. 보류는 기존 defer 계약.
- **facts 클릭** → `/sessions/:id/edit`. `변경 이력` → 기존 history panel. `모임 정보` → `/sessions/:id`.
- **시작 전** `start`: 체크리스트 3항(클럽 설정 저장 여부 = settings revision ≥ 2, 초대 링크 ≥ 1, 모임 ≥ 1). 완료는 체크, 현재는 primary 버튼.
- 모바일: 할 일이 이번 모임 섹션보다 먼저. 당일은 `.m-sticky-cta`에 되돌리기 + `모임 마치기 → 기록 작성`.

### 6.2 새 모임 / 모임 수정

- 4절 한 페이지 + `SideIndex`(현재 절은 스크롤 spy). 필드는 현재 `basic-session-panel`의 필드 그대로(제목·책·저자·링크·표지 URL + `BookCover` 미리보기 96px, 날짜·시간·질문 마감·장소·온라인 링크·참여 코드, 보이기). 저장 후 오늘로 이동.
- 수정: 4절이 `변경 사유와 알림`. 일정이 바뀐 저장은 기존 lifecycle confirm(사유·설명) 뒤 `/schedule-review`로 이어질지 묻는다(자동 발송 없음).

### 6.3 일정 안내 보내기 (`/schedule-review`)

- 화면은 제목·본문·받는 사람·보내기만. 바뀐 내용은 상태 문장 한 줄. 받는 사람은 서버 preview의 대상 그대로(체크박스 없음, `이미 확인한 N명 ›`는 목록 보기). 보류·취소는 기존 계약.

### 6.4 멤버 / 멤버 상세

- 승인 대기 표: 행에 `승인` `거절` 버튼(기존 approval actions). 원장 탭 `전체 · 일정 안 봄 · 미응답 · 쉬는 중`(기존 status filter 매핑). 이름 찾기는 기존 name query. rail은 기존 schedule-seen 집계 + `안 본 멤버에게 안내 보내기` → `/schedule-review`.
- 상세: 이번 모임 4행(접속·일정 확인·응답·출석) + 함께한 모임 + 멤버십(가입·승인·상태·`쉬는 중으로`·`내보내기`). 노트·소감 본문은 보이지 않는다.

### 6.5 기록 작성 5단계

- `host.today.record` 체크리스트: 출석 확정 → 소감 수집 → 기록 초안 → 피드백 문서 → 멤버에게 게시. 기존 closing board 5단계 데이터 그대로. 각 행 링크: 출석 보기(오늘 당일 섹션 `고치기`), 미작성 안내(기존 notification utility), 초안 만들기(`?section=records` = `D11`), 문서 열기(`/feedback-document` = `D12`), 게시(`?section=publish` = `D22`).
- 게시 범위 `멤버에게만 / 멤버 + 공개 사이트`는 기존 site visibility 축을 그대로 쓴다(ADR-0022).

### 6.6 어드민 오늘

- 케이스 상세 `admin.today.actions`: 첫 버튼은 케이스 종류별 조치 라우트 링크(알림 → `/admin/notifications`, 공개 기록 → `/admin/public-takedown` 또는 클럽 상세, AI → `/admin/ai-ops`). 상태 버튼(`30분 뒤`, `확인함`)은 서버 `allowedActions`에 있을 때만.
- 빈 상태 `admin.today.quiet`: 마지막 확인·최근 처리 3건(audit 최근 3) + 바로 가기.
- 조치 화면 상단 `shell.back-bar` `← 오늘 · 알림 전달 지연`은 return target으로 복귀.

### 6.7 어드민 하위 탭

- 서비스 `전체(/health) · 알림 전달(/notifications) · AI 처리(/ai-ops)`, 클럽 `전체 · 확인 필요 · 운영 중(필터) · 지원 접근(/support)`, 기록 `처리 기록(/audit) · 분석(/analytics)`. 탭은 라우트 링크이며 active는 현재 라우트.

## 7. 검증

| 단계 | 명령 | 통과 기준 |
| --- | --- | --- |
| 생성기 | `.venv/bin/python design/mockups/2026-09-06-quiet-desk/gen/build.py --no-font --check` | 71장 아트보드 + `registry.json` + `SCREENS.md`가 커밋된 것과 diff 없음(CI 검사) |
| 계약 추출 | `pnpm --dir front design-contract:extract --check` | `design-contract/<Screen>.json` 71개가 커밋된 것과 diff 없음 |
| 단위 | `pnpm --dir front test` | 상태 결정 함수, 할 일 병합, 라벨 사전, 픽스처 변환, `quiet-desk.css`가 생성기와 동일, `data-spec` 레지스트리 ↔ 컴포넌트 일치 |
| 컴포넌트 | `pnpm --dir front test:ct:docker` | 각 컴포넌트가 프래그먼트와 같은 DOM 서명을 낸다(계약 JSON의 `dom`으로 검사). 스냅샷은 보조 |
| 계약 | `pnpm --dir front test:e2e:design-contract:docker` | §2.5 게이트 71/71 통과. 픽셀 비율은 보고서에 기록 |
| 흐름 | `pnpm --dir front test:e2e` (host-lifecycle, route continuity, authority-loss, admin flows) | 기존 통과 유지, 라벨 변경 반영 |
| lint/build | `pnpm --dir front lint`, `pnpm --dir front build` | error 0 |
| 사람 | 호스트 1명·운영자 1명이 첫 화면에서 30초 안에 "지금 할 일"을 찾는다 | `docs/reports`에 기록. 미측정이면 `not measured`로 적고 완료 주장하지 않음 |
| 보조기술 | VoiceOver/Safari, NVDA/Chrome | 같은 방식으로 기록 |

패키지 매니저는 Corepack(`npx --yes corepack@0.35.0 pnpm --dir front ...`). Docker 컨텍스트는 `colima-readmates-va`.

## 8. 마이그레이션 순서와 슬라이스

각 슬라이스는 spec → plan → 구현 → 게이트 통과 → 커밋. 슬라이스 안에서 데스크톱과 모바일을 함께 끝낸다.

| # | 슬라이스 | 포함 | 종료 기준 |
| --- | --- | --- | --- |
| 0 | 기반 | **ADR-0054 Proposed를 첫 커밋으로**(ADR-0045/0048/0050/0051 README 비고에 'ADR-0054 §영향에 따라 update 예정'), `quiet-desk.css` 이관(`qd-` 개명), 생성기 토큰·CSS 읽기, `fixtures.json`, `data-spec` 보강, 계약 추출기, 게이트·스트레스 spec 뼈대, CI 잡 교체(옛 잡은 비활성), 공용 컴포넌트 §5.1 전부, 용어 사전 | 컴포넌트 CT가 71장 계약의 `dom`과 일치. 게이트는 셸 화면(`D21`)만 통과 |
| 1 | 공유 셸 | 클럽 헤더·세그먼트·클럽 메뉴·계정 메뉴·모바일 헤더·탭바·시트, 어드민을 클럽 크롬에서 제거, 어드민 셸(사이드바·상단바·계정 메뉴), 전환 안전 E2E `space-transition.spec.ts` 신설(기존 `admin-approved-routes.spec.ts`의 전환기 메뉴 열기·Escape·포커스 시나리오를 새 세그먼트로 포팅하고, dirty/pending/unknown-outcome 시나리오는 `front/src/app/global-space-transition-controller.test.tsx`의 단위 케이스를 행동 기준으로 새로 쓴다) | `D21`, `M22`, `A13`, `AM8` 통과. `space-transition.spec.ts` 통과 |
| 2 | 호스트 오늘 | 상태 결정, 상태 문장, 3섹션, 할 일 통합, 시작 전, 당일 출석 컨트롤 | `D01 D05 D09 D10`, `M11 M01 M02 M03` 통과. host-lifecycle E2E 통과 |
| 3 | 호스트 모임 | 모임 목록·휴지통·새 모임·수정·지난 모임 상세 | `D04 D06 D14 D15 D24`, `M04 M05 M12 M15` |
| 4 | 호스트 멤버 | 멤버·상세·일정 안내·초대 링크 대화상자 | `D03 D07 D08 D23`, `M06 M07 M10 M24` |
| 5 | 호스트 기록·설정 | 기록·초안·피드백·게시·설정 5절·보낸 안내 | `D02 D11 D12 D13 D16~D20 D22`, `M08 M09 M13 M14 M16~M21 M23` |
| 6 | 어드민 오늘·클럽 | 오늘(빈/할 일)·클럽 목록·개설·상세·지원 접근 | `A01 A02 A04 A05 A09 A11`, `AM1 AM2 AM3 AM5 AM6` |
| 7 | 어드민 서비스·기록·긴급 | 서비스·알림·AI·기록·분석·긴급 회수 | `A03 A06 A07 A08 A10 A12`, `AM4 AM7 AM9 AM10` |
| 8 | 레거시 정리 | §9 삭제 목록, ADR-0054 Accepted, ADR-0053 Superseded, `front/DESIGN.md`·README·CHANGELOG 갱신, `origin/main` push 조건 점검 | 게이트 71/71, 삭제 후 lint/test/build/E2E 초록 |

슬라이스 2~7은 서로 독립이라 병렬 가능하지만, 0·1이 끝난 뒤에만 시작한다.

## 9. 레거시 정리 목록 (슬라이스 8)

삭제: `docs/development/host-redesign-mockups/*.png|*.html|shared.css`(README는 "역사, 권위 아님" 한 줄로 축소), `design/mockups/2026-08-30-admin-operations-redesign/`, `design/mockups/2026-08-27-admin-case-desk/`, `front/tests/e2e/support/approved-mockup-manifest.ts`, `approved-mockup-contract.ts`, `approved-route-geometry.ts`, `approved-route-scenarios.ts`, `approved-route-harness.ts`, `admin-approved-routes.spec.ts`, `host-approved-routes.spec.ts`, `approved-route-stress.spec.ts`, `front/scripts/run-visual-authority-docker.ts`, `list-affected-visual-authorities.ts`, `front/shared/ui/global-space-switcher.tsx`(+test), `workspace-selector.tsx`, `workspace-switch-icon.tsx`, `features/host/ui/approved-host-shell.tsx`(+test/story), `approved-host-ledgers.*`, 실패 중인 `host-workbox-stage4.spec.ts`·`host-operating-room-responsive.ct.tsx`·`approved-host-ledgers.ct.tsx`, 화면별 CSS(`host-editorial-ledger.css`, `admin-*.css` 중 `quiet-desk.css`로 대체된 것), `front/__screenshots__` 중 대체된 스냅샷.
갱신: `front/DESIGN.md`(새 권위 계층), `docs/agents/design.md`(코드 네이티브 시안 절), `docs/development/adr/README.md`, `CHANGELOG.md` Unreleased, `front/package.json` 스크립트(`test:e2e:approved-routes:docker` 제거), CI 워크플로.
보존: `docs/reports/2026-09-0*`(역사 기록), `docs/superpowers/specs/2026-09-0*`(archive).

## 10. ADR

- **ADR-0054 (new, Proposed → 슬라이스 8에서 Accepted)**: "코드 네이티브 시안 계약을 호스트·어드민 시각 권위로 사용". 결정: 시안은 런타임 CSS·토큰·픽스처를 공유하는 `.dc.html` 생성물이며, `data-spec` 계약(존재·순서·DOM 서명·geometry·typography)이 합격 기준이다. 픽셀 비교는 보고용. 대안 기각: PNG 권위 유지(측정 불가), 스냅샷만(drift 고착), 픽셀 게이트(폰트·데이터 불일치로 실패). ADR-0053을 supersede.
- **ADR-0048 update**: 4축 라벨 `오늘 · 모임 · 멤버 · 기록`, 운영실 → 오늘(상태 문장 + 3섹션), 다음 행동 + 작업함 → 할 일. 다음 행동 계산 규칙·작업함 source·출석 cap·전환 안전은 유지.
- **ADR-0050 update**: 내비 라벨 `오늘 · 클럽 · 서비스 · 기록`, 축 내부 하위 탭, 케이스 첫 버튼 = 조치 라우트, 빈 상태 구성.
- **ADR-0051 update**: 2축 모델과 서버 projection 유지. 표현은 클럽 헤더에서 platform 항목 제거, perspective는 세그먼트, club은 클럽명 메뉴, platform 진입·출구는 계정 메뉴.
- **ADR-0045 update**: 공용 primitive에 §5.1 컴포넌트와 `quiet-desk.css` 단일 파일 원칙 추가. 아이콘 primitive 규칙 유지(`gear` `swap` `check` `undo` `copy` `grid` `sparkle` `download` `chart` 추가).

## 11. 위험과 미해결

- **생성기 언어**: 파이썬 + fontTools. 프론트 CI는 Node다. 계약 추출은 Node(Playwright)로, 아트보드 생성은 파이썬으로 둔다. CI에서는 "커밋된 아트보드 = 생성기 출력" 검사만 하고 폰트 서브셋은 건너뛴다(`--no-font`).
- **DOM 서명 엄격도**: 서명이 너무 엄격하면 접근성 마크업(sr-only, aria) 추가마다 시안을 갱신해야 한다. 서명은 태그·클래스만 보고 `aria-*`·`id`·`.rm-sr-only`는 무시한다.
- **데이터 형태 차이**: 시안은 최대 12명·5행 등 짧은 목록이다. 긴 목록·빈 목록·오류는 `StatePanel`과 `더 보기`로 처리하며 별도 stress E2E(기존 `approved-route-stress` 대체)가 320px·200% zoom·장문을 검사한다.
- **모바일 조치 제한**: 어드민 모바일은 조치를 하지 않는다. 운영자가 원하면 후속 슬라이스.
- **사람·보조기술 검증**은 자동화되지 않는다. 미측정이면 미측정으로 적는다.
- **push 차단**: 슬라이스 0에서 CI 잡을 교체하면 옛 픽셀 잡은 사라지지만 새 게이트도 처음엔 셸 화면만 통과한다. 게이트는 "계약이 있는 화면만" 검사하므로 슬라이스마다 통과 범위가 늘어난다. push 여부는 릴리스 준비 검토(`docs/development/release-readiness-review.md`)로 따로 판단한다.
