# ReadMates 내 공간 계정·아카이브 UX 정리

작성일: 2026-07-30  
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/me`의 프로필 영역에서 중복된 `계정 관리` 진입점을 제거하고, 프로필·독서 성취·최근 기록이 한 장의 개인 독서 책상처럼 이어지도록 정보 위계를 다시 구성한다.

계정 관리는 `/app/me`에 펼쳐 넣지 않는다. 이미 모든 멤버 화면에서 접근 가능한 전역 계정 메뉴가 계정 설정과 로그아웃 진입을 소유하고, `/app/me/settings`는 저빈도 계정·멤버십 정보를 다루는 독립 설정 화면으로 유지한다. 설정 화면에는 `← 내 공간` 복귀 링크를 명시한다.

최근 기록의 `전체 기록 보기`는 별도 개인 목록이 아니라 아카이브의 세션 기록으로 이동한다. CTA 문구는 목적지를 구체적으로 설명하는 `전체 세션 기록 보기`로 바꾸고 `/app/archive?view=sessions`를 가리킨다.

## 2. 현재 문제

### 2.1 프로필 정보의 읽기 순서

현재 프로필 구획은 다음 순서로 렌더링된다.

1. 아바타와 `내 프로필`
2. 표시 이름
3. `프로필 수정`
4. 큰 outlined `계정 관리`
5. 클럽·멤버십·합류 시점

정체성을 설명하는 메타데이터가 두 action 뒤로 밀려 `이름 → 행동 → 행동 → 설명` 순서가 된다. `프로필 수정`은 작은 quiet button이고 `계정 관리`는 더 넓은 outlined link라서, 저빈도 설정 이동이 이름 편집보다 강하게 보인다.

또한 전역 계정 메뉴가 이미 `내 공간`, `계정 관리`, `로그아웃`을 제공하므로 프로필 구획의 `계정 관리`는 기능과 시각 양쪽에서 중복이다.

### 2.2 계정 설정의 복귀 동선

`/app/me/settings`는 데스크톱 전역 navigation과 모바일 하단 앱 탭을 유지한다. 하지만 화면 콘텐츠 자체에는 `내 공간`으로 돌아가는 명시적 링크가 없다. 특히 모바일 헤더의 `내 공간` 표기는 링크가 아니므로 사용자는 하단 탭이나 브라우저 Back을 스스로 찾아야 한다.

### 2.3 전체 기록 목적지의 중복

`/app/me`의 최근 기록은 `/api/archive/me/journey`가 반환하는 개인 활동 기반 미리보기다. 현재 `전체 기록 보기`는 같은 endpoint를 pagination하는 `/app/me/records`로 이동한다.

한편 `/app/archive?view=sessions`도 동일한 책과 회차를 클럽 아카이브 문맥에서 제공하고, 피드백 문서·내 질문·내 서평으로 이어지는 정식 기록 허브 역할을 한다. 두 전체 목록을 동시에 사용자에게 노출하면 어떤 목록이 대표 목적지인지 판단해야 한다.

두 데이터 범위는 완전히 같지는 않다.

- 개인 journey는 닫힘·발행 상태이며 멤버에게 보이는 회차 중, 현재 멤버의 참석·질문·서평 또는 피드백 문서가 있는 회차만 포함한다.
- 아카이브 세션 목록은 현재 멤버가 열람할 수 있는 클럽 세션 기록 전체를 제공한다.

따라서 CTA를 아카이브로 통합하는 것은 타당하지만, `/app/me/records`를 즉시 삭제하거나 무조건 redirect하면 기존 개인 활동 목록의 의미가 바뀔 수 있다.

## 3. 목표

1. 프로필 영역의 읽기 순서를 `정체성 → 멤버십 맥락 → 독서 성취`로 복원한다.
2. 프로필 영역의 action을 이름 수정 하나로 좁힌다.
3. 계정·세션 관련 전역 기능은 전역 계정 메뉴에서 일관되게 찾을 수 있게 한다.
4. 독립 설정 화면에 명시적인 `내 공간` 복귀 동선을 제공한다.
5. 멤버십 탈퇴를 독서 화면과 일반 action에서 분리하고 결과 확인 뒤 완료하게 한다.
6. 최근 기록의 전체 목적지를 아카이브 세션 기록으로 통합한다.
7. 기존 API·권한·개인 기록 deep link를 깨뜨리지 않는다.
8. 데스크톱과 모바일에서 같은 DOM 의미 순서와 조작 가능성을 유지한다.

## 4. 비목표

- 서버 API, BFF, 데이터베이스, migration 또는 dependency 변경
- 프로필 이미지 업로드
- 이메일 또는 로그인 계정 변경
- 전역 navigation 또는 모바일 하단 앱 탭 전면 개편
- 아카이브의 세션·피드백·질문·서평 화면 전면 리디자인
- 개인 journey와 클럽 아카이브의 데이터 범위 통합
- `/app/me/records` route 삭제 또는 redirect
- 멤버십 탈퇴 정책과 기록 익명화 규칙 변경
- 새로운 계정 drawer, profile disclosure, 하단 accordion 또는 설정 sidebar

## 5. 조사 근거와 선택한 방향

### 5.1 조사한 원칙

- Apple은 저빈도·전역 설정은 독립 settings 영역에 두고, 현재 작업에만 영향을 주는 편집은 해당 문맥에서 제공하도록 안내한다.  
  [Apple Human Interface Guidelines — Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
- Carbon은 profile menu를 계정·세션 정보, settings, logout 같은 전역 기능의 일관된 진입점으로 정의한다.  
  [Carbon Design System — Disclosures](https://carbondesignsystem.com/patterns/disclosures-pattern/)
- GOV.UK는 브라우저 Back을 모르거나 신뢰하지 않는 사용자를 위해 명시적 back link를 제공하고, 복잡한 문맥에서는 돌아갈 목적지를 문구로 설명하도록 권장한다.  
  [GOV.UK Design System — Back link](https://design-system.service.gov.uk/components/back-link/)
- GitLab Pajamas는 파괴적 행동을 다른 action과 분리하고, 결과 설명과 취소가 있는 확인 단계 뒤에서 최종 danger action을 제공하도록 안내한다.  
  [Pajamas Design System — Destructive actions](https://design.gitlab.com/patterns/destructive-actions/)
- Material navigation은 recent items에서 complete history로 이동하는 관계를 문맥 내 navigation의 대표 사례로 든다.  
  [Material Design — Navigation](https://m1.material.io/patterns/navigation.html)
- W3C는 같은 기능을 반복해서 제공할 때 일관된 이름을 사용해 예측 가능성을 유지하도록 요구한다.  
  [W3C — Consistent Identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification)

### 5.2 선택: 역할 분리

선택한 방향은 다음 세 소유권으로 나눈다.

1. `/app/me`: 현재 클럽의 프로필 정체성, inline 이름 편집, 누적 독서 성취, 최근 기록
2. 전역 계정 메뉴: 내 공간, 계정 설정, 로그아웃 진입
3. `/app/me/settings`: 계정 정보, 현재 클럽 멤버십 정보, 멤버십 종료

계정 설정을 `/app/me`의 profile card, 하단 disclosure 또는 보조 column에 합치지 않는다. 이런 합성은 화면 수를 줄이지만 계정·탈퇴를 독서 성취와 같은 문맥으로 올리고, 개인 독서 책상이라는 페이지 목적을 약화한다.

### 5.3 제외한 방향

#### 프로필 card 내부 계정 disclosure

동선은 짧지만 이름·멤버십·로그아웃·탈퇴가 작은 프로필 영역에 모여 profile card가 관리 허브가 된다. 단일 설정 목적지를 disclosure 뒤에 감추는 추가 단계도 생긴다.

#### 페이지 하단 계정 accordion

저빈도 action을 낮출 수 있지만 독서 기록을 읽는 페이지 안에 계정·탈퇴를 계속 포함한다. 계정 기능의 전역 소유권도 모호해진다.

#### 데스크톱 계정 sidebar 또는 상시 column

계정 정보가 독서 성취와 동일한 시각 위계를 차지하고 일반적인 dashboard에 가까워진다. 모바일에서 별도 재배치 규칙도 필요하다.

#### 계정 modal 또는 drawer

현재 설정은 읽기 전용 정보, membership boundary, 파괴적 확인 흐름을 포함한다. 이를 transient overlay로 옮기면 URL, 브라우저 history, focus restoration, 작은 viewport keyboard 대응이 불필요하게 복잡해진다.

## 6. `/app/me` 정보 구조

데스크톱과 모바일은 같은 DOM 순서를 사용한다.

```text
내 공간
├─ 개인 독서 표제부
│  ├─ 내 프로필
│  │  ├─ 이니셜 아바타
│  │  ├─ 표시 이름
│  │  ├─ 이름 변경
│  │  └─ 클럽 · 멤버십 · 합류 시점
│  └─ 함께 읽어 온 기록
│     ├─ 누적 성취 문장
│     ├─ 보조 문장
│     └─ 함께한 모임 · 완독 · 질문 · 서평
└─ 최근 함께 읽은 기록
   ├─ 최근 개인 journey 최대 3건
   └─ 전체 세션 기록 보기 → 아카이브 sessions
```

프로필 영역에는 `계정 설정` 또는 `계정 관리` CTA를 렌더링하지 않는다.

## 7. 개인 독서 표제부

### 7.1 시각 구조

기존 프로필과 성취의 대등한 좌우 card 분할을 한 장의 연속된 paper surface로 바꾼다.

- 상단은 이니셜 아바타와 이름·byline을 한 identity block으로 묶는다.
- 이름과 이름 변경 control은 같은 문맥에 둔다.
- 클럽·멤버십·합류 시점은 action 아래가 아니라 이름 바로 아래 byline으로 제공한다.
- 얇은 horizontal rule 뒤에 누적 독서 성취 문장과 지표가 이어진다.
- 지표는 독립 card가 아닌 정의 목록과 구분선으로 표시한다.
- 큰 그림자, gradient, badge wall, profile utility grid를 만들지 않는다.

이 구조는 프로필과 성취를 별개의 dashboard module이 아니라 한 멤버의 정체성과 독서 이력으로 연결한다.

### 7.2 이름 변경

`프로필 수정` action row는 제거한다. 표시 이름 옆에 `이름 변경`이라는 접근 가능한 이름을 가진 저강조 control을 둔다.

- 데스크톱에서는 이름 오른쪽에 icon 또는 짧은 text action으로 표시한다.
- 모바일에서도 시각 아이콘 크기와 무관하게 기존 44px 조작 영역을 유지한다.
- 이름 변경을 활성화하면 이름 자리에서 기존 `ProfileNameEditor`의 input·저장·취소 흐름으로 전환한다.
- 입력은 현재 표시 이름으로 시작한다.
- 저장 중 중복 제출을 막는다.
- 실패하면 입력과 편집 상태를 유지하고 control 가까이에 `role="alert"`를 표시한다.
- 취소하면 현재 이름으로 복원하고 읽기 상태로 돌아간다.
- `canEditOwnProfile`이 거짓이면 이름 변경 control만 숨긴다.

### 7.3 멤버십 byline

기존 `profileMetaLabel`의 클럽명, 멤버십 표시, 합류 시점을 재사용한다.

- 유효한 합류 월이 없으면 해당 부분만 숨긴다.
- 긴 클럽명과 한영 표시 이름은 줄바꿈한다.
- 멤버십을 여러 badge로 분해하지 않는다.
- 상태를 색상만으로 표현하지 않는다.

### 7.4 누적 독서 성취

현재 `MyJourneySummary` 기반 회고 문장과 지표 규칙을 유지한다.

- `함께한 모임`, `완독`은 0도 표시한다.
- `질문`, `서평`은 양수일 때만 표시한다.
- 최근 journey item이나 아카이브 page 길이로 누적 값을 다시 추정하지 않는다.
- 데스크톱에서는 문장과 지표를 넓은 지면 안에서 균형 있게 배치할 수 있다.
- 모바일에서는 문장 뒤에 2열 지표로 재배치하되 DOM 의미 순서는 유지한다.

## 8. 전역 계정 메뉴

전역 `AccountMenu`가 다음 항목을 일관되게 제공한다.

1. 현재 멤버 identity
2. `내 공간`
3. `계정 설정`
4. `로그아웃`

기존 `계정 관리` 문구는 설정 화면 제목과 맞춘 `계정 설정`으로 통일한다.

- 데스크톱과 모바일 app shell에서 같은 항목과 의미 순서를 사용한다.
- popover의 pointer outside, Escape dismiss, trigger focus return 동작을 유지한다.
- 계정 메뉴 안에 이름 편집이나 클럽 탈퇴를 직접 넣지 않는다.
- `로그아웃`은 전역 계정 메뉴가 계속 소유하며 설정 화면에 중복하지 않는다.

## 9. `/app/me/settings`

### 9.1 상단과 복귀

설정 화면의 첫 content navigation으로 `← 내 공간` link를 제공한다.

- club-scoped route에서는 `/clubs/:clubSlug/app/me`를 가리킨다.
- unscoped compatibility route에서는 `/app/me`를 가리킨다.
- `history.back()`만 사용하지 않는다. 직접 진입·새로고침·외부 deep link에서도 목적지가 안정적이어야 한다.
- 브라우저 Back과 전역 navigation도 기존대로 작동해야 한다.
- 제목은 `계정 관리`에서 `계정 설정`으로 통일한다.

### 9.2 계정 정보

`계정 정보`는 읽기 전용 summary list로 제공한다.

- 이메일
- 표시 이름

표시 이름 옆에 편집 form을 중복하지 않는다. 필요하면 `내 공간에서 이름 변경` link를 제공한다.

### 9.3 클럽 멤버십

`클럽 멤버십`은 다음 값을 읽기 전용 summary list로 제공한다.

- 클럽
- 멤버십 상태
- 합류 시점

각 값과 label은 기존 profile·membership model을 재사용한다.

### 9.4 멤버십 종료

`멤버십 종료`는 계정·멤버십 summary와 분리된 마지막 section이다.

- 초기 action 문구는 `클럽 탈퇴…`로, 추가 단계가 있음을 알린다.
- 초기 action을 page primary 또는 큰 경고 card로 표시하지 않는다.
- 실행 전에 현재 기록 유지·이름 비공개 처리 등 기존 정책 결과를 설명한다.
- 최종 확인 UI는 구체적인 `클럽 탈퇴`와 `취소`를 제공한다.
- 최종 confirm action만 danger treatment를 사용한다.
- 실패하면 설정 화면을 유지하고 원인별 기존 오류 문구 또는 일반 실패 문구를 action 가까이에 표시한다.
- 성공 후 기존 membership 상태 전환과 redirect 계약을 유지한다.

## 10. 최근 기록과 아카이브

### 10.1 CTA

최근 기록 header의 CTA는 다음으로 고정한다.

- 표시 문구: `전체 세션 기록 보기`
- 접근 가능한 이름: `전체 세션 기록 보기`
- 목적지: scoped `/app/archive?view=sessions`

`전체 기록 보기`는 질문·서평·피드백까지 포함하는 아카이브에서 범위가 모호하므로 사용하지 않는다.

### 10.2 최근 기록 행

최근 3건은 계속 `/api/archive/me/journey?limit=3`의 개인 activity preview를 사용한다.

- 행의 목적지는 기존 `/app/sessions/:sessionId`다.
- preview의 제목, 저자, 날짜, 활동 요약, 피드백 상태를 유지한다.
- CTA 목적지가 더 넓은 archive sessions라는 사실 때문에 preview 데이터를 archive session list로 바꾸지 않는다.

### 10.3 `/app/me/records` 호환

이번 범위에서는 `/app/me/records`를 삭제하거나 redirect하지 않는다.

- `/app/me`와 전역 navigation에서 새 진입점을 제공하지 않는다.
- 기존 deep link와 직접 접근은 현재 개인 journey 목록을 계속 제공한다.
- 내부 신규 CTA는 canonical archive sessions URL을 직접 가리킨다.
- route 사용량과 개인 목록의 독립 요구가 확인된 후 별도 deprecation 또는 archive filter 통합을 판단한다.

이 결정은 현재 personal journey와 archive sessions의 포함 조건이 다르기 때문에 필요하다.

## 11. 프런트엔드 경계와 데이터 흐름

### 11.1 API와 loader

기존 endpoint를 유지한다.

- `/api/app/me`: profile·membership
- `/api/archive/me/journey?limit=3`: cumulative summary·recent personal activity
- `/api/archive/sessions`: archive sessions
- `PATCH /api/me/profile`: display name update
- `POST /api/me/membership/leave`: membership leave
- 기존 auth logout endpoint

서버, BFF, schema 또는 migration 변경은 없다.

### 11.2 Route/controller

`MyPageRoute`는 다음을 담당한다.

- profile·journey loader data를 view model로 변환
- 기존 profile update controller 재사용
- auth refresh와 route revalidation
- session detail과 archive sessions의 club-scoped href 생성

`AccountSettingsRoute`는 다음을 담당한다.

- settings data와 club-scoped `내 공간` href 조립
- membership leave request와 실패 상태 전달

전역 `AccountMenuController`는 app base path를 기준으로 `내 공간`과 `계정 설정` href를 제공한다.

### 11.3 Model

기존 pure model이 profile byline, achievement narrative, metrics, recent item metadata를 계산한다.

이번 범위에서 필요한 model 변경은 copy 또는 view model field의 최소 조정으로 제한한다. React, router, fetch 또는 API client를 pure model에 추가하지 않는다.

### 11.4 UI

UI는 props와 callback만 사용한다.

- `MemberProfileSummary`: identity·inline name edit·byline
- `ReadingAchievementSummary`: narrative·metrics
- `MemberSpaceOverview`: 한 장의 연속 surface
- `RecentReadingList`: archive sessions CTA와 preview list
- `AccountSettingsPage`: back link·account summary·membership summary·membership boundary
- `AccountMenu`: 전역 account navigation과 logout

UI에서 API, feature route 또는 auth state를 직접 import하지 않는다.

## 12. 반응형

### 12.1 데스크톱

- 개인 독서 표제부는 최대 폭 안의 한 surface다.
- identity가 먼저 전체 폭을 사용한다.
- horizontal rule 뒤에서 narrative와 metrics를 균형 있게 배치한다.
- 계정 설정 CTA는 표제부 어디에도 표시하지 않는다.
- 전역 계정 메뉴가 항상 동일한 위치에서 설정 진입을 제공한다.

### 12.2 모바일

- identity, byline, narrative, metrics를 단일 열 의미 순서로 쌓는다.
- 이름 변경 control은 44px 이상 조작 영역을 유지한다.
- 긴 이름과 byline이 action을 밀어내거나 가로 overflow를 만들지 않는다.
- 320px CSS viewport와 200% 확대에서 양방향 scroll을 만들지 않는다.
- 설정 화면의 `← 내 공간`은 제목보다 먼저 표시한다.
- 하단 앱 탭과 콘텐츠가 겹치지 않도록 기존 safe-area padding을 유지한다.

## 13. 접근성

- 표시 이름은 `/app/me`의 유일한 `h1`이다.
- 독서 성취와 최근 기록은 각각 `h2`, 기록 제목은 목록 문맥의 `h3`를 사용한다.
- 이름 변경 icon은 `이름 변경`이라는 접근 가능한 이름을 제공한다.
- account menu와 inline editor의 keyboard·focus 동작을 유지한다.
- link와 button의 semantic 차이를 유지한다.
- archive CTA의 표시 문구와 accessible name을 불필요하게 다르게 만들지 않는다.
- focus-visible indicator와 WCAG AA contrast를 유지한다.
- 상태나 파괴성을 색상만으로 전달하지 않는다.
- reduced motion에서 장식적 이동을 제거한다.

## 14. 상태와 오류

### 14.1 profile update

- 저장 중: 중복 제출 차단
- 성공: 표시 이름, 전역 account identity, auth state, route data 갱신
- 실패: 편집 상태·입력 유지, inline alert
- 읽기 전용: 이름 변경 control 숨김

### 14.2 profile metadata

- 잘못된 합류 월: 기간·월만 숨김
- 긴 이름·클럽명: 줄바꿈
- 빈 표시 이름 fallback: 기존 profile model 규칙 유지

### 14.3 settings

- 직접 진입: 안정적인 `내 공간` href 제공
- 데이터 로딩 실패: 기존 route error boundary 사용
- leave 실패: settings context 유지, inline feedback
- leave 성공: 기존 authorization·redirect 계약 유지

### 14.4 archive navigation

- CTA는 항상 `view=sessions`를 명시한다.
- club slug를 보존한다.
- archive loading·error는 기존 archive route boundary가 처리한다.
- `/app/me/records` direct access는 기존 pagination·오류 동작을 유지한다.

## 15. 검증

### 15.1 Focused unit/component

- profile summary에 `계정 관리`·`계정 설정` link가 없고 inline `이름 변경`만 존재
- profile identity DOM 순서가 이름 → 이름 변경 → byline
- name edit success·failure·cancel·read-only
- recent CTA 문구와 scoped `/app/archive?view=sessions` href
- account menu의 `내 공간`, `계정 설정`, logout 순서
- settings의 scoped `← 내 공간` href
- settings에 duplicate profile edit form과 duplicate logout이 없음
- membership leave confirm·cancel·failure
- long Korean/English strings와 missing joined date

### 15.2 Route/E2E

- desktop·mobile `/app/me` visual hierarchy와 keyboard order
- global account menu에서 settings 진입
- settings에서 `← 내 공간` 복귀
- browser Back 동작
- recent CTA에서 archive sessions 선택 상태 도착
- `/app/me/records` direct deep link 유지
- ACTIVE·VIEWER·SUSPENDED·LEFT 등 기존 접근 상태 회귀 여부
- 320px, standard mobile, desktop, 200% zoom에서 overflow·focus 확인

### 15.3 Canonical frontend gates

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Corepack이 PATH에 없으면 repository guide의 명시적 fallback을 사용하고 실행한 정확한 명령을 기록한다.

## 16. 완료 조건

- `/app/me` profile surface에서 계정 설정 CTA가 제거된다.
- 이름·이름 변경·멤버십 byline·독서 성취가 승인된 순서로 읽힌다.
- 전역 account menu가 계정 설정과 logout의 단일 전역 진입점이다.
- settings 화면에 명시적인 `← 내 공간`이 있다.
- 이름 편집과 logout이 settings에 중복되지 않는다.
- membership leave는 독립 section과 최종 확인 단계를 사용한다.
- 최근 기록 CTA가 `전체 세션 기록 보기`로 `/app/archive?view=sessions`를 가리킨다.
- `/app/me/records` deep link는 유지되지만 새 사용자 진입점은 없다.
- server, BFF, database, migration, dependency 변경이 없다.
- 관련 unit, route, E2E, lint, build 검증이 실제로 통과하거나 실행하지 못한 항목과 이유가 보고된다.
- public repository에 실제 멤버 데이터, secret, deployment state, private domain 또는 로컬 절대 경로가 추가되지 않는다.
