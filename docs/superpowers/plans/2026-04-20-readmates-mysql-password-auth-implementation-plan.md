# ReadMates MySQL Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ReadMates to OCI MySQL HeatWave Always Free and replace Google OAuth with invite-based email/password authentication using HttpOnly cookie sessions.

**Architecture:** Keep Vercel as the public origin and BFF, run Spring Boot on OCI Compute, and use OCI MySQL HeatWave as the production RDB. Introduce a MySQL Flyway location, convert PostgreSQL-specific repository SQL to MySQL-compatible SQL, then layer password sessions, invitation password setup, manual password reset, and BFF secret protection on top.

**Tech Stack:** Kotlin/Spring Boot 4, JdbcTemplate, Flyway, MySQL Connector/J, Testcontainers MySQL, Next.js App Router, React, Vitest, Playwright, Vercel, OCI MySQL HeatWave, OCI Object Storage.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-20-readmates-password-auth-oci-free-tier-design.md`
- Existing invite implementation: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Existing auth resolver: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Existing Spring security config: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Existing BFF proxy: `front/app/api/bff/[...path]/route.ts`
- Existing login UI: `front/features/auth/components/login-card.tsx`
- Existing invite UI: `front/features/auth/components/invite-acceptance-card.tsx`
- Existing host invitation UI: `front/features/host/components/host-invitations.tsx`

## Scope Check

This spec touches DB dialect, authentication, frontend auth UI, and deployment. These pieces are coupled enough to ship as one migration because the password auth work depends on new schema and session tables, and the frontend cannot be verified until the backend auth contract exists. The implementation still uses phase commits so each large boundary is reviewable.

## File Structure

### Backend Build And Database

- Modify: `server/build.gradle.kts`
  - Replace PostgreSQL runtime dependencies with MySQL runtime dependencies.
  - Add Testcontainers MySQL support.
- Modify: `server/src/main/resources/application.yml`
  - Default datasource becomes MySQL-compatible.
  - Flyway location becomes configurable and defaults to MySQL migrations.
- Modify: `server/src/main/resources/application-dev.yml`
  - Dev Flyway location points to MySQL migration and MySQL dev seed.
- Create: `server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql`
  - Clean MySQL baseline schema for production and tests.
- Create: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
  - MySQL-compatible seed for the existing ReadMates demo club.
- Create: `server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt`
  - Shared MySQL container registration for DB-backed tests.
- Modify: DB-backed tests under `server/src/test/kotlin/com/readmates/**`
  - Import `MySqlTestContainer`.
  - Use `spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev`.

### Backend Shared DB Helpers

- Create: `server/src/main/kotlin/com/readmates/shared/db/DbColumns.kt`
  - UUID and UTC datetime read/write helpers.
- Modify:
  - `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
  - `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
  - `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentRepository.kt`
  - `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
  - `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`
  - Replace PostgreSQL-only SQL and typed UUID/OffsetDateTime result reads.

### Backend Password Auth

- Create: `server/src/main/kotlin/com/readmates/auth/application/PasswordHasher.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/PasswordResetService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/PasswordAuthController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Remove OAuth login wiring.
  - Add BFF secret, session cookie auth, CSRF/origin protections.
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
  - Resolve current member from cookie session rather than Google OAuth authentication.
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - Add invited name and password setup acceptance.

### Frontend Auth

- Modify: `front/app/api/bff/[...path]/route.ts`
  - Add `READMATES_BFF_SECRET` to upstream requests.
- Modify: `front/shared/api/readmates.ts`
  - Add password auth DTOs.
- Modify: `front/features/auth/components/login-card.tsx`
  - Replace Google OAuth button with email/password form.
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
  - Replace Google continuation with password setup form.
- Create: `front/features/auth/components/password-reset-card.tsx`
- Create: `front/app/(public)/reset-password/[token]/page.tsx`
- Modify: `front/features/auth/actions/invitations.ts`
  - Add password-based accept action.
- Create: `front/features/auth/actions/password-auth.ts`
  - Login, logout, password reset actions.
- Modify: `front/features/host/components/host-invitations.tsx`
  - Add invited name input.
- Modify: host/member nav components only where needed for logout and reset links.

### Deployment

- Create: `docs/deploy/oci-mysql-heatwave.md`
  - OCI resources, network, environment variables, migration, and smoke test checklist.
- Create: `deploy/oci/export-mysql.sh`
  - MySQL logical export upload entry point.
- Create: `deploy/oci/readmates-server.service`
  - systemd unit for Spring Boot jar deployment.
- Update: `.env.example`
  - MySQL, BFF secret, password auth, and Vercel variables.
- Update: `README.md`
  - Run/test/deploy instructions match password auth and MySQL.

---

### Task 1: MySQL Runtime And Flyway Foundation

**Files:**
- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/resources/application-dev.yml`
- Create: `server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql`
- Create: `server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt`
- Create: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the failing MySQL migration smoke test**

Create `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`:

```kotlin
package com.readmates.support

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration",
        "spring.jpa.hibernate.ddl-auto=validate",
    ],
)
class MySqlFlywayMigrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `mysql baseline creates auth session and feedback document tables`() {
        val tableCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.tables
            where table_schema = database()
              and table_name in ('users', 'auth_sessions', 'session_feedback_documents')
            """.trimIndent(),
            Int::class.java,
        )

        assertEquals(3, tableCount)
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run the smoke test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: compilation fails because `MySqlTestContainer` does not exist.

- [x] **Step 3: Switch Gradle dependencies to MySQL**

Modify `server/build.gradle.kts` dependencies so the database-related lines are:

```kotlin
implementation("org.springframework.boot:spring-boot-starter-flyway")
runtimeOnly("org.flywaydb:flyway-mysql")
runtimeOnly("com.mysql:mysql-connector-j")
testImplementation("org.testcontainers:mysql:2.0.2")
```

Remove these runtime lines from the active dependency list:

```kotlin
runtimeOnly("org.flywaydb:flyway-database-postgresql")
runtimeOnly("org.postgresql:postgresql")
```

- [x] **Step 4: Add the shared MySQL Testcontainer**

Create `server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt`:

```kotlin
package com.readmates.support

import org.springframework.test.context.DynamicPropertyRegistry
import org.testcontainers.containers.MySQLContainer
import org.testcontainers.utility.DockerImageName

object MySqlTestContainer {
    private val container = ReadmatesMySQLContainer().apply {
        withDatabaseName("readmates")
        withUsername("readmates")
        withPassword("readmates")
        start()
    }

    fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
        registry.add("spring.datasource.url", container::getJdbcUrl)
        registry.add("spring.datasource.username", container::getUsername)
        registry.add("spring.datasource.password", container::getPassword)
        registry.add("spring.datasource.hikari.maximum-pool-size") { "2" }
        registry.add("spring.datasource.hikari.minimum-idle") { "0" }
    }

    private class ReadmatesMySQLContainer : MySQLContainer<ReadmatesMySQLContainer>(
        DockerImageName.parse("mysql:8.4"),
    )
}
```

- [x] **Step 5: Update application datasource defaults**

Modify `server/src/main/resources/application.yml` database settings to:

```yaml
spring:
  application:
    name: readmates-server
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC}
    username: ${SPRING_DATASOURCE_USERNAME:readmates}
    password: ${SPRING_DATASOURCE_PASSWORD:readmates}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true
    locations: ${READMATES_FLYWAY_LOCATIONS:classpath:db/mysql/migration}
```

Keep the existing `management` and `readmates.app-base-url` sections below this block.

- [x] **Step 6: Update dev Flyway locations**

Modify `server/src/main/resources/application-dev.yml` to:

```yaml
spring:
  flyway:
    locations: classpath:db/mysql/migration,classpath:db/mysql/dev

readmates:
  dev:
    login-enabled: true
    google-oauth-auto-member-enabled: false
```

- [x] **Step 7: Add the MySQL production baseline migration**

Create `server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql`:

```sql
create table clubs (
  id char(36) primary key,
  slug varchar(80) not null unique,
  name varchar(120) not null,
  tagline varchar(255) not null,
  about text not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6)
);

create table users (
  id char(36) primary key,
  google_subject_id varchar(255),
  email varchar(320) not null unique,
  name varchar(120) not null,
  profile_image_url varchar(1000),
  password_hash varchar(255),
  password_set_at datetime(6),
  last_login_at datetime(6),
  auth_provider varchar(30) not null default 'PASSWORD',
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint users_auth_provider_check check (auth_provider in ('PASSWORD', 'GOOGLE'))
);

create unique index users_google_subject_id_idx on users (google_subject_id);

create table memberships (
  id char(36) primary key,
  club_id char(36) not null,
  user_id char(36) not null,
  role varchar(20) not null,
  status varchar(20) not null,
  joined_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint memberships_club_fk foreign key (club_id) references clubs(id),
  constraint memberships_user_fk foreign key (user_id) references users(id),
  constraint memberships_role_check check (role in ('MEMBER', 'HOST')),
  constraint memberships_status_check check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  unique (club_id, user_id),
  unique (id, club_id)
);

create table invitations (
  id char(36) primary key,
  club_id char(36) not null,
  invited_by_membership_id char(36) not null,
  invited_email varchar(320) not null,
  invited_name varchar(120) not null,
  role varchar(20) not null,
  token_hash varchar(64) not null unique,
  status varchar(20) not null,
  expires_at datetime(6) not null,
  accepted_at datetime(6),
  accepted_user_id char(36),
  revoked_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint invitations_club_fk foreign key (club_id) references clubs(id),
  constraint invitations_inviter_fk foreign key (invited_by_membership_id) references memberships(id),
  constraint invitations_accepted_user_fk foreign key (accepted_user_id) references users(id),
  constraint invitations_status_check check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  constraint invitations_role_check check (role in ('MEMBER', 'HOST'))
);

create index invitations_club_email_idx on invitations (club_id, invited_email);
create index invitations_club_created_idx on invitations (club_id, created_at);

create table auth_sessions (
  id char(36) primary key,
  user_id char(36) not null,
  session_token_hash varchar(64) not null unique,
  created_at datetime(6) not null default current_timestamp(6),
  last_seen_at datetime(6) not null default current_timestamp(6),
  expires_at datetime(6) not null,
  revoked_at datetime(6),
  user_agent text,
  ip_hash varchar(64),
  constraint auth_sessions_user_fk foreign key (user_id) references users(id)
);

create index auth_sessions_user_idx on auth_sessions (user_id, expires_at);

create table password_reset_tokens (
  id char(36) primary key,
  user_id char(36) not null,
  token_hash varchar(64) not null unique,
  created_by_membership_id char(36) not null,
  created_at datetime(6) not null default current_timestamp(6),
  expires_at datetime(6) not null,
  used_at datetime(6),
  revoked_at datetime(6),
  constraint password_reset_tokens_user_fk foreign key (user_id) references users(id),
  constraint password_reset_tokens_creator_fk foreign key (created_by_membership_id) references memberships(id)
);

create index password_reset_tokens_user_idx on password_reset_tokens (user_id, expires_at);

create table sessions (
  id char(36) primary key,
  club_id char(36) not null,
  number integer not null,
  title varchar(255) not null,
  book_title varchar(255) not null,
  book_author varchar(255) not null,
  book_translator varchar(255),
  book_link varchar(1000),
  book_image_url varchar(1000),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  location_label varchar(255) not null,
  meeting_url varchar(1000),
  meeting_passcode varchar(255),
  question_deadline_at datetime(6) not null,
  state varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint sessions_club_fk foreign key (club_id) references clubs(id),
  constraint sessions_state_check check (state in ('DRAFT', 'OPEN', 'CLOSED', 'PUBLISHED')),
  unique (id, club_id),
  unique (club_id, number)
);

create table session_participants (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  rsvp_status varchar(20) not null,
  attendance_status varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint session_participants_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_participants_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint session_participants_rsvp_status_check check (rsvp_status in ('NO_RESPONSE', 'GOING', 'MAYBE', 'DECLINED')),
  constraint session_participants_attendance_status_check check (attendance_status in ('UNKNOWN', 'ATTENDED', 'ABSENT')),
  unique (session_id, membership_id)
);

create table reading_checkins (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  reading_progress integer not null,
  note text not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint reading_checkins_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint reading_checkins_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint reading_checkins_progress_check check (reading_progress between 0 and 100),
  unique (session_id, membership_id)
);

create table questions (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  priority integer not null,
  text text not null,
  draft_thought text,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint questions_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint questions_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint questions_priority_check check (priority between 1 and 5),
  constraint questions_text_check check (length(trim(text)) > 0),
  unique (session_id, membership_id, priority)
);

create table one_line_reviews (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  text varchar(500) not null,
  visibility varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint one_line_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint one_line_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint one_line_reviews_text_check check (length(trim(text)) > 0),
  constraint one_line_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);

create table long_reviews (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  body text not null,
  visibility varchar(20) not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint long_reviews_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint long_reviews_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint long_reviews_body_check check (length(trim(body)) > 0),
  constraint long_reviews_visibility_check check (visibility in ('PRIVATE', 'PUBLIC')),
  unique (session_id, membership_id)
);

create table highlights (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36),
  text text not null,
  sort_order integer not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint highlights_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint highlights_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint highlights_text_check check (length(trim(text)) > 0),
  constraint highlights_sort_order_check check (sort_order >= 0),
  unique (session_id, sort_order)
);

create table public_session_publications (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  public_summary text not null,
  is_public boolean not null default false,
  published_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint public_session_publications_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint public_session_publications_summary_check check (length(trim(public_summary)) > 0),
  constraint public_session_publications_published_at_check check (not is_public or published_at is not null),
  unique (session_id)
);

create table feedback_reports (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  membership_id char(36) not null,
  version integer not null,
  stored_path varchar(500) not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint feedback_reports_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint feedback_reports_membership_club_fk foreign key (membership_id, club_id) references memberships(id, club_id),
  constraint feedback_reports_version_check check (version > 0),
  constraint feedback_reports_stored_path_check check (length(trim(stored_path)) > 0),
  constraint feedback_reports_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%'),
  constraint feedback_reports_content_type_check check (content_type = 'text/html'),
  constraint feedback_reports_file_size_check check (file_size > 0),
  unique (session_id, membership_id, version)
);

create table session_feedback_documents (
  id char(36) primary key,
  club_id char(36) not null,
  session_id char(36) not null,
  version integer not null,
  source_text longtext not null,
  file_name varchar(255) not null,
  content_type varchar(100) not null,
  file_size bigint not null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  constraint session_feedback_documents_session_club_fk foreign key (session_id, club_id) references sessions(id, club_id),
  constraint session_feedback_documents_version_check check (version > 0),
  constraint session_feedback_documents_source_text_check check (length(trim(source_text)) > 0),
  constraint session_feedback_documents_file_name_check check (length(trim(file_name)) > 0 and file_name not like '%/%' and instr(file_name, char(92)) = 0),
  constraint session_feedback_documents_content_type_check check (content_type in ('text/markdown', 'text/plain')),
  constraint session_feedback_documents_file_size_check check (file_size > 0),
  unique (session_id, version)
);
```

- [x] **Step 8: Run the migration smoke test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 9: Commit the MySQL foundation**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml server/src/main/resources/application-dev.yml server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt
git commit -m "build: add mysql flyway foundation"
```

---

### Task 2: MySQL Test Harness And Dev Seed

**Files:**
- Create: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: DB-backed tests under `server/src/test/kotlin/com/readmates/**`
- Create: `server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt`

- [x] **Step 1: Write the failing seed verification test**

Create `server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt`:

```kotlin
package com.readmates.support

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "spring.jpa.hibernate.ddl-auto=validate",
    ],
)
class ReadmatesMySqlSeedTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `mysql dev seed creates readmates club host and six archived sessions`() {
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from clubs where slug = 'reading-sai'", Int::class.java))
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from memberships where role = 'HOST' and status = 'ACTIVE'", Int::class.java))
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from sessions where state = 'PUBLISHED'", Int::class.java))
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run the seed test and verify it fails**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: test fails because `classpath:db/mysql/dev` has no seed script.

- [x] **Step 3: Add the MySQL dev seed**

Create `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql` by porting the current `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` with these concrete rules:

```sql
set @club_id = '00000000-0000-0000-0000-000000000001';

insert into clubs (id, slug, name, tagline, about)
values (
  @club_id,
  'reading-sai',
  '읽는사이',
  '함께 읽고 각자의 언어로 남기는 독서모임',
  '읽는사이는 초대 기반으로 운영되는 작은 독서모임입니다.'
)
on duplicate key update
  name = values(name),
  tagline = values(tagline),
  about = values(about);
```

Then convert the rest of the seed with the same exact substitutions:

```text
PostgreSQL deterministic UUID expression -> MySQL deterministic UUID string:
  ('00000000-0000-0000-0000-' || lpad(id_suffix::text, 12, '0'))::uuid
  becomes concat('00000000-0000-0000-0000-', lpad(id_suffix, 12, '0'))
PostgreSQL timestamp literal -> UTC MySQL datetime literal:
  '2025-11-25 23:59:00+09'::timestamptz becomes '2025-11-25 14:59:00.000000'
PostgreSQL date literal -> MySQL date literal:
  '2025-11-26'::date becomes '2025-11-26'
PostgreSQL time literal -> MySQL time literal:
  '19:30'::time becomes '19:30:00'
PostgreSQL upsert -> MySQL upsert:
  on conflict (session_id, membership_id) do update set becomes on duplicate key update
PostgreSQL excluded column -> MySQL values column:
  excluded.column_name becomes values(column_name)
```

Keep the same deterministic IDs, six users, six published sessions, feedback documents, public summaries, highlights, one-line reviews, check-ins, and questions. Store all datetime literals in UTC `datetime(6)`.

- [x] **Step 4: Update DB-backed tests to use MySQL locations**

For every test file importing `com.readmates.support.PostgreSqlTestContainer`, replace the import and dynamic property registration:

```kotlin
import com.readmates.support.MySqlTestContainer
```

```kotlin
@DynamicPropertySource
fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
    MySqlTestContainer.registerDatasourceProperties(registry)
}
```

Replace test properties:

```kotlin
"spring.flyway.locations=classpath:db/migration,classpath:db/dev"
```

with:

```kotlin
"spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"
```

- [x] **Step 5: Run seed verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 6: Commit MySQL seed and test harness migration**

```bash
git add server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql server/src/test/kotlin/com/readmates
git commit -m "test: run db tests against mysql seed"
```

---

### Task 3: Shared DB Converters And Repository Dialect Pass

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/db/DbColumns.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/application/FeedbackDocumentRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`

- [x] **Step 1: Add DB converter tests**

Create `server/src/test/kotlin/com/readmates/shared/db/DbColumnsTest.kt`:

```kotlin
package com.readmates.shared.db

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

class DbColumnsTest {
    @Test
    fun `converts offset datetime to utc local datetime for mysql`() {
        val value = OffsetDateTime.parse("2026-04-20T15:30:00+09:00")

        assertEquals(LocalDateTime.parse("2026-04-20T06:30:00"), value.toUtcLocalDateTime())
    }

    @Test
    fun `converts utc local datetime back to offset datetime`() {
        val value = LocalDateTime.parse("2026-04-20T06:30:00")

        assertEquals(OffsetDateTime.parse("2026-04-20T06:30:00Z"), value.toUtcOffsetDateTime())
    }
}
```

- [x] **Step 2: Run converter tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.shared.db.DbColumnsTest
```

Expected: compilation fails because `toUtcLocalDateTime` and `toUtcOffsetDateTime` do not exist.

- [x] **Step 3: Add shared DB converter helpers**

Create `server/src/main/kotlin/com/readmates/shared/db/DbColumns.kt`:

```kotlin
package com.readmates.shared.db

import java.sql.ResultSet
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

fun ResultSet.uuid(column: String): UUID = UUID.fromString(getString(column))

fun ResultSet.uuidOrNull(column: String): UUID? =
    getString(column)?.let(UUID::fromString)

fun ResultSet.utcOffsetDateTime(column: String): OffsetDateTime =
    getObject(column, LocalDateTime::class.java).toUtcOffsetDateTime()

fun ResultSet.utcOffsetDateTimeOrNull(column: String): OffsetDateTime? =
    getObject(column, LocalDateTime::class.java)?.toUtcOffsetDateTime()

fun UUID.dbString(): String = toString()

fun OffsetDateTime.toUtcLocalDateTime(): LocalDateTime =
    withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()

fun LocalDateTime.toUtcOffsetDateTime(): OffsetDateTime =
    atOffset(ZoneOffset.UTC)
```

- [x] **Step 4: Replace UUID and datetime reads**

In all modified repository files, replace:

```kotlin
resultSet.getObject("id", UUID::class.java)
resultSet.getObject("created_at", OffsetDateTime::class.java)
```

with:

```kotlin
resultSet.uuid("id")
resultSet.utcOffsetDateTime("created_at")
```

For nullable values:

```kotlin
resultSet.uuidOrNull("membership_id")
resultSet.utcOffsetDateTimeOrNull("accepted_at")
```

- [x] **Step 5: Convert PostgreSQL upserts**

Replace each `on conflict` upsert with MySQL `on duplicate key update`. Example for `MemberAccountRepository`:

```kotlin
jdbcTemplate.update(
    """
    insert into users (id, email, name, profile_image_url, google_subject_id, auth_provider)
    values (?, ?, ?, ?, ?, 'GOOGLE')
    on duplicate key update
      google_subject_id = values(google_subject_id),
      name = values(name),
      profile_image_url = values(profile_image_url),
      updated_at = current_timestamp(6)
    """.trimIndent(),
    UUID.randomUUID().dbString(),
    normalizedEmail,
    normalizedName,
    normalizedProfileImageUrl,
    normalizedSubject,
)
```

- [x] **Step 6: Convert `returning` queries**

For `FeedbackDocumentRepository.saveDocument`, replace insert-returning with insert plus select:

```kotlin
val documentId = UUID.randomUUID()
jdbcTemplate.update(
    """
    insert into session_feedback_documents (
      id, club_id, session_id, version, source_text, file_name, content_type, file_size
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
    """.trimIndent(),
    documentId.dbString(),
    host.clubId.dbString(),
    sessionId.dbString(),
    version,
    sourceText,
    fileName,
    contentType,
    fileSize,
)

val storedDocument = findLatestDocument(jdbcTemplate, host.clubId, sessionId)
    ?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)
```

- [x] **Step 7: Convert `distinct on` queries**

Replace feedback document latest-per-session queries with MySQL window functions:

```sql
select *
from (
  select
    session_feedback_documents.session_id,
    sessions.number as session_number,
    sessions.book_title,
    sessions.session_date,
    session_feedback_documents.source_text,
    session_feedback_documents.file_name,
    session_feedback_documents.created_at,
    row_number() over (
      partition by session_feedback_documents.session_id
      order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
    ) as document_rank
  from session_feedback_documents
  join sessions on sessions.id = session_feedback_documents.session_id
    and sessions.club_id = session_feedback_documents.club_id
  where session_feedback_documents.club_id = ?
) ranked_documents
where document_rank = 1
order by session_number desc
```

- [x] **Step 8: Convert aggregate filters**

Replace:

```sql
count(*) filter (where session_participants.rsvp_status = 'NO_RESPONSE')
```

with:

```sql
sum(case when session_participants.rsvp_status = 'NO_RESPONSE' then 1 else 0 end)
```

- [x] **Step 9: Run DB-backed backend tests**

Run:

```bash
./server/gradlew -p server test
```

Expected: existing tests compile and DB-backed tests run on MySQL. Failures at this point should be SQL dialect mismatches; fix each mismatch in the repository owning the failing query.

- [x] **Step 10: Commit repository MySQL dialect pass**

```bash
git add server/src/main/kotlin/com/readmates server/src/test/kotlin/com/readmates
git commit -m "refactor: make repositories mysql compatible"
```

---

### Task 4: Password Session Backend

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/PasswordHasher.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/PasswordAuthController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`

- [x] **Step 1: Add password hasher tests**

Create `server/src/test/kotlin/com/readmates/auth/application/PasswordHasherTest.kt`:

```kotlin
package com.readmates.auth.application

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PasswordHasherTest {
    private val hasher = PasswordHasher()

    @Test
    fun `hashes and verifies valid passwords`() {
        val hash = hasher.hash("correct horse battery staple")

        assertTrue(hasher.matches("correct horse battery staple", hash))
        assertFalse(hasher.matches("wrong horse battery staple", hash))
    }
}
```

- [x] **Step 2: Implement BCrypt password hasher**

Create `server/src/main/kotlin/com/readmates/auth/application/PasswordHasher.kt`:

```kotlin
package com.readmates.auth.application

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Component

@Component
class PasswordHasher {
    private val encoder = BCryptPasswordEncoder(12)

    fun hash(rawPassword: String): String = encoder.encode(rawPassword)

    fun matches(rawPassword: String, passwordHash: String): Boolean =
        encoder.matches(rawPassword, passwordHash)
}
```

Add the security crypto dependency if the existing Spring Security starters do not expose it directly:

```kotlin
implementation("org.springframework.security:spring-security-crypto")
```

- [x] **Step 3: Add auth session service tests**

Create `server/src/test/kotlin/com/readmates/auth/application/AuthSessionServiceTest.kt`:

```kotlin
package com.readmates.auth.application

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AuthSessionServiceTest {
    private val service = AuthSessionService(AuthSessionRepository.InMemoryForTest())

    @Test
    fun `issues opaque session tokens and stores only hashes`() {
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

        assertTrue(issued.rawToken.length >= 43)
        assertFalse(issued.storedTokenHash.contains(issued.rawToken))
        assertEquals("00000000-0000-0000-0000-000000000101", issued.userId)
    }
}
```

- [x] **Step 4: Implement auth session repository and service**

Create `AuthSessionRepository` with JDBC-backed methods:

```kotlin
interface AuthSessionRepository {
    fun create(session: StoredAuthSession)
    fun findValidByTokenHash(tokenHash: String): StoredAuthSession?
    fun revokeByTokenHash(tokenHash: String)
    fun revokeAllForUser(userId: String)

    class InMemoryForTest : AuthSessionRepository {
        private val sessions = mutableMapOf<String, StoredAuthSession>()
        override fun create(session: StoredAuthSession) { sessions[session.sessionTokenHash] = session }
        override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? = sessions[tokenHash]
        override fun revokeByTokenHash(tokenHash: String) { sessions[tokenHash]?.let { sessions[tokenHash] = it.copy(revoked = true) } }
        override fun revokeAllForUser(userId: String) {
            sessions.replaceAll { _, session -> if (session.userId == userId) session.copy(revoked = true) else session }
        }
    }
}
```

Create `AuthSessionService` to generate URL-safe random tokens, SHA-256 hashes, 14-day expiry, and cookie values. Use `SecureRandom`, `Base64.getUrlEncoder().withoutPadding()`, and `MessageDigest.getInstance("SHA-256")`.

- [x] **Step 5: Add login controller tests**

Create `server/src/test/kotlin/com/readmates/auth/api/PasswordAuthControllerTest.kt` with tests for:

```kotlin
@Test
fun `login returns session cookie for active invited member`() {
    createPasswordMember("member@example.com", "새멤버", "correct horse battery staple")

    mockMvc.post("/api/auth/login") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"email":"member@example.com","password":"correct horse battery staple"}"""
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        cookie { exists("readmates_session") }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.email") { value("member@example.com") }
    }
}

@Test
fun `login does not reveal whether email exists`() {
    createPasswordMember("member@example.com", "새멤버", "correct horse battery staple")

    mockMvc.post("/api/auth/login") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"email":"missing@example.com","password":"wrong password"}"""
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isUnauthorized() }
        jsonPath("$.code") { value("AUTH_INVALID_CREDENTIALS") }
    }

    mockMvc.post("/api/auth/login") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"email":"member@example.com","password":"wrong password"}"""
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isUnauthorized() }
        jsonPath("$.code") { value("AUTH_INVALID_CREDENTIALS") }
    }
}

@Test
fun `logout revokes current session and clears cookie`() {
    createPasswordMember("member@example.com", "새멤버", "correct horse battery staple")
    val cookie = loginAndReturnSessionCookie("member@example.com", "correct horse battery staple")

    mockMvc.post("/api/auth/logout") {
        cookie(cookie)
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isNoContent() }
        cookie { maxAge("readmates_session", 0) }
    }

    mockMvc.get("/api/auth/me") {
        cookie(cookie)
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(false) }
    }
}
```

- [x] **Step 6: Implement `PasswordAuthController`**

Create endpoints:

```kotlin
@PostMapping("/api/auth/login")
fun login(@RequestBody request: LoginRequest, servletRequest: HttpServletRequest, response: HttpServletResponse): AuthMemberResponse

@PostMapping("/api/auth/logout")
@ResponseStatus(HttpStatus.NO_CONTENT)
fun logout(request: HttpServletRequest, response: HttpServletResponse)
```

Use these DTOs:

```kotlin
data class LoginRequest(val email: String, val password: String)
data class AuthErrorResponse(val code: String, val message: String)
```

- [x] **Step 7: Implement session cookie authentication**

Create `SessionCookieAuthenticationFilter` that:

1. Reads `readmates_session`.
2. Hashes the token.
3. Loads a valid non-revoked, non-expired session.
4. Loads active member by user id.
5. Sets Spring Security authentication with the member email and role.

- [x] **Step 8: Run backend auth tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.*'
```

Expected: auth tests pass on MySQL.

- [x] **Step 9: Commit password session backend**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth server/build.gradle.kts
git commit -m "feat: add password session authentication"
```

---

### Task 5: Invitation Password Setup And Manual Reset

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/PasswordResetService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt`
- Modify tests under `server/src/test/kotlin/com/readmates/auth/api/`

- [x] **Step 1: Update invitation API tests for name and password**

Modify `HostInvitationControllerTest` so create requests include name:

```json
{
  "email": "new.member@example.com",
  "name": "새멤버"
}
```

Assert response includes:

```json
{
  "email": "new.member@example.com",
  "name": "새멤버",
  "role": "MEMBER",
  "effectiveStatus": "PENDING"
}
```

- [x] **Step 2: Update invitation acceptance tests**

Modify `InvitationControllerDbTest` so accepting an invite posts:

```json
{
  "password": "correct horse battery staple",
  "passwordConfirmation": "correct horse battery staple"
}
```

Assert:

- `Set-Cookie` contains `readmates_session=`.
- `users.password_hash` is not null.
- `users.email` equals invited email.
- `users.name` equals invited name.
- `memberships.status` is `ACTIVE`.

- [x] **Step 3: Implement invitation password setup**

Change `InvitationService.acceptInvitation` signature to:

```kotlin
fun acceptInvitation(rawToken: String, password: String, passwordConfirmation: String): AuthMemberResponse
```

Validation rules:

```kotlin
require(password == passwordConfirmation) { "PASSWORD_CONFIRMATION_MISMATCH" }
require(password.length in 10..128) { "PASSWORD_POLICY_VIOLATION" }
require(password.isNotBlank()) { "PASSWORD_POLICY_VIOLATION" }
require(!password.equals(invitation.email, ignoreCase = true)) { "PASSWORD_POLICY_VIOLATION" }
require(!password.equals(invitation.email.substringBefore("@"), ignoreCase = true)) { "PASSWORD_POLICY_VIOLATION" }
```

Hash the password with `PasswordHasher`, create the user using invitation email/name, activate membership, mark invitation accepted, add current open session participant, and issue a session cookie.

- [x] **Step 4: Add password reset tests**

Create `server/src/test/kotlin/com/readmates/auth/api/PasswordResetControllerTest.kt` with:

```kotlin
@Test
fun `host can issue one time password reset link for active member`() {
    val hostCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")
    val membershipId = activeMemberMembershipId("member@example.com")

    mockMvc.post("/api/host/members/$membershipId/password-reset") {
        cookie(hostCookie)
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        jsonPath("$.resetUrl") { value(Matchers.containsString("/reset-password/")) }
        jsonPath("$.expiresAt") { exists() }
    }

    assertEquals(
        1,
        jdbcTemplate.queryForObject(
            "select count(*) from password_reset_tokens where user_id = (select user_id from memberships where id = ?)",
            Int::class.java,
            membershipId,
        ),
    )
}

@Test
fun `password reset changes password revokes old sessions and logs user in`() {
    val oldCookie = loginAndReturnSessionCookie("member@example.com", "old correct password")
    val rawToken = issuePasswordResetTokenFor("member@example.com")

    mockMvc.post("/api/auth/password-reset/$rawToken") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"password":"new correct password","passwordConfirmation":"new correct password"}"""
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        cookie { exists("readmates_session") }
        jsonPath("$.authenticated") { value(true) }
    }

    mockMvc.get("/api/auth/me") {
        cookie(oldCookie)
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(false) }
    }
}

@Test
fun `expired password reset token returns conflict`() {
    val rawToken = issueExpiredPasswordResetTokenFor("member@example.com")

    mockMvc.post("/api/auth/password-reset/$rawToken") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"password":"new correct password","passwordConfirmation":"new correct password"}"""
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isConflict() }
        jsonPath("$.code") { value("PASSWORD_RESET_EXPIRED") }
    }
}
```

- [x] **Step 5: Implement `PasswordResetService` and controller**

Create `PasswordResetService` methods:

```kotlin
fun createReset(host: CurrentMember, membershipId: UUID): PasswordResetIssueResponse
fun resetPassword(rawToken: String, password: String, passwordConfirmation: String): AuthMemberResponse
```

Create endpoints:

```kotlin
@PostMapping("/api/host/members/{membershipId}/password-reset")
fun issueReset(authentication: Authentication?, @PathVariable membershipId: String): PasswordResetIssueResponse

@PostMapping("/api/auth/password-reset/{token}")
fun resetPassword(@PathVariable token: String, @RequestBody request: PasswordResetRequest): AuthMemberResponse
```

- [x] **Step 6: Run invitation and reset tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*Invitation*' --tests 'com.readmates.auth.api.PasswordResetControllerTest'
```

Expected: tests pass.

- [x] **Step 7: Commit invitation password setup and reset**

```bash
git add server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth
git commit -m "feat: add invite password setup and reset"
```

---

### Task 6: BFF Secret, CSRF Origin Checks, And OAuth Removal

**Files:**
- Modify: `front/app/api/bff/[...path]/route.ts`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Delete or leave unused: OAuth success/filter classes only after tests no longer reference them.
- Modify: `front/features/auth/google-oauth.ts`
- Modify OAuth-related tests.

- [x] **Step 1: Add BFF route test**

Modify `front/tests/unit/bff-route.test.ts` to assert upstream requests include the internal secret:

```ts
vi.stubEnv("READMATES_BFF_SECRET", "test-secret");

expect(fetchMock).toHaveBeenCalledWith(
  expect.any(URL),
  expect.objectContaining({
    headers: expect.objectContaining({
      "X-Readmates-Bff-Secret": "test-secret",
    }),
  }),
);
```

- [x] **Step 2: Add the BFF secret header**

Modify `front/app/api/bff/[...path]/route.ts`:

```ts
const bffSecret = process.env.READMATES_BFF_SECRET?.trim();
if (bffSecret) {
  headers.set("X-Readmates-Bff-Secret", bffSecret);
}
```

- [x] **Step 3: Add backend BFF secret filter tests**

Create `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterTest.kt`:

```kotlin
@Test
fun `protected api request without bff secret is rejected`() {
    mockMvc.get("/api/auth/me")
        .andExpect {
            status { isUnauthorized() }
        }
}

@Test
fun `protected api request with bff secret reaches controller`() {
    mockMvc.get("/api/auth/me") {
        header("X-Readmates-Bff-Secret", "test-bff-secret")
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(false) }
    }
}
```

- [x] **Step 4: Implement `BffSecretFilter`**

Create filter behavior:

```kotlin
if (request.requestURI.startsWith("/api/") && expectedSecret.isNotBlank()) {
    val provided = request.getHeader("X-Readmates-Bff-Secret")
    if (provided != expectedSecret) {
        response.status = HttpServletResponse.SC_UNAUTHORIZED
        return
    }
}
filterChain.doFilter(request, response)
```

Use constant-time comparison for non-empty values:

```kotlin
MessageDigest.isEqual(provided.toByteArray(), expectedSecret.toByteArray())
```

- [x] **Step 5: Remove OAuth login from active security**

Modify `SecurityConfig`:

- Remove `oauth2Login` setup.
- Remove OAuth authorization and callback paths from the public login flow unless kept for future disabled routes.
- Keep `/api/invitations/**`, `/api/auth/login`, `/api/auth/password-reset/**`, and `/api/auth/me` reachable through BFF secret.
- Keep `/api/host/**` host-only and `/api/**` active member-only.

- [x] **Step 6: Run BFF and security tests**

Run:

```bash
pnpm --dir front test -- bff-route
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.*' --tests 'com.readmates.auth.api.AuthMeControllerTest'
```

Expected: both commands pass.

- [x] **Step 7: Commit BFF boundary hardening**

```bash
git add front/app/api/bff/[...path]/route.ts front/tests/unit/bff-route.test.ts server/src/main/kotlin/com/readmates/auth/infrastructure/security server/src/test/kotlin/com/readmates/auth/infrastructure/security
git commit -m "feat: protect api behind bff secret"
```

---

### Task 7: Frontend Password Login, Invite Setup, And Reset UI

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/features/auth/components/login-card.tsx`
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
- Create: `front/features/auth/components/password-reset-card.tsx`
- Create: `front/features/auth/actions/password-auth.ts`
- Modify: `front/features/auth/actions/invitations.ts`
- Create: `front/app/(public)/reset-password/[token]/page.tsx`
- Modify: `front/features/host/components/host-invitations.tsx`

- [x] **Step 1: Add frontend tests for password login**

Modify `front/tests/unit/login-card.test.tsx`:

```tsx
it("submits email and password login through the BFF", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true }) });
  vi.stubGlobal("fetch", fetchMock);

  render(<LoginCard mode="login" />);

  await user.type(screen.getByLabelText("이메일"), "member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "로그인" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/login", expect.objectContaining({ method: "POST" }));
});
```

- [x] **Step 2: Add frontend tests for invite password setup**

Modify `front/tests/unit/invite-acceptance-card.test.tsx`:

```tsx
it("accepts invitation by setting a password", async () => {
  const user = userEvent.setup();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ clubName: "읽는사이", email: "member@example.com", name: "새멤버", status: "PENDING", canAccept: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true }) });
  vi.stubGlobal("fetch", fetchMock);

  render(<InviteAcceptanceCard token="raw-token" />);

  await screen.findByText("member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "correct horse battery staple");
  await user.type(screen.getByLabelText("비밀번호 확인"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "초대 수락" }));

  expect(fetchMock).toHaveBeenLastCalledWith("/api/bff/api/invitations/raw-token/accept", expect.objectContaining({ method: "POST" }));
});
```

- [x] **Step 3: Add auth API DTOs and actions**

Modify `front/shared/api/readmates.ts`:

```ts
export type PasswordLoginRequest = {
  email: string;
  password: string;
};

export type PasswordResetRequest = {
  password: string;
  passwordConfirmation: string;
};
```

Create `front/features/auth/actions/password-auth.ts`:

```ts
export function loginWithPassword(email: string, password: string) {
  return fetch("/api/bff/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return fetch("/api/bff/api/auth/logout", { method: "POST" });
}

export function resetPassword(token: string, password: string, passwordConfirmation: string) {
  return fetch(`/api/bff/api/auth/password-reset/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, passwordConfirmation }),
  });
}
```

- [x] **Step 4: Replace Google login card with email/password form**

Update `LoginCard` to render labeled inputs:

```tsx
<label className="label" htmlFor="email">이메일</label>
<input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
<label className="label" htmlFor="password">비밀번호</label>
<input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
<button className="btn btn-primary btn-lg" type="button" onClick={() => void submitLogin()}>로그인</button>
```

Remove the Google OAuth button from production UI.

- [x] **Step 5: Update invite acceptance card**

Render fixed invited email/name from preview and post password setup:

```tsx
await acceptInvitationWithPassword(token, password, passwordConfirmation);
globalThis.location.href = "/app";
```

The card must show the same Korean validation messages as backend error codes:

```ts
const errorMessages: Record<string, string> = {
  PASSWORD_CONFIRMATION_MISMATCH: "비밀번호 확인이 일치하지 않습니다.",
  PASSWORD_POLICY_VIOLATION: "비밀번호는 10자 이상이어야 하며 이메일과 같을 수 없습니다.",
  INVITATION_EXPIRED: "만료된 초대입니다.",
  INVITATION_REVOKED: "취소된 초대입니다.",
};
```

- [x] **Step 6: Add password reset page**

Create `front/app/(public)/reset-password/[token]/page.tsx`:

```tsx
import { PasswordResetCard } from "@/features/auth/components/password-reset-card";

type ResetPasswordPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;
  return <PasswordResetCard token={token} />;
}
```

- [x] **Step 7: Run frontend unit tests**

Run:

```bash
pnpm --dir front test -- login-card invite-acceptance-card host-invitations bff-route
```

Expected: targeted frontend tests pass.

- [x] **Step 8: Commit frontend password auth UI**

```bash
git add front/shared/api/readmates.ts front/features/auth front/features/host/components/host-invitations.tsx front/app/(public)/reset-password front/tests/unit
git commit -m "feat: add password auth frontend"
```

---

### Task 8: Deployment Exports And Documentation

**Files:**
- Create: `docs/deploy/oci-mysql-heatwave.md`
- Create: `deploy/oci/export-mysql.sh`
- Create: `deploy/oci/readmates-server.service`
- Modify: `.env.example`
- Modify: `README.md`

- [x] **Step 1: Add deployment checklist doc**

Create `docs/deploy/oci-mysql-heatwave.md` with these sections:

```markdown
# OCI MySQL HeatWave Deployment

## Resources

- Vercel production deployment for `front/`
- OCI Ampere A1 Compute VM for Spring Boot
- OCI MySQL HeatWave Always Free DB system
- OCI Object Storage bucket `readmates-db-exports`

## Required Environment

### Vercel

- `READMATES_API_BASE_URL=https://api.example.com`
- `READMATES_BFF_SECRET`
- `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false`
- `NEXT_PUBLIC_APP_URL`

Production `READMATES_API_BASE_URL` must use HTTPS. Terminate TLS with Caddy, Nginx, an OCI Load Balancer, or Cloudflare, then proxy to Spring on `127.0.0.1:8080`.

### Spring

- `SPRING_PROFILES_ACTIVE=prod`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `READMATES_APP_BASE_URL`
- `READMATES_AUTH_SESSION_COOKIE_SECURE=true`
- `READMATES_ALLOWED_ORIGINS`
- `READMATES_BFF_SECRET`

## Smoke Test

1. Open Vercel production URL.
2. Host logs in with email/password.
3. Host creates invitation with email and name.
4. Invitee opens invite link and sets password.
5. Invitee saves RSVP, check-in, and a question.
6. Host sees participant status.
7. Host uploads feedback document.
8. Attended member can view feedback document.
```

- [x] **Step 2: Add MySQL export script**

Create `deploy/oci/export-mysql.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${READMATES_DB_HOST:?READMATES_DB_HOST is required}"
: "${READMATES_DB_NAME:?READMATES_DB_NAME is required}"
: "${READMATES_DB_USER:?READMATES_DB_USER is required}"
: "${READMATES_EXPORT_DIR:?READMATES_EXPORT_DIR is required}"
: "${READMATES_MYSQL_DEFAULTS_FILE:?READMATES_MYSQL_DEFAULTS_FILE is required}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$READMATES_EXPORT_DIR"
output="$READMATES_EXPORT_DIR/readmates-${timestamp}.sql.gz"
tmp_output="$(mktemp "${output}.tmp.XXXXXX")"

mysqldump \
  --defaults-extra-file="$READMATES_MYSQL_DEFAULTS_FILE" \
  --host="$READMATES_DB_HOST" \
  --user="$READMATES_DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  "$READMATES_DB_NAME" | gzip > "$tmp_output"

mv "$tmp_output" "$output"

echo "$output"
```

- [x] **Step 3: Add systemd service template**

Create `deploy/oci/readmates-server.service`:

```ini
[Unit]
Description=ReadMates Spring Boot API
After=network-online.target
Wants=network-online.target

[Service]
User=readmates
WorkingDirectory=/opt/readmates
EnvironmentFile=/etc/readmates/readmates.env
ExecStart=/usr/bin/java -jar /opt/readmates/readmates-server.jar
Restart=always
RestartSec=5
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
```

- [x] **Step 4: Update `.env.example`**

Replace Google OAuth-centered values with:

```env
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://mysql-private-host:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=replace-with-db-password
READMATES_APP_BASE_URL=https://replace-with-vercel-url
READMATES_ALLOWED_ORIGINS=https://replace-with-vercel-url
READMATES_BFF_SECRET=replace-with-shared-secret
READMATES_AUTH_SESSION_COOKIE_SECURE=true

NEXT_PUBLIC_ENABLE_DEV_LOGIN=false
NEXT_PUBLIC_APP_URL=https://replace-with-vercel-url
READMATES_API_BASE_URL=https://api.example.com
READMATES_BFF_SECRET=replace-with-shared-secret
```

- [x] **Step 5: Update README run/test/deploy sections**

Keep local dev instructions for MySQL:

```bash
SPRING_PROFILES_ACTIVE=dev \
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC' \
READMATES_APP_BASE_URL=http://localhost:3000 \
READMATES_BFF_SECRET=local-dev-secret \
./server/gradlew -p server bootRun
```

Frontend:

```bash
READMATES_API_BASE_URL=http://localhost:8080 \
READMATES_BFF_SECRET=local-dev-secret \
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true \
pnpm --dir front dev
```

- [x] **Step 6: Run full verification**

Run:

```bash
./server/gradlew -p server test
pnpm --dir front test
pnpm --dir front lint
pnpm --dir front build
```

Expected: all commands pass.

Actual Task 8 verification evidence:

- 2026-04-20 KST, commit `4f86e22a74906098e1467dd9d6ae0343cdd8b594`: `./server/gradlew -p server test` passed.
- 2026-04-20 KST, commit `4f86e22a74906098e1467dd9d6ae0343cdd8b594`: `pnpm --dir front test` passed, 27 files / 173 tests.
- 2026-04-20 KST, commit `4f86e22a74906098e1467dd9d6ae0343cdd8b594`: `pnpm --dir front lint` exited 0 with one pre-existing `<img>` warning in `front/shared/ui/book-cover.tsx`.
- 2026-04-20 KST, commit `4f86e22a74906098e1467dd9d6ae0343cdd8b594`: `pnpm --dir front build` passed.
- 2026-04-20 KST, commit `4f86e22a74906098e1467dd9d6ae0343cdd8b594`: `git diff --check` passed.
- 2026-04-20 KST, Task 8 review-fix working tree: `bash -n deploy/oci/export-mysql.sh` passed.
- 2026-04-20 KST, Task 8 review-fix working tree: `git diff --check` passed.
- 2026-04-20 KST, Task 8 review-fix working tree: grep checks passed for no non-local plaintext API base URL, no absolute README deploy link, and no stale session-cookie env alias in Task 8 docs/examples.
- 2026-04-20 KST, Task 8 minor-docs working tree: `git diff --check` and `bash -n deploy/oci/export-mysql.sh` passed; grep checks passed for no public API wording implying public port 8080 and for the README Task 9 E2E caveat.

- [x] **Step 7: Commit deployment docs**

```bash
git add docs/deploy/oci-mysql-heatwave.md deploy/oci/export-mysql.sh deploy/oci/readmates-server.service .env.example README.md
git commit -m "docs: add oci mysql deployment guide"
```

---

### Task 9: End-To-End Auth Regression

Task 9 E2E evidence: complete. See Task 9 Step 3 for focused and related verification results.

**Files:**
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Create: `front/tests/e2e/password-auth-invite-flow.spec.ts`
- Modify: `front/playwright.config.ts`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `front/shared/api/readmates.ts`
- Create: `front/shared/api/readmates-server.ts`
- Modify: `front/app/(public)/sessions/[sessionId]/page.tsx`
- Modify: `front/tests/unit/public-session-page.test.tsx`
- Modify: `front/package.json`
- Modify: `front/pnpm-lock.yaml`
- Modify: `front/vitest.config.ts`
- Modify: `README.md`

- [x] **Step 1: Add E2E password invite flow**

Create `front/tests/e2e/password-auth-invite-flow.spec.ts` with this scenario:

```ts
test("host invites member, member sets password, and member prepares current session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("host@example.com");
  await page.getByLabel("비밀번호").fill("correct horse battery staple");
  await page.getByRole("button", { name: "로그인" }).click();

  await page.goto("/app/host/invitations");
  await page.getByLabel("이름").fill("테스트멤버");
  await page.getByLabel("이메일").fill("new.member@example.com");
  await page.getByRole("button", { name: "초대 만들기" }).click();

  const displayedInviteUrl = await page.getByLabel("초대 링크").inputValue();
  await page.getByRole("button", { name: "초대 링크 복사" }).click();
  const inviteUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toBe(displayedInviteUrl);

  await page.getByRole("button", { name: "로그아웃" }).click();
  await page.goto(inviteUrl);
  await page.getByLabel("비밀번호").fill("correct horse battery staple");
  await page.getByLabel("비밀번호 확인").fill("correct horse battery staple");
  await page.getByRole("button", { name: "초대 수락" }).click();

  await expect(page).toHaveURL(/\/app/);
});
```

- [x] **Step 2: Update Playwright backend environment**

Modify `front/playwright.config.ts` web server command to include:

```ts
${envAssignment("READMATES_BFF_SECRET", "e2e-secret")}
${envAssignment("READMATES_FLYWAY_LOCATIONS", "classpath:db/mysql/migration,classpath:db/mysql/dev")}
```

Use MySQL test DB connection variables instead of PostgreSQL variables.

- [x] **Step 3: Run E2E smoke test**

Run:

```bash
pnpm --dir front test:e2e -- password-auth-invite-flow
```

Expected: E2E test passes.

Actual evidence:

- 2026-04-21 KST: `pnpm --dir front test:e2e -- password-auth-invite-flow` passed: 1 test passed in Chromium.
- 2026-04-21 KST: `pnpm --dir front test:e2e -- dev-login-session-flow` passed: 2 tests passed in Chromium after updating stale password-auth selectors.
- 2026-04-21 KST follow-up: `pnpm --dir front test:e2e -- password-auth-invite-flow` passed: 1 test passed in Chromium with explicit `초대 링크 복사` button and clipboard-read coverage.
- 2026-04-21 KST follow-up: `pnpm --dir front test:e2e -- dev-login-session-flow` passed: 2 tests passed in Chromium.
- 2026-04-21 KST follow-up: `pnpm --dir front test:e2e` passed: 6 tests passed in Chromium after updating public auth and responsive navigation specs to password login and ensuring public server-rendered API requests include the BFF secret.
- 2026-04-21 KST re-review follow-up: `pnpm --dir front exec vitest run front/tests/unit/public-session-page.test.tsx` passed: 4 tests passed after adding coverage that `/sessions/[sessionId]` sends `X-Readmates-Bff-Secret` on its server-rendered public API request.
- 2026-04-21 KST re-review follow-up: `pnpm --dir front test:e2e -- password-auth-invite-flow` passed: 1 test passed in Chromium.
- 2026-04-21 KST re-review follow-up: `pnpm --dir front test:e2e -- responsive-navigation-chrome` passed: 2 tests passed in Chromium; the desktop path now visits `/records` and the redirected `/sessions/{sessionId}` detail page.
- 2026-04-21 KST re-review follow-up: `pnpm --dir front test:e2e` passed: 6 tests passed in Chromium.
- 2026-04-21 KST hardening/docs follow-up: `pnpm --dir front lint` passed with one existing `@next/next/no-img-element` warning in `front/shared/ui/book-cover.tsx`.
- 2026-04-21 KST hardening/docs follow-up: `pnpm --dir front exec vitest run front/tests/unit/public-session-page.test.tsx front/tests/unit/bff-route.test.ts` passed: 22 tests passed.
- 2026-04-21 KST hardening/docs follow-up: `pnpm --dir front test:e2e -- password-auth-invite-flow` passed: 1 test passed in Chromium.
- 2026-04-21 KST hardening/docs follow-up: `pnpm --dir front build` passed after adding the `server-only` guard to the server public API helper.
- 2026-04-21 KST: `pnpm --dir front exec vitest run front/tests/unit/bff-route.test.ts` passed: 18 tests passed.
- Environment note: local MySQL was running, but the default `readmates` E2E user was missing; created the local `readmates/readmates` test user and granted it access to `readmates_e2e` so the documented command can run without extra env vars.
- Non-blocking warning: commands emitted Node `NO_COLOR`/`FORCE_COLOR` warnings from the local toolchain.

- [x] **Step 4: Commit E2E coverage**

```bash
git add front/tests/e2e/password-auth-invite-flow.spec.ts front/playwright.config.ts
git commit -m "test: cover password invite e2e flow"
```

---

## Self-Review Checklist

- Spec coverage:
  - MySQL HeatWave Always Free: Tasks 1, 2, 8.
  - PostgreSQL-to-MySQL SQL migration: Tasks 1, 2, 3.
  - Invite email/name/password setup: Tasks 5, 7, 9.
  - HttpOnly opaque session auth: Tasks 4, 6.
  - BFF secret protection: Task 6.
  - Manual password reset: Tasks 5, 7.
  - Object Storage logical export: Task 8.
- Type consistency:
  - IDs are `char(36)` in MySQL and `UUID` in Kotlin application code.
  - Time values are `datetime(6)` UTC in MySQL and `OffsetDateTime` at API boundaries.
  - Session cookie name is `readmates_session` across backend and frontend.
  - BFF secret header is `X-Readmates-Bff-Secret` across frontend and backend.
- Verification:
  - Backend full test command: `./server/gradlew -p server test`.
  - Frontend unit command: `pnpm --dir front test`.
  - Frontend lint/build commands: `pnpm --dir front lint`, `pnpm --dir front build`.
  - E2E command: `pnpm --dir front test:e2e -- password-auth-invite-flow`.
  - Final verification evidence:
    - Final reviewer note addressed: stale public session copy that referenced Google account continuation was updated to email/password continuation.
    - `./server/gradlew -p server test` passed: `BUILD SUCCESSFUL`.
    - `pnpm --dir front test` passed: 27 files / 174 tests.
    - `pnpm --dir front lint` passed with one existing `@next/next/no-img-element` warning in `front/shared/ui/book-cover.tsx`.
    - `pnpm --dir front build` passed.
    - `pnpm --dir front test:e2e -- password-auth-invite-flow` passed: 1 Chromium test.
    - Non-blocking warning: Playwright emitted local Node `NO_COLOR` / `FORCE_COLOR` warnings.
