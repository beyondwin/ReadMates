# ReadMates 내 공간 기록·계정·알림 정보구조 리디자인

작성일: 2026-07-28
상태: 사용자 승인 완료

## 1. 요약

`/clubs/:clubSlug/app/me`는 개인 독서 기록, 계정 관리, 알림 설정, 로그아웃을 한 route의 긴 disclosure에 함께 담고 있다. 현재 책별 기록이 늘어날수록 설정 disclosure와 로그아웃이 목록 아래로 밀린다. 데스크톱 책별 기록 행은 넓은 폭을 충분히 사용하지 못하고, `최근 책별 기록` 안내와 첫 목록 행이 같은 기록을 반복한다.

이 디자인은 멤버 화면을 역할별로 분리한다.

- `나의 서재`는 정확한 개인 요약과 최근 책별 기록 3개만 보여준다.
- 전체 개인 기록은 전용 route에서 연도별 cursor 목록으로 제공한다.
- 프로필과 멤버십 관리는 전용 계정 route로 옮긴다.
- 로그아웃은 모든 인증된 앱 화면의 프로필 메뉴에서 즉시 접근하게 한다.
- 알림 수신 설정은 알림함의 `수신 설정` 탭으로 옮긴다.

책별 기록 행은 데스크톱과 모바일 모두 `표지 | 책·회차 정보 | 행동`이라는 동일한 3열 구조를 사용한다. 책별 `질문 N`, `서평 N`, `나의 기록` 열은 제거하고 전체 질문·서평 수는 상단 개인 요약에서만 보여준다.

이 문서는 `docs/superpowers/specs/2026-07-27-my-reading-shelf-redesign-design.md`의 설정 disclosure, 최근 기록, 책별 기록 행, 마이페이지 loader 결정을 대체한다. 기존 journey API의 권한, summary, 정렬, cursor, query-budget 계약은 유지한다.

## 2. 현재 문제

실제 로컬 멤버 화면에서 다음 문제가 확인됐다.

1. 설정을 열어도 profile, 알림, 로그아웃, 멤버십 경계가 전체 책별 기록 목록 뒤에 나타난다.
2. 기록 수가 늘어날수록 로그아웃 접근 거리가 길어지며, PC에서는 상단 프로필 원형 표시가 동작하지 않아 다른 탈출구가 없다.
3. `최근 책별 기록` 안내 panel은 실제 행동 없이 첫 번째 책을 설명하고, 곧바로 같은 책이 전체 목록 첫 행에 다시 나타난다.
4. 데스크톱 행은 표지와 책 정보가 왼쪽에 몰리고 오른쪽 폭이 비어 있다.
5. 책별 질문·서평 chip을 별도 열로 두면 `나의 기록 / 서평 1`처럼 라벨과 값이 뜬금없이 분리되고 행의 읽기 흐름이 끊긴다.
6. 알림 preference는 알림함보다 마이페이지 설정에 있어 사용자가 `받은 알림`과 `받을 알림`을 서로 다른 정보 공간에서 관리해야 한다.

## 3. 목표

1. 사용자가 PC와 모바일 어디서든 두 번 이내의 동작으로 로그아웃할 수 있게 한다.
2. 나의 서재 첫 화면을 개인 요약과 최근 기록 3개로 제한해 재방문 밀도를 높인다.
3. 클럽 전체 아카이브와 개인 기록 전체 보기를 명확히 구분한다.
4. 데스크톱과 모바일의 책별 기록 행이 같은 정보 순서와 semantic DOM을 사용하게 한다.
5. 받은 알림과 알림 수신 설정을 한 알림 정보구조 안에 둔다.
6. 기존 journey, profile, notification preference, logout API 계약과 권한 경계를 보존한다.
7. 로딩, 빈 상태, 추가 로딩 실패, 저장 실패, 권한 제한을 각 기능 안에서 독립적으로 표현한다.

## 4. 비목표

- journey API, profile API, notification preference API 또는 logout API의 서버 계약 변경
- 새 DB table이나 Flyway migration 추가
- 클럽 전체 `/app/archive` 화면의 리디자인
- 질문·서평 검색, 필터, 정렬 또는 새 작성 기능
- 알림 종류, 발송 정책, 이메일 provider 또는 저장 정책 변경
- 클럽 탈퇴와 프로필 이름 변경의 도메인 규칙 변경
- 공개 사이트, 호스트 운영 화면, 플랫폼 관리자 화면 리디자인
- 공용 디자인 시스템 전체 리팩터링

## 5. 검토한 접근

### 5.1 채택: 역할별 분리

나의 서재, 전체 개인 기록, 계정 관리, 받은 알림, 알림 수신 설정을 각자의 목적에 맞는 route로 나눈다. 로그아웃은 전역 프로필 메뉴에 둔다.

장점:

- 기록 길이가 계정 행동 접근성에 영향을 주지 않는다.
- `/app/archive`는 클럽 전체 기록, `/app/me/records`는 개인 기록이라는 차이가 명확하다.
- 알림함과 수신 설정을 같은 맥락에서 찾을 수 있다.
- 첫 화면은 최근 3개만 렌더링해 짧고 재방문하기 쉽다.

비용:

- 멤버 route 세 개와 프로필 메뉴가 추가된다.
- 현재 마이페이지에 모여 있는 loader와 UI를 역할별로 분리해야 한다.

### 5.2 제외: 같은 화면에서 3개씩 펼치기

`/app/me`에 최근 3개와 `더 펼치기`를 두고 설정 panel을 목록 위로 옮기는 방식이다.

제외 이유:

- 새 route는 줄지만 기록과 설정이 다시 한 화면에서 경쟁한다.
- 기록을 계속 펼치면 페이지가 다시 길어지고 URL·뒤로가기·재방문 위치가 불명확하다.

### 5.3 제외: 내 공간을 계정 허브로 변경

내 공간을 프로필과 로그아웃 중심으로 만들고 기록은 클럽 아카이브로 보낸다.

제외 이유:

- 개인 기록과 클럽 전체 기록의 범위가 섞인다.
- `개인 독서 책상`이라는 멤버 화면의 제품 정체성과 회고 가치가 약해진다.

## 6. 정보구조

### 6.1 Route

```text
/app/me
├─ 개인 요약
├─ 최근 책별 기록 3개
└─ 내 기록 전체 보기 → /app/me/records

/app/me/records
├─ 전체 개인 책별 기록
├─ 연도 구획
└─ cursor 더 보기

/app/me/settings
├─ 프로필
├─ 이메일과 멤버십 정보
└─ 클럽 탈퇴

/app/notifications
├─ 받은 알림 탭
└─ 알림 목록

/app/notifications/settings
├─ 수신 설정 탭
└─ 이메일 알림 preference
```

프로필 메뉴는 위 route와 별개로 인증된 멤버·호스트 앱 chrome에 항상 존재한다.

```text
프로필 메뉴
├─ 사용자 이름과 멤버 상태
├─ 내 공간
├─ 계정 관리
└─ 로그아웃
```

### 6.2 내비게이션 상태

- `/app/me`, `/app/me/records`, `/app/me/settings`에서는 상단과 하단의 `내 공간` 항목이 현재 위치다.
- `/app/notifications`와 `/app/notifications/settings`에서는 `알림` 항목이 현재 위치다.
- club-scoped route는 기존 `appBasePath`와 `scopedAppLinkTarget` 규칙을 사용한다.
- 새 링크는 현재 club scope를 유지하고 다른 club이나 unscoped route로 새지 않는다.

## 7. 나의 서재

### 7.1 기본 구성

`/app/me`는 다음 순서만 사용한다.

1. `내 공간 / 나의 서재` 제목과 짧은 설명
2. 정확한 개인 요약
3. `최근 책별 기록` 제목
4. 최신 3개 책별 기록 행
5. `내 기록 전체 보기`

기존 `계정·알림 설정` trigger, `최근 책별 기록` 설명 panel, 연도 구획, 전체 목록, 설정 disclosure는 제거한다.

개인 요약의 `참여`, `완독`, `질문`, `서평`은 journey page 길이가 아니라 서버 summary의 전체 aggregate를 사용한다. 최근 항목을 3개만 가져와도 summary는 전체 개인 기록을 나타낸다.

### 7.2 최근 3개

- 요청은 `GET /api/archive/me/journey?limit=3`을 사용한다.
- 서버가 보장하는 `date DESC`, `sessionNumber DESC`, `sessionId DESC` 순서를 그대로 사용한다.
- 별도의 `latest` orientation을 계산하거나 같은 첫 item을 두 번 렌더링하지 않는다.
- journey item이 3개보다 적으면 존재하는 행만 보여준다.
- journey가 비어 있으면 기존 membership-aware empty-state 동작을 유지하고, 현재 회차 행동이 있을 때만 표시한다.

## 8. 전체 개인 기록

`/app/me/records`는 개인 journey 전체 탐색을 담당한다.

- 첫 요청은 `limit=12`를 사용한다.
- 유효한 날짜는 연도별로 묶고, 유효하지 않은 날짜는 `연도 미상`에 둔다.
- `nextCursor`가 있을 때만 `기록 더 보기`를 표시한다.
- 추가 page는 session ID 기준으로 중복을 제거해 기존 행 뒤에 붙인다.
- 추가 로딩 실패 시 기존 행과 scroll context를 보존하고 `다시 시도`를 제공한다.
- 클럽 전체 `/app/archive`로 자동 전환하거나 personal filter를 억지로 추가하지 않는다.

## 9. 책별 기록 행

### 9.1 공통 구조

최근 3개와 전체 개인 기록은 같은 `BookRecordRow` presentation을 사용한다.

```text
표지 | 책·회차 정보 | 행동
```

책·회차 정보:

- 회차 번호와 날짜
- 책 제목
- 저자

행동:

- `회차 기록`
- 열람 가능한 경우 `피드백 문서`
- 피드백 metadata가 존재하지만 권한이 없으면 비활성 링크 대신 짧은 `열람 제한` 상태

행에서 `나의 기록`, `질문 N`, `서평 N`, `질문 0`, `서평 0`, `남긴 기록 없음`은 모두 표시하지 않는다. 질문과 서평의 전체 수는 상단 개인 요약에서만 제공한다.

### 9.2 데스크톱과 모바일

- 두 breakpoint는 동일한 semantic DOM과 동일한 3열 순서를 사용한다.
- 데스크톱은 약 `48–56px` 표지, 유연한 책 정보 열, 오른쪽 정렬 행동 열을 사용한다.
- 모바일은 표지와 행동 열의 폭만 줄이고 책 제목 열이 자연스럽게 줄바꿈되게 한다.
- 모바일에서도 행동을 책 정보 아래로 재배치하지 않는다.
- 각 링크는 최소 `44px` hit target과 visible focus를 가진다.
- 행 전체를 링크로 만들지 않아 sibling인 회차 기록과 피드백 링크를 중첩하지 않는다.
- 긴 한국어·영어 제목은 행동 열을 밀어내지 않고 여러 줄로 감싼다.

## 10. 프로필 메뉴와 계정 관리

### 10.1 전역 프로필 메뉴

현재 desktop `TopNav`의 정적인 `AvatarChip`과 mobile `MobileHeader`의 chrome을 계정 메뉴 trigger로 확장한다.

- 접근 가능한 이름은 `{사용자 이름} 계정 메뉴`다.
- 메뉴는 데스크톱에서는 trigger에 정렬된 popover, 모바일에서는 상단 우측 trigger에 연결된 compact menu로 표시한다.
- `내 공간`은 `/app/me`, `계정 관리`는 `/app/me/settings`로 이동한다.
- 로그아웃은 확인 dialog 없이 기존 logout action을 즉시 실행한다.
- 로그아웃 중에는 중복 실행을 막고 `로그아웃 중` 상태를 표시한다.
- 실패하면 현재 route를 유지하고 메뉴 안에 `로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.`를 표시한다.
- 성공하면 기존 auth state 정리와 로그인 화면 이동을 유지한다.
- 바깥 클릭과 `Escape`로 닫고, 닫힌 뒤 포커스는 trigger로 돌아간다.
- 메뉴를 열 때 첫 항목으로 강제 이동하지 않고 현재 keyboard convention과 자연스러운 tab order를 유지한다.

`TopNav`와 `MobileHeader` 같은 shared UI는 auth API를 직접 import하지 않는다. 앱 layout이 feature-owned account-menu controller를 조합해 slot 또는 prop으로 전달한다.

### 10.2 계정 관리

`/app/me/settings`는 다음만 담당한다.

- display name과 account name
- email, club, membership status, joined-at 정보
- 기존 permission에 따른 profile 편집
- 기존 확인 절차를 유지하는 클럽 탈퇴

알림 preference와 로그아웃은 이 화면에 중복하지 않는다. 탈퇴는 일반 profile 정보와 구분선·제목으로 분리하고 destructive 의미를 문구와 styling으로 함께 표현한다.

## 11. 알림함과 수신 설정

### 11.1 탭

`/app/notifications`와 `/app/notifications/settings`는 공통 header 아래 URL 기반 탭을 사용한다.

- `받은 알림`: 알림 목록, 모두 읽음, cursor 더 보기
- `수신 설정`: 이메일 알림 전체와 event별 switch, 명시적 저장

탭은 링크 semantics를 사용하므로 새로고침, 직접 접근, 브라우저 뒤로가기가 동작한다. 모바일과 데스크톱은 같은 탭 순서를 사용한다.

### 11.2 수신 설정

- 현재 notification preference API와 수동 저장 정책을 유지한다.
- 전체 이메일 알림이 꺼지면 event switch는 비활성화되고 `전체 알림 꺼짐` 상태를 제공한다.
- 저장 중에는 switch와 저장 버튼의 중복 입력을 막는다.
- 저장 성공 후 server response로 draft를 동기화한다.
- preference를 관리할 수 없는 membership에는 변경 가능한 switch를 표시하지 않는다.
- preference 로딩 또는 저장 실패는 받은 알림 route를 막거나 목록 state를 지우지 않는다.

## 12. 프런트엔드 경계와 데이터 흐름

### 12.1 Route와 loader

- `my-page-data.ts`: profile과 journey `limit=3`
- 새 personal-records loader: journey `limit=12`
- 새 account-settings loader: profile
- 기존 member-notifications loader: 받은 알림
- 새 notification-settings loader: notification preferences

profile과 journey는 나의 서재의 필수 데이터다. notification preference는 더 이상 마이페이지 loader에서 시작하지 않는다.

### 12.2 UI와 model

- route module은 auth, loader data, cursor, mutation, revalidation, 메뉴 controller를 소유한다.
- UI는 prop과 callback만 받아 렌더링한다.
- `BookRecordRow`는 API, query, route 또는 fetch를 import하지 않는다.
- 연도 grouping, 날짜 label, cursor item deduplication은 pure model에 둔다.
- 질문·서평 chip view-model과 최신 item orientation은 제거한다.
- profile menu UI는 logout API를 직접 부르지 않고 controller callback을 사용한다.

### 12.3 서버와 BFF

새 endpoint, trusted header, BFF proxy, authorization rule, persistence 또는 migration은 필요하지 않다. 구현 중 현재 API 계약만으로 승인된 UI를 만들 수 없다는 사실이 확인되면 서버 변경을 추정해 추가하지 말고 디자인 범위를 다시 검토한다.

## 13. 오류와 상태

| 표면 | 상태 | 동작 |
| --- | --- | --- |
| 나의 서재 | 필수 profile 또는 journey 실패 | 현재 route error boundary |
| 나의 서재 | 기록 없음 | membership-aware empty state와 사용 가능한 행동만 표시 |
| 전체 개인 기록 | 첫 page 실패 | route error boundary |
| 전체 개인 기록 | 추가 page 실패 | 기존 행 보존, 인라인 오류, 같은 cursor 재시도 |
| 계정 관리 | profile 저장 실패 | 입력과 현재 profile 유지, profile 영역에 오류 |
| 프로필 메뉴 | 로그아웃 실패 | 현재 route와 열린 메뉴 유지, 인라인 오류 |
| 알림함 | 목록 실패 | 알림 route error boundary |
| 수신 설정 | preference 로딩 실패 | 수신 설정 안에서 재시도 |
| 수신 설정 | 저장 실패 | draft 유지, 인라인 오류, 재저장 허용 |

오류는 색상만으로 전달하지 않고 `role="alert"` 또는 동등한 접근성 상태와 명확한 한국어 문구를 사용한다.

## 14. 접근성과 반응형

- 프로필 trigger는 native button, 탭은 link, switch는 `role="switch"`를 유지한다.
- active tab과 active navigation은 `aria-current` 또는 동등한 semantics를 사용한다.
- 메뉴 trigger는 열림 상태와 menu 관계를 전달한다.
- `Escape`, 바깥 클릭, tab 이동, focus return을 keyboard로 검증한다.
- 390px 모바일과 일반 데스크톱에서 title wrapping, action 열, 하단 tab bar, 상단 메뉴가 겹치지 않아야 한다.
- desktop과 mobile에서 동일한 기록 행 DOM을 사용한다.
- reduced-motion 환경에서 메뉴와 switch transition을 제거하거나 최소화한다.
- email은 나의 서재에서 숨기고 계정 관리 route에서만 보여준다.

## 15. 예상 변경 표면

주요 예상 파일은 다음과 같다. 구현 계획에서 현재 code ownership을 다시 확인해 확정한다.

- `front/src/app/routes/member.tsx`
- `front/src/app/layouts/app-route-layout.tsx`
- `front/shared/ui/top-nav.tsx`
- `front/shared/ui/mobile-header.tsx`
- `front/features/auth/route/*account-menu*`
- `front/features/auth/ui/*account-menu*`
- `front/features/archive/route/my-page-*`
- `front/features/archive/route/*personal-records*`
- `front/features/archive/route/*account-settings*`
- `front/features/archive/ui/my-page/*`
- `front/features/notifications/route/*notification-settings*`
- `front/features/notifications/ui/*notification-settings*`
- `front/src/styles/globals.css`
- 관련 co-located unit tests와 멤버 E2E

공용 `TopNav`와 `MobileHeader`는 account control을 렌더링할 수 있는 presentation slot만 제공하고 auth feature를 import하지 않는다.

## 16. 검증

### 16.1 집중 테스트

- `/app/me` loader가 journey `limit=3`을 사용하고 summary 전체 값을 유지한다.
- `/app/me`는 최대 3개 행만 렌더링하고 `최근 책별 기록` 설명 panel과 설정 disclosure를 렌더링하지 않는다.
- `/app/me/records`는 첫 12개, 연도 grouping, continuation, last page, duplicate accumulation, retry를 처리한다.
- 기록 행은 데스크톱과 모바일 모두 같은 3열 DOM이며 질문·서평 chip을 렌더링하지 않는다.
- feedback 상태에 따라 `피드백 문서`, `열람 제한`, 무표시가 구분된다.
- 프로필 메뉴는 click, keyboard, `Escape`, 바깥 클릭, focus return을 지원한다.
- 로그아웃 pending, 성공, 실패가 현재 auth-state 계약을 보존한다.
- account settings의 permission과 탈퇴 확인 절차가 유지된다.
- notification tab 직접 접근, current state, preference 로딩·저장·실패가 독립적으로 동작한다.
- club-scoped URL이 새 route와 메뉴 링크에서도 유지된다.

### 16.2 선택한 acceptance-matrix row

- `UI or runtime state`: loading, empty, error, wrapping, desktop, mobile, focus 상태가 직접 바뀐다.
- `Cursor collection`: 전체 개인 기록 route가 first, continuation, last, dedup, retry를 소유한다.
- `Actor or authorization`: inactive/viewer membership의 profile, preference, 탈퇴 가용성을 보존해야 한다.

인접 high-risk row 제외:

- `BFF or OAuth`: logout과 기존 API presentation만 이동하며 proxy, cookie, trusted header, OAuth return 계약은 바꾸지 않는다.
- `Publication visibility`: journey와 feedback 가용성의 기존 서버 결정을 그대로 표시한다.
- `Persistence or migration`, `Async, cache, or provider`, `Session lifecycle`: 해당 계약과 상태를 변경하지 않는다.

### 16.3 프런트엔드 게이트

구현 시 root의 pinned package manager를 Corepack으로 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

집중 test를 먼저 실행한 뒤 위 gate를 최종 HEAD에서 실행한다. 수동 검증은 실제 멤버 fixture로 다음을 확인한다.

- 데스크톱에서 최근 3개 밀도와 오른쪽 행동 열
- 390px 모바일에서 동일한 3열 구조와 긴 제목 wrapping
- 모든 인증된 앱 화면에서 프로필 메뉴와 로그아웃 접근
- 계정 관리 route의 profile·membership·탈퇴
- 받은 알림과 수신 설정 탭의 직접 접근·뒤로가기·오류 격리

## 17. 수용 기준

1. `/app/me`는 개인 요약과 최근 기록 최대 3개만 보여준다.
2. 전체 개인 기록은 `/app/me/records`에서 cursor로 이어 본다.
3. 기존 최근 기록 설명 panel과 목록 뒤 설정 disclosure가 제거된다.
4. 책별 기록 행은 모든 breakpoint에서 `표지 | 책·회차 정보 | 행동` 3열 구조를 사용한다.
5. 행에 `나의 기록`, `질문 N`, `서평 N`을 표시하지 않는다.
6. 로그아웃은 모든 인증된 앱 화면의 프로필 메뉴에서 접근 가능하다.
7. 프로필·멤버십·탈퇴는 `/app/me/settings`에서 관리한다.
8. 알림함과 수신 설정은 URL 기반 탭으로 연결되고 서로의 오류에 종속되지 않는다.
9. 기존 API, 권한, club scope, cursor, logout, preference 저장 계약이 유지된다.
10. 데스크톱과 모바일의 wrapping, focus, 44px target, 오류 상태가 검증된다.
