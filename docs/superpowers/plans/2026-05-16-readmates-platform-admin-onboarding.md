# ReadMates Platform Admin Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete `/admin` platform operations console for club registry, club onboarding, public/private exposure, domains, and first-host setup while keeping day-to-day club operations in the host app.

**Architecture:** Extend the existing platform-admin slice in the `club` feature. Add platform-owned onboarding use cases and persistence ports; keep host invitation APIs unchanged for normal member invites. Public exposure becomes a separate `clubs.public_visibility` source of truth checked by public query paths.

**Tech Stack:** Kotlin/Spring Boot, JDBC/MySQL/Flyway, React/Vite, React Router 7, TypeScript, Vitest, Testing Library.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-05-16-readmates-platform-admin-onboarding-design.md`

## Scope Boundary

In scope:

- Platform admin club registry.
- New club onboarding wizard.
- First host existing-user assignment with confirmation.
- First host new-user invitation with `HOST` role.
- Optional domain registration and check.
- Public/private toggle owned by platform admins.
- Public API privacy gate.

Out of scope:

- Host session tools inside `/admin`.
- General member lifecycle tools inside `/admin`.
- General member invitations inside `/admin`.
- Host-controlled public visibility toggle.
- Notification dispatch controls inside `/admin`.

## File Structure

Server files:

- Create `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`: adds `clubs.public_visibility` and platform-created invitation support.
- Create `server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt`: public/private enum.
- Modify `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`: add onboarding and club metadata errors.
- Modify `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`: add club registry, onboarding, and patch models.
- Modify `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`: add list, preview, commit, and update use cases.
- Modify `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`: add registry/onboarding persistence and mail ports.
- Create `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`: list and update platform-level club settings.
- Create `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`: preview and commit onboarding.
- Create `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`: registry, update, onboarding persistence.
- Create `server/src/main/kotlin/com/readmates/club/adapter/out/mail/PlatformAdminHostInvitationMailAdapter.kt`: host invitation email adapter behind a club-owned outbound port.
- Create `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`: `/api/admin/clubs` endpoints.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt`: map new errors to safe API errors.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`: add admin onboarding and club patch mutating paths to the origin/CSRF boundary.
- Modify `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`: require `public_visibility = 'PUBLIC'`.
- Modify `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`: assert new schema.
- Modify `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`: assert private clubs are hidden.
- Modify `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`: add registry, preview, commit, visibility, and role tests.
- Modify `server/src/test/kotlin/com/readmates/club/api/PlatformAdminBffSecurityTest.kt`: add new mutating admin paths.

Frontend files:

- Modify `front/features/platform-admin/api/platform-admin-contracts.ts`: add club registry and onboarding contracts.
- Modify `front/features/platform-admin/api/platform-admin-api.ts`: add API calls.
- Modify `front/features/platform-admin/route/platform-admin-data.ts`: load summary and clubs.
- Modify `front/features/platform-admin/route/platform-admin-route.tsx`: own route state and mutations.
- Modify `front/features/platform-admin/ui/platform-admin-dashboard.tsx`: render registry and wire wizard/detail panels.
- Create `front/features/platform-admin/ui/platform-admin-club-registry.tsx`: club list and platform actions.
- Create `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`: five-step wizard.
- Create `front/features/platform-admin/ui/platform-admin-club-detail.tsx`: edit public info, visibility, and domains.
- Modify `front/tests/unit/platform-admin.test.tsx`: API loader, dashboard, wizard, detail, and mutation tests.

Docs:

- Modify `docs/development/architecture.md`: document `clubs.public_visibility` and platform admin ownership.
- Modify `CHANGELOG.md`: add Unreleased platform admin entry.

---

### Task 1: Schema And Public Privacy Gate

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`
- Create: `server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`

- [ ] **Step 1: Write the migration test assertions**

Add these assertions inside `mysql creates multi club platform metadata tables` after the existing `clubs.status` assertions:

```kotlin
assertEquals("NO", columnValue("clubs", "public_visibility", "is_nullable"))
assertTrue(checkConstraintClause("clubs_public_visibility_check").contains("PRIVATE"))
assertTrue(checkConstraintClause("clubs_public_visibility_check").contains("PUBLIC"))
assertEquals("status,public_visibility", indexColumns("clubs", "clubs_status_public_visibility_idx"))
assertEquals("YES", columnValue("invitations", "invited_by_membership_id", "is_nullable"))
assertEquals("YES", columnValue("invitations", "invited_by_platform_admin_user_id", "is_nullable"))
assertEquals(
    "invited_by_platform_admin_user_id",
    foreignKeyColumns("invitations", "invitations_platform_admin_inviter_fk"),
)
assertEquals("users:id", foreignKeyReference("invitations", "invitations_platform_admin_inviter_fk"))
assertTrue(checkConstraintClause("invitations_inviter_source_check").contains("invited_by_membership_id"))
assertTrue(checkConstraintClause("invitations_inviter_source_check").contains("invited_by_platform_admin_user_id"))
```

- [ ] **Step 2: Add public API privacy tests**

Append these tests to `PublicControllerDbTest`:

```kotlin
@Test
@Sql(
    statements = ["update clubs set public_visibility = 'PRIVATE' where slug = 'reading-sai'"],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = ["update clubs set public_visibility = 'PUBLIC' where slug = 'reading-sai'"],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
fun `public club endpoint hides private clubs`() {
    mockMvc.get("/api/public/clubs/reading-sai").andExpect {
        status { isNotFound() }
    }
}

@Test
@Sql(
    statements = ["update clubs set public_visibility = 'PRIVATE' where slug = 'reading-sai'"],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = ["update clubs set public_visibility = 'PUBLIC' where slug = 'reading-sai'"],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
fun `public session endpoint hides sessions for private clubs`() {
    mockMvc.get("/api/public/clubs/reading-sai/sessions/00000000-0000-0000-0000-000000000306").andExpect {
        status { isNotFound() }
    }
}
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
./server/gradlew -p server --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.publication.api.PublicControllerDbTest clean test
```

Expected: migration assertions fail because `public_visibility` and platform invitation columns do not exist.

- [ ] **Step 4: Create the migration**

Create `server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql`:

```sql
alter table clubs
  add column public_visibility varchar(20) not null default 'PUBLIC' after status;

alter table clubs
  add constraint clubs_public_visibility_check check (public_visibility in ('PRIVATE', 'PUBLIC'));

create index clubs_status_public_visibility_idx
  on clubs (status, public_visibility);

alter table invitations
  drop foreign key invitations_inviter_fk;

alter table invitations
  modify column invited_by_membership_id char(36) null;

alter table invitations
  add column invited_by_platform_admin_user_id char(36) after invited_by_membership_id;

alter table invitations
  add constraint invitations_inviter_fk
  foreign key (invited_by_membership_id, club_id) references memberships(id, club_id);

alter table invitations
  add constraint invitations_platform_admin_inviter_fk
  foreign key (invited_by_platform_admin_user_id) references users(id);

alter table invitations
  add constraint invitations_inviter_source_check
  check (
    invited_by_membership_id is not null
    or invited_by_platform_admin_user_id is not null
  );
```

- [ ] **Step 5: Add the public visibility enum**

Create `server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt`:

```kotlin
package com.readmates.club.domain

enum class ClubPublicVisibility {
    PRIVATE,
    PUBLIC,
}
```

- [ ] **Step 6: Gate public queries**

In `JdbcPublicQueryAdapter`, add `and clubs.public_visibility = 'PUBLIC'` to both club/session queries:

```kotlin
from clubs
where slug = ?
  and status = 'ACTIVE'
  and public_visibility = 'PUBLIC'
```

```kotlin
where clubs.slug = ?
  and clubs.status = 'ACTIVE'
  and clubs.public_visibility = 'PUBLIC'
  and sessions.id = ?
  and sessions.state = 'PUBLISHED'
  and public_session_publications.visibility = 'PUBLIC'
```

- [ ] **Step 7: Run the focused tests**

Run:

```bash
./server/gradlew -p server --tests com.readmates.support.MySqlFlywayMigrationTest --tests com.readmates.publication.api.PublicControllerDbTest clean test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V30__platform_admin_onboarding.sql \
  server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt \
  server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt \
  server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt \
  server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
git commit -m "feat(admin): add club public visibility gate"
```

### Task 2: Platform Admin Club Registry And Visibility Updates

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`

- [ ] **Step 1: Add failing registry and visibility tests**

Append these tests to `PlatformAdminControllerTest`:

```kotlin
@Test
fun `operator can list platform admin clubs`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")

    mockMvc
        .get("/api/admin/clubs") {
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].clubId") { exists() }
            jsonPath("$.items[0].slug") { exists() }
            jsonPath("$.items[0].publicVisibility") { exists() }
            jsonPath("$.items[0].firstHostOnboardingState") { exists() }
        }
}

@Test
fun `operator can make setup club public when active host exists`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val clubId = createSetupClubWithActiveHost()

    mockMvc
        .patch("/api/admin/clubs/$clubId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"publicVisibility":"PUBLIC"}"""
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
            jsonPath("$.clubId") { value(clubId) }
            jsonPath("$.status") { value("ACTIVE") }
            jsonPath("$.publicVisibility") { value("PUBLIC") }
        }
}

@Test
fun `support admin cannot make a club public`() {
    val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")
    val clubId = createSetupClubWithActiveHost()

    mockMvc
        .patch("/api/admin/clubs/$clubId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"publicVisibility":"PUBLIC"}"""
            cookie(sessionCookieForUser(support))
        }.andExpect {
            status { isForbidden() }
        }
}
```

Add helper methods to the same test class:

```kotlin
private fun createSetupClubWithActiveHost(): String {
    val clubId = UUID.randomUUID().toString()
    val hostUserId = UUID.randomUUID().toString()
    val membershipId = UUID.randomUUID().toString()
    val slug = "setup-${UUID.randomUUID().toString().take(8)}"

    jdbcTemplate.update(
        """
        insert into clubs (id, slug, name, tagline, about, status, public_visibility)
        values (?, ?, 'Setup Club', 'Setup tagline', 'Setup about', 'SETUP_REQUIRED', 'PRIVATE')
        """.trimIndent(),
        clubId,
        slug,
    )
    jdbcTemplate.update(
        """
        insert into users (id, email, name, short_name, auth_provider)
        values (?, ?, 'Setup Host', 'Host', 'GOOGLE')
        """.trimIndent(),
        hostUserId,
        "setup.host.${UUID.randomUUID()}@example.com",
    )
    jdbcTemplate.update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
        values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host')
        """.trimIndent(),
        membershipId,
        clubId,
        hostUserId,
    )
    return clubId
}
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.PlatformAdminControllerTest clean test
```

Expected: FAIL because `/api/admin/clubs` and `PATCH /api/admin/clubs/{clubId}` do not exist.

- [ ] **Step 3: Add application models**

Append these models to `PlatformAdminModels.kt`:

```kotlin
data class PlatformAdminClubList(
    val items: List<PlatformAdminClubListItem>,
)

data class PlatformAdminClubListItem(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val status: ClubStatus,
    val publicVisibility: ClubPublicVisibility,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val firstHostOnboardingState: FirstHostOnboardingState,
)

enum class FirstHostOnboardingState {
    MISSING,
    INVITED,
    ASSIGNED,
}

data class UpdatePlatformAdminClubCommand(
    val name: String?,
    val tagline: String?,
    val about: String?,
    val publicVisibility: ClubPublicVisibility?,
)
```

Add imports:

```kotlin
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
```

- [ ] **Step 4: Add use cases and ports**

Append to `PlatformAdminUseCases.kt`:

```kotlin
interface ListPlatformAdminClubsUseCase {
    fun listClubs(admin: CurrentPlatformAdmin): PlatformAdminClubList
}

interface UpdatePlatformAdminClubUseCase {
    fun updateClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ): PlatformAdminClubListItem
}
```

Append to `PlatformAdminPorts.kt`:

```kotlin
interface LoadPlatformAdminClubsPort {
    fun listClubs(limit: Int): List<PlatformAdminClubListItem>

    fun loadClub(clubId: UUID): PlatformAdminClubListItem?

    fun activeHostCount(clubId: UUID): Int
}

interface UpdatePlatformAdminClubPort {
    fun updateClub(
        clubId: UUID,
        name: String?,
        tagline: String?,
        about: String?,
        status: ClubStatus?,
        publicVisibility: ClubPublicVisibility?,
    ): PlatformAdminClubListItem?
}
```

Add imports:

```kotlin
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
```

- [ ] **Step 5: Add registry service**

Create `PlatformAdminClubRegistryService.kt`:

```kotlin
package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class PlatformAdminClubRegistryService(
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val updateClubPort: UpdatePlatformAdminClubPort,
) : ListPlatformAdminClubsUseCase,
    UpdatePlatformAdminClubUseCase {
    override fun listClubs(admin: CurrentPlatformAdmin): PlatformAdminClubList =
        PlatformAdminClubList(loadClubsPort.listClubs(limit = 100))

    @Transactional
    override fun updateClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: UpdatePlatformAdminClubCommand,
    ) =
        if (!admin.canManageClubDomains) {
            throw AccessDeniedException("Platform admin role cannot update clubs")
        } else {
            val current =
                loadClubsPort.loadClub(clubId)
                    ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
            validatePublicInfo(command.name ?: current.name, command.tagline ?: current.tagline, command.about ?: current.about)
            val nextStatus =
                if (command.publicVisibility == ClubPublicVisibility.PUBLIC && current.status == ClubStatus.SETUP_REQUIRED) {
                    requireActiveHost(clubId)
                    ClubStatus.ACTIVE
                } else {
                    null
                }
            if (command.publicVisibility == ClubPublicVisibility.PUBLIC && current.status in setOf(ClubStatus.SUSPENDED, ClubStatus.ARCHIVED)) {
                throw PlatformAdminException(PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED, "Club cannot be made public")
            }
            updateClubPort.updateClub(
                clubId = clubId,
                name = command.name?.trim(),
                tagline = command.tagline?.trim(),
                about = command.about?.trim(),
                status = nextStatus,
                publicVisibility = command.publicVisibility,
            ) ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
        }

    private fun requireActiveHost(clubId: UUID) {
        if (loadClubsPort.activeHostCount(clubId) == 0) {
            throw PlatformAdminException(PlatformAdminError.CLUB_HOST_REQUIRED, "Active host required")
        }
    }

    private fun validatePublicInfo(
        name: String,
        tagline: String,
        about: String,
    ) {
        if (name.isBlank() || tagline.isBlank() || about.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Club public info is required")
        }
    }
}
```

- [ ] **Step 6: Add persistence adapter**

Create `JdbcPlatformAdminClubAdapter.kt` with registry/update methods:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcPlatformAdminClubAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadPlatformAdminClubsPort,
    UpdatePlatformAdminClubPort {
    override fun listClubs(limit: Int): List<PlatformAdminClubListItem> =
        jdbcTemplate.query(CLUB_LIST_SQL, ::mapClub, limit.coerceIn(1, 100)) ?: emptyList()

    override fun loadClub(clubId: UUID): PlatformAdminClubListItem? =
        jdbcTemplate.query("$CLUB_BASE_SQL where clubs.id = ? limit 1", ::mapClub, clubId.dbString()).firstOrNull()

    override fun activeHostCount(clubId: UUID): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from memberships
            where club_id = ?
              and role = 'HOST'
              and status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
        ) ?: 0

    @Transactional
    override fun updateClub(
        clubId: UUID,
        name: String?,
        tagline: String?,
        about: String?,
        status: ClubStatus?,
        publicVisibility: ClubPublicVisibility?,
    ): PlatformAdminClubListItem? {
        val updated =
            jdbcTemplate.update(
                """
                update clubs
                set name = coalesce(?, name),
                    tagline = coalesce(?, tagline),
                    about = coalesce(?, about),
                    status = coalesce(?, status),
                    public_visibility = coalesce(?, public_visibility),
                    updated_at = utc_timestamp(6)
                where id = ?
                """.trimIndent(),
                name,
                tagline,
                about,
                status?.name,
                publicVisibility?.name,
                clubId.dbString(),
            )
        return if (updated == 0) null else loadClub(clubId)
    }

    private fun mapClub(
        rs: ResultSet,
        rowNumber: Int,
    ): PlatformAdminClubListItem =
        PlatformAdminClubListItem(
            clubId = rs.uuid("id"),
            slug = rs.getString("slug"),
            name = rs.getString("name"),
            tagline = rs.getString("tagline"),
            about = rs.getString("about"),
            status = ClubStatus.valueOf(rs.getString("status")),
            publicVisibility = ClubPublicVisibility.valueOf(rs.getString("public_visibility")),
            domainCount = rs.getInt("domain_count"),
            domainActionRequiredCount = rs.getInt("domain_action_required_count"),
            firstHostOnboardingState = FirstHostOnboardingState.valueOf(rs.getString("first_host_state")),
        )

    private companion object {
        private const val CLUB_BASE_SQL = """
            select
              clubs.id,
              clubs.slug,
              clubs.name,
              clubs.tagline,
              clubs.about,
              clubs.status,
              clubs.public_visibility,
              coalesce(domain_counts.domain_count, 0) as domain_count,
              coalesce(domain_counts.action_required_count, 0) as domain_action_required_count,
              case
                when exists (
                  select 1 from memberships
                  where memberships.club_id = clubs.id
                    and memberships.role = 'HOST'
                    and memberships.status = 'ACTIVE'
                ) then 'ASSIGNED'
                when exists (
                  select 1 from invitations
                  where invitations.club_id = clubs.id
                    and invitations.role = 'HOST'
                    and invitations.status = 'PENDING'
                    and invitations.expires_at >= utc_timestamp(6)
                ) then 'INVITED'
                else 'MISSING'
              end as first_host_state
            from clubs
            left join (
              select
                club_id,
                count(*) as domain_count,
                sum(case when status = 'ACTION_REQUIRED' then 1 else 0 end) as action_required_count
              from club_domains
              group by club_id
            ) domain_counts on domain_counts.club_id = clubs.id
        """

        private const val CLUB_LIST_SQL = """
            $CLUB_BASE_SQL
            order by clubs.updated_at desc, clubs.created_at desc
            limit ?
        """
    }
}
```

- [ ] **Step 7: Add controller DTOs and endpoints**

Create `PlatformAdminClubController.kt`:

```kotlin
package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminClubList
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/clubs")
class PlatformAdminClubController(
    private val listPlatformAdminClubsUseCase: ListPlatformAdminClubsUseCase,
    private val updatePlatformAdminClubUseCase: UpdatePlatformAdminClubUseCase,
) {
    @GetMapping
    fun list(admin: CurrentPlatformAdmin): PlatformAdminClubListResponse =
        PlatformAdminClubListResponse.from(listPlatformAdminClubsUseCase.listClubs(admin))

    @PatchMapping("/{clubId}")
    fun update(
        admin: CurrentPlatformAdmin,
        @PathVariable clubId: UUID,
        @RequestBody request: UpdatePlatformAdminClubRequest,
    ): PlatformAdminClubResponse =
        PlatformAdminClubResponse.from(
            updatePlatformAdminClubUseCase.updateClub(
                admin = admin,
                clubId = clubId,
                command = request.toCommand(),
            ),
        )
}

data class PlatformAdminClubListResponse(
    val items: List<PlatformAdminClubResponse>,
) {
    companion object {
        fun from(list: PlatformAdminClubList): PlatformAdminClubListResponse =
            PlatformAdminClubListResponse(list.items.map(PlatformAdminClubResponse::from))
    }
}

data class UpdatePlatformAdminClubRequest(
    val name: String? = null,
    val tagline: String? = null,
    val about: String? = null,
    val publicVisibility: ClubPublicVisibility? = null,
) {
    fun toCommand(): UpdatePlatformAdminClubCommand =
        UpdatePlatformAdminClubCommand(name, tagline, about, publicVisibility)
}

data class PlatformAdminClubResponse(
    val clubId: String,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
    val status: String,
    val publicVisibility: String,
    val domainCount: Int,
    val domainActionRequiredCount: Int,
    val firstHostOnboardingState: String,
) {
    companion object {
        fun from(item: PlatformAdminClubListItem): PlatformAdminClubResponse =
            PlatformAdminClubResponse(
                clubId = item.clubId.toString(),
                slug = item.slug,
                name = item.name,
                tagline = item.tagline,
                about = item.about,
                status = item.status.name,
                publicVisibility = item.publicVisibility.name,
                domainCount = item.domainCount,
                domainActionRequiredCount = item.domainActionRequiredCount,
                firstHostOnboardingState = item.firstHostOnboardingState.name,
            )
    }
}
```

- [ ] **Step 8: Add errors and security matcher**

Add these enum values in `PlatformAdminException.kt`:

```kotlin
INVALID_CLUB,
CLUB_NOT_FOUND,
CLUB_PUBLISH_NOT_ALLOWED,
CLUB_HOST_REQUIRED,
```

Add mappings in `PlatformAdminErrorHandler`:

```kotlin
PlatformAdminError.INVALID_CLUB -> HttpStatus.BAD_REQUEST
PlatformAdminError.CLUB_NOT_FOUND -> HttpStatus.NOT_FOUND
PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED -> HttpStatus.CONFLICT
PlatformAdminError.CLUB_HOST_REQUIRED -> HttpStatus.CONFLICT
```

In `SecurityConfig`, add this mutating matcher next to the existing admin matchers:

```kotlin
methodAndPath("PATCH", Regex("^/api/admin/clubs/[^/]+$")),
```

- [ ] **Step 9: Run the focused tests**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.PlatformAdminControllerTest clean test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt \
  server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt \
  server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt \
  server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt \
  server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt
git commit -m "feat(admin): add platform club registry"
```

### Task 3: Platform Admin Club Onboarding

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/mail/PlatformAdminHostInvitationMailAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminBffSecurityTest.kt`

- [ ] **Step 1: Add failing onboarding tests**

Add these tests to `PlatformAdminControllerTest`:

```kotlin
@Test
fun `preview reports existing first host user and required confirmation`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val hostUserId = createGoogleUser("existing.host.${UUID.randomUUID()}@example.com", "Existing Host")

    mockMvc
        .post("/api/admin/clubs/onboarding/preview") {
            contentType = MediaType.APPLICATION_JSON
            content = onboardingRequestJson(hostEmail = emailForUser(hostUserId))
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
            jsonPath("$.firstHost.kind") { value("EXISTING_USER") }
            jsonPath("$.firstHost.existingUserId") { value(hostUserId) }
            jsonPath("$.firstHost.requiredConfirmation") { value("ASSIGN_EXISTING_USER_AS_HOST") }
        }
}

@Test
fun `operator creates private setup club and assigns existing user as host after confirmation`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val hostUserId = createGoogleUser("assign.host.${UUID.randomUUID()}@example.com", "Assign Host")
    val hostEmail = emailForUser(hostUserId)

    mockMvc
        .post("/api/admin/clubs/onboarding") {
            contentType = MediaType.APPLICATION_JSON
            content = onboardingRequestJson(
                hostEmail = hostEmail,
                existingUserConfirmation = "ASSIGN_EXISTING_USER_AS_HOST",
            )
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
            jsonPath("$.club.publicVisibility") { value("PRIVATE") }
            jsonPath("$.club.status") { value("SETUP_REQUIRED") }
            jsonPath("$.hostOnboarding.kind") { value("EXISTING_USER_ASSIGNED") }
            jsonPath("$.hostOnboarding.emailDelivery.status") { value("SKIPPED") }
        }
}

@Test
fun `operator creates host invitation and returns accept url for new host email`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val hostEmail = "new.host.${UUID.randomUUID()}@example.com"

    mockMvc
        .post("/api/admin/clubs/onboarding") {
            contentType = MediaType.APPLICATION_JSON
            content = onboardingRequestJson(hostEmail = hostEmail)
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
            jsonPath("$.hostOnboarding.kind") { value("INVITATION_CREATED") }
            jsonPath("$.hostOnboarding.acceptUrl") { exists() }
            jsonPath("$.hostOnboarding.emailDelivery.status") { exists() }
        }
}
```

Add helper methods:

```kotlin
private fun onboardingRequestJson(
    hostEmail: String,
    existingUserConfirmation: String? = null,
): String {
    val slug = "club-${UUID.randomUUID().toString().take(8)}"
    val confirmationJson =
        existingUserConfirmation?.let { ""","existingUserConfirmation":"$it"""" } ?: ""
    return """
        {
          "club": {
            "name": "New Platform Club",
            "slug": "$slug",
            "tagline": "A private reading club",
            "about": "A new club created from the platform admin console."
          },
          "firstHost": {
            "email": "$hostEmail",
            "name": "First Host"
          }
          $confirmationJson
        }
        """.trimIndent()
}

private fun createGoogleUser(
    email: String,
    name: String,
): String {
    val userId = UUID.randomUUID().toString()
    jdbcTemplate.update(
        """
        insert into users (id, email, name, short_name, auth_provider)
        values (?, ?, ?, ?, 'GOOGLE')
        """.trimIndent(),
        userId,
        email,
        name,
        name.take(20),
    )
    return userId
}

private fun emailForUser(userId: String): String =
    jdbcTemplate.queryForObject("select email from users where id = ?", String::class.java, userId)
        ?: error("Missing user email")
```

- [ ] **Step 2: Run the failing onboarding tests**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.PlatformAdminControllerTest clean test
```

Expected: FAIL because onboarding endpoints and models do not exist.

- [ ] **Step 3: Add onboarding models**

Append to `PlatformAdminModels.kt`:

```kotlin
data class PlatformAdminOnboardingClubInput(
    val name: String,
    val slug: String,
    val tagline: String,
    val about: String,
)

data class PlatformAdminOnboardingHostInput(
    val email: String,
    val name: String,
)

data class PlatformAdminOnboardingDomainInput(
    val hostname: String,
    val kind: ClubDomainKind,
)

data class PlatformAdminOnboardingCommand(
    val club: PlatformAdminOnboardingClubInput,
    val firstHost: PlatformAdminOnboardingHostInput,
    val domain: PlatformAdminOnboardingDomainInput?,
    val existingUserConfirmation: String?,
)

data class PlatformAdminOnboardingPreview(
    val club: PlatformAdminOnboardingClubPreview,
    val firstHost: PlatformAdminFirstHostPreview,
    val domain: PlatformAdminDomainPreview?,
)

data class PlatformAdminOnboardingClubPreview(
    val slug: String,
    val available: Boolean,
)

data class PlatformAdminFirstHostPreview(
    val kind: FirstHostPreviewKind,
    val email: String,
    val existingUserId: UUID?,
    val existingUserName: String?,
    val requiredConfirmation: String?,
)

enum class FirstHostPreviewKind {
    EXISTING_USER,
    NEW_USER,
}

data class PlatformAdminDomainPreview(
    val hostname: String,
    val available: Boolean,
)

data class PlatformAdminOnboardingResult(
    val club: PlatformAdminClubListItem,
    val hostOnboarding: PlatformAdminHostOnboardingResult,
    val domain: PlatformAdminClubDomain?,
)

data class PlatformAdminHostOnboardingResult(
    val kind: HostOnboardingResultKind,
    val email: String,
    val userId: UUID?,
    val invitationId: UUID?,
    val acceptUrl: String?,
    val emailDelivery: PlatformAdminEmailDeliveryResult,
)

enum class HostOnboardingResultKind {
    EXISTING_USER_ASSIGNED,
    INVITATION_CREATED,
}

data class PlatformAdminEmailDeliveryResult(
    val status: PlatformAdminEmailDeliveryStatus,
)

enum class PlatformAdminEmailDeliveryStatus {
    SENT,
    FAILED,
    SKIPPED,
}
```

- [ ] **Step 4: Add onboarding ports and use cases**

Append to `PlatformAdminUseCases.kt`:

```kotlin
interface PreviewPlatformAdminClubOnboardingUseCase {
    fun preview(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingPreview
}

interface CommitPlatformAdminClubOnboardingUseCase {
    fun commit(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingResult
}
```

Append to `PlatformAdminPorts.kt`:

```kotlin
data class PlatformAdminExistingUser(
    val userId: UUID,
    val email: String,
    val name: String,
)

data class CreatePlatformAdminClubCommand(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
)

data class CreatePlatformAdminHostInvitationCommand(
    val invitationId: UUID,
    val clubId: UUID,
    val invitedByPlatformAdminUserId: UUID,
    val email: String,
    val name: String,
    val tokenHash: String,
    val expiresAt: OffsetDateTime,
)

data class CreatePlatformAdminHostInvitationResult(
    val invitationId: UUID,
    val token: String,
)

interface PlatformAdminOnboardingPort {
    fun slugExists(slug: String): Boolean

    fun domainHostnameExists(hostname: String): Boolean

    fun findUserByEmail(email: String): PlatformAdminExistingUser?

    fun createClub(command: CreatePlatformAdminClubCommand): UUID

    fun upsertHostMembership(
        clubId: UUID,
        userId: UUID,
        displayName: String,
    ): UUID

    fun createHostInvitation(command: CreatePlatformAdminHostInvitationCommand)
}

interface SendPlatformAdminHostInvitationEmailPort {
    fun send(
        to: String,
        clubName: String,
        acceptUrl: String,
    )
}
```

- [ ] **Step 5: Implement onboarding service**

Create `PlatformAdminOnboardingService.kt`:

```kotlin
package com.readmates.club.application.service

import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.*
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.out.*
import com.readmates.club.domain.ClubDomainKind
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

private const val EXISTING_USER_CONFIRMATION = "ASSIGN_EXISTING_USER_AS_HOST"

@Service
class PlatformAdminOnboardingService(
    private val onboardingPort: PlatformAdminOnboardingPort,
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val createClubDomainPort: CreateClubDomainPort,
    private val sendHostInvitationEmailPort: SendPlatformAdminHostInvitationEmailPort,
    private val invitationTokenService: InvitationTokenService,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : PreviewPlatformAdminClubOnboardingUseCase,
    CommitPlatformAdminClubOnboardingUseCase {
    override fun preview(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingPreview {
        requireOperator(admin)
        val normalized = normalize(command)
        val existingUser = onboardingPort.findUserByEmail(normalized.firstHost.email)
        return PlatformAdminOnboardingPreview(
            club = PlatformAdminOnboardingClubPreview(normalized.club.slug, !onboardingPort.slugExists(normalized.club.slug)),
            firstHost = existingUser?.let {
                PlatformAdminFirstHostPreview(
                    kind = FirstHostPreviewKind.EXISTING_USER,
                    email = it.email,
                    existingUserId = it.userId,
                    existingUserName = it.name,
                    requiredConfirmation = EXISTING_USER_CONFIRMATION,
                )
            } ?: PlatformAdminFirstHostPreview(
                kind = FirstHostPreviewKind.NEW_USER,
                email = normalized.firstHost.email,
                existingUserId = null,
                existingUserName = null,
                requiredConfirmation = null,
            ),
            domain = normalized.domain?.let { PlatformAdminDomainPreview(it.hostname, !onboardingPort.domainHostnameExists(it.hostname)) },
        )
    }

    @Transactional
    override fun commit(
        admin: CurrentPlatformAdmin,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminOnboardingResult {
        requireOperator(admin)
        val normalized = normalize(command)
        rejectConflicts(normalized)

        val clubId = UUID.randomUUID()
        onboardingPort.createClub(
            CreatePlatformAdminClubCommand(
                clubId = clubId,
                slug = normalized.club.slug,
                name = normalized.club.name,
                tagline = normalized.club.tagline,
                about = normalized.club.about,
            ),
        )

        val hostResult = createFirstHost(admin, clubId, normalized)
        val domain =
            normalized.domain?.let {
                when (
                    val result = createClubDomainPort.createClubDomain(
                        clubId = clubId,
                        hostname = it.hostname,
                        kind = it.kind,
                        isPrimary = false,
                    )
                ) {
                    is CreateClubDomainResult.Created -> result.domain
                    CreateClubDomainResult.ClubNotFound -> throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
                    CreateClubDomainResult.DuplicateHostname -> throw PlatformAdminException(PlatformAdminError.CLUB_DOMAIN_CONFLICT, "Club domain hostname already exists")
                }
            }

        val club = loadClubsPort.loadClub(clubId)
            ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Created club not found")
        return PlatformAdminOnboardingResult(club = club, hostOnboarding = hostResult, domain = domain)
    }

    private fun createFirstHost(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
        command: PlatformAdminOnboardingCommand,
    ): PlatformAdminHostOnboardingResult {
        val existingUser = onboardingPort.findUserByEmail(command.firstHost.email)
        if (existingUser != null) {
            if (command.existingUserConfirmation != EXISTING_USER_CONFIRMATION) {
                throw PlatformAdminException(PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED, "Existing user confirmation required")
            }
            onboardingPort.upsertHostMembership(clubId, existingUser.userId, command.firstHost.name)
            return PlatformAdminHostOnboardingResult(
                kind = HostOnboardingResultKind.EXISTING_USER_ASSIGNED,
                email = existingUser.email,
                userId = existingUser.userId,
                invitationId = null,
                acceptUrl = null,
                emailDelivery = PlatformAdminEmailDeliveryResult(PlatformAdminEmailDeliveryStatus.SKIPPED),
            )
        }

        val token = invitationTokenService.generateToken()
        val invitationId = UUID.randomUUID()
        onboardingPort.createHostInvitation(
            CreatePlatformAdminHostInvitationCommand(
                invitationId = invitationId,
                clubId = clubId,
                invitedByPlatformAdminUserId = admin.userId,
                email = command.firstHost.email,
                name = command.firstHost.name,
                tokenHash = invitationTokenService.hashToken(token),
                expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusDays(30),
            ),
        )
        val acceptUrl = "${appBaseUrl.trimEnd('/')}/clubs/${command.club.slug}/invite/$token"
        val deliveryStatus =
            try {
                sendHostInvitationEmailPort.send(command.firstHost.email, command.club.name, acceptUrl)
                PlatformAdminEmailDeliveryStatus.SENT
            } catch (_: Exception) {
                PlatformAdminEmailDeliveryStatus.FAILED
            }
        return PlatformAdminHostOnboardingResult(
            kind = HostOnboardingResultKind.INVITATION_CREATED,
            email = command.firstHost.email,
            userId = null,
            invitationId = invitationId,
            acceptUrl = acceptUrl,
            emailDelivery = PlatformAdminEmailDeliveryResult(deliveryStatus),
        )
    }

    private fun rejectConflicts(command: PlatformAdminOnboardingCommand) {
        if (onboardingPort.slugExists(command.club.slug)) {
            throw PlatformAdminException(PlatformAdminError.CLUB_SLUG_CONFLICT, "Club slug already exists")
        }
        if (command.domain != null && onboardingPort.domainHostnameExists(command.domain.hostname)) {
            throw PlatformAdminException(PlatformAdminError.CLUB_DOMAIN_CONFLICT, "Club domain hostname already exists")
        }
    }

    private fun normalize(command: PlatformAdminOnboardingCommand): PlatformAdminOnboardingCommand {
        val club =
            command.club.copy(
                name = command.club.name.trim(),
                slug = command.club.slug.trim().lowercase(Locale.ROOT),
                tagline = command.club.tagline.trim(),
                about = command.club.about.trim(),
            )
        val firstHost =
            command.firstHost.copy(
                email = command.firstHost.email.trim().lowercase(Locale.ROOT),
                name = command.firstHost.name.trim(),
            )
        val domain =
            command.domain?.copy(hostname = command.domain.hostname.trim().removeSuffix(".").lowercase(Locale.ROOT))
        if (club.name.isBlank() || club.tagline.isBlank() || club.about.isBlank() || firstHost.name.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Club and host fields are required")
        }
        if (!Regex("^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$").matches(club.slug)) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Invalid club slug")
        }
        if (!Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(firstHost.email)) {
            throw PlatformAdminException(PlatformAdminError.INVALID_CLUB, "Invalid host email")
        }
        return command.copy(club = club, firstHost = firstHost, domain = domain)
    }

    private fun requireOperator(admin: CurrentPlatformAdmin) {
        if (!admin.canManageClubDomains) {
            throw AccessDeniedException("Platform admin role cannot onboard clubs")
        }
    }
}
```

- [ ] **Step 6: Implement onboarding persistence**

Add `PlatformAdminOnboardingPort` to the `JdbcPlatformAdminClubAdapter` class declaration and implement:

```kotlin
override fun slugExists(slug: String): Boolean =
    (jdbcTemplate.queryForObject("select count(*) from clubs where slug = ?", Int::class.java, slug) ?: 0) > 0

override fun domainHostnameExists(hostname: String): Boolean =
    (jdbcTemplate.queryForObject("select count(*) from club_domains where hostname = ?", Int::class.java, hostname) ?: 0) > 0

override fun findUserByEmail(email: String): PlatformAdminExistingUser? =
    jdbcTemplate.query(
        """
        select id, email, name
        from users
        where lower(email) = ?
        limit 1
        """.trimIndent(),
        { rs, _ -> PlatformAdminExistingUser(rs.uuid("id"), rs.getString("email"), rs.getString("name")) },
        email,
    ).firstOrNull()

override fun createClub(command: CreatePlatformAdminClubCommand): UUID {
    jdbcTemplate.update(
        """
        insert into clubs (id, slug, name, tagline, about, status, public_visibility)
        values (?, ?, ?, ?, ?, 'SETUP_REQUIRED', 'PRIVATE')
        """.trimIndent(),
        command.clubId.dbString(),
        command.slug,
        command.name,
        command.tagline,
        command.about,
    )
    return command.clubId
}

override fun upsertHostMembership(
    clubId: UUID,
    userId: UUID,
    displayName: String,
): UUID {
    val existing =
        jdbcTemplate.query(
            "select id from memberships where club_id = ? and user_id = ? limit 1",
            { rs, _ -> rs.uuid("id") },
            clubId.dbString(),
            userId.dbString(),
        ).firstOrNull()
    if (existing != null) {
        jdbcTemplate.update(
            """
            update memberships
            set role = 'HOST',
                status = 'ACTIVE',
                joined_at = coalesce(joined_at, utc_timestamp(6)),
                short_name = ?,
                updated_at = utc_timestamp(6)
            where id = ?
            """.trimIndent(),
            displayName.take(50),
            existing.dbString(),
        )
        return existing
    }
    val membershipId = UUID.randomUUID()
    jdbcTemplate.update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
        values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), ?)
        """.trimIndent(),
        membershipId.dbString(),
        clubId.dbString(),
        userId.dbString(),
        displayName.take(50),
    )
    return membershipId
}

override fun createHostInvitation(command: CreatePlatformAdminHostInvitationCommand) {
    jdbcTemplate.update(
        """
        insert into invitations (
          id,
          club_id,
          invited_by_membership_id,
          invited_by_platform_admin_user_id,
          invited_email,
          invited_name,
          role,
          token_hash,
          status,
          apply_to_current_session,
          expires_at
        )
        values (?, ?, null, ?, ?, ?, 'HOST', ?, 'PENDING', false, ?)
        """.trimIndent(),
        command.invitationId.dbString(),
        command.clubId.dbString(),
        command.invitedByPlatformAdminUserId.dbString(),
        command.email,
        command.name,
        command.tokenHash,
        java.sql.Timestamp.from(command.expiresAt.toInstant()),
    )
}
```

Add imports:

```kotlin
import com.readmates.club.application.port.out.CreatePlatformAdminClubCommand
import com.readmates.club.application.port.out.CreatePlatformAdminHostInvitationCommand
import com.readmates.club.application.port.out.PlatformAdminExistingUser
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
```

- [ ] **Step 7: Add mail adapter**

Create `PlatformAdminHostInvitationMailAdapter.kt`:

```kotlin
package com.readmates.club.adapter.out.mail

import com.readmates.club.application.port.out.SendPlatformAdminHostInvitationEmailPort
import com.readmates.notification.application.port.out.MailDeliveryCommand
import com.readmates.notification.application.port.out.MailDeliveryPort
import org.springframework.stereotype.Component

@Component
class PlatformAdminHostInvitationMailAdapter(
    private val mailDeliveryPort: MailDeliveryPort,
) : SendPlatformAdminHostInvitationEmailPort {
    override fun send(
        to: String,
        clubName: String,
        acceptUrl: String,
    ) {
        mailDeliveryPort.send(
            MailDeliveryCommand(
                to = to,
                subject = "ReadMates host invitation: $clubName",
                text = "You have been invited as the first host for $clubName.\n\nAccept: $acceptUrl",
                html = """
                    <p>You have been invited as the first host for <strong>${clubName.escapeHtml()}</strong>.</p>
                    <p><a href="${acceptUrl.escapeHtml()}">Accept the invitation</a></p>
                """.trimIndent(),
            ),
        )
    }

    private fun String.escapeHtml(): String =
        replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
}
```

- [ ] **Step 8: Add onboarding controller DTOs**

Extend `PlatformAdminClubController.kt` with:

```kotlin
@PostMapping("/onboarding/preview")
fun previewOnboarding(
    admin: CurrentPlatformAdmin,
    @RequestBody request: PlatformAdminOnboardingRequest,
): PlatformAdminOnboardingPreviewResponse =
    PlatformAdminOnboardingPreviewResponse.from(previewOnboardingUseCase.preview(admin, request.toCommand()))

@PostMapping("/onboarding")
fun commitOnboarding(
    admin: CurrentPlatformAdmin,
    @RequestBody request: PlatformAdminOnboardingRequest,
): PlatformAdminOnboardingResultResponse =
    PlatformAdminOnboardingResultResponse.from(commitOnboardingUseCase.commit(admin, request.toCommand()))
```

Add constructor dependencies:

```kotlin
private val previewOnboardingUseCase: PreviewPlatformAdminClubOnboardingUseCase,
private val commitOnboardingUseCase: CommitPlatformAdminClubOnboardingUseCase,
```

Add DTOs:

```kotlin
data class PlatformAdminOnboardingRequest(
    val club: PlatformAdminOnboardingClubRequest,
    val firstHost: PlatformAdminOnboardingHostRequest,
    val domain: PlatformAdminOnboardingDomainRequest? = null,
    val existingUserConfirmation: String? = null,
) {
    fun toCommand(): PlatformAdminOnboardingCommand =
        PlatformAdminOnboardingCommand(
            club = PlatformAdminOnboardingClubInput(club.name, club.slug, club.tagline, club.about),
            firstHost = PlatformAdminOnboardingHostInput(firstHost.email, firstHost.name),
            domain = domain?.let { PlatformAdminOnboardingDomainInput(it.hostname, it.kind) },
            existingUserConfirmation = existingUserConfirmation,
        )
}

data class PlatformAdminOnboardingClubRequest(
    val name: String,
    val slug: String,
    val tagline: String,
    val about: String,
)

data class PlatformAdminOnboardingHostRequest(
    val email: String,
    val name: String,
)

data class PlatformAdminOnboardingDomainRequest(
    val hostname: String,
    val kind: ClubDomainKind,
)
```

Add response DTOs with the field names asserted in tests:

```kotlin
data class PlatformAdminOnboardingPreviewResponse(
    val club: PlatformAdminOnboardingClubPreviewResponse,
    val firstHost: PlatformAdminFirstHostPreviewResponse,
    val domain: PlatformAdminDomainPreviewResponse?,
) {
    companion object {
        fun from(preview: PlatformAdminOnboardingPreview): PlatformAdminOnboardingPreviewResponse =
            PlatformAdminOnboardingPreviewResponse(
                club = PlatformAdminOnboardingClubPreviewResponse(preview.club.slug, preview.club.available),
                firstHost = PlatformAdminFirstHostPreviewResponse(
                    kind = preview.firstHost.kind.name,
                    email = preview.firstHost.email,
                    existingUserId = preview.firstHost.existingUserId?.toString(),
                    existingUserName = preview.firstHost.existingUserName,
                    requiredConfirmation = preview.firstHost.requiredConfirmation,
                ),
                domain = preview.domain?.let { PlatformAdminDomainPreviewResponse(it.hostname, it.available) },
            )
    }
}

data class PlatformAdminOnboardingClubPreviewResponse(
    val slug: String,
    val available: Boolean,
)

data class PlatformAdminFirstHostPreviewResponse(
    val kind: String,
    val email: String,
    val existingUserId: String?,
    val existingUserName: String?,
    val requiredConfirmation: String?,
)

data class PlatformAdminDomainPreviewResponse(
    val hostname: String,
    val available: Boolean,
)

data class PlatformAdminOnboardingResultResponse(
    val club: PlatformAdminClubResponse,
    val hostOnboarding: PlatformAdminHostOnboardingResultResponse,
    val domain: PlatformAdminDomainResponse?,
) {
    companion object {
        fun from(result: PlatformAdminOnboardingResult): PlatformAdminOnboardingResultResponse =
            PlatformAdminOnboardingResultResponse(
                club = PlatformAdminClubResponse.from(result.club),
                hostOnboarding = PlatformAdminHostOnboardingResultResponse.from(result.hostOnboarding),
                domain = result.domain?.let(PlatformAdminDomainResponse::from),
            )
    }
}

data class PlatformAdminHostOnboardingResultResponse(
    val kind: String,
    val email: String,
    val userId: String?,
    val invitationId: String?,
    val acceptUrl: String?,
    val emailDelivery: PlatformAdminEmailDeliveryResponse,
) {
    companion object {
        fun from(result: PlatformAdminHostOnboardingResult): PlatformAdminHostOnboardingResultResponse =
            PlatformAdminHostOnboardingResultResponse(
                kind = result.kind.name,
                email = result.email,
                userId = result.userId?.toString(),
                invitationId = result.invitationId?.toString(),
                acceptUrl = result.acceptUrl,
                emailDelivery = PlatformAdminEmailDeliveryResponse(result.emailDelivery.status.name),
            )
    }
}

data class PlatformAdminEmailDeliveryResponse(
    val status: String,
)
```

- [ ] **Step 9: Add errors and security matchers**

Add error enum values:

```kotlin
CLUB_SLUG_CONFLICT,
EXISTING_USER_CONFIRMATION_REQUIRED,
```

Add error mappings:

```kotlin
PlatformAdminError.CLUB_SLUG_CONFLICT -> HttpStatus.CONFLICT
PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED -> HttpStatus.CONFLICT
```

Add mutating matchers in `SecurityConfig`:

```kotlin
methodAndPath("POST", Regex("^/api/admin/clubs/onboarding/preview$")),
methodAndPath("POST", Regex("^/api/admin/clubs/onboarding$")),
```

- [ ] **Step 10: Run focused server tests**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.PlatformAdminControllerTest --tests com.readmates.club.api.PlatformAdminBffSecurityTest clean test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt \
  server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt \
  server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminPorts.kt \
  server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/mail/PlatformAdminHostInvitationMailAdapter.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt \
  server/src/test/kotlin/com/readmates/club/api/PlatformAdminBffSecurityTest.kt
git commit -m "feat(admin): add club onboarding command"
```

### Task 4: Frontend API Contracts And Loader

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/route/platform-admin-data.ts`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing loader test for clubs**

In `platform-admin.test.tsx`, update `loads the platform admin summary through the BFF` so the fetch mock also handles `/api/bff/api/admin/clubs`, then expect loader data to include `clubs`:

```ts
if (input.toString() === "/api/bff/api/admin/clubs") {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        items: [
          {
            clubId: "club-1",
            slug: "reading-sai",
            name: "읽는사이",
            tagline: "함께 읽는 모임",
            about: "공개 소개",
            status: "ACTIVE",
            publicVisibility: "PUBLIC",
            domainCount: 1,
            domainActionRequiredCount: 0,
            firstHostOnboardingState: "ASSIGNED",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}
```

Expected loader assertion:

```ts
await expect(platformAdminLoader()).resolves.toMatchObject({
  summary: {
    platformRole: "OWNER",
    activeClubCount: 2,
  },
  clubs: {
    items: [
      {
        slug: "reading-sai",
        publicVisibility: "PUBLIC",
        firstHostOnboardingState: "ASSIGNED",
      },
    ],
  },
});
```

- [ ] **Step 2: Run the failing frontend test**

Run:

```bash
pnpm --dir front test -- platform-admin.test.tsx
```

Expected: FAIL because `platformAdminLoader` does not fetch clubs.

- [ ] **Step 3: Add frontend contract types**

Append to `platform-admin-contracts.ts`:

```ts
export type PlatformAdminClubStatus = "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type PlatformAdminClubPublicVisibility = "PRIVATE" | "PUBLIC";
export type FirstHostOnboardingState = "MISSING" | "INVITED" | "ASSIGNED";

export type PlatformAdminClub = {
  clubId: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: PlatformAdminClubStatus;
  publicVisibility: PlatformAdminClubPublicVisibility;
  domainCount: number;
  domainActionRequiredCount: number;
  firstHostOnboardingState: FirstHostOnboardingState;
};

export type PlatformAdminClubListResponse = {
  items: PlatformAdminClub[];
};

export type UpdatePlatformAdminClubRequest = {
  name?: string;
  tagline?: string;
  about?: string;
  publicVisibility?: PlatformAdminClubPublicVisibility;
};

export type PlatformAdminOnboardingRequest = {
  club: {
    name: string;
    slug: string;
    tagline: string;
    about: string;
  };
  firstHost: {
    email: string;
    name: string;
  };
  domain?: {
    hostname: string;
    kind: PlatformAdminDomainKind;
  };
  existingUserConfirmation?: string;
};

export type PlatformAdminOnboardingPreviewResponse = {
  club: {
    slug: string;
    available: boolean;
  };
  firstHost: {
    kind: "EXISTING_USER" | "NEW_USER";
    email: string;
    existingUserId: string | null;
    existingUserName: string | null;
    requiredConfirmation: string | null;
  };
  domain: null | {
    hostname: string;
    available: boolean;
  };
};

export type PlatformAdminOnboardingResultResponse = {
  club: PlatformAdminClub;
  hostOnboarding: {
    kind: "EXISTING_USER_ASSIGNED" | "INVITATION_CREATED";
    email: string;
    userId: string | null;
    invitationId: string | null;
    acceptUrl: string | null;
    emailDelivery: {
      status: "SENT" | "FAILED" | "SKIPPED";
    };
  };
  domain: PlatformAdminDomainResponse | null;
};
```

- [ ] **Step 4: Add API calls**

Append to `platform-admin-api.ts`:

```ts
export function fetchPlatformAdminClubs() {
  return readmatesFetch<PlatformAdminClubListResponse>("/api/admin/clubs", undefined, { clubSlug: undefined });
}

export function updatePlatformAdminClub(clubId: string, request: UpdatePlatformAdminClubRequest) {
  return readmatesFetch<PlatformAdminClub>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function previewPlatformAdminOnboarding(request: PlatformAdminOnboardingRequest) {
  return readmatesFetch<PlatformAdminOnboardingPreviewResponse>(
    "/api/admin/clubs/onboarding/preview",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function commitPlatformAdminOnboarding(request: PlatformAdminOnboardingRequest) {
  return readmatesFetch<PlatformAdminOnboardingResultResponse>(
    "/api/admin/clubs/onboarding",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}
```

Add imported types at the top:

```ts
PlatformAdminClub,
PlatformAdminClubListResponse,
PlatformAdminOnboardingPreviewResponse,
PlatformAdminOnboardingRequest,
PlatformAdminOnboardingResultResponse,
UpdatePlatformAdminClubRequest,
```

- [ ] **Step 5: Update loader**

Change `PlatformAdminRouteData` in `platform-admin-data.ts`:

```ts
export type PlatformAdminRouteData = {
  summary: PlatformAdminSummaryResponse;
  clubs: PlatformAdminClubListResponse;
};
```

Change the loader:

```ts
const [summary, clubs] = await Promise.all([
  fetchPlatformAdminSummary(),
  fetchPlatformAdminClubs(),
]);

return { summary, clubs };
```

- [ ] **Step 6: Run the frontend test**

Run:

```bash
pnpm --dir front test -- platform-admin.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/platform-admin/api/platform-admin-contracts.ts \
  front/features/platform-admin/api/platform-admin-api.ts \
  front/features/platform-admin/route/platform-admin-data.ts \
  front/tests/unit/platform-admin.test.tsx
git commit -m "feat(admin): add platform club API client"
```

### Task 5: Frontend Admin Registry, Detail Panel, And Onboarding Wizard

**Files:**
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-club-registry.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-club-detail.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Append tests to `platform-admin.test.tsx`:

```ts
it("renders the platform club registry", () => {
  render(
    <PlatformAdminDashboard
      summary={{
        platformRole: "OWNER",
        activeClubCount: 1,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
      }}
      clubs={{
        items: [
          {
            clubId: "club-1",
            slug: "reading-sai",
            name: "읽는사이",
            tagline: "함께 읽는 모임",
            about: "공개 소개",
            status: "ACTIVE",
            publicVisibility: "PUBLIC",
            domainCount: 1,
            domainActionRequiredCount: 0,
            firstHostOnboardingState: "ASSIGNED",
          },
        ],
      }}
    />,
  );

  expect(screen.getByRole("heading", { name: "클럽 레지스트리" })).toBeInTheDocument();
  expect(screen.getByText("reading-sai")).toBeInTheDocument();
  expect(screen.getByText("PUBLIC")).toBeInTheDocument();
});

it("shows existing user confirmation in onboarding wizard", async () => {
  const user = userEvent.setup();
  const onPreview = vi.fn().mockResolvedValue({
    club: { slug: "new-club", available: true },
    firstHost: {
      kind: "EXISTING_USER",
      email: "host@example.com",
      existingUserId: "user-1",
      existingUserName: "Host User",
      requiredConfirmation: "ASSIGN_EXISTING_USER_AS_HOST",
    },
    domain: null,
  });
  const onCommit = vi.fn();

  render(<PlatformAdminOnboardingWizard onPreview={onPreview} onCommit={onCommit} />);

  await user.type(screen.getByLabelText("클럽 이름"), "New Club");
  await user.type(screen.getByLabelText("Slug"), "new-club");
  await user.type(screen.getByLabelText("Tagline"), "A reading club");
  await user.type(screen.getByLabelText("About"), "A detailed public introduction");
  await user.type(screen.getByLabelText("첫 호스트 이메일"), "host@example.com");
  await user.type(screen.getByLabelText("첫 호스트 이름"), "Host User");
  await user.click(screen.getByRole("button", { name: "미리 확인" }));

  expect(await screen.findByText("기존 사용자 확인 필요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "기존 사용자에게 HOST 권한 부여" })).toBeDisabled();
});
```

Import the wizard:

```ts
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
pnpm --dir front test -- platform-admin.test.tsx
```

Expected: FAIL because registry and wizard components do not exist.

- [ ] **Step 3: Add club registry component**

Create `platform-admin-club-registry.tsx`:

```tsx
import type { PlatformAdminClub } from "@/features/platform-admin/api/platform-admin-contracts";

type Props = {
  clubs: { items: PlatformAdminClub[] };
  onSelectClub?: (club: PlatformAdminClub) => void;
  onNewClub?: () => void;
};

export function PlatformAdminClubRegistry({ clubs, onSelectClub, onNewClub }: Props) {
  return (
    <section className="platform-admin-clubs" aria-labelledby="platform-admin-clubs-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Club registry</p>
          <h2 id="platform-admin-clubs-title" className="h3 editorial">
            클럽 레지스트리
          </h2>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNewClub}>
          새 클럽
        </button>
      </div>
      {clubs.items.length > 0 ? (
        <div className="platform-admin-club-list">
          {clubs.items.map((club) => (
            <button
              type="button"
              className="surface platform-admin-club-row"
              key={club.clubId}
              onClick={() => onSelectClub?.(club)}
            >
              <span className="platform-admin-club-row__main">
                <strong>{club.name}</strong>
                <span className="tiny muted">{club.slug}</span>
              </span>
              <span className="platform-admin-domain-status">{club.publicVisibility}</span>
              <span className="tiny muted">{club.status}</span>
              <span className="tiny muted">host {club.firstHostOnboardingState}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">등록된 클럽이 없습니다.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add onboarding wizard component**

Create `platform-admin-onboarding-wizard.tsx`:

```tsx
import { useState } from "react";
import type {
  PlatformAdminOnboardingPreviewResponse,
  PlatformAdminOnboardingRequest,
  PlatformAdminOnboardingResultResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

type Props = {
  onPreview: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingPreviewResponse>;
  onCommit: (request: PlatformAdminOnboardingRequest) => Promise<PlatformAdminOnboardingResultResponse>;
  onCreated?: (result: PlatformAdminOnboardingResultResponse) => void;
};

export function PlatformAdminOnboardingWizard({ onPreview, onCommit, onCreated }: Props) {
  const [request, setRequest] = useState<PlatformAdminOnboardingRequest>({
    club: { name: "", slug: "", tagline: "", about: "" },
    firstHost: { email: "", name: "" },
  });
  const [preview, setPreview] = useState<PlatformAdminOnboardingPreviewResponse | null>(null);
  const [confirmedExistingUser, setConfirmedExistingUser] = useState(false);
  const [busy, setBusy] = useState(false);

  const existingUserConfirmation =
    confirmedExistingUser && preview?.firstHost.requiredConfirmation
      ? preview.firstHost.requiredConfirmation
      : undefined;

  async function handlePreview() {
    setBusy(true);
    try {
      setPreview(await onPreview(request));
      setConfirmedExistingUser(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    setBusy(true);
    try {
      const result = await onCommit({ ...request, existingUserConfirmation });
      onCreated?.(result);
    } finally {
      setBusy(false);
    }
  }

  const canCommit =
    preview != null &&
    preview.club.available &&
    (preview.firstHost.kind !== "EXISTING_USER" || confirmedExistingUser);

  return (
    <section className="platform-admin-onboarding" aria-label="새 클럽 온보딩">
      <div className="platform-admin-onboarding__grid">
        <label className="field-group">
          <span className="label">클럽 이름</span>
          <input className="input" value={request.club.name} onChange={(event) => setRequest({ ...request, club: { ...request.club, name: event.target.value } })} />
        </label>
        <label className="field-group">
          <span className="label">Slug</span>
          <input className="input" value={request.club.slug} onChange={(event) => setRequest({ ...request, club: { ...request.club, slug: event.target.value } })} />
        </label>
        <label className="field-group">
          <span className="label">Tagline</span>
          <input className="input" value={request.club.tagline} onChange={(event) => setRequest({ ...request, club: { ...request.club, tagline: event.target.value } })} />
        </label>
        <label className="field-group">
          <span className="label">첫 호스트 이메일</span>
          <input className="input" value={request.firstHost.email} onChange={(event) => setRequest({ ...request, firstHost: { ...request.firstHost, email: event.target.value } })} />
        </label>
        <label className="field-group">
          <span className="label">첫 호스트 이름</span>
          <input className="input" value={request.firstHost.name} onChange={(event) => setRequest({ ...request, firstHost: { ...request.firstHost, name: event.target.value } })} />
        </label>
        <label className="field-group platform-admin-onboarding__about">
          <span className="label">About</span>
          <textarea className="input" value={request.club.about} onChange={(event) => setRequest({ ...request, club: { ...request.club, about: event.target.value } })} />
        </label>
      </div>

      {preview?.firstHost.kind === "EXISTING_USER" ? (
        <div className="surface platform-admin-onboarding__confirmation">
          <p className="eyebrow">기존 사용자 확인 필요</p>
          <p className="body">{preview.firstHost.existingUserName} 계정에 이 클럽의 HOST 권한을 부여합니다.</p>
          <label className="checkbox-row">
            <input type="checkbox" checked={confirmedExistingUser} onChange={(event) => setConfirmedExistingUser(event.target.checked)} />
            <span>이 기존 사용자에게 HOST 권한을 부여합니다.</span>
          </label>
        </div>
      ) : null}

      <div className="platform-admin-onboarding__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handlePreview} disabled={busy}>
          미리 확인
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleCommit} disabled={busy || !canCommit}>
          {preview?.firstHost.kind === "EXISTING_USER" ? "기존 사용자에게 HOST 권한 부여" : "클럽 생성"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire dashboard and route**

Update `PlatformAdminDashboard` props to accept `clubs`, `onPreviewOnboarding`, `onCommitOnboarding`, `onUpdateClub`, and render `PlatformAdminClubRegistry` plus the wizard.

Update `PlatformAdminRoute` to pass:

```tsx
clubs={clubs}
onPreviewOnboarding={previewPlatformAdminOnboarding}
onCommitOnboarding={async (request) => {
  const result = await commitPlatformAdminOnboarding(request);
  setClubs((current) => ({ items: [result.club, ...current.items] }));
  return result;
}}
onUpdateClub={async (clubId, request) => {
  const updated = await updatePlatformAdminClub(clubId, request);
  setClubs((current) => ({
    items: current.items.map((club) => (club.clubId === updated.clubId ? updated : club)),
  }));
  return updated;
}}
```

- [ ] **Step 6: Add CSS**

Append CSS near existing `.platform-admin-*` rules:

```css
.platform-admin-clubs,
.platform-admin-onboarding {
  display: grid;
  gap: 16px;
}

.platform-admin-club-list {
  display: grid;
  gap: 10px;
}

.platform-admin-club-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 0;
  cursor: pointer;
}

.platform-admin-club-row__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.platform-admin-onboarding__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.platform-admin-onboarding__about {
  grid-column: 1 / -1;
}

.platform-admin-onboarding__about textarea {
  min-height: 120px;
}

.platform-admin-onboarding__confirmation {
  display: grid;
  gap: 8px;
}

.platform-admin-onboarding__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .platform-admin-club-row,
  .platform-admin-onboarding__grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run frontend test**

Run:

```bash
pnpm --dir front test -- platform-admin.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/platform-admin/route/platform-admin-route.tsx \
  front/features/platform-admin/ui/platform-admin-dashboard.tsx \
  front/features/platform-admin/ui/platform-admin-club-registry.tsx \
  front/features/platform-admin/ui/platform-admin-club-detail.tsx \
  front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx \
  front/src/styles/globals.css \
  front/tests/unit/platform-admin.test.tsx
git commit -m "feat(admin): add platform onboarding UI"
```

### Task 6: Documentation, Full Verification, And Release Notes

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update architecture**

In `docs/development/architecture.md`, update the platform management row and club context section with this text:

```markdown
| 플랫폼 관리 | `/admin` | platform admin | 클럽 생성, 클럽 목록 확인, 공개/비공개 상태 관리, 공개 소개 정보 관리, 등록형 domain alias 요청과 상태 확인, 첫 호스트 온보딩 상태 확인. 세션/멤버/알림 같은 클럽 내부 운영은 호스트 앱 책임 |
```

Add this paragraph in the multi-club context section:

```markdown
`clubs.status`는 운영 lifecycle이고, `clubs.public_visibility`는 공개 페이지 노출 여부입니다. 새 클럽은 `SETUP_REQUIRED`와 `PRIVATE`로 생성되며, 플랫폼 운영자가 필수 공개 정보와 활성 호스트를 확인한 뒤 `ACTIVE`와 `PUBLIC`으로 전환합니다. Public API는 `clubs.status = ACTIVE`와 `clubs.public_visibility = PUBLIC`을 모두 만족하는 클럽만 반환합니다.
```

- [ ] **Step 2: Update changelog**

Add under `## Unreleased` in `CHANGELOG.md`:

```markdown
- Added platform admin onboarding design for club creation, first-host setup, public visibility, and domain readiness while keeping club operations in the host app.
```

If the implementation ships in the same branch, change "design" to "support".

- [ ] **Step 3: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 4: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
```

Expected: all PASS.

- [ ] **Step 5: Run E2E if auth or BFF behavior changed**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. If local services are unavailable, record the skipped command and the exact reason in the final handoff.

- [ ] **Step 6: Run docs diff check**

Run:

```bash
git diff --check -- docs/development/architecture.md CHANGELOG.md
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs(admin): document platform onboarding boundary"
```

## Plan Self-Review

Spec coverage:

- Club registry: Task 2 and Task 5.
- New club onboarding: Task 3 and Task 5.
- Existing-user first host confirmation: Task 3 and Task 5.
- New-user host invitation and accept URL: Task 1 and Task 3.
- Email delivery result: Task 3.
- Optional domain registration: Task 3 reuses existing domain port.
- Public/private source of truth: Task 1 and Task 2.
- Public API privacy gate: Task 1.
- Role boundaries: Task 2 and Task 3.
- Frontend route-first structure: Task 4 and Task 5.
- Docs and verification: Task 6.

Placeholder scan:

- The plan contains no incomplete sections.

Type consistency:

- Server public visibility uses `ClubPublicVisibility` and `publicVisibility`.
- Frontend public visibility uses `PlatformAdminClubPublicVisibility` and `publicVisibility`.
- First-host state uses `FirstHostOnboardingState` with `MISSING`, `INVITED`, and `ASSIGNED`.
- Existing-user confirmation uses the same required value, `ASSIGN_EXISTING_USER_AS_HOST`, in server and frontend steps.
