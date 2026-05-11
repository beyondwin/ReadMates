> 이 문서의 결정은 ADR로 이관되었습니다. 새 결정은 `docs/development/adr/`에 ADR로 추가합니다.
> 인덱스: [docs/development/adr/README.md](./adr/README.md)

# 주요 기술적 의사결정

이 문서는 ReadMates의 현재 구조에서 반복해서 참고해야 하는 기술 선택과 그 배경을 정리합니다. 상세 구현 경계는 [architecture.md](architecture.md)를, 로컬 실행과 운영 변수는 [local-setup.md](local-setup.md)와 [../deploy/README.md](../deploy/README.md)를 기준으로 합니다.

## 결정 문서의 범위

- 현재 코드, 테스트, 배포 문서와 맞는 결정만 기록합니다.
- 과거 계획 문서의 맥락은 참고할 수 있지만 현재 동작의 기준으로 삼지 않습니다.
- 운영 secret, 실제 멤버 데이터, private deployment state, DB dump, 로컬 절대 경로, OCI OCID는 예시에 넣지 않습니다.
- 각 결정은 "무엇을 선택했는가", "왜 선택했는가", "어떤 trade-off를 감수했는가"를 함께 남깁니다.
- 새 결정을 추가하거나 기존 결정을 바꾸면 관련 문서와 검증 명령도 함께 갱신합니다.
- Cloudflare, OCI, Google, GitHub처럼 외부 서비스의 한도, 가격, UI, API 동작은 바뀔 수 있으므로 운영 판단 전에 현재 공식 문서나 콘솔에서 재확인합니다.

## 결정 인덱스

아래 결정들은 `docs/development/adr/`에 개별 ADR로 이관되었습니다. 상세 컨텍스트, 근거, 대안, 결과는 각 ADR을 참고합니다.

| ADR | 제목 | 상태 |
|-----|------|------|
| [ADR-0001](adr/0001-cloudflare-pages-functions-bff.md) | Cloudflare Pages Functions BFF | Accepted |
| [ADR-0002](adr/0002-server-clean-architecture-with-archunit.md) | Server clean architecture + ArchUnit | Accepted |
| [ADR-0003](adr/0003-frontend-route-first-architecture.md) | Frontend route-first architecture | Accepted |
| [ADR-0004](adr/0004-transactional-outbox-with-kafka-relay.md) | Transactional outbox + Kafka relay | Accepted |
| [ADR-0005](adr/0005-bff-shared-secret-with-rotation.md) | BFF shared secret + rotation | Accepted |
| [ADR-0006](adr/0006-server-side-hashed-session-cookie.md) | Server-side hashed session cookie | Accepted |
| [ADR-0007](adr/0007-mysql-with-flyway-over-alternatives.md) | MySQL + Flyway | Accepted |
| [ADR-0008](adr/0008-multi-club-domain-with-host-resolution.md) | Multi-club domain with host resolution | Accepted |
| [ADR-0009](adr/0009-frontend-backend-contract-via-zod.md) | Frontend-backend contract via Zod | Accepted |
| [ADR-0010](adr/0010-public-repo-safety-automation.md) | Public repo safety automation | Accepted |

## 보완 메모 (ADR 이관 예정/적용 외)

아래 결정들은 현재 ADR 0001~0010에 포함되지 않은 사항입니다. 향후 별도 ADR로 이관 예정이거나 현재 산문 수준의 컨텍스트로 보존됩니다.

---

### BFF secret과 Origin/Referer 검증을 함께 둔다

**결정:** Spring은 `/api/**` 요청에서 `X-Readmates-Bff-Secret`을 검증하고, mutating method인 `POST`, `PUT`, `PATCH`, `DELETE`에는 허용된 `Origin` 또는 `Referer`도 요구합니다.

**이유:** BFF를 통과한 요청과 브라우저에서 발생한 state-changing 요청을 함께 확인하기 위해서입니다. BFF secret은 Cloudflare Pages Functions와 Spring runtime 설정에만 있고, `VITE_` 또는 `NEXT_PUBLIC_` 변수로 만들지 않습니다.

**Trade-off:** preview, local, production 환경마다 secret과 allowed origin 설정을 분리해야 합니다. 설정 누락은 API 실패로 드러나므로 배포 체크리스트와 E2E가 함께 필요합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#bff-보안-경계), [../deploy/README.md](../deploy/README.md#bff-신뢰-경계), `pnpm --dir front test:e2e`

---

### Redis는 optional 보조 계층으로만 사용한다

**결정:** Redis는 기본 비활성화이며, 켜더라도 rate limit counter, auth session metadata cache, public/notes read-through cache, read-cache invalidation에만 사용합니다.

**이유:** Redis 장애나 cache 유실이 서비스의 핵심 데이터 손실로 이어지지 않게 하기 위해서입니다. Cache decode 실패 또는 Redis 오류가 발생하면 best-effort 정리 후 MySQL fallback을 사용합니다.

**Trade-off:** Redis를 켜도 모든 조회가 항상 빨라지는 구조는 아닙니다. Source of truth를 MySQL에 유지하므로 invalidation과 fallback 경로를 함께 테스트해야 합니다. Redis key와 metric label에는 raw session token, 초대 token 원문, BFF secret, OAuth code, private feedback document body, 이메일, 표시 이름을 넣지 않습니다.

**관련 문서와 검증:** [architecture.md](architecture.md#optional-redis-계층), [test-guide.md](test-guide.md#redis-backed-server-features), targeted Redis adapter tests

---

### 세션 lifecycle과 공개 범위를 서버에서 확정한다

**결정:** `sessions.state`는 `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED` 운영 단계를 구분하고, `sessions.visibility`는 `HOST_ONLY`, `MEMBER`, `PUBLIC` 공개 범위의 DB source of truth입니다.

**이유:** 정기 독서모임 운영에는 예정 세션, 현재 참여 세션, 닫힌 기록, 발행된 공개 기록이 동시에 존재합니다. 상태와 공개 범위를 분리해야 호스트가 여러 예정 세션을 준비하면서도 클럽당 하나의 현재 `OPEN` 세션만 유지하고, 닫힌 기록을 검토한 뒤 발행할 수 있습니다.

**Trade-off:** route별 조회 조건이 복잡해집니다. Public surface, member archive, notes feed, upcoming sessions가 각각 다른 상태와 공개 범위를 사용하므로 서버 contract와 프론트엔드 모델을 같이 맞춰야 합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#세션-lifecycle과-공개-범위), `pnpm --dir front test`, `./server/gradlew -p server clean test`

---

### 역할 기반 권한과 문서 접근 제어를 분리한다

**결정:** `게스트`, `둘러보기 멤버`, `정식 멤버`, `호스트`의 route/API 권한을 분리하고, 피드백 문서는 참석 여부와 host 권한을 별도로 검증합니다.

**이유:** 초대 없이 Google로 로그인한 사용자는 일부 멤버 공개 정보를 읽을 수 있지만 쓰기와 참석자 전용 문서 열람은 제한되어야 합니다. 피드백 문서는 공개 기록보다 민감하므로 membership status만으로 열지 않고 참석 상태를 확인합니다.

**Trade-off:** 같은 화면에서도 read-only, locked, unavailable state를 구분해야 합니다. API authorization과 UI guard가 엇갈리면 사용자는 버튼을 보지만 서버에서 거절당하는 경험을 하므로 route loader와 server test를 함께 관리합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#멤버십과-역할-모델), [architecture.md](architecture.md#피드백-문서-흐름), `pnpm --dir front test:e2e`

---

### Prometheus metric tag에는 enum/low-cardinality 값만 사용한다

**결정:** Prometheus metric tag 값은 `NotificationEventType`처럼 enum 또는 `pending`/`failed` 같은 고정 문자열만 사용합니다. `club_id`, `user_id`, `membership_id`, `recipient_email`, `event_id`, `delivery_id`, `session_id` 같은 row-level identifier는 tag로 넣지 않습니다.

**이유:** Prometheus는 tag 값 조합마다 별도 time series를 만듭니다. row-level ID를 tag로 사용하면 운영 데이터가 늘어날수록 time series 수가 무한히 증가해 무료 Prometheus storage를 빠르게 소진하고, scrape/query 지연을 일으킵니다.

**Trade-off:** metric만으로 "특정 사용자의 알림 전송 내역"을 Grafana에서 직접 조회할 수 없습니다. row-level 조회가 필요하면 `notification_deliveries` audit table에 JOIN 쿼리를 사용하거나, Grafana table panel에 DB datasource를 직접 연결합니다.

**관련 문서와 검증:** `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt` KDoc 참고

---

### Kafka relay/consumer worker process를 단일 jar로 분리 운영한다

**결정:** 현재 single Spring Boot process에서 web + scheduler + Kafka listener가 함께
boot하므로, process 1개 죽으면 web과 notification 발송이 함께 정지한다.
`readmates.notifications.worker.enabled=false/true` flag를 두고 systemd service를
2개(web replica, worker instance)로 분리하면 infra cost 없이 failure isolation이 가능하다.

**이유:** 단일 jar 재사용으로 infra cost 0. Gradle multi-module 분리(선택지 B)는
2 instance 이상 운영하게 됐을 때 재검토한다.

**Trade-off:** web replica와 worker instance가 같은 jar를 쓰므로 classpath isolation은
없다. Kafka listener class는 web instance에서도 로드된다
(`@ConditionalOnProperty`로 bean만 skip).

**관련 문서와 검증:** v1 TASK-075 보강. `readmates.notifications.worker.enabled=false`로
boot 시 Kafka listener bean이 등록되지 않는지 log 확인.

---

### IP hash salt를 ISO 주 단위로 회전한다

**결정:** `RateLimitFilter`의 IP 해시는 `ClientIpHashing.hashClientIp`를 통해 `${READMATES_IP_HASH_BASE_SECRET}::${year}-W${week}` 형식의 salt로 생성합니다. salt는 ISO 주차가 바뀔 때마다 자동으로 변경되며, base secret은 환경 변수 `READMATES_IP_HASH_BASE_SECRET`으로 주입합니다. 미설정 시 빈 문자열 fallback을 사용해 filter는 동작하지만, 운영 환경에서는 반드시 설정해야 합니다.

**이유:** salt가 정적이면 같은 IP의 요청 패턴이 장기간 누적되어 교차 분석 가능성이 생깁니다. 주 단위 salt 회전으로 cross-week linking을 차단해 IP 해시 공간이 week 경계에서 분리됩니다.

**Trade-off:** token bucket이 주 경계에서 reset되는 의도된 부작용이 있습니다. 율 제한은 단기(분~시간 단위) 정책이므로 실질적인 영향은 없습니다. 토큰·세션 ID 해시에는 여전히 `stableHash`(salt 없음)를 사용해 주 경계 영향을 받지 않습니다.

**관련 문서와 검증:** `./server/gradlew -p server test --tests '*ClientIpHashing*'`
