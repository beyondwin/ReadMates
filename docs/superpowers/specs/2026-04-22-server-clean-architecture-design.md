# ReadMates Server Clean Architecture Design

작성일: 2026-04-22
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates 서버 전체 기능을 실용적 Spring Boot 스타일의 클린 아키텍처로 전환하기 위한 최종 목표 구조와 단계별 이행 원칙을 정의한다.

## 1. 배경

ReadMates 서버는 현재 Spring Boot 단일 애플리케이션이며 `auth`, `session`, `archive`, `note`, `feedback`, `publication`, `shared` 기능 패키지로 나뉘어 있다. 기능 구현은 빠르게 진행되었지만, 여러 컨트롤러가 `Repository` 또는 `JdbcTemplate` 기반 구현을 직접 호출하고 있다.

대표적인 문제는 다음과 같다.

- `ArchiveController`, `RsvpController`, `HostSessionController`, `FeedbackDocumentController` 등에서 `MemberAccountRepository`, `ArchiveRepository`, `SessionRepository`, `FeedbackDocumentRepository`를 직접 주입한다.
- `PublicController`는 컨트롤러 내부에서 `JdbcTemplate`로 SQL을 직접 실행한다.
- `application` 패키지의 query repository가 `api` 패키지의 response DTO를 import한다.
- 일부 기능은 `Service`와 `AuthenticatedMemberResolver`를 사용하지만, 전체 패턴은 통일되어 있지 않다.
- `ResponseStatusException`, `JdbcTemplate`, API DTO, 권한 판단, SQL, response 조립이 application과 api 계층에 섞여 있다.

따라서 이 설계는 전체 서버 기능을 대상으로, 컨트롤러가 유스케이스만 호출하고 application이 port에 의존하며 JDBC 구현은 adapter로 내려가는 구조를 목표로 한다.

## 2. 목표

- 서버 전체 기능에 동일한 계층 규칙을 적용한다.
- 컨트롤러에서 repository, `JdbcTemplate`, SQL, 반복 인증 해석 로직을 제거한다.
- application service가 유스케이스 흐름과 트랜잭션 경계를 명확히 갖는다.
- domain과 application은 web, Spring MVC, JDBC 세부사항을 모른다.
- persistence adapter가 DB row, SQL, JPA/JDBC, mapper 책임을 가진다.
- API DTO와 application model을 분리해 의존 방향을 바로잡는다.
- 조회 기능은 CQRS 스타일의 query use case를 허용해 복잡한 read model을 직관적으로 유지한다.
- 기존 API route와 response shape는 가능한 유지하며 내부 구조를 점진적으로 교체한다.
- 패키지 경계 테스트로 새 규칙이 다시 깨지지 않게 한다.

## 3. 비목표

- 지금 단계에서 Gradle 멀티모듈로 쪼개지 않는다.
- MSA, Redis, Kafka, outbox를 ReadMates에 즉시 도입하지 않는다.
- 모든 도메인 모델을 프레임워크와 완전히 독립적인 순수 DDD 모델로 재설계하지 않는다.
- 기존 프론트엔드 API 계약을 한 번에 변경하지 않는다.
- DB 스키마를 아키텍처 전환 목적으로 대규모 재작성하지 않는다.
- 운영 배포 구조, Cloudflare BFF 구조, OAuth 플로우는 이번 설계의 변경 대상이 아니다.

## 4. 레퍼런스 분석

### 4.1 kuke-board에서 채택할 점

`<local-home>/doc/lecture/강의자료/kuke-board`는 멀티 서비스 게시판 예제다. ReadMates에 그대로 가져올 구조는 아니지만 다음 장점은 채택한다.

- 컨트롤러가 얇고 서비스에 위임하는 흐름이 직관적이다.
- article write 서비스와 article-read 서비스가 분리되어 있어 CQRS/read model 사고방식을 참고하기 좋다.
- 이벤트 핸들러가 이벤트 타입별로 작은 클래스로 나뉘어 있어 확장 지점이 명확하다.
- outbox 패턴은 쓰기 트랜잭션과 비동기 전파를 분리하는 좋은 참고 사례다.

### 4.2 kuke-board에서 보완할 점

- 서비스가 JPA repository와 response DTO를 직접 다루므로 클린 아키텍처 경계는 약하다.
- MSA, Kafka, Redis, outbox는 ReadMates 현재 규모에는 과하다.
- ReadMates는 단일 제품 흐름과 강한 DB 일관성이 중요하므로, 이벤트 기반 분리는 나중에 실제 파생 작업이 생길 때 도입한다.

### 4.3 commerce에서 채택할 점

`<local-home>/doc/lecture/v1.1/final-dev-practice-commerce_v1.1`는 Kotlin Spring Boot 멀티모듈 예제다. 다음 장점을 채택한다.

- Presentation, Business, Logic, Data Access를 명시적으로 나누는 사고방식이 팀 규칙으로 쓰기 좋다.
- `Service`는 유스케이스 흐름, `Reader/Finder/Manager/Validator/Handler`는 세부 책임이라는 네이밍이 직관적이다.
- `UserArgumentResolver` 패턴은 ReadMates 컨트롤러의 반복 `currentMember(authentication)` 코드를 없애기에 적합하다.
- `Assembler`를 여러 서비스 결과를 UI/API 응답으로 조합할 때만 쓰는 규칙은 컨트롤러 책임을 줄인다.
- request DTO의 `toCommand`, response DTO의 `from/of` 변환 규칙은 API 경계 코드를 읽기 쉽게 만든다.

### 4.4 commerce에서 보완할 점

- commerce 가이드라인은 헥사고날/클린 아키텍처를 의도적으로 쓰지 않고, Logic Layer의 repository 직접 접근을 허용한다.
- 실제 코드도 `core.domain`이 `storage.db.core` entity와 repository에 직접 의존한다.
- ReadMates는 사용자가 요구한 목표에 맞춰 더 엄격하게 port/adapter를 둔다.
- 다만 commerce의 직관적인 네이밍과 작은 책임 클래스 스타일은 유지한다.

## 5. 선택한 접근

ReadMates는 단일 Spring Boot 모듈을 유지하되, package-by-feature 안에서 클린 아키텍처 계층을 나눈다.

선택한 구조는 다음과 같다.

```text
com.readmates.<feature>
  adapter.in.web
  adapter.in.web.request
  adapter.in.web.response
  adapter.in.web.assembler
  application.port.in
  application.port.out
  application.service
  application.model
  domain
  adapter.out.persistence
```

기존 commerce 용어로 보면 다음처럼 대응한다.

| commerce 스타일 | ReadMates 목표 구조 | 설명 |
|---|---|---|
| Presentation Layer | `adapter.in.web` | Controller, request/response DTO, web assembler |
| Business Layer | `application.port.in`, `application.service` | Use case interface와 구현체 |
| Logic Layer | `domain`, application 내부 helper | 정책, 검증, 계산, 상태 전이 |
| Data Access Layer | `application.port.out`, `adapter.out.persistence` | outbound port와 JDBC adapter |

ReadMates에서는 Data Access를 직접 아래 계층으로 호출하지 않는다. application service는 outbound port interface에만 의존한다.

## 6. 최종 패키지 구조

### 6.1 session 예시

```text
com.readmates.session
  adapter.in.web
    CurrentSessionController
    HostSessionController
    RsvpController
    AttendanceController
    PublicationController
  adapter.in.web.request
    UpdateRsvpRequest
    HostSessionRequest
    AttendanceRequest
    PublicationRequest
  adapter.in.web.response
    CurrentSessionResponse
    HostSessionResponse
    RsvpResponse
  adapter.in.web.assembler
    CurrentSessionWebAssembler
  application.port.in
    GetCurrentSessionUseCase
    UpdateRsvpUseCase
    SaveCheckinUseCase
    SaveQuestionUseCase
    SaveReviewUseCase
    ManageHostSessionUseCase
  application.port.out
    LoadCurrentSessionPort
    SaveSessionParticipationPort
    LoadHostSessionPort
    SaveHostSessionPort
    LoadOpenSessionPort
  application.service
    CurrentSessionQueryService
    UpdateRsvpService
    SessionParticipationService
    HostSessionCommandService
  application.model
    UpdateRsvpCommand
    SaveCheckinCommand
    HostSessionCommand
    CurrentSessionResult
    HostSessionResult
  domain
    Session
    SessionId
    SessionState
    SessionSchedule
    SessionParticipation
    SessionParticipationStatus
    SessionPolicy
  adapter.out.persistence
    JdbcCurrentSessionAdapter
    JdbcSessionParticipationAdapter
    JdbcHostSessionAdapter
    SessionRowMapper
```

### 6.2 auth 예시

```text
com.readmates.auth
  adapter.in.web
    AuthMeController
    HostInvitationController
    HostMemberController
    PendingApprovalController
  adapter.in.security
    CurrentMemberArgumentResolver
    SessionCookieAuthenticationFilter
    ReadmatesOAuthSuccessHandler
  application.port.in
    GetCurrentMemberUseCase
    CreateInvitationUseCase
    AcceptInvitationUseCase
    ManageMemberLifecycleUseCase
    LoginGoogleUserUseCase
  application.port.out
    LoadMemberPort
    SaveMemberPort
    LoadInvitationPort
    SaveInvitationPort
    LoadAuthSessionPort
    SaveAuthSessionPort
  application.service
    AuthSessionService
    GoogleLoginService
    InvitationCommandService
    MemberLifecycleCommandService
    PendingApprovalQueryService
  application.model
    CurrentMember
    CreateInvitationCommand
    MemberLifecycleCommand
    AuthSessionResult
  domain
    Membership
    MembershipRole
    MembershipStatus
    Invitation
    InvitationStatus
    InvitationPolicy
    AuthSession
  adapter.out.persistence
    JdbcMemberAdapter
    JdbcInvitationAdapter
    JdbcAuthSessionAdapter
```

`CurrentMember`는 1차 아키텍처 전환에서는 `shared.security.CurrentMember`에 유지한다. 이 타입은 인증된 멤버 context로만 사용하고, web controller가 직접 repository로 `CurrentMember`를 조회하지 않는 것을 우선 목표로 한다.

### 6.3 archive, note, publication 조회 구조

조회 중심 기능은 CQRS 스타일을 허용한다.

```text
com.readmates.archive
  adapter.in.web
  application.port.in
    GetArchiveSessionsQuery
    GetArchiveSessionDetailQuery
    GetMyRecordsQuery
  application.port.out
    LoadArchiveSessionsPort
    LoadArchiveSessionDetailPort
    LoadMyRecordsPort
  application.model
    ArchiveSessionResult
    ArchiveSessionDetailResult
    MyRecordsResult
  adapter.out.persistence
    JdbcArchiveQueryAdapter
```

```text
com.readmates.publication
  adapter.in.web
  application.port.in
    GetPublicClubQuery
    GetPublicSessionQuery
  application.port.out
    LoadPublicClubPort
    LoadPublicSessionPort
  application.model
    PublicClubResult
    PublicSessionResult
  adapter.out.persistence
    JdbcPublicQueryAdapter
```

현재 `PublicController`에 있는 SQL은 모두 `JdbcPublicQueryAdapter`로 이동한다.

## 7. 계층별 책임

### 7.1 adapter.in.web

- HTTP route, request binding, validation annotation을 담당한다.
- path/query/body를 application command로 변환한다.
- application result를 API response DTO로 변환한다.
- `Repository`, `JdbcTemplate`, SQL, persistence adapter를 직접 알 수 없다.
- 인증된 사용자는 `CurrentMemberArgumentResolver`로 주입받는다.

예시:

```kotlin
@PatchMapping
fun update(member: CurrentMember, @Valid @RequestBody request: UpdateRsvpRequest): RsvpResponse {
    val result = updateRsvpUseCase.update(request.toCommand(member))
    return RsvpResponse.from(result)
}
```

### 7.2 adapter.in.web.assembler

- 여러 use case 결과를 하나의 화면/API response로 조합할 때만 둔다.
- controller가 여러 service를 직접 조합해야 할 때 도입한다.
- assembler는 inbound use case 또는 application service만 의존한다.
- outbound port, persistence adapter, repository, `JdbcTemplate`를 직접 의존하지 않는다.

### 7.3 application.port.in

- 외부에서 호출 가능한 유스케이스 interface다.
- controller는 가능하면 이 interface에 의존한다.
- 이름은 행위 중심으로 짓는다.

예시:

```kotlin
interface UpdateRsvpUseCase {
    fun update(command: UpdateRsvpCommand): RsvpResult
}
```

### 7.4 application.service

- use case 구현체다.
- 비즈니스 흐름, 권한 검증 호출, 트랜잭션 경계를 담당한다.
- outbound port를 조합한다.
- Spring annotation은 여기까지 허용한다.
- `@Transactional`은 기본적으로 여기 둔다.
- API DTO나 `ResponseStatusException`을 반환하거나 던지지 않는다.

### 7.5 application.port.out

- application이 필요로 하는 저장/조회 능력을 interface로 표현한다.
- DB row, SQL, JDBC 타입을 노출하지 않는다.
- 반환 타입은 application model 또는 domain model이다.

예시:

```kotlin
interface SaveSessionParticipationPort {
    fun updateRsvp(memberId: UUID, clubId: UUID, status: RsvpStatus): RsvpResult
}
```

### 7.6 domain

- 상태, 정책, 값 객체, 계산, 불변식 검증을 둔다.
- Spring, JDBC, HTTP, API DTO에 의존하지 않는다.
- 예외가 필요하면 domain/application 예외를 사용한다.
- 단순 CRUD DTO를 억지로 entity로 만들지 않는다. 실제 규칙이 있는 개념만 domain에 둔다.

### 7.7 adapter.out.persistence

- JDBC, JPA, SQL, row mapper, persistence exception 변환을 담당한다.
- outbound port interface를 구현한다.
- DB row를 application/domain model로 변환한다.
- 복잡한 조회 SQL은 이 계층에 둔다.

## 8. 의존성 규칙

허용 방향:

```text
adapter.in.web -> application.port.in
application.service -> application.port.out
application.service -> domain
adapter.out.persistence -> application.port.out
adapter.out.persistence -> application.model/domain
```

금지 방향:

```text
domain -> application
domain -> adapter
application -> adapter.in.web
application -> adapter.out.persistence
application -> Spring MVC
application -> JdbcTemplate
adapter.in.web -> adapter.out.persistence
adapter.in.web -> Repository/JdbcTemplate
```

특히 다음 import는 금지한다.

- `application..*`에서 `..adapter.in.web..*`
- `application..*`에서 `org.springframework.web..*`
- `application..*`에서 `org.springframework.jdbc..*`
- `domain..*`에서 `org.springframework..*`
- `adapter.in.web..*`에서 `org.springframework.jdbc..*`
- `adapter.in.web..*`에서 `..adapter.out.persistence..*`

## 9. 네이밍 규칙

### 9.1 Inbound use case

- 명령: `CreateInvitationUseCase`, `UpdateRsvpUseCase`, `SaveQuestionUseCase`
- 조회: `GetCurrentSessionQuery`, `GetArchiveSessionsQuery`, `GetPublicClubQuery`
- 복합 운영: `ManageHostSessionUseCase`, `ManageMemberLifecycleUseCase`

### 9.2 Application service

- command: `*CommandService`
- query: `*QueryService`
- 작고 단일한 유스케이스는 `UpdateRsvpService`처럼 행위 이름을 써도 된다.

### 9.3 Domain helper

- `Policy`: 규칙 판단
- `Validator`: 입력/상태 검증
- `Calculator`: 계산
- `Factory`: 생성 규칙

### 9.4 Persistence adapter

- `Jdbc*Adapter`: outbound port 구현체
- `*RowMapper`: row to model 변환
- `*Record` 또는 `*Row`: DB 조회 중간 타입

기존 `*Repository` 이름은 다음 중 하나로 정리한다.

- Spring Data/JDBC 저장소 구현 세부사항이면 `adapter.out.persistence`에 남긴다.
- application facade 역할이면 `*Service` 또는 `*QueryService`로 이름을 바꾼다.
- outbound interface는 `*Port`로 이름 붙인다.

## 10. 인증과 인가

현재 컨트롤러마다 반복되는 패턴을 제거한다.

```kotlin
val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
val member = memberAccountRepository.findActiveMemberByEmail(email)
```

목표는 다음과 같다.

- `CurrentMemberArgumentResolver`를 만든다.
- controller method는 `CurrentMember`를 직접 받는다.
- resolver는 Spring Security `Authentication`에서 email 또는 user id를 추출하고 `ResolveCurrentMemberUseCase`를 호출한다.
- host/member/viewer 권한은 application service 또는 별도 policy가 검증한다.
- HTTP 401/403 변환은 web advice가 담당한다.

예시:

```kotlin
fun members(host: CurrentMember): HostMembersResponse =
    hostMembersUseCase.list(host.requireHostCommand())
```

권한 규칙은 controller에 흩뿌리지 않는다. 다만 route 자체가 host 전용임을 빠르게 드러내기 위한 얇은 command 변환은 허용한다.

## 11. 예외와 응답

`ResponseStatusException`은 web adapter 안에서만 사용한다.

application/domain에서는 다음 구조를 사용한다.

```text
ReadmatesException
  errorCode: ReadmatesErrorCode
  detail: String?
```

`ReadmatesErrorCode`는 다음 정보를 가진다.

- HTTP status
- 안정적인 code 문자열
- 기본 메시지
- log level

`@RestControllerAdvice`는 `ReadmatesException`, validation exception, 예상하지 못한 exception을 API response로 변환한다.

기존 API response shape를 유지해야 하는 endpoint는 web response DTO에서 기존 형태를 유지한다. 공통 wrapper 도입은 별도 제품/API 결정이 필요하므로 이번 설계의 필수 목표가 아니다.

## 12. 트랜잭션 정책

- 쓰기 use case의 transaction boundary는 `application.service`에 둔다.
- 읽기 use case는 기본적으로 transaction 없이 실행한다.
- lazy loading이 필요한 JPA 조회 또는 일관된 snapshot이 필요한 조회만 `@Transactional(readOnly = true)`를 사용한다.
- persistence adapter에는 원칙적으로 transaction boundary를 두지 않는다.
- 외부 호출과 DB transaction을 함께 묶지 않는다.
- 이벤트/outbox를 나중에 도입할 경우 transaction commit 전 저장, commit 후 publish 원칙을 따른다.

ReadMates는 현재 JDBC 중심이므로 service method 단위 transaction이 가장 읽기 쉽고 안전하다.

## 13. 조회 모델과 CQRS 정책

Archive, notes, public, feedback document list처럼 복잡한 화면 조회는 도메인 entity를 억지로 조립하지 않는다.

허용 규칙:

- `application.model`에 read result를 둔다.
- outbound port는 화면 요구에 맞는 query result를 반환할 수 있다.
- SQL 최적화는 persistence adapter에서 한다.
- API response DTO는 web adapter에서만 만든다.

금지 규칙:

- persistence adapter가 `adapter.in.web.response`를 반환하지 않는다.
- application query service가 HTTP response DTO를 반환하지 않는다.
- controller가 SQL 조합을 하지 않는다.

이 정책은 `kuke-board`의 article-read CQRS 장점을 ReadMates 단일 모듈에 맞게 축소 적용한 것이다.

## 14. Assembler 정책

Assembler는 presentation adapter에 속한다.

도입 기준:

- 하나의 API response를 만들기 위해 여러 inbound use case 결과를 조합해야 한다.
- 조합이 controller 안에 들어가면 controller가 읽기 어려워진다.
- 조합 자체가 DB transaction을 요구하지 않는다.

미도입 기준:

- controller가 하나의 use case를 호출하고 response로 바꾸면 충분하다.
- 조합이 비즈니스 일관성을 요구한다. 이 경우 application service로 내려야 한다.

Assembler 이름은 `*WebAssembler` 또는 `*ResponseAssembler`로 한다.

## 15. 기능별 마이그레이션 매핑

### 15.1 session/member write flow

대상:

- RSVP
- check-in
- question
- one-line review
- long review
- host session create/update/delete
- attendance confirm
- publication upsert

목표:

- `SessionRepository` facade를 use case/service로 분해한다.
- `CurrentSessionRepository`, `HostSessionRepository`, `SessionParticipationRepository`, `HostSessionDeletionRepository`는 persistence adapter로 이동한다.
- request/response DTO는 web adapter에 둔다.
- `CurrentMember` 해석은 argument resolver로 통일한다.

1차 구현 slice로 가장 적합하다.

### 15.2 auth/member lifecycle

대상:

- current member 조회
- Google login
- auth session issue/revoke
- invitation create/accept/revoke
- host approval
- member suspend/restore/deactivate/leave
- pending approval read

목표:

- `MemberAccountRepository`를 `LoadMemberPort`, `SaveMemberPort` 구현으로 이동한다.
- `InvitationService`, `MemberLifecycleService`, `MemberApprovalService`의 SQL을 adapter로 내린다.
- OAuth/security adapter는 web/security input adapter로 유지한다.
- membership policy는 domain으로 이동한다.

### 15.3 archive/note read flow

대상:

- archive sessions
- archive session detail
- my page
- my questions/reviews
- notes feed
- note session filter

목표:

- query repository가 API DTO를 반환하지 않게 한다.
- `ArchiveResult`, `NotesFeedResult`를 application model로 둔다.
- SQL은 `JdbcArchiveQueryAdapter`, `JdbcNotesQueryAdapter`로 이동한다.
- web response 변환은 controller/assembler에서 한다.

### 15.4 feedback document

대상:

- my feedback document list
- readable document detail
- host document status
- feedback document upload
- parser

목표:

- `FeedbackDocumentParser`에서 `ResponseStatusException`을 제거하고 parse result 또는 domain exception을 반환한다.
- upload validation은 web input validation과 application validation으로 나눈다.
- 저장/조회 SQL은 `JdbcFeedbackDocumentAdapter`로 이동한다.
- host/member attendance 권한 판단은 application service와 policy에 둔다.

### 15.5 publication/public API

대상:

- public club
- public session detail
- public highlights
- public one-liners
- host publication upsert

목표:

- `PublicController`의 SQL을 전부 `JdbcPublicQueryAdapter`로 이동한다.
- public read model은 `PublicClubResult`, `PublicSessionResult`로 분리한다.
- host publication write는 session 또는 publication use case로 분리한다.
- public API는 공개 데이터만 반환한다는 정책을 application query service에서 보장한다.

### 15.6 shared

대상:

- security principal
- common exception/error
- db column mapper utility
- health check

목표:

- feature 비즈니스 규칙을 shared로 올리지 않는다.
- shared는 cross-cutting 기술 지원과 공통 타입만 가진다.
- `HealthController`는 `shared.adapter.in.web`으로 이동할 수 있다.

## 16. 단계별 이행 계획

### Phase 0. 문서와 규칙 고정

- 이 설계 문서를 기준 문서로 둔다.
- 새 코드 작성 시 새 패키지 규칙을 따른다.
- 기존 코드는 feature slice 전환 때만 이동한다.

### Phase 1. Boundary test 추가

- ArchUnit 또는 Kotlin/JUnit 기반 import rule test를 추가한다.
- controller가 repository/JdbcTemplate에 의존하면 실패시킨다.
- application이 web/persistence adapter에 의존하면 실패시킨다.
- domain이 Spring에 의존하면 실패시킨다.

### Phase 2. 인증 principal 정리

- `CurrentMemberArgumentResolver`를 추가한다.
- 새 controller부터 `Authentication?` 대신 `CurrentMember`를 받는다.
- 기존 controller는 feature slice 전환 시 함께 교체한다.

### Phase 3. session/member write flow 전환

- inbound use case와 command/result model을 만든다.
- 기존 repository 코드를 adapter로 감싼다.
- API contract는 유지한다.
- 관련 controller test와 DB test를 통과시킨다.

### Phase 4. auth/member lifecycle 전환

- member/invitation/session storage port를 정의한다.
- lifecycle policy를 domain/application으로 분리한다.
- OAuth success handler는 use case만 호출하게 만든다.

### Phase 5. archive/note/public read model 전환

- API DTO 반환 repository를 application result 반환 adapter로 바꾼다.
- 복잡한 SQL은 adapter에 유지하되 web 의존을 제거한다.
- 공개 데이터 경계를 query service에서 검증한다.

### Phase 6. feedback document 전환

- parser 예외를 application/domain 예외로 바꾼다.
- file validation, parse, save, read 권한을 use case로 분리한다.

### Phase 7. cleanup

- 기존 `application` 패키지의 `*Repository` facade 이름을 제거하거나 adapter로 이동한다.
- 임시 bridge class를 삭제한다.
- architecture 문서와 개발자 가이드를 갱신한다.

## 17. 임시 bridge 허용 규칙

점진 전환 중 다음 bridge를 허용한다.

- 기존 `*Repository`를 바로 이동하기 어렵다면 `Legacy*Adapter`가 outbound port를 구현하고 내부에서 기존 repository를 호출할 수 있다.
- bridge는 `adapter.out.persistence`에 둔다.
- bridge는 web DTO를 반환하지 않는다.
- bridge class에는 제거 대상 phase를 주석으로 남긴다.
- 새 controller나 새 use case는 legacy repository를 직접 주입받지 않는다.

허용하지 않는 bridge:

- controller에서 legacy repository를 계속 주입받는 것
- application service에서 `JdbcTemplate`을 직접 쓰는 것
- application model이 API response DTO typealias가 되는 것

## 18. 테스트 전략

### 18.1 Unit test

- domain policy, validator, calculator는 순수 단위 테스트로 검증한다.
- application service는 fake port를 주입해 흐름과 예외를 검증한다.
- parser는 기존처럼 독립 테스트를 유지한다.

### 18.2 Adapter test

- JDBC adapter는 Testcontainers/MySQL 기반으로 SQL과 row mapping을 검증한다.
- 복잡한 archive/public query는 기존 DB test를 adapter test로 이동한다.

### 18.3 Web test

- controller는 use case mock/fake로 request validation, response mapping, status code를 검증한다.
- security principal resolver는 별도 테스트를 둔다.

### 18.4 Boundary test

최소 규칙:

- `..adapter.in.web..` must not depend on `..adapter.out.persistence..`
- `..adapter.in.web..` must not depend on `JdbcTemplate`
- `..application..` must not depend on `..adapter..`
- `..application..` must not depend on `org.springframework.web..`
- `..domain..` must not depend on `org.springframework..`

## 19. 코드 직관성 규칙

- 한 파일이 여러 책임을 갖기 시작하면 `Reader`, `Manager`, `Policy`, `Mapper`로 나눈다.
- command/result 이름은 화면 이름보다 유스케이스 이름을 따른다.
- response DTO는 API 계약을 설명하고, application result는 비즈니스 결과를 설명한다.
- SQL은 adapter에서 읽기 좋은 private function으로 나누되, domain 규칙을 SQL 안에 숨기지 않는다.
- DB 반복 조회는 피하고 adapter에서 일괄 조회를 기본으로 한다.
- 하드코딩된 상태 문자열은 enum 또는 value object로 이동한다.
- nullable은 외부 입력과 DB optional에만 두고, application 내부에서는 가능한 non-null result로 정리한다.

## 20. 첫 구현 후보

첫 구현은 `session/member write flow`를 추천한다.

이유:

- 현재 컨트롤러에서 repository 직접 호출이 많이 보인다.
- RSVP, check-in, question, review는 사용자 권한과 현재 세션 상태가 중요하다.
- host session write는 트랜잭션과 권한 경계를 검증하기 좋다.
- API contract를 유지하면서 내부 구조만 바꾸기 쉽다.
- 이후 archive와 feedback이 session 결과에 의존하므로 먼저 정리할 가치가 크다.

첫 구현에서 다룰 파일군:

- `server/src/main/kotlin/com/readmates/session/api/*`
- `server/src/main/kotlin/com/readmates/note/api/*`
- `server/src/main/kotlin/com/readmates/session/application/*`
- 관련 `server/src/test/kotlin/com/readmates/session/api/*`
- 관련 `server/src/test/kotlin/com/readmates/note/api/*`

## 21. 승인된 설계 결정

사용자는 2026-04-22 대화에서 다음 결정을 승인했다.

- 전체 서버 기능을 클린 아키텍처 방향으로 전환한다.
- 접근 방식은 기능 전체 매핑 설계다.
- Spring Boot에서는 실용적 스타일을 유지한다.
- 두 레퍼런스 프로젝트를 분석해 장점은 채택하고 단점은 보완한다.
- 최종 아키텍처 문서를 먼저 작성한 뒤 구현 계획으로 넘어간다.
- 첫 구현 후보는 session/member write flow로 둔다.

## 22. Spec Self-Review

- Placeholder scan: 빈 항목 없이 목표 구조, 규칙, 단계, 기능 매핑을 명시했다.
- Internal consistency: 단일 모듈 유지, package-by-feature, port/adapter, 실용적 Spring annotation 허용 원칙이 서로 충돌하지 않는다.
- Scope check: 이 문서는 전체 서버 아키텍처 목표 문서이며, 구현 계획은 별도 vertical slice 계획으로 분리한다.
- Ambiguity check: commerce식 repository 직접 접근은 ReadMates에서 허용하지 않는다고 명시했고, CQRS 조회 모델은 adapter/application result까지만 허용한다고 범위를 제한했다.
