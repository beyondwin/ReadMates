# ReadMates Responsive Navigation Design

작성일: 2026-04-19
상태: USER-APPROVED DESIGN SPEC
문서 목적: ReadMates의 원본 디자인 기준에 맞춰 데스크톱 상단 탑바, 모바일 상단 헤더, 로그인 후 모바일 하단 탭을 전체 페이지에 일관되게 복구하기 위한 설계를 정의한다.

## 1. 목표

현재 제품 코드는 public route에는 데스크톱 `TopNav`와 모바일 `PublicMobileHeader`가 붙어 있지만, 로그인 후 `/app` 영역에는 visible navigation chrome이 없다. 원본 디자인은 데스크톱에서 역할별 top nav를, 모바일에서 모든 화면의 sticky header와 member/host 전용 bottom tab bar를 사용한다.

이번 변경의 목표는 아래와 같다.

- 데스크톱에서는 public, member, host 페이지 모두 상단 탑바를 가진다.
- 모바일에서는 public/guest 페이지가 상단 모바일 헤더만 가진다.
- 모바일에서는 로그인 후 member/host app 페이지가 상단 모바일 헤더와 하단 탭바를 가진다.
- 페이지 본문 디자인은 변경하지 않고, navigation chrome만 route layout 계층에서 일관되게 적용한다.
- 실제 동작이 없는 검색, 알림, 더보기 버튼은 추가하지 않는다.
- public navigation의 authenticated action 동작이 있으면 보존한다. 즉 public의 로그인 액션은 인증 상태가 확인되면 `내 공간`으로 바뀔 수 있다.

## 2. 현재 상태 분석

원본 디자인 소스:

- `design/src/nav.jsx`: guest, member, host 역할별 desktop top nav의 기준이다.
- `design/src/mobile/shell.jsx`: 모바일 `Header`와 `TabBar`의 기준이다.
- `design/읽는사이 모바일.html`: 모바일 shell 조립 방식의 기준이다. 모든 모바일 화면은 `Header`를 먼저 렌더링하고, `role !== guest`일 때만 `TabBar`를 렌더링한다.
- `design/styles/mobile.css`: `m-hdr`, `m-tabbar`, `m-body` 등 모바일 chrome 스타일의 기준이다.

현재 Next.js 구현:

- `front/app/(public)/layout.tsx`는 데스크톱에서 `TopNav`, 모바일에서 `PublicMobileHeader`, 데스크톱에서 `PublicFooter`를 렌더링한다.
- `front/shared/ui/top-nav.tsx`는 현재 public guest navigation 중심이다.
- `front/shared/ui/public-mobile-header.tsx`는 public route의 모바일 title과 action만 담당한다.
- `front/app/layout.tsx`의 `AppShell`은 `ReadMates` 제목을 screen-reader only로만 렌더링하고 visible header를 만들지 않는다.
- `/app` route group에는 app 전용 layout이 없어 member/host 페이지가 탑바, 모바일 헤더, 하단 탭바 없이 바로 본문을 렌더링한다.
- 모바일 CSS는 이미 이관되어 있으므로 새 구조는 주로 React component와 route layout 연결 작업이다.

## 3. 범위

포함 route:

- Public: `/`, `/about`, `/sessions/[sessionId]`, `/login`, `/invite/[token]`
- Member app: `/app`, `/app/session/current`, `/app/notes`, `/app/archive`, `/app/me`
- Host app: `/app/host`, `/app/host/sessions/new`, `/app/host/sessions/[sessionId]/edit`

제외 범위:

- page 본문 레이아웃의 재디자인
- public 모바일 하단 탭 추가
- native mobile app
- no-op notification, search, more action 추가
- auth, invitation, session API 동작 변경
- floating role switcher, tweaks panel, demo-only FAB 이관

## 4. 선택한 접근

선택안: route chrome layout 신설.

`/app` route group에 app 전용 layout을 추가하고, public layout은 기존 구조를 유지하되 shared mobile header를 재사용하는 방향으로 정리한다. Navigation chrome은 개별 page component가 아니라 route layout에서 렌더링한다.

이 접근을 선택한 이유:

- 원본 디자인이 역할별 shell을 먼저 렌더링하고 page를 끼워 넣는 구조와 맞다.
- 전체 페이지에 같은 chrome 규칙을 적용할 수 있다.
- active state, role 조건, mobile/desktop 분기가 page마다 중복되지 않는다.
- 이후 app 내부 페이지가 늘어나도 layout과 navigation model만 확장하면 된다.

버린 접근:

- 페이지별 삽입은 중복이 많고 active state가 흩어진다.
- root `AppShell` 전역 처리는 public/app 역할과 서버 인증 판별이 섞여 유지보수성이 낮다.

## 5. 컴포넌트 구조

### 5.1 `TopNav`

파일: `front/shared/ui/top-nav.tsx`

역할:

- desktop sticky top navigation을 렌더링한다.
- guest, member, host variant를 지원한다.
- brand link는 guest면 `/`, app user면 `/app` 또는 host variant에서 `/app/host`로 보낸다.
- public authenticated action이 있는 경우 guest variant의 login action은 `로그인` 또는 `내 공간`이 될 수 있다.

권장 props:

```ts
type TopNavVariant = "guest" | "member" | "host";

type TopNavProps = {
  variant?: TopNavVariant;
  memberName?: string;
};
```

`variant` 기본값은 기존 public 호출과 호환되도록 `"guest"`로 둔다.

### 5.2 `MobileHeader`

파일: `front/shared/ui/mobile-header.tsx`

역할:

- 원본 모바일 `Header`에 해당한다.
- public과 app 양쪽에서 재사용한다.
- `usePathname()` 기반으로 title, back link, right action을 결정한다.
- 실제 동작이 있는 action만 렌더링한다.

권장 props:

```ts
type MobileHeaderVariant = "guest" | "member" | "host";

type MobileHeaderProps = {
  variant: MobileHeaderVariant;
};
```

### 5.3 `MobileTabBar`

파일: `front/shared/ui/mobile-tab-bar.tsx`

역할:

- 원본 모바일 `TabBar`에 해당한다.
- member/host app route에서만 렌더링한다.
- `button`이 아니라 `Link`로 구현해 실제 Next route와 연결한다.
- active state는 pathname 규칙으로 `aria-current="page"`를 부여한다.

권장 props:

```ts
type MobileTabBarVariant = "member" | "host";

type MobileTabBarProps = {
  variant: MobileTabBarVariant;
};
```

### 5.4 Public layout

파일: `front/app/(public)/layout.tsx`

구조:

- desktop: `<TopNav variant="guest" />`
- mobile: `<MobileHeader variant="guest" />`
- children
- desktop: `<PublicFooter />`

`PublicMobileHeader`는 import 호환성을 위해 thin wrapper로 남긴다. 내부 구현은 `<MobileHeader variant="guest" />`만 반환해야 하며, title/action 계산의 소스 오브 트루스는 `MobileHeader`가 된다.

### 5.5 App layout

파일: `front/app/(app)/app/layout.tsx`

구조:

- 서버에서 `fetchBff<AuthMeResponse>("/api/auth/me")`로 role을 판별한다.
- role이 `HOST`면 host variant, 그 외 authenticated member는 member variant로 본다.
- desktop: `<TopNav variant={variant} memberName={auth.displayName} />`
- mobile: `<MobileHeader variant={variant} />`
- children
- mobile: `<MobileTabBar variant={variant} />`

`/app` page들이 이미 필요한 데이터를 fetch하는 구조는 유지한다. Layout의 auth fetch는 chrome variant 결정을 위한 최소 fetch로 제한한다.

## 6. Navigation 모델

### 6.1 Guest desktop tabs

| Label | Href | Active condition |
| --- | --- | --- |
| 소개 | `/` | pathname is `/` |
| 클럽 | `/about` | pathname is `/about` |
| 공개 기록 | `/` | pathname starts with `/sessions/` |
| 로그인 또는 내 공간 | `/login` or `/app` | active only when action href is `/login` and pathname is `/login` |

`공개 기록`은 현재 최신 public session id를 top nav가 알 수 없으므로 기존 정책대로 `/`에 연결한다. Home page의 실제 공개 세션 카드에서 구체 session으로 이동한다.

### 6.2 Member desktop tabs

| Label | Href | Active condition |
| --- | --- | --- |
| 홈 | `/app` | pathname is `/app` |
| 이번 세션 | `/app/session/current` | pathname starts with `/app/session` |
| 클럽 노트 | `/app/notes` | pathname is `/app/notes` |
| 아카이브 | `/app/archive` | pathname starts with `/app/archive` |
| 마이 | `/app/me` | pathname starts with `/app/me` |

### 6.3 Host desktop tabs

Host는 member workspace를 쓰는 사용자이므로 member tabs에 `호스트`를 추가한다.

| Label | Href | Active condition |
| --- | --- | --- |
| 홈 | `/app` | pathname is `/app` |
| 이번 세션 | `/app/session/current` | pathname starts with `/app/session` |
| 클럽 노트 | `/app/notes` | pathname is `/app/notes` |
| 아카이브 | `/app/archive` | pathname starts with `/app/archive` |
| 마이 | `/app/me` | pathname starts with `/app/me` |
| 호스트 | `/app/host` | pathname starts with `/app/host` |

### 6.4 Member mobile bottom tabs

| Label | Href | Active condition |
| --- | --- | --- |
| 홈 | `/app` | pathname is `/app` |
| 세션 | `/app/session/current` | pathname starts with `/app/session` |
| 아카이브 | `/app/archive` | pathname starts with `/app/archive` |
| 마이 | `/app/me` | pathname starts with `/app/me` |

`/app/notes`는 원본 모바일 tab bar에 없는 보조 화면이다. 모바일에서는 하단 탭 active를 주지 않고, header title을 `클럽 노트`로 표시한다.

### 6.5 Host mobile bottom tabs

| Label | Href | Active condition |
| --- | --- | --- |
| 호스트 | `/app/host` | pathname starts with `/app/host` |
| 세션 | `/app/session/current` | pathname starts with `/app/session` |
| 아카이브 | `/app/archive` | pathname starts with `/app/archive` |
| 마이 | `/app/me` | pathname starts with `/app/me` |

Host user가 직접 `/app`에 있을 때는 하단 탭 active를 주지 않는다. Host mobile의 primary home은 `/app/host`다.

## 7. Mobile header 규칙

### 7.1 Public

| Route | Title | Left/back | Right action |
| --- | --- | --- | --- |
| `/` | 읽는사이 | 없음 | 로그인 또는 내 공간 |
| `/about` | 클럽 소개 | 없음 | 로그인 또는 내 공간 |
| `/sessions/[sessionId]` | 공개 기록 | 없음 | 로그인 또는 내 공간 |
| `/login` | 로그인 | `/` | 없음 |
| `/invite/[token]` | 로그인 | `/` | 없음 |

### 7.2 Member app

| Route | Title | Left/back | Right action |
| --- | --- | --- | --- |
| `/app` | 읽는사이 | 없음 | 없음 |
| `/app/session/current` | 이번 세션 | 없음 | 없음 |
| `/app/notes` | 클럽 노트 | `/app` | 없음 |
| `/app/archive` | 아카이브 | 없음 | 없음 |
| `/app/me` | 마이 | 없음 | 없음 |

### 7.3 Host app

| Route | Title | Left/back | Right action |
| --- | --- | --- | --- |
| `/app/host` | 호스트 | 없음 | 없음 |
| `/app/host/sessions/new` | 새 세션 | `/app/host` | 없음 |
| `/app/host/sessions/[sessionId]/edit` | 세션 편집 | `/app/host` | 없음 |

## 8. Layout and CSS

- Existing `m-hdr`, `m-tabbar`, `m-body` CSS remains the visual source.
- Desktop `TopNav` keeps `position: sticky`, `height: 62px`, translucent background, bottom border, and active underline.
- App mobile pages do not need to wrap every page body in `m-body` immediately. The app layout should wrap `children` in an app content container and apply a mobile-only bottom padding guard so fixed `m-tabbar` does not cover the end of content.
- Public home and login already contain mobile-specific content sections. They continue to render their own `m-body` structures.
- `.desktop-only` and `.mobile-only` remain the breakpoint controls. Current breakpoint is `768px`.
- Cards, page headers, and page section spacing are not changed by this navigation work.

## 9. Data flow and error behavior

App layout auth fetch:

- Calls `fetchBff<AuthMeResponse>("/api/auth/me")`.
- Uses `auth.role === "HOST"` to choose host navigation.
- Uses member navigation for all other authenticated roles.
- If auth fetch fails, the existing app request lifecycle should surface the same app error behavior as other app pages. This navigation work does not introduce a silent guest fallback for `/app`.

Public auth action:

- Public navigation may probe `/api/bff/api/auth/me` on the client.
- If authenticated, public login action can become `내 공간` and link to `/app`.
- If probe fails or returns unauthenticated, public action remains the configured fallback.

## 10. Accessibility

- Desktop navigation uses `<nav aria-label="Public navigation">` for guest and `<nav aria-label="App navigation">` for member/host.
- Active links use `aria-current="page"`.
- Mobile tab bar uses `<nav className="m-tabbar" aria-label="App tabs">`.
- Icon-only controls are avoided unless they have real behavior and accessible names.
- Back links in mobile header use text labels or `aria-label` when visually icon-only.
- Link hit targets should preserve the existing mobile dimensions from `m-hdr-link`, `m-hdr-btn`, and `m-tab`.

## 11. Testing plan

Unit tests:

- Public layout renders guest desktop nav labels and mobile header.
- Public authenticated action behavior remains covered if the auth probe hook exists.
- App layout renders member desktop nav and mobile tab bar for member auth.
- App layout renders host desktop nav and host-first mobile tab bar for host auth.
- `TopNav` active states cover `/`, `/about`, `/sessions/x`, `/login`, `/app`, `/app/session/current`, `/app/notes`, `/app/archive`, `/app/me`, `/app/host`.
- `MobileHeader` title and back link rules cover public, member, and host routes.
- `MobileTabBar` link hrefs and active `aria-current` rules cover member and host variants.

Manual or browser smoke checks:

- Desktop `/` shows public top nav.
- Desktop `/app` shows member or host app top nav.
- Desktop `/app/host` shows host nav with `호스트` active.
- Mobile `/` shows header and does not show bottom tab bar.
- Mobile `/app` shows header and bottom tab bar.
- Mobile `/app/host/sessions/new` shows title `새 세션`, back link to `/app/host`, and bottom tab bar with `호스트` active.
- Mobile page bottom content is not covered by the fixed tab bar.

## 12. Acceptance criteria

- All listed public and app pages have the expected chrome on desktop and mobile.
- Public mobile never shows the app bottom tab bar.
- Member and host mobile app pages always show the app bottom tab bar.
- Host users see a direct host navigation entry on desktop and `호스트` as the first mobile tab.
- Existing page tests continue to pass after route layout tests are added or updated.
- No unrelated page body redesign is included in this work.
- Existing uncommitted user changes are not reverted or overwritten.

## 13. Implementation sequencing for the next plan

The implementation plan should proceed in this order:

1. Add focused tests for navigation models, headers, tab bars, and route layouts.
2. Extract shared navigation definitions and active state helpers.
3. Extend `TopNav` to support guest, member, and host variants while preserving guest behavior.
4. Add `MobileHeader` and `MobileTabBar`.
5. Replace public mobile header usage with the shared mobile header or a thin wrapper around it.
6. Add `/app` route group layout and wire role-based desktop/mobile chrome.
7. Add mobile bottom padding guard for app content.
8. Run unit tests, lint, and browser smoke checks at desktop and mobile viewport sizes.
