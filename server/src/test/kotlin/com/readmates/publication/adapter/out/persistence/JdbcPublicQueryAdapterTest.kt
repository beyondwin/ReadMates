package com.readmates.publication.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.spy
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.test.context.jdbc.Sql

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcPublicQueryAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `publicStats issues exactly one consolidated queryForObject call`() {
        val spy = spy(jdbcTemplate)
        val adapter = JdbcPublicQueryAdapter(spy)

        val result = adapter.loadClub("reading-sai")

        // behavioural correctness — seed data has 6 published PUBLIC sessions (6 distinct books)
        assertThat(result).isNotNull()
        assertThat(result!!.stats.sessions).isEqualTo(6)
        assertThat(result.stats.books).isEqualTo(6)
        assertThat(result.stats.members).isGreaterThan(0)

        // structural: publicStats must use exactly one queryForObject(sql, RowMapper, ...) call
        // The overload queryForObject(String, RowMapper<T>, vararg Any) is the consolidated path.
        // Old implementation used the queryForObject(String, Class<T>, vararg Any) overload 3 times.
        val allQueryForObjectCalls =
            mockingDetails(spy)
                .invocations
                .filter { inv -> inv.method.name == "queryForObject" }
        val classOverloadCalls = allQueryForObjectCalls.filter { inv -> inv.arguments.getOrNull(1) is Class<*> }
        val rowMapperOverloadCalls = allQueryForObjectCalls.filter { inv -> inv.arguments.getOrNull(1) is RowMapper<*> }

        assertThat(classOverloadCalls)
            .withFailMessage(
                "publicStats must not use the queryForObject(sql, Class<T>, ...) overload — " +
                    "old impl used it 3 times; after consolidation it must be 0. Found: ${classOverloadCalls.size}",
            ).isEmpty()
        assertThat(rowMapperOverloadCalls)
            .withFailMessage(
                "publicStats must use exactly 1 consolidated queryForObject(sql, RowMapper, ...) call. " +
                    "Found: ${rowMapperOverloadCalls.size}",
            ).hasSize(1)
    }

    // -----------------------------------------------------------------------
    // publicSessions() count baseline tests (task_3)
    // These tests lock the CURRENT EXISTS-based behavior before the rewrite.
    // They must pass on both the old and new implementation.
    // -----------------------------------------------------------------------

    @Test
    fun `publicSessions baseline - session 6 returns 3 highlights and 3 one-liners from seed`() {
        // Seed data for session 6: member5, member2, host each contributed one highlight (3 total).
        // session_participants for session 6 has all three as ACTIVE.
        // one_line_reviews for session 6: host, member5, member2 — all PUBLIC and all ACTIVE.
        val adapter = JdbcPublicQueryAdapter(jdbcTemplate)

        val result = adapter.loadClub("reading-sai")

        assertThat(result).isNotNull()
        val session6 = result!!.recentSessions.firstOrNull { it.sessionNumber == 6 }
        assertThat(session6)
            .withFailMessage("Session 6 must appear in recentSessions")
            .isNotNull()
        assertThat(session6!!.highlightCount)
            .withFailMessage("Session 6 must have 3 highlights (all from ACTIVE participants)")
            .isEqualTo(3)
        assertThat(session6.oneLinerCount)
            .withFailMessage("Session 6 must have 3 one-liners (all PUBLIC, all from ACTIVE participants)")
            .isEqualTo(3)
    }

    @Test
    @Sql(
        statements = [MARK_MEMBER2_SESSION_SIX_REMOVED_SQL],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [RESET_MEMBER2_SESSION_SIX_ACTIVE_SQL],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `publicSessions - REMOVED participant highlight and one-liner not counted`() {
        // member2 has one highlight and one one-liner in session 6.
        // After marking participation_status = REMOVED, both counts must drop from 3 to 2.
        val adapter = JdbcPublicQueryAdapter(jdbcTemplate)

        val result = adapter.loadClub("reading-sai")

        assertThat(result).isNotNull()
        val session6 = result!!.recentSessions.firstOrNull { it.sessionNumber == 6 }
        assertThat(session6).isNotNull()
        assertThat(session6!!.highlightCount)
            .withFailMessage(
                "Highlight from REMOVED participant must not be counted: expected 2, " +
                    "got ${session6.highlightCount}",
            ).isEqualTo(2)
        assertThat(session6.oneLinerCount)
            .withFailMessage(
                "One-liner from REMOVED participant must not be counted: expected 2, " +
                    "got ${session6.oneLinerCount}",
            ).isEqualTo(2)
    }

    @Test
    @Sql(
        statements = [INSERT_NULL_MEMBERSHIP_HIGHLIGHT_SQL],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [DELETE_NULL_MEMBERSHIP_HIGHLIGHT_SQL],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `publicSessions - NULL membership_id highlight counted regardless of participation`() {
        // A highlight with membership_id IS NULL (system/host-curated) must always be counted.
        // Inserting one such row for session 6 should raise highlight_count from 3 to 4.
        val adapter = JdbcPublicQueryAdapter(jdbcTemplate)

        val result = adapter.loadClub("reading-sai")

        assertThat(result).isNotNull()
        val session6 = result!!.recentSessions.firstOrNull { it.sessionNumber == 6 }
        assertThat(session6).isNotNull()
        assertThat(session6!!.highlightCount)
            .withFailMessage(
                "NULL membership_id highlight must be counted unconditionally: expected 4, " +
                    "got ${session6.highlightCount}",
            ).isEqualTo(4)
        // one-liner count must be unaffected
        assertThat(session6.oneLinerCount)
            .withFailMessage("One-liner count must remain 3 when only a NULL-membership highlight is added")
            .isEqualTo(3)
    }

    companion object {
        private const val MARK_MEMBER2_SESSION_SIX_REMOVED_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'REMOVED',
                session_participants.attendance_status = 'ATTENDED'
            where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member2@example.com';
        """

        private const val RESET_MEMBER2_SESSION_SIX_ACTIVE_SQL = """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'ACTIVE',
                session_participants.attendance_status = 'ATTENDED'
            where session_participants.club_id = '00000000-0000-0000-0000-000000000001'
              and session_participants.session_id = '00000000-0000-0000-0000-000000000306'
              and users.email = 'member2@example.com';
        """

        // A NULL-membership_id highlight for session 6 — must always be counted in highlight_count.
        private const val INSERT_NULL_MEMBERSHIP_HIGHLIGHT_SQL = """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
            values (
              '00000000-0000-0000-ffff-000000000001',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000306',
              null,
              '시스템 큐레이션 하이라이트',
              99
            );
        """

        private const val DELETE_NULL_MEMBERSHIP_HIGHLIGHT_SQL = """
            delete from highlights
            where id = '00000000-0000-0000-ffff-000000000001';
        """
    }
}
