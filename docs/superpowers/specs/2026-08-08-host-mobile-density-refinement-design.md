# 호스트 모바일 정보 밀도 개선 설계

작성일: 2026-08-08  
상태: 시각 방향 사용자 승인 완료, 문서 검토 대기

## 1. 목적

호스트 홈과 세션 편집 화면을 모바일에서 더 짧고 빠르게 훑을 수 있도록 재배치한다. 단순히 버튼과 글자를 작게 만드는 것이 아니라, 중요한 상태와 다음 행동은 유지하면서 중복 문구, 과도한 전체 폭 액션, 불필요한 줄바꿈과 가로 스크롤을 제거한다.

대상 화면은 다음 두 route다.

- `/clubs/:clubSlug/app/host`
- `/clubs/:clubSlug/app/host/sessions/:sessionId/edit`

## 2. 확인된 문제

### 2.1 호스트 홈

- `호스트 준비 필요` 상태와 “세션 정보, 멤버 상태, 공개 범위, 운영 대기 항목을 먼저 닫아 주세요.” 안내가 별도 간격 규칙 없이 붙어 있어 상태와 설명의 위계가 약하다.
- 현재 세션 카드의 `세션 문서 열기`가 48px 높이 전체 폭 행을 차지한다. 이미 카드 제목과 세션 상태가 문서의 대상을 설명하므로 반복 텍스트가 모바일 세로 공간을 낭비한다.
- 모바일의 여러 버튼을 무조건 전체 폭으로 만들면 조작은 쉽지만, 운영 장부를 훑는 흐름이 반복적인 CTA 행에 의해 끊긴다.

### 2.2 세션 편집

- `개요`, `기본`, `출석`, `기록`, `변경` 탭에 72–76px 최소 너비가 강제돼 320px에서 가로 스크롤이 발생한다.
- 탭이 pill 형태의 내용 너비 버튼이라 각 label이 시각적으로 왼쪽에 몰리고, 탭 전체 영역의 균등한 중앙 정렬이 되지 않는다.
- 모바일에서도 section panel이 18px padding과 데스크톱형 버튼 폭을 유지해 작은 화면에서 작업 내용보다 chrome이 더 많은 공간을 차지한다.
- 헤더의 세션 정체성, 공개 범위, 초안 상태가 두 행으로 나뉘고 `호스트 전용` 같은 상태가 중복될 수 있다.
- 첨부 화면처럼 네 상태가 두 줄로 감기면서 제목 아래의 정보 밀도가 낮아진다.

## 3. 검토한 접근

### 3.1 CSS 크기만 축소

기존 DOM과 의미 구조를 그대로 두고 padding과 font-size만 줄인다. 변경 위험은 작지만 중복 상태, 전체 폭 CTA, 탭의 스크롤 구조가 남는다. 작은 글자와 터치 영역 축소로 문제를 다른 형태로 옮길 가능성이 있어 제외한다.

### 3.2 모바일 전용 압축 재배치 — 채택

desktop 정보 구조와 route/API 계약은 유지하고, 모바일에서 상태와 행동을 다시 묶는다.

- 상태 설명을 시각적으로 분리한다.
- 현재 세션이 있을 때 문서 열기 행동을 접근 가능한 화살표 아이콘으로 축소한다.
- 편집 탭을 균등 5열로 만든다.
- 헤더 상태를 중복 제거한 한 줄 metadata rail로 통합한다.
- panel과 액션은 의미에 따라 compact 또는 full-width를 선택한다.

변경 범위가 frontend UI/CSS에 머물면서도 실제 공간 낭비 원인을 해결한다.

### 3.3 모바일 정보 구조 전면 교체

탭을 accordion 또는 bottom sheet로 바꾸고 모든 액션을 재배치한다. 모바일에 더 특화될 수 있지만 현재 section URL, 키보드 탭 동작, 작업 상태 보존과 E2E 계약을 크게 바꾸며 이번 요구보다 범위가 크다. 제외한다.

## 4. 승인된 화면 방향

승인된 목업의 핵심은 다음과 같다.

### 4.1 호스트 홈

#### 준비 상태

- `호스트 준비 필요`은 작은 상태 배지로 유지한다.
- 설명은 배지 아래 별도 행에 두고 8px 이상의 수직 간격을 확보한다.
- 경고 상태는 왼쪽 선과 텍스트를 함께 사용하며 색상만으로 구분하지 않는다.
- 문구와 운영 판단 로직은 바꾸지 않는다.

#### 현재 세션 카드

- 세션이 존재할 때 `세션 문서 열기` 텍스트 CTA를 카드 오른쪽 위 44×44px 화살표 아이콘 링크로 바꾼다.
- 아이콘은 기존 ReadMates arrow/chevron icon을 사용한다.
- 시각 텍스트는 제거하되 접근 가능한 이름은 `세션 문서 열기`로 유지한다.
- 카드 전체를 링크로 만들지 않는다. 내부 상태와 향후 별도 조작이 링크 하나에 섞이는 것을 피한다.
- 세션이 없을 때는 `세션 문서 만들기` 텍스트 CTA를 유지한다. 새 문서 생성은 아이콘만으로 의미를 추측하게 하지 않는다.

#### 나머지 모바일 영역

- 접힌 운영 항목은 현재 compact disclosure 구조를 유지한다.
- 예정 세션 action은 한 행에 하나의 우선 행동만 강조하고, 보조 text action은 최소 44px 높이를 지키면서 내용 너비 또는 균등 열로 배치한다.
- 모든 버튼을 일괄 축소하거나 모든 액션을 아이콘으로 바꾸지 않는다.

### 4.2 세션 편집 헤더

- 제목 아래 metadata를 한 그룹으로 통합한다.
- 같은 의미의 상태는 한 번만 표시한다. 예를 들어 `호스트 전용`은 세션 정체성 그룹과 적용 범위 그룹에서 중복하지 않는다.
- 표시 우선순위는 `회차`, `lifecycle`, `공개 범위`, `초안 상태`다.
- 새 세션은 `새 예정 세션`, `호스트 전용`, `초안 준비됨`처럼 의미가 겹치지 않는 상태만 표시한다.
- 320px의 기본 한국어 label은 한 줄에 맞춘다.
- 글자 확대, 번역, 예외적으로 긴 label에서는 내용을 잘라 숨기지 않는다. metadata rail 내부의 한 줄 가로 스크롤을 허용하되 페이지 전체 overflow는 만들지 않는다.

### 4.3 세션 편집 탭

- 모바일에서 탭 목록은 `repeat(5, minmax(0, 1fr))`에 해당하는 균등 5열 구조를 사용한다.
- 320px에서 모든 탭이 한 화면에 보이고 기본 상태에서는 가로 스크롤이 없어야 한다.
- 각 label은 탭의 가로·세로 중앙에 놓는다.
- 각 탭은 최소 44px 높이를 유지한다.
- 모바일 label `개요`, `기본`, `출석`, `기록`, `변경`과 desktop의 전체 label 및 접근 가능한 이름은 유지한다.
- 선택 상태는 배경과 `aria-selected`를 함께 사용한다.
- ArrowLeft, ArrowRight, Home, End 이동과 focus 복귀 계약을 유지한다.
- 브라우저 확대 등으로 실질 가용 폭이 320px보다 작아지면 label 겹침보다 tablist 내부 스크롤을 우선한다.

### 4.4 세션 편집 영역과 액션

- 모바일 section panel padding을 18px에서 14–16px 범위로 줄인다.
- 단순 탐색·전환 action은 44px 높이를 유지한 compact 버튼으로 표시한다.
- 제출, 반영, 위험 확인처럼 문맥상 하나뿐인 주요 action만 필요할 때 전체 폭을 사용한다.
- 기본 정보 form, 출석 변경, 기록 자동 저장, 반영 검토, 변경 기록의 동작은 바꾸지 않는다.
- 기록 작업대 sticky action은 하단 앱 navigation과 safe area를 계속 피한다.
- 오류, validation 안내와 복구 action은 공간 절약을 이유로 숨기거나 icon-only로 바꾸지 않는다.

## 5. 상태별 사각지대 검토

### 5.1 데이터 상태

- 현재 세션 있음: 아이콘 링크와 세션 요약을 표시한다.
- 현재 세션 없음: 텍스트 `세션 문서 만들기`를 표시한다.
- dashboard 부분 실패: 기존 alert와 세션 기록 진입 링크를 유지한다.
- pending mutation: 버튼 label 또는 disabled/busy 상태를 유지하고 layout shift를 최소화한다.
- 기록 초안 없음·저장 중·저장 실패·stale·validation 오류·저장 완료 상태가 한 줄 metadata와 각 section 본문에서 서로 모순되지 않아야 한다.

### 5.2 콘텐츠 길이

- 긴 한국어 책 제목과 공백 없는 영문 제목은 카드와 헤더에서 다른 컨트롤을 밀어내지 않는다.
- 날짜, 장소, 공개 범위, 상태 문구는 320px에서 페이지 overflow를 만들지 않는다.
- 번역 또는 브라우저 글자 확대 시 metadata는 내부 스크롤로 보존하고, 탭은 겹치지 않게 한다.

### 5.3 입력과 접근성

- 모든 아이콘 링크는 의미 있는 accessible name을 가진다.
- icon-only 링크는 44×44px 이상의 hit target과 visible focus를 가진다.
- hover 없이도 모든 기능을 사용할 수 있다.
- tablist의 role, tab, tabpanel, `aria-controls`, `aria-selected`, roving `tabIndex` 관계를 유지한다.
- 색상 이외에 label, 선, selected semantics로 상태를 구분한다.
- reduced-motion 환경에서 새 motion을 추가하지 않는다.

### 5.4 화면 크기

- 320×720: 탭 5개가 기본 상태에서 한 화면에 보이고 페이지 가로 overflow가 없어야 한다.
- 390×844: 승인 목업과 같은 정보 위계와 여백을 유지한다.
- 모바일 landscape: 탭과 metadata가 과도하게 늘어나지 않고 content max-width 규칙을 따른다.
- 768px 경계: mobile/desktop label이 동시에 보이지 않고, breakpoint 전환 시 section 선택과 form state가 유지된다.
- desktop: 현재 한 section 표시, label, layout과 기능을 유지한다. 모바일 개선이 desktop spacing을 축소하지 않는다.

## 6. 구현 경계

### 변경 예상 파일

- `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
- `front/features/host/ui/dashboard/upcoming-session-row.tsx` — 실제 action density 조정이 필요한 경우에만
- `front/features/host/ui/host-session-editor.tsx`
- `front/features/host/ui/session-editor/session-editor-section-nav.tsx`
- `front/shared/styles/mobile.css`
- 관련 frontend unit/E2E test

### 유지할 경계

- route가 data/query/mutation/URL state를 소유한다.
- UI는 props와 callback만 사용하며 API/query를 import하지 않는다.
- server, BFF, API contract, database, migration, 권한과 공개 범위 판정은 변경하지 않는다.
- 실제 알림 발송, 이메일 발송, AI provider 호출은 하지 않는다.
- 실제 멤버 데이터나 로컬 환경 값은 test, 문서, screenshot에 넣지 않는다.

## 7. 테스트 우선 구현

### RED

- 호스트 dashboard unit test에 현재 세션 문서 링크가 icon-only visual contract를 사용하면서 accessible name과 44px 전용 class를 유지하는 assertion을 추가한다.
- 현재 세션이 없을 때 `세션 문서 만들기` 텍스트가 남는 회귀 test를 추가한다.
- section nav test에 다섯 탭의 mobile label과 새 equal-width class 계약을 추가한다.
- 편집 header test에 중복 상태 제거와 단일 metadata group을 추가한다.
- 320px Playwright test의 기존 `scrollWidth > clientWidth` 기대를 `scrollWidth <= clientWidth`로 바꾸고, 탭 중앙 정렬·페이지 overflow·metadata 한 줄을 검증한다.

### GREEN

- 필요한 최소 JSX와 mobile-scoped CSS만 변경한다.
- inline style로 고정된 탭 geometry를 제거하고 component class와 responsive CSS로 이동한다.
- desktop DOM 의미와 route state는 그대로 둔다.

### 회귀 및 시각 검증

- 관련 Vitest를 먼저 실행한다.
- frontend boundary test로 UI import 경계를 확인한다.
- 320px과 390px에서 호스트 홈과 세션 편집을 함께 캡처한다. 호스트 홈은 기존 `host-club-operations.spec.ts`, 편집기는 `host-session-record-revisions.spec.ts` fixture를 사용한다.
- 한 번의 desktop/mobile 결함 스캔 뒤 발견 사항을 묶어서 수정하고, 최대 한 번 더 확인한다.
- 변경된 UI 파일에 Impeccable detector를 한 번 실행한다.
- 최종 frontend lint, 전체 test, build를 실행한다.

계획된 명령:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/host-dashboard.test.tsx \
  features/host/ui/session-editor/session-editor-section-nav.test.tsx \
  tests/unit/host-session-editor.test.tsx
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front exec playwright test \
  tests/e2e/host-club-operations.spec.ts \
  tests/e2e/host-session-record-revisions.spec.ts \
  tests/e2e/responsive-navigation-chrome.spec.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

## 8. 비목표

- 호스트 dashboard desktop 재설계
- 세션 편집 정보 구조나 autosave workflow 재설계
- 새 icon system 도입
- 공개 범위 또는 lifecycle 문구의 제품 정책 변경
- API/BFF/server 변경
- 모든 모바일 버튼을 icon-only로 전환
- 알림, 멤버, 초대, AI 설정 화면 자체의 재설계

## 9. 완료 조건

- 승인된 모바일 화면 위계가 320px과 390px에서 재현된다.
- 호스트 준비 상태와 설명이 붙어 보이지 않는다.
- 현재 세션 문서 진입은 공간을 덜 쓰면서도 44px touch target과 accessible name을 유지한다.
- 편집 탭 5개가 320px에서 잘림이나 기본 가로 스크롤 없이 중앙 정렬된다.
- 헤더 상태가 한 줄이고 중복 의미가 없다.
- 모바일 panel과 버튼 밀도가 개선되지만 핵심 기능, 오류 복구, 접근성과 desktop 동작은 유지된다.
- 관련 focused test, boundary test, browser evidence, lint, 전체 frontend test와 build 결과를 실제 실행 근거로 보고한다.
