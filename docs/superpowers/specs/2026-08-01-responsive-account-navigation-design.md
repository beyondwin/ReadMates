# ReadMates 반응형 계정·내 공간 내비게이션 설계

작성일: 2026-08-01
상태: 사용자 승인 완료, 작성본 검토 대기

## 1. 요약

인증된 앱의 계정 메뉴 trigger는 현재 45px 원형 아바타 하나만 보여 준다. 표시 이름이 `호스트`이면 `호`만 보이므로 사용자 정체성, 호스트 공간 전환, 계정 메뉴 중 무엇을 뜻하는지 화면만 보고 알기 어렵다. 모바일 알림 화면에서는 `내 공간`으로 돌아가는 명시적 경로도 없어, 하단 탭이 `내 공간` 활성 상태임에도 계층 관계가 화면에 드러나지 않는다.

이 설계는 세 책임을 분리한다.

1. `⇄`: 호스트 권한이 있는 사용자의 멤버·호스트 공간 전환
2. `내 공간`과 `알림`: 현재 클럽의 멤버 콘텐츠 탐색
3. `계정`: 작업 공간과 무관한 계정 설정과 로그아웃

모바일과 데스크톱 모두 계정 trigger가 메뉴임을 텍스트와 chevron으로 명시한다. 계정 popover에서는 `내 공간`과 `알림`을 제거하고 identity, `계정 설정`, `로그아웃`만 제공한다. 멤버의 `/app/me`에는 `알림`과 `계정 설정` 직접 링크를 추가하고, 알림·설정 하위 화면에는 `내 공간`으로 돌아가는 고정 상위 링크를 제공한다.

이 문서는 `docs/superpowers/specs/2026-07-30-member-space-account-archive-ux-design.md`의 5.2절 전역 계정 메뉴 소유권, 6절 `/app/me` 정보구조, 8절 전역 계정 메뉴와 관련 반응형 결정을 대체한다. 기존 프로필·독서 성취·최근 기록·아카이브·멤버십 종료 결정은 유지한다.

## 2. 현재 문제

### 2.1 계정 메뉴 발견성

`AccountMenu` trigger는 접근 가능한 이름과 `aria-expanded`, `aria-haspopup`를 제공하지만 화면에는 `AvatarChip`만 렌더링한다. 보조기기 사용자는 의미를 전달받지만 시각 사용자는 원형 이니셜을 메뉴 trigger로 추측해야 한다. `호`는 실제 사용자 표시 이름의 첫 글자일 수 있으나 역할명 또는 호스트 전환 축약처럼도 읽힌다.

### 2.2 이동 책임의 혼합

현재 popover는 다음을 모두 담는다.

- 사용자 identity
- `내 공간`
- `알림`
- `계정 설정`
- `로그아웃`

`내 공간`과 `알림`은 현재 클럽의 멤버 콘텐츠이고, `계정 설정`과 `로그아웃`은 전역 계정 관리다. 서로 다른 책임이 같은 transient overlay에 섞여 있으며, 멤버 하단 탭의 `내 공간`과도 중복된다.

### 2.3 내 공간의 불완전한 계층

모바일 하단 탭은 `/app/me/**`와 `/app/notifications/**`를 모두 `내 공간` 활성 상태로 처리한다. 데스크톱 상단 navigation도 같은 관계를 표현한다. 그러나 `/app/me` 본문에는 알림이나 계정 설정 링크가 없고 알림 표제의 `내 공간`은 이동 가능한 상위 링크가 아니다. 구현의 active 상태와 사용자가 보는 정보구조가 일치하지 않는다.

### 2.4 호스트 공간의 전역 계정 접근

호스트 모바일 하단 탭에는 `내 공간`이 없다. 모바일 계정 popover를 완전히 제거하고 멤버 `내 공간`에만 설정·로그아웃을 두면 호스트가 계정 관리나 로그아웃을 위해 먼저 멤버 공간으로 전환해야 한다. 따라서 전역 계정 진입점은 호스트와 멤버 app chrome에 계속 필요하다.

## 3. 목표

1. 모바일에서 계정 메뉴의 존재와 목적을 별도 설명 없이 알아볼 수 있게 한다.
2. `⇄` 공간 전환과 계정 메뉴를 시각적·의미적으로 분리한다.
3. 계정 popover는 전역 계정 관리만 소유하게 한다.
4. `내 공간`을 알림과 계정 설정으로 이동할 수 있는 완전한 멤버 허브로 만든다.
5. 알림과 계정 설정 화면에서 상위 `내 공간`으로 안정적으로 돌아가게 한다.
6. 호스트 공간에서도 계정 설정과 로그아웃을 전역적으로 접근 가능하게 유지한다.
7. 현재 club scope, auth, API, logout, notification preference 계약을 변경하지 않는다.
8. 320px부터 데스크톱까지 겹침 없이 동작하고 키보드·터치 접근성을 보존한다.

## 4. 비목표

- 모바일 하단 탭의 개수, 순서 또는 host/member tab 구성을 변경
- `⇄` 아이콘, 공간 전환 권한 또는 전환 동작 변경
- 새 알림 badge 데이터 fetch 또는 전역 unread count 추가
- 서버 API, BFF, auth, database, migration 또는 dependency 변경
- 계정 설정, 알림 목록, 수신 설정의 내부 기능 리디자인
- 프로필 이미지 업로드 또는 실제 사용자 이미지 도입
- account drawer, bottom sheet, hamburger menu 또는 다섯 번째 하단 탭 추가
- 로그아웃 확인 dialog 추가 또는 기존 성공·실패 계약 변경
- 공개 사이트, 호스트 운영 화면 또는 플랫폼 관리자 화면의 전면 리디자인

## 5. 조사와 접근 비교

### 5.1 일반 모바일 패턴

YouTube, Pinterest, Medium처럼 하단의 프로필·개인 탭을 개인 허브로 사용하는 서비스는 설정을 해당 허브 안에 둔다. Android navigation bar도 3~5개의 동등한 최상위 목적지에 적합하므로 ReadMates의 기존 멤버 하단 4탭은 유지하는 것이 맞다.

WAI-ARIA menu button pattern은 trigger가 메뉴를 연다는 시각적 단서와 펼침 상태를 제공하도록 안내한다. 원형 이니셜만 있는 trigger보다 명시적 label과 chevron이 발견 가능성과 상태 이해에 유리하다.

### 5.2 검토한 접근

#### 채택: 명시적 전역 계정 trigger + 완전한 내 공간 허브

- 모바일: `계정 ▾`
- 데스크톱: 실제 표시 이름 기반 avatar + 표시 이름 + `▾`
- popover: identity + 계정 설정 + 로그아웃
- 내 공간 본문: 알림 + 계정 설정
- 하위 화면: `‹ 내 공간`

일반 모바일 허브 패턴을 따르면서도 host tab에 `내 공간`이 없는 ReadMates의 전역 계정 접근 요구를 보존한다. 계정 설정은 전역 shortcut과 멤버 허브 양쪽에서 같은 이름으로 제공하며, 이는 서로 다른 문맥에서 같은 목적지로 가는 의도적 중복이다.

#### 제외: 모바일 계정 popover 완전 제거

멤버 공간만 보면 가장 단순하지만 호스트 공간에서 설정·로그아웃의 직접 진입점이 사라진다. 호스트에게 멤버 공간 전환을 선행시키므로 전역 계정 관리 요구에 맞지 않는다.

#### 제외: 기존 avatar에 작은 chevron만 추가

수정 범위는 작지만 `호`가 계정 identity인지 역할인지 구분하기 어렵고, 콘텐츠 이동과 계정 관리가 한 popover에 섞이는 문제도 남는다.

#### 제외: 계정을 다섯 번째 하단 탭 또는 hamburger로 추가

기존 4개 최상위 목적지의 밀도와 host/member 변형을 깨고, 저빈도 계정 관리 때문에 주 navigation을 확장한다. hamburger는 계정 기능 두 개를 담기에는 과도하고 발견성 문제를 다른 아이콘으로 옮길 뿐이다.

## 6. 최종 정보구조

```text
인증 앱 chrome
├─ workspace 전환 ⇄                    호스트 권한이 있을 때만
├─ workspace별 primary navigation       기존 top/bottom navigation
└─ 계정 trigger
   └─ account popover
      ├─ 표시 이름 + 멤버십 상태
      ├─ 계정 설정
      └─ 로그아웃

멤버 내 공간 /app/me
├─ 프로필·독서 성취 overview
├─ 내 공간 관리
│  ├─ 알림 → /app/notifications
│  └─ 계정 설정 → /app/me/settings
└─ 최근 함께 읽은 기록

알림 /app/notifications
├─ 상위 링크: 내 공간 → /app/me
├─ 받은 알림
└─ 수신 설정 → /app/notifications/settings
```

모든 경로는 `appBasePath`를 사용해 `/clubs/:clubSlug/app/**` scope를 유지한다. unscoped compatibility route에서는 기존 `/app/**` 경로를 유지한다.

## 7. 반응형 동작

### 7.1 모바일 header

멤버와 호스트 mobile header의 우측 rail은 다음 순서를 사용한다.

1. 권한이 있는 경우 기존 `⇄` workspace 전환 button
2. `계정 ▾` account menu button

규칙:

- 계정 trigger의 visible label은 `계정`으로 고정한다. 역할명이나 표시 이름을 축약한 `호`를 trigger label로 쓰지 않는다.
- 닫힘은 `▾`, 열림은 `▴`로 표시하며 `aria-expanded`와 같은 상태를 전달한다.
- 각 button은 최소 44×44px 조작 영역과 visible focus를 가진다.
- 320px viewport에서 `back target + 짧은 제목 + ⇄ + 계정`이 겹치지 않아야 한다.
- 중앙 제목은 남은 폭 안에서 single-line ellipsis를 허용한다. action button label은 잘리지 않는다.
- host 권한이 없는 멤버에게는 `⇄`를 위한 빈 공간을 예약하지 않는다.

### 7.2 데스크톱 header

데스크톱 trigger는 다음을 한 button 안에 표시한다.

- 실제 사용자 표시 이름 기반 avatar 또는 이니셜
- 표시 이름
- chevron

역할명 `호스트`를 avatar identity로 대신하지 않는다. 긴 한국어·영어 이름은 header 폭을 침범하지 않도록 최대 폭과 ellipsis를 적용하며 접근 가능한 이름에는 전체 표시 이름을 유지한다.

### 7.3 popover

popover는 데스크톱과 모바일에서 같은 내용과 순서를 사용한다.

1. 표시 이름
2. 멤버십 상태
3. `계정 설정`
4. `로그아웃`

기존 labelled nonmodal dialog semantics, 자연스러운 Tab 순서, 바깥 pointer dismiss, `Escape` dismiss, trigger focus return을 유지한다. `menu`/`menuitem` semantics로 바꾸지 않는다. viewport 가장자리에서 잘리지 않도록 현재 trigger에 정렬하고 작은 화면에서는 좌우 safe gap을 유지한다.

## 8. 내 공간과 하위 화면

### 8.1 내 공간 관리 section

`/app/me`의 프로필·성취 overview 다음, 최근 기록 전에 `내 공간 관리` compact list를 추가한다.

1. `알림` — 보조 문구 `받은 알림과 수신 설정`
2. `계정 설정` — 현재 계정 설정 route의 목적을 설명하는 짧은 보조 문구

각 row는 link이고 최소 48px 높이와 44px 이상의 유효 hit target을 가진다. 같은 크기의 독립 card를 반복하지 않고 하나의 quiet list surface와 divider로 묶는다. unread badge는 현재 shell에 count가 이미 존재하지 않으므로 이번 범위에 추가하지 않는다.

프로필·독서 성취와 최근 기록의 내용·순서·API는 유지한다. `계정 설정`의 의도적 중복 때문에 profile identity block 안에 별도 설정 button을 다시 추가하지 않는다.

### 8.2 알림 화면

`/app/notifications`와 `/app/notifications/settings`는 화면 content 또는 mobile header에 `‹ 내 공간` 고정 상위 링크를 제공한다.

- scoped: `/clubs/:clubSlug/app/me`
- unscoped: `/app/me`
- `history.back()`을 사용하지 않는다.
- 직접 진입, 새로고침, 외부 deep link에서도 같은 목적지로 이동한다.
- `받은 알림`과 `수신 설정` URL tab은 기존 순서와 semantics를 유지한다.
- mobile bottom navigation과 desktop top navigation은 계속 `내 공간`을 active로 표시한다.

### 8.3 계정 설정 화면

계정·멤버십·탈퇴 구성과 `내 공간` 복귀 목적지는 유지하되 viewport별 소유자를 다음으로 고정한다.

- 모바일: `MobileHeader`가 `‹ 내 공간`을 렌더링하고 본문의 기존 back link는 표시하지 않는다.
- 데스크톱: mobile header가 없으므로 본문 첫 navigation인 `← 내 공간`을 유지한다.

두 경우 모두 동일한 club-scoped href를 사용하며 한 viewport에 같은 back link를 두 번 표시하지 않는다.

### 8.4 데스크톱 breadcrumb

알림 화면 표제는 `내 공간 / 알림` breadcrumb를 제공한다.

- `내 공간`만 link다.
- `알림`은 현재 위치 text다.
- page title `알림`과 내부 notification tabs는 유지한다.
- breadcrumb는 account popover 안의 콘텐츠 navigation을 대체한다.

## 9. 프런트엔드 경계

### 9.1 app layout와 shared chrome

- `AppRouteLayout`은 기존 auth와 club scope에서 `AccountMenuController`를 조합한다.
- `MobileHeader`와 `TopNav`는 account API나 auth feature를 import하지 않고 전달받은 `accountControl`을 렌더링한다.
- `MobileHeader`의 route-aware back target에는 notification과 account settings의 club-scoped `내 공간` target을 추가한다.
- workspace 전환 action과 account control은 독립 prop과 독립 button으로 유지한다.

### 9.2 account feature

- `AccountMenuController`는 settings href만 account menu에 전달한다.
- `AccountMenu`는 display variant 또는 responsive CSS를 통해 mobile/desktop trigger presentation을 제공하되 popover state와 dismiss logic은 한 구현으로 유지한다.
- `mySpaceHref`와 `notificationsHref`는 popover 책임에서 제거한다.
- `LogoutButton`과 기존 logout success/failure 흐름은 유지한다.

### 9.3 member space feature

- `MyPageRoute`가 현재 `appBasePath`에서 notifications/settings href를 조립해 prop으로 전달한다.
- `MyReadingShelf`는 새 presentation-only utility navigation을 overview와 recent list 사이에 렌더링한다.
- 새 UI는 router, API, auth state를 직접 import하지 않는다.

### 9.4 notification feature

- mobile app header는 route와 `appBasePath`에서 club-scoped `내 공간` href를 조립한다.
- desktop notification UI는 동일한 href를 breadcrumb prop으로 받고, mobile에서는 해당 breadcrumb를 표시하지 않는다.
- notification UI는 기존 inbox/preferences data flow, query, mutation과 무관하게 breadcrumb prop만 받는다.
- 서버, BFF, query key 또는 notification preference mutation을 변경하지 않는다.

## 10. 상태와 오류

| 표면 | 상태 | 동작 |
| --- | --- | --- |
| 계정 trigger | 닫힘/열림 | visible chevron과 `aria-expanded`가 같은 상태를 표현 |
| account popover | 바깥 클릭/Escape | 닫고 trigger로 focus 복귀 |
| 로그아웃 | 진행 중 | 기존 중복 실행 방지와 진행 상태 유지 |
| 로그아웃 | 실패 | 현재 route 유지, popover 안 기존 오류와 재시도 유지 |
| 내 공간 관리 link | route 이동 | 현재 club scope를 보존하고 대상 route loader가 오류를 소유 |
| 알림 하위 화면 | 직접 진입 | `내 공간` 고정 상위 link가 항상 유효 |
| 긴 제목·이름 | 320px/한국어/영어 | action을 밀어내지 않고 지정된 text 영역 안에서 ellipsis 또는 wrapping |

새로운 network loading, optimistic update 또는 error state는 추가하지 않는다.

## 11. 접근성

- account trigger는 native `button`을 유지한다.
- trigger의 접근 가능한 이름은 viewport와 무관하게 기존 `{전체 표시 이름} 계정 메뉴`를 유지하고, mobile visible label만 `계정`으로 표현한다.
- `aria-expanded`, `aria-haspopup="dialog"`, `aria-controls`와 labelled nonmodal dialog 관계를 유지한다.
- `Escape`, 바깥 클릭, 자연스러운 Tab 이동과 focus return을 단위 테스트한다.
- `계정 설정`, `로그아웃`, `알림`, `내 공간`은 일관된 visible label을 사용한다.
- list row와 header action은 WCAG 2.2 minimum target보다 큰 44px 기준을 사용한다.
- current navigation과 current notification tab은 `aria-current` 또는 기존 동등 semantics를 유지한다.
- 색상이나 avatar 이니셜만으로 역할·상태·동작을 전달하지 않는다.

## 12. 예상 변경 표면

구현 계획에서 현재 ownership을 다시 확인해 최소 범위로 확정한다.

- `front/features/auth/ui/account-menu.tsx`
- `front/features/auth/ui/account-menu.test.tsx`
- `front/features/auth/route/account-menu-controller.tsx`
- `front/features/auth/route/account-menu-controller.test.tsx`
- `front/shared/ui/mobile-header.tsx`
- `front/shared/ui/top-nav.tsx`
- `front/src/app/layouts/app-route-layout.tsx`
- `front/features/archive/route/my-page-route.tsx`
- `front/features/archive/ui/my-page.tsx`
- `front/features/archive/ui/my-page/my-reading-shelf.tsx`
- 새 `front/features/archive/ui/my-page/member-space-utility-nav.tsx`
- `front/features/notifications/ui/member-notifications-page.tsx`
- notification settings 관련 UI/test
- `front/shared/styles/mobile.css`
- `front/src/styles/globals.css`
- 관련 responsive navigation unit/E2E tests

## 13. 테스트와 승인 기준

### 13.1 focused component/route evidence

1. mobile trigger가 visible `계정` label과 chevron, 44px target을 제공한다.
2. desktop trigger가 실제 표시 이름, avatar/initial, chevron을 제공하고 긴 이름에서 overflow하지 않는다.
3. popover에는 identity, 계정 설정, 로그아웃만 있고 내 공간과 알림은 없다.
4. popover의 Escape, outside click, focus return, logout success/failure 동작이 유지된다.
5. 내 공간 utility navigation의 notifications/settings href가 scoped와 unscoped route에서 정확하다.
6. notification inbox/settings와 account settings의 `내 공간` 상위 href가 정확하다.
7. `/app/notifications/**`에서 mobile bottom tab과 desktop top nav의 `내 공간` active state가 유지된다.

### 13.2 responsive browser evidence

다음 조합을 실제 브라우저로 확인한다.

- 320px, 390px mobile
- 1280px 이상 desktop
- 멤버와 호스트 workspace
- `⇄` 있음/없음
- account popover 닫힘/열림
- `/app/me`, `/app/notifications`, `/app/notifications/settings`, `/app/me/settings`
- 긴 한국어와 영어 표시 이름 및 page title
- keyboard focus, Escape, viewport clipping, horizontal overflow

핵심 flow:

1. 내 공간 → 알림 → 내 공간
2. 내 공간 → 계정 설정 → 내 공간
3. 계정 trigger → 계정 설정
4. 호스트 workspace → 계정 trigger → 로그아웃
5. 호스트 workspace → `⇄` → 멤버 workspace

### 13.3 repository checks

구현 완료 시 영향 범위에 맞춰 다음을 실행한다.

```bash
corepack pnpm --dir front exec vitest run <focused-test-files>
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

현재 환경에서 Corepack launcher가 다르면 저장소 `packageManager`의 `pnpm@11.13.1`을 사용하는 정확한 fallback 명령을 기록한다.

## 14. 비상황과 잔여 위험

- unread count는 이번 범위에 포함하지 않는다. count를 추가하려면 app shell data ownership과 알림 읽음 후 동기화를 별도 설계해야 한다.
- 계정 설정은 account popover와 내 공간에 의도적으로 중복된다. 두 label과 href가 drift하지 않도록 controller/route 테스트가 필요하다.
- 320px에서 back label, title, `⇄`, `계정`이 동시에 보일 때 폭이 가장 빠듯하다. 구현 전에 실제 CSS grid 폭을 측정하고 browser evidence로 닫는다.
- mobile과 desktop trigger presentation을 별도 DOM으로 중복 구현하면 focus/state가 갈라질 수 있다. 하나의 controller와 popover state를 유지하고 presentation만 반응형으로 나눈다.
- 이 설계는 repository 구조와 승인된 mockup을 근거로 하며, 실제 사용자 분석 데이터나 usability test 결과를 주장하지 않는다.

## 15. 참고 근거

- [WAI-ARIA APG — Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
- [Android Developers — Navigation bar](https://developer.android.com/develop/ui/compose/components/navigation-bar)
- [Apple Human Interface Guidelines — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [NN/g — Recognition Rather Than Recall](https://media.nngroup.com/media/articles/attachments/Heuristic_6_A4_compressed.pdf)
- [GOV.UK Design System — Back link](https://design-system.service.gov.uk/components/back-link/)
