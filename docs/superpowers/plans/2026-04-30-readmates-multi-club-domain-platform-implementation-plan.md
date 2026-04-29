# ReadMates Multi-Club Domain Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert ReadMates from a single-club app into a multi-club platform with club-scoped public/app URLs, shared login, platform admin, domain alias management, and safe migration of the existing `reading-sai` data.

**Architecture:** Keep MySQL as source of truth and preserve existing clean-architecture package boundaries. Add a dedicated `club` slice for club/domain/admin context, change auth resolution from `email -> CurrentMember` to `user + club context -> CurrentMember`, and move routes/API toward `/clubs/:clubSlug/**` while keeping legacy routes as redirects/compatibility entries.

**Tech Stack:** Kotlin/Spring Boot, Spring Security OAuth, JDBC, Flyway, MySQL/H2 test migrations, React/Vite, React Router, Cloudflare Pages Functions, Vitest, Playwright, Gradle.

---

## Scope Note

This is a master implementation plan for a large platform change. Execute it in the order written. Each task should end with tests and a commit. Do not combine unrelated tasks into one commit.

The plan intentionally keeps wildcard Worker support and end-user custom domain self-service out of initial implementation. The first supported domain model is:

- `readmates.pages.dev` remains preview/fallback.
- `<primary-domain>/clubs/:slug/**` is the internal canonical route shape.
- `<club-slug>.<primary-domain>/**` is a registered Cloudflare Pages custom-domain alias when provisioned.

## File Map

### Server: New Club Slice

- Create `server/src/main/kotlin/com/readmates/club/domain/ClubDomainStatus.kt`
  - Enums for `REQUESTED`, `ACTION_REQUIRED`, `PROVISIONING`, `ACTIVE`, `FAILED`, `DISABLED`.
- Create `server/src/main/kotlin/com/readmates/club/domain/ClubDomainKind.kt`
  - Enums for `SUBDOMAIN`, `CUSTOM_DOMAIN`.
- Create `server/src/main/kotlin/com/readmates/club/domain/ClubStatus.kt`
  - Enums for `SETUP_REQUIRED`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`.
- Create `server/src/main/kotlin/com/readmates/club/domain/PlatformAdminRole.kt`
  - Enums for `OWNER`, `OPERATOR`, `SUPPORT`.
- Create `server/src/main/kotlin/com/readmates/club/domain/PlatformAdminStatus.kt`
  - Enums for `ACTIVE`, `DISABLED`.
- Create `server/src/main/kotlin/com/readmates/club/application/model/ClubContextModels.kt`
  - Club context, domain rows, platform admin rows, joined-club auth summaries.
- Create `server/src/main/kotlin/com/readmates/club/application/port/in/ClubContextUseCases.kt`
  - Resolve club by host/slug and list user memberships.
- Create `server/src/main/kotlin/com/readmates/club/application/port/out/ClubContextPorts.kt`
  - Outbound ports for club/domain/admin lookup.
- Create `server/src/main/kotlin/com/readmates/club/application/service/ClubContextService.kt`
  - Resolve club context and enforce slug rules.
- Create `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`
  - JDBC implementation for clubs, domains, memberships, platform admins.
- Create `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextHeader.kt`
  - Constants and helpers for trusted club headers.
- Create `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminController.kt`
  - Admin API shell and role-guarded endpoints.

### Server: Auth Changes

- Modify `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
  - Keep current fields and add `clubSlug`.
- Create `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
  - Separate principal for `/api/admin/**`.
- Modify `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`
  - Add `resolveByUserAndClub(userId, clubId)` and `resolveByEmailAndClub(email, clubId)`.
- Modify `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
  - Use club context when present.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
  - Resolve current member from request club context.
- Create `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentPlatformAdminArgumentResolver.kt`
  - Resolve platform admin principal.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberWebConfig.kt`
  - Register both argument resolvers.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
  - Add user+club membership lookup and joined club list queries.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthMeController.kt`
  - Return global user, current membership, joined clubs, platform admin, recommended URL.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/AuthWebDtos.kt`
  - Add response DTOs if the current response type lives there.

### Server: OAuth and Invite

- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`
  - Replace fixed `$appOrigin/app` redirect with signed return URL or invite target.
- Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
  - Validate and store signed return URL state.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt`
  - Capture invite token and club slug.
- Modify `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - Generate club-aware invite URLs and enforce club-bound token acceptance.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationController.kt`
  - Support `/api/clubs/{clubSlug}/invitations/{token}` preview/accept routes while keeping legacy route redirect support.

### Server: Public/Member/Host API

- Modify `server/src/main/kotlin/com/readmates/publication/application/port/in/PublicUseCases.kt`
  - Change public club/session use cases to accept club slug/context.
- Modify `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
  - Cache and query by club.
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
  - Replace hard-coded `slug = 'reading-sai'` with parameterized club lookup.
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt`
  - Add `/api/public/clubs/{clubSlug}` and `/api/public/clubs/{clubSlug}/sessions/{sessionId}`.
- Modify session/archive/note/feedback/notification controllers under `server/src/main/kotlin/com/readmates/**/adapter/in/web`
  - Add club-scoped routes where needed and keep legacy routes until frontend migration is complete.

### Server: Migrations and Tests

- Create `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql`
- Create `server/src/main/resources/db/migration/V12__multi_club_platform.sql`
- Modify `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Create tests under:
  - `server/src/test/kotlin/com/readmates/club/api/`
  - `server/src/test/kotlin/com/readmates/club/application/`
  - `server/src/test/kotlin/com/readmates/auth/api/`
  - `server/src/test/kotlin/com/readmates/auth/infrastructure/security/`

### Frontend

- Modify `front/shared/auth/auth-contracts.ts`
  - Add joined clubs, current membership, platform admin fields.
- Modify `front/shared/auth/member-app-access.ts`
  - Evaluate access from current club membership.
- Modify `front/shared/auth/member-app-loader.ts`
  - Load auth with route club context.
- Modify `front/src/app/auth-state.ts`
  - Store global user and memberships.
- Modify `front/src/app/router.tsx`
  - Add `/clubs/:clubSlug/**`, `/admin/**`, and legacy redirect routes.
- Modify `front/src/app/route-guards.tsx`
  - Separate member, host, and platform admin guards.
- Modify `front/src/app/layouts.tsx`
  - Add club switcher and admin shell integration.
- Create `front/features/club-selection/`
  - Smart `/app` entry and club picker.
- Create `front/features/platform-admin/`
  - Admin dashboard, clubs, domains, users, audit pages.
- Modify `front/features/auth/`
  - Login and invite routes build club-aware OAuth/invite URLs.
- Modify `front/features/public/`
  - Load public club/session by slug and set canonical/noindex metadata.

### Cloudflare Pages Functions

- Modify `front/functions/api/bff/[[path]].ts`
  - Forward `X-Readmates-Club-Host` and `X-Readmates-Club-Slug`.
- Modify `front/functions/oauth2/authorization/[[registrationId]].ts`
  - Forward signed return state and source host safely.
- Modify `front/functions/login/oauth2/code/[[registrationId]].ts`
  - Preserve redirected location and cookies.
- Modify `front/public/_redirects`
  - Keep API/OAuth passthrough before SPA fallback.

### Docs

- Modify `docs/development/architecture.md`
- Modify `docs/deploy/cloudflare-pages.md`
- Modify `docs/deploy/oci-backend.md`
- Create `docs/deploy/multi-club-domains.md`

---

## Task 1: Add Multi-Club Schema and Baseline Migration

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql`
- Create: `server/src/main/resources/db/migration/V12__multi_club_platform.sql`
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Test: `server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt`

- [ ] **Step 1: Write migration assertions**

Add assertions to `ReadmatesMySqlSeedTest`:

```kotlin
@Test
fun `seed has baseline multi club metadata`() {
    val club = jdbcTemplate.queryForMap(
        """
        select id, slug, status
        from clubs
        where slug = 'reading-sai'
        """.trimIndent(),
    )
    assertThat(club["status"]).isEqualTo("ACTIVE")

    val domainCount = jdbcTemplate.queryForObject(
        """
        select count(*)
        from club_domains
        where club_id = ?
          and status in ('ACTION_REQUIRED', 'ACTIVE')
        """.trimIndent(),
        Int::class.java,
        club["id"],
    )
    assertThat(domainCount).isGreaterThanOrEqualTo(0)
}

@Test
fun `dev seed contains second club for cross club tests`() {
    val count = jdbcTemplate.queryForObject(
        """
        select count(*)
        from clubs
        where slug in ('reading-sai', 'sample-book-club')
        """.trimIndent(),
        Int::class.java,
    )
    assertThat(count).isEqualTo(2)
}
```

- [ ] **Step 2: Run migration tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: FAIL because `clubs.status`, `club_domains`, `platform_admins`, and the second dev club do not exist yet.

- [ ] **Step 3: Add MySQL migration**

Create `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql`:

```sql
alter table clubs
  add column status varchar(30) not null default 'ACTIVE';

alter table clubs
  add constraint clubs_status_check check (status in ('SETUP_REQUIRED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

create table club_domains (
  id char(36) not null,
  club_id char(36) not null,
  hostname varchar(255) not null,
  kind varchar(30) not null,
  status varchar(30) not null,
  is_primary boolean not null default false,
  verified_at datetime(6),
  last_checked_at datetime(6),
  provisioning_error_code varchar(120),
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key club_domains_hostname_uk (hostname),
  key club_domains_club_status_idx (club_id, status, is_primary),
  constraint club_domains_club_fk foreign key (club_id) references clubs(id),
  constraint club_domains_kind_check check (kind in ('SUBDOMAIN', 'CUSTOM_DOMAIN')),
  constraint club_domains_status_check check (status in ('REQUESTED', 'ACTION_REQUIRED', 'PROVISIONING', 'ACTIVE', 'FAILED', 'DISABLED')),
  constraint club_domains_hostname_check check (length(trim(hostname)) > 0)
);

create table platform_admins (
  user_id char(36) not null,
  role varchar(30) not null,
  status varchar(30) not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (user_id),
  constraint platform_admins_user_fk foreign key (user_id) references users(id),
  constraint platform_admins_role_check check (role in ('OWNER', 'OPERATOR', 'SUPPORT')),
  constraint platform_admins_status_check check (status in ('ACTIVE', 'DISABLED'))
);

create table club_audit_events (
  id char(36) not null,
  actor_user_id char(36),
  actor_platform_role varchar(30),
  club_id char(36),
  event_type varchar(80) not null,
  metadata_json json not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key club_audit_events_club_created_idx (club_id, created_at),
  key club_audit_events_actor_created_idx (actor_user_id, created_at),
  constraint club_audit_events_actor_fk foreign key (actor_user_id) references users(id),
  constraint club_audit_events_club_fk foreign key (club_id) references clubs(id),
  constraint club_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create table platform_audit_events (
  id char(36) not null,
  actor_user_id char(36),
  actor_platform_role varchar(30),
  target_user_id char(36),
  event_type varchar(80) not null,
  metadata_json json not null,
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key platform_audit_events_actor_created_idx (actor_user_id, created_at),
  key platform_audit_events_target_created_idx (target_user_id, created_at),
  constraint platform_audit_events_actor_fk foreign key (actor_user_id) references users(id),
  constraint platform_audit_events_target_fk foreign key (target_user_id) references users(id),
  constraint platform_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create table support_access_grants (
  id char(36) not null,
  club_id char(36) not null,
  granted_by_user_id char(36) not null,
  grantee_user_id char(36) not null,
  scope varchar(60) not null,
  reason varchar(500) not null,
  expires_at datetime(6) not null,
  revoked_at datetime(6),
  created_at datetime(6) not null default (utc_timestamp(6)),
  primary key (id),
  key support_access_grants_club_expires_idx (club_id, expires_at),
  key support_access_grants_grantee_expires_idx (grantee_user_id, expires_at),
  constraint support_access_grants_club_fk foreign key (club_id) references clubs(id),
  constraint support_access_grants_granted_by_fk foreign key (granted_by_user_id) references users(id),
  constraint support_access_grants_grantee_fk foreign key (grantee_user_id) references users(id),
  constraint support_access_grants_scope_check check (scope in ('METADATA_READ', 'HOST_SUPPORT_READ')),
  constraint support_access_grants_reason_check check (length(trim(reason)) > 0)
);
```

- [ ] **Step 4: Add H2/PostgreSQL-style test migration**

Create `server/src/main/resources/db/migration/V12__multi_club_platform.sql` with equivalent `uuid`, `timestamptz`, and `jsonb`-compatible syntax:

```sql
alter table clubs
  add column status varchar(30) not null default 'ACTIVE';

alter table clubs
  add constraint clubs_status_check check (status in ('SETUP_REQUIRED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'));

create table club_domains (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  hostname varchar(255) not null unique,
  kind varchar(30) not null,
  status varchar(30) not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  last_checked_at timestamptz,
  provisioning_error_code varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_domains_kind_check check (kind in ('SUBDOMAIN', 'CUSTOM_DOMAIN')),
  constraint club_domains_status_check check (status in ('REQUESTED', 'ACTION_REQUIRED', 'PROVISIONING', 'ACTIVE', 'FAILED', 'DISABLED')),
  constraint club_domains_hostname_check check (length(trim(hostname)) > 0)
);

create index club_domains_club_status_idx
  on club_domains (club_id, status, is_primary);

create table platform_admins (
  user_id uuid primary key references users(id),
  role varchar(30) not null,
  status varchar(30) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_role_check check (role in ('OWNER', 'OPERATOR', 'SUPPORT')),
  constraint platform_admins_status_check check (status in ('ACTIVE', 'DISABLED'))
);

create table club_audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  actor_platform_role varchar(30),
  club_id uuid references clubs(id),
  event_type varchar(80) not null,
  metadata_json text not null,
  created_at timestamptz not null default now(),
  constraint club_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create index club_audit_events_club_created_idx
  on club_audit_events (club_id, created_at);

create table platform_audit_events (
  id uuid primary key,
  actor_user_id uuid references users(id),
  actor_platform_role varchar(30),
  target_user_id uuid references users(id),
  event_type varchar(80) not null,
  metadata_json text not null,
  created_at timestamptz not null default now(),
  constraint platform_audit_events_event_type_check check (length(trim(event_type)) > 0)
);

create table support_access_grants (
  id uuid primary key,
  club_id uuid not null references clubs(id),
  granted_by_user_id uuid not null references users(id),
  grantee_user_id uuid not null references users(id),
  scope varchar(60) not null,
  reason varchar(500) not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_grants_scope_check check (scope in ('METADATA_READ', 'HOST_SUPPORT_READ')),
  constraint support_access_grants_reason_check check (length(trim(reason)) > 0)
);
```

- [ ] **Step 5: Expand dev seed to two clubs**

In both dev seed files, add a public-safe second club:

```sql
insert into clubs (id, slug, name, tagline, about, status)
values (
  '00000000-0000-0000-0000-000000000002',
  'sample-book-club',
  '샘플 북클럽',
  '다른 클럽 권한을 확인하기 위한 공개 샘플입니다.',
  'ReadMates 멀티 클럽 개발 검증용 샘플 클럽입니다.',
  'ACTIVE'
)
on duplicate key update
  name = values(name),
  tagline = values(tagline),
  about = values(about),
  status = values(status);
```

Use H2-compatible upsert syntax in `db/dev/R__readmates_dev_seed.sql` if the existing file uses `merge`.

- [ ] **Step 6: Run migration tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql \
  server/src/main/resources/db/migration/V12__multi_club_platform.sql \
  server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql \
  server/src/main/resources/db/dev/R__readmates_dev_seed.sql \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt \
  server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt
git commit -m "feat: add multi-club platform schema"
```

---

## Task 2: Add Club Domain and Platform Admin Domain Models

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/domain/ClubDomainStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/club/domain/ClubDomainKind.kt`
- Create: `server/src/main/kotlin/com/readmates/club/domain/ClubStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/club/domain/PlatformAdminRole.kt`
- Create: `server/src/main/kotlin/com/readmates/club/domain/PlatformAdminStatus.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/model/ClubContextModels.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/ClubSlugTest.kt`

- [ ] **Step 1: Write slug validation tests**

Create `server/src/test/kotlin/com/readmates/club/application/ClubSlugTest.kt`:

```kotlin
package com.readmates.club.application

import com.readmates.club.application.model.ClubSlug
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class ClubSlugTest {
    @Test
    fun `accepts simple lowercase slug`() {
        assertThat(ClubSlug.parse("reading-sai").value).isEqualTo("reading-sai")
    }

    @Test
    fun `rejects reserved slug`() {
        assertThatThrownBy { ClubSlug.parse("admin") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("reserved")
    }

    @Test
    fun `rejects uppercase and double hyphen`() {
        assertThatThrownBy { ClubSlug.parse("ReadMates") }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { ClubSlug.parse("book--club") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }
}
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.application.ClubSlugTest
```

Expected: FAIL because `ClubSlug` does not exist.

- [ ] **Step 3: Add domain enums and ClubSlug**

Create enum files:

```kotlin
package com.readmates.club.domain

enum class ClubDomainStatus {
    REQUESTED,
    ACTION_REQUIRED,
    PROVISIONING,
    ACTIVE,
    FAILED,
    DISABLED,
}
```

Create `ClubContextModels.kt`:

```kotlin
package com.readmates.club.application.model

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.domain.PlatformAdminRole
import java.util.UUID

@JvmInline
value class ClubSlug private constructor(val value: String) {
    companion object {
        private val pattern = Regex("^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
        private val reserved = setOf(
            "admin", "api", "app", "auth", "login", "logout", "oauth2", "www",
            "mail", "support", "static", "assets", "pages", "readmates",
        )

        fun parse(raw: String): ClubSlug {
            val normalized = raw.trim()
            require(pattern.matches(normalized)) { "Invalid club slug" }
            require("--" !in normalized) { "Invalid club slug" }
            require(normalized !in reserved) { "Club slug is reserved" }
            return ClubSlug(normalized)
        }
    }
}

data class ResolvedClubContext(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val status: String,
    val hostname: String?,
)

data class JoinedClubSummary(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val membershipId: UUID,
    val role: MembershipRole,
    val status: MembershipStatus,
    val primaryHost: String?,
)

data class PlatformAdminSummary(
    val userId: UUID,
    val role: PlatformAdminRole,
)
```

- [ ] **Step 4: Run test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.application.ClubSlugTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club server/src/test/kotlin/com/readmates/club/application/ClubSlugTest.kt
git commit -m "feat: add club context domain models"
```

---

## Task 3: Implement Club Context Lookup and Trusted Headers

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/ClubContextUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/ClubContextPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/ClubContextService.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextHeader.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/ClubContextResolverTest.kt`

- [ ] **Step 1: Write resolver tests**

Create tests that insert a `club_domains` row and verify host/slug resolution:

```kotlin
@Test
fun `resolves active club by slug`() {
    val context = service.resolveBySlug("reading-sai")
    assertThat(context).isNotNull
    assertThat(context!!.slug).isEqualTo("reading-sai")
}

@Test
fun `resolves active club by registered hostname`() {
    insertClubDomain("reading-sai.example.test", "reading-sai", "ACTIVE")
    val context = service.resolveByHost("reading-sai.example.test")
    assertThat(context).isNotNull
    assertThat(context!!.slug).isEqualTo("reading-sai")
}

@Test
fun `does not resolve disabled hostname`() {
    insertClubDomain("disabled.example.test", "reading-sai", "DISABLED")
    assertThat(service.resolveByHost("disabled.example.test")).isNull()
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.ClubContextResolverTest
```

Expected: FAIL because context service and adapter do not exist.

- [ ] **Step 3: Implement ports and service**

Add:

```kotlin
interface ResolveClubContextUseCase {
    fun resolveBySlug(slug: String): ResolvedClubContext?
    fun resolveByHost(hostname: String): ResolvedClubContext?
}

interface LoadClubContextPort {
    fun loadBySlug(slug: ClubSlug): ResolvedClubContext?
    fun loadByHostname(hostname: String): ResolvedClubContext?
}

@Service
class ClubContextService(
    private val loadClubContextPort: LoadClubContextPort,
) : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String): ResolvedClubContext? =
        loadClubContextPort.loadBySlug(ClubSlug.parse(slug))

    override fun resolveByHost(hostname: String): ResolvedClubContext? {
        val normalized = hostname.trim().lowercase(Locale.ROOT).removeSuffix(".")
        if (normalized.isBlank()) return null
        return loadClubContextPort.loadByHostname(normalized)
    }
}
```

- [ ] **Step 4: Implement JDBC adapter**

Implement active host lookup:

```sql
select clubs.id, clubs.slug, clubs.name, clubs.status, club_domains.hostname
from club_domains
join clubs on clubs.id = club_domains.club_id
where club_domains.hostname = ?
  and club_domains.status = 'ACTIVE'
  and clubs.status in ('ACTIVE', 'SETUP_REQUIRED')
limit 1
```

Implement slug lookup:

```sql
select clubs.id, clubs.slug, clubs.name, clubs.status, null as hostname
from clubs
where clubs.slug = ?
  and clubs.status in ('ACTIVE', 'SETUP_REQUIRED')
limit 1
```

- [ ] **Step 5: Add header helper**

Create constants:

```kotlin
object ClubContextHeader {
    const val CLUB_HOST = "X-Readmates-Club-Host"
    const val CLUB_SLUG = "X-Readmates-Club-Slug"
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.ClubContextResolverTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club server/src/test/kotlin/com/readmates/club/api/ClubContextResolverTest.kt
git commit -m "feat: resolve club context by slug and host"
```

---

## Task 4: Forward Club Context Through Cloudflare Pages Functions

**Files:**
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Modify: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Test: `front/tests/unit/cloudflare-bff.test.ts`
- Test: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

- [ ] **Step 1: Write BFF header forwarding tests**

Add a test to `cloudflare-bff.test.ts`:

```ts
it("forwards normalized club host from request host", async () => {
  await context(new Request("https://reading-sai.example.test/api/bff/api/auth/me"), {
    path: ["api", "auth", "me"],
  });

  const [, init] = fetchMock.mock.calls.at(-1)!;
  const headers = init!.headers as Headers;
  expect(headers.get("X-Readmates-Club-Host")).toBe("reading-sai.example.test");
});
```

- [ ] **Step 2: Write OAuth proxy tests**

Add to `cloudflare-oauth-proxy.test.ts`:

```ts
it("forwards club host during OAuth authorization start", async () => {
  await onRequestGet({
    request: new Request("https://reading-sai.example.test/oauth2/authorization/google?returnTo=/app"),
    env,
    params: { registrationId: "google" },
  });

  const [, init] = fetchMock.mock.calls.at(-1)!;
  const headers = init!.headers as Headers;
  expect(headers.get("X-Readmates-Club-Host")).toBe("reading-sai.example.test");
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --dir front test -- cloudflare-bff cloudflare-oauth-proxy
```

Expected: FAIL because `X-Readmates-Club-Host` is not forwarded.

- [ ] **Step 4: Implement normalized host forwarding**

In each Pages Function, derive:

```ts
function normalizedHostFromRequest(request: Request) {
  const host = new URL(request.url).host.trim().toLowerCase();
  return host.endsWith(".") ? host.slice(0, -1) : host;
}
```

Set:

```ts
headers.set("X-Readmates-Club-Host", normalizedHostFromRequest(request));
```

Do not trust or pass through a browser-provided `X-Readmates-Club-Host`; overwrite it from `request.url`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir front test -- cloudflare-bff cloudflare-oauth-proxy
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/functions front/tests/unit/cloudflare-bff.test.ts front/tests/unit/cloudflare-oauth-proxy.test.ts
git commit -m "feat: forward club host through pages functions"
```

---

## Task 5: Change Auth Resolution to User Plus Club Context

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/port/in/ResolveCurrentMemberUseCase.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolverTest.kt`

- [ ] **Step 1: Write cross-club auth tests**

Add a test where one user has two memberships:

```kotlin
@Test
fun `auth me reports current membership for requested club and joined clubs`() {
    insertSecondClubMembershipForCurrentUser(role = "MEMBER", status = "ACTIVE")

    mockMvc.get("/api/auth/me") {
        header("X-Readmates-Club-Slug", "sample-book-club")
        cookie(sessionCookieForCurrentUser())
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.currentMembership.clubSlug") { value("sample-book-club") }
        jsonPath("$.joinedClubs.length()") { value(2) }
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.AuthMeControllerTest --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest
```

Expected: FAIL because the response has no `currentMembership` or `joinedClubs`.

- [ ] **Step 3: Extend `CurrentMember`**

Add:

```kotlin
val clubSlug: String,
```

Update all `CurrentMember` constructor call sites to include the slug from joined `clubs.slug`.

- [ ] **Step 4: Add new auth response DTO**

Define response shape:

```kotlin
data class AuthMemberResponse(
    val authenticated: Boolean,
    val userId: String?,
    val email: String?,
    val accountName: String?,
    val currentMembership: AuthCurrentMembership?,
    val joinedClubs: List<AuthJoinedClub>,
    val platformAdmin: AuthPlatformAdmin?,
    val recommendedAppEntryUrl: String?,
    val membershipId: String? = currentMembership?.membershipId,
    val clubId: String? = currentMembership?.clubId,
    val displayName: String? = currentMembership?.displayName,
    val role: String? = currentMembership?.role,
    val membershipStatus: String? = currentMembership?.membershipStatus,
    val approvalState: String,
)
```

Keep legacy top-level fields until frontend migration completes.

- [ ] **Step 5: Implement user+club lookup**

Add `MemberAccountStorePort` methods:

```kotlin
fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember?
fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember?
fun listJoinedClubs(userId: UUID): List<JoinedClubSummary>
fun findPlatformAdmin(userId: UUID): PlatformAdminSummary?
```

Use query:

```sql
select users.id as user_id,
       memberships.id as membership_id,
       clubs.id as club_id,
       clubs.slug as club_slug,
       users.email,
       users.name as account_name,
       coalesce(memberships.short_name, users.name) as display_name,
       memberships.role,
       memberships.status as membership_status
from users
join memberships on memberships.user_id = users.id
join clubs on clubs.id = memberships.club_id
where users.id = ?
  and clubs.id = ?
  and memberships.status in ('ACTIVE', 'SUSPENDED', 'VIEWER')
limit 1
```

- [ ] **Step 6: Update argument resolver**

Resolution order:

1. If request has trusted `X-Readmates-Club-Slug`, resolve club by slug.
2. Else if request has trusted `X-Readmates-Club-Host`, resolve club by host.
3. If no club context exists, preserve legacy email lookup for compatibility endpoints.
4. For club-scoped endpoints, fail `401` or `403` when no current club membership exists.

- [ ] **Step 7: Run auth tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.AuthMeControllerTest --tests com.readmates.auth.adapter.in.security.CurrentMemberArgumentResolverTest
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/security \
  server/src/main/kotlin/com/readmates/auth \
  server/src/test/kotlin/com/readmates/auth
git commit -m "feat: resolve auth by current club context"
```

---

## Task 6: Implement Primary-Origin OAuth Return Flow

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt`
- Modify: `server/src/main/resources/application.yml`
- Test: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt`

- [ ] **Step 1: Write OAuth return tests**

Add:

```kotlin
@Test
fun `oauth success redirects to validated return url`() {
    val state = OAuthReturnState.sign("/clubs/reading-sai/app", "test-secret")

    mockOAuthSuccess(returnState = state)

    assertThat(response.redirectedUrl).isEqualTo("http://localhost:3000/clubs/reading-sai/app")
}

@Test
fun `oauth success ignores untrusted absolute return url`() {
    val state = OAuthReturnState.sign("https://untrusted.example/app", "test-secret")

    mockOAuthSuccess(returnState = state)

    assertThat(response.redirectedUrl).isEqualTo("http://localhost:3000/app")
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest
```

Expected: FAIL because return-state support does not exist.

- [ ] **Step 3: Add configuration**

In `application.yml`, add:

```yaml
readmates:
  auth:
    return-state-secret: ${READMATES_AUTH_RETURN_STATE_SECRET:dev-return-state-secret}
    auth-base-url: ${READMATES_AUTH_BASE_URL:${READMATES_APP_BASE_URL:http://localhost:3000}}
```

- [ ] **Step 4: Implement signed return state**

Use HMAC-SHA256 over `returnTo|expiresAtEpochSeconds`.

Validation rules:

- Relative paths must start with `/` and must not start with `//`.
- Absolute URLs are allowed only when host is a registered active `club_domains.hostname`, the primary app host, or `readmates.pages.dev` in preview.
- Expired state falls back to `/app`.
- Invalid signature falls back to `/app`.

- [ ] **Step 5: Update success handler**

Replace:

```kotlin
response.sendRedirect("$appOrigin/app")
```

with:

```kotlin
val redirectTarget = inviteTarget
    ?: oauthReturnState.validatedReturnUrl(request)
    ?: "$appOrigin/app"
response.sendRedirect(redirectTarget)
```

- [ ] **Step 6: Run OAuth tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security \
  server/src/main/resources/application.yml \
  server/src/test/kotlin/com/readmates/auth
git commit -m "feat: support club-aware oauth return flow"
```

---

## Task 7: Make Invitations Club-Aware

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/InvitationController.kt`
- Modify: `front/features/auth/ui/invite-acceptance-card.tsx`
- Modify: `front/features/auth/route/invite-route.tsx`
- Test: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`
- Test: `front/tests/unit/invite-acceptance-card.test.tsx`

- [ ] **Step 1: Write invite tests**

Add server test:

```kotlin
@Test
fun `legacy invite redirects to club scoped invite route`() {
    val token = createInviteForClub("reading-sai")

    mockMvc.get("/api/invitations/$token/preview")
        .andExpect {
            status { isOk() }
            jsonPath("$.clubSlug") { value("reading-sai") }
            jsonPath("$.canonicalPath") { value("/clubs/reading-sai/invite/$token") }
        }
}
```

Add frontend test:

```ts
expect(screen.getByRole("link", { name: /Google/ })).toHaveAttribute(
  "href",
  "/oauth2/authorization/google?inviteToken=test-token&returnTo=%2Fclubs%2Freading-sai%2Finvite%2Ftest-token",
);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.InvitationControllerDbTest --tests com.readmates.auth.api.HostInvitationControllerTest
pnpm --dir front test -- invite-acceptance-card
```

Expected: FAIL because invite preview has no club slug or canonical path.

- [ ] **Step 3: Update invite URL generation**

Change `acceptUrl(token)` to use current club:

```kotlin
private fun acceptUrl(clubSlug: String, token: String, primaryHost: String?): String {
    return if (primaryHost != null) {
        "https://$primaryHost/invite/$token"
    } else {
        "${appBaseUrl.trimEnd('/')}/clubs/$clubSlug/invite/$token"
    }
}
```

- [ ] **Step 4: Enforce token club binding**

Preview/accept queries must select invitation with `token_hash` and return `club_id`, `club_slug`. Accept command must verify route `clubSlug` equals invitation club slug.

- [ ] **Step 5: Update frontend invite route**

Add route `/clubs/:clubSlug/invite/:token`. Build OAuth href with both token and return path.

- [ ] **Step 6: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.InvitationControllerDbTest --tests com.readmates.auth.api.HostInvitationControllerTest
pnpm --dir front test -- invite-acceptance-card
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth front/features/auth front/tests/unit/invite-acceptance-card.test.tsx server/src/test/kotlin/com/readmates/auth
git commit -m "feat: make invitations club aware"
```

---

## Task 8: Convert Public API and Routes to Club Slugs

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/publication/application/port/in/PublicUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/port/out/LoadPublishedPublicDataPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/in/web/PublicController.kt`
- Modify: `front/features/public/route/public-route-data.ts`
- Modify: `front/src/app/router.tsx`
- Test: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Test: `front/tests/unit/public-club.test.tsx`
- Test: `front/tests/unit/spa-router.test.tsx`

- [ ] **Step 1: Write public API tests**

Add:

```kotlin
@Test
fun `public club endpoint resolves by slug`() {
    mockMvc.get("/api/public/clubs/reading-sai")
        .andExpect {
            status { isOk() }
            jsonPath("$.clubName") { exists() }
        }
}

@Test
fun `public club endpoint returns not found for unknown slug`() {
    mockMvc.get("/api/public/clubs/missing-club")
        .andExpect { status { isNotFound() } }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
pnpm --dir front test -- public-club spa-router
```

Expected: FAIL because slug routes do not exist.

- [ ] **Step 3: Update public use cases**

Change:

```kotlin
fun getClub(): PublicClubResult?
fun getSession(sessionId: UUID): PublicSessionDetailResult?
```

to:

```kotlin
fun getClub(clubSlug: String): PublicClubResult?
fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult?
```

- [ ] **Step 4: Remove hard-coded `reading-sai` SQL**

Replace:

```sql
where slug = 'reading-sai'
```

with:

```sql
where slug = ?
  and status = 'ACTIVE'
```

- [ ] **Step 5: Add React Router public slug routes**

Add routes:

```tsx
{
  path: "/clubs/:clubSlug",
  element: <PublicHomePage />,
  loader: publicClubLoader,
}
```

Keep `/` as compatibility route that redirects to the baseline club when configured.

- [ ] **Step 6: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
pnpm --dir front test -- public-club spa-router
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/publication front/features/public front/src/app/router.tsx front/tests/unit server/src/test/kotlin/com/readmates
git commit -m "feat: serve public club pages by slug"
```

---

## Task 9: Add SEO Canonical and Pages.dev Noindex

**Files:**
- Create: `front/features/public/model/public-url-policy.ts`
- Modify: `front/features/public/route/public-route-data.ts`
- Modify: `front/features/public/ui/public-home.tsx`
- Modify: `front/features/public/ui/public-club.tsx`
- Test: `front/tests/unit/public-club.test.tsx`

- [ ] **Step 1: Write SEO tests**

Add:

```ts
expect(buildCanonicalUrl({
  host: "readmates.pages.dev",
  clubSlug: "reading-sai",
  path: "/clubs/reading-sai",
  primaryDomain: "example.test",
})).toBe("https://reading-sai.example.test/");

expect(shouldNoIndex("readmates.pages.dev")).toBe(true);
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front test -- public-club
```

Expected: FAIL because URL policy module does not exist.

- [ ] **Step 3: Implement URL policy**

Create:

```ts
export function shouldNoIndex(host: string) {
  return host === "readmates.pages.dev" || host.endsWith(".pages.dev");
}

export function buildCanonicalUrl(input: { host: string; clubSlug: string; path: string; primaryDomain: string }) {
  const clubHost = `${input.clubSlug}.${input.primaryDomain}`;
  const normalizedPath = input.path.replace(new RegExp(`^/clubs/${input.clubSlug}`), "") || "/";
  return `https://${clubHost}${normalizedPath}`;
}
```

- [ ] **Step 4: Render tags**

Use route data to render:

```tsx
<link rel="canonical" href={canonicalUrl} />
{noIndex ? <meta name="robots" content="noindex" /> : null}
```

If current head management is not centralized, render through a small component mounted in public route UI.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir front test -- public-club
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/public front/tests/unit/public-club.test.tsx
git commit -m "feat: add public canonical url policy"
```

---

## Task 10: Add Club-Scoped Member and Host Routes

**Files:**
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/route-guards.tsx`
- Modify: `front/shared/auth/member-app-loader.ts`
- Modify: `front/features/host/route/host-loader-auth.ts`
- Modify: loaders under `front/features/**/route`
- Test: `front/tests/unit/spa-router.test.tsx`
- Test: `front/tests/unit/member-app-access.test.ts`
- Test: `front/tests/unit/host-dashboard.test.tsx`

- [ ] **Step 1: Write router tests**

Add:

```ts
expect(routes).toContainRoute("/clubs/:clubSlug/app")
expect(routes).toContainRoute("/clubs/:clubSlug/app/host")
expect(routes).toContainRoute("/clubs/:clubSlug/app/archive")
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --dir front test -- spa-router member-app-access host-dashboard
```

Expected: FAIL because club-scoped app routes do not exist.

- [ ] **Step 3: Add route tree**

Wrap existing `/app` children under:

```tsx
{
  path: "/clubs/:clubSlug/app",
  element: (
    <RequireMemberApp>
      <AppRouteLayout />
    </RequireMemberApp>
  ),
  children: [
    {
      index: true,
      element: <AppHomePage />,
      loader: memberHomeLoader,
    },
    {
      path: "session/current",
      element: <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />,
      loader: currentSessionLoader,
      action: currentSessionAction,
    },
  ]
}
```

Keep `/app` as smart entry route from Task 11.

- [ ] **Step 4: Update loaders to pass club context**

For loader auth calls:

```ts
const clubSlug = params.clubSlug;
const auth = await readmatesFetch<AuthMeResponse>(
  clubSlug ? `/api/auth/me?clubSlug=${encodeURIComponent(clubSlug)}` : "/api/auth/me",
);
```

Prefer headers or club-scoped API once server routes are ready.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir front test -- spa-router member-app-access host-dashboard
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/src/app front/shared/auth front/features front/tests/unit
git commit -m "feat: add club scoped app routes"
```

---

## Task 11: Implement Smart App Entry and Club Switcher

**Files:**
- Create: `front/features/club-selection/route/club-selection-route.tsx`
- Create: `front/features/club-selection/ui/club-selection-page.tsx`
- Create: `front/features/club-selection/model/club-entry.ts`
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/layouts.tsx`
- Test: `front/tests/unit/club-selection.test.tsx`
- Test: `front/tests/unit/spa-layout.test.tsx`

- [ ] **Step 1: Write smart entry tests**

Create:

```ts
it("redirects to only joined club", () => {
  expect(recommendedClubEntryUrl({
    authenticated: true,
    joinedClubs: [{ clubSlug: "reading-sai", status: "ACTIVE" }],
  })).toBe("/clubs/reading-sai/app");
});

it("shows selector when multiple clubs exist", () => {
  expect(recommendedClubEntryUrl({
    authenticated: true,
    joinedClubs: [
      { clubSlug: "reading-sai", status: "ACTIVE" },
      { clubSlug: "sample-book-club", status: "ACTIVE" },
    ],
  })).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --dir front test -- club-selection spa-layout
```

Expected: FAIL because club selection files do not exist.

- [ ] **Step 3: Implement entry model**

Create `club-entry.ts`:

```ts
export function recommendedClubEntryUrl(auth: {
  authenticated: boolean;
  joinedClubs: Array<{ clubSlug: string; status: string }>;
}) {
  if (!auth.authenticated) return "/login";
  const usable = auth.joinedClubs.filter((club) => ["VIEWER", "ACTIVE", "SUSPENDED"].includes(club.status));
  if (usable.length === 1) return `/clubs/${usable[0].clubSlug}/app`;
  return null;
}
```

- [ ] **Step 4: Implement UI**

Render joined clubs as links:

```tsx
<Link to={`/clubs/${club.clubSlug}/app`}>{club.clubName}</Link>
```

Show role/status badges from auth response.

- [ ] **Step 5: Add club switcher to layout**

Add a compact select/menu in `AppRouteLayout`. It must navigate to the same relative app path under the selected club.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir front test -- club-selection spa-layout
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/club-selection front/src/app front/tests/unit/club-selection.test.tsx front/tests/unit/spa-layout.test.tsx
git commit -m "feat: add club selection entry"
```

---

## Task 12: Add Platform Admin API Skeleton and Guards

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/adapter/in/security/CurrentPlatformAdminArgumentResolver.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminController.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`

- [ ] **Step 1: Write admin guard tests**

Tests:

```kotlin
@Test
fun `host without platform admin cannot access admin API`() {
    mockMvc.get("/api/admin/summary") {
        cookie(hostSessionCookie())
    }.andExpect { status { isForbidden() } }
}

@Test
fun `active owner can access admin summary`() {
    insertPlatformAdmin(role = "OWNER", status = "ACTIVE")
    mockMvc.get("/api/admin/summary") {
        cookie(ownerSessionCookie())
    }.andExpect {
        status { isOk() }
        jsonPath("$.platformRole") { value("OWNER") }
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.PlatformAdminControllerTest
```

Expected: FAIL because admin controller and resolver do not exist.

- [ ] **Step 3: Implement `CurrentPlatformAdmin`**

```kotlin
data class CurrentPlatformAdmin(
    val userId: UUID,
    val email: String,
    val role: PlatformAdminRole,
) {
    val canManagePlatformAdmins: Boolean get() = role == PlatformAdminRole.OWNER
    val canCreateClub: Boolean get() = role in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
}
```

- [ ] **Step 4: Implement controller summary**

`GET /api/admin/summary` returns:

```json
{
  "platformRole": "OWNER",
  "activeClubCount": 1,
  "domainActionRequiredCount": 0
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.PlatformAdminControllerTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/security server/src/main/kotlin/com/readmates/club server/src/main/kotlin/com/readmates/auth/adapter/in/security server/src/test/kotlin/com/readmates/club
git commit -m "feat: add platform admin guard"
```

---

## Task 13: Add Platform Admin Frontend Shell

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-api.ts`
- Create: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Create: `front/features/platform-admin/route/platform-admin-route.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/route-guards.tsx`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Write admin route tests**

```ts
it("blocks non-admin users from admin route", async () => {
  mockAuth({ authenticated: true, platformAdmin: null });
  render(<RequirePlatformAdmin><div>admin</div></RequirePlatformAdmin>);
  expect(screen.queryByText("admin")).not.toBeInTheDocument();
});

it("allows owner users into admin route", async () => {
  mockAuth({ authenticated: true, platformAdmin: { role: "OWNER" } });
  render(<RequirePlatformAdmin><div>admin</div></RequirePlatformAdmin>);
  expect(screen.getByText("admin")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --dir front test -- platform-admin
```

Expected: FAIL because platform admin route does not exist.

- [ ] **Step 3: Implement contracts**

```ts
export type PlatformAdminSummaryResponse = {
  platformRole: "OWNER" | "OPERATOR" | "SUPPORT";
  activeClubCount: number;
  domainActionRequiredCount: number;
};
```

- [ ] **Step 4: Add `/admin` route**

```tsx
{
  path: "/admin",
  element: (
    <RequirePlatformAdmin>
      <PlatformAdminRoute />
    </RequirePlatformAdmin>
  ),
  loader: platformAdminLoader,
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir front test -- platform-admin
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin front/src/app front/tests/unit/platform-admin.test.tsx
git commit -m "feat: add platform admin frontend shell"
```

---

## Task 14: Add Domain Provisioning Admin Surface

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminService.kt`
- Modify: `front/features/platform-admin/`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Write domain status tests**

Server:

```kotlin
@Test
fun `operator can create action required subdomain row`() {
    insertPlatformAdmin(role = "OPERATOR", status = "ACTIVE")
    mockMvc.post("/api/admin/clubs/$clubId/domains") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"hostname":"reading-sai.example.test","kind":"SUBDOMAIN"}"""
        cookie(operatorSessionCookie())
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("ACTION_REQUIRED") }
    }
}
```

Frontend:

```ts
expect(screen.getByText(/Cloudflare Pages custom domain/)).toBeInTheDocument();
expect(screen.getByText("ACTION_REQUIRED")).toBeInTheDocument();
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.PlatformAdminControllerTest
pnpm --dir front test -- platform-admin
```

Expected: FAIL because domain endpoints and UI do not exist.

- [ ] **Step 3: Implement server domain endpoint**

Endpoint:

```text
POST /api/admin/clubs/{clubId}/domains
```

Validation:

- hostname lowercase.
- hostname must not equal `readmates.pages.dev`.
- hostname unique.
- initial status is `ACTION_REQUIRED`.

- [ ] **Step 4: Implement UI**

Show hostname, status, and action text:

```tsx
{domain.status === "ACTION_REQUIRED" ? (
  <p>Cloudflare Pages custom domain 연결 후 상태 확인을 실행하세요.</p>
) : null}
```

- [ ] **Step 5: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.club.api.PlatformAdminControllerTest
pnpm --dir front test -- platform-admin
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club front/features/platform-admin server/src/test/kotlin/com/readmates/club front/tests/unit/platform-admin.test.tsx
git commit -m "feat: add admin domain provisioning status"
```

---

## Task 15: Update Notifications, Cache Keys, and Deep Links

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/port/out/PublicReadCachePort.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDispatchServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt`

- [ ] **Step 1: Write deep link test**

```kotlin
@Test
fun `member notification deep link includes club scoped app path`() {
    val notification = dispatchReviewPublished(clubSlug = "reading-sai", sessionId = sessionId)
    assertThat(notification.deepLinkPath).isEqualTo("/clubs/reading-sai/app/sessions/$sessionId")
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.application.service.NotificationDispatchServiceTest
```

Expected: FAIL because deep links are legacy member-app paths.

- [ ] **Step 3: Add club slug to notification context**

When building notification metadata, load or pass `clubSlug`.

Use:

```kotlin
fun clubScopedAppPath(clubSlug: String, path: String): String =
    "/clubs/$clubSlug/app/${path.trimStart('/')}"
```

- [ ] **Step 4: Verify Redis keys are already clubId-based**

Confirm existing keys contain `clubId`. If a public cache key is global, change it to include `clubId`.

- [ ] **Step 5: Run tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.application.service.NotificationDispatchServiceTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification server/src/main/kotlin/com/readmates/shared server/src/main/kotlin/com/readmates/publication server/src/test/kotlin/com/readmates/notification
git commit -m "feat: make notification links club scoped"
```

---

## Task 16: Add E2E Multi-Club Coverage

**Files:**
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Create: `front/tests/e2e/multi-club-flow.spec.ts`
- Modify: `front/playwright.config.ts` if base URL helpers need club host support.

- [ ] **Step 1: Add fixture helpers**

Add helpers:

```ts
export async function ensureSecondClubFixture() {
  await query(`
    insert into clubs (id, slug, name, tagline, about, status)
    values (?, 'sample-book-club', '샘플 북클럽', '테스트 클럽', '테스트 클럽입니다.', 'ACTIVE')
    on duplicate key update status = values(status)
  `, [SECOND_CLUB_ID]);
}
```

- [ ] **Step 2: Write E2E spec**

Create tests:

```ts
test("user can switch between joined clubs with different roles", async ({ page }) => {
  await ensureSecondClubFixture();
  await loginAs("host@example.com");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/clubs\/reading-sai\/app/);
  await page.getByRole("button", { name: /클럽/ }).click();
  await page.getByRole("link", { name: /샘플 북클럽/ }).click();
  await expect(page).toHaveURL(/\/clubs\/sample-book-club\/app/);
  await expect(page.getByRole("link", { name: /호스트/ })).toHaveCount(0);
});
```

- [ ] **Step 3: Run E2E**

Run:

```bash
pnpm --dir front test:e2e -- multi-club-flow
```

Expected: PASS after earlier tasks are complete.

- [ ] **Step 4: Commit**

```bash
git add front/tests/e2e front/playwright.config.ts
git commit -m "test: cover multi-club user flows"
```

---

## Task 17: Update Deployment and Architecture Documentation

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/deploy/cloudflare-pages.md`
- Modify: `docs/deploy/oci-backend.md`
- Create: `docs/deploy/multi-club-domains.md`
- Modify: `README.md` only if portfolio-facing summary must mention multi-club support after implementation ships.

- [ ] **Step 1: Write docs**

`docs/deploy/multi-club-domains.md` must cover:

- `readmates.pages.dev` fallback role.
- Primary domain callback.
- Registered subdomain alias setup.
- `ACTION_REQUIRED` operational flow.
- `READMATES_AUTH_BASE_URL`.
- `READMATES_ALLOWED_ORIGINS`.
- OAuth redirect URI list.
- No real domains, secrets, account ids, zone ids, or private deployment state.

- [ ] **Step 2: Run docs checks**

Run:

```bash
git diff --check -- docs/development/architecture.md docs/deploy/cloudflare-pages.md docs/deploy/oci-backend.md docs/deploy/multi-club-domains.md README.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/development/architecture.md docs/deploy/cloudflare-pages.md docs/deploy/oci-backend.md docs/deploy/multi-club-domains.md README.md
git commit -m "docs: document multi-club domain operations"
```

---

## Task 18: Run Full Verification

**Files:**
- No source edits unless a verification failure points to a concrete regression.

- [ ] **Step 1: Run server tests**

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 3: Run E2E**

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 4: Run public release checks**

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS.

- [ ] **Step 5: Commit verification notes if docs changed**

If verification required docs-only updates:

```bash
git add docs
git commit -m "docs: record multi-club verification notes"
```

If no files changed, do not create an empty commit.

---

## Self-Review

### Spec Coverage

- Domain strategy: covered in Tasks 1, 3, 4, 14, 17.
- Routing model: covered in Tasks 8, 10, 11.
- Club context resolution: covered in Tasks 3, 4, 5.
- Auth/current club model: covered in Tasks 5, 6.
- Platform Admin: covered in Tasks 1, 2, 12, 13, 14.
- Club creation/domain management: covered in Tasks 12, 14, 17.
- Existing data migration: covered in Task 1 and Task 18.
- Invite club context: covered in Task 7.
- SEO/canonical: covered in Task 9.
- Cache/notifications/deep links: covered in Task 15.
- Verification: covered in Task 18.

### Known Execution Risks

- This plan changes `AuthMeResponse`; frontend tasks must keep legacy top-level fields until all callers move to `currentMembership`.
- OAuth return state must be signed and allowlisted. Do not accept arbitrary absolute URLs.
- Domain provisioning uses public-safe placeholders. Do not commit real Cloudflare account data.
- Keep legacy routes until E2E verifies club-scoped replacements.
