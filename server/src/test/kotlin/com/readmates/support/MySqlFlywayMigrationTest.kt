package com.readmates.support

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.UncategorizedSQLException
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
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
        assertKafkaNotificationTablesExist(jdbcTemplate)
        assertEquals("YES", columnValue("users", "password_hash", "is_nullable"))
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

        val membershipStatuses = jdbcTemplate.queryForList(
            """
            select constraint_name, check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = 'memberships_status_check'
            """.trimIndent(),
        )
        assertTrue(membershipStatuses.any { row ->
            row["CHECK_CLAUSE"].toString().contains("VIEWER") &&
                !row["CHECK_CLAUSE"].toString().contains("PENDING_APPROVAL") &&
                row["CHECK_CLAUSE"].toString().contains("SUSPENDED") &&
                row["CHECK_CLAUSE"].toString().contains("LEFT")
        })

        val participantColumns = jdbcTemplate.queryForList(
            """
            select column_name
            from information_schema.columns
            where table_schema = database()
              and table_name = 'session_participants'
              and column_name = 'participation_status'
            """.trimIndent(),
        )
        assertEquals(1, participantColumns.size)

        val checkinNoteColumns = jdbcTemplate.queryForList(
            """
            select column_name
            from information_schema.columns
            where table_schema = database()
              and table_name = 'reading_checkins'
              and column_name = 'note'
            """.trimIndent(),
        )
        assertEquals(0, checkinNoteColumns.size)

        val oneLineVisibilityConstraints = jdbcTemplate.queryForList(
            """
            select constraint_name, check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = 'one_line_reviews_visibility_check'
            """.trimIndent(),
        )
        assertTrue(oneLineVisibilityConstraints.any { row ->
            row["CHECK_CLAUSE"].toString().contains("SESSION") &&
                row["CHECK_CLAUSE"].toString().contains("PUBLIC") &&
                row["CHECK_CLAUSE"].toString().contains("PRIVATE")
        })

        val sessionVisibilityColumns = jdbcTemplate.queryForList(
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

        val sessionVisibilityConstraints = jdbcTemplate.queryForList(
            """
            select constraint_name, check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = 'sessions_visibility_check'
            """.trimIndent(),
        )
        assertTrue(sessionVisibilityConstraints.any { row ->
            val clause = row["CHECK_CLAUSE"].toString()
            clause.contains("HOST_ONLY") &&
                clause.contains("MEMBER") &&
                clause.contains("PUBLIC")
        })

        val publishedPublicSeedCount = jdbcTemplate.queryForObject(
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

        val publicSeedSessionVisibilityMismatchCount = jdbcTemplate.queryForObject(
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
        val tableCount = jdbcTemplate.queryForObject(
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

            val preferences = jdbcTemplate.queryForMap(
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

            val uppercaseHashError = assertThrows(UncategorizedSQLException::class.java) {
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
        val tables = jdbcTemplate.queryForList(
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

    private fun columnValue(
        tableName: String,
        columnName: String,
        metadataColumn: String,
    ): String = jdbcTemplate.queryForObject(
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

    private fun uniqueIndexCount(
        tableName: String,
        columnName: String,
    ): Int = jdbcTemplate.queryForObject(
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

    private fun indexColumns(tableName: String, indexName: String): String =
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
    ): String = jdbcTemplate.queryForObject(
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
    ): String = jdbcTemplate.queryForObject(
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

    private fun checkConstraintClause(constraintName: String): String = jdbcTemplate.queryForObject(
        """
        select check_clause
        from information_schema.check_constraints
        where constraint_schema = database()
          and constraint_name = ?
        """.trimIndent(),
        String::class.java,
        constraintName,
    ) ?: error("Check constraint $constraintName does not exist")

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
