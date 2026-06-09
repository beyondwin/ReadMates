# ReadMates — 인프런 Spring 강의 기반 운영 고도화 설계

작성일: 2026-06-09
상태: DRAFT DESIGN SPEC
대상 표면: server, observability docs, performance/release evidence

## 1. 배경

사용자는 인프런의 Spring 관련 강의를 기준으로 ReadMates 프로젝트를 더 개선할 부분을 요청했다.
현재 ReadMates는 단순 CRUD 예제보다 이미 운영형 Spring Boot 서비스에 가깝다.

- Kotlin/Spring Boot, Spring Security OAuth2 Client, JDBC, Flyway, MySQL을 사용한다.
- optional Redis, Redpanda/Kafka, Micrometer/Prometheus, Resilience4j가 서버에 포함되어 있다.
- 서버 feature는 `adapter.in.web -> application -> adapter.out` 경계를 따르고 ArchUnit으로 일부 강제한다.
- query budget, EXPLAIN guard, public release scanner, release-readiness review가 이미 존재한다.

따라서 이 설계의 방향은 "JPA 예제식 리라이트"가 아니다. 인프런 Spring/DB/Boot/OAuth2 강의에서 다루는
운영·DB·보안·동시성 주제를 ReadMates의 실제 구조에 맞춰 적용해, 포트폴리오와 운영 신뢰도를 동시에
높이는 것이다.

## 2. Source Documents

- 서버 가이드: `docs/agents/server.md`
- 문서 가이드: `docs/agents/docs.md`
- 아키텍처 source of truth: `docs/development/architecture.md`
- 테스트 가이드: `docs/development/test-guide.md`
- 운영 관측성 문서: `docs/operations/observability/README.md`
- 릴리스 리스크 기준: `docs/development/release-readiness-review.md`
- 서버 빌드 구성: `server/build.gradle.kts`

외부 참고 강의(2026-06-09 확인):

- 김영한, `스프링 부트 - 핵심 원리와 활용`
- 김영한, `스프링 DB 1편 - 데이터 접근 핵심 원리`
- 김영한, `스프링 DB 2편 - 데이터 접근 활용 기술`
- 김영한, `실전! 스프링 부트와 JPA 활용2 - API 개발과 성능 최적화`
- 김영한, `스프링 MVC 2편 - 백엔드 웹 개발 활용 기술`
- 김영한, `스프링 핵심 원리 - 고급편`
- 김영한, `실전 데이터베이스 - 설계 1편/2편`
- 정수원, `스프링 시큐리티 OAuth2`

## 3. 목표

성공 기준은 "강의에서 본 기술을 추가했다"가 아니다. ReadMates의 현재 운영 표면이 더 잘 측정되고,
DB/API 회귀가 더 빨리 잡히며, 보안/동시성 경계가 문서와 테스트로 설명 가능해야 한다.

- 운영자는 `/admin/health`, Prometheus/Grafana, SLO 문서로 장애 징후를 재현 가능한 방식으로 확인한다.
- 주요 조회 API는 query count, EXPLAIN plan, 대용량 fixture 기준 응답시간 회귀를 함께 방어한다.
- audit/outbox/AI job 같은 운영 데이터는 retention, archival, 통계 집계 기준이 명확하다.
- API 오류 응답은 public-safe shape, trace id, stable error code를 자동 검증한다.
- OAuth/BFF/session 경계는 threat model과 regression test로 설명된다.
- 동시성 민감 흐름은 race test와 트랜잭션/락 정책 문서로 검증된다.

## 4. 선택한 접근

선택한 접근은 **운영 신뢰도 중심의 6개 트랙**이다.

```text
T1 Observability
  -> local Prometheus/Grafana smoke
  -> dashboard/alert/SLO evidence

T2 SQL Performance
  -> synthetic large fixture
  -> query budget + EXPLAIN + p95 guard

T3 Database Lifecycle
  -> retention and archival policy
  -> summary/aggregate strategy

T4 API Error Contract
  -> error catalog
  -> public-safe response tests

T5 Security/OAuth2
  -> return-state/BFF threat model
  -> redirect and secret-rotation tests

T6 Concurrency
  -> outbox/job/manual-dispatch race tests
  -> locking/transaction notes
```

대안은 세 가지였다.

1. **JPA 도입/리라이트**
   - 장점: 인프런 JPA 강의와 연결이 쉽다.
   - 단점: ReadMates의 현재 설계는 JDBC SQL + EXPLAIN guard와 잘 맞고, 리라이트는 운영 리스크가 크다.

2. **새 Spring 기능 추가**
   - 장점: 눈에 보이는 기능이 늘어난다.
   - 단점: 이미 운영 표면이 넓어져 있어 측정/회귀 방어가 먼저다.

3. **운영 신뢰도 고도화**
   - 장점: 현재 코드와 강의 주제를 가장 직접 연결한다.
   - 단점: 사용자-facing 화면 변화가 작을 수 있어 문서와 증거를 잘 남겨야 한다.

이 설계는 3번을 채택한다.

## 5. 범위

### 5.1 T1 Observability

연결 강의:

- `스프링 부트 - 핵심 원리와 활용`

현재 상태:

- Actuator, Micrometer, Prometheus registry가 있다.
- `/admin/health`가 DB, Redis, Kafka, AI provider, outbox, 알림 성공률, deploy attempt 카드를 보여준다.
- `ops/grafana/dashboards/`와 `ops/prometheus/alerts/`에 파일화된 dashboard/rule이 있다.
- 다만 실제 Grafana/Prometheus/Alertmanager 외부 배포 상태는 Git에서 확인하지 않는다고 문서화되어 있다.

설계:

- `docker compose` 또는 별도 ops compose로 로컬 Prometheus/Grafana smoke 환경을 만든다.
- dashboard JSON import smoke를 스크립트화한다.
- alert rule syntax/test를 CI 또는 `pre-push-check --release`의 선택 단계에 연결한다.
- SLO monthly report runbook을 수동 절차에서 "명령으로 evidence 초안 생성" 형태로 개선한다.
- `/admin/health` 카드와 Prometheus alert 이름 사이의 mapping 표를 문서화한다.

Non-goals:

- 실제 운영 provider credential, private domain, real alert receiver를 Git에 기록하지 않는다.
- Grafana Cloud나 특정 외부 SaaS에 종속하지 않는다.

### 5.2 T2 SQL Performance

연결 강의:

- `스프링 DB 1편`
- `스프링 DB 2편`
- `실전! 스프링 부트와 JPA 활용2 - API 개발과 성능 최적화`

현재 상태:

- ReadMates는 JPA보다 JDBC/Flyway/MySQL을 source of truth로 사용한다.
- `ServerQueryBudgetTest`와 `MySqlQueryPlanTest`가 일부 핵심 SQL 회귀를 막는다.
- `docs/development/test-guide.md`는 query budget과 EXPLAIN guard를 변경 표면별로 안내한다.

설계:

- notes/archive/admin analytics/host dashboard 중 high-traffic read path를 3개까지 선정한다.
- 각 path에 public-safe synthetic large fixture를 추가한다.
- guard는 세 층으로 둔다.
  - authenticated request query count budget
  - MySQL EXPLAIN key/access type assertion
  - local integration p95 또는 fixed threshold smoke
- threshold는 "성능 자랑"이 아니라 regression guard로 문서화한다.
- DB index가 추가되면 Flyway migration, EXPLAIN test, release-readiness note를 같은 변경으로 묶는다.

Non-goals:

- JPA로 전환하지 않는다.
- CI에서 flaky micro-benchmark를 hard gate로 바로 올리지 않는다.

### 5.3 T3 Database Lifecycle

연결 강의:

- `실전 데이터베이스 - 설계 1편`
- `실전 데이터베이스 - 설계 2편`

현재 상태:

- notification outbox, delivery, manual dispatch preview, admin notification replay preview, AI generation audit 등 운영 테이블이 많다.
- 공개 안전 때문에 raw email body, transcript, provider raw error, generated result JSON은 노출하지 않는 정책이 있다.

설계:

- 운영 데이터 lifecycle ADR을 작성한다.
- 테이블을 세 부류로 분류한다.
  - source-of-truth ledger
  - replay/preview TTL data
  - aggregate/reporting data
- 각 부류에 retention, archival, masking/hash 유지 기준을 둔다.
- admin analytics가 반복 계산하는 통계는 필요하면 summary table 또는 scheduled aggregate job을 검토한다.
- archival job은 처음부터 Spring Batch 도입을 전제하지 않고, 현재 scheduler/outbox 패턴으로 충분한지 먼저 판단한다.

Non-goals:

- 실제 운영 데이터 삭제 스크립트를 문서 검토 없이 추가하지 않는다.
- migration으로 기존 데이터를 파괴하지 않는다.

### 5.4 T4 API Error Contract

연결 강의:

- `스프링 MVC 2편`

현재 상태:

- API 오류는 `code`, `message`, `status` shape를 기준으로 public-safe하게 정의되어 있다.
- BFF와 Spring API 모두 secret, stack trace, SQL detail, private member data를 노출하지 않아야 한다.

설계:

- 서버 error code catalog를 코드 또는 문서로 정리한다.
- shared error handler와 feature-local handler가 같은 shape를 반환하는지 테스트한다.
- error body에는 trace/request id가 포함되되, internal exception class name이나 upstream detail은 포함하지 않는다.
- 프론트엔드 fixture contract와 서버 error catalog가 drift하지 않게 snapshot 또는 contract test를 추가한다.

Non-goals:

- 사용자-facing copy를 대규모로 바꾸지 않는다.
- 기존 HTTP status 의미를 바꾸지 않는다.

### 5.5 T5 Security/OAuth2

연결 강의:

- `스프링 시큐리티 OAuth2`
- `스프링 MVC 2편`의 cookie/session/filter/interceptor 흐름

현재 상태:

- 로그인은 Google OAuth이고, Pages Functions BFF가 Spring OAuth start/callback을 proxy한다.
- returnTo는 signed return state로 검증한다.
- BFF secret, club context header, allowed origin, active club host가 보안 경계다.

설계:

- OAuth return-state threat model 문서를 작성한다.
- redirect 허용/거부 케이스를 표로 만들고, 테스트 이름과 연결한다.
- BFF secret rotation audit mode의 정상/rotation-only/incident mode smoke를 추가한다.
- club custom domain OAuth return flow는 private domain을 쓰지 않고 placeholder와 fixture로만 설명한다.

Non-goals:

- 운영 OAuth provider 설정값을 Git에 남기지 않는다.
- Spring Security filter chain을 전면 재작성하지 않는다.

### 5.6 T6 Concurrency

연결 강의:

- `스프링 핵심 원리 - 고급편`
- `스프링 DB 1편`의 트랜잭션/예외/커넥션 개념

현재 상태:

- 알림 outbox relay/consumer, 수동 알림 preview/confirm, AI job commit/cancel, Redis job handoff가 동시성 민감 표면이다.
- `RequestIdFilter`는 MDC 기반 request id를 사용한다.

설계:

- race test 후보를 세 개로 제한한다.
  - 같은 manual dispatch preview의 중복 confirm
  - outbox publish 중 Kafka 실패 후 보상 상태
  - AI job commit/cancel 또는 commit/retry 경합
- 각 테스트는 "동시에 실행하면 한쪽만 성공해야 한다"처럼 명확한 invariant를 둔다.
- 트랜잭션 격리, unique key, conditional update, idempotency key 중 어떤 장치가 방어선인지 문서화한다.
- MDC/request id는 async/Kafka/scheduler 경계에서 필요한 범위만 전파하고, ThreadLocal 누수를 테스트한다.

Non-goals:

- 모든 scheduler/consumer를 재설계하지 않는다.
- 분산락을 기본 해법으로 도입하지 않는다.

## 6. 실행 순서

권장 순서:

1. T1 Observability local smoke
2. T2 SQL Performance large-fixture guard
3. T4 API Error Contract catalog
4. T6 Concurrency race tests
5. T3 Database Lifecycle ADR
6. T5 Security/OAuth2 threat model and smoke

이 순서는 빠른 가치와 리스크를 기준으로 한다. Observability와 SQL guard는 현재 구조에 바로 붙일 수 있고,
OAuth/security와 lifecycle은 문서-테스트-운영 정책 정합성이 더 중요해 뒤에 둔다.

## 7. 검증 전략

기본 서버 검증:

```bash
./server/gradlew -p server check
./server/gradlew -p server integrationTest
./server/gradlew -p server architectureTest
```

SQL/performance 변경:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

API/BFF/auth 변경:

```bash
pnpm --dir front test:e2e
```

Docs/release/public-safety 변경:

```bash
git diff --check -- <changed-docs>
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

각 implementation task는 변경 표면에 맞춰 위 검증 중 필요한 최소 세트를 선택한다. 실행하지 못한 검증은
release-readiness note와 최종 보고에 이유를 남긴다.

## 8. 리스크와 완화

| 리스크 | 완화 |
| --- | --- |
| 강의 예제를 프로젝트에 억지 적용 | 현재 architecture/source-of-truth를 우선하고, JPA 리라이트 같은 구조 변경은 non-goal로 둔다 |
| 성능 테스트 flaky | hard gate는 query count/EXPLAIN부터 시작하고, 시간 threshold는 smoke 또는 추세 관찰로 시작한다 |
| Observability 문서가 실제 운영 상태처럼 오해됨 | Git에서 확인 가능한 상태와 운영 콘솔 확인 필요 상태를 명시적으로 분리한다 |
| Retention/archival이 데이터 손실로 이어짐 | 처음에는 ADR과 read-only inventory부터 시작하고, destructive operation은 별도 승인 후 구현한다 |
| 보안 문서에 private domain/secret이 유입됨 | placeholder만 사용하고 public-release scanner를 실행한다 |
| Race test가 느려짐 | 핵심 invariant 3개만 시작하고 integration lane에 명확히 태깅한다 |

## 9. 승인 후 다음 단계

이 설계가 승인되면 implementation plan은 T1/T2를 첫 묶음으로 작성한다.

- Plan A: Observability local smoke + dashboard/alert validation
- Plan B: SQL performance large-fixture guard

T3~T6는 T1/T2 완료 후 별도 plan으로 쪼개는 것이 안전하다.
