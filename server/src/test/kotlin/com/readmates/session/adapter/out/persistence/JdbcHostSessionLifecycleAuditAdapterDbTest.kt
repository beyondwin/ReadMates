package com.readmates.session.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.shared.observability.RequestIdFilter
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
@Sql(
    statements = [CLEANUP_LIFECYCLE_AUDIT_TEST_FIXTURES],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_LIFECYCLE_AUDIT_TEST_FIXTURES],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcHostSessionLifecycleAuditAdapterDbTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val auditAdapter: JdbcHostSessionLifecycleAuditAdapter,
) : ReadmatesMySqlIntegrationTestSupport() {
    @AfterEach
    fun clearRequestId() {
        MDC.remove(RequestIdFilter.MDC_KEY)
    }

    @Test
    fun `deleted lifecycle audit survives session deletion and stores no body or passcode fields`() {
        insertDraftSessionFixture()
        MDC.put(RequestIdFilter.MDC_KEY, REQUEST_ID)

        auditAdapter.record(
            HostSessionLifecycleAuditEntry(
                host = host(),
                sessionId = SESSION_ID,
                action = HostSessionLifecycleAction.DELETED,
                fromState = "DRAFT",
                toState = null,
                reasonCode = HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
                reasonNote = "empty session deleted",
            ),
        )

        jdbcTemplate.update("delete from sessions where id = ?", SESSION_ID.toString())

        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from sessions where id = ?",
                Int::class.java,
                SESSION_ID.toString(),
            ),
        ).isZero()
        assertDeletedAuditRow(loadDeletedAuditRow())
        assertThat(lifecycleAuditColumns()).containsExactlyInAnyOrder(
            "id",
            "club_id",
            "session_id",
            "actor_membership_id",
            "action_type",
            "from_state",
            "to_state",
            "reason_code",
            "reason_note",
            "request_id",
            "created_at",
        )
        assertThat(lifecycleAuditColumns()).noneMatch { column ->
            column.contains("passcode") ||
                column.contains("body") ||
                column.contains("payload") ||
                column.contains("recipient")
        }
    }

    private fun loadDeletedAuditRow(): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select club_id, session_id, actor_membership_id, action_type,
                   from_state, to_state, reason_code, reason_note, request_id
            from host_session_lifecycle_audit
            where session_id = ?
            """.trimIndent(),
            SESSION_ID.toString(),
        )

    private fun assertDeletedAuditRow(row: Map<String, Any?>) {
        assertThat(row["club_id"]).isEqualTo(CLUB_ID.toString())
        assertThat(row["session_id"]).isEqualTo(SESSION_ID.toString())
        assertThat(row["actor_membership_id"]).isEqualTo(HOST_MEMBERSHIP_ID.toString())
        assertThat(row["action_type"]).isEqualTo("DELETED")
        assertThat(row["from_state"]).isEqualTo("DRAFT")
        assertThat(row["to_state"]).isNull()
        assertThat(row["reason_code"]).isEqualTo("EMPTY_SESSION_DELETED")
        assertThat(row["reason_note"]).isEqualTo("empty session deleted")
        assertThat(row["request_id"]).isEqualTo(REQUEST_ID)
        assertThat(row.values.map { it?.toString().orEmpty() }).noneMatch { value ->
            value.contains("passcode", ignoreCase = true) || value.contains("meet.example")
        }
    }

    @Test
    fun `blank request id falls back to a generated correlation id`() {
        insertDraftSessionFixture()
        MDC.put(RequestIdFilter.MDC_KEY, "   ")

        auditAdapter.record(
            HostSessionLifecycleAuditEntry(
                host = host(),
                sessionId = SESSION_ID,
                action = HostSessionLifecycleAction.DELETED,
                fromState = "OPEN",
                toState = null,
                reasonCode = HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
                reasonNote = null,
            ),
        )

        val requestId =
            jdbcTemplate.queryForObject(
                "select request_id from host_session_lifecycle_audit where session_id = ?",
                String::class.java,
                SESSION_ID.toString(),
            )
        assertThat(requestId).isNotBlank()
        UUID.fromString(checkNotNull(requestId))
    }

    @Test
    fun `record returns the generated lifecycle audit id`() {
        insertDraftSessionFixture()
        MDC.put(RequestIdFilter.MDC_KEY, REQUEST_ID)

        val changeId =
            auditAdapter.record(
                HostSessionLifecycleAuditEntry(
                    host = host(),
                    sessionId = SESSION_ID,
                    action = HostSessionLifecycleAction.DELETED,
                    fromState = "DRAFT",
                    toState = null,
                    reasonCode = HostSessionLifecycleReasonCode.EMPTY_SESSION_DELETED,
                    reasonNote = null,
                ),
            )

        assertThat(changeId).isNotNull()
        val storedId =
            jdbcTemplate.queryForObject(
                "select id from host_session_lifecycle_audit where session_id = ?",
                String::class.java,
                SESSION_ID.toString(),
            )
        assertThat(storedId).isEqualTo(changeId.toString())
    }

    private fun insertDraftSessionFixture() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at,
              state, visibility, access_scope
            ) values (
              ?, ?, ?, 'Lifecycle audit fixture', 'Lifecycle fixture book', 'Example Author', '2026-08-21',
              '20:00:00', '22:00:00', '온라인', '2026-08-20 12:00:00.000000',
              'DRAFT', 'HOST_ONLY', 'HOST_ONLY'
            )
            """.trimIndent(),
            SESSION_ID.toString(),
            CLUB_ID.toString(),
            SESSION_NUMBER,
        )
    }

    private fun lifecycleAuditColumns(): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name = 'host_session_lifecycle_audit'
                """.trimIndent(),
                String::class.java,
            ).filterNotNull()
            .map { it.lowercase() }

    private fun host() =
        CurrentMember(
            userId = HOST_USER_ID,
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            email = "lifecycle-audit.host@example.invalid",
            displayName = "Lifecycle Host",
            accountName = "Lifecycle Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val SESSION_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000049001")
        const val SESSION_NUMBER = 49001
        const val REQUEST_ID = "lifecycle-req-49"
    }
}

private const val CLEANUP_LIFECYCLE_AUDIT_TEST_FIXTURES = """
    delete from host_session_lifecycle_audit where session_id = 'aaaaaaaa-0000-4000-8000-000000049001';
    delete from sessions where id = 'aaaaaaaa-0000-4000-8000-000000049001';
"""
