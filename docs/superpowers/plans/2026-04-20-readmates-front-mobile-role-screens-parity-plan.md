# ReadMates Front Mobile Role Screens Parity Plan

## 기준

- 기준 문서/화면: `design/standalone/mobile.html`
- 원본 디자인 소스: `design/src/mobile/*`, `design/styles/mobile.css`, `design/읽는사이 모바일.html`
- 실제 앱 구현 대상: `front/**`
- 이번 계획의 목적: 멤버 `홈/세션`과 호스트 `운영/편집` 모바일 화면을 `mobile.html`의 역할별 탭/화면 구조와 맞춘다.

## 현재 파악한 문제

1. 이전 모바일 역할 화면 작업은 당시 범위 제한 때문에 `design/**` 프로토타입만 수정했고 `front/**`는 건드리지 않았다.
2. 실제 앱의 호스트 모바일 탭은 아직 `호스트/세션/아카이브/마이`이다. 기준 `mobile.html`은 `운영/편집/아카이브/마이`이다.
3. 실제 앱의 멤버 홈은 데스크톱 성격의 hero, `PrepCard`, 2열 `home-grid` 흐름이 남아 있다. 기준은 모바일 전용 greeting, 현재 세션 카드, `오늘 할 일` 액션 타일, 활동/통계/바로가기 순서이다.
4. 실제 앱의 세션 화면은 모든 준비/공동 보드/기록 섹션을 한 페이지에 세로로 펼치는 구조이다. 기준은 상단 hero 이후 `내 준비/공동 보드/내 기록` 세그먼트로 모바일 작업 맥락을 나눈다.
5. 실제 앱의 호스트 운영 화면은 기능 데이터는 갖고 있지만 기준의 `운영 상태` 중심 모바일 카드/통계/체크리스트 밀도와 다르다.
6. 실제 앱의 호스트 편집 화면은 데스크톱 2열 폼과 sticky aside가 그대로 모바일에 내려오며, 기준의 `기본/공개/출석/리포트` 칩 기반 편집 흐름과 다르다.
7. 기준 프로토타입에도 보정할 점이 있다.
   - `home-carousel` 섹션에 inline `display: none`이 남아 있어 `body[data-home="carousel"]` CSS가 이기지 못한다.
   - 역할 전환 시 `document.body.dataset.role`을 갱신하지 않아 role 기반 스타일/진단이 실제 상태와 어긋난다.
   - 호스트 `편집`은 bottom tab처럼 보이지만 내부적으로 `subRoute`로 처리되어 실제 앱 라우팅으로 옮길 때 명시적 active 규칙이 필요하다.

## 범위

- 수정 포함:
  - `front/shared/ui/mobile-tab-bar.tsx`
  - `front/shared/ui/mobile-header.tsx`
  - `front/app/(app)/app/layout.tsx`
  - `front/features/member-home/components/member-home.tsx`
  - `front/features/member-home/components/prep-card.tsx`
  - `front/features/current-session/components/current-session.tsx`
  - `front/features/host/components/host-dashboard.tsx`
  - `front/features/host/components/host-session-editor.tsx`
  - `front/shared/styles/mobile.css`
  - 관련 unit/e2e 테스트
  - 기준 프로토타입 보정이 필요한 경우 `design/src/mobile/*`, `design/styles/mobile.css`, `design/읽는사이 모바일.html`
- 수정 제외:
  - 서버 API 계약 변경
  - 새 데이터 모델/새 엔드포인트 추가
  - `design/standalone/mobile.html` 직접 편집
  - 디자인 범위를 넘어선 신규 기능 추가

## 구현 계획

### Task 1. 기준 화면 체크리스트 고정

- [x] `design/standalone/mobile.html`에서 375x812 기준으로 아래 상태를 캡처/DOM 체크한다.
  - [x] 멤버 홈
  - [x] 멤버 세션 `내 준비`
  - [x] 멤버 세션 `공동 보드`
  - [x] 멤버 세션 `내 기록`
  - [x] 호스트 운영
  - [x] 호스트 편집 `기본`
  - [x] 호스트 편집 `공개`
  - [x] 호스트 편집 `출석`
  - [x] 호스트 편집 `리포트`
- [x] `mobile.html` 기준에서 실제로 따라야 할 UI 구조를 체크리스트로 남긴다.
- [x] `home-carousel` inline `display: none`과 `body.dataset.role` 갱신 누락을 디자인 원본에서 고친 뒤 `node design/standalone/build.mjs`로 재생성한다.

Task 1 기준 체크 결과:

- 캡처/DOM 산출물: `output/playwright/readmates-mobile-task1-baseline/dom-checks.json`, `output/playwright/readmates-mobile-task1-baseline/01-member-home.png`부터 `09-host-edit-report.png`.
- 공통 기준: 375x812, `body.dataset.role`은 멤버 화면에서 `member`, 호스트 화면에서 `host`로 유지한다. `home-carousel`은 inline `display`가 없어야 하고 `body[data-home="carousel"]`에서 `display: block`, `.home-single`은 `display: none`이어야 한다.
- 멤버 홈: header `읽는사이`, bottom tab `홈` active, greeting/date, next session card, `내 준비` strip, `세션 열기`/Zoom CTA, `오늘 할 일`, 멤버 활동, 통계, 바로가기 순서를 유지한다.
- 멤버 세션: header `이번 세션`, bottom tab `세션` active, book hero/Zoom CTA 후 sticky segment `내 준비/공동 보드/내 기록`을 유지한다. `내 준비`는 RSVP/읽기 체크인/내 질문, `공동 보드`는 질문/하이라이트/읽기 진행, `내 기록`은 서평/한줄평 구조를 따른다.
- 호스트 운영: header `호스트`, bottom tab `운영` active, `운영 상태` hero, 운영 지표, next session card, `세션 편집` CTA, 운영 체크리스트 구조를 유지한다.
- 호스트 편집: header `세션 편집`, bottom tab `편집` active, sticky chip `기본/공개/출석/리포트`를 유지한다. `기본`은 책/일시/Zoom, `공개`는 공개 요약, `출석`은 멤버별 참석 토글, `리포트`는 업로드/멤버별 리포트 상태 구조를 따른다.

### Task 2. 모바일 탭/헤더 라우팅 정렬

- [x] `front/shared/ui/mobile-tab-bar.tsx`의 host 탭을 기준과 같이 `운영/편집/아카이브/마이`로 바꾼다.
- [x] `운영`은 `/app/host`로 연결한다.
- [x] `편집`은 현재 세션이 있으면 `/app/host/sessions/{sessionId}/edit`, 없으면 `/app/host/sessions/new`로 연결한다.
- [x] 현재 `MobileTabBar`가 current session 정보를 받을 수 있도록 `front/app/(app)/app/layout.tsx`에서 host일 때 필요한 최소 데이터를 조회하거나, 별도 lightweight resolver를 둔다.
- [x] active 규칙을 정리한다.
  - [x] `/app/host`는 `운영`
  - [x] `/app/host/sessions/new`는 `편집`
  - [x] `/app/host/sessions/[sessionId]/edit`는 `편집`
  - [x] host에서는 `/app/session/current`를 bottom tab에 노출하지 않는다.
- [x] `front/shared/ui/mobile-header.tsx` title을 기준과 맞춘다.
  - [x] `/app/host`는 `호스트` 또는 `운영` 중 기준 화면과 테스트에서 하나로 고정한다.
  - [x] host edit route는 `세션 편집`을 유지한다.

### Task 3. 멤버 홈 모바일 화면 정렬

- [x] `front/features/member-home/components/member-home.tsx`를 기준 `MHomePage` 흐름에 맞춰 모바일 우선 구조로 조정한다.
  - [x] greeting/header
  - [x] 현재 세션 카드
  - [x] `오늘 할 일` 액션 타일
  - [x] 멤버 활동
  - [x] 내 통계
  - [x] 바로가기
- [x] 기존 실제 데이터는 유지한다.
  - [x] `auth`
  - [x] `current.currentSession`
  - [x] `noteFeedItems`
  - [x] RSVP/질문/체크인/참석 상태
- [x] `PrepCard`는 데스크톱 과밀 카드가 모바일에서 기준 카드처럼 보이도록 CSS/class 분기 또는 컴포넌트 구조를 정리한다.
- [x] `front/shared/styles/mobile.css`에 기준 디자인에서 필요한 `m-action-grid`, `m-action-tile`, timeline/list 유틸을 추가하되 기존 desktop 스타일과 충돌하지 않게 `mobile-only` 또는 모바일 class 중심으로 제한한다.

### Task 4. 멤버 세션 모바일 화면 정렬

- [x] `front/features/current-session/components/current-session.tsx`에 기준의 `내 준비/공동 보드/내 기록` 세그먼트 구조를 반영한다.
- [x] `내 준비`에는 현재 기능을 유지하면서 모바일 작업 순서를 기준에 맞춘다.
  - [x] RSVP
  - [x] 읽기 체크인
  - [x] 질문 작성
  - [x] 내 상태/세션 메타는 과밀하지 않게 카드화
- [x] `공동 보드`는 질문/읽기 흔적/하이라이트를 모바일 목록 밀도로 재배치한다.
- [x] `내 기록`은 서평/한줄평 저장 흐름을 기준처럼 별도 맥락으로 분리한다.
- [x] 입력 저장 액션, aria label, 저장 상태 피드백은 기존 동작을 유지한다.
- [x] 작은 화면에서 가로 스크롤/겹침이 없도록 375px 폭에서 확인한다.

### Task 5. 호스트 운영 화면 정렬

- [x] `front/features/host/components/host-dashboard.tsx`를 기준 `MHostHomePage`의 모바일 운영 카드 구조와 맞춘다.
  - [x] `운영 상태` header
  - [x] 핵심 지표 카드
  - [x] 진행중인 세션 카드
  - [x] 운영 체크리스트
  - [x] 멤버 상태
  - [x] 빠른 액션
- [x] 기존 `HostDashboardResponse`와 `CurrentSessionResponse` 기반 계산은 유지한다.
- [x] `세션 편집` 진입 링크는 bottom tab `편집`과 같은 대상 규칙을 사용한다.
- [x] disabled 빠른 액션은 기존 접근성 라벨을 유지한다.

### Task 6. 호스트 편집 화면 정렬

- [x] `front/features/host/components/host-session-editor.tsx`를 기준 `MHostEditPage`의 모바일 편집 흐름과 맞춘다.
- [x] 상단에 `기본/공개/출석/리포트` 칩 또는 세그먼트를 둔다.
- [x] 각 섹션을 모바일에서 한 번에 하나의 맥락으로 읽히게 재배치한다.
  - [x] 기본: 책/일정/장소/미팅 URL
  - [x] 공개: 공개 범위/공개 요약
  - [x] 출석: 멤버별 RSVP/출석 확정
  - [x] 리포트: 피드백 문서 등록/미리보기
- [x] desktop 2열/sticky aside는 모바일에서 숨기거나 아래로 내려 겹침을 제거한다.
- [x] 저장/초안/삭제 액션의 동작과 form submit 계약은 유지한다.
- [x] 파일 업로드 input, attendance update, toast 동작은 기존 테스트를 통과하도록 유지한다.

### Task 7. 테스트 업데이트

- [x] `front/tests/unit/responsive-navigation.test.tsx`를 새 host tab label/href/active 규칙에 맞춘다.
- [x] `front/tests/unit/app-route-layout.test.tsx`를 새 host 모바일 탭 규칙에 맞춘다.
- [x] `front/tests/e2e/responsive-navigation-chrome.spec.ts`를 `운영/편집/아카이브/마이` 기준으로 갱신한다.
- [x] `front/tests/unit/member-home.test.tsx`에 `오늘 할 일` 액션 타일과 모바일 핵심 섹션 검증을 추가한다.
- [x] `front/tests/unit/current-session.test.tsx`에 `내 준비/공동 보드/내 기록` 세그먼트 검증을 추가한다.
- [x] `front/tests/unit/host-dashboard.test.tsx`에 `운영 상태`와 편집 링크 대상 검증을 추가한다.
- [x] `front/tests/unit/host-session-editor.test.tsx`에 `기본/공개/출석/리포트` 전환 검증을 추가한다.

### Task 8. 실제 검증

- [x] `node design/standalone/build.mjs`
- [x] `node design/standalone/verify.mjs`
- [x] front unit test 실행
- [x] 공식 front e2e 또는 최소 responsive navigation e2e 실행
  - 참고: 기존 Next dev lock(PID 25981) 때문에 1차 실행은 webServer 시작 전에 실패했다. 해당 워크스페이스 dev server와 디자인 확인용 http server를 종료한 뒤 공식 responsive navigation e2e를 재실행해 통과를 확인했다.
- [x] 브라우저 375x812에서 실제 앱을 열어 확인한다.
  - [x] 멤버 홈
  - [x] 멤버 세션
  - [x] 호스트 운영
  - [x] 호스트 편집
- [x] `아카이브`의 `읽기`, `PDF로 저장` 액션은 visible text가 아니라 icon button이며 `aria-label`/`title`이 유지되는지 회귀 확인한다.

Task 8 검증 결과:

- `node design/standalone/build.mjs`: 통과
- `node design/standalone/verify.mjs`: 통과
- `cd front && npm test`: 통과, 26 files / 143 tests
- `cd front && npm run lint`: 통과, 기존 `shared/ui/book-cover.tsx`의 `@next/next/no-img-element` warning 1건
- `cd front && npx playwright test tests/e2e/responsive-navigation-chrome.spec.ts --project=chromium`: 통과, 2 passed
- no-webserver Playwright 375x812 smoke: `output/playwright/task8-main-final/`에 멤버 홈, 멤버 세션, 호스트 운영, 호스트 편집 스크린샷 저장 및 탭/핵심 텍스트 확인. smoke에 사용한 임시 8080 dev API는 검증 후 종료했다.
- 아카이브 `읽기`/`PDF로 저장` icon-only 회귀는 `front/tests/unit/archive-page.test.tsx`와 전체 unit suite에서 확인
- `design/standalone/mobile.html` 변경은 직접 편집이 아니라 `design/src/mobile/pages-home.jsx`, `design/읽는사이 모바일.html` 원본 수정 후 `node design/standalone/build.mjs`로 재생성한 의도적 standalone export이다.
- 검증 후 `localhost:3000`, `localhost:3100`, `localhost:18080`, `localhost:4177`, `localhost:8080`에 남은 listener가 없음을 확인했다.

## 승인 기준

- 멤버 mobile tab은 `홈/세션/아카이브/마이`이고 각 active state가 맞다.
- 호스트 mobile tab은 `운영/편집/아카이브/마이`이고 `편집`은 host session edit/new route에서 active이다.
- 멤버 홈은 기준의 모바일 home flow와 같은 정보 위계와 액션 밀도를 가진다.
- 멤버 세션은 `내 준비/공동 보드/내 기록` 모바일 맥락 전환이 가능하다.
- 호스트 운영은 기준의 `운영 상태` 화면과 같은 운영 카드 중심 구조이다.
- 호스트 편집은 `기본/공개/출석/리포트` 모바일 편집 흐름을 제공한다.
- 375px 폭에서 텍스트 겹침, 의도치 않은 가로 스크롤, bottom tab 가림이 없다.
- 기존 저장/API 동작은 유지된다.

## 리스크와 대응

- host `편집` tab href를 만들려면 layout에서 현재 세션 id가 필요하다. host layout에서 `/api/sessions/current`를 추가 조회하는 방식이 가장 작지만, 중복 fetch 비용이 생길 수 있다. Next fetch cache 또는 page-level 데이터와 중복 여부를 확인한다.
- 현재 컴포넌트는 inline style이 많다. 한 번에 전부 CSS로 옮기기보다 모바일 parity에 필요한 class만 추가해 범위를 줄인다.
- 기준 프로토타입의 `home-carousel`과 role dataset 문제는 실제 앱 구현 전 기준 신뢰도를 흔들 수 있으므로 Task 1에서 먼저 고친다.
- 테스트가 기존 `호스트` tab label을 기대하고 있으므로 navigation 관련 테스트를 반드시 함께 갱신한다.
