# ADR-0007: MySQL 8 + Flyway (Liquibase/Prisma migrate 기각)

- 상태: Accepted
- 결정일: 2026-04-19
- 작성자: 서버/데이터
- 관련: ADR-0002 (clean architecture), ADR-0004 (notification outbox),
  `server/src/main/resources/db/mysql/migration/`,
  `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`,
  `docs/development/architecture.md`

## 컨텍스트

ReadMates의 핵심 데이터(멤버십, 세션, 기록, 피드백 문서, 알림 상태)는 일관성이 중요한 관계형 데이터다. DB 선택과 schema migration 관리 방식을 결정해야 했다.

### 요구사항

**기능적 요구사항**:
- 세션 state machine (`DRAFT → OPEN → CLOSED → PUBLISHED`)
- 멤버십 lifecycle (`PENDING_APPROVAL → ACTIVE → SUSPENDED`)
- 알림 deliveries 상태 추적 (`PENDING → SENDING → SENT / FAILED / DEAD`)
- club context별 데이터 분리 (multi-tenancy lite)
- 트랜잭션 일관성 (mutation + outbox 동일 트랜잭션)

**운영 제약**:
- **Zero-cost 운영**: OCI Always Free tier를 사용한다. 관리형 PostgreSQL은 OCI Always Free에 없다.
- **명시적 forward-only migration**: ORM의 implicit DDL을 운영 DB에 적용하지 않는다.
- **schema가 코드 리뷰에서 보여야 한다**: schema 변경이 diff에서 명확히 보여야 한다.
- **테스트 환경 동일성**: CI/CD와 로컬 테스트가 운영과 동일한 DB 버전/schema에서 실행되어야 한다.

### Migration 도구 후보

- **Flyway**: SQL 파일 기반 순차 migration. checksum 검증.
- **Liquibase**: XML/YAML/JSON changeset 추상화. rollback changeset 지원.
- **Prisma Migrate**: Node.js ORM 기반 migration. TypeScript 타입 생성.
- **Drizzle**: 경량 Node.js ORM. TypeScript-first.

### DB 후보

- **MySQL 8**: OCI MySQL HeatWave Always Free. 운영 비용 0원.
- **PostgreSQL**: OCI Always Free에 관리형 서비스 없음. self-managed 필요.
- **SQLite**: production 운영에는 적합하지 않음.
- **H2**: 개발/테스트 전용. production 운영 불가.

## 결정

**MySQL 8** + **Flyway**로 schema를 관리한다.

**DB 선택**: OCI MySQL HeatWave free tier를 운영 DB로 사용한다.

**Migration 방식**: `server/src/main/resources/db/mysql/migration/` 아래 `V{N}__{description}.sql` 파일로 관리한다. Flyway가 startup 시 순서대로 적용한다. 이미 적용된 파일의 checksum이 변경되면 startup이 실패한다.

**Forward-only 원칙**: rollback migration 파일(`R__` prefix)을 작성하지 않는다. schema rollback이 필요하면 새 forward migration으로 처리한다.

**Reversible pair 패턴**: 위험한 변경(컬럼 rename, drop)은 두 번의 배포로 나눈다:
- 배포 1: 새 컬럼 추가 또는 rename (V24)
- 배포 2: 구 컬럼 제거 (V25)

배포 1과 2 사이에 안전성을 확인하고 롤백이 필요하면 새 migration으로 원상복구한다.

**JPA/Hibernate 미사용**: `JdbcTemplate`을 직접 사용한다. SQL이 application code에 명시적으로 존재한다.

**Testcontainers**: 테스트 환경에서 MySQL 컨테이너를 실행해 운영과 동일한 버전/schema를 사용한다. `MySqlFlywayMigrationTest`가 모든 migration을 CI에서 검증한다.

**Flyway Spring Boot 설정 (`application.yml`):**
```yaml
spring:
  flyway:
    locations: classpath:db/mysql/migration   # production migration 경로
    out-of-order: false                        # 버전 순서 강제
    baseline-on-migrate: false                 # 기존 DB에 baseline 없이 실패
```

테스트 환경에서는 `spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev`로 dev seed migration을 추가 적용한다. dev seed는 테스트 전용 seed data(`V1001__seed_*.sql` 형식)를 포함하며, 운영 DB에는 절대 적용되지 않는다.

**버전 번호 gap 정책**: `V2`~`V8`은 초기 개발 중 통합되거나 삭제된 migration 번호다. gap이 존재해도 `out-of-order=false`가 현재 파일의 버전 순서를 강제한다. 새 migration은 현재 최신 번호(`V26`) 다음인 `V27`부터 시작한다.

### 현재 migration 파일 목록

`V1`~`V26` 범위에 총 19개 migration 파일 (버전 번호 gap은 초기 개발 중 통합된 migration에 해당):

| 버전 | 설명 |
|------|------|
| V1 | 초기 baseline schema |
| V9 | Google OAuth pending approval 상태 |
| V10 | 멤버 lifecycle, 세션 관리 |
| V11 | viewer 멤버십 상태 |
| V12 | 읽기 진행도, 세션 공개 범위 |
| V13 | 멤버 표시 이름 유일성 |
| V14 | 세션 기록 공개 범위 |
| V15 | 세션 공개 범위 개선 |
| V16 | notification outbox 초기 테이블 |
| V17 | DB 쿼리 최적화 인덱스 |
| V18 | 알림 설정, 테스트 메일 audit |
| V19 | outbox metadata 컬럼 추가 |
| V20 | Kafka notification 파이프라인 (전체 재설계) |
| V21 | multi-club platform (`club_domains` 테이블) |
| V22 | note count 쿼리 인덱스 |
| V23 | 세션 state/visibility 불변식 constraint |
| V24 | legacy password hash rename (reversible pair 1단계) |
| V25 | legacy password hash drop (reversible pair 2단계) |
| V26 | BFF secret rotation audit 테이블 |

## 근거

### SQL이 source of truth

Flyway migration 파일이 SQL이다. schema 변경이 PR diff에서 즉시 보인다:
- "이 migration이 어떤 컬럼을 추가하는가" — SQL 파일 한 줄로 확인
- "이 constraint가 왜 추가됐는가" — SQL 주석과 PR description
- "V20이 V16을 왜 대체하는가" — git history에서 추적 가능

ORM의 `@Column`, `@Table` annotation 변경으로 schema가 바뀌는 방식은 변경 의도가 덜 명확하다.

### OCI free tier 호환

OCI MySQL HeatWave는 Oracle이 운영하는 MySQL 8 관리형 서비스다. OCI Always Free tier에서 사용 가능하다. 운영 비용 0원. 자동 백업, 패치, 가용성 관리가 OCI 책임이다.

PostgreSQL은 OCI Always Free에 관리형 서비스가 없어 VM에 직접 설치해야 한다. 백업, 패치, 재시작 관리가 추가 운영 부담이다.

### Flyway checksum으로 drift 방지

Flyway는 이미 적용된 migration 파일의 checksum을 `flyway_schema_history`에 저장한다. 파일 내용이 변경되면 startup이 `FlywayException: Checksum mismatch for migration V5` 등의 오류로 실패한다.

이 동작이 "production에 적용된 migration 파일은 절대 수정하지 않는다"는 규칙을 코드 수준에서 강제한다.

### Testcontainers 동일 버전

`MySqlFlywayMigrationTest`가 Testcontainers MySQL을 실행해 모든 migration을 순서대로 적용하고 실패 없이 완료되는지 검증한다:

```bash
./server/gradlew -p server test --tests "com.readmates.support.MySqlFlywayMigrationTest"
```

새 migration이 추가될 때마다 이 테스트가 CI에서 실행된다. 잘못된 SQL syntax나 constraint violation이 즉시 발견된다.

### Reversible pair 패턴

`V24__legacy_password_hash_rename.sql` + `V25__drop_legacy_password_hash.sql`이 실제 적용된 패턴이다:

- V24: `ALTER TABLE members RENAME COLUMN password_hash TO legacy_password_hash` — rename으로 구 컬럼을 새 이름으로 이동. 코드는 이 시점에서 구 이름을 더 이상 참조하지 않도록 업데이트.
- V25: `ALTER TABLE members DROP COLUMN legacy_password_hash` — 구 컬럼 완전 제거.

V24 배포 후 운영 상태를 확인하고 안전하면 V25를 별도 배포한다. V24 배포 직후 문제가 발견되면 V26(rename back)을 forward migration으로 추가해 롤백한다.

### JPA 미사용 이유

ORM의 편의성은 있지만 다음 단점을 피하기 위해 `JdbcTemplate`을 직접 사용한다:
- ORM의 implicit DDL이 운영 DB에 적용되지 않도록 (`spring.jpa.hibernate.ddl-auto=validate`도 위험)
- SQL이 코드에 명시적이어서 코드 리뷰에서 schema 변경이 보임
- N+1 query, Lazy loading 의도치 않은 트리거 등 ORM 특유의 문제 없음
- 테스트에서 실제 DB 없이 mock `JdbcTemplate`만으로 단위 테스트 가능

ArchUnit(`ADR-0002`)이 persistence adapter가 `JdbcTemplate`을 직접 주입받도록 강제한다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| PostgreSQL + Flyway | OCI Always Free에 관리형 PostgreSQL이 없다. self-managed PostgreSQL은 운영 부담 증가. MySQL 대비 기능 차이가 현재 요구사항에서 유의미하지 않다. |
| MySQL + Liquibase | Liquibase는 XML/YAML 기반 changeset 추상화다. SQL을 직접 읽는 것보다 명확하지 않다. changeset ID 관리, rollback changeset 작성이 추가 부담이다. SQL을 직접 쓸 수 있는 Flyway가 더 단순하다. |
| Prisma Migrate | Node.js/TypeScript ORM이다. Spring Boot backend에서 Prisma는 생태계 불일치다. Kotlin + JVM 생태계와 맞지 않는다. |
| Drizzle | Prisma와 유사한 이유. Node.js/TypeScript ORM. Spring + JVM 생태계와 맞지 않는다. |
| ORM implicit DDL (Hibernate `hbm2ddl.auto=update`) | 운영 DB에서 자동 DDL은 위험하다. 의도치 않은 컬럼 수정/삭제 가능성. 변경 이력이 코드 diff가 아닌 DB history에서만 보인다. |
| jOOQ + Flyway | jOOQ는 DB schema에서 type-safe query builder를 생성한다. 빌드 타임 타입 안전성이 높아진다. 단, 초기 설정과 code generation 파이프라인 비용이 있다. ADR-0011 후보로 검토 예정. |

## 결과

긍정적:
- schema 진화가 SQL 파일로 명시적이어서 git diff로 변경 의도가 자명하다.
- `MySqlFlywayMigrationTest`가 CI에서 모든 migration의 idempotency를 검증한다.
- Testcontainers로 테스트 환경이 운영과 동일한 MySQL 버전/schema를 사용한다.
- OCI MySQL HeatWave free tier 활용으로 DB 운영 비용이 없다.
- Flyway checksum 검증으로 "이미 배포된 migration 파일 수정" 실수를 startup 시점에 발견한다.
- reversible pair 패턴으로 위험한 schema 변경을 안전하게 처리한다.

부정적/감수한 비용:
- Forward-only. rollback이 필요하면 새 migration을 작성해야 한다. 실수한 migration을 즉시 취소하기 어렵다.
- OCI MySQL에 종속된다. 플랫폼 이전 시 DB migration 작업이 필요하다.
- `JdbcTemplate` 직접 사용으로 복잡한 쿼리를 직접 최적화해야 한다. 빌드 타임 타입 안전성이 없다.
- schema 변경 시마다 migration 파일 작성이 필요하다.

## 검증

migration 통합 테스트:
```bash
./server/gradlew -p server test --tests "com.readmates.support.MySqlFlywayMigrationTest"
```

전체 서버 테스트 (Testcontainers MySQL 포함):
```bash
./server/gradlew -p server clean test
```

기대: V1~V26 (19개) migration이 순서대로 적용되고 schema constraint 검증 통과.

migration 파일 추가 규칙 검증:
- 새 migration 파일이 `V{N+1}__{설명}.sql` 형식인지 확인
- 기존 migration 파일을 수정하면 `FlywayException: Checksum mismatch` 발생 확인 (startup 실패)

## 후속 작업

- jOOQ write adapter migration: `JdbcTemplate` 직접 SQL에서 jOOQ type-safe query builder로 전환. 빌드 타임 SQL 오류 발견 가능. ADR-0011 후보.
- zero-downtime schema change 패턴 명문화: column rename, NOT NULL 컬럼 추가, index 추가 등 각 변경 유형의 안전한 적용 순서 문서화.
- migration 자동화 검증 강화: `MySqlFlywayMigrationTest`에서 각 migration 후 핵심 constraint와 index 존재를 assert 추가.
- OCI MySQL version upgrade 절차 문서화.
- Flyway `outOfOrder` 정책 결정: 현재 `spring.flyway.out-of-order=false`(기본값)로 설정되어 있다. 버전 번호 gap(V2-V8)이 존재하는 상태에서 outOfOrder=true를 허용할지 명시적 정책 결정 필요.
- Testcontainers MySQL 버전 고정 정책: `MySqlFlywayMigrationTest`에서 사용하는 MySQL 이미지 버전이 운영 OCI MySQL HeatWave 버전과 일치해야 한다. 버전 표시 방식(fixed tag vs latest) 문서화.
- 대규모 테이블 online DDL 패턴: 데이터가 많은 테이블에 index 추가 또는 NOT NULL 컬럼 추가 시 MySQL 8의 online DDL 지원 여부와 lock 전략을 migration SQL에 명시하는 패턴 가이드 필요.
