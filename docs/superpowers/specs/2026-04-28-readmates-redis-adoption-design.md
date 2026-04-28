# ReadMates Redis 도입 설계

작성일: 2026-04-28
상태: DRAFT DESIGN SPEC
문서 목적: ReadMates 서버에 Redis를 도입할 근거가 있는 기능 범위, 데이터 책임, 장애 fallback, 무효화 전략, 테스트 범위를 정의한다.

## 1. 배경

ReadMates 서버는 Kotlin/Spring Boot API와 MySQL/Flyway를 중심으로 동작한다. 브라우저 요청은 Cloudflare Pages Functions 또는 로컬 Vite proxy의 `/api/bff/**`를 거쳐 Spring `/api/**`로 전달되고, Spring은 `X-Readmates-Bff-Secret`, session cookie, membership status, role, attendance를 권한 경계로 본다.

현재 인증 세션은 `readmates_session` cookie의 raw token을 서버에서 hash한 뒤 MySQL `auth_sessions`에서 조회한다. 유효한 세션이면 `last_seen_at`을 갱신하고, 이후 `userId`로 현재 membership/role을 복원한다. 이 흐름은 인증이 필요한 대부분의 API 요청이 지나는 공통 hot path다.

공개 API와 notes feed는 개인화가 적거나 club/session 단위로 반복 조회되는 읽기 API다. 특히 `/api/public/club`, `/api/public/sessions/{sessionId}`, `/api/notes/feed`, `/api/notes/sessions`는 join/subquery가 많고, 발행/visibility/노트 변경처럼 무효화 조건이 비교적 명확하다.

반면 로그인/OAuth, 초대 preview, host mutation, feedback upload에는 요청 빈도 제한 계층이 없다. BFF secret과 Origin/Referer 검사는 출처 경계를 지키지만, 짧은 시간의 반복 요청이나 token probing, 업로드 남용을 제한하지는 않는다.

## 2. 목표

- Redis를 MySQL의 대체 저장소가 아니라 optional acceleration/protection layer로 도입한다.
- Rate limit으로 OAuth/login, invitation preview, host mutation, feedback upload를 보호한다.
- Auth session hot-path cache로 `readmates_session` 검증 시 반복 MySQL 조회와 `last_seen_at` 갱신 빈도를 줄인다.
- Public/notes read-through cache로 공개 클럽, 공개 세션, notes feed의 반복 읽기 비용을 줄인다.
- Redis 장애, timeout, JSON decode 실패가 기존 MySQL 기반 동작을 깨지 않게 한다.
- 각 Redis 기능은 독립 feature flag로 켜고 끌 수 있게 한다.
- Redis 도입 효과와 장애 fallback을 운영 지표로 확인할 수 있게 한다.

## 3. 비목표

- Redis를 auth session의 단독 source of truth로 만들지 않는다.
- Spring Session Redis로 전환하지 않는다.
- 초대 토큰과 초대 상태를 Redis-only로 저장하지 않는다.
- 피드백 문서 본문을 Redis에 캐시하지 않는다.
- queue, notification, distributed lock을 이번 범위에 포함하지 않는다.
- MySQL schema를 Redis 도입만을 위해 크게 재설계하지 않는다.
- 멤버십, role, attendance, public visibility 정책을 바꾸지 않는다.

## 4. 핵심 결정

Redis는 세 가지 기능에만 쓴다.

| 기능 | Redis 역할 | 최종 권위 | 기본 장애 정책 |
| --- | --- | --- | --- |
| Rate limit | TTL counter | 서버 정책 | fail-open |
| Auth session hot-path cache | 짧은 TTL session snapshot, touch throttle | MySQL `auth_sessions` | MySQL fallback |
| Public/notes read-through cache | JSON response/result cache | MySQL query result | MySQL fallback |

Redis에 저장한 값은 모두 재생성 가능해야 한다. Redis flush, key eviction, connection failure가 발생해도 사용자가 로그아웃되거나 데이터가 사라진 것처럼 보이면 안 된다.

Auth session은 계속 MySQL `auth_sessions`가 source of truth다. Redis는 `tokenHash -> session snapshot`을 짧은 TTL로 저장해 반복 조회를 줄인다. 로그아웃과 `revokeAllForUser`는 MySQL revoke를 먼저 수행하고 Redis key를 best-effort로 지운다.

Public/notes cache는 public-safe 응답 또는 application result만 캐시한다. 권한이 섞이는 member-specific API는 이번 범위에서 제외한다. Notes feed는 club/session 단위로 같은 멤버 권한 그룹에서 공유 가능한 공개/멤버 공개 기록만 다루므로 캐시 후보에 포함한다.

## 5. 설정

Redis는 기본 비활성화 상태로 시작한다.

```yaml
readmates:
  redis:
    enabled: ${READMATES_REDIS_ENABLED:false}
    url: ${READMATES_REDIS_URL:}
    command-timeout: ${READMATES_REDIS_COMMAND_TIMEOUT:250ms}
  rate-limit:
    enabled: ${READMATES_RATE_LIMIT_ENABLED:false}
    fail-closed-sensitive: ${READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE:false}
  auth-session-cache:
    enabled: ${READMATES_AUTH_SESSION_CACHE_ENABLED:false}
    session-ttl: ${READMATES_AUTH_SESSION_CACHE_TTL:10m}
    touch-throttle-ttl: ${READMATES_AUTH_SESSION_TOUCH_THROTTLE_TTL:5m}
  public-cache:
    enabled: ${READMATES_PUBLIC_CACHE_ENABLED:false}
    club-ttl: ${READMATES_PUBLIC_CLUB_CACHE_TTL:15m}
    session-ttl: ${READMATES_PUBLIC_SESSION_CACHE_TTL:15m}
  notes-cache:
    enabled: ${READMATES_NOTES_CACHE_ENABLED:false}
    feed-ttl: ${READMATES_NOTES_FEED_CACHE_TTL:3m}
```

`READMATES_REDIS_ENABLED=false`이면 Redis bean과 adapter는 no-op 또는 fallback adapter로 동작한다. 기존 서버 테스트와 로컬 실행은 Redis 없이 통과해야 한다.

로컬 개발용 `compose.yml`에는 Redis service를 추가할 수 있다. 다만 서버 기본 설정은 Redis disabled이므로 MySQL만 띄운 기존 개발 흐름을 유지한다.

## 6. 서버 구조

기존 feature-local clean architecture 방향을 유지한다.

```text
adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.redis
```

권장 패키지:

```text
com.readmates.shared.cache
  CacheJsonCodec
  RedisCacheProperties
  RedisFallbackMetrics

com.readmates.auth.application.port.out
  AuthSessionCachePort
  RateLimitPort

com.readmates.auth.adapter.out.redis
  RedisAuthSessionCacheAdapter
  RedisRateLimitAdapter
  NoopAuthSessionCacheAdapter
  NoopRateLimitAdapter

com.readmates.publication.application.port.out
  PublicReadCachePort

com.readmates.publication.adapter.out.redis
  RedisPublicReadCacheAdapter
  NoopPublicReadCacheAdapter

com.readmates.note.application.port.out
  NotesReadCachePort

com.readmates.note.adapter.out.redis
  RedisNotesReadCacheAdapter
  NoopNotesReadCacheAdapter
```

Controller는 Redis를 직접 주입받지 않는다. Rate limit만 요청 metadata가 필요하므로 `OncePerRequestFilter` 또는 Spring `HandlerInterceptor` 형태의 web boundary adapter에서 처리한다. 그 filter/interceptor는 `RateLimitPort`를 호출하고, 정책 계산은 application 또는 auth security boundary에 둔다.

## 7. Rate Limit 설계

### 7.1 대상

1차 적용 대상:

- `GET /oauth2/authorization/**`
- `GET /login/oauth2/code/**`
- `GET /api/invitations/{token}`
- `POST /api/invitations/{token}/accept`
- `POST /api/host/invitations`
- `POST /api/host/invitations/{invitationId}/revoke`
- `/api/host/**` mutating request
- `POST /api/host/sessions/{sessionId}/feedback-document`

운영 password/password-reset route는 disabled path이므로 abuse 방어 관점에서 rate limit filter가 막아도 되지만, 이 설계의 제품 목표에는 포함하지 않는다.

### 7.2 Key와 Window

권장 key:

```text
rl:ip:{ipHash}:oauth-start:{window}
rl:ip:{ipHash}:oauth-callback:{window}
rl:ip:{ipHash}:invite-preview:{tokenHashPrefix}:{window}
rl:ip:{ipHash}:invite-accept:{tokenHashPrefix}:{window}
rl:user:{membershipId}:host-mutation:{window}
rl:user:{membershipId}:feedback-upload:{sessionId}:{window}
```

IP와 token은 원문을 저장하지 않고 hash 또는 짧은 hash prefix를 쓴다. `tokenHashPrefix`는 관측성과 privacy의 균형을 위해 8~12 hex 문자만 사용한다.

정책 예시:

| 대상 | 기준 | Window | Limit |
| --- | --- | --- | --- |
| OAuth start | IP | 1분 | 20 |
| OAuth callback | IP | 1분 | 30 |
| Invitation preview | IP + token prefix | 10분 | 30 |
| Invitation accept | IP + token prefix | 10분 | 10 |
| Host mutation | membership | 1분 | 60 |
| Feedback upload | membership + session | 10분 | 10 |

정확한 수치는 구현 전 테스트 fixture와 운영 로그를 보고 조정 가능하도록 config로 둔다.

### 7.3 응답과 장애 정책

Limit 초과 시 `429 Too Many Requests`를 반환한다. 응답 body는 기존 API error shape와 맞추되, token 원문이나 내부 key를 노출하지 않는다.

Redis 장애 또는 timeout이면 기본 fail-open이다. `READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE=true`일 때만 invitation accept와 feedback upload 같은 민감 작업을 fail-closed로 바꿀 수 있다.

## 8. Auth Session Hot-Path Cache 설계

### 8.1 현재 흐름

현재 흐름:

```text
readmates_session cookie
  -> token hash
  -> MySQL auth_sessions 조회
  -> last_seen_at update
  -> userId로 CurrentMember 복원
```

### 8.2 변경 흐름

Redis enabled + auth session cache enabled일 때:

```text
readmates_session cookie
  -> token hash
  -> Redis auth:session:{tokenHash} 조회
     -> hit: session snapshot 사용
     -> miss: MySQL auth_sessions 조회 후 Redis 저장
  -> touch throttle key 확인
     -> 최근 touch 없음: MySQL last_seen_at update, throttle key 저장
     -> 최근 touch 있음: update 생략
  -> userId로 CurrentMember 복원
```

Redis key:

```text
auth:session:{tokenHash}
auth:last-seen-touch:{tokenHash}
auth:user-sessions:{userId}
```

`auth:session:{tokenHash}` value:

```json
{
  "schemaVersion": 1,
  "sessionId": "uuid",
  "userId": "uuid",
  "expiresAt": "2026-05-12T00:00:00Z"
}
```

`auth:user-sessions:{userId}`는 `revokeAllForUser` best-effort eviction을 위한 set이다. 이 set이 유실되어도 correctness가 깨지면 안 되므로 `auth:session` TTL은 짧게 유지한다.

### 8.3 TTL

- `auth:session:{tokenHash}`: 기본 10분, 단 실제 `expiresAt`을 넘지 않게 설정한다.
- `auth:last-seen-touch:{tokenHash}`: 기본 5분.
- `auth:user-sessions:{userId}`: session cache TTL보다 약간 길게 설정하거나 session key 저장 시 함께 갱신한다.

### 8.4 무효화

- `issueSession`: MySQL insert 후 Redis cache를 optional warm한다.
- `findValidSession`: cache miss에서만 MySQL 조회한다. MySQL에서 revoked/expired면 Redis에 저장하지 않는다.
- `revokeSession`: MySQL `revoked_at` update 후 `auth:session:{tokenHash}`와 `auth:last-seen-touch:{tokenHash}` 삭제.
- `revokeAllForUser`: MySQL revoke 후 `auth:user-sessions:{userId}`에 있는 session key를 삭제한다. set이 없거나 삭제 실패하면 짧은 TTL로 수렴한다.

Membership/role 변경은 `CurrentMember` snapshot을 auth session cache에 넣지 않는 것으로 해결한다. Redis에는 `userId`와 session metadata만 저장하고, membership/role은 기존 resolver가 MySQL에서 조회한다. 따라서 role 변경 직후 권한 판단이 오래 stale되지 않는다.

## 9. Public/Notes Read-Through Cache 설계

### 9.1 대상

Public cache:

- `GET /api/public/club`
- `GET /api/public/sessions/{sessionId}`

Notes cache:

- `GET /api/notes/feed`
- `GET /api/notes/feed?sessionId={sessionId}`
- `GET /api/notes/sessions`

Archive, current session, host dashboard, feedback document body는 이번 범위에서 제외한다. 개인화와 최신성 요구가 더 크기 때문이다.

### 9.2 Key와 TTL

```text
public:club:v1
public:session:{sessionId}:v1
notes:club:{clubId}:feed:v1
notes:club:{clubId}:session:{sessionId}:feed:v1
notes:club:{clubId}:sessions:v1
```

TTL:

- public club: 15분
- public session: 15분
- notes feed: 3분
- notes sessions: 3분

Public cache는 외부 공개 데이터만 포함한다. Notes cache는 `sessions.visibility in ('MEMBER', 'PUBLIC')`와 `sessions.state = 'PUBLISHED'` 조건을 만족하는 member-visible feed만 포함한다.

### 9.3 무효화

Public cache eviction:

- host session 생성/수정/삭제
- session visibility 변경
- publication 저장
- session publish
- public summary 변경
- public-visible highlight/one-line review/long review 변경

Notes cache eviction:

- question 저장
- one-line review 저장
- long review 저장
- highlight 변경
- session visibility 변경
- session publish/delete
- participant active 상태 변경으로 feed 노출 대상이 바뀌는 경우

정확성을 위해 v1 구현은 관련 command service 성공 이후 broad eviction을 선택한다. 예를 들어 club 단위 notes key를 모두 삭제해도 된다. 캐시 키를 촘촘히 추적하는 최적화는 지표를 본 뒤 한다.

### 9.4 JSON Decode 실패

Redis에서 읽은 JSON을 decode하지 못하면 해당 key를 삭제하고 MySQL fallback으로 응답한다. decode 실패는 warn 로그와 metric으로 남긴다.

## 10. 데이터와 보안

Redis에는 raw session token, raw invitation token, BFF secret, OAuth code, private feedback document body를 저장하지 않는다.

저장 가능한 값:

- hash된 rate limit 식별자
- token hash 기반 auth session key
- userId/sessionId/expiresAt 같은 session metadata
- public API 응답
- notes feed 응답

Redis key와 metric label에는 이메일, 표시 이름, 초대 token 원문, private domain을 넣지 않는다.

## 11. 관측 지표

최소 지표:

- `readmates.redis.operation.errors`
- `readmates.redis.fallbacks`
- `readmates.rate_limit.allowed`
- `readmates.rate_limit.denied`
- `readmates.auth_session_cache.hit`
- `readmates.auth_session_cache.miss`
- `readmates.auth_session_cache.evicted`
- `readmates.auth_session_touch.skipped`
- `readmates.public_cache.hit`
- `readmates.public_cache.miss`
- `readmates.public_cache.evicted`
- `readmates.notes_cache.hit`
- `readmates.notes_cache.miss`
- `readmates.notes_cache.evicted`

로그는 Redis 장애를 진단할 수 있게 남기되, 반복 장애가 API 로그를 압도하지 않도록 rate-limited logging을 사용한다.

## 12. 테스트 전략

서버 단위 테스트:

- Redis disabled 기본값에서 기존 테스트가 통과한다.
- Rate limit no-op adapter는 요청을 막지 않는다.
- Rate limit Redis adapter는 limit 초과 시 deny를 반환한다.
- Redis 장애 시 fail-open/fail-closed 설정이 의도대로 동작한다.
- Auth session cache hit에서는 `findValidByTokenHash` MySQL 조회를 생략한다.
- Auth session cache miss에서는 MySQL 조회 후 cache write를 시도한다.
- Logout은 MySQL revoke 후 session cache key를 삭제한다.
- `revokeAllForUser`는 user session index 기반 best-effort eviction을 수행한다.
- touch throttle key가 있으면 `last_seen_at` update를 생략한다.
- Public/notes cache decode 실패 시 key 삭제 후 MySQL fallback한다.
- Public/notes mutation 성공 후 관련 cache eviction이 호출된다.

통합 테스트:

- Redis Testcontainers를 사용해 TTL counter, session cache TTL, JSON round-trip을 검증한다.
- Redis가 꺼진 상태에서 서버가 기동하고 health가 fatal로 실패하지 않는다.
- `/api/public/club`, `/api/public/sessions/{sessionId}`, `/api/notes/feed`는 cache hit/miss 모두 같은 응답을 반환한다.

검증 명령:

```bash
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Redis 변경은 server/auth/API boundary에 걸리므로 서버 테스트가 기본이다. Rate limit이 OAuth/BFF 사용자 흐름에 영향을 줄 수 있어 end-to-end smoke도 포함한다.

## 13. 구현 순서

한 번의 Redis 도입 작업에 세 기능을 모두 포함하되, 기능별 flag로 독립 배포 가능하게 한다.

1. Redis dependency, properties, no-op adapter, local compose Redis, health/metrics 기반을 추가한다.
2. Rate limit filter/interceptor와 Redis counter adapter를 추가한다.
3. Auth session cache port와 adapter를 추가하고 `AuthSessionService`에 cache/fallback/touch throttle을 붙인다.
4. Public read-through cache port와 adapter를 `PublicQueryService` 또는 outbound query adapter 주변에 붙인다.
5. Notes read-through cache port와 adapter를 `NotesFeedService` 주변에 붙인다.
6. Host/session/note mutation 성공 경로에서 broad cache eviction을 호출한다.
7. Redis enabled/disabled 양쪽 테스트와 E2E smoke를 실행한다.

## 14. Rollout

배포 후 기능 flag는 다음 순서로 켠다.

1. `READMATES_REDIS_ENABLED=true`
2. `READMATES_RATE_LIMIT_ENABLED=true`
3. `READMATES_AUTH_SESSION_CACHE_ENABLED=true`
4. `READMATES_PUBLIC_CACHE_ENABLED=true`
5. `READMATES_NOTES_CACHE_ENABLED=true`

문제가 생기면 해당 기능 flag만 끈다. Redis 자체 장애가 반복되면 `READMATES_REDIS_ENABLED=false`로 돌려 MySQL-only 동작으로 복귀한다.

## 15. 남는 리스크

- Rate limit 수치가 너무 낮으면 정상 host 작업이나 OAuth 재시도를 막을 수 있다. 초기 limit은 보수적으로 높게 잡고 지표를 보며 낮춘다.
- Auth session cache의 `revokeAllForUser` eviction은 user session index가 유실되면 즉시 삭제하지 못할 수 있다. 짧은 session cache TTL로 수렴시키고, MySQL revoke가 최종 권위가 되게 한다.
- Notes cache eviction을 빠뜨리면 feed가 몇 분 동안 stale할 수 있다. v1은 broad eviction으로 정확성을 우선한다.
- Redis timeout이 길면 fallback이 있어도 API latency가 늘 수 있다. command timeout은 짧게 유지한다.
