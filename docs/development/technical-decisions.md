> 이 문서의 결정은 ADR로 이관되었습니다. 새 결정은 `docs/development/adr/`에 ADR로 추가합니다.
> 인덱스: [docs/development/adr/README.md](./adr/README.md)

# 주요 기술적 의사결정

반복해서 참고하는 기술 선택과 배경을 모읍니다. 구현 경계는 [architecture.md](architecture.md), 로컬 실행과 운영 변수는 [local-setup.md](local-setup.md)와 [../deploy/README.md](../deploy/README.md)가 기준입니다.

## 결정 문서의 범위

- 현재 코드, 테스트, 배포 문서와 맞는 결정만 적습니다. 과거 계획은 맥락일 뿐 기준이 아닙니다.
- 각 결정은 결정, 이유, trade-off를 함께 남깁니다. 결정을 바꾸면 관련 문서와 검증 명령도 고칩니다.
- 새 결정은 이 문서가 아니라 ADR로 추가합니다.
- 운영 secret, 실제 멤버 데이터, 배포 상태, DB dump, 로컬 절대 경로, OCI OCID는 예시에 넣지 않습니다.
- Cloudflare, OCI, Google, GitHub 같은 외부 서비스의 한도·가격·API 동작은 바뀔 수 있으니 운영 판단 전에 공식 문서로 다시 확인합니다.

## 결정 인덱스

아래 결정은 개별 ADR로 옮겼습니다. 컨텍스트, 근거, 대안, 결과는 각 ADR에 있습니다. 빠진 번호(0011, 0012, 0017~)는 [ADR 인덱스](adr/README.md#adr-후보-follow-up)의 후보입니다.

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
| [ADR-0013](adr/0013-bff-host-header-policy.md) | BFF host header policy | Accepted |
| [ADR-0014](adr/0014-bff-secret-rotation-lifecycle.md) | BFF secret rotation lifecycle | Accepted |
| [ADR-0015](adr/0015-notification-outbox-dedupe-policy.md) | Notification outbox dedupe policy | Accepted |
| [ADR-0016](adr/0016-deploy-ledger-event-schema.md) | Deploy ledger event schema | Accepted |
| [ADR-0072](adr/0072-feedback-document-template-v2.md) | Feedback document template v2 | Accepted |

## 보완 메모 (ADR 이관 예정/적용 외)

아직 별도 ADR이 없는 결정입니다. 나중에 ADR로 옮길 수 있습니다.

---

### BFF secret과 Origin/Referer 검증을 함께 둔다

**결정:** Spring은 `/api/**` 요청에서 `X-Readmates-Bff-Secret`을 검증하고, mutating method인 `POST`, `PUT`, `PATCH`, `DELETE`에는 허용된 `Origin` 또는 `Referer`도 요구합니다.

**이유:** BFF를 통과한 요청과 브라우저에서 발생한 state-changing 요청을 함께 확인하기 위해서입니다. BFF secret은 Cloudflare Pages Functions와 Spring runtime 설정에만 있고, `VITE_` 또는 `NEXT_PUBLIC_` 변수로 만들지 않습니다.

**Trade-off:** preview, local, production 환경마다 secret과 allowed origin 설정을 분리해야 합니다. 설정 누락은 API 실패로 드러나므로 배포 체크리스트와 E2E가 함께 필요합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#bff-보안-경계), [../deploy/README.md](../deploy/README.md#bff-신뢰-경계), `pnpm --dir front test:e2e`

---

### Redis는 optional 보조 계층과 짧은 TTL workflow state로만 사용한다

**결정:** Redis는 기본 비활성화이며, 켜더라도 rate limit counter, auth session metadata cache, public/notes read-through cache, read-cache invalidation, AI generation job handoff/cost counter처럼 짧은 TTL의 보조 상태에만 사용합니다.

**이유:** Redis 장애나 cache 유실이 서비스의 핵심 데이터 손실로 이어지지 않게 하기 위해서입니다. Cache decode 실패 또는 Redis 오류가 발생하면 best-effort 정리 후 MySQL fallback을 사용합니다. AI generation job은 Redis가 transcript/turn/result/evidence handoff와 revision/CAS를 보관하는 workflow state라 Redis 장애 시 commit 전 생성 job은 provider 호출 전에 실패하거나 만료될 수 있습니다. 호스트가 commit한 검토 완료 snapshot과 기존 session/publication/member 데이터는 MySQL에 남아야 합니다.

**Trade-off:** Redis를 켜도 모든 조회가 항상 빨라지는 구조는 아닙니다. Source of truth를 MySQL에 유지하므로 invalidation과 fallback 경로를 함께 테스트해야 합니다. AI generation의 검토 전 콘텐츠는 job-store adapter의 `:transcript`, `:turns`, `:result`, `:evidence` 값에 6시간 TTL로 두고 commit/cancel에서 즉시 정리를 시도합니다. Commit cleanup 실패는 `cleanupPending`으로 재시도하며 TTL이 최종 backstop입니다. Commit한 검토 완료 snapshot만 공통 staged draft에 내구 저장하며 raw transcript/turn/evidence는 저장하지 않습니다. Metadata hash와 Redis key/metric label에는 transcript, 표시 이름, raw session token, 초대 token 원문, BFF secret, OAuth code, private feedback document body, 이메일을 넣지 않습니다.

**관련 문서와 검증:** [architecture.md](architecture.md#optional-redis-계층), [test-guide.md](test-guide.md#redis-backed-server-features), targeted Redis adapter tests

---

### 세션 lifecycle과 공개 범위를 서버에서 확정한다

**결정:** `sessions.state`는 `DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED` 운영 단계를 구분합니다. 공개 범위는 두 축으로 나눕니다. 앱 열람은 `sessions.access_scope`(`HOST_ONLY | GUEST_READABLE`), 공개 사이트 배치는 `public_session_publications.site_visibility`(`HIDDEN | PUBLIC_RECORD`)가 기준입니다. 기존 `sessions.visibility`와 `is_public`은 rolling deploy 호환을 위한 dual-write 컬럼입니다.

**이유:** 예정 세션, 현재 세션, 닫힌 기록, 발행된 공개 기록이 동시에 존재합니다. 상태와 공개 범위를 나눠야 여러 예정 세션을 준비하면서도 클럽당 `OPEN` 세션을 하나로 유지하고, 닫힌 기록을 검토한 뒤 발행할 수 있습니다. 게스트 앱 열람과 공개 사이트 노출도 서로 독립적으로 정할 수 있습니다.

**Trade-off:** route별 조회 조건이 복잡해집니다. 공개 사이트, 게스트 앱, member archive, notes, 예정 세션이 서로 다른 상태·범위 조합을 쓰므로 서버 contract와 frontend 모델을 함께 맞춰야 합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#세션-lifecycle과-공개-범위), `pnpm --dir front test`, `./scripts/server-ci-check.sh`, `./server/gradlew -p server integrationTest`

---

### 역할 기반 권한과 문서 접근 제어를 분리한다

**결정:** `게스트`, `둘러보기 멤버`, `정식 멤버`, `호스트`의 route/API 권한을 나누고, 피드백 문서는 같은 클럽의 active 정식 멤버와 호스트만 읽게 합니다.

**이유:** 초대 없이 로그인한 사용자도 일부 기록은 읽을 수 있지만, 피드백 문서는 공개 기록보다 민감합니다. 그래서 viewer, suspended, inactive 상태에는 열지 않습니다.

**Trade-off:** 같은 화면에서도 read-only, locked, unavailable 상태를 구분해야 합니다. API 권한과 UI guard가 엇갈리면 버튼은 보이는데 서버가 거절하므로 route loader와 server test를 함께 관리합니다.

**관련 문서와 검증:** [architecture.md](architecture.md#멤버십과-역할-모델), [architecture.md](architecture.md#피드백-문서-흐름), `pnpm --dir front test:e2e`

---

### Prometheus metric tag에는 enum/low-cardinality 값만 사용한다

**결정:** Prometheus metric tag 값은 `NotificationEventType`처럼 enum 또는 `pending`/`failed` 같은 고정 문자열만 사용합니다. `club_id`, `user_id`, `membership_id`, `recipient_email`, `event_id`, `delivery_id`, `session_id` 같은 row-level identifier는 tag로 넣지 않습니다.

**이유:** Prometheus는 tag 값 조합마다 time series를 만듭니다. row-level ID를 tag로 쓰면 series 수가 끝없이 늘어 storage를 소진하고 scrape/query가 느려집니다.

**Trade-off:** metric만으로 특정 사용자의 알림 내역은 볼 수 없습니다. row-level 조회는 `notification_deliveries` audit table이나 admin 알림 ledger를 씁니다.

**관련 문서와 검증:** `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt` KDoc 참고

---

### Kafka relay/consumer worker process를 단일 jar로 분리 운영한다

**현재 상태:** web, scheduler, Kafka listener가 한 Spring Boot process에서 함께 뜹니다. 그래서 process가 죽으면 web과 알림 발송이 함께 멈춥니다. 2-service 분리 운영은 아직 하지 않으며 [ADR-0017 후보](adr/README.md#adr-후보-follow-up)로 남아 있습니다.

**준비된 것:** `readmates.notifications.worker.enabled`(`READMATES_NOTIFICATIONS_WORKER_ENABLED`, 기본 `true`)가 `false`면 `notificationWorkerRuntime` bean이 등록되지 않아 relay/backlog scheduler가 뜨지 않습니다. Kafka listener와 relay는 별도로 `readmates.notifications.enabled`와 `readmates.notifications.kafka.enabled`로 켭니다.

**방향과 trade-off:** 같은 jar를 web 인스턴스와 worker 인스턴스로 나눠 띄우면 추가 인프라 비용 없이 장애를 분리할 수 있습니다. 대신 classpath 분리는 없고 bean 등록만 조건부로 건너뜁니다. Gradle multi-module 분리는 인스턴스를 2개 이상 운영할 때 다시 봅니다.

**관련 문서와 검증:** `server/src/main/kotlin/com/readmates/notification/application/config/NotificationWorkerConfiguration.kt`, `NotificationEventRelaySchedulerTest`

---

### IP hash salt를 ISO 주 단위로 회전한다

**결정:** `RateLimitFilter`의 IP 해시는 `ClientIpHashing.hashClientIp`를 통해 `${READMATES_IP_HASH_BASE_SECRET}::${year}-W${week}` 형식의 salt로 생성합니다. salt는 ISO 주차가 바뀔 때마다 자동으로 변경되며, base secret은 환경 변수 `READMATES_IP_HASH_BASE_SECRET`으로 주입합니다. production-like 환경(`spring.profiles.active`가 비어 있거나 `production`을 포함)에서 base secret이 비어 있으면 startup은 실패합니다. local/test 같은 비운영 환경에서도 빈 값은 `readmates.security.ip-hash.allow-empty-secret=true`를 명시한 경우에만 허용되며, 이 경우 WARN을 출력합니다.

**이유:** salt가 정적이면 같은 IP의 요청 패턴이 장기간 누적되어 교차 분석 가능성이 생깁니다. 주 단위 salt 회전으로 cross-week linking을 차단해 IP 해시 공간이 week 경계에서 분리됩니다.

**Trade-off:** token bucket이 주 경계에서 reset되는 의도된 부작용이 있습니다. 율 제한은 단기(분~시간 단위) 정책이므로 실질적인 영향은 없습니다. 토큰·세션 ID 해시에는 여전히 `stableHash`(salt 없음)를 사용해 주 경계 영향을 받지 않습니다.

**관련 문서와 검증:** `./server/gradlew -p server unitTest --tests '*ClientIpHashing*'`

## Transaction Boundary Policy

- **서비스가 소유합니다.** 업무 트랜잭션 경계는 application service가 가집니다. controller는 HTTP를 해석해 use case를 부르고, persistence adapter는 SQL과 mapping만 합니다. 서비스가 쓰기 port를 여럿 조합하면 그 메서드가 트랜잭션을 가져서 상태 변경, cache invalidation, 알림 event 기록이 한 경계를 공유합니다.
- **Adapter `@Transactional`은 예외입니다.** scheduler, Kafka listener처럼 서비스 트랜잭션을 거치지 않는 경로에서 부를 때만 둡니다. 서비스와 adapter 둘 다 붙어 있으면 서비스 경계가 기준이고, 테스트로 동작을 고정한 뒤 adapter 쪽을 좁게 정리합니다.
- **Isolation은 필요한 곳에만 지정합니다.** claim이나 read-modify-write처럼 기본값보다 강한 보장이 필요한 경우만입니다(예: 세션/로그인 복원, 알림 delivery claim). 새로 지정하면 서비스 코드나 결정 기록에 이유를 남깁니다.

검증은 `./scripts/server-ci-check.sh`(detekt, `unitTest`, `architectureTest`)와 필요 시 `./server/gradlew -p server integrationTest`로 합니다.
