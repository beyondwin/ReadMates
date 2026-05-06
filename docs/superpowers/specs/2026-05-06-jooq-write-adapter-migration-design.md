# JOOQ Write Adapter Migration — 설계 문서

**작성일:** 2026-05-06  
**범위:** write 어댑터 선별 마이그레이션 (복잡한 read 쿼리는 JDBC 유지)  
**목표:** `BatchPreparedStatementSetter` 제거, 조건부 UPDATE 가독성 개선, 다열 INSERT 안전성 확보

---

## 1. 배경 및 동기

현재 프로젝트는 `spring-boot-starter-jdbc` + `JdbcTemplate` 기반 순수 JDBC를 사용한다.
아키텍처는 헥사고날(Ports & Adapters)이고 ArchUnit 테스트가 경계를 강제한다.

코드베이스 전체에 `trimIndent()` SQL 블록이 224개, `dbString()` 호출이 375개 존재한다.
이 중 다음 세 패턴이 명확한 개선 대상이다:

| 패턴 | 현재 문제 | 발생 위치 |
|------|----------|----------|
| `BatchPreparedStatementSetter` | 배치마다 9줄 익명 객체, 인덱스 카운팅 필요 | `NotificationDeliveryWriteOperations`, `HostSessionWriteOperations`, `JdbcMemberLifecycleStoreAdapter` |
| 조건부 UPDATE `CASE WHEN ? THEN ? ELSE col END` | `?` 파라미터 15개+, 순서 실수 시 조용히 잘못된 값 저장 | `HostSessionWriteOperations.updateHostSession` (8군데) |
| 18열+ INSERT `values (?, ?, ..., ?)` | 컬럼-값 순서 불일치가 컴파일 타임에 미검출 | `HostSessionWriteOperations.createDraftSession` |

**범위 제한:** 40줄+ JOIN 쿼리, Window Function, cursor 기반 페이징 등 복잡한 read 쿼리는 현행 JDBC SQL 유지. JOOQ와 JdbcTemplate은 같은 DataSource·트랜잭션 매니저를 공유하므로 공존에 문제 없음.

---

## 2. 아키텍처 결정

### 2-1. 도입 방식

- **점진적 선별 교체** — 이득이 명확한 write 어댑터만 JOOQ DSL로 교체
- 기존 read 어댑터(`JdbcArchiveQueryAdapter`, `JdbcMemberLifecycleStoreAdapter.listMembers` 등)는 변경 없음
- 새로 추가하는 write 코드는 JOOQ DSL로 작성

### 2-2. JOOQ 구성

- **버전:** JOOQ 3.19.x (Spring Boot 4.0 공식 지원 버전)
- **라이선스:** Open Source (MySQL 무료)
- **코드 생성:** `jooq-codegen-gradle` 플러그인 — Testcontainers MySQL을 통해 생성 (Flyway 마이그레이션이 `utc_timestamp(6)`, `ON DUPLICATE KEY UPDATE` 등 MySQL 전용 SQL을 사용하므로 H2 호환 불가)
- **생성 위치:** `server/build/generated/jooq/` (gitignore 대상, 빌드 시 자동 생성)
- **DSLContext 주입:** `@Bean` 으로 등록, persistence adapter에 직접 주입

### 2-3. ArchUnit 수정

현재 `ServerArchitectureBoundaryTest` 의 다음 규칙이 영향받는다:

```kotlin
// 변경 전
"org.springframework.jdbc.."  // persistence adapter에서만 허용

// 변경 후: jooq 패키지 추가
"org.springframework.jdbc..",
"org.jooq.."                  // persistence adapter에서만 허용
```

domain, application 패키지의 JOOQ 의존 금지 규칙은 그대로 유지.

---

## 3. 마이그레이션 대상 파일

### Phase 1: 인프라 셋업

| 작업 | 파일 | 비고 |
|------|------|------|
| JOOQ 의존성 추가 | `server/build.gradle.kts` | `jooq-codegen-gradle` + `spring-boot-starter-jooq` |
| 코드 생성 설정 | `server/build.gradle.kts` | Flyway 마이그레이션 파일 → H2 → JOOQ 클래스 |
| DSLContext 빈 등록 | `shared/config/JooqConfig.kt` (신규) | `DataSource` 에서 생성 |
| ArchUnit 규칙 수정 | `ServerArchitectureBoundaryTest.kt` | `org.jooq..` 허용 추가 |

### Phase 2: `HostSessionWriteOperations.kt`

교체 메서드:

| 메서드 | 패턴 | 기대 효과 |
|--------|------|----------|
| `createDraftSession` | 18열 INSERT | 컬럼-값 쌍으로 순서 안전 |
| `updateHostSession` | CASE WHEN 조건부 UPDATE | `?` 15개 → Kotlin `if` 분기 |
| `createActiveParticipants` | `BatchPreparedStatementSetter` | 9줄 익명 객체 제거 |
| `confirmHostAttendance` | `BatchPreparedStatementSetter` | 동일 |
| `upsertHostPublication` | `ON DUPLICATE KEY UPDATE` | JOOQ MySQL dialect 지원 |

### Phase 3: `NotificationDeliveryWriteOperations.kt`

`BatchPreparedStatementSetter` 15회 사용. 가장 반복적인 보일러플레이트.

### Phase 4: 나머지 write 어댑터 선별

대상 후보:

- `JdbcMemberLifecycleStoreAdapter` — `addToCurrentSession`, `markRemovedFromCurrentSession` (upsert 패턴)
- `JdbcMemberArchiveReviewWriteAdapter` — `saveLongReview` (upsert 패턴)
- `JdbcHostInvitationStoreAdapter` — INSERT 패턴 확인 후 결정

**제외 대상 (변경 없음):**
- `listMembers`, `loadArchiveSessions` 등 복잡한 read 쿼리 전체
- `findCurrentOpenSessionId`, `lockActiveHostRows` 등 단순 SELECT (이미 충분히 깔끔함)

---

## 4. 공존 전략

```
persistence adapter
    ├── DSLContext (JOOQ) → write: INSERT, UPDATE, batch
    └── JdbcTemplate      → read: 복잡한 JOIN, window function
              ↓
         DataSource (공유)
              ↓
           MySQL
```

같은 `@Transactional` 경계 안에서 두 가지가 공존 가능. JOOQ는 EntityManager를 사용하지 않으므로 JPA 혼합 시 발생하는 1차 캐시 불일치 문제가 없음.

---

## 5. MySQL 특화 기능 처리

| 기능 | JOOQ 처리 방식 |
|------|--------------|
| `ON DUPLICATE KEY UPDATE` | `dsl.insertInto(...).onDuplicateKeyUpdate().set(...)` |
| `FOR UPDATE` | `dsl.select(...).forUpdate()` |
| `utc_timestamp(6)` | `DSL.field("utc_timestamp(6)")` 또는 Kotlin LocalDateTime 바인딩 |
| `batchUpdate` | `dsl.batch(queries).execute()` |

---

## 6. 테스트 전략

- 기존 통합 테스트(`ReadmatesMySqlSeedTest`, `MySqlFlywayMigrationTest`)가 회귀를 커버함
- JOOQ 코드 생성은 CI 빌드(`./gradlew build`) 시 자동 실행
- 교체된 각 메서드마다 기존 테스트 통과를 확인하며 진행

---

## 7. 하지 않는 것

- JPA/Hibernate 도입 없음
- Spring Data JDBC 도입 없음
- 복잡한 read 쿼리의 JOOQ DSL 변환 없음 (ROI 없음)
- 기존 JDBC 어댑터의 전면 마이그레이션 없음

---

## 8. 예상 소요

| Phase | 작업량 | 비고 |
|-------|--------|------|
| Phase 1 인프라 셋업 | 2~3시간 | 빌드 설정, 코드 생성 검증 |
| Phase 2 HostSession | 3~4시간 | 가장 복잡, 검증 필요 |
| Phase 3 Notification | 2~3시간 | 반복 패턴, 비교적 단순 |
| Phase 4 나머지 선별 | 2~3시간 | 파일별 판단 후 교체 |
| **합계** | **9~13시간** | |
