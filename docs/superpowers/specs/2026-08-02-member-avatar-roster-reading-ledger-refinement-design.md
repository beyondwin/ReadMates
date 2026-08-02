# 멤버 아바타·홈 밀도·독서 여정 장부·알림 설정 개선 설계

작성일: 2026-08-02

상태: 사용자 화면 방향 승인 완료, 작성본 검토 대기

대상 표면: frontend member `/app`, `/app/me`, `/app/notifications/settings`

## 1. 요약

멤버 홈의 참석 명단은 넓은 카드 안에서도 단순 `flex-wrap`을 사용해 아바타 사이가 느슨하고 한 줄 수용 인원이 불명확하다. 프로필 편집의 아바타 선택 화면은 선택 체크 배지를 위한 상단 여백 때문에 각 타일이 필요 이상으로 커지며, 내 공간 프로필은 아바타 이름을 사용자 정보 문장 안에 두어 그림과 이름의 관계가 약하다.

내 공간의 누적 기록 영역은 제목과 지표가 같은 숫자를 반복하고, 동일한 형태의 텍스트 지표만 나열해 질문과 서평 기록으로 다시 이동할 수 있는 가치가 드러나지 않는다.

이번 개선은 다음 네 가지를 함께 적용한다.

1. 아바타 선택 타일에서 체크 배지와 배지용 여백을 제거한다.
2. 참석 명단은 데스크톱 8열을 기준으로 줄바꿈하고 모바일에서는 가독 가능한 열 수로 재배치한다.
3. 내 공간의 아바타 이름을 그림 바로 아래 캡션으로 옮긴다.
4. 누적 기록은 숫자를 중복하지 않는 `독서 여정 장부`로 바꾸고 질문·서평 기록으로 이동할 수 있게 한다.
5. 알림 설정 화면 상단의 중복 breadcrumb와 eyebrow를 제거한다.
6. 홈 바로가기의 두 행 사이 구분선을 행 구조에 맞게 정렬한다.

서버, BFF, API, DB, avatar key, artwork asset와 프로필 저장 동작은 바꾸지 않는다.

## 2. 목표

1. 선택 타일의 공간을 artwork와 서정 이름에 우선 배분한다.
2. 선택 상태와 키보드 focus 상태를 서로 다른 시각 언어로 유지한다.
3. 참석 명단에서 8명을 한 줄에 빠르게 훑고, 8명 초과도 같은 밀도로 읽을 수 있게 한다.
4. 아바타 서정 이름이 어느 그림을 설명하는지 즉시 이해되게 한다.
5. 누적 기록에서 같은 숫자를 서사와 지표에 반복하지 않는다.
6. 모임, 완독, 질문과 서평을 각각 한 번씩 표시하고 관련 기록으로 이동할 수 있게 한다.
7. 데스크톱과 모바일에서 정보 계층, 줄바꿈, touch target과 focus 표시를 보존한다.
8. 알림 inbox와 settings가 같은 간결한 `알림` header 구조를 사용하게 한다.

## 3. 비목표

- avatar artwork, key, catalog 순서, fallback 또는 asset 변경
- 프로필 저장 API, query, mutation, 서버 계약 또는 migration 변경
- 완독률, 순위, 배지, 점수, streak 또는 다른 파생 성취 추가
- 회차별 완독 상태를 추정한 타임라인 생성
- 참석자 이름이나 RSVP 상태의 공개 범위 변경
- `내 공간 관리`의 알림·계정 설정 링크, 순서 또는 문구 변경
- 알림 수신 설정 항목, tab, 저장·오류·재시도 동작 변경
- 실제 회원 정보나 배포 상태를 fixture 또는 문서에 기록

## 4. 선택한 설계

### 4.1 체크 없는 아바타 선택

`AvatarPicker`는 selected 타일의 체크 아이콘 DOM을 렌더링하지 않는다. 체크가 차지하던 상단 padding도 제거하고 artwork, 서정 이름과 타일 내부 간격을 다시 정렬한다.

선택 상태는 다음 세 가지로 전달한다.

- `aria-pressed="true"`
- accent border
- 절제된 accent-soft 배경

키보드 focus는 선택 테두리 바깥의 별도 `focus-visible` outline으로 표시한다. 선택 상태를 focus처럼 보이게 만들거나 focus outline을 제거하지 않는다. hover, disabled와 reduced-motion 계약은 유지한다.

### 4.2 참석 명단 8열

멤버 홈의 RSVP 참석 명단은 반복 항목 관계를 명시하는 CSS grid로 바꾼다.

- 데스크톱: `repeat(8, minmax(0, 1fr))`
- 8명 초과: 같은 8열의 다음 행으로 줄바꿈
- 실제 4/12 사이드 칼럼: 비조작형 artwork를 데스크톱 32px로 조밀하게 표시해 8열 겹침을 방지
- 좁은 화면: artwork를 38px로 유지하면서 4~5열로 재배치
- 각 grid cell 안에서 avatar artwork를 가운데 정렬
- 긴 accessible label과 실제 참석자 수는 레이아웃 폭 계산에 영향을 주지 않음

순서는 API가 제공한 참석자 순서를 그대로 유지한다. RSVP count와 avatar accessible label은 바꾸지 않는다.

### 4.3 아바타 이름 캡션

내 공간 프로필은 `나의 아바타 · <이름>` 문장을 identity copy에서 제거한다. artwork와 서정 이름을 하나의 의미 그룹으로 묶고 이름을 그림 바로 아래에 표시한다.

- 보이는 문구는 접두사 없이 서정 이름만 사용
- 데스크톱과 모바일 모두 artwork 아래 중앙 정렬
- 긴 이름은 생략하지 않고 자연스럽게 줄바꿈
- 사용자 표시 이름과 멤버십 metadata는 기존 identity 열에 유지
- decorative image의 빈 alt와 현재 프로필 heading 구조는 유지

프로필 편집 권한 여부와 무관하게 아바타 이름은 읽기 정보로 보인다.

### 4.4 독서 여정 장부

기존 `함께 읽어 온 기록` 영역은 네 개의 동일한 텍스트 KPI가 아니라 하나의 편집형 장부로 구성한다.

상단:

- kicker: `함께 읽어 온 기록`
- 숫자가 없는 heading: `읽고, 묻고, 기록해 온 시간`
- 상단 heading 행에는 별도 action을 두지 않음

왼쪽 `함께한 여정` 그룹:

- `함께한 모임 <n>회`
- `함께 완독한 책 <n>권`

오른쪽 `기록의 흔적` 그룹:

- 제목 오른쪽에 `기록 보기` 텍스트 링크를 배치하고 뒤쪽 화살표 icon은 표시하지 않음
- 질문 icon, `대화를 연 질문`, `<n>개`, `책에서 시작된 생각의 기록`
- 서평 icon, `남긴 서평`, `<n>편`
- 서평 보조 문구: `읽고 난 마음을 풀어낸 기록`

각 숫자는 정확히 한 번만 표시한다. heading, body 또는 보조 문장에서 같은 숫자를 다시 말하지 않는다. 완독률과 progress bar는 표시하지 않는다. `기록의 흔적` 제목 위에는 별도 구분선을 두지 않고, 실제 질문·서평 행 사이의 얇은 규칙선만 유지한다. `기록의 흔적`과 `기록 보기`는 같은 text baseline에 정렬한다.

질문과 서평 행은 이동 기능이 없는 요약 정보로 렌더링한다. 이동은 `기록의 흔적` 제목 오른쪽의 `기록 보기` action 하나로 통합하고 기존 archive의 `view=sessions`로 연결한다. scoped route helper를 사용해 club slug를 보존한다.

모임, 완독, 질문과 서평에는 ReadMates의 기존 UI와 같은 둥근 cap·join과 절제된 선 굵기를 가진 16~18px inline SVG icon을 사용한다. 작은 UI icon은 테마 색상, 확대 배율과 선명도에 즉시 대응해야 하므로 생성형 raster asset을 추가하지 않는다. icon은 의미를 보조하며 label을 대신하지 않는다.

### 4.5 반응형 구조

데스크톱에서는 왼쪽 열에 kicker·heading·여정 지표를 묶고, 오른쪽 열의 `기록의 흔적`을 kicker와 같은 시작 높이에 배치한다. heading이 전체 폭을 먼저 차지해 오른쪽 열 위가 비는 구조를 만들지 않는다. 모바일에서는 heading, 여정 지표, 기록의 흔적 순서로 한 열에 쌓는다.

모바일의 여정 지표는 화면 폭이 허용하면 2열을 유지하고, 320px 부근에서는 1열로 전환한다. DOM 순서는 heading → 모임 → 완독 → 기록 보기 → 질문 → 서평이며 시각 순서와 동일하다.

기존 `내 공간 관리` 영역은 독서 여정 장부 바로 아래에 유지한다. `알림`과 `계정 설정` 링크, 보조 문구, route와 접근 순서는 바꾸지 않는다.

### 4.6 알림 설정 헤더 정리

`/app/notifications/settings` 상단에서 다음 두 보조 텍스트를 제거한다.

- `내 공간 / 알림` breadcrumb 전체
- `읽는사이 · 알림` eyebrow

페이지의 `알림` h1과 `받고 싶은 이메일 알림을 직접 선택합니다.` summary는 유지한다. 받은 알림·수신 설정 tab, `수신 설정` h2, switch, 저장 버튼, 오류·재시도 상태와 route는 바꾸지 않는다. 결과적으로 settings header는 받은 알림 화면과 같은 title·summary 계층을 사용한다.

설정 surface는 목록 시작의 위쪽 경계와 각 설정 행 사이 구분선을 유지하되, `알림 설정 저장` 버튼 아래에 남는 마지막 하단 경계선은 제거한다. 저장 action 위의 구조적 간격과 오류 문구 배치는 유지한다.

breadcrumb의 유일한 consumer가 사라지면 `mySpaceHref` prop 조립과 전용 `MemberSpaceBreadcrumb` 모듈도 함께 제거한다. 이 정리는 표시 변경에 따른 dead code 제거이며 다른 내 공간 링크를 없애지 않는다.

### 4.7 홈 바로가기 구분선

데스크톱 홈의 `바로가기`에서 `피드백 문서 / 회차 피드백`과 `안내문 / 모임 가이드` 사이 구분선을 개별 link의 inline `borderTop`과 rounded corner 조합으로 그리지 않는다.

바로가기 surface와 link에 의미 있는 class를 부여하고, 인접한 두 번째 행의 시작 경계로 한 번만 그린다. 구분선은 행 전체의 실제 content 폭과 수평 정렬되며 글자, link radius 또는 chevron과 겹치지 않는다. label, sub label, href, 순서와 hover/focus 동작은 유지한다. 모바일의 2열 shortcut card 구조에는 이 데스크톱 행 구분선을 적용하지 않는다.

## 5. 데이터 흐름과 경계

`MyJourneySummary`가 이미 제공하는 다음 값을 그대로 사용한다.

- `attendedSessionCount`
- `completedReadingCount`
- `questionCount`
- `reviewCount`

새 서버 필드나 파생 비율을 만들지 않는다. frontend view model은 각 지표의 의미, 단위와 0건 보조 문구를 명시한다. route는 세션 archive href 하나를 구성하고 UI는 전달받은 값과 링크를 렌더링한다.

`BOOK_CLUB_AVATARS`는 아바타 이름의 source of truth를 유지한다. 선택, 프로필 캡션과 fallback 이름 모두 기존 catalog helper를 사용한다.

## 6. 접근성

- picker tile의 `aria-pressed`, accessible name, disabled와 error 연결을 유지한다.
- selected border와 keyboard focus outline을 별도로 표시한다.
- roster avatar label은 이름과 RSVP 상태를 계속 전달한다.
- 독서 여정 장부는 heading과 definition 관계 또는 동등한 semantic markup을 사용한다.
- `기록 보기`는 시각적 baseline을 유지하면서 최소 44px 높이의 조작 영역을 제공한다.
- icon은 장식 요소로 숨기고 `기록 보기` link의 보이는 문구가 목적을 설명한다.
- 모든 링크와 버튼은 44px 수준의 touch target 또는 충분한 행 높이를 가진다.
- 숫자, icon 또는 색상만으로 지표 의미를 전달하지 않는다.

## 7. 테스트와 검증

### 7.1 TDD 집중 테스트

구현 전에 다음 실패 assertion을 추가한다.

- `AvatarPicker`: selected 타일에 check element가 없고 `aria-pressed`, selected class와 onChange가 유지됨
- picker component test: check용 상단 여백이 제거되고 artwork·label·focus outline이 겹치지 않음
- `RosterSummary`: 8열 전용 class 또는 semantic grid hook을 사용하고 9명도 모두 같은 순서로 렌더링됨
- `MemberProfileSummary`: 접두사 문장이 사라지고 아바타 이름이 artwork caption 그룹 안에 존재함
- member-space view model: 네 지표의 구체적 label, 단위와 0건 문구를 생성하고 완독률을 만들지 않음
- `ReadingAchievementSummary`: 각 숫자가 한 번만 렌더링되고 질문·서평 행은 비대화형이며 `기록 보기` href가 올바름
- `MemberNotificationSettingsPage`: breadcrumb와 eyebrow가 없고 저장 버튼 아래 surface 하단선 전용 class 계약이 제거됨
- responsive component test: desktop 8열 roster, mobile 4~5열 roster, 320px 장부 stack과 overflow 없음

### 7.2 자동 검증

집중 Vitest와 component test를 먼저 실행한 뒤 저장소 고정 package manager로 frontend gate를 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

프로필 편집과 member home 흐름의 기존 E2E가 영향받는 경우 해당 spec을 실행한다.

### 7.3 시각 검증

- `/clubs/:slug/app/me`: desktop, 390px, 320px
- `/clubs/:slug/app`: 참석자 1명, 8명, 9명 이상
- picker: selected, hover, keyboard focus, disabled, 긴 서정 이름과 마지막 행
- 장부: 모든 값 0, 질문 또는 서평만 0, 긴 사용자 이름과 긴 club metadata

## 8. 예상 변경 표면

- `front/features/archive/ui/my-page/avatar-picker.tsx`
- `front/features/archive/ui/my-page/member-profile-summary.tsx`
- `front/features/archive/ui/my-page/reading-achievement-summary.tsx`
- `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- `front/features/archive/ui/my-page.tsx`
- `front/features/archive/route/my-page-route.tsx`
- `front/features/archive/model/my-reading-shelf-model.ts`
- `front/features/member-home/ui/member-home-records.tsx`
- `front/features/member-home/ui/member-home.tsx`
- 관련 member home test
- `front/features/notifications/ui/member-notification-settings-page.tsx`
- `front/features/notifications/ui/member-notification-settings-page.test.tsx`
- `front/features/notifications/ui/member-space-breadcrumb.tsx`
- `front/features/notifications/route/member-notification-settings-route.tsx`
- `front/src/styles/globals.css`
- `front/shared/styles/mobile.css`
- 관련 co-located unit/component tests

## 9. 완료 기준

1. picker selected 타일에 체크 아이콘과 체크용 빈 공간이 없다.
2. selected와 keyboard focus가 서로 구분된다.
3. 데스크톱 참석 명단이 8열이며 9명 이상은 다음 행으로 이어진다.
4. 모바일 참석 명단이 artwork를 과도하게 축소하지 않고 4~5열로 재배치된다.
5. 아바타 서정 이름이 artwork 바로 아래에 보이고 `나의 아바타 ·` 접두사가 없다.
6. 독서 여정 heading에는 숫자가 없고 모임·완독·질문·서평 값은 각각 한 번만 보인다.
7. 완독률과 progress bar가 없다.
8. 질문·서평 행은 이동 기능이 없고 club scope를 유지한 `기록 보기`만 `기록의 흔적` 오른쪽에 화살표 없이 표시된다.
9. desktop과 320px/390px에서 overlap, overflow와 잘림이 없다.
10. 알림 설정 header에 breadcrumb와 `읽는사이 · 알림` eyebrow가 없고 title·summary·tab·설정 동작은 유지된다.
11. 알림 설정 저장 버튼 아래 마지막 경계선이 없고 목록 위쪽·행 사이 구분선은 유지된다.
12. 홈 바로가기 두 행 사이 구분선이 surface 폭과 정렬되고 label·sub label·chevron을 침범하지 않는다.
13. focused tests, frontend lint/test/build와 필요한 component/E2E 검증이 통과하거나 실행하지 못한 명령과 이유가 기록된다.
