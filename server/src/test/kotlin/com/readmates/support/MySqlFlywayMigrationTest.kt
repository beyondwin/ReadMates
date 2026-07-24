package com.readmates.support

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.UncategorizedSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "spring.ai.model.chat=none",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
class MySqlFlywayMigrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `mysql creates host session record revision and notification confirmation tables`() {
        val tables =
            jdbcTemplate
                .queryForList(
                    """
                    select table_name
                    from information_schema.tables
                    where table_schema = database()
                      and table_name in (
                        'session_record_drafts',
                        'session_record_revisions',
                        'host_session_change_audit',
                        'host_action_notification_previews',
                        'host_action_notification_decisions'
                      )
                    """.trimIndent(),
                    String::class.java,
                ).toSet()

        assertEquals(
            setOf(
                "session_record_drafts",
                "session_record_revisions",
                "host_session_change_audit",
                "host_action_notification_previews",
                "host_action_notification_decisions",
            ),
            tables,
        )
        assertEquals(
            "club_id,session_id,version",
            indexColumns("session_record_revisions", "session_record_revisions_version_uk"),
        )
        assertEquals(
            "session_id,club_id",
            foreignKeyColumns("session_record_drafts", "session_record_drafts_session_fk"),
        )
        assertEquals(
            "session_id,club_id",
            indexColumns("session_record_drafts", "PRIMARY"),
        )
        assertEquals("NO", columnValue("session_record_drafts", "base_session_updated_at", "is_nullable"))
        assertTrue(checkConstraintClause("session_record_drafts_sha_check").contains("64"))
        assertTrue(checkConstraintClause("session_record_revisions_sha_check").contains("64"))
        val previewCounts = checkConstraintClause("host_action_notification_previews_counts_check")
        assertTrue(previewCounts.contains("target_count") && previewCounts.contains(">= 0"))
        val decisionCounts = checkConstraintClause("host_action_notification_decisions_counts_check")
        assertTrue(decisionCounts.contains("target_count") && decisionCounts.contains(">= 0"))
        val decisions = checkConstraintClause("host_action_notification_decisions_decision_check")
        assertTrue(decisions.contains("SEND") && decisions.contains("SKIP"))
        assertHostNotificationComposerSchema()
    }

    private fun assertHostNotificationComposerSchema() {
        assertThat(columns("session_record_apply_receipts"))
            .contains(
                "apply_request_id",
                "expected_draft_revision",
                "expected_live_revision",
                "draft_sha256",
                "composer_event_type",
                "revision_id",
            )
        assertThat(columns("club_notification_policies"))
            .contains("club_id", "session_reminder_enabled", "updated_by_membership_id")
        assertThat(columns("notification_manual_dispatches"))
            .contains("content_revision")
        assertThat(columns("notification_manual_dispatch_previews"))
            .contains("target_snapshot_hash")
        assertEquals(
            "id,club_id,session_id",
            indexColumns("session_record_revisions", "session_record_revisions_scope_uk"),
        )
        assertEquals(
            "revision_id,club_id,session_id",
            foreignKeyColumns("session_record_apply_receipts", "session_record_apply_receipts_revision_scope_fk"),
        )
        assertEquals(
            "session_record_revisions:id,club_id,session_id",
            foreignKeyReference("session_record_apply_receipts", "session_record_apply_receipts_revision_scope_fk"),
        )
    }

    private fun columns(table: String): Set<String> =
        jdbcTemplate
            .queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database() and table_name = ?
                """.trimIndent(),
                String::class.java,
                table,
            ).filterNotNull()
            .toSet()

    @Test
    fun `mysql baseline creates auth session and feedback document tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('users', 'auth_sessions', 'session_feedback_documents')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(3, tableCount)
        assertKafkaNotificationTablesExist(jdbcTemplate)
        assertKafkaNotificationForeignKeys()
        assertEquals("NO", columnValue("users", "short_name", "is_nullable"))
        assertEquals("NO", columnValue("memberships", "short_name", "is_nullable"))
        assertEquals("NO", columnValue("invitations", "invited_name", "is_nullable"))
        assertEquals("longtext", columnValue("session_feedback_documents", "source_text", "data_type"))
        assertEquals("YES", columnValue("session_feedback_documents", "document_title", "is_nullable"))
        assertEquals(
            "club_id,state,visibility,number,session_date",
            indexColumns("sessions", "sessions_club_state_visibility_number_idx"),
        )
        assertEquals(
            "club_id,session_id,participation_status,membership_id",
            indexColumns("session_participants", "session_participants_club_session_status_member_idx"),
        )
        assertEquals(
            "club_id,session_id,created_at,priority",
            indexColumns("questions", "questions_club_session_created_idx"),
        )
        assertEquals(
            "club_id,visibility,created_at,session_id",
            indexColumns("one_line_reviews", "one_line_reviews_club_visibility_created_idx"),
        )
        assertEquals(
            "club_id,visibility,created_at,session_id",
            indexColumns("long_reviews", "long_reviews_club_visibility_created_idx"),
        )
        assertEquals(
            "club_id,session_id,created_at,sort_order",
            indexColumns("highlights", "highlights_club_session_created_idx"),
        )
        assertEquals(
            "club_id,session_id,version,created_at",
            indexColumns("session_feedback_documents", "session_feedback_documents_club_session_version_idx"),
        )
        assertEquals(
            "club_id,status,updated_at,created_at",
            indexColumns("notification_outbox", "notification_outbox_club_status_updated_idx"),
        )
        assertEquals(
            "club_id,status,next_attempt_at,created_at",
            indexColumns("notification_outbox", "notification_outbox_club_status_next_idx"),
        )
        assertEquals(1, uniqueIndexCount("auth_sessions", "session_token_hash"))
        assertEquals(1, uniqueIndexCount("memberships", "short_name"))
        assertEquals("invited_by_membership_id,club_id", foreignKeyColumns("invitations", "invitations_inviter_fk"))
        assertEquals("memberships:id,club_id", foreignKeyReference("invitations", "invitations_inviter_fk"))

        val membershipStatuses =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'memberships_status_check'
                """.trimIndent(),
            )
        assertTrue(
            membershipStatuses.any { row ->
                row["CHECK_CLAUSE"].toString().contains("VIEWER") &&
                    !row["CHECK_CLAUSE"].toString().contains("PENDING_APPROVAL") &&
                    row["CHECK_CLAUSE"].toString().contains("SUSPENDED") &&
                    row["CHECK_CLAUSE"].toString().contains("LEFT")
            },
        )

        val participantColumns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'session_participants'
                  and column_name = 'participation_status'
                """.trimIndent(),
            )
        assertEquals(1, participantColumns.size)

        val checkinNoteColumns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'reading_checkins'
                  and column_name = 'note'
                """.trimIndent(),
            )
        assertEquals(0, checkinNoteColumns.size)

        val oneLineVisibilityConstraints =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'one_line_reviews_visibility_check'
                """.trimIndent(),
            )
        assertTrue(
            oneLineVisibilityConstraints.any { row ->
                row["CHECK_CLAUSE"].toString().contains("SESSION") &&
                    row["CHECK_CLAUSE"].toString().contains("PUBLIC") &&
                    row["CHECK_CLAUSE"].toString().contains("PRIVATE")
            },
        )

        val sessionVisibilityColumns =
            jdbcTemplate.queryForList(
                """
                select column_name, column_default, is_nullable
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'sessions'
                  and column_name = 'visibility'
                """.trimIndent(),
            )
        assertEquals(1, sessionVisibilityColumns.size)
        assertEquals("NO", sessionVisibilityColumns.first()["IS_NULLABLE"])

        val sessionVisibilityConstraints =
            jdbcTemplate.queryForList(
                """
                select constraint_name, check_clause
                from information_schema.check_constraints
                where constraint_schema = database()
                  and constraint_name = 'sessions_visibility_check'
                """.trimIndent(),
            )
        assertTrue(
            sessionVisibilityConstraints.any { row ->
                val clause = row["CHECK_CLAUSE"].toString()
                clause.contains("HOST_ONLY") &&
                    clause.contains("MEMBER") &&
                    clause.contains("PUBLIC")
            },
        )

        val publishedPublicSeedCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                where sessions.state = 'PUBLISHED'
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
            )
        assertTrue(requireNotNull(publishedPublicSeedCount) > 0)

        val publicSeedSessionVisibilityMismatchCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                join public_session_publications on public_session_publications.session_id = sessions.id
                where sessions.state = 'PUBLISHED'
                  and public_session_publications.visibility = 'PUBLIC'
                  and sessions.visibility <> 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, publicSeedSessionVisibilityMismatchCount)
    }

    @Test
    fun `mysql notification pipeline prevents cross club ledger rows`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val firstClubId = UUID.randomUUID().toString()
        val secondClubId = UUID.randomUUID().toString()
        val firstUserId = UUID.randomUUID().toString()
        val secondUserId = UUID.randomUUID().toString()
        val firstMembershipId = UUID.randomUUID().toString()
        val secondMembershipId = UUID.randomUUID().toString()
        val firstEventId = UUID.randomUUID().toString()
        val secondEventId = UUID.randomUUID().toString()
        val firstDeliveryId = UUID.randomUUID().toString()
        val secondDeliveryId = UUID.randomUUID().toString()
        val crossClubDeliveryId = UUID.randomUUID().toString()
        val crossClubMemberNotificationId = UUID.randomUUID().toString()

        try {
            insertClub(firstClubId, "ledger-a-$suffix")
            insertClub(secondClubId, "ledger-b-$suffix")
            insertProfileUser(firstUserId, "ledger-a-$suffix@example.com", "Ledger A", "LedgerA$suffix")
            insertProfileUser(secondUserId, "ledger-b-$suffix@example.com", "Ledger B", "LedgerB$suffix")
            insertMembership(firstMembershipId, firstClubId, firstUserId, "LedgerA$suffix")
            insertMembership(secondMembershipId, secondClubId, secondUserId, "LedgerB$suffix")
            insertNotificationEventOutbox(firstEventId, firstClubId, "ledger-event-a-$suffix")
            insertNotificationEventOutbox(secondEventId, secondClubId, "ledger-event-b-$suffix")

            assertThrows(DataIntegrityViolationException::class.java) {
                insertNotificationDelivery(
                    id = crossClubDeliveryId,
                    eventId = firstEventId,
                    clubId = secondClubId,
                    recipientMembershipId = secondMembershipId,
                    dedupeKey = "ledger-cross-delivery-$suffix",
                )
            }

            insertNotificationDelivery(
                id = firstDeliveryId,
                eventId = firstEventId,
                clubId = firstClubId,
                recipientMembershipId = firstMembershipId,
                dedupeKey = "ledger-delivery-a-$suffix",
            )
            insertNotificationDelivery(
                id = secondDeliveryId,
                eventId = secondEventId,
                clubId = secondClubId,
                recipientMembershipId = secondMembershipId,
                dedupeKey = "ledger-delivery-b-$suffix",
            )

            assertThrows(DataIntegrityViolationException::class.java) {
                insertMemberNotification(
                    id = crossClubMemberNotificationId,
                    eventId = firstEventId,
                    deliveryId = secondDeliveryId,
                    clubId = secondClubId,
                    recipientMembershipId = secondMembershipId,
                )
            }
        } finally {
            deleteWhereIn("member_notifications", "id", setOf(crossClubMemberNotificationId))
            deleteWhereIn(
                "notification_deliveries",
                "id",
                setOf(firstDeliveryId, secondDeliveryId, crossClubDeliveryId),
            )
            deleteWhereIn("notification_event_outbox", "id", setOf(firstEventId, secondEventId))
            deleteWhereIn("memberships", "id", setOf(firstMembershipId, secondMembershipId))
            deleteWhereIn("users", "id", setOf(firstUserId, secondUserId))
            deleteWhereIn("clubs", "id", setOf(firstClubId, secondClubId))
        }
    }

    @Test
    fun `mysql enforces unique short names within a club for out of band profile writes`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val clubId = UUID.randomUUID().toString()
        val firstUserId = UUID.randomUUID().toString()
        val secondUserId = UUID.randomUUID().toString()
        val firstMembershipId = UUID.randomUUID().toString()
        val secondMembershipId = UUID.randomUUID().toString()
        val firstShortName = "ClaimA$suffix"
        val secondShortName = "ClaimB$suffix"

        try {
            jdbcTemplate.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
                """.trimIndent(),
                clubId,
                "claim-$suffix",
            )
            insertProfileUser(firstUserId, "claim-a-$suffix@example.com", "Claim A", firstShortName)
            insertProfileUser(secondUserId, "claim-b-$suffix@example.com", "Claim B", secondShortName)
            insertMembership(firstMembershipId, clubId, firstUserId, firstShortName)
            insertMembership(secondMembershipId, clubId, secondUserId, secondShortName)

            assertThrows(DataIntegrityViolationException::class.java) {
                jdbcTemplate.update(
                    """
                    update memberships
                    set short_name = ?,
                        updated_at = utc_timestamp(6)
                    where id = ?
                    """.trimIndent(),
                    firstShortName,
                    secondMembershipId,
                )
            }
        } finally {
            deleteWhereIn("memberships", "id", setOf(firstMembershipId, secondMembershipId))
            deleteWhereIn("users", "id", setOf(firstUserId, secondUserId))
            deleteWhereIn("clubs", "id", setOf(clubId))
        }
    }

    @Test
    fun `mysql creates notification preference and test mail audit tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('notification_preferences', 'notification_test_mail_audit')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(2, tableCount)

        assertEquals("NO", columnValue("notification_preferences", "membership_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "email_enabled", "is_nullable"))
        assertEquals("NO", columnValue("notification_preferences", "review_published_enabled", "is_nullable"))
        assertEquals(
            "membership_id,club_id",
            foreignKeyColumns("notification_preferences", "notification_preferences_membership_fk"),
        )
        assertEquals(
            "memberships:id,club_id",
            foreignKeyReference("notification_preferences", "notification_preferences_membership_fk"),
        )

        assertEquals("NO", columnValue("notification_test_mail_audit", "id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "host_membership_id", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "recipient_masked_email", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "recipient_email_hash", "is_nullable"))
        assertEquals("NO", columnValue("notification_test_mail_audit", "status", "is_nullable"))
        assertEquals("YES", columnValue("notification_test_mail_audit", "last_error", "is_nullable"))
        assertEquals(
            "club_id,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_club_created_idx"),
        )
        assertEquals(
            "host_membership_id,club_id,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_host_created_idx"),
        )
        assertEquals(
            "recipient_email_hash,created_at",
            indexColumns("notification_test_mail_audit", "notification_test_mail_audit_recipient_hash_idx"),
        )
        assertEquals(
            "club_id",
            foreignKeyColumns("notification_test_mail_audit", "notification_test_mail_audit_club_fk"),
        )
        assertEquals(
            "clubs:id",
            foreignKeyReference("notification_test_mail_audit", "notification_test_mail_audit_club_fk"),
        )
        assertEquals(
            "host_membership_id,club_id",
            foreignKeyColumns("notification_test_mail_audit", "notification_test_mail_audit_host_membership_fk"),
        )
        assertEquals(
            "memberships:id,club_id",
            foreignKeyReference("notification_test_mail_audit", "notification_test_mail_audit_host_membership_fk"),
        )
        assertTrue(checkConstraintClause("notification_test_mail_audit_status_check").contains("SENT"))
        assertTrue(checkConstraintClause("notification_test_mail_audit_status_check").contains("FAILED"))
        assertTrue(checkConstraintClause("notification_test_mail_audit_mask_check").contains("trim"))
        val hashCheckClause = checkConstraintClause("notification_test_mail_audit_hash_check")
        assertTrue(hashCheckClause.contains("regexp_like"))
        assertTrue(hashCheckClause.contains("^[0-9a-f]{64}$"))

        val suffix = UUID.randomUUID().toString().take(8)
        val clubId = UUID.randomUUID().toString()
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val shortName = "Notify$suffix"

        try {
            jdbcTemplate.update(
                """
                insert into clubs (id, slug, name, tagline, about)
                values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
                """.trimIndent(),
                clubId,
                "notify-$suffix",
            )
            insertProfileUser(userId, "notify-$suffix@example.com", "Notify User", shortName)
            insertMembership(membershipId, clubId, userId, shortName)

            jdbcTemplate.update(
                """
                insert into notification_preferences (membership_id, club_id)
                values (?, ?)
                """.trimIndent(),
                membershipId,
                clubId,
            )

            val preferences =
                jdbcTemplate.queryForMap(
                    """
                    select email_enabled,
                           next_book_published_enabled,
                           session_reminder_due_enabled,
                           feedback_document_published_enabled,
                           review_published_enabled
                    from notification_preferences
                    where membership_id = ?
                      and club_id = ?
                    """.trimIndent(),
                    membershipId,
                    clubId,
                )

            assertEquals(true, preferences["email_enabled"])
            assertEquals(true, preferences["next_book_published_enabled"])
            assertEquals(true, preferences["session_reminder_due_enabled"])
            assertEquals(true, preferences["feedback_document_published_enabled"])
            assertEquals(false, preferences["review_published_enabled"])

            insertTestMailAudit(
                id = UUID.randomUUID().toString(),
                clubId = clubId,
                hostMembershipId = membershipId,
                recipientEmailHash = "a".repeat(64),
            )

            val uppercaseHashError =
                assertThrows(UncategorizedSQLException::class.java) {
                    insertTestMailAudit(
                        id = UUID.randomUUID().toString(),
                        clubId = clubId,
                        hostMembershipId = membershipId,
                        recipientEmailHash = "A".repeat(64),
                    )
                }
            assertTrue(uppercaseHashError.message.orEmpty().contains("notification_test_mail_audit_hash_check"))
        } finally {
            deleteWhereIn("notification_test_mail_audit", "host_membership_id", setOf(membershipId))
            deleteWhereIn("notification_preferences", "membership_id", setOf(membershipId))
            deleteWhereIn("memberships", "id", setOf(membershipId))
            deleteWhereIn("users", "id", setOf(userId))
            deleteWhereIn("clubs", "id", setOf(clubId))
        }
    }

    @Test
    fun `mysql creates ai generation audit and club defaults tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in ('ai_generation_audit_log', 'ai_generation_club_defaults', 'ai_generation_commit_receipts')
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(3, tableCount)

        assertEquals("NO", columnValue("ai_generation_audit_log", "job_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "session_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "host_user_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "kind", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "item", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "provider", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "model", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "status", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "created_at", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "pipeline_version", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "input_turn_count", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "speaker_count", "is_nullable"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "grounding_status", "is_nullable"))
        assertAiGenerationAttemptAuditColumns()

        assertEquals(
            "session_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_session"),
        )
        assertEquals(
            "club_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_club"),
        )
        assertEquals(
            "host_user_id,created_at",
            indexColumns("ai_generation_audit_log", "idx_aigen_audit_host"),
        )

        assertEquals("NO", columnValue("ai_generation_club_defaults", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "default_model", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "updated_at", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_club_defaults", "updated_by", "is_nullable"))
        assertEquals(
            "clubs:id",
            foreignKeyReference("ai_generation_club_defaults", "fk_aigen_default_club"),
        )
        assertEquals("NO", columnValue("ai_generation_commit_receipts", "job_id", "is_nullable"))
        assertEquals("NO", columnValue("ai_generation_commit_receipts", "revision", "is_nullable"))
        assertEquals(
            "job_id,revision",
            indexColumns("ai_generation_commit_receipts", "uk_aigen_commit_receipt_job_revision"),
        )
    }

    private fun assertAiGenerationAttemptAuditColumns() {
        assertAiGenerationAttemptAuditColumnSet()

        assertEquals("char", columnValue("ai_generation_audit_log", "trace_id", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "trace_id", "character_maximum_length"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "trace_id", "is_nullable"))
        assertEquals("tinyint unsigned", columnValue("ai_generation_audit_log", "provider_attempt", "column_type"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "provider_attempt", "is_nullable"))
        assertEquals("varchar", columnValue("ai_generation_audit_log", "provider_call_mode", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "provider_call_mode", "character_maximum_length"))
        assertEquals("YES", columnValue("ai_generation_audit_log", "provider_call_mode", "is_nullable"))
        assertEquals("varchar", columnValue("ai_generation_audit_log", "cost_basis", "data_type"))
        assertEquals("32", columnValue("ai_generation_audit_log", "cost_basis", "character_maximum_length"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "cost_basis", "is_nullable"))
        assertEquals("NONE", columnValue("ai_generation_audit_log", "cost_basis", "column_default"))
        assertEquals("int", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "data_type"))
        assertEquals("int", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "column_type"))
        assertEquals("NO", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "is_nullable"))
        assertEquals("0", columnValue("ai_generation_audit_log", "cache_write_input_tokens", "column_default"))

        val traceIndexes =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.statistics
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name = 'trace_id'
                """.trimIndent(),
                Int::class.java,
            )
        val traceForeignKeys =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.key_column_usage
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name = 'trace_id'
                  and referenced_table_name is not null
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, traceIndexes)
        assertEquals(0, traceForeignKeys)
    }

    private fun assertAiGenerationAttemptAuditColumnSet() {
        val migrationSql =
            checkNotNull(javaClass.classLoader.getResourceAsStream(V38_AI_PROVIDER_ATTEMPT_AUDIT))
                .bufferedReader()
                .use { it.readText() }
        val migrationDeclaredColumns =
            ADD_COLUMN_NAME_REGEX
                .findAll(migrationSql)
                .map { it.groupValues[1] }
                .toList()
        assertThat(migrationDeclaredColumns).containsExactly(
            "trace_id",
            "provider_attempt",
            "provider_call_mode",
            "cost_basis",
            "cache_write_input_tokens",
        )

        val v38Columns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'ai_generation_audit_log'
                  and column_name in (
                    'trace_id',
                    'provider_attempt',
                    'provider_call_mode',
                    'cost_basis',
                    'cache_write_input_tokens'
                  )
                """.trimIndent(),
                String::class.java,
            )
        assertEquals(5, v38Columns.size)
        assertThat(v38Columns).containsExactlyInAnyOrder(
            "trace_id",
            "provider_attempt",
            "provider_call_mode",
            "cost_basis",
            "cache_write_input_tokens",
        )
    }

    @Test
    fun `fk to clubs id requires explicit COLLATE when schema default differs`() {
        // Reproduces the v1.10.0 prod incident: schema default collation drifted
        // away from the existing clubs.id column collation, so a new FK column
        // created without an explicit COLLATE clause inherited the (wrong)
        // schema default and Flyway failed with errno 3780.
        val clubsIdCollation =
            jdbcTemplate.queryForObject(
                """
                select collation_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'clubs'
                  and column_name = 'id'
                """.trimIndent(),
                String::class.java,
            ) ?: error("clubs.id collation must be present")
        val originalSchemaDefault =
            jdbcTemplate.queryForObject(
                """
                select default_collation_name
                from information_schema.schemata
                where schema_name = database()
                """.trimIndent(),
                String::class.java,
            ) ?: error("schema default collation must be present")
        val mismatchedDefault =
            if (clubsIdCollation == "utf8mb4_0900_ai_ci") {
                "utf8mb4_unicode_ci"
            } else {
                "utf8mb4_0900_ai_ci"
            }

        try {
            jdbcTemplate.execute(
                "alter database default character set utf8mb4 collate $mismatchedDefault",
            )

            // No explicit COLLATE: the new column inherits the (mismatched)
            // schema default, so FK creation must fail.
            assertThrows(Exception::class.java) {
                jdbcTemplate.execute(
                    """
                    create table tmp_fk_collation_bad (
                      club_id char(36) not null,
                      constraint fk_tmp_collation_bad foreign key (club_id) references clubs(id)
                    )
                    """.trimIndent(),
                )
            }

            // Explicit COLLATE matching clubs.id: FK creation must succeed even
            // with a mismatched schema default. This is the pattern V31/V32 use.
            jdbcTemplate.execute(
                """
                create table tmp_fk_collation_ok (
                  club_id char(36) character set utf8mb4 collate $clubsIdCollation not null,
                  constraint fk_tmp_collation_ok foreign key (club_id) references clubs(id)
                )
                """.trimIndent(),
            )
        } finally {
            // Cleanup is critical: container reuse (~/.testcontainers.properties)
            // shares state across runs, so leaked tables or a non-default schema
            // collation would poison subsequent test invocations.
            runCatching { jdbcTemplate.execute("drop table if exists tmp_fk_collation_bad") }
            runCatching { jdbcTemplate.execute("drop table if exists tmp_fk_collation_ok") }
            jdbcTemplate.execute(
                "alter database default character set utf8mb4 collate $originalSchemaDefault",
            )
        }
    }

    @Test
    fun `mysql creates multi club platform metadata tables`() {
        val tableCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from information_schema.tables
                where table_schema = database()
                  and table_name in (
                    'club_domains',
                    'platform_admins',
                    'club_audit_events',
                    'platform_audit_events',
                    'support_access_grants'
                  )
                """.trimIndent(),
                Int::class.java,
            )

        assertEquals(5, tableCount)
        assertEquals("NO", columnValue("clubs", "status", "is_nullable"))
        assertTrue(checkConstraintClause("clubs_status_check").contains("ACTIVE"))
        assertTrue(checkConstraintClause("clubs_status_check").contains("ARCHIVED"))
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
        val invitationSourceCheck = checkConstraintClause("invitations_inviter_source_check")
        assertTrue(invitationSourceCheck.contains("invited_by_membership_id"))
        assertTrue(invitationSourceCheck.contains("invited_by_platform_admin_user_id"))

        assertEquals("NO", columnValue("club_domains", "club_id", "is_nullable"))
        assertEquals("NO", columnValue("club_domains", "hostname", "is_nullable"))
        assertEquals("NO", columnValue("club_domains", "status", "is_nullable"))
        assertEquals("club_id,status,is_primary", indexColumns("club_domains", "club_domains_club_status_idx"))
        assertEquals(1, uniqueIndexCount("club_domains", "hostname"))
        assertEquals("club_id", foreignKeyColumns("club_domains", "club_domains_club_fk"))
        assertEquals("clubs:id", foreignKeyReference("club_domains", "club_domains_club_fk"))
        assertTrue(checkConstraintClause("club_domains_kind_check").contains("CUSTOM_DOMAIN"))
        assertTrue(checkConstraintClause("club_domains_status_check").contains("ACTION_REQUIRED"))

        assertEquals("NO", columnValue("platform_admins", "user_id", "is_nullable"))
        assertEquals("NO", columnValue("platform_admins", "role", "is_nullable"))
        assertEquals("NO", columnValue("platform_admins", "status", "is_nullable"))
        assertEquals("user_id", foreignKeyColumns("platform_admins", "platform_admins_user_fk"))
        assertEquals("users:id", foreignKeyReference("platform_admins", "platform_admins_user_fk"))
        assertTrue(checkConstraintClause("platform_admins_role_check").contains("OWNER"))
        assertTrue(checkConstraintClause("platform_admins_status_check").contains("DISABLED"))

        assertEquals("club_id,created_at", indexColumns("club_audit_events", "club_audit_events_club_created_idx"))
        assertEquals("actor_user_id,created_at", indexColumns("club_audit_events", "club_audit_events_actor_created_idx"))
        assertEquals("actor_user_id", foreignKeyColumns("club_audit_events", "club_audit_events_actor_fk"))
        assertEquals("club_id", foreignKeyColumns("club_audit_events", "club_audit_events_club_fk"))
        assertEquals("NO", columnValue("club_audit_events", "metadata_json", "is_nullable"))

        assertEquals(
            "actor_user_id,created_at",
            indexColumns("platform_audit_events", "platform_audit_events_actor_created_idx"),
        )
        assertEquals(
            "target_user_id,created_at",
            indexColumns("platform_audit_events", "platform_audit_events_target_created_idx"),
        )
        assertEquals("actor_user_id", foreignKeyColumns("platform_audit_events", "platform_audit_events_actor_fk"))
        assertEquals("target_user_id", foreignKeyColumns("platform_audit_events", "platform_audit_events_target_fk"))
        assertEquals("NO", columnValue("platform_audit_events", "metadata_json", "is_nullable"))

        assertEquals(
            "club_id,expires_at",
            indexColumns("support_access_grants", "support_access_grants_club_expires_idx"),
        )
        assertEquals(
            "grantee_user_id,expires_at",
            indexColumns("support_access_grants", "support_access_grants_grantee_expires_idx"),
        )
        assertEquals("club_id", foreignKeyColumns("support_access_grants", "support_access_grants_club_fk"))
        assertEquals(
            "granted_by_user_id",
            foreignKeyColumns("support_access_grants", "support_access_grants_granted_by_fk"),
        )
        assertEquals("grantee_user_id", foreignKeyColumns("support_access_grants", "support_access_grants_grantee_fk"))
        assertTrue(checkConstraintClause("support_access_grants_scope_check").contains("HOST_SUPPORT_READ"))
    }

    private fun insertClub(
        clubId: String,
        slug: String,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, '테스트 클럽', '테스트 클럽', '테스트 클럽입니다.')
            """.trimIndent(),
            clubId,
            slug,
        )
    }

    private fun insertProfileUser(
        userId: String,
        email: String,
        name: String,
        shortName: String,
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-claim-$userId",
            email,
            name,
            shortName,
        )
    }

    private fun insertMembership(
        membershipId: String,
        clubId: String,
        userId: String,
        shortName: String,
    ) {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId,
            clubId,
            userId,
            shortName,
        )
    }

    private fun insertNotificationEventOutbox(
        id: String,
        clubId: String,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id,
              club_id,
              event_type,
              aggregate_type,
              aggregate_id,
              payload_json,
              kafka_key,
              dedupe_key
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('eventId', ?), ?, ?)
            """.trimIndent(),
            id,
            clubId,
            id,
            id,
            clubId,
            dedupeKey,
        )
    }

    private fun insertNotificationDelivery(
        id: String,
        eventId: String,
        clubId: String,
        recipientMembershipId: String,
        dedupeKey: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id,
              event_id,
              club_id,
              recipient_membership_id,
              channel,
              dedupe_key
            )
            values (?, ?, ?, ?, 'IN_APP', ?)
            """.trimIndent(),
            id,
            eventId,
            clubId,
            recipientMembershipId,
            dedupeKey,
        )
    }

    private fun insertMemberNotification(
        id: String,
        eventId: String,
        deliveryId: String,
        clubId: String,
        recipientMembershipId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into member_notifications (
              id,
              event_id,
              delivery_id,
              club_id,
              recipient_membership_id,
              event_type,
              title,
              body,
              deep_link_path
            )
            values (?, ?, ?, ?, ?, 'SESSION_REMINDER_DUE', 'Reminder', 'Body', '/clubs/test')
            """.trimIndent(),
            id,
            eventId,
            deliveryId,
            clubId,
            recipientMembershipId,
        )
    }

    private fun insertTestMailAudit(
        id: String,
        clubId: String,
        hostMembershipId: String,
        recipientEmailHash: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_test_mail_audit (
              id,
              club_id,
              host_membership_id,
              recipient_masked_email,
              recipient_email_hash,
              status
            )
            values (?, ?, ?, 'n***@example.com', ?, 'SENT')
            """.trimIndent(),
            id,
            clubId,
            hostMembershipId,
            recipientEmailHash,
        )
    }

    private fun assertKafkaNotificationTablesExist(jdbcTemplate: JdbcTemplate) {
        val tables =
            jdbcTemplate
                .queryForList(
                    """
                    select table_name
                    from information_schema.tables
                    where table_schema = database()
                      and table_name in (
                        'notification_event_outbox',
                        'notification_deliveries',
                        'member_notifications'
                      )
                    """.trimIndent(),
                    String::class.java,
                ).toSet()

        assertThat(tables).containsExactlyInAnyOrder(
            "notification_event_outbox",
            "notification_deliveries",
            "member_notifications",
        )
    }

    private fun assertKafkaNotificationForeignKeys() {
        assertEquals(
            "id,club_id",
            indexColumns("notification_event_outbox", "notification_event_outbox_id_club_uk"),
        )
        assertEquals(
            "id,event_id,club_id,recipient_membership_id",
            indexColumns("notification_deliveries", "notification_deliveries_id_context_uk"),
        )
        assertEquals(
            "event_id,club_id",
            foreignKeyColumns("notification_deliveries", "notification_deliveries_event_club_fk"),
        )
        assertEquals(
            "notification_event_outbox:id,club_id",
            foreignKeyReference("notification_deliveries", "notification_deliveries_event_club_fk"),
        )
        assertEquals(
            "delivery_id,event_id,club_id,recipient_membership_id",
            foreignKeyColumns("member_notifications", "member_notifications_delivery_context_fk"),
        )
        assertEquals(
            "notification_deliveries:id,event_id,club_id,recipient_membership_id",
            foreignKeyReference("member_notifications", "member_notifications_delivery_context_fk"),
        )
        assertEquals(
            "recipient_membership_id,created_at",
            indexColumns("member_notifications", "member_notifications_recipient_created_idx"),
        )
    }

    private fun columnValue(
        tableName: String,
        columnName: String,
        metadataColumn: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select $metadataColumn
            from information_schema.columns
            where table_schema = database()
              and table_name = ?
              and column_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            columnName,
        ) ?: error("Column $tableName.$columnName does not exist")

    companion object {
        private const val V38_AI_PROVIDER_ATTEMPT_AUDIT =
            "db/mysql/migration/V38__ai_generation_provider_attempt_audit.sql"
        private val ADD_COLUMN_NAME_REGEX = Regex("(?i)\\bADD\\s+COLUMN\\s+`?([a-z0-9_]+)`?")
    }

    private fun uniqueIndexCount(
        tableName: String,
        columnName: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.statistics
            where table_schema = database()
              and table_name = ?
              and column_name = ?
              and non_unique = 0
            """.trimIndent(),
            Int::class.java,
            tableName,
            columnName,
        ) ?: 0

    private fun indexColumns(
        tableName: String,
        indexName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by seq_in_index separator ',')
            from information_schema.statistics
            where table_schema = database()
              and table_name = ?
              and index_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            indexName,
        ) ?: error("Index $tableName.$indexName does not exist")

    private fun foreignKeyColumns(
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select group_concat(column_name order by ordinal_position separator ',')
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun foreignKeyReference(
        tableName: String,
        constraintName: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select concat(referenced_table_name, ':', group_concat(referenced_column_name order by ordinal_position separator ','))
            from information_schema.key_column_usage
            where constraint_schema = database()
              and table_name = ?
              and constraint_name = ?
            group by referenced_table_name
            """.trimIndent(),
            String::class.java,
            tableName,
            constraintName,
        ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun checkConstraintClause(constraintName: String): String =
        jdbcTemplate.queryForObject(
            """
            select check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = ?
            """.trimIndent(),
            String::class.java,
            constraintName,
        ) ?: error("Check constraint $constraintName does not exist")

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}
