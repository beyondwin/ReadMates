# ADR-0002: Server clean architecture + ArchUnit 강제

- 상태: Accepted
- 결정일: 2026-04-22
- 작성자: 서버 아키텍처
- 관련: ADR-0004 (notification 아키텍처), ADR-0007 (MySQL + Flyway),
  `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`,
  `server/build.gradle.kts:45`,
  `docs/development/architecture.md`

## 컨텍스트

초기 backend 코드는 전통적인 `controller → service → repository` 레이어 구조로 시작했다. feature가 추가될수록 다음과 같은 문제가 나타났다:

### 문제 1: Spring HTTP 타입의 application layer 침투

Spring controller가 `HttpServletRequest`, `@RequestParam`, Spring Security의 `Authentication` 타입을 직접 service 레이어로 전달하는 패턴이 반복됐다. 예를 들어:

```kotlin
// 문제 패턴 (이전 코드)
@Service
class SessionService {
    fun createSession(request: HttpServletRequest, auth: Authentication): Session {
        val user = auth.principal  // Spring Security 타입에 의존
        // ...
    }
}
```

application logic이 HTTP 세부사항에 묶이면 web 이외의 진입점(scheduler, Kafka listener)에서 같은 service를 재사용하기 어려워진다. Kafka consumer가 같은 비즈니스 로직을 호출하려면 `HttpServletRequest`를 mock해야 한다.

### 문제 2: persistence detail의 상위 레이어 침투

`JdbcTemplate` 또는 raw SQL 의존이 service 클래스 안으로 들어오거나, controller가 repository bean을 직접 주입받는 사례가 발생했다:

```kotlin
// 문제 패턴 (이전 코드)
@RestController
class SessionController(
    private val jdbcTemplate: JdbcTemplate  // persistence 직접 의존
) {
    // ...
}
```

application logic이 특정 persistence 기술에 결합되면 테스트에서 실제 DB가 필요해지고, persistence 교체 비용이 커진다. 서비스 로직을 단위 테스트하려면 항상 `MockJdbcTemplate`이 필요해진다.

### 문제 3: 신규 멤버 온보딩 모호성

구조가 명시적으로 강제되지 않으면 신규 멤버가 "이 파일을 어느 폴더에 넣어야 하는가"를 매번 질문해야 한다. 기존 패턴을 잘못 이해하거나, 작은 편의를 위해 경계를 넘는 import를 추가하게 된다. 코드 리뷰가 "이 import가 경계를 넘는가"를 매번 토론하는 비용이 생겼다.

### 해결 방향 검토

두 가지 방향을 검토했다:
- **계층형 아키텍처 유지 + 강화된 리뷰 가이드**: 문서로만 경계를 정의한다. 강제 메커니즘이 없어 drift가 계속된다.
- **Clean/Hexagonal architecture + 컴파일 타임 강제**: 디렉토리 구조로 역할을 명시하고, ArchUnit이 경계를 빌드 타임에 검증한다.

ArchUnit(`server/build.gradle.kts`: `testImplementation("com.tngtech.archunit:archunit-junit5:1.3.2")`)은 JVM 바이트코드를 분석해 패키지 간 의존 방향을 테스트로 표현한다. 규칙 위반 시 `./scripts/server-ci-check.sh` 또는 focused `./server/gradlew -p server architectureTest`가 실패한다.

## 결정

서버의 각 feature를 다음 디렉토리 구조로 정리한다:

```
server/src/main/kotlin/com/readmates/<feature>/
  adapter/
    in/web/              — Spring MVC controller, request/response DTO
    in/kafka/            — Kafka consumer (선택적)
    out/persistence/     — JdbcTemplate 기반 persistence adapter
    out/redis/           — Redis adapter (선택적)
    out/kafka/           — Kafka producer adapter (선택적)
    out/mail/            — SMTP adapter (선택적)
  application/
    port/
      in/                — use-case interface (inbound)
      out/               — outbound port interface
    service/             — application service, domain logic
    model/               — domain model, value object
```

ArchUnit으로 다음 경계를 컴파일 타임에 강제한다(`ServerArchitectureBoundaryTest.kt`):

1. **web adapter 독립성** (line 45): migrated web adapter는 `adapter.out.persistence`, `adapter.out.redis`, legacy repository를 직접 import할 수 없다. web adapter는 반드시 application port(`port.in`) 인터페이스를 통해서만 persistence와 통신한다.

2. **application layer 순수성** (line 69): `application` 패키지는 Spring HTTP (`HttpServletRequest`, `@RequestParam`), JDBC, Spring Data Redis, adapter를 import할 수 없다. application service는 port interface만 의존한다.

3. **persistence adapter JdbcTemplate 직접 주입** (line 110): persistence adapter는 `JdbcTemplate`을 직접 주입받아야 하며, Spring Data의 `CrudRepository` 같은 legacy repository 인터페이스를 사용할 수 없다.

4. **domain model 순수성** (line 219): domain model은 Spring, JdbcTemplate, HTTP 타입에 의존할 수 없다.

5. **notification application 포트 격리** (line 98-107): `notification.application` 패키지는 legacy `NotificationOutboxPort`에 직접 의존할 수 없다. notification 아키텍처 재설계(V20 migration) 이후 legacy outbox port가 남아 있어 의존이 재발하지 않도록 별도 rule이 추가됐다.

6. **application service의 HTTP/Security 순수성** (line 124-136): `auth.application.service` 패키지는 `org.springframework.http`, `org.springframework.web` 타입에 의존할 수 없다. `Authentication`, `HttpServletRequest`가 service 파라미터로 들어오는 패턴을 차단한다.

JPA/Hibernate를 사용하지 않는다. 현재 backend는 `JdbcTemplate` 직접 사용 방식을 채택했다. SQL이 source of truth이고 schema는 Flyway migration 파일로 관리된다.

## 근거

### 컴파일 타임 강제의 효과

`ServerArchitectureBoundaryTest.kt`가 실패하면 PR이 merge되지 않는다. "구조 규칙"이 문서가 아니라 테스트가 되었으므로:

- 코드 리뷰에서 "이 import가 경계를 넘는가?" 토론이 거의 사라졌다. 경계 위반은 CI에서 즉시 발견된다.
- 신규 feature 추가 시 디렉토리 구조만 보면 어떤 패키지에 무엇을 두어야 하는지 자명하다.
- "이 서비스에서 JdbcTemplate를 주입받아도 되는가?"라는 질문에 답할 필요가 없다. 테스트가 "불가"를 강제한다.

### 진입점 분리

application service가 HTTP 타입에 의존하지 않으므로, 다양한 진입점에서 같은 service를 재사용할 수 있다:

- web adapter(`adapter.in.web`) — HTTP 요청 처리
- Kafka consumer(`adapter.in.kafka`) — 이벤트 소비
- scheduler — 주기적 작업

notification 파이프라인(ADR-0004)에서 이 패턴이 실현됐다. `NotificationDeliveryEngine`(application service)을 Kafka consumer와 scheduler 양쪽에서 호출한다.

### JPA 미사용의 의도적 선택

ORM은 편의를 제공하지만 다음 단점이 있다:
- N+1 query 문제
- 의도치 않은 flush/dirty checking
- Lazy loading이 예상치 못한 곳에서 트리거
- schema 변경이 annotation 변경으로 이루어져 코드 리뷰에서 SQL이 보이지 않음

`JdbcTemplate` 직접 사용 방식은:
- SQL이 코드에 명시적으로 보인다 (코드 리뷰에서 schema 변경이 즉시 보임)
- Flyway migration 파일과 application 코드 사이의 schema drift가 명확히 드러남
- 테스트에서 실제 DB 없이 mock `JdbcTemplate`만으로 단위 테스트 가능

ArchUnit 규칙(`ServerArchitectureBoundaryTest.kt:110`)이 "persistence adapter는 JdbcTemplate을 직접 주입받아야 한다"를 강제해 이 결정이 코드 수준에서 유지된다.

### 의존성 선언

```
server/build.gradle.kts:45
testImplementation("com.tngtech.archunit:archunit-junit5:1.3.2")
```

ArchUnit은 test scope 의존성이다. production 빌드에 영향을 주지 않으며, 테스트 실행 시에만 활성화된다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| 전통적 레이어드 아키텍처 유지 (controller/service/repository) | 세 레이어만으로는 "application logic이 HTTP 타입에 의존하지 않는다"는 계약을 표현할 수 없다. 강제 메커니즘 없이 문서만으로는 drift가 반복됐다. |
| Hexagonal architecture만 적용하고 ArchUnit 미사용 | 디렉토리 구조를 만들어도 import 경계는 개발자 자율에 맡겨진다. 경계 위반이 코드 리뷰까지 가야만 발견된다. ArchUnit이 있으면 CI에서 차단된다. |
| Onion architecture | Hexagonal과 컨셉이 유사하되 "domain", "application", "infrastructure" 용어를 사용한다. 팀 내 인지 부담과 외부 참조 자료를 고려해 널리 알려진 Clean architecture 구조를 채택했다. |
| Gradle multi-module (feature별 subproject) | 모듈 간 경계가 컴파일러 수준에서 강제된다. 강력하지만 build configuration, test fixture 공유, IDE 설정 복잡도가 크게 높아진다. 현재 팀 규모와 코드베이스 크기에는 과잉이다. feature 수가 크게 늘거나 팀이 확장되면 재검토 예정 (ADR-후속 후보). |
| 아키텍처 단위 테스트 없이 문서 + 코드 리뷰만 | 신규 멤버 또는 실수로 경계를 넘은 import가 PR에 포함되면 리뷰어가 인지해야만 발견된다. ArchUnit은 CI에서 자동으로 발견한다. 리뷰어의 집중을 비즈니스 로직에 쏠 수 있다. |
| Spring Modulith | Spring 6+에서 지원하는 모듈 경계 강제 도구다. ArchUnit보다 Spring 친화적이지만, custom rule 작성 유연성이 낮다. 현재 ArchUnit으로 충분히 커버된다. |

## 결과

긍정적:
- 코드 리뷰에서 "구조" 토론이 크게 줄었다. ArchUnit이 강제하므로 리뷰어는 비즈니스 로직에 집중할 수 있다.
- 신규 멤버 온보딩 시 디렉토리 구조만 보면 각 파일의 책임을 추론할 수 있다. `adapter.in.web`은 controller, `application.service`는 비즈니스 로직, `adapter.out.persistence`는 DB 접근임이 명확하다.
- application service가 HTTP 타입에 의존하지 않으므로, 동일 service를 web/scheduler/Kafka 진입점에서 재사용할 수 있다.
- feature 단위로 cohesion이 높아 "이 feature를 제거하면 어떤 파일을 지우는가"가 명확해진다. feature 폴더 삭제 = feature 제거.
- ArchUnit 테스트는 빌드 타임에 빠르게 실행된다. 실제 DB나 외부 서비스 없이 바이트코드 분석만으로 동작한다.
- SQL이 코드에 명시적이어서 schema 변경이 코드 리뷰에서 즉시 보인다.
- 2026-05-27 architecture flexibility update: `ServerArchitectureBoundaryTest`는 slice registry를 통해 `admin.audit`, `admin.health`, `aigen`까지 최근 확장 surface를 명시적으로 등록한다. `aigen`은 workflow-side slice로 분류하고, `CurrentMember` 같은 web/session carrier는 application-safe actor value로 변환해 전달한다.

부정적/감수한 비용:
- 작은 feature에도 5계층 구조가 강제된다. 보일러플레이트 파일 수가 많아진다. IDE template으로 초기 파일 생성을 자동화해 단축하고 있다.
- legacy surface (아직 전환되지 않은 코드)와 신규 clean architecture surface가 공존한다. 경계 테스트는 전환된 패키지만 대상으로 하므로(`ServerArchitectureBoundaryTest.kt:22-29`에 명시된 패키지), 전환되지 않은 코드는 여전히 기존 패턴을 따를 수 있다.
- cross-feature 공유 추상화의 위치(`shared/` 패키지)에 대한 규칙이 아직 명확하지 않다. 현재는 관례로 운영 중이며 별도 ADR이 필요할 수 있다.
- ArchUnit 버전 업그레이드 시 기존 규칙과의 호환성을 확인해야 한다.
- `JdbcTemplate` 직접 사용으로 복잡한 쿼리를 직접 작성해야 한다. 빌드 타임 타입 안전성이 없다 (jOOQ 도입은 후속 ADR 후보).

## 검증

ArchUnit 경계 테스트:
```bash
./server/gradlew -p server test --tests "com.readmates.architecture.ServerArchitectureBoundaryTest"
```

기대: 모든 경계 규칙 통과. 위반 시 "cannot depend on", "must inject" 메시지와 함께 위반 파일/라인 출력.

PR-level 서버 품질 게이트:
```bash
./scripts/server-ci-check.sh
```

feature 추가 후 구조 검증:
1. 새 feature의 `adapter.in.web` 클래스가 `application.service` 대신 `adapter.out.persistence`를 직접 import하면 ArchUnit 테스트 실패 확인.
2. `application.service` 클래스에서 `JdbcTemplate`을 직접 import하면 ArchUnit 테스트 실패 확인.
3. domain model에서 `org.springframework` 패키지를 import하면 ArchUnit 테스트 실패 확인.

legacy surface 확인:
- `ServerArchitectureBoundaryTest.kt:22-29`에 명시된 패키지 목록이 전환된 surface를 정확히 반영하는지 PR마다 확인.

## 후속 작업

- cross-feature 공유 추상화(`shared/` 패키지)의 import 방향 규칙 명문화. 현재 관례로 운영 중.
- legacy surface의 clean architecture 전환 완료 기준 및 일정 문서화. 미전환 surface 목록 관리.
- Gradle multi-module 전환 검토 시점 기준 정의 (feature 수, 팀 규모 임계값).
- ArchUnit 규칙 추가 후보: domain model이 Kotlin stdlib 이외의 외부 라이브러리에 의존하지 않는다는 규칙.
- jOOQ write adapter migration: `JdbcTemplate` 직접 SQL에서 jOOQ type-safe query builder로 전환. 빌드 타임 SQL 오류 발견 가능. ADR-0011 후보.
- hexagonal architecture의 port 인터페이스 명명 규칙 명문화: `*UseCase` (input port), `*Port` (output port) 구분이 현재 관례로만 유지됨. ArchUnit 검증 가능한 규칙으로 공식화 검토.
- `@Transactional` annotation 위치 규칙 명확화: 현재 application service 레이어에서 `@Transactional`을 사용하는 것이 clean architecture와 일치하는지, 아니면 adapter 레이어에서만 사용해야 하는지 논의 필요.
- ArchUnit Gradle 캐싱 최적화: 현재 ArchUnit 테스트가 매 빌드마다 전체 바이트코드를 분석한다. Gradle build cache와 ArchUnit의 cache store 설정을 통해 변경이 없는 클래스에 대한 재분석을 줄이는 방안 검토.
- 도메인 이벤트 패턴 도입 검토: 현재 application service가 여러 output port를 직접 조합한다. 도메인 이벤트로 서비스 간 결합을 줄이면 application layer가 더 얇아진다. ADR-0004 outbox 패턴과 연계해 검토 가능.
