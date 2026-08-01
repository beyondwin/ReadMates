# ReadMates 클럽 노트 세션 전환 다듬기

작성일: 2026-08-02
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/notes`에서 세션 카드를 선택할 때 제목, 필터 수량, 기록 본문이 즉시 교체되어 화면이 점멸하는 듯 보이는 문제를 해결한다.

기존 URL 기반 세션 선택, React Router loader, API 계약은 유지한다. 세션 링크의 View Transition을 활성화하고 세션 문맥과 기록 본문만 짧게 교차 전환한다. 선택 카드에는 즉각적인 상태 변화를 제공하되, 모션 감소 설정에서는 전환 효과를 제거한다.

같은 화면의 세션 검색 placeholder에 하드코딩된 `No.06`도 제거한다. 현재 불러온 세션 목록에서 가장 큰 회차 번호를 구해 `책 제목 또는 No.08`처럼 데스크톱 rail과 모바일 sheet에 동일하게 표시한다.

## 2. 확인한 현재 문제

### 2.1 세션 변경의 시각적 단절

세션 링크는 `sessionId` query parameter를 변경하고 route loader가 세션 목록과 선택 세션의 피드를 다시 요청한다. loader 응답이 반영되는 순간 다음 요소가 한 프레임에 함께 교체된다.

- 상단 책 제목과 회차·날짜
- 하이라이트·한줄평·질문 filter 수량
- 기록 section과 모든 기록 item
- rail 또는 모바일 카드의 선택 상태

기존 콘텐츠와 새 콘텐츠 사이를 연결하는 전환 상태가 없어, 응답이 빨라도 사용자는 화면 전체가 깜박이는 것으로 인지한다.

### 2.2 검색 예시의 하드코딩

데스크톱 세션 검색과 모바일 세션 목록 검색이 모두 `책 제목 또는 No.06`을 고정 문자열로 사용한다. 현재 목록의 최신 회차가 No.08이어도 예시는 No.06에 머물러 데이터와 맞지 않는다.

## 3. 목표

1. 세션을 바꿀 때 이전 기록과 새 기록이 시각적으로 이어지게 한다.
2. 전환 범위를 노트 화면의 세션 문맥과 기록 본문으로 제한해 전역 navigation과 shell을 흔들지 않는다.
3. 선택한 세션 카드의 상태를 분명하게 유지한다.
4. 모션 감소 사용자에게 불필요한 animation을 강제하지 않는다.
5. 검색 placeholder의 회차 예시를 현재 세션 목록과 일치시킨다.
6. 데스크톱 rail과 모바일 picker/sheet에서 같은 동작과 문구를 제공한다.

## 4. 비목표

- notes API, BFF, 서버, 데이터베이스 또는 pagination 계약 변경
- 세션 피드의 TanStack Query 이관 또는 별도 client cache 도입
- hover/focus 시 feed를 미리 요청하는 prefetch 기능
- 전역 page transition 또는 app shell animation 변경
- 세션 검색의 matching 규칙 변경
- 세션 정렬 규칙 또는 선택 fallback 규칙 변경

## 5. 검토한 접근

### 5.1 선택: 범위가 제한된 View Transition

세션을 여는 `Link`에 React Router의 `viewTransition`을 사용한다. 상단 세션 문맥과 기록 본문에 각각 고정된 transition name을 부여하고, 이전 snapshot과 새 snapshot이 약 190ms 동안 낮은 거리 이동과 함께 교차 전환되도록 한다.

장점:

- 이전 콘텐츠를 transition snapshot으로 유지해 중간에 빈 화면을 만들지 않는다.
- loader와 URL 계약을 바꾸지 않는다.
- 전환 대상을 노트 콘텐츠에만 제한할 수 있다.
- 지원하지 않는 브라우저에서는 기존 navigation으로 안전하게 fallback한다.

### 5.2 제외: 새 콘텐츠의 CSS fade-in만 사용

구현은 가장 작지만 이전 콘텐츠가 먼저 제거된 뒤 새 콘텐츠가 투명 상태에서 나타나므로, 짧게 비어 보이는 순간이 생길 수 있다. 현재 점멸 문제를 다른 형태의 점멸로 바꿀 위험이 있다.

### 5.3 제외: client-side prefetch와 cache 도입

선택 전 데이터를 준비할 수 있지만 현재 로컬 요청 자체는 빠르며, 문제의 중심은 지연보다 교체 방식이다. query migration, cache invalidation, loader 연동까지 범위가 확대되어 이번 개선에 비해 무겁다.

## 6. 상세 상호작용

### 6.1 세션 선택

1. 사용자가 데스크톱 rail, 모바일 최근 세션 카드 또는 모바일 전체 목록에서 세션을 선택한다.
2. React Router는 기존대로 `sessionId` query parameter를 변경하고 loader를 실행한다.
3. loader가 완료되면 상단 세션 문맥과 기록 본문만 이전 snapshot에서 새 snapshot으로 교차 전환한다.
4. rail과 모바일 카드의 선택 배경·border·text color는 짧은 color transition으로 바뀐다.
5. URL, browser history, filter query parameter, scroll continuity는 기존 동작을 유지한다.

전환은 ReadMates의 차분한 편집 문맥에 맞춰 장식적으로 보이지 않을 정도로 제한한다.

- duration: 기존 `--motion-page` token인 190ms
- easing: 기존 `--ease-out-refined`
- 이동 거리: 최대 4px
- opacity 중심의 교차 전환
- scale, blur, bounce, spring 효과는 사용하지 않음

### 6.2 전환 대상

두 개의 named transition group만 사용한다.

- session context: 책 제목, 회차·날짜, filter 수량
- feed content: 하이라이트·한줄평·질문 section과 load-more action

top navigation, footer, 세션 검색 input, rail 전체, mobile tab bar는 snapshot transition 대상에서 제외한다. 전역 root transition은 비활성화해 화면 전체가 흐려지거나 두 겹으로 보이지 않게 한다.

### 6.3 모션 감소와 fallback

`prefers-reduced-motion: reduce`에서는 named transition animation과 카드 color transition을 제거한다. View Transition API를 지원하지 않는 브라우저에서는 기존 loader navigation을 유지하며 기능 손실이나 오류를 만들지 않는다.

### 6.4 검색 placeholder

검색 예시 회차는 현재 `noteSessions`의 `sessionNumber` 중 가장 큰 값을 사용한다.

- 세션이 `[No.08, No.07, ..., No.01]`이면 `책 제목 또는 No.08`
- 배열 순서가 바뀌어도 최고 회차를 사용
- 세션 목록이 비어 있으면 회차를 추측하지 않고 `책 제목 또는 세션 번호`
- desktop rail과 mobile sheet가 같은 helper 결과를 사용

사용자가 입력한 검색 query와 matching 규칙에는 영향을 주지 않는다.

## 7. 컴포넌트와 데이터 흐름

### 7.1 변경 예상 파일

- `front/features/archive/model/notes-feed-model.ts`
  - 현재 세션 목록에서 검색 placeholder를 만드는 순수 helper
- `front/features/archive/model/notes-feed-model.test.ts`
  - 최고 회차, 비정렬 목록, 빈 목록 검증
- `front/features/archive/ui/notes-session-filter.tsx`
  - desktop/mobile placeholder 공유
  - 세션 Link의 View Transition 활성화
  - 선택 카드 color transition class 적용
- `front/features/archive/ui/notes-feed-page.tsx`
  - session context와 feed content의 named transition boundary
  - scoped View Transition CSS와 reduced-motion 처리
- `front/tests/unit/notes-feed-page.test.tsx`
  - desktop/mobile link와 동적 placeholder의 사용자 관찰 동작 검증

새 shared primitive는 만들지 않는다. UI는 계속 prop/callback 기반으로 렌더링하고 API 또는 route 모듈을 import하지 않는다.

### 7.2 유지하는 흐름

```text
세션 Link 선택
  -> sessionId query parameter 변경
  -> notesFeedLoader 재검증
  -> 세션 목록 + 선택 세션 feed 요청
  -> NotesFeedRouteData 갱신
  -> NotesFeedPage 렌더링
  -> scoped View Transition 완료
```

## 8. 오류와 경계 사례

- feed 요청 실패는 기존 route error boundary가 처리한다.
- 첫 페이지 밖의 requested session과 기록이 없는 requested session을 유지하는 기존 loader 동작을 바꾸지 않는다.
- 선택 세션의 기록이 0개면 새 empty state도 같은 transition boundary 안에서 나타난다.
- filter가 설정된 URL에서 세션을 바꿔도 filter query parameter를 유지한다.
- 연속 클릭 시 React Router의 최신 navigation 결과를 따르며 별도 pending queue를 만들지 않는다.
- 목록의 최고 회차가 선택 세션과 달라도 placeholder는 목록 검색 예시이므로 최고 회차를 표시한다.

## 9. 접근성

- 세션 link의 `aria-current="page"`와 accessible name을 유지한다.
- 전환 중 콘텐츠 의미, heading level, reading order를 바꾸지 않는다.
- 상태를 animation이나 color만으로 전달하지 않고 기존 `선택됨` 문구를 유지한다.
- reduced-motion 설정에서는 실질적인 animation duration을 제거한다.
- keyboard, touch, pointer activation 모두 같은 route navigation을 사용한다.
- focus가 이동 중 사라지거나 임의로 본문으로 이동하지 않게 기존 Link focus 동작을 유지한다.

## 10. 테스트와 검증

### 10.1 TDD

production 변경 전에 다음 실패 test를 먼저 추가한다.

1. 세션 목록이 비정렬이어도 검색 placeholder가 최고 회차를 표시한다.
2. 세션 목록이 비면 일반 placeholder를 표시한다.
3. 데스크톱 rail과 모바일 sheet의 세션 link가 View Transition navigation을 사용한다.

Focused commands:

```bash
corepack pnpm --dir front exec vitest run features/archive/model/notes-feed-model.test.ts
corepack pnpm --dir front exec vitest run tests/unit/notes-feed-page.test.tsx
```

### 10.2 frontend regression

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

### 10.3 browser evidence

현재 로컬 notes 화면에서 다음을 확인한다.

- 데스크톱 rail에서 No.04와 No.03 사이 전환
- 모바일 최근 세션 카드에서 인접 세션 전환
- 모바일 전체 보기 sheet에서 세션 선택 후 sheet 닫힘과 콘텐츠 전환
- `filter=highlights`를 유지한 세션 전환
- 검색 placeholder가 현재 최고 회차인 No.08을 표시
- 1280px desktop, 390px mobile, reduced-motion emulation
- 전환 중 console/runtime error 없음

route URL state가 바뀌는 사용자 흐름이므로 focused E2E 또는 실제 browser flow로 query parameter와 filter 유지도 확인한다.

## 11. Acceptance matrix 선택

- 선택: `UI or runtime state`
  - 이유: 세션 교체의 loading/transition 인지, empty state, desktop/mobile, reduced motion이 직접 관련된다.
  - evidence: model/component test, frontend gates, desktop/mobile/reduced-motion browser 확인.
- 인접 row 제외: `Cursor collection`
  - 이유: 기존 first/continuation page와 load-more 계약은 변경하지 않는다.
- 인접 row 제외: `Actor or authorization`, `Club context`, `BFF or OAuth`
  - 이유: route access, club scope, BFF/API 계약을 변경하지 않는 presentation-only 개선이다.

## 12. 완료 기준

- 세션 선택 시 app shell이나 전체 페이지가 아니라 세션 문맥과 기록 본문만 자연스럽게 전환된다.
- 선택 상태와 URL/filter 동작이 기존과 동일하다.
- desktop/mobile 검색 placeholder가 최고 회차를 반영한다.
- reduced-motion과 View Transition 미지원 환경에서 기능이 정상적으로 유지된다.
- focused test, frontend lint/test/build, 실제 desktop/mobile browser 검증 결과가 기록된다.
