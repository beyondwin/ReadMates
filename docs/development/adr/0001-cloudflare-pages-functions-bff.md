# ADR-0001: Cloudflare Pages Functions를 BFF로 채택

- 상태: Accepted
- 결정일: 2026-04-21
- 작성자: 아키텍처/인프라
- 관련: ADR-0005 (BFF shared secret), ADR-0006 (session cookie), ADR-0008 (multi-club domain), ADR-0013 (BFF host header policy), ADR-0014 (BFF secret rotation lifecycle),
  `front/functions/_shared/proxy.ts`, `front/functions/api/bff/[[path]].ts`,
  `front/vite.config.ts`,
  `docs/deploy/cloudflare-pages.md`

## 컨텍스트

ReadMates는 운영 비용 0원 제약에서 시작했다. SPA 정적 호스팅, Spring Boot API 프록시, Google OAuth callback 처리가 모두 *같은 origin*에서 이루어져야 했다. 이 요구사항이 BFF 방식을 채택하게 된 핵심 동력이다.

### 기술 스택 전제

- **프런트엔드**: Vite + React + React Router 7 SPA. 서버 렌더링 없음. 정적 자산 배포.
- **백엔드**: Spring Boot (Kotlin). OCI Always Free Compute에 단일 프로세스로 배포.
- **DB**: OCI MySQL HeatWave Always Free. Spring만 직접 연결. BFF는 DB를 인식하지 않는다.
- **인증**: Google OAuth 2.0. Spring이 callback을 처리하고 `readmates_session` cookie를 발급.

이 스택에서 "BFF 없이 브라우저가 Spring을 직접 호출"하는 모델의 문제점을 결정 이전에 검토했다.

### 쿠키 정책 제약

브라우저의 `SameSite=Lax` 정책에서 cross-site 쿠키는 safe HTTP method(GET, HEAD, OPTIONS)의 top-level navigation에서만 자동으로 전송된다. SPA origin(`https://app.example.com`)과 API origin(`https://api.example.com`)이 다르면 `readmates_session` 쿠키가 API 요청에 자동으로 포함되지 않는다. 이를 해결하려면:
- `SameSite=None; Secure` 설정이 필요하다 — 이는 항상 HTTPS 환경에서만 동작하며 브라우저별 예외 케이스가 존재한다.
- 또는 SPA와 API가 같은 eTLD+1 도메인이어야 한다 — 서브도메인 공유(`app.example.com`/`api.example.com`) 방식인데, Spring CORS + cookie domain 설정이 복잡해진다.

BFF 방식은 SPA와 API 프록시가 *같은 Cloudflare Pages 프로젝트*에 묶이므로, `readmates_session` 쿠키가 자연스럽게 같은 origin으로 발급된다.

### BFF = 보안 경계

단순 reverse proxy가 아니라 BFF가 *보안 경계*로 기능해야 했다. 보안 경계란:
1. Spring API origin이 브라우저에 직접 노출되지 않아야 한다. Spring URL과 BFF secret이 클라이언트 번들에 없어야 한다.
2. BFF만이 신뢰할 수 있는 경로이고, BFF를 통과한 요청만 Spring이 처리해야 한다.
3. upstream 응답에서 내부 헤더가 브라우저로 전달되지 않아야 한다.
4. 클라이언트 IP가 Cloudflare edge IP로 대체되는 문제를 BFF에서 복원해야 한다.

이 네 가지를 담당하는 코드가 `front/functions/_shared/proxy.ts`에 응집된다:
- `stripCookieDomain` (`proxy.ts:7`): `Set-Cookie`의 `domain=` 속성 제거 — BFF origin에 맞는 쿠키 재발급
- `copyUpstreamHeaders` (`proxy.ts:11`): upstream 응답 헤더 필터링 — `x-readmates-*` 내부 헤더 브라우저 차단
- `normalizedHostFromRequest` (`proxy.ts:34`): 요청 host 정규화 — club context 결정에 사용
- `clientIpFromRequest` (`proxy.ts:39`): `CF-Connecting-IP` → `X-Forwarded-For` 우선순위로 실제 클라이언트 IP 복원

### BFF secret 분리

BFF(`front/functions/_shared/proxy.ts:57-68`)는 `READMATES_BFF_SECRETS` (rotation candidates)와 `READMATES_BFF_SECRET` (legacy primary) 두 환경 변수를 읽어 outgoing 요청의 `X-Readmates-Bff-Secret` 헤더를 채운다. 이 값들은 Cloudflare Pages 환경 변수로만 관리된다. 클라이언트 번들에 `VITE_` 또는 `NEXT_PUBLIC_` prefix로 노출되지 않는다.

### multi-club 헤더 처리

BFF(`front/functions/api/bff/[[path]].ts`)는 모든 요청에 `X-Readmates-Club-Host`를 전달하고, API request에 `clubSlug` query가 있을 때 정규화된 `X-Readmates-Club-Slug`도 Spring으로 전달한다. Spring은 이 헤더를 BFF를 통과한 신뢰 가능한 값으로만 처리하므로, 브라우저가 직접 보낸 같은 이름의 헤더는 BFF에서 제거된다.

### 로컬 dev 설계

로컬 개발에서는 Vite proxy(`front/vite.config.ts`)가 BFF 없이 동일한 경로 패턴을 Spring으로 포워딩한다. 브라우저가 임의로 보낸 club context 헤더는 제거하고, shared fallback 경로의 `clubSlug` query에서 정규화된 `X-Readmates-Club-Slug`만 다시 주입한다. Custom domain의 `X-Readmates-Club-Host` 주입은 production BFF와 서버 테스트가 검증하고, Spring은 ADR-0013에 따라 host fallback miss를 source-aware하게 처리한다.

### BFF route 구조

Cloudflare Pages의 파일 기반 라우팅을 사용한다. `front/functions/` 디렉토리 구조:

```
front/functions/
  _shared/
    proxy.ts                 — 보안 헬퍼 함수 (stripCookieDomain, copyUpstreamHeaders, ...)
    security/                — club-slug 유효성 검증 등
  api/
    bff/
      [[path]].ts            — catch-all API 프록시 (BFF secret + club context 헤더 주입)
  login/
    oauth2/
      code/
        [[provider]].ts      — OAuth callback 처리 프록시
  oauth2/
    authorization/
      [[provider]].ts        — OAuth authorization redirect 프록시
```

이 구조가 Pages의 라우팅 규칙을 그대로 따라 `front/functions/api/bff/[[path]].ts`가 `/api/bff/**` 모든 경로를 처리한다. OAuth 관련 경로는 별도 function 파일로 분리되어 기능별 책임이 명확하다.

## 결정

Cloudflare Pages + Pages Functions를 BFF로 채택한다. SPA 정적 호스팅과 edge function이 한 Cloudflare Pages 프로젝트에 묶여 같은 origin을 공유한다. Spring Boot API 서버는 별도 origin(`https://api.example.com` 형식의 OCI Compute 주소)으로 운영되며, BFF Pages Function만이 해당 서버를 직접 호출한다. 브라우저는 Spring API를 인식하지 않고, 모든 `/api/bff/**`, `/oauth2/**`, `/login/oauth2/**` 요청은 BFF를 통해서만 처리된다.

핵심 BFF 코드는 두 파일에 위치한다:
- `front/functions/_shared/proxy.ts` — 재사용 가능한 보안 헬퍼 함수들 (`stripCookieDomain`, `copyUpstreamHeaders`, `normalizedHostFromRequest`, `clientIpFromRequest`, `bffSecretFromEnv`)
- `front/functions/api/bff/[[path]].ts` — catch-all 라우팅 및 club context 헤더 주입

`front/functions/api/bff/[[path]].ts`는 Cloudflare Pages의 catch-all 파일 기반 라우팅을 사용한다. `[[path]]`가 `/api/bff/` 하위의 모든 경로를 매칭한다. OAuth callback path(`/login/oauth2/code/**`, `/oauth2/**`)는 별도 `front/functions/` 파일로 처리한다.

모든 BFF outgoing request에는 `X-Readmates-Bff-Secret` 헤더가 포함된다. Spring의 `BffSecretFilter`가 이 헤더로 요청이 BFF를 통과했는지 검증한다. 브라우저가 Spring API를 직접 호출해도 BFF secret 없이는 처리되지 않는다.

## 근거

### 보안 룰 단일 응집

BFF의 핵심 보안 동작 네 가지가 `front/functions/_shared/proxy.ts`에 집중된다. 신규 엔지니어가 "BFF가 왜 필요한가"를 파일 한 개를 읽는 것만으로 이해할 수 있다. 기능이 nginx.conf, Spring SecurityConfig, 환경 변수 문서 등 여러 곳에 분산되지 않는다.

`proxy.ts:7` (`stripCookieDomain`): Spring upstream이 `Set-Cookie: readmates_session=...; Domain=api.example.com` 형식으로 응답해도, BFF가 `Domain=` 속성을 제거해 BFF origin(`readmates.pages.dev`)에 쿠키가 올바르게 설정된다.

`proxy.ts:11` (`copyUpstreamHeaders`): `set-cookie` 헤더를 재처리하면서 `x-readmates-*` 내부 응답 헤더가 브라우저로 노출되지 않도록 필터링한다. Spring이 디버깅 목적으로 추가한 내부 헤더가 production에서 브라우저에 보이지 않는다.

`proxy.ts:39` (`clientIpFromRequest`): Cloudflare edge를 통과하는 모든 요청은 Spring 입장에서 Cloudflare edge IP에서 오는 것처럼 보인다. Cloudflare는 실제 클라이언트 IP를 `CF-Connecting-IP` 헤더에 담아 전달한다. BFF가 이 값을 Spring의 rate limit용 X-Forwarded-For로 변환한다.

`proxy.ts:34` (`normalizedHostFromRequest`): 요청 host를 정규화해 `X-Readmates-Club-Host` 헤더로 Spring에 전달한다. custom domain(`https://club-a.example.com`)에서 오는 요청의 club context 결정에 사용된다.

### 비용 요건 충족

Cloudflare Pages Free plan에서 정적 자산 배포(월 무제한 빌드, 글로벌 CDN)와 Pages Functions 실행(일 100,000 요청)이 무료다. Spring API는 OCI Always Free Compute에 배포되므로 추가 DB/컴퓨팅 비용이 없다. 자체 nginx/Caddy를 운영하면 OCI에 추가 instance가 필요하거나 이미 운영 중인 서버에 메모리를 추가로 사용해야 한다.

### OAuth callback 처리의 origin 단일화

Google OAuth 등록 시 `redirect_uri`의 origin을 지정한다. SPA origin이 BFF origin과 같으므로, Google OAuth redirect_uri를 BFF Pages origin 하나로 등록할 수 있다. Spring이 OAuth callback을 처리하더라도 공개 origin이 될 필요가 없다. BFF가 `/login/oauth2/code/**` path를 Spring으로 프록시해 처리한다.

### 무중단 secret 회전 가능

BFF secret을 회전할 때 BFF와 Spring 양쪽을 원자적으로 업데이트할 수 없다. 단일 secret이면 교체 중 짧은 다운타임이 발생한다. `READMATES_BFF_SECRETS` (rotation candidates list, `proxy.ts:57`)와 `READMATES_BFF_SECRET` (legacy, `proxy.ts:58`)을 함께 지원해 Spring이 두 값을 모두 허용하는 상태에서 BFF rollout을 수행하면 무중단 회전이 가능하다. (상세: ADR-0005)

### BFF가 처리하지 않는 것 — 명시적 경계

BFF의 책임 범위를 명확히 해 over-engineering을 방지한다:

- **인증 결정을 내리지 않는다**: BFF는 `readmates_session` 쿠키를 Strip/forward하지만, "이 세션이 유효한가"는 Spring이 결정한다. BFF는 stateless 검증이 없다.
- **비즈니스 로직이 없다**: club membership 확인, 세션 상태 전이, 알림 발송은 Spring 책임이다. BFF는 이 로직을 갖지 않는다.
- **DB를 직접 읽지 않는다**: `club_domains` 조회 등 데이터 접근이 필요한 모든 결정은 Spring에 위임한다. BFF가 직접 MySQL에 접근하지 않는다.
- **응답을 변환하지 않는다**: Spring이 반환한 JSON을 그대로 브라우저에 전달한다. BFF 레벨에서 응답 데이터를 변환하거나 필터링하지 않는다.

이 경계 덕분에 BFF 코드가 단순하게 유지된다.

### BFF 코드 테스트 가능성

Pages Functions 코드가 순수한 TypeScript(Web API 의존)로 작성되어 Vitest에서 단위 테스트가 가능하다. Node.js 테스트 환경에서 `Request`, `Response`, `Headers` API를 mock해 `stripCookieDomain`, `copyUpstreamHeaders`, `clientIpFromRequest`의 동작을 검증한다:

- `front/tests/unit/cloudflare-bff.test.ts` — BFF 헤더 처리, secret 검증, cookie domain strip 검증
- `front/tests/unit/cloudflare-oauth-proxy.test.ts` — OAuth callback 프록시 흐름 검증

실제 Cloudflare edge 환경에서만 테스트 가능한 격리된 구현과 달리, Web API 표준 인터페이스 기반이어서 CI에서 완전히 검증된다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| nginx/Caddy self-host (동일 OCI 서버) | OCI Always Free에서 추가 nginx 프로세스는 메모리와 관리 부담을 추가한다. Spring 프로세스가 이미 하나다. 두 프로세스 간 cookie forwarding과 헤더 처리가 nginx.conf에 분산된다. CI/CD에서 nginx 설정 배포 파이프라인이 추가로 필요하다. |
| Cloudflare Workers (별도 worker 프로젝트) | Pages와 Workers는 별도 Cloudflare 프로젝트다. SPA 정적 자산은 Pages, API 프록시는 Workers에 두면 두 프로젝트의 배포를 동기화해야 한다. 배포 원자성이 없고, Workers의 origin은 `workers.dev` 도메인이 되어 SPA origin과 달라진다. 쿠키 domain 문제가 해결되지 않는다. |
| Direct browser → Spring API (no BFF) | Spring API가 공개 origin이 된다. BFF secret이 없으므로 요청 출처 신뢰가 불가능하다. 모든 요청이 동등하게 취급된다. `readmates_session` 쿠키는 `SameSite=None; Secure`가 필요해 third-party cookie 제한 브라우저에서 문제가 생긴다. Spring이 OAuth redirect URI를 직접 처리해야 해 공개 노출이 불가피하다. |
| Next.js Route Handlers (서버 컴포넌트) | React Router 7 SPA에서 Next.js SSR로의 전환이다. 번들 크기, hydration 전략, 라우팅 모델, 빌드 파이프라인이 전면 교체된다. BFF 문제 하나를 해결하기 위해 전체 프레임워크를 바꾸는 것은 과잉이다. |
| Express / Hono on Cloudflare Workers | node:server 런타임이 필요하거나 edge-compatible API를 직접 구현해야 한다. Pages Functions가 이미 edge runtime(web-compatible API)을 제공하므로 추가 서버 레이어가 불필요하다. 별도 서버를 Cloudflare 외에 운영하면 비용 제약에 위배된다. |

## 결과

긍정적:
- BFF 보안 룰이 `front/functions/_shared/proxy.ts` 한 파일에 응집된다. 신규 엔지니어가 BFF가 무엇을 하는지 단일 파일로 파악할 수 있다.
- dev/prod 동작 차이가 BFF 코드(`front/functions/`)에만 집중된다. Vite proxy가 동일 경로를 모사하므로 비즈니스 로직 개발 시 BFF 구현 세부사항을 몰라도 된다.
- Spring이 새 secret 후보를 먼저 허용한 뒤 BFF primary를 전환하면 secret 회전을 무중단으로 처리할 수 있다. BFF primary 전환은 Cloudflare Pages 환경 변수 변경으로 끝나지만, Spring 후보 목록을 추가하거나 제거할 때는 서버 런타임 설정 갱신이 필요하다.
- Cloudflare CDN이 정적 자산을 전 세계 edge에서 서빙한다. 추가 CDN 설정 없음.
- Pages Functions의 배포가 SPA 빌드와 같은 CI 파이프라인에서 처리된다. GitHub Actions `deploy-front.yml`이 단일 파이프라인으로 처리한다.
- Google OAuth redirect_uri가 단일 BFF origin으로 집중된다. Spring이 공개 노출되지 않는다.
- BFF 코드가 Web API 표준에만 의존해 단위 테스트 가능성이 높다. Cloudflare 전용 API 없이 `Request`/`Response`/`Headers`만 사용하므로 Node.js test 환경에서 완전히 검증된다.

부정적/감수한 비용:
- Cloudflare Pages Functions는 요청당 CPU time 제한이 있다(Free plan: 10ms, Paid: 50ms). 복잡한 BFF 로직(JWT 검증, 암호화, 무거운 데이터 변환)을 추가하면 한계에 도달할 수 있다. 현재 BFF 로직은 헤더 처리와 프록시에 집중해 CPU time이 최소화된다.
- Pages Function 번들 크기 제한이 있다. 대형 npm 패키지를 BFF에 추가하는 것이 제약된다. 현재 BFF는 외부 npm 패키지 의존 없이 Web API만 사용한다.
- 멀티 region이 필요해지거나 고성능 edge 처리(캐시 invalidation, A/B testing, edge auth)가 필요해지면 Cloudflare Workers + Pages 분리 또는 다른 플랫폼으로 재평가가 필요하다.
- BFF를 통과하는 요청마다 Cloudflare edge → OCI Spring 서버 왕복이 발생한다. latency는 edge와 서버의 물리적 거리에 따라 달라진다. OCI 한국 리전과 Cloudflare 한국 edge 간 latency는 수ms 수준이나, 지역별로 다를 수 있다.
- Cloudflare Pages 플랫폼 변경(API deprecation, 가격 변경, Pages Functions 정책 변경)에 종속된다.

## 검증

단위 테스트:
```bash
pnpm --dir front test
```
- `front/tests/unit/cloudflare-bff.test.ts` — BFF Pages Function의 헤더 처리, BFF secret 검증, `stripCookieDomain` 동작, club context 헤더 주입 검증
- `front/tests/unit/cloudflare-oauth-proxy.test.ts` — OAuth callback 프록시 흐름, redirect URI 처리 검증

smoke 테스트:
```bash
./scripts/smoke-production-integrations.sh
```
운영 BFF 응답 형태(상태 코드, 헤더 구조, cookie strip 여부) 점검.

BFF 보안 경계 검증:
- `X-Readmates-Bff-Secret` 헤더 없이 Spring `/api/**`를 직접 호출 → 401 반환 확인 (`readmates.bff-secret-required=true` 환경에서)
- BFF를 통한 동일 요청 → 200 반환 확인
- BFF secret rotation 중 구/신 secret 모두 허용되는지 확인

dev/prod 동작 일치 검증:
- 로컬에서 Vite proxy를 통한 API 호출과 production BFF를 통한 동일 호출이 같은 응답 shape을 반환하는지 확인
- shared fallback route의 slug context는 로컬 Vite proxy와 production BFF가 같은 방식으로 정규화되는지 확인
- custom domain host context는 production BFF의 host 헤더 주입과 Spring의 ADR-0013 fallback-miss 처리가 함께 동작하는지 확인

## 후속 작업

- BFF host 헤더 정책은 ADR-0013에서 server-side safety net으로 확정됐다. BFF는 custom domain host를 Spring에 전달하고, Spring은 shared fallback host miss를 club context supplied 상태로 오해하지 않도록 source-aware하게 해석한다.
- Cloudflare Workers 기반 별도 BFF 분리: SPA와 BFF 사이의 배포 결합을 해소하고 싶다면 Workers migration 검토. Pages와 Workers를 같은 Cloudflare 프로젝트에서 관리하는 방법도 있다.
- BFF 요청 로깅: 현재 edge에서 요청 수준 로깅이 없다. Cloudflare Analytics Engine 또는 Logpush를 통해 BFF 요청 메트릭(endpoint별 응답 코드, latency)을 수집하면 운영 가시성이 높아진다.
- BFF 캐싱 정책 확장: 현재 공개 API 응답(`/api/public/**`)에만 `caches.default`를 사용한다. 다른 endpoint로 캐싱을 확장할 때 cache key 정책(club context 포함 여부 등)을 ADR로 결정한다.
- Pages Functions 배포 원자성: SPA 빌드와 Pages Function 코드가 같은 배포 단위다. SPA 빌드 성공 후 Pages Function 배포 실패 시 partial 배포 상태가 된다. 배포 rollback 시나리오와 health check 절차 문서화 필요.
- `X-Readmates-Bff-Secret` 헤더 값을 IP hash 기반으로 request별 differentiate하는 방안 검토: 동일 secret을 모든 요청에 재사용하면 secret 노출 시 모든 요청이 위험하다. per-request HMAC 방식이 보안을 강화하지만 BFF CPU time 증가를 수반한다.
- BFF E2E 테스트 전략: 현재 `cloudflare-bff.test.ts`가 단위 수준 검증을 담당한다. Pages Functions의 실제 edge 환경 동작은 `pnpm test:e2e`의 Playwright 시나리오로 커버된다. E2E에서 BFF-specific 시나리오(secret 오류, cookie strip 동작, club context 헤더 전달)를 별도 테스트 케이스로 분리 검토.
- BFF 모니터링 대시보드: Cloudflare Pages Functions의 실행 시간, 오류율, 요청 수를 Cloudflare Dashboard 또는 Logpush로 수집해 BFF 레벨의 가시성 확보. Spring application metric(Prometheus)과 별개로 edge 레벨 메트릭이 필요하다.
