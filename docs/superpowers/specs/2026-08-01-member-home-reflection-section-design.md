# ReadMates 멤버 홈 지난 모임 회고 섹션 설계

작성일: 2026-08-01

상태: 디자인 승인, 구현 전

## 1. 요약

멤버 홈 `/clubs/:clubSlug/app`의 `지난 모임 회고` 섹션은 현재 제목·요약·기록 종류 뒤에 `기록 보기`, `피드백 보기`, 피드백 상태 문구를 작은 flex 행으로 배치한다. 데스크톱에서는 긴 한국어 제목과 요약 때문에 action 묶음이 다음 줄의 가운데로 밀리고, 모바일에서는 두 작은 버튼과 상태 문구가 서로 다른 줄에 놓여 각 요소의 관계가 약해진다.

승인된 방향은 **문서 행 분리형**이다. 섹션을 `회고 안내`와 `문서 목적지` 두 영역으로 나누고, 기록과 피드백을 각각 설명과 상태를 가진 전체 행 link로 표현한다. 데스크톱에서는 두 영역을 좌우로 배치하고, 모바일에서는 문서 행을 본문 아래에 쌓는다. 기존 route, view model, API 계약과 권한 판정은 변경하지 않는다.

## 2. 현재 문제

1. `row-between`의 wrapping 결과에 따라 action 묶음이 카드 가운데에 떠 보이며 제목과의 연결이 끊긴다.
2. 기록만 primary 색상을 사용하지만 기록과 피드백의 실제 우선순위 차이는 화면에서 설명되지 않는다.
3. `feedbackStatusLabel`이 action 묶음의 별도 flex item이라 `피드백 보기`와 떨어져 보인다.
4. mobile `btn-sm` 두 개는 손가락으로 누르는 주 목적지에 비해 작고, hover가 없는 환경에서 클릭 영역도 분명하지 않다.
5. 데스크톱과 모바일이 같은 정보 구조를 공유하지만 별도 JSX 안에 action 배열이 반복되어 향후 상태 표현이 쉽게 어긋날 수 있다.

## 3. 목표

1. 사용자가 섹션을 훑는 즉시 지난 회차와 열 수 있는 두 문서를 이해하게 한다.
2. 피드백 상태 문구를 피드백 목적지에 직접 귀속시킨다.
3. desktop과 mobile 모두 기록과 피드백의 접근 가능한 클릭 영역을 최소 44px 이상으로 만든다.
4. 긴 한국어·영어 책 제목, 여러 `kindLabels`, 긴 상태 문구에도 action이 밀리거나 겹치지 않게 한다.
5. ReadMates의 warm paper, ink hierarchy, quiet archival identity를 유지한다.
6. 기존 member-home UI 경계와 현재 route continuity를 보존한다.

## 4. 비목표

- server, BFF, member-home API contract 또는 query 변경
- 최근 기록 선택 규칙, 세션 정렬 또는 `feedbackState` 판정 변경
- 새로운 피드백 preview, modal, drawer 또는 inline document 추가
- 세션 기록·피드백 문서 화면 자체의 재설계
- `지난 모임 회고` 외 다른 멤버 홈 카드의 시각 개편
- decorative icon, gradient, illustration 또는 새 디자인 토큰 추가
- 피드백이 없는 상태에서 접근 권한을 우회하는 link 추가

## 5. 검토한 접근

### 5.1 채택: 문서 행 분리형

회고 안내와 두 문서 목적지를 분리한다. 각 목적지는 제목, 짧은 설명 또는 상태, 방향 표시를 가진다. desktop에서는 안내 왼쪽·문서 행 오른쪽, mobile에서는 안내 위·문서 행 아래다.

- 장점: 목적·상태·클릭 영역의 관계가 가장 명확하다.
- 장점: 피드백이 잠김·없음 상태일 때 link가 아닌 상태 행으로 자연스럽게 바뀐다.
- 비용: 현재 모바일 카드보다 세로 높이가 약간 늘어난다.

### 5.2 제외: 하단 2분할 action rail

카드 하단을 `기록 보기`와 `피드백 보기` 두 칸으로 나누면 가장 컴팩트하다. 그러나 상태 문구가 여전히 rail 밖에 남고, 두 목적의 차이를 label만으로 설명하기 어렵다.

### 5.3 제외: 기록 중심 primary CTA

기록을 큰 primary button으로, 피드백을 작은 secondary link로 둘 수 있다. 기록이 항상 주 행동이라는 제품 근거가 없고 피드백 발견성을 불필요하게 낮추므로 채택하지 않는다.

## 6. 승인된 정보 구조와 문구

섹션은 다음 순서로 읽힌다.

1. eyebrow: `지난 모임 회고`
2. 제목: `No.{회차} · {책 제목}`
3. 기존 `entry.summary`
4. 기록 종류: `보존된 내용 · {kindLabels}`
5. 문서 목적지 1: `모임 기록 보기`
6. 목적지 1 설명: `질문과 회고를 이어 읽기`
7. 문서 목적지 2: `피드백 문서 보기`
8. 목적지 2 설명 또는 상태: 기존 `entry.feedbackStatusLabel`

`kindLabels`가 비어 있는 경우 `보존된 내용` prefix를 단독으로 노출하지 않는다. 현재 view model은 최근 세션의 note feed item에서 entry를 만들기 때문에 정상 데이터에서는 하나 이상의 label이 있지만, UI는 빈 배열에도 불완전한 문구를 만들지 않는다.

`entry.summary`의 데이터 생성과 문구는 이번 범위에서 유지한다. action 설명은 summary와 별개로 목적지의 차이를 설명한다.

## 7. 데스크톱 레이아웃

- `surface-quiet` 카드 안을 `회고 안내`와 `문서 navigation`으로 나눈다.
- 충분한 카드 너비에서는 안내 영역이 유동 폭을 차지하고 문서 navigation은 약 240~280px 폭을 가진다.
- navigation은 두 행을 세로로 쌓고 안내 영역과 사이에 한 개의 얇은 divider를 둔다.
- 각 link 행은 최소 높이 64px, 좌우 padding 16~18px을 사용한다.
- 행 내부는 왼쪽에 제목·설명, 오른쪽에 `aria-hidden` 방향 표시를 둔다.
- desktop viewport라도 실제 카드 폭이 좁아지는 중간 구간에서는 navigation을 안내 아래로 내린다. 이때 divider는 세로선에서 가로선으로 바뀌고 action text는 줄바꿈할 수 있다.
- title, summary와 status는 `min-width: 0`, `overflow-wrap: anywhere`를 유지해 긴 한국어·영어가 action 영역을 밀지 않게 한다.

## 8. 모바일 레이아웃

- 기존 `m-sec`과 `m-card-quiet` 외곽 rhythm을 유지한다.
- 안내 영역 아래에 full-width 문서 행 두 개를 쌓는다.
- 안내와 첫 행, 각 행 사이는 `line` 또는 `line-soft` divider로만 구분한다. 별도 중첩 card를 만들지 않는다.
- 각 행은 최소 높이 56px이고 전체 행이 클릭 영역이다.
- 제목과 설명은 두 줄 이상 자연스럽게 wrap할 수 있으며 화살표는 flex-shrink하지 않는다.
- 320px, 390px에서 horizontal scroll, text overlap, 잘린 focus ring이 없어야 한다.
- 화면 아래 고정 app tab과 겹치지 않는 기존 `m-body` spacing을 유지한다.

## 9. 상태별 동작

| `feedbackState` | 피드백 행 | 상태 표현 |
| --- | --- | --- |
| `AVAILABLE` | `feedbackHref`로 이동하는 link | `피드백 문서를 바로 열 수 있습니다.` |
| `UNKNOWN` | 현재와 동일하게 `feedbackHref`로 이동하는 link | `피드백 문서는 열람 화면에서 확인합니다.` |
| `MISSING` | link가 아닌 정적 상태 행 | `아직 열람 가능한 피드백 문서가 없습니다.` |
| `LOCKED` | link가 아닌 정적 상태 행 | `참석 멤버에게만 피드백 문서가 열립니다.` |

`MISSING`, `LOCKED` 행은 색상만 낮추지 않는다. 방향 표시를 제거하고 상태 문구를 함께 보여 클릭 불가 이유를 전달한다. `disabled` anchor나 빈 `href`는 사용하지 않는다.

최근 기록 entry가 없으면 현재와 같이 섹션 전체를 렌더링하지 않는다. 새로운 loading 또는 error state는 추가하지 않는다.

## 10. 컴포넌트와 경계

presentation 책임은 `front/features/member-home/ui/member-home-records.tsx` 안에 유지한다.

- `RecentRecordEntry`와 `MobileRecentRecordEntry`는 기존 props를 유지한다.
- 두 variant가 같은 action 구조와 상태 분기를 공유하도록 작은 내부 presentation component를 둔다.
- 내부 component는 `entry`와 `LinkComponent`만 받고 fetch, route, query 또는 API module을 import하지 않는다.
- desktop/mobile 차이는 semantic structure를 복제하기보다 wrapper class와 CSS layout으로 표현한다.
- 기존 `FeedbackAction`은 새 목적지 행 component에 흡수하거나, 단독 fragment가 아닌 한 행 전체를 소유하도록 변경한다.
- link destination, return-state continuity와 feedback authorization 의미는 view model과 기존 route가 계속 소유한다.

## 11. 시각 규칙

- 기존 `--bg-sub`, `--line`, `--line-soft`, `--text`, `--text-2`, `--text-3`, `--accent` token만 사용한다.
- 두 문서 행은 같은 구조와 기본 표면을 사용한다. 기록만 채운 primary button으로 강조하지 않는다.
- hover는 배경 또는 divider 대비를 미세하게 높이는 수준으로 제한한다.
- keyboard focus는 기존 focus token 또는 명확한 `:focus-visible` outline을 사용하고 card clipping에 가리지 않게 한다.
- decorative shadow, nested rounded card, colored icon circle, gradient는 추가하지 않는다.
- 제목은 현재 editorial type, action label과 상태는 읽기 쉬운 UI type hierarchy를 유지한다.

## 12. 접근성

- 전체 섹션은 기존 `aria-label="지난 모임 회고"`를 유지한다.
- 문서 묶음은 `nav aria-label="지난 모임 문서"` 또는 같은 의미의 접근 가능한 이름을 가진다.
- available/unknown 목적지는 native anchor semantics를 유지한다.
- missing/locked 목적지는 focusable하지 않은 status group으로 렌더링한다.
- 방향 표시는 `aria-hidden="true"`로 처리하고 link의 accessible name은 visible label과 설명으로 충분히 구성한다.
- link와 정적 상태의 차이는 색상뿐 아니라 arrow 유무, semantics, status copy로 전달한다.
- 모든 interactive 행은 WCAG 2.2 minimum target 기준보다 큰 44px 이상을 확보한다.

## 13. 예상 변경 표면

- `front/features/member-home/ui/member-home-records.tsx`
- `front/features/member-home/ui/member-home-records.test.tsx`
- `front/features/member-home/ui/member-home-records.ct.tsx`
- `front/src/styles/globals.css`
- `front/shared/styles/mobile.css`
- 필요 시 기존 E2E assertion을 유지·보강하는 `front/tests/e2e/host-session-record-preview.spec.ts`

model, API contract, server, BFF, migration은 예상 변경 표면에 포함하지 않는다.

## 14. 검증 계약

구현 시 최소 증거는 다음과 같다.

1. focused unit test
   - desktop과 mobile에 두 목적지 label과 올바른 href가 존재
   - `AVAILABLE`, `UNKNOWN`은 피드백 link 제공
   - `MISSING`, `LOCKED`는 피드백 link 없이 상태 문구 제공
   - 긴 제목과 여러 kind label에서 semantic content 유지
2. component test
   - 1200px desktop에서 안내와 navigation이 좌우로 정렬
   - 390px와 320px mobile에서 문서 행이 세로로 쌓이고 44px 이상 target 확보
   - Korean/English wrapping에서 `scrollWidth <= clientWidth`
   - desktop/mobile 승인 screenshot baseline
3. browser evidence
   - `/clubs/reading-sai/app`에서 실제 fixture member로 desktop과 mobile 확인
   - 두 link가 기존 기록·피드백 경로로 이동하고 return continuity 유지
4. frontend gates
   - `corepack pnpm --dir front lint`
   - `corepack pnpm --dir front test`
   - `corepack pnpm --dir front build`
   - user-flow assertion을 변경하면 focused `corepack pnpm --dir front test:e2e -- host-session-record-preview.spec.ts`

## 15. 완료 기준

- action이 desktop에서 제목 아래 가운데로 고립되지 않는다.
- desktop과 mobile에서 두 문서의 목적과 피드백 상태가 한 번의 scan으로 이해된다.
- link 가능한 상태와 link 불가 상태가 semantic·visual하게 구분된다.
- 320px, 390px, desktop에서 겹침·잘림·가로 스크롤이 없다.
- 기존 href, feedback authorization, entry 선택과 route continuity가 유지된다.
- 관련 unit, component, responsive browser evidence와 frontend gate가 통과한다.
