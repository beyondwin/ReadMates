# Server Clean Architecture Restructure Design

작성일: 2026-04-23
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates 서버 컨트롤러에 집중된 DTO, SQL, 권한 확인, 파일 검증 책임을 feature별 clean architecture 구조로 재편하기 위한 설계 기준과 전환 계획을 정의한다.

## 1. 문서 범위

이 문서는 ReadMates Spring Boot 서버의 내부 구조 정리를 다룬다.

- feature별 package layout 표준화
- controller, DTO, use case, application service, persistence adapter 책임 분리
- request/response DTO와 application model 경계
- legacy controller 전환 순서
- architecture boundary test 확장
- 기존 API contract를 유지하는 리팩터링 완료 기준

이 문서는 아래 범위를 다루지 않는다.

- API 응답 shape 변경
- 신규 제품 기능 추가
- 프런트엔드 route-first 구조 변경
- DB schema 변경
- 인증 정책 자체 변경
- JPA 전면 전환 또는 ORM 전략 변경

## 2. 현재 서버 상태 진단

서버는 이미 일부 영역에서 clean architecture 전환이 시작되어 있다. `session`과 `note` 쓰기 흐름은 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 방향으로 이동했고, `SessionCleanArchitectureBoundaryTest`가 일부 경계를 검증한다.

확인된 강점:

- `session.adapter.in.web`, `note.adapter.in.web`는 controller가 use case port에 의존하는 구조를 이미 사용한다.
- `session.application.model`, `session.application.port.in`, `session.application.service`, `session.adapter.out.persistence`가 존재한다.
- current member 해석은 `CurrentMemberArgumentResolver`를 통해 controller method parameter로 받을 수 있다.
- controller 테스트와 DB 테스트가 충분히 있어 내부 구조 변경 후 API contract를 검증할 수 있다.

개선이 필요한 부분:

- `publication.api.PublicController`는 public response DTO, SQL, `JdbcTemplate`, row mapping, 조회 흐름을 모두 직접 소유한다.
- `archive.api.ArchiveController`는 DTO 11개, 인증 해석, repository 호출, response shape가 한 파일에 모여 있다.
- `feedback.api.FeedbackDocumentController`는 DTO, 권한 확인, 파일명 검증, content type 판단, UTF-8 decode, 업로드 흐름을 함께 처리한다.
- `auth.api`에는 controller가 application service나 repository 성격의 객체와 직접 맞닿은 legacy 패턴이 남아 있다.
- API용 `data class`가 controller 파일에 대량으로 들어 있어 파일의 목적을 빠르게 파악하기 어렵다.

## 3. 확정된 접근안

선택한 접근은 서버 전체를 feature별 clean architecture package로 재편하는 것이다.

최종 구조는 서버 전체에 적용한다. 단, 실제 구현은 한 번에 모든 파일을 이동하지 않고 feature별로 컴파일 가능한 단계로 진행한다. 각 단계는 API contract를 유지하고, 해당 feature 테스트와 architecture boundary test를 통과해야 완료로 본다.

### 3.1 채택한 방향

- feature package는 유지한다.
- 각 feature 내부를 `adapter`, `application`, `domain`으로 나눈다.
- controller는 HTTP adapter 책임만 맡긴다.
- SQL과 DB row mapping은 persistence adapter로 옮긴다.
- application service는 use case orchestration과 권한 판단을 맡는다.
- request/response DTO는 web adapter 계층에 둔다.
- application 계층은 command/result model만 사용하고 web DTO를 import하지 않는다.

### 3.2 기각한 방향

DTO만 별도 파일로 빼는 방식은 빠르지만 controller에 SQL, repository 호출, 권한 흐름이 남아 근본적인 책임 분리 문제를 해결하지 못한다.

새로운 전역 framework나 별도 모듈 분리는 지금 필요하지 않다. ReadMates는 단일 Spring Boot module로 유지하면서 package boundary와 ArchUnit rule을 강화하는 편이 변경 비용과 안정성의 균형이 좋다.

## 4. 목표 Package 구조

각 feature는 아래 구조를 목표로 한다.

```text
com.readmates.<feature>
  adapter.in.web
    - Controller
    - Request/Response DTO
    - HTTP mapper
  adapter.out.persistence
    - JDBC/JPA repository adapter
    - DB row mapper
  application.port.in
    - Use case interface
  application.port.out
    - Persistence/query port
  application.service
    - Use case implementation
  application.model
    - Command, result model
  domain
    - enum, domain rule, domain value
```

`publication` 전환 후 목표 예시는 다음과 같다.

```text
publication.adapter.in.web.PublicController
publication.adapter.in.web.PublicWebDtos
publication.adapter.in.web.PublicWebMapper
publication.application.port.in.GetPublicClubUseCase
publication.application.port.in.GetPublicSessionUseCase
publication.application.service.PublicQueryService
publication.application.port.out.LoadPublishedPublicDataPort
publication.application.model.PublicResults
publication.adapter.out.persistence.JdbcPublicQueryAdapter
publication.adapter.out.persistence.PublicRows
```

## 5. 책임 분리 규칙

Controller 책임:

- route annotation
- path variable, request body, query parameter parsing
- Bean Validation trigger
- `CurrentMember` method parameter 수신
- use case 호출
- application result를 response DTO로 변환
- HTTP status 결정

Controller 금지 책임:

- `JdbcTemplate` 직접 사용
- SQL 문자열 소유
- repository 직접 주입
- persistence adapter 직접 호출
- DB row model 생성
- 복잡한 권한 판단
- 파일 parsing과 저장 orchestration
- 운영 API용 큰 `data class` 묶음 소유

Application service 책임:

- use case 흐름 조립
- role, membership, session ownership 같은 권한 판단
- command/result model 사용
- outbound port 호출
- domain rule 적용

Persistence adapter 책임:

- SQL 또는 JPA query 소유
- DB row mapping
- DB column 이름과 DB 전용 type 처리
- outbound port 구현

Domain 책임:

- enum
- domain value
- 순수 domain rule
- HTTP, Spring, DB 세부사항을 모르는 모델

## 6. File And DTO Rules

파일 배치는 다음 규칙으로 통일한다.

```text
adapter.in.web
  <Feature>Controller.kt
  <Feature>WebDtos.kt
  <Feature>WebMapper.kt

application.model
  <Feature>Commands.kt
  <Feature>Results.kt

application.port.in
  <UseCaseName>.kt

application.port.out
  <PortName>.kt

application.service
  <Feature>Service.kt

adapter.out.persistence
  Jdbc<Feature>Adapter.kt
  <Feature>Rows.kt
```

`<Feature>WebMapper.kt`는 변환 함수가 3개 이상이거나 중첩 list mapping이 있을 때 만든다. 단순 request `toCommand()`는 request DTO 안에 둘 수 있다.

DTO 규칙:

- Request/response DTO는 `adapter.in.web`에 둔다.
- DTO 이름은 API 표면을 드러낸다. 예: `PublicClubResponse`, `HostSessionRequest`.
- Application 계층은 `Response`, `Request`라는 이름을 쓰지 않는다.
- Application 계층은 `Command`, `Result`, `Summary`, `Detail` 같은 이름을 쓴다.
- Controller 파일에는 새 운영 API용 `data class`를 추가하지 않는다.
- DB row 전용 `data class`는 persistence adapter 안의 `private data class`로 두거나, 여러 개면 `<Feature>Rows.kt`로 분리한다.
- Domain enum/value는 `domain`에 둔다.

## 7. 의존 방향 규칙

허용 방향:

```text
adapter.in.web -> application.port.in
application.service -> application.port.out
adapter.out.persistence -> application.port.out
adapter.out.persistence -> application.model/domain
application.service -> application.model/domain
```

금지 방향:

```text
application -> adapter.in.web
application -> adapter.out.persistence
adapter.in.web -> JdbcTemplate
adapter.in.web -> *Repository
adapter.in.web -> adapter.out.persistence
domain -> adapter/application/web/persistence
```

Controller가 application service implementation class에 직접 의존하지 않고 inbound port interface에 의존하는 것을 기본값으로 한다.

## 8. Migration Order

### 8.1 Publication

`publication`을 첫 번째 대상으로 삼는다.

이유:

- `PublicController`가 SQL, `JdbcTemplate`, DTO, 조회 흐름을 모두 직접 소유한다.
- public API는 인증/권한 흐름이 없어 첫 전환 대상으로 적합하다.
- 전환 효과가 명확하고 테스트 범위가 상대적으로 작다.

전환 목표:

- `publication.api`를 `publication.adapter.in.web`로 이동한다.
- public response DTO를 `PublicWebDtos.kt`로 분리한다.
- SQL을 `JdbcPublicQueryAdapter`로 이동한다.
- 조회 use case port와 `PublicQueryService`를 추가한다.
- public controller DB test가 기존 API shape를 검증한다.

### 8.2 Archive

`archive`를 두 번째 대상으로 삼는다.

이유:

- `ArchiveController`에는 DTO 11개와 인증 해석, repository 호출이 섞여 있다.
- 멤버 앱 접근 권한과 archive query가 함께 있어 application service 분리 효과가 크다.

전환 목표:

- response DTO를 `ArchiveWebDtos.kt`로 분리한다.
- 인증된 member 해석은 가능한 한 `CurrentMember` argument resolver를 사용한다.
- archive 조회 흐름을 inbound port와 application service로 이동한다.
- 기존 archive repository는 outbound port 뒤로 감싼다.

### 8.3 Feedback

`feedback`을 세 번째 대상으로 삼는다.

이유:

- `FeedbackDocumentController`는 파일 검증, 권한 확인, UTF-8 decode, 저장 흐름이 함께 있다.
- upload path는 변경 리스크가 있으므로 publication/archive 후에 전환한다.

전환 목표:

- response DTO를 `FeedbackDocumentWebDtos.kt`로 분리한다.
- 파일명, 확장자, 크기, UTF-8 decode는 web adapter helper 또는 upload validator로 분리한다.
- 업로드 orchestration과 권한 판단은 application service로 이동한다.
- parser와 repository는 application/outbound boundary 뒤에서 호출한다.

### 8.4 Auth

`auth` legacy controller를 네 번째 대상으로 삼는다.

이유:

- 보안과 로그인 흐름은 변경 리스크가 크다.
- Google OAuth, session cookie, dev-login, password-disabled endpoints가 섞여 있어 작은 단위로 나눠야 한다.

전환 목표:

- 운영 auth controller부터 inbound port 의존으로 이동한다.
- dev-only controller와 disabled password endpoints는 명시적인 legacy 또는 dev adapter 예외로 둘 수 있다.
- security filter와 OAuth infrastructure는 `infrastructure.security` 유지 여부를 별도 판단한다.

### 8.5 Session And Note Finish

이미 전환된 `session`과 `note`는 마지막에 마감한다.

전환 목표:

- controller 파일 안의 DTO를 필요에 따라 `*WebDtos.kt`로 분리한다.
- mapper가 커진 controller는 `*WebMapper.kt`로 분리한다.
- architecture boundary test 범위를 전체 서버 규칙과 맞춘다.

## 9. Testing And Completion Criteria

각 feature 전환 완료 조건:

- Controller가 repository, `JdbcTemplate`, SQL 문자열에 직접 의존하지 않는다.
- Controller 안에 운영 API용 큰 `data class` 묶음이 없다.
- Controller는 inbound port interface에 의존한다.
- Application service는 web DTO를 import하지 않는다.
- Persistence adapter는 DB row mapping과 SQL을 소유한다.
- 기존 controller/unit/db 테스트가 같은 API contract로 통과한다.
- 중첩 response mapping이 많은 feature는 mapper 테스트를 추가한다.

전체 재편 완료 조건:

- `SessionCleanArchitectureBoundaryTest`를 `ServerArchitectureBoundaryTest` 성격으로 확장한다.
- 전체 `adapter.in.web`가 `JdbcTemplate`, `*Repository`, `adapter.out.persistence`에 직접 의존하지 않는지 검증한다.
- 전체 `application`이 `adapter.in.web`, `adapter.out.persistence`에 의존하지 않는지 검증한다.
- `domain`이 adapter, application service, Spring web, persistence 세부사항에 의존하지 않는지 검증한다.
- `./server/gradlew -p server clean test`가 통과한다.

단계별 테스트 실행 기준:

```bash
./server/gradlew -p server test --tests '*Public*'
./server/gradlew -p server test --tests '*Archive*'
./server/gradlew -p server test --tests '*Feedback*'
./server/gradlew -p server test --tests 'com.readmates.architecture.*'
./server/gradlew -p server clean test
```

## 10. Non-Goals And Guardrails

이번 리팩터링은 내부 구조 정리가 목적이다.

- API response field 이름을 바꾸지 않는다.
- HTTP status를 의도 없이 바꾸지 않는다.
- frontend contract를 깨지 않는다.
- DB schema를 바꾸지 않는다.
- SQL 성능 튜닝을 동시에 진행하지 않는다.
- auth policy 변경을 구조 변경과 섞지 않는다.
- 모든 legacy repository를 한 번에 제거하려고 하지 않는다.

기존 package 이동으로 test import가 바뀌는 것은 허용한다. 단, 테스트가 검증하는 API behavior는 유지한다.

## 11. Implementation Plan Handoff

이 spec이 승인되면 implementation plan은 다음 단위로 쪼갠다.

1. `publication` package 전환
2. server-wide architecture boundary test 확장 초안
3. `archive` package 전환
4. `feedback` package 전환
5. `auth` 잔여 controller 전환
6. `session` / `note` DTO와 mapper 마감
7. 전체 서버 테스트와 문서 갱신

각 implementation 단계는 별도 커밋 가능한 단위로 계획한다.
