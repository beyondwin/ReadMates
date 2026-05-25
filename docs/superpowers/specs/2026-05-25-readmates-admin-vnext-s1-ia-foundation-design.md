# ReadMates Admin vNext — S1 IA Foundation Design

작성일: 2026-05-25
상태: APPROVED DESIGN SPEC
Umbrella: `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md` 의 S1 슬라이스

## 배경

ReadMates의 `/admin`은 현재 단일 라우트에 onboarding wizard / club registry / domain provisioning / support access grant / AI Ops 다섯 영역을 세로로 적층한 약 1,300줄 페이지다. 호스트(`/host/*`) 5라우트와 비교했을 때 가장 큰 격차는 화면 수가 아니라 (a) 정보 구조의 분할 부재와 (b) 슬라이스를 잇는 공통 운영 셸의 부재다.

본 spec은 umbrella 로드맵의 S1 슬라이스를 본 설계로 발전시킨다. S1은 `/admin` 라우트 패밀리, 좌측 nav, 글로벌 status strip, 권한 가드 통합, 어드민 dev-login seed, onboarding wizard 모달화, "준비 중" empty state 표준을 한 번에 닫는다. 신규 서버 endpoint는 없으며, 흡수되는 spec은 5/16 onboarding, 5/17 triage, 5/20 productization IA 부분이다.

## 흡수 대상

- `2026-05-16-readmates-platform-admin-onboarding-design.md` — onboarding wizard를 URL state 모달로 흡수.
- `2026-05-17-readmates-platform-admin-triage-console-design.md` — triage console을 `/admin/today` 본 화면으로 흡수.
- `2026-05-20-readmates-platform-admin-productization-design.md` — IA 부분(탭 → 라우트 패밀리, 상단 status strip, today queue에 AI-item 합류) 흡수. AI Ops/Support 깊이 부분은 S6/S4가 가져감.

## 목표

- `/admin` 단일 페이지를 lazy-split 9 라우트 패밀리로 분해, 좌측 nav · 상단 status strip · breadcrumb를 공통 셸로 둔다.
- 4 페르소나(게스트 / 멤버 / 호스트 / 플랫폼 어드민)의 가드 동작을 명시적 unit test로 박는다.
- 권한 매트릭스(OWNER / OPERATOR / SUPPORT × capability)를 클라이언트 모델 SSOT로 정리.
- 어드민 dev-login 계정 3종을 seed에 추가, 로컬에서 SQL 손대지 않고 `/admin` 검증 가능하게 한다.
- 후속 슬라이스(S2~S10)가 자기 라우트를 채울 자리를 `coming_soon` 상태로 미리 열어두고, 카탈로그 SSOT 한 곳만 토글하면 자기 슬라이스를 ready로 만들 수 있게 한다.
- 기존 작동 기능을 잃지 않고, AI Ops `AI_DISABLED` 503 에러 카피만 운영 상태로 정정한다.

## 비목표

- 신규 서버 endpoint, contract 변경, DB 스키마 마이그레이션 없음 (dev seed SQL 추가는 제외).
- 권한 모델 재설계 없음. OPERATOR 폐지하지 않음.
- AI Ops 깊이(filter / cursor / cost trend / kill-switch banner) 없음 — S6.
- Support 검색 워크벤치, raw UUID 입력 제거 없음 — S4. S1에서는 발행 동선만 `/admin/clubs/:id`로 이동.
- 도메인을 독립 운영 라우트로 분리하지 않음 — `/admin/clubs/:clubId` 안에 흡수 (umbrella 명시).
- 분석/감사 라우트는 empty state만, 실데이터 없음.
- 모바일 드로어 애니메이션·제스처 정교화 없음. collapse 토글만.
- 어드민 화면에서 데이터 삭제·익명화 액션 없음.
- 어드민에 클럽-슬러그 변형(`/clubs/:clubSlug/admin`) 라우트는 만들지 않음. 어드민은 플랫폼 스코프.

## 권한 모델 결정

서버는 V21 migration에 `platform_admins.role check (OWNER, OPERATOR, SUPPORT)`로 3-role을 유지한다. umbrella 본문이 "OWNER / SUPPORT"를 약식 표기한 것은 본 spec에서 3-role 유지로 정정한다. 권한 모델 재설계는 S1 범위가 아니다.

4 페르소나는 다음 의미로 사용한다:

| 페르소나 | 의미 | `/admin/*` 진입 |
|---|---|---|
| 게스트 | 미인증 | 로그인으로 redirect |
| 멤버 | 인증, admin 아님, 호스트 아님 | BlockedPlatformAdmin |
| 호스트 | 인증, 호스트 권한 보유, admin 아님 | BlockedPlatformAdmin (호스트 권한과 admin은 독립) |
| 어드민 | 인증 + `platform_admins.status = ACTIVE` (role: OWNER / OPERATOR / SUPPORT) | shell 렌더 → `/admin/today` |

## 정보 구조

### 라우트 패밀리

```text
/admin                       index → <Navigate to="today" replace />
/admin/today        [S1]     READY    triage console + AI-item 합류
/admin/clubs        [S1]     READY    클럽 registry list
/admin/clubs/:clubId[S1]     READY    클럽 상세 (publish · domain · grant · first host)
/admin/ai-ops       [S1]     READY    AI Ops (이동만, 깊이는 S6)
/admin/support      [S1]     READY    light shell (발행은 clubs/:id, 통합은 S4)
/admin/health       [S2]     COMING   <AdminComingSoon descriptor=S2>
/admin/notifications[S5]     COMING   <AdminComingSoon descriptor=S5>
/admin/audit        [S7]     COMING   <AdminComingSoon descriptor=S7>
/admin/analytics    [S8]     COMING   <AdminComingSoon descriptor=S8>
```

### 좌측 nav 3 그룹

`/admin/clubs/:clubId`는 nav 항목에서 제외, breadcrumb로만 표시.

```text
오늘/헬스
  · 오늘
  · 헬스 [준비 중 · S2]

운영
  · 클럽
  · 지원
  · 알림 [준비 중 · S5]
  · AI Ops

감사/분석
  · 감사 [준비 중 · S7]
  · 분석 [준비 중 · S8]
```

### 상단 status strip — 4 카드

신규 서버 endpoint 없음. shell loader가 cache seed한 두 기존 query — `platformAdminSummaryQuery`(role · domain action count) + `platformAdminClubsQuery`(클럽 목록) — 를 클라이언트 derivation으로 합성한다. umbrella의 "strip이 `/api/admin/summary`만 의존" 문구는 "서버 변경 없음, 신규 endpoint 추가 없음" 의도로 해석한다.

| 카드 | 데이터 | 클릭 동작 |
|---|---|---|
| 플랫폼 역할 | `summary.platformRole` | 없음 |
| 조치 필요 클럽 | `clubs.items` 중 `status === "SETUP_REQUIRED"` count (client model derive) | `/admin/today?filter=setup_required` |
| 공개 준비 | `clubs.items` 중 `publicVisibility === "PRIVATE"` + publish readiness 통과 count (client model derive) | `/admin/today?filter=ready_to_publish` |
| 도메인 조치 | `summary.domainActionRequiredCount` | `/admin/today?filter=domain_action` |

AI/health 카드는 각 슬라이스(S6/S2)가 자기 카드를 strip에 contribute하는 acceptance gate를 가짐. strip은 sticky. 두 query 모두 `staleTime: 30s`. fetch error 시 단일 카드 fallback("상태를 확인할 수 없습니다 · 재시도").

### Breadcrumb

`AdminShellLayout` header 안에 인라인. catalog의 `groupLabel · label`을 자동 조립.

- `/admin/today` → "오늘 할 일"
- `/admin/clubs` → "운영 · 클럽"
- `/admin/clubs/:clubId` → "운영 · 클럽 · {club name}" (detail loader가 React context로 push)
- `/admin/health` → "오늘/헬스 · 헬스 · 준비 중"

## 아키텍처

### 디렉터리 / 모듈

```text
front/features/platform-admin/
├── api/                                  # 변경 없음
├── model/
│   ├── platform-admin-workbench-model.ts  # AI-item 합류 확장
│   ├── platform-admin-permissions.ts      # NEW · capability matrix SSOT
│   └── ...
├── queries/                              # 변경 없음
├── route/
│   ├── admin-route-catalog.ts             # NEW · 9 라우트 SSOT
│   ├── admin-shell-layout.tsx             # NEW · leftnav + strip + Outlet
│   ├── admin-shell-data.ts                # NEW · layout loader (summary seed)
│   ├── admin-today-route.tsx / -data.ts
│   ├── admin-clubs-route.tsx / -data.ts
│   ├── admin-club-detail-route.tsx / -data.ts
│   ├── admin-ai-ops-route.tsx / -data.ts
│   ├── admin-support-route.tsx / -data.ts
│   └── admin-coming-soon-route.tsx
└── ui/
    ├── admin-layout-nav.tsx               # NEW · 3 그룹 nav
    ├── admin-status-strip.tsx             # NEW · 4 카드 strip
    ├── admin-breadcrumb.tsx               # NEW
    ├── admin-coming-soon.tsx              # NEW · empty state 본문
    ├── admin-onboarding-modal.tsx         # NEW · URL state 모달 셸
    ├── platform-admin-onboarding-wizard.tsx  # 기존, 모달 안에서 렌더
    └── (기존 ai-ops / support-grants / club-registry / club-detail / club-operations-brief / club-publish-checklist / domain-provisioning-panel 유지)
```

**삭제:**
- `front/features/platform-admin/route/platform-admin-route.tsx`
- `front/features/platform-admin/route/platform-admin-data.ts`
- `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- `front/features/platform-admin/ui/platform-admin-overview-metrics.tsx` (status strip이 대체)
- `front/src/app/routes/auth.tsx`의 `/admin` 블록

### 라우트 등록 — `front/src/app/routes/admin.tsx`

`router.tsx`의 `buildRoutes`에 `adminRoutes(queryClient)` 추가.

```ts
export function adminRoutes(queryClient: QueryClient): RouteObject[] {
  return [{
    id: "app-admin",
    path: "/admin",
    errorElement: <RouteErrorBoundary variant="auth" />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="auth" />,
    loader: adminShellLoaderFactory(queryClient),
    lazy: async () => {
      const { AdminShellLayout } = await import("@/features/platform-admin/route/admin-shell-layout");
      return {
        Component: () => (
          <RequirePlatformAdmin>
            <AdminShellLayout />
          </RequirePlatformAdmin>
        ),
      };
    },
    children: adminChildRoutes(queryClient),
  }];
}
```

`adminChildRoutes`는 `ADMIN_ROUTES` 카탈로그를 순회하여 `status === "ready"`이면 자기 lazy chunk, `coming_soon`이면 `comingSoonChild(descriptor)` 공용 chunk를 반환. 등록 코드와 catalog가 분리 SSOT가 되지 않도록 catalog를 직접 import해 순회한다.

### Lazy chunk 정책

| Chunk | 포함 |
|---|---|
| `admin-shell` | AdminShellLayout · leftnav · status strip · breadcrumb · catalog · onboarding modal |
| `admin-today` | today route + workbench model |
| `admin-clubs` | clubs registry route |
| `admin-club-detail` | club detail route + ClubOperationsBrief(detail mode) + ClubPublishChecklist + DomainProvisioningPanel + SupportAccessGrantsPanel |
| `admin-ai-ops` | ai-ops route + PlatformAdminAiOps |
| `admin-support` | support light shell route |
| `admin-coming-soon` | 4 COMING-SOON 라우트 공유 chunk |

shell + today는 진입 시 함께 로드. 나머지 6 chunk는 라우트 진입 시 동적 로드.

### `/admin` 진입 시퀀스

1. router가 `/admin` 매치 → shell loader = `requirePlatformAdminLoaderAuth` 변형(`adminShellLoaderFactory`)이 인증 + admin 검증 + `platformAdminSummaryQuery` cache seed.
2. 미인증 → 로그인 redirect.
3. admin 권한 없음 → `<BlockedPlatformAdmin />`.
4. shell layout 렌더 → index `<Navigate to="today" replace />` → today chunk 로드.

옛 `/admin` 단일 페이지 URL을 가진 북마크는 step 4의 Navigate에 의해 자동으로 `/admin/today`로 정착한다.

## 권한 매트릭스 — `model/platform-admin-permissions.ts`

```ts
export type AdminCapability =
  | "view_today" | "view_clubs" | "view_club_detail"
  | "view_ai_ops" | "view_support" | "view_health"
  | "view_notifications" | "view_audit" | "view_analytics"
  | "create_club"
  | "edit_club_metadata"
  | "toggle_club_visibility"
  | "create_support_grant" | "revoke_support_grant"
  | "force_cancel_ai_job"
  | "check_domain_provisioning";

export const ADMIN_CAPABILITY_MATRIX: Record<PlatformAdminRole, ReadonlySet<AdminCapability>> = {
  OWNER:    new Set([/* 모든 view_* + 모든 mutate */]),
  OPERATOR: new Set([/* 모든 view_* + create_club + edit_club_metadata + toggle_club_visibility + force_cancel_ai_job + check_domain_provisioning */]),
  SUPPORT:  new Set([/* 모든 view_* */]),
};

export function canDo(role: PlatformAdminRole, capability: AdminCapability): boolean;
```

기존 `platform-admin-workbench-model.ts`의 `canCreateClub` / `canCreateSupportGrant` / AI Ops의 `canAct` 등은 모두 `canDo(...)`로 정리한다. 서버 `@PreAuthorize` / service-level 검증은 변경하지 않으며 서버가 단일 진실. 매트릭스는 affordance(버튼/링크 노출)용.

### 라우트별 추가 가드

`admin-route-catalog`의 `requiredCapability`로 표현. `AdminShellLayout`의 leftnav는 catalog를 순회하며 `canDo` 거짓 항목을 숨긴다. 라우트 컴포넌트는 진입 시 같은 capability를 다시 확인(직접 URL 입력 방지).

S1 시점에서 모든 `view_*` capability는 3-role 모두에게 허용 — admin 진입권만 있으면 라우트는 볼 수 있다. 라우트별 read 제한은 후속 슬라이스가 자기 acceptance gate에서 매트릭스를 좁힘.

## Dev-login admin seed

### `R__readmates_dev_seed.sql` 추가 블록 (Postgres 변형 · MySQL 변형 동일 구조)

```sql
with admin_seed(id_suffix, google_subject_id, email, name, role) as (values
  (901, 'readmates-dev-google-admin-owner',    'admin-owner@example.com',    '오너관리자',  'OWNER'),
  (902, 'readmates-dev-google-admin-operator', 'admin-operator@example.com', '운영관리자',  'OPERATOR'),
  (903, 'readmates-dev-google-admin-support',  'admin-support@example.com',  '지원관리자',  'SUPPORT')
)
insert into users (id, google_subject_id, email, name, profile_image_url)
  select uuid_from_suffix(id_suffix), google_subject_id, email, name, null
  from admin_seed
  on conflict (email) do update set name = excluded.name;

insert into platform_admins (id, user_id, role, status, created_at)
  select uuid_from_suffix(id_suffix + 100), users.id, admin_seed.role, 'ACTIVE', now()
  from admin_seed
  join users on users.email = admin_seed.email
  on conflict (user_id) do update set role = excluded.role, status = 'ACTIVE';
```

`uuid_from_suffix`는 dev seed의 기존 헬퍼 규약과 정합. MySQL 변형(`db/mysql/dev/R__readmates_dev_seed.sql`)도 같은 블록을 dialect에 맞게 추가한다. dev seed 파일들은 dev profile 한정 — prod에 새어나가지 않는다.

### `JdbcMemberAccountAdapter.devSeedEmails` 확장

```kotlin
private val devSeedEmails = setOf(
    "host@example.com", "member1@example.com", "member2@example.com",
    "member3@example.com", "member4@example.com", "member5@example.com",
    "admin-owner@example.com", "admin-operator@example.com", "admin-support@example.com",
)
```

`DevLoginController` / `DevLoginMemberService`는 변경 없음. admin 계정은 의도적으로 admin-only 페르소나로 두며 클럽 멤버십을 부여하지 않는다. cross-role 시나리오(admin + host 등)는 S4(support workbench) / S7(audit)이 의미를 갖는 시점에 따로 다룬다.

## AdminShellLayout

### 페이지 골격

```text
┌─────────────────────────────────────────────────────────────┐
│ Top header                                                  │
│  · "ReadMates Admin" wordmark                               │
│  · breadcrumb                                                │
│  · 우측: [새 클럽 ▾]  [role badge: OWNER]  [→ 멤버 공간]      │
├─────────────────────────────────────────────────────────────┤
│ Status strip (sticky, 4 cards)                               │
├──────────────┬──────────────────────────────────────────────┤
│ Leftnav      │                                              │
│  오늘/헬스   │                                              │
│  운영        │              <Outlet />                       │
│  감사/분석   │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

데스크탑 ≥ 1024px만 좌측 nav가 분리. < 1024px에서는 nav가 collapse → header의 drawer 토글로 열림. 모바일에서는 status strip이 horizontal scroll row.

### Leftnav — `ui/admin-layout-nav.tsx`

- catalog를 group(`today` / `ops` / `review`) 별로 묶어 렌더. 그룹 헤더 sticky.
- 각 항목은 `<Link>` + label + status pill (`coming_soon` → `"준비 중 · S2"`).
- 활성 라우트는 `aria-current="page"` + 좌측 indent bar.
- `canDo(role, requiredCapability)` 거짓 항목은 렌더 자체 생략.

### Status strip — `ui/admin-status-strip.tsx`

`useQuery(platformAdminSummaryQuery())` + `useQuery(platformAdminClubsQuery())` (둘 다 shell loader가 cache seed). client-side에서 4 카드 카운트 derive(공통 helper `deriveStripMetrics(summary, clubs)`를 model 레이어에 추가). 클릭 → today filter URL. count ≥ 1 카드는 강조 색. 두 query 중 하나라도 error 시 단일 fallback 카드로 collapse.

### Header 우측 affordance

- `[새 클럽 ▾]`: `canDo("create_club")` 참인 경우만. 클릭 → `?onboarding=1` 추가.
- `[role badge]`: 단순 텍스트 pill (`OWNER` / `OPERATOR` / `SUPPORT`).
- `[→ 멤버 공간]`: `/app` 으로의 링크.

### CSS

새 `admin-shell` namespace를 admin css 파일에 정의. 호스트의 `app-shell`과 동등한 ledger 톤. 기존 `platform-admin-page` 클래스는 단일 페이지 삭제와 함께 제거.

## Onboarding wizard 모달화

기존 `PlatformAdminOnboardingWizard` 컴포넌트는 그대로 유지하고 진입/표시 방식만 바꾼다.

### 진입

- header `[새 클럽 ▾]` → URL `searchParams`에 `onboarding=1` 추가.
- query param 존재 + `canDo("create_club")` 참이면 `AdminShellLayout`이 `<AdminOnboardingModal />`을 portal 렌더.
- 권한 거짓이면 query param 즉시 제거(SUPPORT가 URL 직접 입력해도 무시).

### 모달 셸 — `ui/admin-onboarding-modal.tsx`

- `<dialog>` element + `aria-labelledby`. 데스크탑 768px 고정 폭, 모바일 full-screen sheet.
- 포커스 트랩, 첫 입력 자동 focus, Tab 내부 순환.
- 닫힘 채널 3종(ESC / 백드롭 / X 버튼) 모두 `requestClose()` 함수 거침.
- `requestClose()`:
  - dirty 거짓 → 즉시 닫힘.
  - dirty 참 → `window.confirm` → 확인 시 닫힘.
- `beforeunload`는 모달이 dirty인 동안만 등록.

### Dirty state

wizard가 `onDirtyChange(dirty: boolean)` callback으로 부모(모달 셸)에 보고:
- step 1 입력 필드 중 하나라도 비어있지 않은 값으로 변경 → dirty.
- step 2 이상 진입 시 항상 dirty.

### 완료 동작

`onCommit` 성공 → 모달 닫힘 + `navigate("/admin/clubs/<newClubId>")`. 옛 detail context는 unmount되어 자연스레 교체.

`onCommit` 실패 → 모달은 열린 채 wizard 내부 에러 표시. dirty 유지.

### 모달과 라우트

모달은 어떤 라우트에서도 같은 동작. 닫힘 시 원래 라우트 그대로 유지. 라우트 컴포넌트는 모달 존재를 모름.

## Empty state · `admin-route-catalog`

### 카탈로그 스키마

```ts
export type AdminRouteGroup = "today" | "ops" | "review";
export type AdminRouteStatus = "ready" | "coming_soon";

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup;
  groupLabel: string;
  slice: "S1"|"S2"|"S3"|"S4"|"S5"|"S6"|"S7"|"S8"|"S9"|"S10";
  status: AdminRouteStatus;
  requiredCapability: AdminCapability;
  comingSoon?: {
    title: string;
    summary: string;
    bullets: ReadonlyArray<string>;
    docHref: string;
  };
};

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [...];
export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {...};  // nav 제외
```

### `AdminComingSoonRoute` — 공용 라우트 컴포넌트

```ts
export function adminComingSoonLoader(descriptor: AdminRouteDescriptor) {
  return async () => descriptor;
}

export function AdminComingSoonRoute() {
  const descriptor = useLoaderData() as AdminRouteDescriptor;
  return <AdminComingSoon descriptor={descriptor} />;
}
```

`admin.tsx`의 등록 코드:

```ts
function comingSoonChild(descriptor: AdminRouteDescriptor): RouteObject {
  return {
    path: descriptor.path,
    lazy: async () => {
      const { AdminComingSoonRoute, adminComingSoonLoader }
        = await import("@/features/platform-admin/route/admin-coming-soon-route");
      return { Component: AdminComingSoonRoute, loader: adminComingSoonLoader(descriptor) };
    },
  };
}
```

### 본문 UI

```text
┌─────────────────────────────────────────────┐
│  [eyebrow] 준비 중 · S2                      │
│  [h1]      Platform Ops Health              │
│                                              │
│  [body] DB, Redis, Kafka, AI provider,       │
│         outbox, deploy 신호를 한 화면에서    │
│         봅니다.                              │
│                                              │
│  들어올 기능                                  │
│  · 서비스·큐·AI 가용성 카드 (4-state)         │
│  · Outbox backlog · 알림 발송 성공률          │
│  · 최근 deploy attempt 5건 ledger             │
│  · 각 카드의 last-checked + drill 링크        │
│                                              │
│  [link] 로드맵에서 S2 자세히 보기 →           │
└─────────────────────────────────────────────┘
```

ledger 톤, 회색 텍스트, 강조 색 없음. surface 카드 1개. 메인 컨텐츠 영역만 차지 — strip · leftnav는 그대로.

### 후속 슬라이스가 자기 라우트를 ready로 만들 때 (3 단계)

1. `admin-route-catalog`에서 해당 descriptor의 `status: "coming_soon"` → `"ready"`, `comingSoon` 블록 제거.
2. `admin.tsx` children에서 `comingSoonChild(...)`를 자기 lazy ready chunk로 교체.
3. (필요 시) 자기 chunk가 status strip에 카드를 contribute하면 strip 카드 슬롯 추가. strip 카드 정의는 S1에서 정적 4 카드 배열로 두지만, 향후 슬라이스가 자기 카드를 추가할 때를 위한 hook 정의는 S2 spec이 가져간다.

## READY 라우트 마이그레이션

### `/admin/today` — Triage console + AI-item 합류

- loader: `platformAdminSummaryQuery` + `platformAdminClubsQuery` + `platformAdminAiOpsSummaryQuery` + `platformAdminAiOpsJobsQuery` 4 query 병렬 cache seed.
- model: `buildPlatformAdminWorkbench`를 확장하여 club-item과 AI-item을 같은 queue list에 typed view model로 합류.
  - AI-item severity: stale → warn, failed → critical, disabled → 정보(회색).
- selected state: URL `?selected=club-{id}` 또는 `?selected=ai-{jobId}`.
- status strip 카드 클릭에서 오는 `?filter=setup_required|ready_to_publish|domain_action`은 today queue model이 사전 필터링. filter chip UI 추가 없음(5/17 비목표 유지). filter 활성 시 "필터: 조치 필요 · 해제" 한 줄 표시.
- 기존 `PlatformAdminWorkQueue` / `ClubOperationsBrief`(brief 모드) 재사용. brief 모드는 요약 + drill 링크만; detail 모드는 `/admin/clubs/:id`에서.

### `/admin/clubs` — 클럽 registry list

- `platformAdminClubsQuery` 단일.
- 기존 `PlatformAdminClubRegistry`를 단독 라우트로 lift. 컬럼: slug · name · status · visibility · domain health · first host state.
- row click → `/admin/clubs/:clubId`. 정렬/필터는 S3로 미룸.
- Header CTA `[새 클럽 ▾]`은 글로벌 header가 owner이므로 clubs 라우트가 자기 CTA를 갖지 않는다.

### `/admin/clubs/:clubId` — 클럽 상세

- loader: 단일 club은 `platformAdminClubsQuery`에서 derive(별도 endpoint 없음), `platformAdminSupportGrantsQuery(clubId)` prefetch.
- 섹션(위에서 아래):
  1. Club header (slug, name, status, visibility badge, "Open host app" 링크 — grant 또는 호스트 본인일 때만)
  2. Publish readiness checklist (`ClubPublishChecklist`)
  3. Public metadata edit (name/tagline/about · `canDo("edit_club_metadata")` 분기)
  4. Visibility action rail (checklist + capability 둘 다 충족 시만 active)
  5. Domain provisioning panel (`DomainProvisioningPanel`)
  6. First host onboarding state
  7. Support access grants (`SupportAccessGrantsPanel` — raw UUID 입력은 S4에서 검색으로 교체, S1은 위치만 이동)
- `AdminBreadcrumbContext`에 club name push.
- `clubId`로 클럽 못 찾으면 `errorElement`가 "해당 클럽을 찾을 수 없습니다 · 클럽 목록으로 →" 카드.

### `/admin/ai-ops` — AI Ops 단독 라우트

- `platformAdminAiOpsSummaryQuery` + `platformAdminAiOpsJobsQuery`.
- 기존 `PlatformAdminAiOps`를 lift. filter/cursor/drilldown 추가는 S6.
- **S1 정정점**: AI Ops summary query가 503 + body `AI_DISABLED`이면 route 본문이 "AI generation이 일시 비활성 상태입니다 · 운영 정상" 상태 카드로 분기. 일반 에러 카피 금지. (5/20 spec 명시.)

### `/admin/support` — Light shell

- 본문은 안내 카드: "support access grant 발행/철회는 `/admin/clubs/:id`의 지원 패널에서 수행. 통합 워크벤치(이메일/이름/UUID 검색, grant ledger)는 S4에서 제공."
- 현재 grant API가 cross-club readonly list를 지원하면 최근 N건 readonly ledger도 함께. 미지원이면 안내 카드만. implementation plan 단계에서 API 확인 후 결정.
- `canDo("view_support")`만 통과하면 진입 가능. 발행/철회 action은 본문에 없음.

## 테스트

### Unit (Vitest)

| 대상 | 항목 |
|---|---|
| `model/platform-admin-permissions.ts` | 17 capability × 3 role 전수 |
| `model/platform-admin-workbench-model.ts` | AI-item 합류 — stale / failed / disabled severity 매핑 |
| `route/admin-route-catalog.ts` | 카탈로그 invariant — path 중복 없음, group label 일관, `coming_soon`은 `comingSoon` 블록 필수, docHref가 가리키는 문서/anchor 존재 |
| `ui/admin-status-strip.tsx` | 4 카드 렌더, count 색 분기, error fallback |
| `ui/admin-layout-nav.tsx` | 3 그룹 렌더, 활성 라우트 표시, capability 거짓 항목 숨김, status pill |
| `ui/admin-onboarding-modal.tsx` | 포커스 트랩, 3 닫힘 채널, dirty confirm, `beforeunload` 등록 |
| `ui/admin-coming-soon.tsx` | descriptor → 본문 매핑 (S2 / S5 / S7 / S8 4 케이스) |

### Route (loader)

| 대상 | 항목 |
|---|---|
| `adminShellLoaderFactory` | 4 페르소나(게스트 / 멤버 / 호스트 / admin) × 가드 동작 — redirect, BlockedPlatformAdmin, shell 통과 |
| `adminComingSoonLoader` | catalog descriptor 정합 — 4 COMING-SOON 라우트 |

### E2E (Playwright)

| 시나리오 | 검증 |
|---|---|
| Admin happy path | dev-login(`admin-owner@example.com`) → `/admin` → today 로드 → leftnav "클럽" → list → row click → detail → wizard 모달 열기/닫기(dirty confirm) |
| Admin guard rejection | dev-login(`host@example.com`) → `/admin` 접근 → BlockedPlatformAdmin 노출 |
| Coming-soon route | admin-owner → `/admin/health` → empty state 렌더 (slice 라벨 · 들어올 기능 bullets · docHref) |

## Acceptance gate

- [ ] `/admin`이 옛 단일 페이지로 redirect되지 않고 `/admin/today`가 default.
- [ ] 4 페르소나(게스트 / 멤버 / 호스트 / admin) 라우트 가드 unit test 통과.
- [ ] 어드민 dev-login 계정 3종(`admin-owner` / `admin-operator` / `admin-support@example.com`) seed 포함.
- [ ] 옛 `PlatformAdminRoute` / `PlatformAdminDashboard` / `platform-admin-data.ts` / `platform-admin-overview-metrics.tsx` 삭제. 단일 페이지 잔재 없음.
- [ ] 5 READY 라우트(today / clubs / clubs/:id / ai-ops / support)에서 기존 기능 회귀 없음 — onboarding preview/commit, club edit, domain check, grant 발행/철회, AI force-cancel 모두 동작.
- [ ] 4 COMING-SOON 라우트(health / notifications / audit / analytics) 모두 진입 가능 + `AdminComingSoon` 렌더.
- [ ] AI Ops `AI_DISABLED` 503은 운영 상태 카드로 분기, 일반 에러 카피 금지.
- [ ] CHANGELOG `Unreleased`에 한 줄: `platform-admin: split /admin into role-gated route family with shared status strip`.
- [ ] `./scripts/pre-push-check.sh` standard green.
- [ ] `./scripts/public-release-check.sh` clean — dev seed의 이메일/이름이 sanitized example 도메인.
- [ ] README "역할별 기능" 표에 `/admin/*` 라우트 패밀리 1줄 반영.
- [ ] `docs/showcase/architecture-evidence.md` 또는 `engineering-confidence.md`에 sanitized 증거 1줄.
- [ ] 신규 admin 라우트는 controller test 신규 없음 (서버 변경 0). ArchUnit baseline 변동 없음.

## 위험

| 위험 | 완화 |
|---|---|
| 5 READY 라우트로 분해 시 기존 query 캐시 timing이 어긋나 깜빡임 | shell loader가 summary + clubs를 cache seed. 각 READY 라우트는 자기 추가 query만 fetch. `staleTime: 30s` 통일 |
| onboarding 모달이 `/admin/clubs/:id`에서 완료 시 detail context 충돌 | commit 성공 → `navigate("/admin/clubs/<newId>")` + `?onboarding` 제거. 옛 detail context는 React가 unmount하므로 자연스레 교체 |
| catalog가 SSOT인데 라우트 등록이 별개라 drift 가능 | `admin.tsx`의 등록 코드가 catalog를 직접 import해 순회. drift 불가 |
| dev seed admin 계정이 prod 빌드로 새어나감 | dev seed는 `db/dev/` profile 한정 (기존 패턴 일관). `public-release-check.sh`가 검출 |
| `comingSoon.docHref` anchor가 깨질 수 있음 | catalog test에서 docHref가 가리키는 파일 + `#anchor` 헤더 정규식 정적 체크 |
| AI-item을 today에 합류 → SUPPORT가 AI 신호를 보지만 action 불가 — 혼란 가능 | severity 표시는 전 role에 공통, "강제 취소" 액션 affordance만 `canDo("force_cancel_ai_job")` 분기. 5/20 일관 |
| 모바일 < 1024px에서 leftnav drawer가 거칠어 운영자가 불편 | collapse 토글 + tap-outside 닫힘 표준 동작만 S1에서 보장. 정교한 제스처는 비목표 |
| support light shell이 "비어 보인다"는 인상 | empty state 톤이 아니라 "안내 카드"로 명시 — 발행 동선 링크 + S4 예고. 5분 리뷰 페르소나에 자연스러움 |

## Documentation 동기화

- `README.md` 역할별 기능 표에 `/admin/*` 라우트 패밀리 (today / clubs / clubs/:id / ai-ops / support) 1줄 반영.
- `docs/showcase/architecture-evidence.md` 또는 `engineering-confidence.md`에 라우트 패밀리 split + 권한 매트릭스 SSOT 도입 1줄 증거.
- 본 spec의 path가 잡힌 후 umbrella 로드맵 문서에 S1 spec 링크 1줄 추가.

## 다음 단계

1. 본 spec 사용자 review.
2. 승인 시 writing-plans skill 진입 → `docs/superpowers/plans/` 아래 implementation plan 작성.
3. Plan에는 chunk별 마이그레이션 순서, 삭제 → 재배치 → 신규 컴포넌트 → 테스트의 single-stream sequence가 들어가야 한다 (병렬 commit이 회귀 risk가 크므로).
