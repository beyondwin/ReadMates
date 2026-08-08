# ReadMates 백엔드 품질 고도화 설계

작성일: 2026-08-09
상태: APPROVED DESIGN SPEC
구현 상태: 시작 전
대상 표면: `server/`, 서버 검증 스크립트, 관련 개발 문서

## 1. 배경

ReadMates 백엔드는 Kotlin/Spring Boot, JDBC, Flyway, MySQL을 중심으로 구성된 단일 모듈 서비스다.
기능별로 `adapter.in -> application -> adapter.out` 방향을 따르는 핵사고날 구조를 채택하고,
ArchUnit, Testcontainers, 쿼리 예산, MySQL EXPLAIN, 관측성 스모크를 통해 주요 회귀를 방어한다.

2026-08-09 기준의 저장소 점검에서는 `architectureTest`와 `./scripts/server-ci-check.sh`가 모두
통과했다. 이는 현재 기준선이 깨지지 않았다는 증거지만, 다음 사각지대까지 자동으로 보장하지는 않는다.

- 일부 서버 슬라이스와 web 외 인바운드 어댑터가 아키텍처 규칙의 전체 적용 대상이 아니다.
- 기능 간 순환 의존과 어댑터/구체 서비스 직접 참조가 일부 존재한다.
- Spring Security principal, 기능 도메인 역할, 개인정보가 하나의 current-user 모델을 통해
  애플리케이션 계층으로 넓게 전파된다.
- 관리자 헬스 조회는 논리적 provider timeout을 반환하지만, 실제 HTTP 작업의 종료와 실행기 포화까지
  함께 통제하지는 않는다.
- 정적 분석 baseline과 커버리지 최소선이 현재 품질 수준보다 느슨해 품질 하락을 늦게 감지한다.
- 이미 기준 브랜치에 포함된 Flyway versioned migration의 수정이나 삭제를 PR 단계에서 차단하는
  불변성 검사가 없다.

따라서 이 설계는 핵사고날 아키텍처를 다시 작성하지 않는다. 현재 구조가 실제 장애 격리, 변경 영향
축소, 테스트 결정성으로 이어지도록 품질 기준과 의존 경계를 단계적으로 강화한다.

## 2. 근거와 source of truth

이 문서는 다음 저장소 자료와 현재 코드를 기준으로 한다.

- 서버 가이드: `docs/agents/server.md`
- 공통 실행 계약: `docs/agents/execution.md`
- 문서 가이드: `docs/agents/docs.md`
- 아키텍처: `docs/development/architecture.md`
- 서버 구조 ADR: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- 수용 기준 선택: `docs/development/acceptance-matrix.md`
- 서버 경계 테스트: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- 서버 빌드·품질 게이트: `server/build.gradle.kts`
- 관리자 헬스 조회:
  - `server/src/main/kotlin/com/readmates/admin/health/application/service/PlatformAdminHealthService.kt`
  - `server/src/main/kotlin/com/readmates/admin/health/adapter/out/prometheus/HttpPrometheusQueryAdapter.kt`
  - `server/src/main/kotlin/com/readmates/admin/health/config/PlatformAdminHealthConfig.kt`
- 보안 actor 경계:
  - `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
  - `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- 마이그레이션 검증: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

현재 측정값은 구현 시점의 fresh run으로 다시 고정한다. 이 문서에 기록한 수치는 설계 우선순위와
초기 gate를 정하기 위한 2026-08-09 기준값이다.

## 3. 목표

이 프로그램의 완료 상태는 다음과 같다.

1. 현재 품질보다 낮아지는 변경을 CI가 즉시 차단한다.
2. 외부 시스템 지연, 실행기 포화, 중복 실행, 오래된 상태를 서버가 제한된 범위 안에서 처리한다.
3. 이미 배포된 Flyway migration의 불변성을 코드 리뷰 이전에 검사한다.
4. 인바운드 어댑터, 애플리케이션, 아웃바운드 어댑터의 의존 방향을 ArchUnit이 실제 패키지 전반에서
   강제한다.
5. 기능 간 알려진 순환 의존을 제거하고 새 순환을 만들 수 없게 한다.
6. Spring Security principal과 개인정보가 유스케이스에 불필요하게 전파되지 않는다.
7. 각 변경이 집중 테스트, 통합 테스트, 운영 메트릭 중 적절한 증거로 설명된다.

## 4. 비목표

- 서버를 멀티모듈로 전환하지 않는다.
- JDBC를 JPA로 교체하지 않는다.
- Spring의 `@Service`, `@Transactional` 사용을 애플리케이션 계층에서 전부 제거하지 않는다.
- 모든 대형 파일을 길이만 기준으로 분해하지 않는다.
- DTO나 설정 클래스에 의미 없는 테스트를 추가해 전역 커버리지 숫자만 높이지 않는다.
- 기존 API 응답, HTTP 상태, 권한 의미, 데이터 소유권을 암묵적으로 바꾸지 않는다.
- 이 작업만으로 실제 운영 배포나 live AI provider 호출, 실제 이메일 발송을 수행하지 않는다.

## 5. 선택한 접근

선택한 접근은 다음 세 단계를 순서대로 수행하는 통합 프로그램이다.

```text
Phase 0: Quality Ratchet
  -> 기존 품질 하락을 먼저 차단

Phase 1: Operational and Data Reliability
  -> 외부 장애, 자원 포화, 중복 실행, migration 변조를 격리

Phase 2: Hexagonal Boundary Refinement
  -> actor, port, feature dependency 방향을 정리
```

이 순서는 의도적이다. Phase 0의 회귀 감지 없이 Phase 2부터 수행하면 대규모 이동 중 동작 회귀를
놓치기 쉽다. 반대로 경계 정리만 미루면 운영 보강 코드가 현재의 잘못된 의존을 더 굳힐 수 있다.
따라서 Phase 0으로 기준을 고정하고, Phase 1의 가장 높은 운영 리스크를 닫은 뒤, Phase 2를 작은
수직 슬라이스로 진행한다.

## 6. 공통 설계 원칙

### 6.1 동작과 구조를 함께 검증한다

파일 이동만으로 완료로 보지 않는다. 경계 변경에는 ArchUnit 규칙을, 장애 격리에는 실패·회복
테스트와 메트릭을, 데이터 변경에는 실제 MySQL 통합 테스트를 함께 둔다.

### 6.2 기존 강점을 대체하지 않는다

현재의 Testcontainers, query budget, EXPLAIN guard, Prometheus/Grafana 스모크는 유지한다. 새 검증은
기존 증거가 다루지 못하는 실패 모드에만 추가한다.

### 6.3 예외는 숨기지 않고 소멸시킨다

즉시 제거할 수 없는 기존 경계 위반은 이름, 이유, 제거 단계가 있는 명시적 allowlist로 고정한다.
새 위반은 허용하지 않으며 Phase 2가 끝날 때 임시 예외는 0건이어야 한다.

### 6.4 공통화보다 소유권을 우선한다

두 기능이 같은 타입을 사용한다는 이유만으로 `shared`로 이동하지 않는다. 데이터와 정책의
수명주기를 소유하는 기능을 먼저 정하고, 소비자는 자신의 포트를 통해 필요한 capability만 요청한다.

### 6.5 한 변경은 한 실패 경계를 닫는다

각 구현 단위는 하나의 운영 실패, 하나의 의존 위반군, 또는 하나의 기능 순환을 닫는다. 서로 다른
리스크를 하나의 대규모 커밋으로 섞지 않는다.

## 7. Phase 0 — 품질 기준선 강화

Phase 0은 런타임 기능을 바꾸지 않고 이후 단계의 회귀 감지 능력을 높인다.

### 7.1 프로덕션 컴파일 경고 0건

설계 점검 시 프로덕션 Kotlin 컴파일은 deprecated Jackson/Spring API, 불필요한 null 처리, 사용되지
않는 표현식 등을 포함해 약 29건의 경고를 출력했다.

- 각 경고를 원인에 맞게 수정하고 광범위한 suppression으로 숨기지 않는다.
- 프로덕션 `compileKotlin`에 warnings-as-errors를 적용한다.
- 테스트 컴파일 경고는 별도 inventory로 측정한 뒤 후속 ratchet으로 다룬다. Phase 0에서 테스트
  경고 전체를 한꺼번에 고치느라 프로덕션 변경을 가리지 않는다.
- 폐기 예정 API는 현재 프레임워크가 제공하는 대체 API로 이동한다.

수용 기준:

- fresh `compileKotlin` 출력의 프로덕션 경고가 0건이다.
- 새 프로덕션 경고가 CI를 실패시킨다.

### 7.2 Detekt·ktlint baseline 단방향 축소

설계 점검 기준으로 `server/config/detekt/baseline.xml`은 약 461개 issue id,
`server/config/ktlint/baseline.xml`은 약 171개 error를 포함한다.

- 구현 시작 시 exact count를 다시 측정해 기준 파일이나 검증 스크립트에 고정한다.
- 기준보다 항목이 늘어나면 CI를 실패시킨다.
- 변경한 파일의 기존 예외는 가능한 범위에서 함께 제거하는 `touch it, improve it` 원칙을 적용한다.
- baseline 재생성으로 신규 위반을 숨기는 커밋은 허용하지 않는다.
- 우선 분해 대상은 변경 빈도와 장애 영향이 큰 수동 알림 발송, 세션 쓰기, 관리자 알림, Redis AI
  작업 저장소다. 파일 길이만을 이유로 일괄 분해하지 않는다.

수용 기준:

- baseline 항목 수가 기준값 이하이며 신규 위반이 없다.
- baseline을 변경하는 커밋은 제거된 규칙 id와 사유를 diff에서 확인할 수 있다.

### 7.3 JaCoCo gate 현실화

설계 점검에서 unit lane의 라인 커버리지는 약 45.8%였지만, `server/build.gradle.kts`의 minimum은
2026-05-14 측정값을 바탕으로 한 23%다.

- fresh clean run으로 현재 수치를 다시 측정한다.
- 안정적으로 재현되면 라인 minimum을 43%로 올린다. 이는 현재 측정값에서 약 2%p의 실행 환경
  여유를 둔 값이다.
- 권한, 멱등성, 상태 전이, 재시도, lease처럼 중요한 정책은 전역 수치와 별개로 구체적인 시나리오
  테스트를 요구한다.
- 제외 패턴을 넓혀 수치를 인위적으로 높이지 않는다.

수용 기준:

- `jacocoTestCoverageVerification` minimum이 0.43 이상이다.
- fresh server CI가 새 minimum에서 통과한다.
- 핵심 정책 변경은 관련 성공·거부·경계 조건 테스트를 포함한다.

### 7.4 ArchUnit 적용 범위 완성

- `sessionimport`를 서버 슬라이스 registry에 포함한다.
- `adapter.in.web`뿐 아니라 messaging, Kafka, scheduling, security 등 실제 인바운드 어댑터 패키지를
  검사한다.
- 애플리케이션은 특정 adapter 하위 패키지가 아니라 모든 `..adapter..`에 의존하지 않아야 한다.
- 인바운드 어댑터는 구체 application service 대신 `port.in`과 입력 모델을 호출해야 한다.
- 아웃바운드 어댑터와 인바운드 어댑터 사이의 직접 참조를 금지한다.
- 기능 의존 그래프와 순환을 테스트 결과로 노출한다.

Phase 0에서는 기존 위반을 명시적 allowlist로 고정하고 신규 위반과 신규 순환만 차단한다. 기존
위반 제거와 allowlist 소멸은 Phase 2의 책임이다.

## 8. Phase 1 — 운영·데이터 신뢰성

### 8.1 관리자 헬스 조회 실패 격리

`PlatformAdminHealthService`는 provider 작업에 논리적 timeout을 적용한다. 그러나
`CompletableFuture.completeOnTimeout`으로 호출자에게 fallback을 반환해도 blocking HTTP 작업은 계속
실행될 수 있다. 고정 크기 실행기의 무제한 queue와 겹치면 헬스 화면 자체가 외부 장애를 증폭할 수
있다.

목표 구조:

```text
scheduled/manual trigger adapter
  -> single-flight refresh use case
      -> bounded health executor
          -> provider port
              -> transport adapter with connect/read/request timeout
      -> last-known-good snapshot + refresh metadata
```

설계 규칙:

- Prometheus `RestClient`의 실제 request factory에 connect/read/request timeout을 적용한다.
- executor는 명시적인 thread count, queue capacity, thread name, shutdown 정책을 갖는다.
- queue 포화 시 요청 스레드에서 blocking 작업을 대신 실행하지 않고 빠르게 거부하여 stale snapshot
  또는 `UNKNOWN` 카드로 변환한다.
- scheduled refresh와 요청 기반 lazy refresh는 하나의 in-flight 작업을 공유한다.
- 마지막 정상 스냅샷, 생성 시각, 마지막 성공 시각, 현재 refresh 상태를 분리해 보존한다.
- timeout, rejection, overlapping refresh, stale age, refresh duration을 메트릭으로 노출한다.
- `@Scheduled`는 application service가 아니라 인바운드 scheduling adapter가 소유한다.

필수 테스트:

- 응답하지 않는 HTTP provider가 transport timeout 안에 종료된다.
- 한 provider가 멈춰도 다른 카드와 마지막 정상 snapshot은 제공된다.
- 병렬 요청과 scheduled trigger가 중복 refresh를 만들지 않는다.
- queue 포화가 request thread의 무제한 blocking으로 전파되지 않는다.
- provider 회복 후 stale 상태가 정상 상태로 돌아온다.

### 8.2 Flyway versioned migration 불변성

Flyway checksum은 이미 migration이 적용된 DB에서는 변조를 탐지하지만, 매번 빈 DB에서 시작하는
CI만으로는 기준 브랜치의 과거 SQL 수정이나 삭제를 충분히 방어하지 못한다.

- merge base 또는 명시된 base ref에 존재하는 versioned migration의 수정·삭제를 검사한다.
- 새 versioned migration 추가는 허용한다.
- migration version 중복, 잘못된 파일명과 위치를 검사한다.
- CI checkout이 base 비교에 필요한 history를 제공하도록 workflow 조건을 명시한다.
- 운영 수정은 과거 SQL 변경이 아니라 새 forward-only 보정 migration으로 수행한다.
- 기존 `MySqlFlywayMigrationTest`의 clean install과 supported upgrade fixture 검증을 유지한다.

수용 기준:

- 과거 migration 수정·삭제 fixture가 검사 스크립트를 실패시킨다.
- 새 migration 추가 fixture는 통과한다.
- 지원되는 이전 schema에서 최신 schema로의 통합 테스트가 통과한다.

### 8.3 비동기·외부 연동 실패 모델

AI provider, Kafka, 알림, Redis job 흐름을 동일 구현으로 강제하지는 않는다. 대신 각 흐름이 다음
질문에 답하도록 failure matrix를 만든다.

- transport timeout과 전체 작업 deadline은 무엇인가?
- 재시도 가능한 오류와 영구 오류를 어디에서 분류하는가?
- 자동 재시도의 멱등성 근거는 무엇인가?
- claim/lease 만료와 중복 소비 시 단 하나의 상태 전이만 성공하는가?
- retry exhaustion 이후 상태와 운영자 복구 경로는 무엇인가?
- queue lag, circuit state, retry count, terminal failure를 어디에서 관측하는가?

기존 회복, outbox, query-budget 테스트가 이미 답하는 항목은 다시 구현하지 않는다. inventory에서
증거가 없는 고위험 흐름만 새 수직 슬라이스로 만든다.

필수 테스트는 정상 경로보다 다음 경계에 집중한다.

- 동일 작업의 병렬 claim
- lease 만료 직전과 직후의 commit
- 성공 이후 중복 메시지 수신
- transient failure 이후 성공
- permanent failure와 retry exhaustion
- 저장 성공/메시지 발행 실패 사이의 복구

### 8.4 설정과 시간의 결정성

- timeout, queue, lease, retry, cache freshness 값은 기능별 `@ConfigurationProperties`로 묶는다.
- 값의 단위, 하한, 상한, 상호 제약을 시작 시 검증한다.
- 잘못된 운영 설정은 첫 요청이 아니라 애플리케이션 시작 시 실패한다.
- 만료, 재시도, 상태 전이, audit timestamp는 주입된 `Clock`을 사용한다.
- 비즈니스 식별자 생성이 정책 테스트를 불안정하게 만드는 경우에만 `IdGenerator` 포트를 둔다.
- DB나 transport adapter 내부의 단순 기술 식별자까지 일률적으로 추상화하지 않는다.

## 9. Phase 2 — 핵사고날 경계 정제

### 9.1 순수 actor 모델

현재 current-user 계열 모델은 Spring Security 타입, auth/club 도메인 타입, 프로필 정보를 함께
다룬다. 이 구조는 애플리케이션이 security adapter에 직접 의존하지 않아도 principal의 변경 영향을
간접적으로 받게 한다.

목표 구조:

```text
Spring Security Authentication / OIDC principal
  -> inbound security resolver
      -> ClubActor(memberId, clubId, capabilities)
      -> PlatformActor(adminId, capabilities)
          -> application input port
```

- actor는 순수 Kotlin 값 객체이며 Spring Security 타입을 import하지 않는다.
- actor는 유스케이스가 필요로 하는 ID와 capability만 포함한다.
- 이메일, 계정명, 아바타 등은 필요한 유스케이스가 별도 조회 포트로 가져온다.
- platform-admin capability는 `club` 기능의 역할 타입을 그대로 노출하지 않는다.
- controller/filter가 principal을 actor로 변환하고 application input port를 호출한다.

마이그레이션은 일괄 교체가 아니라 유스케이스 단위로 진행한다. 기존 모델은 남은 consumer가 0이 된
뒤 삭제한다.

### 9.2 포트와 실패 모델 규칙

최종 의존 규칙은 다음과 같다.

| 소스 | 허용 의존 | 금지 의존 |
| --- | --- | --- |
| `adapter.in` | `application.port.in`, 입력 모델, inbound 전용 변환 | 구체 service, `adapter.out` |
| `application` | domain, `port.in`, `port.out`, 순수 공통 모델 | 모든 adapter, transport 예외 |
| `adapter.out` | `port.out`, application/domain model, 기술 라이브러리 | `adapter.in`, web helper |
| `shared` | JDK/Kotlin과 진짜 공통 값 객체 | auth/club 등 feature domain |

- Kafka, Prometheus, HTTP client의 기술 예외는 adapter 내부에서 application 소유의 실패 분류로
  변환한다.
- `resolveClubContext`, host-session id parser와 같은 web helper를 다른 기능이나 security filter가
  참조하지 않게 한다.
- application service의 circuit state나 metric helper를 outbound adapter가 구체 타입으로 참조하는
  경우, 필요한 계약을 port 또는 독립된 application model로 이동한다.
- scheduler는 주기만 결정하는 inbound adapter이며 실제 정책은 input port를 호출한다.

### 9.3 기능 순환 제거

기능 간 의존은 데이터와 정책의 소유권으로 결정한다.

#### `sessionrecord`와 `sessionimport`

- `sessionrecord`는 확정된 세션 기록과 기록 조회의 소유자다.
- `sessionimport`는 외부/이전 데이터를 해석하고 검증해 기록 유스케이스를 호출하는 workflow다.
- 목표 방향은 `sessionimport -> sessionrecord`다.
- `sessionrecord`가 import workflow 모델을 참조하는 역방향 의존은 기록 소유 모델 또는 소비자 소유
  포트로 교체한다.

#### `auth`와 `club`

- `auth`는 외부 신원, 로그인 세션, 인증 수명주기를 소유한다.
- `club`은 클럽 멤버십, 역할, 클럽 접근 정책을 소유한다.
- auth가 멤버십 결정을 필요로 하면 auth consumer가 소유한 narrow query port를 사용한다.
- club이 로그인 구현 타입을 참조하지 않도록 account/member identity는 안정적인 ID 또는 명시적
  이벤트로 전달한다.
- 동기 port와 event 중 하나를 선택할 때는 즉시 일관성 필요 여부와 실패 복구 경로를 먼저 증명한다.

ArchUnit에는 허용 feature dependency matrix와 cycle 검사를 추가한다. 예외적인 양방향 협력이
필요하면 패키지 import가 아니라 명시적 orchestration use case로 표현한다.

### 9.4 대형 클래스 분해

분해 단위는 줄 수가 아니라 다음 책임 경계다.

- 하나의 유스케이스
- 하나의 트랜잭션 경계
- 하나의 외부 시스템
- command와 query
- 정책 결정과 SQL/직렬화

우선 검토 대상은 다음과 같다.

- 수동 알림 dispatch persistence/claim/transition
- host session write operation
- platform-admin notification operation
- AI generation Redis job state
- session record persistence와 codec/sort 정책

분해 전에는 characterization test를 먼저 고정한다. 단순히 private method를 새 class로 옮겨 의존 수만
늘리는 변경은 하지 않는다.

## 10. 실행 파동

### Wave 1 — 기준선 고정

1. fresh 품질 수치와 경고 inventory를 기록한다.
2. 프로덕션 경고를 제거하고 warnings-as-errors를 활성화한다.
3. baseline 비증가 검사와 JaCoCo 43% gate를 적용한다.
4. 전체 슬라이스 registry, adapter 규칙, dependency/cycle report를 추가한다.
5. 기존 위반 allowlist와 제거 wave를 연결한다.

### Wave 2 — 가장 위험한 운영 사각지대

1. 관리자 헬스 transport timeout을 적용한다.
2. bounded executor, rejection fallback, single-flight를 적용한다.
3. stale snapshot 상태와 운영 메트릭을 추가한다.
4. Flyway migration 불변성 검사를 추가한다.
5. 관련 설정을 typed configuration으로 이동한다.

### Wave 3 — 비동기·데이터 일관성

1. failure matrix와 현재 증거를 작성한다.
2. 증거가 없는 가장 위험한 흐름을 우선순위화한다.
3. claim/lease/idempotency/recovery를 한 흐름씩 보강한다.
4. 각 흐름의 운영자 관측·복구 경로를 확인한다.

### Wave 4 — 아키텍처 경계

1. actor 모델과 security 변환 경계를 도입한다.
2. 인바운드 어댑터의 구체 service 참조를 제거한다.
3. application/adapter 직접 참조와 adapter 간 참조를 제거한다.
4. `sessionrecord <-> sessionimport` 순환을 제거한다.
5. `auth <-> club` 순환을 제거한다.
6. 대형 클래스는 영향받은 유스케이스부터 분해한다.
7. 임시 ArchUnit allowlist를 0건으로 만든다.

각 wave는 독립적으로 main에 통합 가능한 상태여야 한다. Wave 전체가 끝날 때까지 하나의 장기
브랜치에 쌓지 않는다.

## 11. 검증 전략

### 11.1 공통 TDD 순서

각 수직 슬라이스는 다음 순서를 따른다.

1. 실패하는 동작 테스트, 동시성 테스트, 또는 ArchUnit 규칙으로 문제를 재현한다.
2. 최소 변경으로 GREEN을 만든다.
3. 구조를 정리한 뒤 집중 테스트를 다시 실행한다.
4. 영향 범위에 맞는 회귀 묶음을 실행한다.
5. 최종 HEAD에서 canonical gate를 새로 실행한다.

### 11.2 기본 명령

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server architectureTest
./server/gradlew -p server integrationTest
git diff --check
```

- persistence, migration, Kafka, Redis 변경은 관련 Testcontainers suite를 먼저 집중 실행한다.
- auth, 권한, API 계약이 바뀌는 슬라이스는 프런트 fixture/contract test와
  `pnpm --dir front test:e2e`를 추가한다.
- release script, 공개 문서, candidate 구성에 영향이 있으면 다음을 추가한다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

- 실제 provider 비용이나 사용자 영향을 만드는 AI 호출과 이메일 발송은 검증에 포함하지 않는다.
  fake provider, 로컬 인프라, 저장 상태를 통해 검증한다.

### 11.3 단계별 핵심 증거

| 단계 | 필수 증거 |
| --- | --- |
| Phase 0 | 경고 0, baseline 비증가, JaCoCo gate, 전체 architecture registry |
| Health reliability | hung transport, saturation, overlap, stale, recovery 테스트와 메트릭 |
| Migration safety | 과거 SQL 수정/삭제 실패 fixture와 forward upgrade integration test |
| Async reliability | claim/lease/idempotency/retry exhaustion 동시성 증거 |
| Actor migration | principal이 adapter 밖으로 나가지 않는 ArchUnit 규칙과 권한 회귀 테스트 |
| Feature cycle removal | dependency matrix와 cycle-free ArchUnit 결과 |

## 12. 중단 및 별도 설계 기준

다음 변화가 필요하면 현재 수직 슬라이스를 확장하지 않고 별도 설계와 승인을 받는다.

- 외부 API response shape, HTTP status, 권한 의미가 바뀐다.
- 데이터 소유권 또는 기존 레코드 의미가 바뀐다.
- 운영 backfill, dual-read/write, 호환 기간이 필요하다.
- 인덱스나 SQL 계약 변경 없이는 성능 기준을 만족할 수 없다.
- 공통 모듈이나 새 런타임 인프라가 세 기능 이상에 영향을 준다.
- 실제 배포, live provider 호출, 실제 사용자 메시지 발송이 필요하다.

## 13. 위험과 완화

### 13.1 강화된 gate가 기존 개발 흐름을 과도하게 막을 위험

기존 위반은 명시적 allowlist로 시작하고 신규 위반만 즉시 차단한다. baseline과 allowlist는 증가할 수
없고 wave마다 감소해야 한다.

### 13.2 actor 분리 중 권한 의미가 달라질 위험

유스케이스별 characterization test를 먼저 만들고 actor 변환 전후의 허용·거부 결과를 동일하게
유지한다. capability 이름 변경과 정책 변경을 같은 커밋에서 하지 않는다.

### 13.3 single-flight가 stale 상태를 영구 고정할 위험

in-flight 종료와 실패 정리를 `finally` 성격의 경로에서 보장하고, 회복 테스트와 stale age alert를
둔다. 실패한 future를 다음 refresh가 재사용하지 않게 한다.

### 13.4 bounded queue가 관측 정보 손실로 이어질 위험

거부를 숨기지 않고 metric과 snapshot metadata로 노출한다. 헬스 조회는 빠른 fallback을 선택하되,
운영자는 saturation 원인을 별도 지표로 확인할 수 있어야 한다.

### 13.5 shared가 다시 범용 의존 저장소가 될 위험

새 shared 타입은 최소 세 소비자의 안정된 동일 의미가 증명되거나, 모든 feature 아래에 있어야 하는
진짜 플랫폼 값 객체일 때만 허용한다. 기능 정책은 소유 기능에 남긴다.

## 14. 전체 수용 기준

다음 조건이 모두 충족되어야 프로그램을 완료로 본다.

- 프로덕션 Kotlin 컴파일 경고가 0건이며 새 경고가 CI를 실패시킨다.
- Detekt·ktlint baseline이 기준보다 증가하지 않고, 변경된 고위험 영역의 예외가 감소한다.
- JaCoCo line minimum이 0.43 이상이다.
- 현재 서버 슬라이스와 모든 인바운드 유형이 architecture registry의 적용 대상이다.
- 알려진 feature cycle이 0건이다.
- application에서 adapter로 향하는 의존이 0건이다.
- inbound adapter에서 구체 application service로 향하는 의존이 0건이다.
- 임시 ArchUnit allowlist가 0건이다.
- 관리자 헬스 조회가 hung provider, executor saturation, concurrent refresh, provider recovery를 자동
  테스트로 방어한다.
- 기준 브랜치의 Flyway versioned migration 수정과 삭제가 CI에서 차단된다.
- 선택된 고위험 비동기 흐름이 idempotency, lease, retry exhaustion, recovery 증거를 가진다.
- 최종 HEAD에서 `./scripts/server-ci-check.sh`와 전체 `integrationTest`가 통과한다.
- auth/API 계약 변경이 있었다면 관련 프런트 계약 테스트와 E2E가 통과한다.
- 실제 사용자 데이터, 비밀값, private domain, live provider 호출이 검증 산출물에 포함되지 않는다.

## 15. 후속 산출물

이 설계가 문서 검토를 통과하면 별도의 구현 계획에서 다음을 작업 단위와 커밋 경계로 세분화한다.

- Phase 0 baseline 및 architecture ratchet
- 관리자 헬스 failure-containment 수직 슬라이스
- Flyway migration immutability gate
- 비동기 failure matrix와 우선순위 슬라이스
- actor/security boundary migration
- `sessionrecord`/`sessionimport` cycle removal
- `auth`/`club` cycle removal
- 최종 architecture allowlist 제거와 전체 검증

구현 계획은 각 작업에 RED 테스트, 수정 대상 파일, 집중 검증 명령, canonical gate, rollback 가능한
커밋 경계를 명시해야 한다.
