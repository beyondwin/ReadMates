# ReadMates 내 공간 읽기 개요·최근 기록 리디자인

작성일: 2026-07-29
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/me`를 프로필과 누적 수치만 놓인 얇은 화면에서 프로필, 독서 성취, 최근 읽은 기록이 자연스럽게 이어지는 개인 독서 개요로 확장한다.

현재 화면은 프로필과 누적 성취를 정확하게 보여 주지만, 데스크톱의 넓은 지면에 비해 정보량과 시각적 초점이 부족하다. 프로필과 성취가 서로 떨어진 두 줄처럼 보이고, 화면 하단에는 다음 탐색으로 이어지는 내용이 없다. `계정 관리`는 44px 조작 영역을 확보했지만 밑줄 텍스트 링크처럼 보여 인접한 `프로필 수정` 버튼과 시각 언어가 맞지 않는다.

새 화면은 다음 세 질문에 빠르게 답한다.

1. 이 클럽에서 나는 어떤 프로필과 멤버십 상태인가?
2. 지금까지 어떤 독서 성취가 쌓였는가?
3. 최근 함께 읽은 기록을 어디서 다시 볼 수 있는가?

방문자 모드는 `Operate`다. 다만 일반적인 관리 대시보드가 아니라 ReadMates의 “개인 독서 책상” 정체성을 유지한다.

## 2. 현재 화면 진단

라이브 로컬 화면과 현재 구현을 함께 확인한 결과는 다음과 같다.

- 데스크톱은 최대 920px 지면 안에서 프로필 약 155px, 성취 약 332px만 사용하고 이후 맥락이 끊긴다.
- 프로필과 성취가 각각 독립된 가로 띠로 보여 두 정보를 한눈에 묶어 읽기 어렵다.
- 큰 성취 문장은 시각적 초점이지만 주변 정보가 적어 페이지 전체보다는 단일 통계 구획처럼 보인다.
- 최근 개인 기록, 기록 상세, 전체 개인 기록으로 이어지는 탐색 진입점이 없다.
- `계정 관리`는 의미상 이동 action인데 밑줄 링크로 표현되어 `프로필 수정` 버튼과 조작 위계가 어색하다.
- 모바일의 의미 순서와 조작 영역은 유지할 가치가 있지만, action 표현과 최근 기록 부재는 동일한 문제다.

## 3. 목표

1. 프로필과 누적 성취를 하나의 시각적 지면으로 묶어 첫 화면의 정보 위계를 강화한다.
2. 최근 함께 읽은 기록 3건을 실제 데이터로 보여 주어 빈 공간을 의미 있는 개인 기록으로 채운다.
3. `계정 관리`를 밑줄 없는 명확한 이동 버튼으로 바꾸되 페이지의 주인공으로 과도하게 강조하지 않는다.
4. 기존 누적 summary와 journey item 계약을 재사용하고 서버, BFF, 데이터베이스 변경 없이 구현한다.
5. `/app/me/records`, 회차 기록, 계정 관리로 이어지는 탐색을 복원한다.
6. 데스크톱과 모바일에서 같은 의미 순서, 권한, 접근성, 오류 동작을 유지한다.

## 4. 비목표

- 계정 관리 페이지, 아카이브, 클럽 노트 또는 회차 상세의 전면 리디자인
- 질문·서평 본문이나 피드백 문서 본문을 내 공간에 직접 노출
- 회차별 출석 원장, 최근 출석 판정, 연속 참여, 순위, 배지 또는 경쟁 요소
- 다른 멤버나 클럽 평균과의 비교
- 프로필 이미지 업로드
- 새로운 통계, API, BFF route, 서버 endpoint, 테이블 또는 migration
- 이메일, 계정명, 멤버십 정책, 로그아웃 또는 탈퇴 동작 변경
- 실제 책 표지가 없을 때 임의의 외부 이미지나 stock asset 사용

## 5. 검토한 방향

### 5.1 선택: 읽기 개요 + 최근 기록

프로필과 성취를 하나의 비대칭 지면으로 묶고, 그 아래 최근 함께 읽은 책 3건을 선형 목록으로 제공한다.

선택 이유:

- 프로필, 성취, 최근 기록이 “나를 확인하고 지난 독서를 다시 연다”는 하나의 흐름을 만든다.
- 실제 기록으로 데스크톱 공간을 채우므로 장식이나 빈 카드가 필요 없다.
- 최근 기록은 미리보기로 제한하고 전체 탐색은 기존 개인 기록 route에 맡겨 역할 중복을 통제할 수 있다.
- 문장, 표지, 얇은 선, 편집적 여백을 사용해 ReadMates의 개인 독서 책상 인상을 강화한다.

### 5.2 제외: 나의 독서 패스포트

합류 시점부터 최근 회차까지 연대기로 보여 주는 방향이다. 정서적 인상은 강하지만 회차가 늘수록 아카이브와 역할이 겹치고, 최근 기록보다 타임라인 표현이 앞서게 되므로 제외한다.

### 5.3 제외: 프로필·활동 허브

프로필, 통계, 설정 진입점을 작은 카드 격자로 구성하는 방향이다. 기능 탐색은 빠르지만 일반적인 SaaS 대시보드에 가까워지고, 과도한 카드라는 제품 anti-reference와 충돌하므로 제외한다.

## 6. 정보 구조

데스크톱과 모바일은 같은 DOM 및 의미 순서를 사용한다.

```text
내 공간
├─ 나의 독서 개요
│  ├─ 프로필
│  │  ├─ 이니셜 아바타
│  │  ├─ 표시 이름
│  │  ├─ 클럽 · 멤버십 · 합류 시점
│  │  ├─ 프로필 수정
│  │  └─ 계정 관리
│  └─ 함께 읽어 온 기록
│     ├─ 누적 값 기반 회고 문장
│     ├─ 보조 문장
│     └─ 함께한 모임 · 완독 · 질문 · 서평
└─ 최근 함께 읽은 기록
   ├─ 최근 기록 최대 3건
   │  ├─ 책 표지 또는 fallback
   │  ├─ 회차 · 날짜
   │  ├─ 책 제목 · 저자
   │  ├─ 질문 · 서평 · 피드백 상태
   │  └─ 회차 기록 이동
   └─ 전체 기록 보기
```

`전체 기록 보기`는 기존 `/app/me/records`로 이동한다. 각 최근 기록 행의 단일 주 목적지는 기존 `/app/sessions/:sessionId`다. 행 내부에 다른 링크를 중첩하지 않으며, 피드백 열람 가능 여부는 이 미리보기에서는 상태 텍스트로만 보여 준다. 피드백 문서 진입은 회차 기록 또는 전체 개인 기록 화면에 맡긴다.

## 7. 나의 독서 개요

### 7.1 데스크톱 구성

- 기존보다 넓은 최대 1080px 지면을 사용하되 viewport 가장자리 여백을 보존한다.
- 프로필과 성취를 하나의 paper surface 안에 배치하고 중앙의 얇은 rule로 구분한다.
- 프로필은 약 4, 성취는 약 6의 비율로 두어 회고 문장이 시각적 초점이 되게 한다.
- 프로필 구획은 아바타, 이름, 메타데이터, 두 action을 위에서 아래로 안정적으로 묶는다.
- 성취 구획은 kicker, 회고 제목, 보조 문장, 지표 정의 목록 순서로 구성한다.
- 별도의 hero, 카드 격자, 차트, 장식 badge는 만들지 않는다.

### 7.2 프로필 action

- `프로필 수정`은 현재 inline editor를 여는 조용한 보조 버튼이다.
- `계정 관리`는 semantic anchor를 유지하면서 `계정 관리 →` 텍스트의 compact outlined button으로 표시한다.
- `계정 관리`에는 상시 밑줄을 사용하지 않는다.
- hover는 배경과 border의 미세한 대비 변화로, focus-visible은 기존 focus ring으로 표현한다.
- 프로필 편집이 열리면 action 자리를 입력, 저장, 취소 흐름이 사용한다. 저장 중 중복 제출을 막고 레이아웃이 가로로 넘치지 않게 한다.
- `canEditOwnProfile`이 거짓이면 `프로필 수정`만 숨기고 `계정 관리`는 유지한다.

### 7.3 성취 지표

- 기존 cumulative summary 해석과 회고 문장 규칙을 유지한다.
- `함께한 모임`과 `완독`은 0도 표시한다.
- `질문`과 `서평`은 1개 이상일 때만 표시한다.
- 2~4개 지표를 한 줄의 정의 목록으로 배치하고 border-box 카드로 만들지 않는다.
- `멤버십 시작`은 프로필 메타데이터와 중복되므로 별도의 하단 행에서는 제거한다. 합류 시점은 프로필 구획에서 한 번만 제공한다.

## 8. 최근 함께 읽은 기록

### 8.1 데이터와 범위

`myPageLoader`는 현재처럼 프로필과 journey를 병렬로 요청한다. journey 요청의 page size만 `limit=1`에서 `limit=3`으로 변경한다.

- 누적 성취: `MyJourneySummary`
- 최근 목록: `MyJourneyPage.items`
- 표지: `bookImageUrl`
- 제목과 저자: `bookTitle`, `bookAuthor`
- 회차와 날짜: `sessionNumber`, `date`
- 활동 요약: `questionCount`, `reviewCount`, `feedbackDocument`

목록은 API가 반환한 최신순을 그대로 사용한다. 클라이언트가 최근 회차, 출석 또는 전체 기록을 다시 추정하지 않는다.

### 8.2 기록 행

- 실제 `bookImageUrl`이 있으면 작은 세로형 표지를 표시한다.
- 표지가 없으면 책 제목의 첫 유효 글자를 사용한 paper-tone fallback을 표시한다. 외부 이미지를 대체로 불러오지 않는다.
- 책 제목이 행의 주 제목이고, 회차·날짜는 상단 메타데이터, 저자는 보조 텍스트다.
- 질문과 서평이 양수일 때만 `질문 N`, `서평 N`을 표시한다.
- 피드백 문서가 읽기 가능하면 `피드백 열림`, 활성 멤버십이 필요하면 `피드백 제한`을 텍스트로 표시한다.
- 행 전체는 회차 기록으로 이동하는 하나의 anchor다. hover와 focus에서 배경 변화와 끝 화살표를 보여 준다.
- 데스크톱에서 세 행을 한 번에 읽을 수 있게 하고, 추가 pagination은 제공하지 않는다.

### 8.3 빈 상태

최근 기록이 없더라도 성취 구획은 숨기지 않는다.

- 최근 기록 구획에는 `첫 모임 이후 이곳에 읽은 기록이 이어집니다.` 한 문장만 제공한다.
- 큰 빈 카드, 0으로 채운 가짜 행, 이번 세션 CTA 또는 출석 추정값을 만들지 않는다.
- `전체 기록 보기`는 실제 items가 있을 때만 표시한다.

## 9. 모바일과 반응형

기존 768px member-space breakpoint와 모바일 safe-area 규칙을 유지한다.

- 프로필, 성취, 최근 기록을 단일 열로 쌓는다.
- 프로필과 성취 사이의 세로 rule은 가로 rule로 바뀐다.
- 아바타와 이름을 먼저 보여 주고 action 두 개는 그 아래 동일한 44px 이상 높이로 배치한다.
- action이 하나만 남으면 전체 폭을 사용한다.
- 지표는 2열로 줄바꿈하며 odd/even border가 의미 순서를 흐리지 않게 한다.
- 기록 행은 표지, 본문, 화살표의 세 영역을 유지하되 제목과 활동 요약이 자연스럽게 여러 줄로 흐르게 한다.
- 320px에서도 가로 page overflow를 만들지 않는다.
- 모바일 하단 앱 navigation과 겹치지 않도록 기존 safe padding을 유지한다.

## 10. 시각 언어

- 기존 warm paper, ink hierarchy, editorial serif, mono kicker, restrained mint와 ink-blue를 재사용한다.
- 프로필·성취 surface 하나 외에는 별도의 card shadow를 추가하지 않는다.
- 최근 기록은 surface 카드가 아니라 구분선 목록으로 표현한다.
- 책 표지는 실제 콘텐츠이므로 장식 이미지보다 우선한다.
- 장식적 gradient, glow, glassmorphism, 큰 그림자, 원형 통계, badge wall을 사용하지 않는다.
- `계정 관리`와 `전체 기록 보기`는 같은 arrow vocabulary를 쓰되, 전자는 버튼이고 후자는 section-level text action이다.
- hover motion은 2~4px 이하의 미세한 화살표 이동만 허용하며 `prefers-reduced-motion`에서는 제거한다.

## 11. 프런트엔드 경계와 컴포넌트

route-first dependency 방향을 유지한다.

### 11.1 Loader

`myPageLoader`는 다음 두 요청을 병렬로 수행한다.

1. `/api/app/me`
2. `/api/archive/me/journey?limit=3`

loader가 실패하면 다른 값으로 화면을 추정하지 않고 기존 route error boundary를 사용한다.

### 11.2 Model

pure model은 다음을 계산한다.

- 프로필 아바타와 메타데이터
- 누적 성취 회고 문장과 지표
- 최근 기록의 표시용 메타데이터와 상태 텍스트
- 잘못된 날짜, 빈 제목 또는 선택적 활동값의 fallback

model은 React, router, fetch, API client를 import하지 않는다.

### 11.3 Route/controller

route/controller는 다음을 담당한다.

- loader data를 view model로 변환
- 기존 profile update controller 재사용
- auth refresh와 route revalidation
- scoped account settings, personal records, session record href 제공

### 11.4 UI

UI 책임은 다음 경계로 나눈다.

- `MemberSpaceOverview`: 프로필과 성취의 공통 surface와 반응형 구성
- `MemberProfileSummary`: 프로필 표시와 기존 `ProfileNameEditor`
- `ReadingAchievementSummary`: 회고 문장과 지표
- `RecentReadingList`: 제목, 전체 기록 action, 빈 상태, 최대 3개 행
- `RecentReadingRow`: 표지, 책 정보, 활동 상태, 단일 회차 기록 anchor

UI는 props와 callback만 사용하며 API, auth state 또는 feature route를 import하지 않는다. 기존 `/app/me/records`의 pagination과 `BookRecordRow` 계약은 유지한다. 공통 표시 로직이 필요하면 model helper를 공유하되 최근 미리보기와 전체 기록 행의 상호작용 계약을 억지로 하나의 variant component로 합치지 않는다.

## 12. 오류와 예외 상태

- 프로필 저장 실패: 입력과 편집 상태를 유지하고 control 가까이에 `role="alert"`를 표시한다.
- 프로필 저장 중: 저장·취소 중복 조작을 막고 기존 이름과 성취·최근 기록은 유지한다.
- 잘못된 가입 월: 기간과 합류 월을 숨기고 다른 프로필 메타데이터만 표시한다.
- 잘못된 기록 날짜: `날짜 미상`을 사용한다.
- 빈 책 제목: 사용자에게 `제목 없는 책`으로 표시하고 표지 fallback에는 `책`을 사용해 링크의 접근 가능한 이름이 비지 않게 한다.
- 긴 한영 이름, 제목, 저자: 줄바꿈하며 action과 겹치지 않는다.
- 표지 로드 실패: 브라우저의 깨진 이미지 대신 동일한 local fallback으로 전환한다.
- 읽기 전용 멤버십: 프로필 수정만 숨기며 기록과 계정 관리 권한은 기존 route authorization 결과를 따른다.

## 13. 접근성

- 현재 표시 이름을 페이지의 유일한 `h1`으로 유지한다. 성취와 최근 기록은 각각 `h2`, 각 책 제목은 목록 문맥 안의 `h3`로 구성한다.
- 프로필과 성취는 각각 접근 가능한 이름을 갖되 하나의 상위 overview section 안에 포함한다.
- 최근 기록은 semantic list이며 각 행은 하나의 명확한 anchor다.
- 기록 행 anchor가 책 제목을 접근 가능한 이름으로 제공하므로 실제 표지 이미지는 `alt=""`, fallback 표지는 `aria-hidden="true"`로 처리한다.
- 링크와 버튼은 시각적으로 구분되고 모두 가시적인 focus indicator를 갖는다.
- 모바일 조작 영역은 최소 44px다.
- 상태나 권한을 색상에만 의존하지 않는다.
- 200% 확대와 320px viewport에서 가로 overflow를 허용하지 않는다.
- 필수 motion을 만들지 않고 reduced-motion을 존중한다.

## 14. 검증

### 14.1 Model tests

- 최근 기록 0건과 1~3건
- summary와 items의 독립성
- 질문·서평 0과 양수 조합
- 피드백 열림·제한·미제공
- 표지, 날짜, 제목 fallback
- 지표 2~4개와 잘못된 가입 월

### 14.2 Component and route tests

- 프로필·성취가 하나의 overview 안에서 올바른 의미 순서로 렌더링됨
- `계정 관리`가 `/app/me/settings` anchor이며 underline 의존 없이 button treatment를 가짐
- 최근 기록 최대 3건과 `/app/me/records` action
- 기록 행의 단일 회차 상세 href
- 최근 기록 빈 상태
- 프로필 수정 가능·불가능 권한
- 프로필 저장 성공·실패·중복 제출 방지와 auth refresh
- 기존 `/app/me/records` pagination 및 account settings 회귀 방지

### 14.3 Browser and E2E

- 데스크톱에서 overview와 최근 기록 3건의 시각 위계
- 390px, 320px, 200% 확대
- 긴 표시 이름, 긴 한영 책 제목, 표지 유무
- 키보드만으로 프로필 수정, 계정 관리, 최근 기록, 전체 기록 이동
- `/app/me` → `/app/me/settings`
- `/app/me` → 최근 회차 기록
- `/app/me` → `/app/me/records`
- 수정 권한이 없는 멤버십 상태
- 모바일 하단 navigation과 content safe padding

구현 후 frontend canonical gate를 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

## 15. 범위와 잔여 위험

예상 변경 표면:

- `front/features/archive/route/my-page-data.ts`
- `front/features/archive/route/my-page-route.tsx`
- `front/features/archive/model/my-reading-shelf-model.ts`
- `front/features/archive/ui/my-page.tsx`
- `front/features/archive/ui/my-page/**`
- `front/src/styles/globals.css`
- 관련 model, component, route, page 및 E2E tests

서버 API, BFF, 데이터베이스, 공개 화면, 호스트 화면, 알림 정책은 변경하지 않는다.

주요 잔여 위험은 다음과 같다.

- 최근 기록을 다시 추가하면서 아카이브 및 전체 개인 기록과 역할이 겹칠 수 있다. 최대 3건 미리보기와 단일 상세 진입으로 제한한다.
- 표지 이미지가 서로 다른 비율과 품질을 가질 수 있다. 고정된 cover frame과 실패 fallback을 검증한다.
- profile editor가 넓어진 overview 안에서 desktop/mobile 두 구성을 모두 흔들 수 있다. 편집 상태를 별도 responsive regression 대상으로 둔다.
- 기존 디자인 스펙은 최근 기록과 `/app/me/records` 진입점을 제외했다. 이 승인본이 `/app/me`의 현재 구성 결정에 한해 그 결정을 대체하며, 누적 summary의 정확성, profile update controller, 권한 및 서버 변경 없음 결정은 유지한다.

## 16. 승인된 결정

- 방향: 읽기 개요 + 최근 기록
- 상단: 프로필과 누적 성취를 하나의 비대칭 paper surface로 통합
- action: `프로필 수정`은 quiet button, `계정 관리 →`는 밑줄 없는 outlined anchor button
- 하단: 최근 함께 읽은 기록 최대 3건
- 기록 행: 단일 회차 기록 anchor, 질문·서평·피드백은 상태 요약
- 전체 탐색: `/app/me/records` 진입점 복원
- 데이터: 기존 journey 요청을 `limit=3`으로 확장하고 새 API는 추가하지 않음
- 표지: 실제 `bookImageUrl`, 미제공·실패 시 local paper fallback
- 모바일: 기존 768px breakpoint와 safe padding 유지
- 제외: 카드 대시보드, 패스포트 타임라인, 출석 추정, 경쟁 요소, 서버·BFF·DB 변경
