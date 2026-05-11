# Case Study 01 — BFF 보안 경계와 무중단 secret rotation

> Cloudflare Pages Functions를 단순 프록시가 아니라 보안 경계로 운영했습니다. cookie domain strip, 내부 추적 헤더 차단, client IP 정규화를 `_shared/proxy.ts` 단일 헬퍼에 응집시켰고, BFF↔Spring 신뢰는 multi-secret(primary + rotation candidates) + audit table로 무중단 회전이 가능하게 만들었습니다. 결과적으로 운영 중 secret 회전이 환경 변수 교체 → Cloudflare 배포 → Spring 배포 순서의 절차로 정리되었고, 모든 회전 이력이 `bff_secret_rotation_audit` 테이블에 alias(`primary`/`secondary`/`index_N`) 단위로 기록됩니다.

## 문제

**운영 환경 구성**

운영 사이트(`https://readmates.pages.dev`)는 SPA와 edge function이 같은 도메인에서 서빙됩니다. Spring API origin은 별도 호스트이며, 모든 브라우저 요청은 `browser → Cloudflare Pages Function(BFF) → Spring API` 흐름을 통과합니다.

**단순 프록시의 위험**

BFF가 upstream 응답을 그대로 클라이언트에 전달하면 다음 세 가지 문제가 생깁니다.

- **Set-Cookie Domain 노출**: Spring이 `Set-Cookie: ...; Domain=spring-internal-host`를 내보내면 그대로 클라이언트에 도달합니다. frontend origin(`readmates.pages.dev`)과 다른 도메인에 cookie가 붙어 cross-origin 노출 또는 오작동이 생깁니다.
- **내부 추적 헤더 노출**: BFF가 upstream에 전송하는 `x-readmates-bff-secret`, `x-readmates-client-ip`, `x-readmates-club-host`, `x-readmates-club-slug` 헤더가 응답 경로에서 클라이언트로 새면 운영 디버그 정보가 외부에 드러납니다.
- **IP 정규화 누락**: Cloudflare는 `CF-Connecting-IP`에 실제 클라이언트 IP를 담지만, Spring은 `X-Forwarded-For`를 기대합니다. 변환 없이 `X-Forwarded-For`를 그대로 신뢰하면 스푸핑 가능성이 있습니다.

**secret 회전의 비자명함**

single secret으로 BFF→Spring 신뢰를 검증할 때, secret을 교체하려면 BFF 환경 변수와 Spring 환경 변수를 동시에 반영해야 합니다. 두 배포 사이의 짧은 시간 동안 BFF는 새 secret을, Spring은 구 secret을 기대하는 상태가 됩니다. 이 race를 닫으려면 multi-secret이 필요하고, 어떤 alias가 실제 사용되고 있는지 감사 로그가 필요합니다.

**제약**

- Cloudflare Pages Functions — client cert 설정 불가, zero-cost 제약.
- 공개 저장소 — secret value는 코드에 없고, 환경 변수 명칭만 드러납니다.
- 1인 운영 — 회전 절차가 복잡하면 실제로 하지 않게 됩니다.

## 접근

| 대안 | 기각 이유 |
|------|----------|
| BFF를 단순 fetch passthrough로 | cookie domain strip, 헤더 차단, IP 정규화가 전부 누락됩니다. 새 기여자가 무심코 우회 가능. |
| 보안 룰을 각 route function에 분산 | 4~5개 route에서 drift. 한 룰이 빠져도 운영 전에는 보이지 않습니다. |
| mTLS로 BFF↔Spring | Cloudflare Pages Functions에서 client cert 관리 부담. zero-cost 제약 위반. |
| JWT signed by edge | 자체 서명·검증 부담 + revoke 비용. 현재 규모에 과잉. |
| single secret (환경 변수 1개) | 회전 시 두 환경의 동시 배포 필요. 짧은 다운타임 불가피. |

**선택: `_shared/proxy.ts` 단일 헬퍼 응집 + multi-secret rotation**

핵심 통찰은 두 가지입니다. 첫째, 보안 규칙을 응집하면 route별 drift가 구조적으로 불가능해집니다. 둘째, Spring이 모든 secret candidates를 동시에 받아들이는 동안 BFF는 primary를 전송하므로, 두 배포의 순서가 상관없어집니다.

## 구현

### cookie strip과 내부 헤더 차단

`copyUpstreamHeaders`는 upstream 응답 헤더 전체를 복사한 뒤, 내부 전용 헤더를 명시적으로 제거하고 `Set-Cookie`를 domain-stripped 버전으로 재부착합니다.

```typescript
// front/functions/_shared/proxy.ts

export function stripCookieDomain(rawSetCookie: string): string {
  return rawSetCookie.replace(/;\s*Domain=[^;]*/i, "");
}

export function copyUpstreamHeaders(headers: Headers) {
  const copiedHeaders = new Headers(headers);
  copiedHeaders.delete("set-cookie");
  copiedHeaders.delete("x-readmates-bff-secret");
  copiedHeaders.delete("x-readmates-client-ip");
  copiedHeaders.delete("x-readmates-club-host");
  copiedHeaders.delete("x-readmates-club-slug");

  const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    copiedHeaders.append("set-cookie", stripCookieDomain(cookie));
  }

  if (setCookies.length === 0) {
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      copiedHeaders.append("set-cookie", stripCookieDomain(setCookie));
    }
  }

  return copiedHeaders;
}
```

헤더 삭제를 `startsWith("x-readmates-")` 패턴이 아니라 **명시 열거**로 구현한 것은 의도적입니다. 새 내부 헤더를 추가할 때 코드 변경이 필요하므로, 누락이 PR 리뷰 단계에서 가시화됩니다.

### client IP 정규화

```typescript
// front/functions/_shared/proxy.ts — clientIpFromRequest

export function clientIpFromRequest(request: Request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) {
    return cloudflareIp.slice(0, MAX_CLIENT_IP_LENGTH);
  }

  const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, MAX_CLIENT_IP_LENGTH) : null;
}
```

Cloudflare 환경에서 `CF-Connecting-IP`가 우선이며, 로컬 dev 환경에서는 `X-Forwarded-For` fallback을 씁니다.

### BFF 요청 헤더 조합

`front/functions/api/bff/[[path]].ts:151-158`에서 club context 헤더와 BFF secret을 upstream으로 전송합니다.

```typescript
// front/functions/api/bff/[[path]].ts (발췌)

headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(context.request));
if (clubSlug) {
  headers.set("X-Readmates-Club-Slug", clubSlug);
}

const bffSecret = bffSecretFromEnv(context.env);
if (bffSecret) {
  headers.set("X-Readmates-Bff-Secret", bffSecret);
}
```

`bffSecretFromEnv`는 `READMATES_BFF_SECRETS`(comma-separated, primary first)에서 첫 번째 non-empty 값을 꺼냅니다. 구 환경 변수(`READMATES_BFF_SECRET`)는 fallback으로 지원합니다.

### Spring 측 secret 검증 — BffSecretFilter

```kotlin
// server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt

private fun matchesAny(provided: String, candidates: List<String>): Boolean {
    val providedBytes = provided.toByteArray(StandardCharsets.UTF_8)
    var matched = false
    for (candidate in candidates) {
        val candidateBytes = candidate.toByteArray(StandardCharsets.UTF_8)
        if (MessageDigest.isEqual(providedBytes, candidateBytes)) {
            matched = true
            // no early return — iterate all for timing uniformity
        }
    }
    return matched
}
```

`MessageDigest.isEqual`은 길이가 같으면 상수 시간 비교를 수행합니다. 그리고 매칭이 성공한 뒤에도 `break` 없이 **모든 candidates를 끝까지 순회**합니다(`// no early return — iterate all for timing uniformity` 주석). 이는 timing side-channel으로 어느 index의 secret이 유효한지 추론하지 못하게 하는 구현입니다. alias 매핑(primary/secondary/index_N)과 audit 로깅은 `aliasFor`가 담당하며, `matchesAny`는 순수 timing-uniform 통과/차단 판정만 수행합니다.

매칭이 성공하면 `auditAsync`가 비동기로 `bff_secret_rotation_audit`에 row를 기록합니다.

### audit table (V26)

```sql
-- server/src/main/resources/db/mysql/migration/V26__bff_secret_rotation_audit.sql

create table bff_secret_rotation_audit (
  id bigint unsigned not null auto_increment primary key,
  secret_alias varchar(64) not null,   -- "primary" | "secondary" | "index_N"
  used_at datetime(6) not null,
  client_ip_hash char(64),             -- hashed, not raw
  request_path varchar(255),
  index bff_secret_rotation_audit_alias_used_at_idx (secret_alias, used_at)
);
```

`secret_alias`가 `primary`/`secondary` 형태로 저장되므로 secret 값이 DB에 기록되지 않습니다. `client_ip_hash`는 raw IP가 아닌 해시값이어서 개인정보 처리에 안전합니다.

rotation 진행 상황은 alias 분포로 확인합니다: `secondary` 사용 비율이 0으로 수렴하면 구 secret의 traffic이 사라진 것입니다.

## 검증

**단위 테스트**

- `front/tests/unit/cloudflare-bff.test.ts` — BFF 프록시 동작, 헤더 정책, secret 전송 검증.
- `front/tests/unit/proxy-bff-secret.test.ts` — `bffSecretFromEnv` 함수의 primary/fallback 선택 로직 검증.
- `front/tests/unit/cloudflare-oauth-proxy.test.ts` — OAuth proxy 경로의 헤더 정책 검증.
- `server/.../BffSecretFilterTest.kt`, `BffSecretFilterAuditTest.kt`, `BffSecretFilterUnitTest.kt`, `BffSecretFilterDynamicOriginTest.kt` — Spring 측 filter 동작 전체 커버.

**통합 smoke**

`scripts/smoke-production-integrations.sh`가 운영 환경을 대상으로 BFF 응답 모양과 헤더 정책을 점검합니다.

**운영 감사**

`bff_secret_rotation_audit` row count와 `secret_alias` 분포를 통해 회전 이력을 추적합니다. 특정 alias가 더 이상 사용되지 않으면 해당 secret을 환경 변수에서 제거해도 안전합니다.

## Trade-off와 한계

- **단일 헬퍼 = 단일 장애점**: BFF 룰이 `_shared/proxy.ts` 하나에 모이는 만큼, 이 헬퍼의 회귀가 *모든 API 호출에 동시에* 영향을 줍니다. 단위 테스트 비중이 높아야 하는 이유입니다.
- **두 환경 변수 동기화**: multi-secret은 `READMATES_BFF_SECRETS`를 Cloudflare 환경 변수와 Spring 배포 환경 모두에서 관리해야 합니다. 이 동기화 책임을 runbook으로 명문화하지 않으면 1인 운영 환경에서 실수 가능성이 있습니다.
- **헤더 명시 열거의 유지 비용**: `copyUpstreamHeaders`가 삭제 대상 헤더를 명시 열거하므로, 새 내부 헤더를 추가할 때 이 함수도 함께 수정해야 합니다. prefix 필터(`startsWith`)보다 유지 비용이 다소 높지만, 감사 가능성은 더 높습니다.
- **shared fallback에서의 host 헤더**: `readmates.pages.dev`(shared fallback 호스트)가 항상 `X-Readmates-Club-Host`로 전송됩니다. 이 호스트는 `club_domains` 테이블에 없어 DB lookup이 miss됩니다. Case 03의 incident(`current-session refresh`)가 이 흐름에서 발생했습니다.

## 다시 한다면

- **자동 90일 주기 rotation**: 현재는 수동 트리거입니다. 90일 주기 rotation을 자동화하면 운영자가 secret 만료를 인지하지 못해 방치하는 위험이 없어집니다.
- **server-side contract test**: 현재 "BFF가 어떤 헤더를 전송하는가"는 frontend 단위 테스트로만 검증됩니다. Spring 측에서도 "BFF가 준다고 약속한 헤더를 받고 있는가"를 검증하는 계약 테스트가 있으면, BFF와 Spring 양쪽의 변경이 서로를 모르게 어긋나는 상황을 조기에 잡을 수 있습니다.
- **shared fallback에서 host 헤더 미전송**: `readmates.pages.dev`에서 요청이 올 때 `X-Readmates-Club-Host`를 생략하는 정책이 더 안전합니다 (case 03과 연동). 이 변경은 별도 ADR 후보입니다.

## 관련

- ADR-0001 — Cloudflare Pages Functions BFF 채택 (`docs/development/adr/0001-cloudflare-pages-functions-bff.md`)
- ADR-0005 — BFF shared secret + multi-secret rotation (`docs/development/adr/0005-bff-shared-secret-rotation.md`)
- ADR-0006 — Server-side hashed session cookie (`docs/development/adr/0006-server-side-hashed-session-cookie.md`)
- Spec: [`docs/superpowers/specs/2026-04-21-readmates-cloudflare-spa-google-auth-migration-design.md`](../superpowers/specs/2026-04-21-readmates-cloudflare-spa-google-auth-migration-design.md)
