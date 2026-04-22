# ReadMates Standalone And Front UI Data Completion Design

작성일: 2026-04-20
상태: USER-APPROVED DESIGN SPEC
문서 목적: `design/standalone/index.html`, `design/standalone/mobile.html`을 실제로 열어 확인한 UI 누락/불일치를 정리하고, 같은 기준을 Next.js `front` 화면에 반영하되 로컬 DB의 실제 데이터가 비어 있거나 부분적으로만 들어오는 상태까지 견디는 설계를 정의한다.

## 1. 목표

이번 변경의 목표는 샘플 디자인을 예쁘게 고치는 데서 끝나지 않는다. Standalone 프로토타입은 역할별 디자인 기준으로 정리하고, 실제 `front`는 로컬 DB 데이터가 완벽하지 않은 상황에서도 member, host, guest 화면이 깨지지 않게 만든다.

완료 기준:

- `design/standalone/mobile.html`은 390x844 기준에서 헤더, 역할 preview, 하단 탭, FAB가 서로 겹치지 않는다.
- `design/standalone/mobile.html`의 guest, member, host 전환 후 첫 화면의 제목, 탭, CTA, 날짜/세션 정보가 서로 맞는다.
- `design/standalone/index.html`은 1440, 1024, 768 폭에서 역할별 nav와 카드 그리드가 깨지지 않는다.
- 실제 `front`의 모바일 member/host/guest 화면은 standalone의 정보 구조를 따르되, 데모 전용 역할 전환기와 tweaks UI는 포함하지 않는다.
- 실제 API 데이터가 없거나 일부 필드만 있을 때도 빈 화면, 대체 카피, 비활성 액션을 명확히 렌더링한다.
- `node design/standalone/build.mjs`, `node design/standalone/verify.mjs`, `pnpm --dir front test`가 통과한다.

## 2. 직접 확인한 현재 문제

### 2.1 Mobile standalone

`design/standalone/mobile.html`을 브라우저에서 실행해 390x844로 확인했다.

확인된 문제:

- 앱 헤더와 floating role switcher가 같은 상단 영역을 점유해 title과 preview control이 시각적으로 충돌한다.
- member 화면은 구성 요소가 있으나 preview control 때문에 실제 모바일 앱처럼 보이지 않는다.
- host 홈에서는 `세션 편집` 카드 버튼과 FAB가 같은 행동을 중복 노출한다. 기능은 유용하지만 preview 목적에서는 과하게 겹친다.
- host edit 화면은 기본/공개/출석/리포트 탭 구조가 있으나, 하단 app tab bar까지 같이 보여 편집 화면의 주 작업 집중도가 낮다.
- guest/member/host가 같은 세션을 바라보지만 날짜 표현이 섞인다. 예: 고정 샘플 날짜, 현재 브라우저 날짜, D-day가 서로 다른 출처에서 나온다.
- favicon 404는 브라우저 콘솔에만 남는 사소한 standalone 품질 이슈다.

### 2.2 Desktop standalone

`design/standalone/index.html`을 1440, 1024, 768 폭에서 확인했다.

확인된 문제:

- desktop 자체는 모바일보다 완성도가 높지만, host nav 모델이 실제 `front`의 host nav 모델과 다르다.
- 768 폭에서는 desktop prototype이 아직 desktop nav를 유지한다. 실제 `front`는 768 이하에서 mobile chrome으로 전환하므로 breakpoint 기준을 명시해야 한다.
- host dashboard의 카드/사이드바는 1024 이하에서 더 조밀해지므로 responsive grid 기준을 강화해야 한다.
- guest/member/host의 세션 날짜, D-day, 책 정보가 같은 데이터에서 온다는 보장이 디자인 소스에 명확하지 않다.

### 2.3 Real front

현재 `front`는 이미 navigation chrome, mobile header, mobile tab bar, host dashboard, member home이 존재한다.

확인된 특성:

- `front/app/(app)/app/layout.tsx`가 인증 정보를 읽어 member/host chrome을 분기한다.
- `front/shared/ui/mobile-header.tsx`와 `front/shared/ui/mobile-tab-bar.tsx`는 실제 route에 연결되어 있다.
- `front/features/member-home/components/member-home.tsx`와 `front/features/host/components/host-dashboard.tsx`는 API response를 받아 렌더링한다.
- README 기준으로 clean dev DB에는 seed archive는 있으나 열린 current session은 없을 수 있다. 즉 `current.currentSession === null`이 정상 상태다.
- 일부 기능은 아직 비활성/미구현 상태다. 예: invitation preview, feedback HTML 자동 생성, host report upload/open/replace controls.

## 3. 범위

포함:

- `design/src` 원본 수정
- `design/standalone` 재생성
- `front` 모바일/데스크탑 UI 정합성 수정
- 실제 API 데이터 누락/부분 데이터에 대한 empty, pending, disabled 상태 보강
- member, host, guest 화면의 날짜/세션/탭/CTA 정렬
- unit/e2e 테스트 갱신 또는 추가

제외:

- 서버 API 계약의 큰 변경
- DB migration 추가
- feedback HTML 자동 생성기 구현
- invitation acceptance 전체 구현
- 실제 운영용 role switcher 또는 tweaks panel 추가
- 새로운 디자인 시스템 도입

서버 수정은 원칙적으로 제외하되, 프론트가 현재 API 타입으로는 안전하게 표시할 수 없는 명백한 필드가 있으면 먼저 사용자에게 묻고 최소 범위로 별도 설계한다.

## 4. 선택한 접근

선택안: standalone 기준 정리 후 `front` 반영.

순서:

1. `design/src`의 mobile shell, mobile pages, desktop pages를 정리한다.
2. `design/standalone/build.mjs`로 `standalone/index.html`, `standalone/mobile.html`을 재생성한다.
3. 같은 정보 구조를 `front` 컴포넌트에 반영한다.
4. 실제 데이터 fallback과 테스트를 추가한다.
5. 브라우저로 standalone과 `front`를 모두 확인한다.

이 접근을 선택한 이유:

- 사용자가 직접 지목한 실행 대상이 `standalone/mobile.html`, `standalone/index.html`이다.
- 디자인 기준을 남겨두지 않고 `front`만 고치면 다음 디자인 검토 때 다시 어긋난다.
- 실제 로컬 데이터가 완벽하지 않으므로, 프로토타입과 제품 둘 다 "데이터 있음", "데이터 없음", "부분 데이터"를 고려해야 한다.

## 5. Mobile Design

### 5.1 Shell

Standalone mobile shell은 실제 앱 chrome과 preview-only control을 분리한다.

- 앱 헤더는 항상 최상단 sticky 영역을 차지한다.
- guest public home에서는 header 배경을 투명하게 둘 수 있지만, preview role switcher가 헤더 위에 올라오지 않는다.
- role switcher는 standalone 전용 preview control이다. 화면 상단 fixed 위치를 제거하고, 아래 중 하나로 이동한다.
  - 기본: bottom safe area 위의 작은 preview dock
  - edit mode: tweaks sheet 내부
- 실제 `front`에는 role switcher를 넣지 않는다.

권장 구현:

- `src/mobile/shell.jsx`에서 floating role switcher container를 `.m-preview-role-dock` 클래스로 이동한다.
- `.m-preview-role-dock`은 `bottom: calc(var(--m-nav-h) + 14px + var(--m-safe-bottom))`를 기본으로 삼되, guest처럼 tab bar가 없을 때는 `bottom: calc(16px + var(--m-safe-bottom))`로 내려간다.
- FAB가 있는 화면에서는 preview dock과 FAB가 동시에 뜨지 않게 한다. Preview dock은 compact pill, FAB는 오른쪽 primary action으로 유지한다.

### 5.2 Guest Mobile

Guest mobile은 공개 소개가 첫 화면이다.

필수 요소:

- 클럽 정체성: 읽는사이, 독서 모임, since/cadence
- 이번 책 카드: session number, book title, author, date, public availability
- 공개 기록 일부: published session이 없으면 "아직 공개된 기록이 없습니다" 표시
- membership CTA: 초대 코드 또는 로그인

데이터 fallback:

- public club stats가 없으면 숫자 카드 숨김 또는 `-` 대신 설명형 empty copy 사용
- recent public sessions가 없으면 빈 리스트를 카드 하나로 대체
- current/upcoming session이 없으면 이번 책 카드 대신 "다음 모임 준비 중" 표시

### 5.3 Member Mobile

Member mobile은 4탭 구조를 유지한다.

탭:

- 홈
- 세션
- 아카이브
- 마이

홈 필수 요소:

- greeting
- current session prep card
- recent club activity
- quick links

Current session이 없을 때:

- prep card 자리에 "열린 세션 없음" 카드 표시
- primary CTA는 host가 아니면 비활성 설명형으로 둔다.
- host 권한이면 `/app/host/sessions/new`로 이동하는 CTA를 제공할 수 있다.

부분 데이터 fallback:

- `myCheckin === null`: 읽기 체크인은 "미작성"
- `myQuestions.length === 0`: 질문은 "0/5"
- `myOneLineReview === null`: 한줄평은 "모임 후 작성"
- `board.questions/checkins/highlights`가 비어 있으면 각 섹션별 empty row를 표시한다.
- attendees가 비어 있으면 roster summary를 숨기고 "참석 현황 준비 중"을 표시한다.

### 5.4 Host Mobile

Host mobile은 member와 같은 앱 안에서 운영 홈을 첫 탭으로 제공한다.

탭:

- 호스트
- 세션
- 아카이브
- 마이

Host home 필수 요소:

- attention metrics
- current/open session card 또는 no-session card
- operation checklist
- member status
- quick actions

Current session이 없을 때:

- metrics는 API 값이 있으면 보여주되, session-dependent 영역은 "열린 세션 없음"으로 대체한다.
- primary CTA는 "새 세션 만들기"로 연결한다.
- member status는 숨기거나 "세션을 만들면 참석 현황이 표시됩니다"로 대체한다.

부분 데이터 fallback:

- `HostDashboardResponse` 값이 없을 수는 타입상 없지만, 방어적으로 undefined/null을 0으로 표시한다.
- feedback pending이 0이어도 "완료"라고 단정하기보다 current session이 없으면 "대기 없음"으로 표시한다.
- attendee status는 RSVP와 attendance가 섞일 수 있으므로 "참석", "미정", "불참", "미응답", "출석 확인 전"을 분리한다.

### 5.5 Host Session Edit Mobile

Host edit 화면은 편집 집중도를 높인다.

구조:

- header left: 뒤로
- header title: 세션 편집 또는 새 세션
- header right: 저장 또는 완료
- 내부 segmented tabs: 기본, 공개, 출석, 리포트
- 하단 app tab bar는 실제 `front`에서 유지 가능하지만, 편집 중 action과 겹치면 body padding을 늘린다.

부분 기능 fallback:

- report upload/open/replace가 아직 미구현이면 disabled 상태와 "수동 업로드 준비 중" 카피를 표시한다.
- publication summary가 없으면 textarea 안내 문구와 "공개 전" badge를 보여준다.
- attendees가 없으면 출석 tab에 empty state를 보여준다.

## 6. Desktop Design

### 6.1 Guest Desktop

Guest desktop은 현재 editorial hero를 유지한다.

정리 사항:

- mobile guest와 같은 public data source를 가정한다.
- "이번 달 공개 기록 보기"는 published session이 있을 때만 구체 session으로 연결한다.
- 없으면 CTA label은 "클럽 소개 보기" 또는 disabled explanatory button으로 바꾼다.

### 6.2 Member Desktop

Member desktop은 current session 중심 workspace를 유지한다.

정리 사항:

- mobile prep card와 같은 상태 용어를 사용한다.
- 질문 개수는 최신 정책인 최대 5개 기준을 쓴다.
- current session이 없으면 empty home이 자연스럽게 보여야 한다.
- quick links는 실제 route가 없거나 준비 중인 경우 no-op 버튼 대신 설명 카드 또는 disabled state로 바꾼다.

### 6.3 Host Desktop

Host desktop은 운영 대시보드의 밀도를 유지하되 responsive를 보강한다.

정리 사항:

- 1440: metrics 4열, main + aside 2열
- 1024: metrics 2-4열 auto-fit, main + aside는 여유가 있으면 2열
- 768 이하: 실제 `front`는 mobile chrome으로 전환하므로 mobile layout 기준
- current session이 없으면 upcoming card는 no-session card로 대체하고 checklist는 "새 세션 생성 후 활성" 상태를 표시한다.

## 7. Actual Data Contract

`front/shared/api/readmates.ts`의 현재 타입을 기준으로 설계한다.

### 7.1 Auth

`AuthMeResponse`:

- authenticated false면 app layout에서 login으로 redirect한다.
- role이 `HOST`면 host chrome, 그 외 authenticated role은 member chrome으로 본다.
- displayName/shortName이 null이면 "멤버" 또는 "호스트" fallback을 쓴다.

### 7.2 Current Session

`CurrentSessionResponse.currentSession`은 null일 수 있다. 이는 오류가 아니라 clean dev DB의 정상 상태다.

UI 규칙:

- null이면 session-dependent component는 no-session variant로 렌더링한다.
- member는 "호스트가 새 세션을 열면 준비 보드가 표시됩니다"를 보여준다.
- host는 "새 세션 만들기" CTA를 보여준다.

### 7.3 Current Session Partial Fields

현재 타입에서 session 내부 필드는 대부분 required지만, 서버/seed가 확장 중일 수 있으므로 렌더링 helper는 안전하게 처리한다.

규칙:

- 문자열이 빈 값이면 `미정`, `준비 중`, `정보 없음` 중 문맥에 맞는 표현을 쓴다.
- 날짜/time 조합이 불완전하면 가능한 부분만 표시한다.
- attendees가 빈 배열이면 리스트를 그리지 않는다.
- board 배열이 비어 있으면 섹션별 empty state를 그린다.

### 7.4 Host Dashboard

`HostDashboardResponse`:

- rsvpPending
- checkinMissing
- publishPending
- feedbackPending

UI 규칙:

- 값은 0 이상 숫자로 표시한다.
- current session이 null이면 alert 숫자가 0이어도 "완료"보다 "대기 없음"이 더 정확하다.
- current session이 있으면 0은 "완료"로 표시해도 된다.

### 7.5 Public Data

Public pages는 DB-backed `/api/public/**`를 쓰는 상태다.

UI 규칙:

- public session list가 비면 공개 기록 영역은 empty state가 된다.
- public session detail이 없거나 접근할 수 없으면 page-level not found 또는 "공개 준비 중" 상태를 쓴다.
- guest landing은 특정 seeded session id를 하드코딩하지 않는다.

## 8. Implementation Boundaries

### 8.1 Design source

수정 후보:

- `design/src/data.js`
- `design/src/mobile/shell.jsx`
- `design/src/mobile/pages-public.jsx`
- `design/src/mobile/pages-home.jsx`
- `design/src/mobile/pages-session.jsx`
- `design/src/mobile/pages-archive-me.jsx`
- `design/src/mobile/pages-host.jsx`
- `design/src/nav.jsx`
- `design/src/pages-public.jsx`
- `design/src/pages-home.jsx`
- `design/src/pages-host.jsx`
- `design/styles/mobile.css`
- `design/styles/tokens.css`는 필요한 경우에만 최소 수정

빌드 산출:

- `design/standalone/index.html`
- `design/standalone/mobile.html`

### 8.2 Front source

수정 후보:

- `front/shared/ui/mobile-header.tsx`
- `front/shared/ui/mobile-tab-bar.tsx`
- `front/shared/ui/top-nav.tsx`
- `front/shared/styles/mobile.css`
- `front/app/globals.css`
- `front/features/member-home/components/member-home.tsx`
- `front/features/member-home/components/prep-card.tsx`
- `front/features/current-session/components/current-session.tsx`
- `front/features/host/components/host-dashboard.tsx`
- `front/features/host/components/host-session-editor.tsx`
- public guest components if standalone guest mismatch reveals a real front gap

서버 파일은 구현 중 실제 blocker가 확인될 때만 건드린다.

## 9. Testing And Verification

### 9.1 Static design verification

Run:

```sh
node design/standalone/build.mjs
node design/standalone/verify.mjs
```

Manual browser checks:

- `design/standalone/mobile.html` at 390x844
- `design/standalone/mobile.html` at 430x932
- `design/standalone/index.html` at 1440x1000
- `design/standalone/index.html` at 1024x900
- `design/standalone/index.html` at 768x900

Role flows:

- guest public home -> login
- member home -> session -> archive -> me
- host home -> edit -> publish tab -> attendance tab -> report tab

### 9.2 Front tests

Run:

```sh
pnpm --dir front test
```

Likely test updates:

- responsive navigation tests should assert mobile header and tab bar still render.
- member home tests should cover current session null.
- host dashboard tests should cover current session null.
- public home tests should cover empty public session list if existing API mocks allow it.

### 9.3 Browser verification

When backend/frontend can run:

```sh
SPRING_PROFILES_ACTIVE=dev READMATES_APP_BASE_URL=http://localhost:3000 ./server/gradlew -p server bootRun
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true READMATES_API_BASE_URL=http://localhost:8080 pnpm --dir front dev
```

Check:

- guest public pages before login
- dev login as HOST
- host creates first open session if clean DB has none
- member views current session after session creation
- member pages before enough records exist
- host dashboard before and after current session exists

## 10. Decisions Made

- The actual `front` app will not receive a role switcher. Roles come from auth.
- The standalone prototype may keep a role preview control, but it must not overlap app UI.
- Current session absence is normal and must be first-class UI.
- Empty public records are normal and must be first-class UI.
- Host report automation remains out of scope; UI should not pretend it works.
- Question count should align with the current policy of up to 5 questions.

## 11. Questions For User During Implementation

No question blocks implementation right now.

Ask the user only if one of these comes up:

- A front UI needs a server field that does not exist in the current API contract.
- Local DB data contradicts README assumptions in a way that changes product behavior.
- A currently inactive feature, such as report upload/open/replace or invitation acceptance, needs to become real in this pass.
- The user wants the standalone preview controls removed entirely instead of moved out of the way.

## 12. Rollback Plan

The work should be split so it can be reviewed safely:

1. Standalone design source and generated HTML.
2. Front shared chrome/style updates.
3. Member/host/guest data fallback updates.
4. Tests.

If a front data handling change becomes risky, keep the standalone improvements and isolate front changes behind smaller component-level commits.
