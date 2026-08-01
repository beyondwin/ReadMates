# ReadMates 호스트 대시보드 모바일 정돈 설계

작성일: 2026-08-01
상태: USER-APPROVED
대상 표면: frontend, host dashboard, mobile UI/UX
Canonical route: `/clubs/:slug/app/host`

## 1. 배경

호스트 대시보드의 기존 우선순위 운영 원장 구조는 유지한다. 이번 작업은 모바일 화면에서 현재 세션 카드의 내부 여백이 사라지고, 수치가 불균형하게 줄바꿈되며, 상태와 행동 문구가 서로 맞지 않아 판단이 느려지는 문제를 좁게 해결한다.

사용자 제공 모바일 화면과 현재 코드를 대조한 결과, 직접적인 간격 문제는 다음 조합에서 발생한다.

- `.rm-host-dashboard-mobile__session-card`가 edge-to-edge CTA를 위해 `padding: 0`을 사용한다.
- 카드 본문 여백을 담당하도록 정의된 `.rm-host-dashboard-mobile__session-head`가 현재 모바일 컴포넌트에서 렌더링되지 않는다.
- 공통 스타일의 세션 수치 3열이 모바일 스타일에서 2열로 덮어써져 세 번째 수치가 홀로 다음 줄에 배치된다.
- `참석 1/6`과 `참석 1명`처럼 같은 의미가 카드 안에서 반복된다.

이 문제는 전역 카드 스타일 변경이 아니라 호스트 현재 세션 카드의 구조와 전용 스타일을 맞추는 방식으로 해결한다.

## 2. 목표와 성공 기준

- 책 제목, 회차, 날짜, 수치가 카드 테두리와 최소 18px 떨어져 안정적으로 읽힌다.
- 참석, 읽기, 질문 수치 3개가 320px 이상 모바일에서 한 줄의 균형 잡힌 상태 rail로 보인다.
- 현재 상태와 primary action의 의미가 일치한다.
- 동일한 참석 정보를 한 카드에서 반복하지 않는다.
- 처리 대기 영역이 펼칠 수 있는 항목임을 화살표, 수치 배지, 44px 이상의 터치 영역으로 알 수 있다.
- 예정 세션의 시간 의미가 잘못된 경우 이를 `다음 세션`으로 오인시키지 않는다.
- 기존 우선순위 순서인 `페이지 제목 → 지금 처리할 일 → 현재 세션`을 유지한다.
- 데스크톱 레이아웃, API, BFF, 서버, DB, 권한 계약을 변경하지 않는다.

## 3. Non-goals

- 호스트 대시보드 전체 정보 구조 재설계.
- 멤버 앱, 공개 화면, 플랫폼 관리자 화면 변경.
- 새 API 필드, endpoint, migration 추가.
- 세션 공개, 시작, 마감의 도메인 규칙 변경.
- 전역 모바일 카드나 버튼 스타일 변경.
- 알림 발송, AI provider 호출, 실제 운영 데이터 변경.
- 배포, push, release 작업.

## 4. 검토한 접근

### A. CSS 여백만 복구

카드 자식 요소에 개별 padding을 추가하고 기존 DOM은 유지한다.

장점:

- 변경량이 가장 작다.
- 제목이 테두리에 붙는 문제는 빠르게 해결한다.

단점:

- 어떤 요소가 카드 본문인지 구조적으로 표현되지 않는다.
- 수치 줄바꿈, 정보 중복, 상태와 행동 불일치는 남는다.
- 자식 순서가 바뀌면 selector 기반 padding이 다시 깨질 수 있다.

### B. 현재 구조를 유지한 모바일 카드 정돈 — 선택

현재 세션 본문을 명시적인 content wrapper로 묶고, 수치·보조 상태·CTA를 역할별로 정리한다. 처리 대기와 예정 세션도 같은 모바일 행동 문법에 맞춘다.

장점:

- 직접적인 간격 결함과 판단 흐름을 함께 해결한다.
- 기존 route, view model, mutation 계약을 유지할 수 있다.
- 변경 범위를 호스트 모바일 UI와 전용 스타일에 한정할 수 있다.

단점:

- JSX 구조, 전용 CSS, 컴포넌트 테스트, 모바일 E2E 증거가 함께 필요하다.
- 상태별 CTA 문구는 현재 연결 가능한 route와 일치하는지 구현 전에 확인해야 한다.

### C. 모바일 호스트 대시보드 전면 재설계

탭 또는 별도 작업 화면으로 현재 세션, 원장, 예정 세션을 분리한다.

장점:

- 화면 길이를 더 크게 줄일 수 있다.

단점:

- 긴급 상태의 발견 가능성을 낮춘다.
- 기존 승인된 우선순위 운영 원장 구조를 불필요하게 다시 연다.
- URL 상태, 탐색, 테스트 범위가 크게 늘어난다.

선택한 접근은 B다.

## 5. 모바일 정보 구조

페이지 전체 순서는 유지한다.

```text
모임 운영
└─ 지금 처리할 일 (최대 3건)
└─ 현재 세션
   ├─ 상태와 회차
   ├─ 책과 일정
   ├─ 참석·읽기·질문 수치
   ├─ 보조 상태
   └─ primary action
└─ 확인할 운영 항목 (접힘/펼침)
└─ 예정 세션과 운영 흐름
└─ 운영 도구 (접힘/펼침)
```

이번 작업은 `지금 처리할 일`의 우선순위 계산이나 페이지 순서를 바꾸지 않는다.

## 6. 현재 세션 카드

### 6.1 구조

```text
현재 세션                              [마감 필요]

┌──────────────────────────────────────┐
│ No.09 · D+17                         │
│ 돈의 심리학 (당신은 왜 부자가        │
│ 되지 못했는가)                       │
│ 2026.07.15 · 20:00 · 온라인          │
│                                      │
│ 참석 1/6      읽기 1/6      질문 1/30│
│ 미응답 4명                           │
├──────────────────────────────────────┤
│ 세션 문서 열기                    →  │
└──────────────────────────────────────┘
```

### 6.2 본문 여백

- 카드 자체는 full-width CTA를 위해 `padding: 0`을 유지할 수 있다.
- 회차, 제목, 일정, 수치, 보조 상태는 `.rm-host-dashboard-mobile__session-head` 같은 명시적인 wrapper 안에 둔다.
- wrapper는 좌우 18px, 위 18px, 아래 16px을 기본값으로 한다.
- 본문과 CTA 사이에는 `var(--line-soft)` 구분선을 둔다.
- 카드 외부는 기존 모바일 section의 `var(--m-page-x)`를 사용한다.

### 6.3 회차와 상태

- 화면 제목이 이미 `현재 세션`이므로 `이번 세션` 배지는 제거한다.
- 회차와 상대 시점은 `No.09 · D+17`처럼 한 줄의 보조 메타데이터로 표현한다.
- `마감 필요`, `진행 중`, `준비 중`과 같은 운영 상태는 section header 우측에 하나만 둔다.
- 상태는 색상만으로 구분하지 않고 텍스트를 항상 포함한다.

### 6.4 책 제목과 일정

- API가 구조화된 부제를 제공하지 않으므로 전체 제목 문자열을 의미적으로 임의 분할하지 않는다.
- 전체 제목은 `overflow-wrap: anywhere`와 `line-height: 1.35`로 2~3줄까지 자연스럽게 감싼다.
- 제목을 CSS line clamp로 숨기지 않는다.
- 일정은 `날짜 · 시간 · 장소` 한 줄을 우선하되, 320px에서 자연 줄바꿈을 허용한다.

### 6.5 핵심 수치

- 참석, 읽기, 질문 3개는 `repeat(3, minmax(0, 1fr))` 한 줄을 사용한다.
- 각 항목은 중앙 정렬하지 않고 왼쪽 정렬을 유지해 운영 원장 인상을 살린다.
- 항목 사이에는 옅은 세로 구분선을 사용할 수 있다.
- 수치는 tabular numeral을 유지한다.
- 320px에서도 각 label과 value가 겹치지 않도록 label은 짧은 용어만 사용한다.

### 6.6 참석 정보 중복 제거

- 상태 rail의 `참석 1/6`은 유지한다.
- 하단 보조 문구에서 `참석 1명`은 반복하지 않는다.
- 남은 조치가 있다면 `미응답 4명`처럼 action 판단에 필요한 정보만 보여 준다.
- 미응답이 0명이면 보조 문구 자체를 생략할 수 있다.

### 6.7 Primary action

- CTA는 높이 48px, 카드 전체 너비, 좌우 18px을 유지한다.
- 기본 문구는 `세션 문서 열기`로 통일한다. `편집`보다 조회와 운영을 함께 포함하는 의미다.
- 실제 마감 route로 직접 이동할 수 있고 현재 view model이 그 행동을 명시한 경우에만 `세션 마감하기`를 사용한다.
- 상태만 `마감 필요`인데 CTA가 일반 편집 화면으로 이동한다면 문구를 마감 행동처럼 가장하지 않는다.
- CTA 우측 화살표를 유지하고 focus-visible을 보장한다.

## 7. 확인할 운영 항목

모바일에서는 `처리 대기 원장`보다 행동을 바로 이해할 수 있는 `확인할 운영 항목`을 표시 이름으로 사용한다. 데스크톱 명칭은 변경하지 않는다.

- summary 전체를 최소 52px 터치 영역으로 만든다.
- 우측에 `7건` 형태의 count badge와 펼침 화살표를 표시한다.
- 기본 접힘 상태에서도 가장 높은 우선순위 항목의 짧은 설명 한 줄을 노출한다.
- 오류 또는 non-zero 긴급 항목을 자동 확장하는 기존 계약이 있다면 유지하고, 단순 count만으로 임의 자동 확장하지 않는다.
- `aria-expanded`, native `<details>` semantics, keyboard Enter/Space 동작을 유지한다.

## 8. 예정 세션과 운영 흐름

### 8.1 시간 의미

- 현재 날짜 또는 현재 세션보다 이전 날짜의 세션을 무조건 `다음 세션`으로 표시하지 않는다.
- 예정 세션 query가 이미 올바른 후보만 반환하는지 먼저 검증한다.
- 과거 날짜의 draft가 합법적인 상태라면 `일정 지남` 상태를 표시하고 `날짜 수정`을 우선 행동으로 제공한다.
- frontend 정렬 또는 표시 오류라면 이번 범위에서 수정한다. 서버 query 계약 문제라면 UI에서 조용히 숨기지 않고 별도 server 후속 작업으로 기록한다.

### 8.2 카드 행동

- 섹션명은 모바일에서 `예정 세션`으로 짧게 표시하고 운영 체크리스트는 그 아래 별도 subheading 또는 disclosure로 둔다.
- `공개` 같은 상태와 동작이 섞인 버튼 문구를 사용하지 않는다.
- 상태를 바꾸는 행동은 `공개로 전환` 또는 `공개 설정`으로 구체화한다.
- 일반 편집 행동은 `세션 편집`으로 표시한다.
- 한 카드에서 primary action은 하나만 둔다. 나머지는 quiet/text action으로 낮춘다.
- 공개 범위 변경이 즉시 적용되는 동작이면 기존 확인·권한 계약을 유지한다.

## 9. 모바일 시각 규칙

이번 화면에서 사용하는 기본 리듬은 다음과 같다.

| 용도 | 값 |
| --- | --- |
| 페이지 좌우 inset | `var(--m-page-x)`, 현재 기준 16px |
| 카드 본문 좌우 | 18px |
| 밀접한 label/value | 4px |
| 같은 정보 그룹 | 10px |
| 카드 내부 큰 구분 | 16px |
| main section 간 시각 간격 | 28px |
| primary touch target | 최소 44px, 권장 48px |

시각적 그룹은 다음 두 패턴만 사용한다.

1. 주요 작업 대상: 얇은 테두리의 card.
2. 상태 목록과 disclosure: 구분선 기반 row.

큰 회색 띠, 중첩 카드, 동일한 무게의 박스 버튼 여러 개를 혼용하지 않는다.

## 10. 상태별 화면

| 영역 | Loading | Empty | Error | Success | Partial |
| --- | --- | --- | --- | --- | --- |
| 현재 세션 | 실제 카드 높이와 유사한 skeleton | `열린 세션 없음`과 `세션 문서 만들기` | 기존 route error boundary | 정돈된 현재 세션 카드 | 일부 수치가 없으면 해당 값만 `-`로 표시 |
| 운영 항목 | summary 크기의 skeleton | `확인할 항목 없음` compact row | 기록 화면 이동 경로 제공 | count와 최우선 항목 표시 | 불러온 항목은 유지하고 실패 영역만 알림 |
| 예정 세션 | 한 개 카드 skeleton | `등록된 예정 세션 없음`과 문서 만들기 | 기존 목록 유지와 재시도 | 가장 가까운 유효 후보 표시 | 추가 페이지 실패 시 기존 목록 유지 |

## 11. 접근성

- 모든 버튼과 링크의 터치 영역은 최소 44×44px이다.
- heading 순서는 페이지 `h1` 아래 section `h2`, 카드 제목 `h3`을 유지한다.
- status badge는 색상 외 텍스트를 포함한다.
- `<details>/<summary>`의 native semantics를 유지하고 별도 화살표는 장식 요소로 처리한다.
- 긴 한국어·영어 제목에 `overflow-wrap`을 적용하고 control과 겹치지 않게 한다.
- focus-visible outline과 WCAG AA 대비를 유지한다.
- motion을 새로 추가하지 않는다. 화살표 회전을 추가한다면 `prefers-reduced-motion`을 존중한다.

## 12. Frontend 경계와 예상 수정 파일

Route, query, mutation 계약은 그대로 유지하고 UI는 props/callback-only 경계를 지킨다.

예상 수정 파일:

- `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
  - 현재 세션 content wrapper, 중복 제거, disclosure 표시 문구, action hierarchy.
- `front/shared/styles/mobile.css`
  - 호스트 세션 카드 padding 구조, 3열 metric rail, disclosure row와 responsive wrapping.
- `front/features/host/ui/host-dashboard.test.tsx`
  - 모바일 정보 순서와 문구 회귀.
- `front/features/host/ui/dashboard/priority-ledger-sections.test.tsx`
  - disclosure semantics 또는 공통 section 계약이 영향을 받을 때만 수정.
- `front/tests/e2e/host-club-operations.spec.ts`
  - 호스트 권한 fixture로 390px 현재 세션/원장/예정 세션 행동 검증.

필요한 경우에만 `front/features/host/model/host-dashboard-model.ts`와 테스트를 수정한다. 단순 표시 문구를 위해 view model 책임을 불필요하게 늘리지 않는다.

구현 시작 시 예상 수정 파일과 기존 작업의 중첩 여부를 다시 확인한다. 가능하면 이번 모바일 전용 수정은 `front/shared/styles/mobile.css`에 한정하고 전역 host dashboard 스타일 변경은 피한다.

## 13. 검증 계약

Focused checks:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx
corepack pnpm --dir front exec playwright test tests/e2e/host-club-operations.spec.ts
```

Frontend gate:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

수동 브라우저 증거:

- 320×844: 제목, 수치 3열, CTA, disclosure가 겹치거나 가로 스크롤되지 않는다.
- 390×844: 현재 세션 카드의 18px inset과 3열 수치가 유지된다.
- 768×1024: tablet 순서와 카드 너비가 기존 계약을 유지한다.
- 1280×720: 데스크톱 호스트 대시보드에 시각 회귀가 없다.
- 키보드: summary, CTA, 공개 설정, 편집 action의 focus와 Enter/Space 동작.
- 긴 책 제목과 긴 장소 문자열 fixture에서 wrapping 확인.

호스트 권한 세션을 재현하지 못하면 브라우저 검증을 통과로 기록하지 않고, 실행하지 못한 viewport와 이유를 명시한다.

## 14. Acceptance criteria

- 현재 세션 카드 본문이 content wrapper 안에서 렌더링된다.
- 카드 제목과 회차가 테두리에 붙지 않는다.
- 참석·읽기·질문은 320px 이상에서 한 줄 3열이다.
- 참석 수치가 카드 안에서 중복되지 않는다.
- `이번 세션` 중복 배지가 제거된다.
- CTA 문구가 실제 이동 행동과 일치한다.
- 모바일 운영 원장은 클릭 가능한 disclosure임을 시각적으로 알 수 있다.
- 예정 세션의 날짜가 과거일 때 `다음 세션`으로 잘못 설명하지 않는다.
- primary action은 section 또는 카드당 하나다.
- 기존 모바일 우선순위 순서와 desktop UI는 유지된다.
- 관련 Vitest, lint, 전체 frontend test, build가 통과한다.
- 호스트 fixture를 사용할 수 있으면 320px과 390px 브라우저 증거가 남는다.

## 15. 명시적으로 제외한 결정

- 책 제목을 데이터 계층에서 본제와 부제로 분리하는 계약 변경은 제외한다.
- 모바일 전용 bottom action bar는 추가하지 않는다.
- 운영 항목을 별도 route 또는 tab으로 분리하지 않는다.
- 예정 세션 공개 정책과 마감 정책 자체는 변경하지 않는다.
- 전역 spacing token이나 border-radius 체계는 재설계하지 않는다.

## 16. 승인된 결정 요약

- 접근 B: 기존 우선순위 운영 원장을 유지한 모바일 정돈.
- 현재 세션은 content wrapper + 3열 metric rail + 단일 CTA 구조.
- 중복 정보와 모호한 action 문구를 제거한다.
- 처리 대기 disclosure의 발견 가능성을 높인다.
- 과거 날짜 예정 세션은 상태를 숨기지 않고 정확히 설명한다.
- frontend-only 범위를 유지하며 server/BFF/API/DB 계약은 건드리지 않는다.
