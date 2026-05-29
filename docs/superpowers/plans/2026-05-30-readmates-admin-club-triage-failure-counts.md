# Admin Club Triage Failure Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-club notification-failure and AI-failure counts (last 7 days) to the `/admin/clubs` triage list so a club with any recent delivery or AI-generation failure sorts to the top as `긴급`(critical) with a human reason, closing the S3+ list gate.

**Architecture:** Server-side set-based aggregation extends the existing `CLUB_BASE_SQL` in `JdbcPlatformAdminClubAdapter` with two `left join (… group by club_id)` subqueries over `notification_deliveries` (status FAILED/DEAD, `updated_at` within 7 days) and `ai_generation_audit_log` (status FAILED, `created_at` within 7 days). Two new integer fields flow through the model (`PlatformAdminClubListItem`), the response DTO (`PlatformAdminClubResponse`), and the frontend type (`PlatformAdminClub`). The pure frontend triage model folds `failureCount > 0 ⇒ critical` and prepends Korean reasons. No new screen, no new query path — `listClubs` and `loadClub` both reuse `CLUB_BASE_SQL`.

**Tech Stack:** Kotlin, Spring Boot, JDBC, MySQL (Testcontainers, `@Tag("integration")`), Flyway dev seed; React 19, TypeScript, Vite, `@tanstack/react-query`, vitest + `@testing-library/react`, Playwright.

**Scope source:** `docs/superpowers/specs/2026-05-30-readmates-admin-club-triage-failure-counts-design.md`.

---

## File Structure

- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt` — add `notificationFailureCount`/`aiFailureCount` to `PlatformAdminClubListItem`.
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt` — extend `CLUB_BASE_SQL` with the two aggregation joins and read the columns in `mapPlatformAdminClub`.
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubFailureCountsTest.kt` — integration test seeding an isolated club + FK chain, asserting 7-day window and FAILED/DEAD-only counting.
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt` — add the two fields to `PlatformAdminClubResponse` and `from`.
- Create: `server/src/test/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubResponseTest.kt` — unit test for the response mapping.
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts` — add the two fields to `PlatformAdminClub`.
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.ts` — fold failure counts into severity and reasons.
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts` — add severity + reason tests; update the `club()` factory.
- Modify: `front/features/platform-admin/route/admin-clubs-route.test.tsx` — update the inline factory type/defaults; add a failure-reason render test.
- Modify: `front/tests/e2e/admin-clubs-triage.spec.ts` — add the two fields to mock items; assert a failure reason renders.
- Modify: `CHANGELOG.md` — `Unreleased` entry.

---

## Task 1: Server aggregation — model, SQL, mapping (integration-tested)

**Files:**
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubFailureCountsTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt:72-83`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`

- [ ] **Step 1: Write the failing integration test**

Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubFailureCountsTest.kt`:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-0000000fc001"
private const val USER_ID = "00000000-0000-0000-0000-0000000fc002"
private const val MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fc003"
private const val RECENT_EVENT_ID = "00000000-0000-0000-0000-0000000fc101"
private const val OLD_EVENT_ID = "00000000-0000-0000-0000-0000000fc102"
private const val RECENT_DEAD_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc201"
private const val RECENT_FAILED_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc202"
private const val OLD_DEAD_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc203"
private const val SENT_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc204"

private const val CLEANUP_SQL = """
    delete from ai_generation_audit_log where club_id = '$CLUB_ID';
    delete from notification_deliveries where club_id = '$CLUB_ID';
    delete from notification_event_outbox where club_id = '$CLUB_ID';
    delete from memberships where id = '$MEMBERSHIP_ID';
    delete from users where id = '$USER_ID';
    delete from clubs where id = '$CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcPlatformAdminClubFailureCountsTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcPlatformAdminClubAdapter(jdbcTemplate) }

    @Test
    fun `counts only recent failed notification deliveries and failed ai generations`() {
        seedClubWithMember()
        seedNotificationDeliveries()
        seedAiAuditRows()

        val club = adapter.loadClub(UUID.fromString(CLUB_ID))

        assertThat(club).isNotNull
        // Recent DEAD + recent FAILED = 2; old DEAD and SENT excluded.
        assertThat(club!!.notificationFailureCount).isEqualTo(2)
        // 1 recent FAILED ai row; old FAILED and recent SUCCESS excluded.
        assertThat(club.aiFailureCount).isEqualTo(1)
    }

    @Test
    fun `reports zero failures for a clean club`() {
        seedClubWithMember()

        val club = adapter.loadClub(UUID.fromString(CLUB_ID))

        assertThat(club!!.notificationFailureCount).isEqualTo(0)
        assertThat(club.aiFailureCount).isEqualTo(0)
    }

    private fun seedClubWithMember() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'failure-count-club', 'Failure Count Club', '', '', 'ACTIVE', 'PRIVATE')",
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) " +
                "values (?, 'failure-count-user', 'failure-count@example.com', 'Failure Count', 'FC', 'GOOGLE')",
            USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) " +
                "values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'FC')",
            MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    private fun seedNotificationDeliveries() {
        insertOutbox(RECENT_EVENT_ID)
        insertOutbox(OLD_EVENT_ID)
        insertDelivery(RECENT_DEAD_DELIVERY_ID, RECENT_EVENT_ID, "DEAD", daysAgo = 1)
        insertDelivery(RECENT_FAILED_DELIVERY_ID, RECENT_EVENT_ID, "FAILED", daysAgo = 3)
        insertDelivery(OLD_DEAD_DELIVERY_ID, OLD_EVENT_ID, "DEAD", daysAgo = 10)
        insertDelivery(SENT_DELIVERY_ID, RECENT_EVENT_ID, "SENT", daysAgo = 1)
    }

    private fun seedAiAuditRows() {
        insertAiAudit("aigen-recent-failed", "FAILED", daysAgo = 2)
        insertAiAudit("aigen-old-failed", "FAILED", daysAgo = 9)
        insertAiAudit("aigen-recent-ok", "SUCCESS", daysAgo = 1)
    }

    private fun insertOutbox(id: String) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), 'PUBLISHED',
              ?, 1, null, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id, CLUB_ID, CLUB_ID, CLUB_ID, CLUB_ID, "failure-count-outbox-$id",
        )
    }

    private fun insertDelivery(id: String, eventId: String, status: String, daysAgo: Long) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', ?, ?, 1, null,
              utc_timestamp(6) - interval ? day, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            id, eventId, CLUB_ID, MEMBERSHIP_ID, status, "failure-count-delivery-$id", daysAgo, daysAgo,
        )
    }

    private fun insertAiAudit(jobSuffix: String, status: String, daysAgo: Long) {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status,
              input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'SESSION_RECORD', 'ANTHROPIC', 'claude-x', ?,
              0, 0, 0, 0, 0, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            UUID.randomUUID().toString(), CLUB_ID, CLUB_ID, USER_ID, status, daysAgo,
        )
    }
}
```

Note: `notification_deliveries.updated_at` has `on update current_timestamp(6)`, but an explicit value supplied at INSERT is honored (the trigger only fires on UPDATE). `ai_generation_audit_log` has no FK, so its `club_id`/`host_user_id` need not reference real rows — but we reuse the seeded ids for clarity. The `status` strings (`DEAD`/`FAILED`/`SENT`, `FAILED`/`SUCCEEDED`) match the values used elsewhere in the codebase.

- [ ] **Step 2: Run the test to verify it fails to compile**

Run: `./server/gradlew -p server compileTestKotlin`
Expected: FAIL — `notificationFailureCount` / `aiFailureCount` are unresolved references on `PlatformAdminClubListItem`.

- [ ] **Step 3: Add the two fields to the model**

In `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`, edit `PlatformAdminClubListItem` (currently lines 72-83) to add the two fields after `domainActionRequiredCount`:

```kotlin
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
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
    val firstHostOnboardingState: FirstHostOnboardingState,
)
```

- [ ] **Step 4: Read the new columns in the row mapper**

In `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`, update `mapPlatformAdminClub` (lines 246-261) to populate the two fields:

```kotlin
private fun mapPlatformAdminClub(
    resultSet: ResultSet,
    @Suppress("UNUSED_PARAMETER") rowNumber: Int,
): PlatformAdminClubListItem =
    PlatformAdminClubListItem(
        clubId = resultSet.uuid("id"),
        slug = resultSet.getString("slug"),
        name = resultSet.getString("name"),
        tagline = resultSet.getString("tagline"),
        about = resultSet.getString("about"),
        status = ClubStatus.valueOf(resultSet.getString("status")),
        publicVisibility = ClubPublicVisibility.valueOf(resultSet.getString("public_visibility")),
        domainCount = resultSet.getInt("domain_count"),
        domainActionRequiredCount = resultSet.getInt("domain_action_required_count"),
        notificationFailureCount = resultSet.getInt("notification_failure_count"),
        aiFailureCount = resultSet.getInt("ai_failure_count"),
        firstHostOnboardingState = FirstHostOnboardingState.valueOf(resultSet.getString("first_host_state")),
    )
```

- [ ] **Step 5: Run the test to verify it fails on the missing columns**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubFailureCountsTest"`
Expected: FAIL — SQL error / `notification_failure_count` column not found (the SELECT does not yet produce it).

- [ ] **Step 6: Extend `CLUB_BASE_SQL` with the two aggregation joins**

In the same adapter file, replace the `CLUB_BASE_SQL` constant (lines 200-236) with this version. It adds the two SELECT columns and two `left join` subqueries; everything else is unchanged:

```kotlin
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
              coalesce(notification_failures.failure_count, 0) as notification_failure_count,
              coalesce(ai_failures.failure_count, 0) as ai_failure_count,
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
            left join (
              select club_id, count(*) as failure_count
              from notification_deliveries
              where status in ('FAILED', 'DEAD')
                and updated_at >= utc_timestamp(6) - interval 7 day
              group by club_id
            ) notification_failures on notification_failures.club_id = clubs.id
            left join (
              select club_id, count(*) as failure_count
              from ai_generation_audit_log
              where status = 'FAILED'
                and created_at >= utc_timestamp(6) - interval 7 day
              group by club_id
            ) ai_failures on ai_failures.club_id = clubs.id
        """
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubFailureCountsTest"`
Expected: PASS — both cases green (2 notification failures, 1 AI failure; clean club is 0/0).

- [ ] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminClubFailureCountsTest.kt
git commit -m "feat: aggregate recent club notification and ai failures"
```

---

## Task 2: Expose the counts in the response DTO

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt:100-120`
- Create: `server/src/test/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubResponseTest.kt`

- [ ] **Step 1: Write the failing mapping test**

Create `server/src/test/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubResponseTest.kt`:

```kotlin
package com.readmates.club.adapter.in.web

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class PlatformAdminClubResponseTest {
    @Test
    fun `maps notification and ai failure counts`() {
        val item = PlatformAdminClubListItem(
            clubId = UUID.fromString("00000000-0000-0000-0000-0000000fc001"),
            slug = "failure-count-club",
            name = "Failure Count Club",
            tagline = "",
            about = "",
            status = ClubStatus.ACTIVE,
            publicVisibility = ClubPublicVisibility.PRIVATE,
            domainCount = 1,
            domainActionRequiredCount = 0,
            notificationFailureCount = 2,
            aiFailureCount = 1,
            firstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
        )

        val response = PlatformAdminClubResponse.from(item)

        assertThat(response.notificationFailureCount).isEqualTo(2)
        assertThat(response.aiFailureCount).isEqualTo(1)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.in.web.PlatformAdminClubResponseTest"`
Expected: FAIL — `notificationFailureCount` / `aiFailureCount` are unresolved on `PlatformAdminClubResponse`.

- [ ] **Step 3: Add the fields to the response DTO and `from`**

In `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt`, update `PlatformAdminClubResponse` (lines 100-120). Add the two fields after `domainActionRequiredCount` in both the constructor and the `from` mapping:

```kotlin
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
    val notificationFailureCount: Int,
    val aiFailureCount: Int,
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
```

Then in the same `from` body, add the two new fields after the existing `domainActionRequiredCount = ...` line and before `firstHostOnboardingState = ...`:

```kotlin
                domainActionRequiredCount = item.domainActionRequiredCount,
                notificationFailureCount = item.notificationFailureCount,
                aiFailureCount = item.aiFailureCount,
                firstHostOnboardingState = item.firstHostOnboardingState.name,
```

(Keep the rest of the existing `from` body — `publicVisibility`, `domainCount`, the closing `)` — exactly as it is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `./server/gradlew -p server test --tests "com.readmates.club.adapter.in.web.PlatformAdminClubResponseTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubController.kt server/src/test/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubResponseTest.kt
git commit -m "feat: expose club failure counts in admin clubs response"
```

---

## Task 3: Frontend type + triage model

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts:68-79`
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts`

- [ ] **Step 1: Update the model test factory and add failing tests**

In `front/features/platform-admin/model/platform-admin-club-triage-model.test.ts`, add the two fields to the `club()` factory defaults (after `domainActionRequiredCount: 0,`):

```ts
    domainActionRequiredCount: 0,
    notificationFailureCount: 0,
    aiFailureCount: 0,
    firstHostOnboardingState: "ASSIGNED",
```

Then add these tests inside the existing `describe("clubTriageSeverity", ...)` block:

```ts
  it("is critical when there are recent notification failures", () => {
    expect(clubTriageSeverity(club({ notificationFailureCount: 1 }))).toBe("critical");
  });

  it("is critical when there are recent ai failures", () => {
    expect(clubTriageSeverity(club({ aiFailureCount: 2 }))).toBe("critical");
  });
```

And add these inside the existing `describe("clubTriageReasons", ...)` block:

```ts
  it("lists failure counts first, ahead of domain and host reasons", () => {
    expect(
      clubTriageReasons(
        club({ notificationFailureCount: 3, aiFailureCount: 1, domainActionRequiredCount: 1 }),
      ),
    ).toEqual(["알림 실패 3건", "AI 실패 1건", "도메인 조치 필요"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir front test platform-admin-club-triage-model`
Expected: FAIL — severity returns `"ok"` for the failure-count clubs, and reasons omit the failure strings. (TypeScript may also flag `notificationFailureCount` as unknown on the factory once the type is updated — that resolves in Step 3/4.)

- [ ] **Step 3: Add the two fields to the `PlatformAdminClub` type**

In `front/features/platform-admin/model/platform-admin-domain-types.ts`, edit the `PlatformAdminClub` type (lines 68-79) to add the two fields after `domainActionRequiredCount`:

```ts
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
  notificationFailureCount: number;
  aiFailureCount: number;
  firstHostOnboardingState: FirstHostOnboardingState;
};
```

- [ ] **Step 4: Fold failure counts into severity and reasons**

In `front/features/platform-admin/model/platform-admin-club-triage-model.ts`:

Replace the `clubTriageReasons` function so failure counts are prepended (most actionable first):

```ts
export function clubTriageReasons(club: PlatformAdminClub): string[] {
  const reasons: string[] = [];
  if (club.notificationFailureCount > 0) {
    reasons.push(`알림 실패 ${club.notificationFailureCount}건`);
  }
  if (club.aiFailureCount > 0) {
    reasons.push(`AI 실패 ${club.aiFailureCount}건`);
  }
  if (club.domainActionRequiredCount > 0) {
    reasons.push("도메인 조치 필요");
  }
  if (club.firstHostOnboardingState === "MISSING") {
    reasons.push("호스트 없음");
  } else if (club.firstHostOnboardingState === "INVITED") {
    reasons.push("호스트 초대 대기");
  }
  if (club.status === "SUSPENDED") {
    reasons.push("정지됨");
  } else if (club.status === "ARCHIVED") {
    reasons.push("보관됨");
  } else if (club.status === "SETUP_REQUIRED") {
    reasons.push("설정 미완료");
  }
  return reasons;
}
```

Replace the `clubTriageSeverity` function to treat any recent failure as critical:

```ts
export function clubTriageSeverity(club: PlatformAdminClub): ClubTriageSeverity {
  if (
    club.notificationFailureCount > 0 ||
    club.aiFailureCount > 0 ||
    club.domainActionRequiredCount > 0 ||
    club.status === "SUSPENDED" ||
    club.status === "ARCHIVED"
  ) {
    return "critical";
  }
  if (club.status === "SETUP_REQUIRED" || club.firstHostOnboardingState !== "ASSIGNED") {
    return "attention";
  }
  return "ok";
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --dir front test platform-admin-club-triage-model`
Expected: PASS — new severity and reason-order cases green, existing cases unchanged.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-domain-types.ts front/features/platform-admin/model/platform-admin-club-triage-model.ts front/features/platform-admin/model/platform-admin-club-triage-model.test.ts
git commit -m "feat: fold club failure counts into triage severity"
```

---

## Task 4: Clubs route test — failure reason render + factory defaults

**Files:**
- Modify: `front/features/platform-admin/route/admin-clubs-route.test.tsx:8-14` (factory type) and the `describe` body
- Modify: `front/features/platform-admin/model/admin-status-strip-model.test.ts` (club factory/literal — add `notificationFailureCount: 0, aiFailureCount: 0`)
- Modify: `front/features/platform-admin/queries/platform-admin-queries.test.tsx` (club literal ~line 45 — add the two fields)
- Modify: `front/features/platform-admin/route/admin-club-detail-route.test.tsx` (club literal ~line 21 — add the two fields)
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx` (club literal ~line 36 — add the two fields)

> **Scope note (orchestrator, 2026-05-30):** Task 3's `PlatformAdminClub` type change added two required fields. `tsc --noEmit` confirms FIVE test files construct `PlatformAdminClub`-typed literals/factories and now fail to compile: `admin-clubs-route.test.tsx`, `admin-status-strip-model.test.ts`, `platform-admin-queries.test.tsx`, `admin-club-detail-route.test.tsx`, `admin-today-route.test.tsx`. The original plan only listed the first. All five must get `notificationFailureCount: 0, aiFailureCount: 0` safe defaults here so Task 5's full `pnpm --dir front test && build` regression passes. These are pure compile-fix defaults (value 0) — no behavioral change to those tests.

- [ ] **Step 0: Add safe-default fields to the four sibling type-break test files**

For each of these four files, locate the `PlatformAdminClub` object literal(s) or factory defaults and add `notificationFailureCount: 0, aiFailureCount: 0` next to `domainActionRequiredCount` (value 0, no behavior change):
- `front/features/platform-admin/model/admin-status-strip-model.test.ts`
- `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- `front/features/platform-admin/route/admin-club-detail-route.test.tsx`
- `front/features/platform-admin/route/admin-today-route.test.tsx`

After editing, run `pnpm --dir front exec tsc --noEmit` and confirm none of these four files report `notificationFailureCount`/`aiFailureCount` missing-property errors. (The `admin-clubs-route.test.tsx` fix is handled in Step 1 below.)

- [ ] **Step 1: Update the inline factory type and existing item literals**

In `front/features/platform-admin/route/admin-clubs-route.test.tsx`, update the `renderRoute` parameter type (lines 8-14) to add the two fields:

```ts
function renderRoute(items: Array<{
  clubId: string; slug: string; name: string;
  status: "ACTIVE" | "SETUP_REQUIRED" | "SUSPENDED" | "ARCHIVED";
  publicVisibility: "PRIVATE" | "PUBLIC";
  domainCount: number; domainActionRequiredCount: number;
  notificationFailureCount: number; aiFailureCount: number;
  firstHostOnboardingState: "MISSING" | "INVITED" | "ASSIGNED";
  tagline: string; about: string;
}>) {
```

Every existing item literal in this file must now include `notificationFailureCount: 0, aiFailureCount: 0,`. Add those two keys to each item object already present (the `c-1`/`alpha`, `ok-1`/`healthy`, `crit-1`/`broken` literals), placing them next to `domainActionRequiredCount`.

- [ ] **Step 2: Add a failing test for the failure reason**

Append inside `describe("AdminClubsRoute", ...)`:

```ts
  it("shows a notification-failure reason and ranks the club critical", () => {
    renderRoute([
      {
        clubId: "ok-1", slug: "healthy", name: "Healthy", status: "ACTIVE",
        publicVisibility: "PUBLIC", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 0, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
      {
        clubId: "fail-1", slug: "failing", name: "Failing", status: "ACTIVE",
        publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0,
        notificationFailureCount: 4, aiFailureCount: 0,
        firstHostOnboardingState: "ASSIGNED", tagline: "", about: "",
      },
    ]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Failing")).toBeInTheDocument();
    expect(screen.getByText("알림 실패 4건")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm --dir front test admin-clubs-route`
Expected: PASS — the new reason renders and the failing club sorts above the healthy one. No change to `admin-clubs-route.tsx` is needed (it already renders `clubTriageReasons` output and sorts by `rankClubsByTriage`). If TypeScript flags missing fields on any pre-existing item literal, add `notificationFailureCount: 0, aiFailureCount: 0` to it.

- [ ] **Step 4: Commit**

```bash
git add front/features/platform-admin/route/admin-clubs-route.test.tsx \
  front/features/platform-admin/model/admin-status-strip-model.test.ts \
  front/features/platform-admin/queries/platform-admin-queries.test.tsx \
  front/features/platform-admin/route/admin-club-detail-route.test.tsx \
  front/features/platform-admin/route/admin-today-route.test.tsx
git commit -m "test: cover club failure-count triage reason in clubs route"
```

---

## Task 5: E2E mock + CHANGELOG + full regression

**Files:**
- Modify: `front/tests/e2e/admin-clubs-triage.spec.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the new fields to the E2E mock items and assert the reason**

In `front/tests/e2e/admin-clubs-triage.spec.ts`, in the `**/api/bff/api/admin/clubs` route handler, add `notificationFailureCount`/`aiFailureCount` to both mock items. Give the `crit-club`/`broken` item a non-zero notification failure so the reason renders:

```ts
        {
          clubId: "ok-club", slug: "healthy", name: "Healthy Club",
          tagline: "", about: "", status: "ACTIVE", publicVisibility: "PUBLIC",
          domainCount: 1, domainActionRequiredCount: 0,
          notificationFailureCount: 0, aiFailureCount: 0,
          firstHostOnboardingState: "ASSIGNED",
        },
        {
          clubId: "crit-club", slug: "broken", name: "Broken Club",
          tagline: "", about: "", status: "ACTIVE", publicVisibility: "PRIVATE",
          domainCount: 1, domainActionRequiredCount: 2,
          notificationFailureCount: 2, aiFailureCount: 0,
          firstHostOnboardingState: "ASSIGNED",
        },
```

Then, in the test body (after navigating to `/admin/clubs` and before/after the existing filter assertions), add an assertion that the failure reason renders:

```ts
await expect(page.getByText("알림 실패 2건")).toBeVisible();
```

Place this assertion where the page is on the default `전체` filter so the `crit-club` row is visible (the broken club is critical, so it is shown under `전체` and `긴급`).

- [ ] **Step 2: Run the E2E test to verify it passes**

Run: `pnpm --dir front test:e2e admin-clubs-triage`
Expected: PASS — triage toolbar, filter, drill-in, and the new failure-reason assertion all green.

- [ ] **Step 3: Update CHANGELOG**

In `CHANGELOG.md`, under `Unreleased`, add a bullet describing shipped behavior:

```markdown
- `/admin/clubs`: triage now counts each club's recent (7-day) notification-delivery and AI-generation failures, ranks any club with a failure as 긴급, and shows `알림 실패 N건` / `AI 실패 N건` as the leading reasons so operators see member-impacting failures first.
```

- [ ] **Step 4: Run the full frontend regression suite**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: PASS — all green.

- [ ] **Step 5: Run the server suite**

Run: `./server/gradlew -p server unitTest && ./server/gradlew -p server test --tests "com.readmates.club.*"`
Expected: PASS — unit tests plus the new club integration and response tests green. (No package boundary moved, so `architectureTest` is unchanged; run it if the gradle config couples it to club changes.)

- [ ] **Step 6: Commit**

```bash
git add front/tests/e2e/admin-clubs-triage.spec.ts CHANGELOG.md
git commit -m "test: cover club failure-count triage e2e and note changelog"
```

---

## Verification Gates (whole plan)

- [ ] `./server/gradlew -p server test --tests "com.readmates.club.adapter.out.persistence.JdbcPlatformAdminClubFailureCountsTest"` — window + FAILED/DEAD-only counting verified.
- [ ] `./server/gradlew -p server test --tests "com.readmates.club.adapter.in.web.PlatformAdminClubResponseTest"` — DTO mapping verified.
- [ ] `pnpm --dir front test platform-admin-club-triage-model` — severity + reason model tests pass.
- [ ] `pnpm --dir front test admin-clubs-route` — failure-reason render + ordering pass.
- [ ] `pnpm --dir front lint` — no lint errors.
- [ ] `pnpm --dir front build` — production build succeeds.
- [ ] `pnpm --dir front test:e2e admin-clubs-triage` — triage happy path + failure reason pass.
- [ ] `git diff --check` — no whitespace/conflict markers in changed files.
- [ ] Manual browser smoke: dev-login as platform admin, seed (or use dev data with) a failed delivery / failed AI job, open `/admin/clubs`, confirm the club ranks 긴급 with `알림 실패 N건` / `AI 실패 N건`.

## Public Safety

- Only integer counts are added to the UI, response, fixtures, and tests. No provider raw errors, transcript bodies, AI result JSON, member data, private message bodies, secrets, private domains, or local paths are introduced. The 7-day window is computed server-side; the client receives only the two integers.

## Spec Coverage Check

- Spec §5 server aggregation (two joins, 7-day window, coalesce) → Task 1 Step 6.
- Spec §5 model + response fields → Task 1 Steps 3-4, Task 2.
- Spec §5 frontend type + severity + reasons → Task 3.
- Spec §3 decisions (7-day window; failure > 0 ⇒ critical) → Task 1 Step 6 SQL, Task 3 Step 4 severity.
- Spec §7 data contract (field names/shape consistent across server/front/fixtures) → Tasks 1-5 use `notificationFailureCount`/`aiFailureCount` everywhere.
- Spec §9 testing gates (integration FK seeding, window boundary, model/route tests, E2E regression, CHANGELOG, public-safety) → Tasks 1, 3, 4, 5.
- Spec §6 non-goals (no write, no detail redesign, no host commands, no raw errors) → respected; only counts added.
