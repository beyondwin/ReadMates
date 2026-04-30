# 아키텍처

ReadMates는 여러 정기 독서모임의 공개 소개, 멤버 세션 준비, 호스트 운영, 공개 기록, 참석자 전용 피드백 문서를 하나의 플랫폼 세션과 클럽별 권한 흐름으로 묶습니다.

이 문서는 현재 구조의 source of truth입니다. 기능 문서나 release note가 이 문서와 충돌하면 코드와 테스트를 확인한 뒤 이 문서 또는 해당 문서를 함께 갱신합니다.

아키텍처 변경은 관련 frontend/server guide, 테스트 경계, 배포 문서까지 맞을 때 완료로 봅니다. 외부 provider 동작이나 운영값은 이 문서에 실제 값으로 남기지 않고 placeholder 또는 링크된 runbook 기준으로 설명합니다.

## 제품 표면

| 표면 | 주요 route | 사용자 | 역할 |
| --- | --- | --- | --- |
| 공개 사이트 | `/clubs/:slug`, `/clubs/:slug/about`, `/clubs/:slug/records`, `/clubs/:slug/sessions/:sessionId`, `/`, `/about`, `/records`, `/sessions/:sessionId`, `/login`, `/clubs/:slug/invite/:token`, `/invite/:token`, `/reset-password/:token` | 게스트, 로그인 사용자 | 클럽 소개, 공개 기록, 공개 세션 상세, Google OAuth 시작, 클럽 context가 있는 초대 수락 진입, 종료된 비밀번호 경로 안내. Unscoped public route는 호환성을 위해 baseline club을 사용 |
| 로그인 후 진입 | `/app`, `/clubs/:slug/app`, 등록된 club host의 `/app` | 로그인 사용자 | 가입 클럽이 하나면 해당 클럽 앱으로 이동하고, 여러 개면 클럽 선택 화면을 보여주며, 선택한 클럽 context로 앱에 진입 |
| 멤버 앱 | `/clubs/:slug/app`, `/clubs/:slug/app/pending`, `/clubs/:slug/app/session/current`, `/clubs/:slug/app/notes`, `/clubs/:slug/app/archive`, `/clubs/:slug/app/sessions/:sessionId`, `/clubs/:slug/app/feedback/:sessionId`, `/clubs/:slug/app/feedback/:sessionId/print`, `/clubs/:slug/app/me`, `/clubs/:slug/app/notifications`, 등록된 club host의 `/app/**` | 둘러보기 멤버, 정식 멤버, 호스트 | 현재 세션 확인, 멤버 공개 예정 세션 확인, 둘러보기 멤버 안내, RSVP, 읽은 분량, 질문, 한줄평, 장문 서평, 아카이브, 참석 회차 피드백 문서, 본인 표시 이름과 알림 설정 변경, 클럽별 멤버 알림함 확인 |
| 호스트 앱 | `/clubs/:slug/app/host`, `/clubs/:slug/app/host/notifications`, `/clubs/:slug/app/host/members`, `/clubs/:slug/app/host/invitations`, `/clubs/:slug/app/host/sessions/new`, `/clubs/:slug/app/host/sessions/:sessionId/edit`, 등록된 club host의 `/app/host/**` | 현재 클럽의 호스트 | 예정 세션 생성/수정, 공개 범위 설정, 현재 세션 시작, 참석 확정, 진행 세션 닫기, 닫힌 기록 발행, 초대 관리, 멤버 상태와 표시 이름 관리, 피드백 문서 업로드, 알림 발송 운영 |
| 플랫폼 관리 | `/admin` | platform admin | 클럽 생성, 클럽 목록 확인, 등록형 domain alias 요청과 상태 확인. 클럽 호스트/멤버 권한과 별도 권한으로 처리 |

## 프런트엔드 route-first 경계

프런트엔드는 React Router route를 중심으로 `front/src/app -> front/src/pages -> front/features -> front/shared` 방향을 목표 경계로 유지합니다. `front/tsconfig.json`과 Vite 설정에서 `@/*` alias는 `front/*`를 가리키므로, feature와 shared source는 `front/src` 안이 아니라 `front/features`, `front/shared` 아래에 있습니다. `src/app`은 router, layout, guard, provider wiring을 담당하고, `src/pages`는 route compatibility shell로서 feature route module을 re-export하거나 얇게 위임합니다.

`shared/ui`는 재사용 가능한 presentation primitive만 소유하며 `src/app`, `src/pages`, `features`를 import하지 않습니다. Router, route continuity, provider context처럼 app이 소유한 의존성은 app/page/feature route composition에서 주입하거나 shared boundary 밖의 primitive로 옮긴 뒤 사용합니다.

Feature는 가능한 범위에서 `api`, `model`, `route`, `ui`로 나눕니다.

- `features/<name>/api`는 해당 feature의 BFF endpoint 호출과 request/response contract만 담당합니다.
- `features/<name>/model`은 React, React Router, API client를 import하지 않는 순수 화면 모델 계산만 둡니다.
- `features/<name>/route`는 loader/action, route error/loading state, API/model 호출, UI props 조립을 담당합니다.
- `features/<name>/ui`는 props와 callback으로만 렌더링하며 `fetch`, `shared/api`, feature API, route module을 직접 import하지 않습니다.

`shared/api/readmates` compatibility module은 제거되었고, feature route/page는 feature-owned API contract 또는 `shared/api` primitive를 사용해야 합니다. `features/*/components`는 `ui`로 이동하지 않은 legacy presentation surface에만 남길 수 있습니다. `ui` directory가 있는 feature에서는 외부 source가 `features/<name>/components`를 public surface처럼 import하지 않습니다. Host feature는 `features/host/ui`가 공개 presentation surface이며, host components legacy public surface는 없습니다.

이 경계는 `front/tests/unit/frontend-boundaries.test.ts`에서 일부 강제합니다. 테스트는 shared-to-app/page/feature import, feature 간 직접 import, feature `model/route/ui` layer import, 제거된 `shared/api/readmates` compatibility import, `ui`가 있는 feature의 `components` public import를 확인합니다.

## 요청 흐름

```text
Browser
  |
  | same-origin SPA, /api/bff/**, /oauth2/**, /login/oauth2/**
  v
Cloudflare Pages
  |-- Vite SPA static assets
  |-- Pages Functions BFF and OAuth proxy
        |-- /api/bff/** -> Spring /api/**
        |-- /oauth2/authorization/** -> Spring OAuth start
        |-- /login/oauth2/code/** -> Spring OAuth callback
  |
  | X-Readmates-Bff-Secret, forwarded cookies
  v
Spring Boot API
  |-- Spring Security
  |-- optional Redis-backed rate limit and read-through cache
  |-- membership, role, session authorization
  |-- feedback document parser
  |-- Flyway migrations
  |---> Redis (optional, disabled by default)
  v
MySQL
```

Production에서 browser-facing origin은 Cloudflare Pages입니다. 브라우저는 직접 Spring API origin을 신뢰하지 않고, 같은 origin의 `/api/bff/**`로 요청합니다. Pages Functions는 upstream Spring `/api/**`로 전달하면서 `X-Readmates-Bff-Secret`을 붙이고 cookie를 전달합니다. 또한 path fallback의 `clubSlug` query와 요청 host에서 클럽 context를 계산해 Spring으로 신뢰 가능한 `X-Readmates-Club-Slug`, `X-Readmates-Club-Host` header를 전달합니다. Cloudflare Functions의 `front/functions/_shared/proxy.ts`는 upstream response header 복사, 내부 `x-readmates-*` response header 제거, host 정규화, client IP 계산, OAuth forwarded header 생성처럼 재사용되는 trusted header/cookie/host/IP helper policy를 제공합니다. `/api/bff/**` route 함수는 API path와 `clubSlug`를 검증한 뒤 shared helper와 route-local header 구성을 조합해 upstream trusted header를 만듭니다. browser가 보낸 내부 header를 신뢰값으로 전달하지 않는 정책은 shared helper와 route tests가 함께 지킵니다.

로컬 Vite dev server는 `front/vite.config.ts`의 proxy로 같은 구조를 흉내 냅니다. Cloudflare Pages Functions 코드는 production/preview 배포에서 실행되고, 로컬 개발에서는 Vite proxy가 `/api/bff/**`, `/oauth2/authorization/**`, `/login/oauth2/code/**`를 backend로 넘깁니다. 로컬 proxy도 browser-supplied club context header를 제거하고 `clubSlug` query에서 검증한 slug만 trusted header로 다시 붙입니다.

## 멀티 클럽 context와 도메인 모델

`clubs.slug`는 클럽의 내부 canonical key입니다. 무료 플랜에서도 항상 보장되는 공개 URL은 `https://readmates.pages.dev/clubs/:slug`이고, 같은 path 전략은 primary domain을 붙였을 때도 유지됩니다. `club_domains.hostname`은 외부 진입 alias입니다. 등록된 alias는 Cloudflare Pages custom domain에 연결된 뒤 `ACTIVE` 상태일 때 host 기반으로 같은 클럽을 resolve합니다. Primary domain path fallback은 slug로 resolve하며 별도 `club_domains` row를 만들지 않습니다.

Platform admin의 domain 상태 확인은 `https://<hostname>/.well-known/readmates-domain-check.json` marker를 HTTPS로 가져와 `ACTIVE` 또는 `FAILED`로 저장합니다. Checker는 redirect를 따르지 않고, loopback/private/link-local/multicast/IPv6 ULA address와 4KB를 넘는 marker 응답을 실패로 처리합니다. 1차 구현은 Cloudflare account id, zone id, API token을 저장하지 않으며 Cloudflare API poller 대신 admin-triggered marker check를 사용합니다.

클럽 context resolve 순서는 trusted `X-Readmates-Club-Slug`가 먼저이고, 없으면 trusted `X-Readmates-Club-Host`입니다. Spring은 BFF secret을 통과한 요청에서만 `X-Readmates-Club-Slug`와 `X-Readmates-Club-Host`를 신뢰합니다. browser가 직접 보낸 같은 이름의 header는 Pages Functions 또는 Vite proxy에서 제거되며, Spring API origin을 직접 호출하는 요청은 운영에서 BFF secret 검증을 통과할 수 없습니다.

로그인 세션은 플랫폼 전체에서 공유합니다. OAuth start는 현재 Pages 또는 registered host에서 시작될 수 있지만, Google callback `redirect_uri`는 `READMATES_AUTH_BASE_URL`의 primary auth origin으로 모읍니다. 성공 후 `returnTo`가 signed return state로 검증되면 클럽 path 또는 등록 host로 되돌리고, 없으면 `/app` smart entry로 이동합니다. Frontend guarded route, loader, API 401 흐름은 같은 origin의 안전한 relative path만 `/login?returnTo=...`와 OAuth start로 전달하고, absolute URL, protocol-relative URL, login/reset/invite/OAuth/root path, backslash, control character가 포함된 값은 버립니다. Absolute return URL은 primary app host, `readmates.pages.dev`, 또는 `ACTIVE` club domain이면서 session cookie domain 정책으로 세션을 공유할 수 있는 host만 허용합니다. 초대 링크는 token만으로 전역 membership을 만들지 않고, 초대가 속한 club context로 돌아오도록 return URL을 보존합니다.

사용자 역할은 club membership마다 독립적입니다. 현재 club membership role은 `HOST`와 `MEMBER`이고, platform admin 권한은 `platform_admins`의 `OWNER`, `OPERATOR`, `SUPPORT`로 별도 판정합니다. Platform `OPERATOR`는 club host가 아니며, 특정 클럽의 호스트 도구를 쓰려면 그 클럽 membership에서도 `HOST` 권한이 있어야 합니다.

Public cache, 멤버 알림 deep link, host 알림 운영 ledger는 club id 또는 club slug를 포함해 scope를 나눕니다. 공개 cache key는 club id 기준으로 분리하고, 알림 link는 `/clubs/:slug/app/**` canonical path를 사용해 로그인 후에도 원래 클럽 화면으로 복귀합니다.

## 서버 내부 구조

Backend는 단일 Spring Boot 모듈을 유지하면서 feature package 안에서 클린 아키텍처 경계를 나눕니다. 완전히 전환된 서버 API slice는 feature별로 아래 방향을 따릅니다.

```text
adapter.in.web
  -> application.port.in
  -> application.service
  -> application.port.out
  -> adapter.out.persistence
```

현재 full port/outbound adapter chain을 따르는 범위는 `publication`, `archive`, `feedback`, `session`, `note`, `auth`의 운영 API surface와 `notification` 운영 slice입니다. Disabled password/password-reset/dev-invitation accept endpoint는 `410 Gone` stub으로 남습니다. Auth의 OAuth filter, success handler, cookie/session 보안 구성은 `auth.infrastructure.security`와 `auth.adapter.in.security`에 따로 둡니다.

Notification slice는 MySQL `notification_event_outbox`를 이벤트 source of truth로 유지합니다. Relay scheduler가 publish 가능한 row를 Kafka topic `readmates.notification.events.v1`로 발행하고, 같은 Spring Boot 모듈의 Kafka consumer가 이벤트별 수신자를 계산해 멤버 선호도를 적용한 뒤 `notification_deliveries`와 `member_notifications`를 만듭니다. 이메일 발송은 `notification_deliveries`의 `EMAIL` row를 기준으로 재시도 가능한 side effect로 처리하고, in-app 알림은 `member_notifications`가 멤버 inbox source of truth입니다. 이벤트 발행 상태는 `notification_event_outbox`, 채널별 발송/skip 상태는 `notification_deliveries`, 멤버 inbox 상태는 `member_notifications`에 저장합니다. 이메일 copy는 `notification.application.model`의 순수 template helper가 in-app 제목/본문/deep link, 이메일 subject, plain text, HTML을 함께 렌더링하고, SMTP adapter는 HTML이 있으면 plain text fallback을 포함한 multipart MIME으로 발송합니다. 호스트 알림 상세 API는 subject, masked recipient, deep link, allowlist metadata만 노출하고 plain/HTML body는 노출하지 않습니다. 테스트 메일 audit은 별도 `notification_test_mail_audit` table에 masked email과 hash만 저장합니다. 발행 조건, 생성 시점, relay/consumer 주기, 재시도 정책은 [OCI backend runbook](../deploy/oci-backend.md#email-notification-operations)을 기준으로 운영합니다. 패키지 경계는 아래처럼 web/scheduler/Kafka inbound adapter, application service, outbound port, persistence/mail/Kafka adapter로 나눕니다.

```text
notification
  adapter.in.web / adapter.in.scheduler / adapter.in.kafka
  application.port.in
  application.service
  application.port.out
  adapter.out.persistence / adapter.out.mail / adapter.out.kafka
```

| 영역 | 현재 패키지 | 역할 |
| --- | --- | --- |
| Web/scheduler/Kafka adapter | `publication.adapter.in.web`, `archive.adapter.in.web`, `feedback.adapter.in.web`, `session.adapter.in.web`, `note.adapter.in.web`, `auth.adapter.in.web`, `notification.adapter.in.web`, `notification.adapter.in.scheduler`, `notification.adapter.in.kafka`, `shared.adapter.in.web` | HTTP request validation, `CurrentMember` 주입, use case 호출, scheduler trigger, Kafka listener dispatch, response mapping; shared health endpoint |
| Security adapter/infrastructure | `auth.adapter.in.security`, `auth.infrastructure.security` | Spring Security `Authentication` 해석, OAuth/session filter, cookie/security wiring |
| Inbound port | `publication.application.port.in`, `archive.application.port.in`, `feedback.application.port.in`, `session.application.port.in`, `note.application.port.in`, `auth.application.port.in`, `notification.application.port.in`, `club.application.port.in` | controller나 scheduler가 의존하는 use case contract |
| Application service | `publication.application.service`, `archive.application.service`, `feedback.application.service`, `session.application.service`, `note.application.service`, `auth.application`/`auth.application.service`, `notification.application.service`, `club.application.service` | command/query orchestration과 권한 확인, retryable side effect 처리 |
| Outbound port | `publication.application.port.out`, `archive.application.port.out`, `feedback.application.port.out`, `session.application.port.out`, `note.application.port.out`, `auth.application.port.out`, `notification.application.port.out`, `club.application.port.out` | application service가 persistence/mail/HTTP 세부사항 없이 호출하는 contract |
| Persistence/mail/Kafka/HTTP adapter | `publication.adapter.out.persistence`, `archive.adapter.out.persistence`, `feedback.adapter.out.persistence`, `session.adapter.out.persistence`, `note.adapter.out.persistence`, `auth.adapter.out.persistence`, `club.adapter.out.persistence`, `club.adapter.out.http`, `notification.adapter.out.persistence`, `notification.adapter.out.mail`, `notification.adapter.out.kafka` | JDBC query와 row mapping, domain marker HTTP check, 외부 mail delivery와 Kafka publish 세부 구현을 소유하는 outbound adapter |
| Redis adapter | `auth.adapter.out.redis`, `publication.adapter.out.redis`, `note.adapter.out.redis`, `shared.adapter.out.redis` | 선택적 Redis rate limit/cache/invalidation 구현. application service는 Redis adapter가 아니라 port에만 의존 |

전환된 controller는 legacy repository, `JdbcTemplate`, persistence adapter를 직접 주입받지 않습니다. 인증된 사용자는 controller method에서 `CurrentMember`로 받으며, resolver가 `ResolveCurrentMemberUseCase`를 통해 멤버 정보를 조회합니다.

새 기능이나 전환된 slice에서는 기존 repository를 controller에 다시 주입하지 않고, 필요한 경우 inbound port, application service, outbound port와 adapter를 먼저 둡니다.

Application package는 Spring Web/HTTP type, HTTP client, adapter 구현체에 의존하지 않습니다. Application service는 feature application error를 던지고, HTTP status와 response mapping은 `adapter.in.web`의 controller 또는 error handler가 맡습니다. 외부 HTTP가 필요한 기능은 application outbound port를 정의하고 `adapter.out.http` 구현으로 분리합니다.

아키텍처 경계는 `ServerArchitectureBoundaryTest`에서 강제합니다. 이 테스트는 전환된 web adapter가 legacy repository, `JdbcTemplate`, outbound persistence/Redis adapter, Spring Data Redis에 직접 의존하지 않는지, `session`/`publication`/`archive`/`feedback`/`note`/`auth`/`notification`/`club` application package가 adapter, Spring JDBC, Spring DAO, Spring Data Redis, Spring Web/HTTP 세부사항에 의존하지 않는지, domain package가 web/JDBC/persistence 세부사항에 의존하지 않는지 확인합니다.

## 인증과 세션

운영 로그인은 Google OAuth입니다.

1. 브라우저가 `/oauth2/authorization/google`로 이동합니다. 초대 수락처럼 원래 클럽으로 돌아와야 하는 흐름은 `returnTo`를 함께 보냅니다.
2. Pages Functions가 Spring `/oauth2/authorization/google`로 proxy하고, 현재 host 또는 slug에서 계산한 club context header를 붙입니다.
3. Spring Security가 Google OAuth flow를 시작합니다.
4. callback은 `READMATES_AUTH_BASE_URL`이 가리키는 primary auth origin의 `/login/oauth2/code/google`로 돌아옵니다. Primary auth origin을 따로 두지 않은 preview나 무료 플랜 기본 배포에서는 `https://readmates.pages.dev/login/oauth2/code/google`을 사용합니다.
5. Pages Functions가 callback을 Spring으로 proxy합니다.
6. Spring이 Google 사용자 정보를 확인하고 platform session을 복원하거나 생성합니다.
7. `returnTo`가 검증된 signed return state로 저장되어 있으면 허용된 primary origin, `readmates.pages.dev` fallback, 또는 등록된 active club host로 redirect합니다. 없으면 `/app` smart entry로 redirect합니다.

`readmates_session` cookie는 `HttpOnly`, `SameSite=Lax`, production `Secure` posture를 사용합니다. 서버는 raw token을 저장하지 않고 hash를 `auth_sessions`에 저장합니다. API 요청마다 session cookie에서 현재 사용자를 복원하고, membership/role 상태를 기준으로 route와 API 접근을 제한합니다.

Password login과 password reset endpoint는 현재 운영 경로가 아니며 `410 Gone`을 반환합니다. Dev-login은 `dev` profile의 fixture flow입니다. production auth로 취급하지 않습니다.

## BFF 보안 경계

Spring은 `/api/**` 요청에서 `X-Readmates-Bff-Secret`을 검사할 수 있습니다. `READMATES_BFF_SECRET`이 설정되어 있으면 요청 header 값이 일치해야 합니다.

Mutating method인 `POST`, `PUT`, `PATCH`, `DELETE`는 `Origin` 또는 `Referer`가 `READMATES_ALLOWED_ORIGINS` 또는 `READMATES_APP_BASE_URL`에서 파생된 허용 origin에 포함되어야 합니다.

클럽 context header도 BFF 신뢰 경계 안에 있습니다. Spring은 `X-Readmates-Club-Slug`와 `X-Readmates-Club-Host`를 browser input으로 취급하지 않고, BFF secret을 통과한 요청에서만 context resolve 입력으로 사용합니다. 허용 origin은 primary auth/app origin, `https://readmates.pages.dev`, 등록된 active club host를 명시적으로 포함해야 하며 wildcard suffix로 넓게 열지 않습니다.

`READMATES_BFF_SECRET`은 Cloudflare Pages Functions와 Spring runtime 설정에만 둡니다. `VITE_` 또는 `NEXT_PUBLIC_` 접두사로 만들어 브라우저 bundle에 노출하지 않습니다.

## Optional Redis 계층

Redis는 선택 계층이며 기본 설정에서는 꺼져 있습니다. Redis가 없어도 서버는 MySQL을 source of truth로 사용해 session, membership, publication, notes 데이터를 읽고 씁니다. Redis-backed 기능은 `READMATES_REDIS_ENABLED=true`와 기능별 flag를 함께 켰을 때만 동작합니다.

Redis 사용 범위는 재생성 가능한 보조 데이터로 제한합니다.

| 기능 | 저장/사용 데이터 | 장애 기준 |
| --- | --- | --- |
| Rate limit | hash된 client/session 식별자 기반 counter | 기본 fail-open, 민감 요청은 설정으로 fail-closed 가능 |
| Auth session cache | `sessionId`, `userId`, `expiresAt` 같은 session metadata | MySQL session row를 계속 검증하고, cache 유실 시 MySQL fallback |
| Public cache | 공개 API read model | decode 실패 또는 Redis 장애 시 key 삭제/best-effort 후 MySQL fallback |
| Notes cache | 멤버 공개 `PUBLISHED` notes feed/session 목록 read model | decode 실패 또는 Redis 장애 시 key 삭제/best-effort 후 MySQL fallback |
| Read-cache invalidation | public/notes cache key 삭제 | mutation commit 이후 best-effort, 실패해도 domain mutation은 유지 |

Redis key와 metric label에는 raw session token, 초대 token 원문, BFF secret, OAuth code, private feedback document body, 이메일, 표시 이름을 넣지 않습니다. Cache invalidation은 command transaction commit 이후 실행해 pre-commit DB 상태가 cache로 다시 채워지는 race를 줄입니다.

## 멤버십과 역할 모델

ReadMates의 사용자 상태는 club membership의 status와 role을 함께 봅니다. Membership row는 club별로 독립적이고, platform admin 권한은 `platform_admins`에서 별도로 확인합니다.

| 상태/역할 | 의미 |
| --- | --- |
| `VIEWER` | Google 로그인은 했지만 정식 초대를 수락하지 않은 둘러보기 멤버입니다. 읽기 가능한 일부 멤버 화면과 멤버 공개 예정 세션은 볼 수 있지만 현재 세션 쓰기, 피드백 문서 열람, 호스트 도구는 제한됩니다. |
| `ACTIVE` + `MEMBER` | 정식 멤버입니다. 현재 세션 참여, 멤버 공개 예정 세션 확인, RSVP, 체크인, 질문, 한줄평, 장문 서평, 본인이 참석한 회차의 피드백 문서 열람이 가능합니다. |
| `ACTIVE` + `HOST` | 호스트입니다. 정식 멤버 권한에 운영 권한이 추가됩니다. |
| `SUSPENDED` | 제한된 멤버 상태입니다. route guard와 API authorization에서 쓰기/운영 권한을 제한합니다. |
| `LEFT`, `INACTIVE` | 떠났거나 비활성화된 계정 상태입니다. 멤버 앱과 쓰기 기능에서 제외됩니다. |
| `INVITED` | 초대 발급 또는 수락 전후의 중간 상태로 사용됩니다. |

같은 사용자라도 클럽마다 다른 role과 status를 가질 수 있습니다. 예를 들어 한 사용자는 `reading-sai`에서는 `HOST`, `sample-book-club`에서는 `MEMBER`일 수 있고, platform admin이라도 특정 클럽에서 호스트 API를 쓰려면 해당 클럽 membership 권한을 별도로 통과해야 합니다.

현재 세션 참여 여부는 `session_participants`와 `SessionParticipationStatus`로 관리합니다. 호스트는 같은 클럽의 정식 멤버를 현재 세션에 추가하거나 제거할 수 있고, 참석 확정 후 피드백 문서 열람 경계에 영향을 줍니다.

## 세션 lifecycle과 공개 범위

ReadMates는 클럽별로 하나의 현재 `OPEN` 세션과 여러 개의 예정 `DRAFT` 세션을 함께 다룹니다. 호스트가 새 세션을 만들면 기본 상태는 `DRAFT`, 기본 공개 범위는 `HOST_ONLY`입니다. 호스트는 `/api/host/sessions`와 `/api/host/sessions/{sessionId}`에서 책/회차 metadata를 만들고 수정하며, `/api/host/sessions/{sessionId}/visibility`로 `HOST_ONLY`, `MEMBER`, `PUBLIC` 중 하나를 저장합니다. 호스트 세션 목록과 상세 응답은 `state`와 `visibility`를 함께 반환하므로, 프런트엔드는 예정 세션 카드, 현재 세션 카드, 닫힌 기록, 발행된 기록, 기록 공개 범위 UI를 같은 contract로 조립합니다.

`sessions.state`는 운영 단계를 구분합니다.

| 상태 | 의미 | 주요 전환 |
| --- | --- | --- |
| `DRAFT` | 예정 세션입니다. 멤버에게 보이려면 `visibility`가 `MEMBER` 또는 `PUBLIC`이어야 합니다. | `/api/host/sessions/{sessionId}/open`으로 `OPEN` 전환 |
| `OPEN` | 현재 참여 세션입니다. RSVP, 읽은 분량, 질문, 서평, 참석 확정이 이 상태를 기준으로 동작합니다. | `/api/host/sessions/{sessionId}/close`로 `CLOSED` 전환 |
| `CLOSED` | 모임은 끝났지만 기록은 아직 최종 발행 전입니다. 멤버 archive에는 `MEMBER`/`PUBLIC` 범위로 보일 수 있지만, notes feed와 public surface에는 아직 발행되지 않습니다. | 공개 요약과 `MEMBER` 또는 `PUBLIC` 범위를 저장한 뒤 `/api/host/sessions/{sessionId}/publish`로 `PUBLISHED` 전환 |
| `PUBLISHED` | 기록 발행이 완료된 세션입니다. `PUBLIC` 범위는 public route/API에, `MEMBER`/`PUBLIC` 범위는 멤버 notes feed와 archive에 노출됩니다. | 되돌림 API는 없습니다. |

`sessions.visibility`가 세션 공개 범위의 DB source of truth입니다. `PUT /api/host/sessions/{sessionId}/publication`은 공개 요약과 기록 공개 범위를 저장하면서 `sessions.visibility`, `public_session_publications.visibility`, legacy `is_public` 값을 함께 맞춥니다. `public_session_publications.visibility`와 legacy `is_public` 값은 공개 기록 호환 경로를 위해 남아 있지만, archive, notes, upcoming session 조회는 `sessions.visibility`를 기준으로 `HOST_ONLY` 항목을 숨깁니다.

호스트는 `/api/host/sessions/{sessionId}/open`으로 `DRAFT` 세션 하나를 현재 세션으로 시작합니다. 같은 클럽에 이미 `OPEN` 세션이 있으면 다른 draft를 동시에 열 수 없습니다. 이미 열린 세션에 대한 open 요청은 같은 세션 detail을 반환하고, `CLOSED`나 `PUBLISHED` 세션을 현재 세션으로 되돌리지는 않습니다.

호스트는 `/api/host/sessions/{sessionId}/close`로 `OPEN` 세션을 닫습니다. 이미 `CLOSED`인 세션에 대한 close 요청은 같은 detail을 반환하지만, `DRAFT`나 `PUBLISHED` 세션은 닫을 수 없습니다. 닫기 SQL은 `state='OPEN'` 조건이 맞을 때만 `CLOSED`로 바꾸므로, 다른 트랜잭션이 먼저 `PUBLISHED`로 바꾼 상태를 덮어쓰지 않습니다.

호스트는 `/api/host/sessions/{sessionId}/publish`로 `CLOSED` 세션을 발행합니다. 발행은 같은 club의 publication row가 있고, `visibility`가 `MEMBER` 또는 `PUBLIC`이며, `public_summary`가 비어 있지 않을 때만 허용됩니다. `HOST_ONLY`, `DRAFT`, `OPEN`, publication row가 없는 `CLOSED` 세션은 발행할 수 없습니다. `PUBLIC`으로 발행하면 compatibility column인 `public_session_publications.is_public`과 `published_at`도 함께 맞춥니다.

멤버 홈은 `/api/sessions/upcoming`을 통해 멤버에게 보이는 예정 세션을 가져옵니다. 이 endpoint는 `DRAFT`이면서 `MEMBER` 또는 `PUBLIC`인 같은 클럽 세션만 반환합니다. `VIEWER`도 이 읽기 목록은 볼 수 있지만, RSVP/체크인/질문/서평 쓰기와 `/api/host/**` 운영 도구는 사용할 수 없습니다.

발행된 회차의 장문 서평은 archive-owned endpoint인 `PUT /api/archive/sessions/{sessionId}/my-long-review`에서 저장합니다. 이 경로는 `PUBLISHED` 상태이고 `MEMBER` 또는 `PUBLIC` 범위인 세션에 참여한 정식 멤버만 사용할 수 있으며, 저장된 서평은 `PUBLIC` long review가 됩니다. 같은 작성자의 같은 세션 서평은 처음 공개 상태가 될 때만 `REVIEW_PUBLISHED` 알림을 만들고, 작성자 본인은 수신 대상에서 제외합니다.

## 이메일 알림, 멤버 알림함, 호스트 운영

멤버 알림 설정은 `/api/me/notifications/preferences`에서 읽고 저장합니다. 선호도 row가 없으면 기존 운영 알림(`NEXT_BOOK_PUBLISHED`, `SESSION_REMINDER_DUE`, `FEEDBACK_DOCUMENT_PUBLISHED`)은 켜짐, 서평 공개 알림(`REVIEW_PUBLISHED`)은 꺼짐으로 해석합니다. `/app/me`는 정식 멤버와 호스트에게 이 설정을 보여주며, 둘러보기 멤버는 저장 가능한 알림 설정을 보지 않습니다.

멤버 알림함은 `/api/me/notifications`, `/api/me/notifications/unread-count`, `/api/me/notifications/{id}/read`, `/api/me/notifications/read-all`을 사용합니다. `/app/notifications`는 `member_notifications`를 source of truth로 읽고, unread count, 개별 읽음 처리, 전체 읽음 처리를 제공합니다. 각 알림의 deep link를 열면 해당 알림을 읽음 처리한 뒤 대상 화면으로 이동합니다.

호스트 알림 운영 페이지는 `/app/host/notifications`입니다. 이 페이지는 현재 host club의 event outbox row와 channel delivery row 목록, 이메일 pending/failed 처리, 개별 retry, `DEAD` delivery 복구, redesigned template helper를 사용하는 테스트 메일, 최근 테스트 메일 audit을 다룹니다. 호스트 API 응답은 recipient email을 masked 값으로만 반환하고, detail metadata는 `sessionNumber`, `bookTitle`처럼 allowlist된 제품 metadata만 노출합니다.

테스트 메일은 SMTP 호출 전 audit row를 먼저 예약해 host membership 단위 60초 cooldown을 직렬화합니다. 실패한 테스트 메일은 같은 audit row를 `FAILED`로 갱신하고, 저장/응답되는 error는 email, secret, token, credential 형태를 redaction한 뒤 길이를 제한합니다.

## 페이지된 목록 API contract

범위가 있는 목록 endpoint는 cursor 기반 page object를 반환합니다. 공통 응답 필드는 `{ "items": [...], "nextCursor": string | null }`이고, 다음 page가 없으면 `nextCursor`는 `null`입니다. Endpoint에 따라 `/api/me/notifications`의 `unreadCount`처럼 목록 전체 상태를 나타내는 추가 field가 붙을 수 있습니다. Request query는 endpoint별 기본값과 최대값을 둔 `limit`, `cursor`를 사용합니다.

이 contract를 따르는 목록은 archive의 `/api/archive/sessions`, `/api/archive/me/questions`, `/api/archive/me/reviews`, notes의 `/api/notes/sessions`, `/api/notes/feed`, feedback의 `/api/feedback-documents/me`, host의 `/api/host/sessions`, `/api/host/members`, `/api/host/members/viewers`, `/api/host/members/pending-approvals`, `/api/host/invitations`, notification의 `/api/me/notifications`, `/api/host/notifications/items`, `/api/host/notifications/events`, `/api/host/notifications/deliveries`, `/api/host/notifications/test-mail/audit`입니다. 예를 들어 `GET /api/host/members/pending-approvals?limit=2`는 pending viewer approval 목록의 첫 page를 반환하고, 다음 page는 응답의 `nextCursor`를 `cursor` query로 넘겨 요청합니다.

위 scoped endpoint에는 legacy array response contract가 없습니다. 프런트엔드 loader와 route action은 `items`를 누적하고 `nextCursor`로 명시적인 더보기 control을 보여줘야 하며, 새 scoped 목록 API도 같은 공통 page field를 사용합니다.

## 멤버 프로필과 표시 이름

ReadMates에서 멤버를 부르는 앱 표시 이름은 `displayName`입니다. `displayName`은 현재 클럽 membership에 붙은 이름이며, 현재 스키마에서는 기존 `memberships.short_name` 컬럼에 저장합니다. Google 계정이나 초대에서 온 원본 이름은 `accountName`으로만 다루고, 멤버를 식별할 때는 `email`을 우선 보여줍니다.

프로필 수정 API는 두 개입니다.

- `PATCH /api/me/profile`: 인증된 사용자가 본인 membership의 `displayName`을 수정합니다. `VIEWER`, `ACTIVE`, `SUSPENDED`처럼 멤버 앱을 읽을 수 있는 상태에서만 허용합니다.
- `PATCH /api/host/members/{membershipId}/profile`: 활성 호스트가 같은 클럽 멤버의 `displayName`을 수정합니다. 호스트 멤버 목록 row를 갱신할 수 있도록 `HostMemberListItem` 형태를 반환합니다.

서버는 표시 이름을 trim한 뒤 필수값, 20자 이하, 제어문자, 이메일 형태, URL/domain 형태, 예약어(`탈퇴한 멤버`, `관리자`, `호스트`, `운영자`)를 검증합니다. 같은 클럽 안의 `displayName` 중복은 현재 `memberships(club_id, short_name)` unique constraint와 application-level lock/check로 막습니다. 공개 문서와 seed에는 실제 멤버 이름 대신 public-safe sample name만 둡니다.

## 공개 기록과 비공개 기록 경계

Public route/API에는 명시적으로 공개된 데이터만 나갑니다.

- 공개 사이트는 `/api/public/clubs/{slug}`, `/api/public/clubs/{slug}/sessions/{sessionId}` 같은 club-scoped public API를 사용합니다. Explicit slug endpoint에서는 slug가 public data boundary의 기준입니다.
- 공개 기록에는 `sessions.state=PUBLISHED`이고 `public_session_publications.visibility=PUBLIC`인 세션 요약, 공개 가능한 하이라이트, 한줄평, 책/회차 정보만 포함합니다.
- 예정 세션 목록은 멤버 앱의 `/api/sessions/upcoming`에서만 제공하며, `HOST_ONLY` draft는 멤버, 둘러보기 멤버, archive, notes, public route/API에 노출하지 않습니다.
- 멤버 archive는 `CLOSED` 또는 `PUBLISHED`이면서 `sessions.visibility`가 `MEMBER` 또는 `PUBLIC`인 기록을 보여줍니다. `CLOSED` 기록은 멤버 archive에서 읽을 수 있지만 notes feed와 public route/API에는 아직 나오지 않습니다.
- 멤버 notes feed는 `PUBLISHED`이면서 `sessions.visibility`가 `MEMBER` 또는 `PUBLIC`인 기록만 보여줍니다.
- 현재 세션의 RSVP, 읽은 분량, private notes, meeting data, 피드백 문서 본문은 public API로 노출하지 않습니다.
- 멤버 앱의 `/api/archive/**`, `/api/notes/**`, `/api/sessions/current/**`는 인증과 membership 상태를 확인합니다.
- 호스트 API인 `/api/host/**`는 현재 club context의 active `HOST` role이 필요합니다.

이 경계는 포트폴리오 공개에도 중요합니다. 문서와 예시는 실제 멤버 데이터나 실제 운영 club domain을 사용하지 않고, API origin은 `https://api.example.com` 같은 placeholder를 사용합니다.

## 피드백 문서 흐름

피드백 문서는 모임 후 운영 산출물을 저장하고 읽기 좋게 제공하기 위한 기능입니다.

```text
External operating workflow
  |
  | Markdown or text feedback document
  v
Host upload
  |
  | POST /api/host/sessions/{sessionId}/feedback-document
  v
Spring validation and parser
  |
  | UTF-8, .md/.txt, size, filename, structured sections
  v
MySQL session_feedback_documents
  |
  | GET /api/sessions/{sessionId}/feedback-document
  v
Readable response for host or attended full member
```

호스트는 `.md` 또는 `.txt` 피드백 문서를 업로드합니다. 서버는 파일명, 크기, UTF-8 텍스트 여부를 검증하고 `FeedbackDocumentParser`로 문서를 typed response 형태로 파싱합니다. 저장은 원문 텍스트와 metadata를 versioned document로 남깁니다.

프런트엔드에는 `/app/feedback/:sessionId/print` route와 browser print 기반 helper가 남아 있지만, 현재 `front/shared/config/readmates-feature-flags.ts`의 `feedbackDocumentPdfDownloadsEnabled`가 `false`라서 사용자는 `PDF로 저장` 또는 자동 print action을 보지 않습니다. 이 기능을 다시 켤 때는 archive, my page, feedback document route, E2E print smoke를 함께 검증합니다.

열람 경계는 다음과 같습니다.

- 호스트는 같은 club의 세션 피드백 문서 상태와 본문을 관리할 수 있습니다.
- 정식 멤버는 본인이 `ATTENDED` 상태인 회차의 피드백 문서만 읽을 수 있습니다.
- 둘러보기 멤버는 피드백 문서를 읽을 수 없습니다.
- 문서가 없거나 권한이 없으면 UI는 locked 또는 unavailable state를 보여야 합니다.

## AI-assisted 콘텐츠 운영

ReadMates 서버와 프론트엔드에는 현재 AI API 호출 경로가 없습니다. 서버와 프론트엔드는 AI API client나 in-app generation path를 갖고 있지 않습니다.

AI-assisted라고 설명하는 부분은 앱 외부 운영 워크플로우입니다. 독서모임 대화에서 나온 피드백, 하이라이트, 한줄평 재료를 외부에서 정리하고, ReadMates는 그 결과물을 세션 기록과 피드백 문서로 저장, 파싱, 권한 검증, 공개합니다.

역할 분담은 다음과 같습니다.

| 단계 | 책임 |
| --- | --- |
| 외부 운영 워크플로우 | 피드백, 하이라이트, 한줄평 재료를 정리하고 Markdown 피드백 문서나 공개 기록 데이터를 준비합니다. |
| ReadMates backend | 문서를 저장하고, 파싱하고, membership/attendance/host 권한을 검증합니다. |
| ReadMates frontend | 공개 기록, 멤버 기록, 피드백 문서를 역할과 상태에 맞게 보여줍니다. |
| Public route/API | 공개로 발행된 기록만 노출합니다. |

따라서 문서에서는 ReadMates가 앱 안에서 AI 콘텐츠를 만들어낸다고 쓰지 않습니다. 정확한 표현은 "외부 워크플로우가 피드백, 하이라이트, 한줄평 자료를 정리하고, ReadMates가 저장, 파싱, 권한 검증, 공개한다"입니다.
