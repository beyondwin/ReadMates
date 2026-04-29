# ReadMates Multi-Club Domain Platform Design

## 목적

ReadMates를 단일 독서모임 앱에서 여러 클럽을 운영할 수 있는 멀티 클럽 플랫폼으로 확장한다. 공개 사이트는 클럽별 URL을 갖고, 로그인한 사용자는 가입한 클럽이 하나면 바로 해당 클럽 앱으로 들어가며, 여러 클럽에 가입한 경우 클럽을 선택하거나 전환할 수 있어야 한다.

현재 배포 기준 주소는 `https://readmates.pages.dev`다. 이 주소는 Cloudflare Pages 기본 도메인이므로 클럽별 동적 서브도메인 운영의 주 도메인으로 쓰지 않는다. 무료 플랜에서 가장 안정적인 목표는 소유 도메인을 Cloudflare Pages custom domain으로 연결하고, 자주 쓰는 클럽 서브도메인을 등록형 alias로 추가하는 방식이다. 내부 canonical route는 `/clubs/:slug`를 유지해 preview, fallback, 로컬 개발, 향후 wildcard Worker front door 확장에 같은 앱 구조를 재사용한다.

## 목표 UX

사용자에게 보이는 기본 경험은 클럽별 주소다.

```text
https://<club-slug>.<primary-domain>/
https://<club-slug>.<primary-domain>/app
```

동일한 클럽은 path fallback으로도 접근 가능하다.

```text
https://<primary-domain>/clubs/<club-slug>
https://<primary-domain>/clubs/<club-slug>/app
```

현재 `https://readmates.pages.dev`는 배포 확인, preview, fallback, 포트폴리오 데모 주소로 유지한다. 운영 소유 도메인을 붙인 뒤에도 `pages.dev`는 클럽별 동적 서브도메인 주소로 쓰지 않는다.

`/app`은 편의 진입점이다.

- 로그인하지 않은 사용자는 로그인 화면으로 이동한다.
- 가입 가능한 클럽 membership이 없으면 클럽 초대 또는 승인 대기 안내를 보여준다.
- 가입 클럽이 하나면 해당 클럽 앱으로 자동 이동한다.
- 가입 클럽이 여러 개면 최근 선택 클럽이 유효한 경우 바로 이동하고, 아니면 클럽 선택 화면을 보여준다.
- 사용자는 앱 shell의 클럽 스위처에서 언제든 다른 가입 클럽으로 이동할 수 있다.

## 무료 플랜 도메인 전략

1차 목표는 Cloudflare Pages custom domain을 이용한 등록형 subdomain alias다.

```text
<primary-domain>                         -> Pages project
<club-a>.<primary-domain>                -> Pages custom domain alias
<club-b>.<primary-domain>                -> Pages custom domain alias
```

Cloudflare Pages는 wildcard custom domain을 직접 지원하지 않는 제약이 있으므로, 초기에는 모든 클럽 서브도메인을 동적으로 받지 않는다. Platform Admin이 클럽을 만들 때 기본 slug를 예약하고, 필요한 클럽만 custom domain alias로 등록한다. 클럽 수가 많아져 등록형 alias 운영이 부담되면 다음 단계에서 Worker front door를 추가한다.

확장 단계의 Worker 구조는 다음과 같다.

```text
*.<primary-domain>
  -> Cloudflare Worker front door
  -> Host header로 club domain resolve
  -> Pages app 또는 Spring BFF 경로로 전달
```

이 확장에서도 앱과 API의 내부 모델은 `clubSlug`와 `clubId`를 유지한다. Worker는 외부 hostname을 내부 club context로 해석하는 진입 계층일 뿐이다.

## 라우팅 모델

Canonical route는 `/clubs/:clubSlug/**`다.

```text
/clubs/:clubSlug
/clubs/:clubSlug/about
/clubs/:clubSlug/records
/clubs/:clubSlug/sessions/:sessionId

/clubs/:clubSlug/app
/clubs/:clubSlug/app/session/current
/clubs/:clubSlug/app/notes
/clubs/:clubSlug/app/archive
/clubs/:clubSlug/app/sessions/:sessionId
/clubs/:clubSlug/app/feedback/:sessionId
/clubs/:clubSlug/app/me
/clubs/:clubSlug/app/notifications

/clubs/:clubSlug/app/host
/clubs/:clubSlug/app/host/notifications
/clubs/:clubSlug/app/host/members
/clubs/:clubSlug/app/host/invitations
/clubs/:clubSlug/app/host/sessions/new
/clubs/:clubSlug/app/host/sessions/:sessionId/edit
```

Subdomain alias는 같은 route tree로 들어온다. 예를 들어 `<club-a>.<primary-domain>/app/archive`는 내부적으로 `/clubs/<club-a>/app/archive`와 같은 club context를 가진다. 브라우저 주소를 강제로 path route로 바꾸지는 않는다. 앱 loader와 BFF가 request host에서 club context를 얻을 수 있으면 subdomain URL을 유지한다.

기존 단일 클럽 route는 호환 진입점으로 남긴다.

```text
/         -> 대표 클럽 공개 홈 또는 클럽 목록
/about    -> 대표 클럽 about redirect
/records  -> 대표 클럽 records redirect
/sessions/:sessionId -> 대표 클럽 public session redirect 또는 not found
/app      -> smart app entry
/login    -> global login entry
```

## Club Context Resolution

모든 요청은 가능한 경우 club context를 먼저 결정한다.

우선순위:

1. 신뢰할 수 있는 forwarded host 또는 request host가 `club_domains.hostname`과 일치한다.
2. URL path에 `/clubs/:clubSlug`가 있다.
3. 로그인 사용자의 최근 선택 클럽이 있고 endpoint가 global app entry다.
4. 대표 클럽 fallback이 명시적으로 허용된 public compatibility route다.

서버는 host header를 무조건 신뢰하지 않는다. Cloudflare Pages Functions 또는 Worker가 정규화한 값을 `X-Readmates-Club-Host` 또는 `X-Readmates-Club-Slug` 같은 내부 header로 전달하고, Spring은 BFF secret이 통과한 요청에서만 이 header를 신뢰한다. 직접 Spring API로 들어온 browser-facing 요청은 기존 BFF 경계와 allowed origin 검증을 통과해야 한다.

Club context가 필요한 endpoint에서 클럽을 찾지 못하면 public route는 404를 반환하고, member/host route는 클럽 선택 또는 접근 불가 상태로 보낸다.

## 인증과 현재 클럽

현재 구현은 `email -> CurrentMember 하나`에 가까운 구조다. 멀티 클럽에서는 이를 `session user + club context -> CurrentMember`로 바꾼다.

흐름:

1. session cookie로 전역 `userId`를 확인한다.
2. request host 또는 path slug로 `clubId`를 확인한다.
3. `userId + clubId`로 membership을 조회한다.
4. membership이 있으면 해당 클럽의 `CurrentMember`를 만든다.
5. membership이 없으면 인증된 사용자이지만 현재 클럽 멤버는 아닌 상태로 처리한다.

API 성격별 처리:

- Public API: club context만 있으면 접근 가능하다.
- Member API: 해당 클럽 membership이 필요하다.
- Host API: 해당 클럽 `ACTIVE + HOST` membership이 필요하다.
- Admin API: platform admin 권한이 필요하고 club membership은 필요하지 않다.

로그인 세션은 ReadMates 계정 단위로 공유한다. `<club-a>.<primary-domain>`에서 로그인한 사용자가 `<club-b>.<primary-domain>`에 가면 같은 session cookie로 인증된다. 권한은 각 클럽의 membership으로 다시 판단한다.

소유 도메인 subdomain 사이 공유 cookie는 다음 posture를 사용한다.

```text
Domain=.<primary-domain>
HttpOnly
Secure
SameSite=Lax
```

`readmates.pages.dev`에서는 이 cookie domain을 사용할 수 없으므로, pages.dev preview와 운영 소유 도메인의 cookie 정책은 환경별로 나뉜다.

## Platform Admin

멀티 클럽 플랫폼에는 클럽 호스트와 별개의 전역 운영자가 필요하다. `HOST`는 특정 클럽 안의 role이고, Platform Admin은 ReadMates 전체 운영 권한이다.

권한 모델:

```text
users
  전역 계정

platform_admins
  user_id
  role: OWNER | OPERATOR | SUPPORT
  status: ACTIVE | DISABLED

memberships
  user_id + club_id
  role: HOST | MEMBER
  status: VIEWER | ACTIVE | SUSPENDED | LEFT | INACTIVE | INVITED
```

Platform Admin surface:

```text
/admin
/admin/clubs
/admin/clubs/new
/admin/clubs/:clubId
/admin/clubs/:clubId/hosts
/admin/clubs/:clubId/domains
/admin/domains
/admin/users
/admin/audit
/admin/support-access
```

Platform Admin은 클럽을 생성하고, 최초 호스트를 지정하고, 기본 subdomain alias를 예약하고, 클럽 상태와 도메인 상태를 관리한다. 기본적으로 멤버의 private notes, RSVP 상세, 피드백 문서 본문 같은 클럽 내부 콘텐츠를 열람하지 않는다. 지원 목적으로 내부 콘텐츠 접근이 필요하면 별도 support access 승인과 audit event가 있어야 한다.

### Admin 권한 매트릭스

Platform Admin role은 역할별로 허용 작업을 분리한다. 모든 admin API는 `platform_admins.status='ACTIVE'`를 요구하고, 모든 mutation은 audit event를 남긴다.

| 작업 | OWNER | OPERATOR | SUPPORT |
| --- | --- | --- | --- |
| Admin dashboard 읽기 | 허용 | 허용 | 허용 |
| 클럽 목록/상태/도메인 metadata 읽기 | 허용 | 허용 | 허용 |
| 클럽 생성 | 허용 | 허용 | 거부 |
| 클럽 기본 정보 수정 | 허용 | 허용 | 거부 |
| 클럽 활성/정지 전환 | 허용 | 허용, 2단계 확인 필요 | 거부 |
| 최초/추가 호스트 지정 | 허용 | 허용 | 거부 |
| 마지막 활성 호스트 제거 | 거부, 먼저 대체 호스트 필요 | 거부 | 거부 |
| 등록형 subdomain alias 추가/비활성화 | 허용 | 허용 | 거부 |
| custom domain 검증 상태 변경 | 허용 | 허용 | 거부 |
| Platform Admin 초대/권한 변경 | 허용 | 거부 | 거부 |
| 마지막 OWNER 비활성화 | 거부 | 거부 | 거부 |
| 사용자 계정 검색 | 허용 | 허용 | 제한 허용 |
| 민감하지 않은 support metadata 조회 | 허용 | 허용 | 허용 |
| support access grant 생성 | 허용 | 거부 | 거부 |
| audit log 조회 | 허용 | 허용 | 제한 허용 |

SUPPORT는 장애 대응용 role이다. SUPPORT는 클럽 내부 콘텐츠를 직접 열람하지 않고, 클럽 id, slug, 상태, 도메인 상태, 호스트 이메일의 masked 값, 최근 배포/연결 상태처럼 운영에 필요한 metadata만 본다.

### Admin 계정 부트스트랩

첫 Platform Admin은 public UI에서 자가 등록하지 않는다. 운영자가 서버 환경 변수 또는 one-time CLI/seed 명령으로 OWNER를 부여한다. 이후 OWNER만 `/admin/users`에서 다른 운영자를 초대하거나 role을 바꿀 수 있다.

부트스트랩 원칙:

- 운영 seed에는 실제 개인 이메일을 넣지 않는다.
- public repo에는 OWNER 이메일, admin invite token, one-time secret을 기록하지 않는다.
- OWNER가 0명이 되는 상태는 DB constraint 또는 application guard로 막는다.
- admin 초대와 role 변경은 모두 `club_audit_events` 또는 별도 `platform_audit_events`에 남긴다.

### Admin UI 구성

`/admin`은 운영자가 현재 플랫폼 상태를 빠르게 판단하는 dashboard다.

- 클럽 수, 활성/정지/설정 필요 클럽 수.
- 도메인 alias 상태: active, pending, disabled.
- 최근 클럽 생성/정지/도메인 변경 audit event.
- 조치가 필요한 항목: 호스트 없는 클럽, pending domain, setup required club.

`/admin/clubs`는 클럽 운영 목록이다.

- 검색: 클럽 이름, slug, hostname.
- 필터: status, domain status, host 유무.
- 표시: 클럽 이름, slug, primary hostname, status, 활성 멤버 수, 호스트 수, 최근 활동일.
- 행 action: 상세 보기, 정지/복구, 도메인 관리.

`/admin/clubs/new`는 클럽 생성 wizard다.

- 기본 정보: name, slug, tagline, about.
- 도메인: `<slug>.<primary-domain>` alias 생성 여부와 상태.
- 최초 호스트: 기존 user email 선택 또는 초대 email 입력.
- 확인 화면: 생성될 club, domain, host membership/invitation, audit event 요약.

`/admin/clubs/:clubId`는 클럽 상세 운영 화면이다.

- 클럽 profile과 status.
- primary domain과 fallback path.
- 호스트 목록과 최초 호스트/추가 호스트 지정 action.
- 멤버 수, 세션 수, 공개 기록 수 같은 aggregate만 표시.
- private notes, RSVP 상세, 피드백 문서 본문은 표시하지 않는다.

`/admin/domains`와 `/admin/clubs/:clubId/domains`는 domain alias 관리 화면이다.

- hostname, kind, status, isPrimary, verifiedAt.
- 등록형 subdomain alias 활성/비활성.
- custom domain은 `PENDING` 상태 생성까지만 1차 범위로 둔다.
- DNS나 인증서의 실제 secret 값은 표시하지 않는다.

`/admin/users`는 운영자와 사용자 계정 관리 화면이다.

- OWNER 전용: Platform Admin 초대, role 변경, 비활성화.
- OPERATOR/SUPPORT: 사용자 검색과 계정 상태 metadata 조회만 허용한다.
- 사용자 detail은 가입 클럽 목록과 role/status summary를 보여주되, 클럽 내부 작성물 본문은 보여주지 않는다.

`/admin/audit`은 운영 감사 로그다.

- 클럽 생성, 상태 변경, domain 변경, admin role 변경, support access grant, 호스트 지정 이벤트를 보여준다.
- metadata는 allowlist된 key만 표시하고, 이메일은 가능한 masked 값으로 표시한다.

`/admin/support-access`는 예외적 지원 접근 관리 화면이다.

- OWNER만 grant를 만들 수 있다.
- grant는 대상 club, 목적, 만료 시각, 허용 범위를 가진다.
- 만료된 grant는 사용할 수 없고, 사용 시마다 audit event를 남긴다.

## 클럽 생성 흐름

`/admin/clubs/new`는 하나의 트랜잭션으로 클럽 운영에 필요한 최소 단위를 만든다.

1. 클럽 기본 정보 입력: 이름, slug, tagline, about.
2. slug 예약: `clubs.slug` unique constraint로 중복을 막는다.
3. 기본 domain alias 생성: `<slug>.<primary-domain>`을 `club_domains`에 만든다.
4. 최초 호스트 지정: 기존 user email이면 membership을 만들고, 새 email이면 초대를 만든다.
5. 초기 상태 저장: `ACTIVE` 또는 `SETUP_REQUIRED`.
6. audit event 기록.

생성 후 Platform Admin은 `/admin/clubs/:clubId`에서 상태를 확인하고, 최초 호스트는 `<slug>.<primary-domain>/app/host` 또는 `/clubs/:slug/app/host`로 이동한다.

## 데이터 모델 추가

기존 핵심 테이블은 대부분 `club_id`를 이미 가진다. 멀티 클럽 전환에서 새로 필요한 것은 domain alias와 platform admin 계층이다.

```text
club_domains
- id
- club_id
- hostname
- kind: PRIMARY_DOMAIN_PATH | SUBDOMAIN | CUSTOM_DOMAIN
- status: ACTIVE | PENDING | DISABLED
- is_primary
- verified_at
- created_at
- updated_at

platform_admins
- user_id
- role: OWNER | OPERATOR | SUPPORT
- status: ACTIVE | DISABLED
- created_at
- updated_at

club_audit_events
- id
- actor_user_id
- actor_platform_role
- club_id
- event_type
- metadata
- created_at

platform_audit_events
- id
- actor_user_id
- actor_platform_role
- target_user_id
- event_type
- metadata
- created_at

support_access_grants
- id
- club_id
- granted_by_user_id
- grantee_user_id
- scope
- reason
- expires_at
- revoked_at
- created_at
```

`clubs.slug`는 계속 필수다. slug는 내부 canonical route, fallback path, 로컬 개발, 도메인 미연결 상태의 클럽 접근에 쓰인다. `club_domains.hostname`은 외부 진입 alias다.

`clubs`에는 운영 상태가 필요하다.

```text
clubs.status: SETUP_REQUIRED | ACTIVE | SUSPENDED | ARCHIVED
```

`SUSPENDED` 클럽은 public/member/host surface에서 새 mutation을 막고, public 노출 정책은 admin 설정에 따른다. `ARCHIVED`는 읽기 전용 보존 상태다. 초기 구현에서는 hard delete를 제공하지 않는다.

## API 변화

Public API는 club context를 명시적으로 받거나 BFF가 resolve한 context를 사용한다.

```text
GET /api/public/clubs/:clubSlug
GET /api/public/clubs/:clubSlug/sessions/:sessionId
```

Subdomain 요청에서는 BFF가 club context header를 붙이고 Spring은 같은 use case를 호출한다. 기존 `GET /api/public/club`은 대표 클럽 호환 경로로 유지하거나 deprecated한다.

Member/host API는 URL에 club slug를 넣는 path 방식과 host 기반 방식을 모두 지원할 수 있다.

```text
GET /api/clubs/:clubSlug/sessions/current
GET /api/clubs/:clubSlug/archive
GET /api/clubs/:clubSlug/me/notifications
GET /api/clubs/:clubSlug/host/sessions
```

기존 `/api/sessions/current`, `/api/archive/**`, `/api/host/**`는 초기에 현재 club context가 확정된 경우만 동작시키고, 점진적으로 club-scoped API로 이동한다.

Auth API는 전역 사용자와 클럽 membership 목록을 함께 표현해야 한다.

```text
GET /api/auth/me
```

응답은 현재 club membership 하나만이 아니라 다음 정보를 포함한다.

- authenticated user profile
- current club membership, 있으면
- joined clubs list
- platform admin 여부와 role, 있으면
- recommended app entry URL

Admin API는 member/host API와 분리한다.

```text
GET /api/admin/summary
GET /api/admin/clubs
POST /api/admin/clubs
GET /api/admin/clubs/:clubId
PATCH /api/admin/clubs/:clubId
POST /api/admin/clubs/:clubId/suspend
POST /api/admin/clubs/:clubId/restore
GET /api/admin/clubs/:clubId/domains
POST /api/admin/clubs/:clubId/domains
PATCH /api/admin/domains/:domainId
GET /api/admin/users
POST /api/admin/platform-admins
PATCH /api/admin/platform-admins/:userId
GET /api/admin/audit
POST /api/admin/support-access-grants
```

Admin API는 `CurrentMember`가 아니라 `CurrentPlatformAdmin` 같은 별도 principal을 사용한다. 클럽 membership role이 `HOST`여도 `/api/admin/**` 접근 권한이 생기지 않는다.

## Frontend 변화

React Router는 `/clubs/:clubSlug/**`를 중심으로 재구성한다. `PublicRouteLayout`과 `AppRouteLayout`은 route param 또는 host-derived context를 받아 현재 클럽을 표시한다.

`AuthProvider`는 단일 `clubId`만 전역 auth로 들고 있는 모델에서 전역 사용자와 클럽 membership 목록을 구분하는 모델로 바뀐다.

필요한 새 UI:

- 클럽 선택 화면: 여러 membership이 있는 사용자의 `/app` 진입점.
- 클럽 스위처: 앱 shell에서 가입 클럽 간 이동.
- 접근 불가 화면: 현재 클럽 membership이 없거나 권한이 부족한 경우.
- Admin 클럽 생성 화면: Platform Admin 전용.
- Admin 도메인 상태 화면: 등록형 subdomain alias와 custom domain 준비 상태 표시.
- Admin dashboard, 클럽 목록/상세, 호스트 지정, 사용자 검색, audit log, support access 화면.

사용자가 클럽 하나만 가진 경우에는 선택 화면을 보지 않고 바로 해당 클럽 앱으로 이동한다.

Admin route guard는 member app guard와 분리한다. `/admin/**`은 `AuthMeResponse.platformAdmin.role` 또는 별도 admin auth loader를 기준으로 접근을 판단하고, 클럽 membership이 없어도 Platform Admin이면 접근 가능하다. 반대로 클럽 HOST는 Platform Admin row가 없으면 `/admin/**`에 접근할 수 없다.

## BFF와 Cloudflare 변경

Pages Functions는 request host를 Spring으로 전달하고, Spring이 안전하게 club context를 확인할 수 있도록 정규화된 header를 추가한다.

```text
X-Forwarded-Host
X-Readmates-Club-Host
X-Readmates-Club-Slug
X-Readmates-Bff-Secret
```

Mutating request의 origin 검증은 단일 `READMATES_APP_BASE_URL` 중심에서 허용 origin 목록 또는 primary domain suffix 정책으로 확장한다. 허용 정책은 너무 넓게 열지 않는다. 초기에는 등록된 `club_domains.hostname`과 primary domain path origin만 허용한다.

Google OAuth redirect URI는 초기 무료 플랜 구조에서는 primary domain과 pages.dev callback을 등록한다.

```text
https://<primary-domain>/login/oauth2/code/google
https://readmates.pages.dev/login/oauth2/code/google
```

로그인 시작 시 원래 club URL을 state 또는 server-side session에 저장하고, 성공 후 해당 클럽 앱 또는 `/app` smart entry로 돌려보낸다.

## Cache, Notification, Deep Link

Public cache와 notes cache key는 반드시 club 단위로 분리한다.

```text
public:club:{clubId}:home:v1
public:club:{clubId}:session:{sessionId}:v1
notes:club:{clubId}:feed:v1
```

알림 deep link는 club context를 포함해야 한다.

```text
https://<club-host>/app/sessions/<sessionId>
https://<primary-domain>/clubs/<clubSlug>/app/sessions/<sessionId>
```

도메인 alias가 비활성화되거나 없는 경우 fallback path URL을 사용한다. 알림 이벤트와 delivery metadata에는 secret, raw token, private note body, 피드백 문서 본문을 넣지 않는다.

## 보안과 격리

모든 클럽 데이터 조회와 mutation은 `clubId`로 scope한다. `sessionId`나 `membershipId`만으로 조회하지 않는다. 특히 host API는 대상 membership/session이 호출자의 club 안에 있는지 확인해야 한다.

Platform Admin은 전역 운영 권한이지만, 클럽 내부 private content 접근권은 기본적으로 갖지 않는다. Admin action은 audit event를 남긴다.

Host header spoofing 방지를 위해 Spring은 BFF secret이 없는 요청의 club context header를 신뢰하지 않는다. 직접 API 접근이 가능한 운영 구성이라면 Spring 쪽 origin, BFF secret, trusted proxy 정책을 함께 강화해야 한다.

Public repo에는 실제 custom domain, 운영 secret, 멤버 데이터, deployment state를 기록하지 않는다. 문서 예시는 `<primary-domain>`, `<club-slug>`, `host@example.com` 같은 placeholder를 사용한다.

## 구현 순서

1. Club context resolver와 `club_domains` 모델을 추가한다.
2. Auth resolve를 `user + club context -> CurrentMember`로 전환하고, `GET /api/auth/me`에 joined clubs를 추가한다.
3. Public route/API를 `/clubs/:slug` 기준으로 전환한다.
4. Member/host route/API를 club-scoped path로 이동하고 `/app` smart entry를 만든다.
5. 클럽 선택 화면과 클럽 스위처를 추가한다.
6. Platform Admin, 클럽 생성, 최초 호스트 지정, domain alias 관리 기능을 추가한다.
7. BFF, OAuth redirect, cookie domain, allowed origin 설정을 primary domain 기준으로 확장한다.
8. Notification deep link, cache key, Redis invalidation, public records link를 club-aware로 정리한다.
9. 등록형 subdomain alias 운영 문서를 추가한다.
10. 클럽 수가 늘면 Worker front door wildcard 확장 계획을 별도 spec으로 만든다.

## 테스트 전략

서버:

- `club_domains` resolve 단위 테스트.
- `user + clubId` membership resolve 테스트.
- 같은 user가 두 club에 가입한 경우 current member가 request club에 따라 달라지는 테스트.
- cross-club session, membership, notification 접근 거부 테스트.
- Platform Admin이 club creation transaction을 수행하고 audit event를 남기는 테스트.
- OWNER/OPERATOR/SUPPORT 권한 매트릭스 테스트.
- 마지막 OWNER와 마지막 활성 HOST 제거 방지 테스트.
- Admin API가 클럽 내부 private content를 반환하지 않는 response contract 테스트.

프런트엔드:

- `/app` smart entry: 0개, 1개, 여러 개 membership 분기.
- `/clubs/:slug/app/**` route guard.
- 클럽 스위처 이동.
- subdomain host context mock을 사용한 public/app loader 테스트.
- `/admin/**` route guard와 role별 화면 action 표시/숨김 테스트.

E2E:

- 두 클럽 fixture로 공개 홈, 로그인, 클럽 선택, 앱 진입, 호스트 접근을 검증한다.
- 한 클럽에서 만든 세션이 다른 클럽 archive/current session에 보이지 않는지 확인한다.
- OAuth 성공 후 원래 클럽 URL로 돌아오는지 확인한다.

문서/배포:

- Cloudflare Pages custom domain 등록 절차.
- `readmates.pages.dev` fallback과 소유 도메인 운영 차이.
- Google OAuth redirect URI와 cookie domain 설정.
- public-safety scan으로 실제 domain, secret, token-shaped example이 들어가지 않았는지 확인한다.

## 비범위

초기 구현에서 wildcard Worker front door를 완성하지 않는다. 구조와 DB는 이를 막지 않도록 설계하지만, 무료 플랜 1차 목표는 등록형 subdomain alias와 path fallback이다.

초기 구현에서 end-user custom domain self-service verification을 완성하지 않는다. `club_domains.kind=CUSTOM_DOMAIN`과 상태 모델은 준비하되, 실제 자동 검증과 인증서 운영은 별도 단계에서 다룬다.

클럽 간 데이터 공유, 통합 공개 기록, 여러 클럽을 묶는 federation 기능은 포함하지 않는다.
