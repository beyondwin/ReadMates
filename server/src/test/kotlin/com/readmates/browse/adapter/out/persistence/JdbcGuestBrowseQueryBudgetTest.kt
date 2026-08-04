package com.readmates.browse.adapter.out.persistence

import com.readmates.support.QueryCounter
import com.readmates.support.QueryCountingDataSourcePostProcessor
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class JdbcGuestBrowseQueryBudgetTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val sessionAdapter: JdbcGuestSessionBrowseAdapter,
    @param:Autowired private val recordAdapter: JdbcGuestRecordBrowseAdapter,
) : ReadmatesMySqlIntegrationTestSupport() {
    @BeforeEach
    fun seedSmallFixture() {
        cleanupFixture()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, '쿼리 예산 클럽', '쿼리 예산', '게스트 쿼리 예산 테스트', 'ACTIVE', 'PUBLIC')
            """.trimIndent(),
            CLUB_ID,
            CLUB_SLUG,
        )
        seedMembers(0..0)
        insertSession(CURRENT_SESSION_ID, 900, "OPEN")
        insertSession(ARCHIVE_SESSION_ID, 899, "PUBLISHED")
        seedContent(0..0)
    }

    @AfterEach
    fun cleanupFixture() {
        jdbcTemplate.update("delete from public_session_publications where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from highlights where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from long_reviews where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from one_line_reviews where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from questions where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from session_participants where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from sessions where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from memberships where club_id = ?", CLUB_ID)
        jdbcTemplate.update("delete from users where email like 'guest-budget-%@example.test'")
        jdbcTemplate.update("delete from clubs where id = ?", CLUB_ID)
    }

    @Test
    fun `current and detail query counts stay fixed and response collections stay bounded`() {
        val smallCurrent = measured { sessionAdapter.loadCurrentSession(CLUB_SLUG) }
        val smallDetail = measured { recordAdapter.loadArchiveDetail(CLUB_SLUG, ARCHIVE_SESSION_ID) }

        seedMembers(1..100)
        seedContent(1..100)

        val largeCurrent = measured { sessionAdapter.loadCurrentSession(CLUB_SLUG) }
        val largeDetail = measured { recordAdapter.loadArchiveDetail(CLUB_SLUG, ARCHIVE_SESSION_ID) }

        assertThat(smallCurrent.queryCount).isEqualTo(4)
        assertThat(largeCurrent.queryCount).isEqualTo(smallCurrent.queryCount)
        assertThat(largeCurrent.value!!.attendees).hasSizeLessThanOrEqualTo(MAX_DETAIL_ITEMS)
        assertThat(largeCurrent.value.questions).hasSizeLessThanOrEqualTo(MAX_DETAIL_ITEMS)
        assertThat(largeCurrent.value.longReviews).hasSizeLessThanOrEqualTo(MAX_DETAIL_ITEMS)

        assertThat(smallDetail.queryCount).isEqualTo(5)
        assertThat(largeDetail.queryCount).isEqualTo(smallDetail.queryCount)
        assertThat(largeDetail.value!!.questions).hasSize(MAX_DETAIL_ITEMS)
        assertThat(largeDetail.value.longReviews).hasSize(MAX_DETAIL_ITEMS)
    }

    @Test
    fun `guest note and archive lists use one query independent of fixture size`() {
        val smallNoteSessions = measured { recordAdapter.loadNoteSessions(CLUB_SLUG, null, 21) }
        val smallFeed = measured { recordAdapter.loadNotesFeed(CLUB_SLUG, null, null, 51) }
        val smallArchive = measured { recordAdapter.loadArchiveSessions(CLUB_SLUG, null, 21) }

        (1..40).forEach { index ->
            insertSession(listSessionId(index), 899 - index, "PUBLISHED")
        }
        seedMembers(1..100)
        seedContent(1..100)

        val largeNoteSessions = measured { recordAdapter.loadNoteSessions(CLUB_SLUG, null, 21) }
        val largeFeed = measured { recordAdapter.loadNotesFeed(CLUB_SLUG, null, null, 51) }
        val largeArchive = measured { recordAdapter.loadArchiveSessions(CLUB_SLUG, null, 21) }

        listOf(smallNoteSessions.queryCount, smallFeed.queryCount, smallArchive.queryCount).forEach {
            assertThat(it).isEqualTo(1)
        }
        assertThat(largeNoteSessions.queryCount).isEqualTo(smallNoteSessions.queryCount)
        assertThat(largeFeed.queryCount).isEqualTo(smallFeed.queryCount)
        assertThat(largeArchive.queryCount).isEqualTo(smallArchive.queryCount)
        assertThat(largeNoteSessions.value).hasSize(21)
        assertThat(largeFeed.value).hasSize(51)
        assertThat(largeArchive.value).hasSize(21)
    }

    private fun seedMembers(range: IntRange) {
        range.forEach { index ->
            jdbcTemplate.update(
                "insert into users (id, email, name, short_name, auth_provider) values (?, ?, ?, ?, 'GOOGLE')",
                userId(index),
                "guest-budget-$index@example.test",
                "예산 사용자 $index",
                "예산 $index",
            )
            jdbcTemplate.update(
                """
                insert into memberships (id, club_id, user_id, role, status, short_name, avatar_key)
                values (?, ?, ?, 'MEMBER', 'ACTIVE', ?, 'globe-notebook')
                """.trimIndent(),
                membershipId(index),
                CLUB_ID,
                userId(index),
                "예산 $index",
            )
        }
    }

    private fun seedContent(range: IntRange) {
        range.forEach { index ->
            listOf(CURRENT_SESSION_ID, ARCHIVE_SESSION_ID).forEachIndexed { sessionIndex, sessionId ->
                jdbcTemplate.update(
                    """
                    insert into session_participants (
                      id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
                    ) values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
                    """.trimIndent(),
                    participantId(index, sessionIndex),
                    CLUB_ID,
                    sessionId,
                    membershipId(index),
                )
                jdbcTemplate.update(
                    """
                    insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
                    values (?, ?, ?, ?, 1, ?, ?)
                    """.trimIndent(),
                    questionId(index, sessionIndex),
                    CLUB_ID,
                    sessionId,
                    membershipId(index),
                    "예산 질문 $index-$sessionIndex",
                    "예산 초안 $index-$sessionIndex",
                )
                jdbcTemplate.update(
                    """
                    insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
                    values (?, ?, ?, ?, ?, 'PUBLIC')
                    """.trimIndent(),
                    longReviewId(index, sessionIndex),
                    CLUB_ID,
                    sessionId,
                    membershipId(index),
                    "예산 공개 서평 $index-$sessionIndex",
                )
            }
        }
    }

    private fun insertSession(
        sessionId: String,
        number: Int,
        state: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
            ) values (?, ?, ?, ?, ?, '예산 저자', '2026-08-20',
                      '19:00:00', '21:00:00', '비공개 장소', '2026-08-19 18:00:00', ?, ?, 'GUEST_READABLE')
            """.trimIndent(),
            sessionId,
            CLUB_ID,
            number,
            "예산 $number 회차",
            "예산 책 $number",
            state,
            if (state == "PUBLISHED") "PUBLIC" else "MEMBER",
        )
    }

    private fun <T> measured(block: () -> T): Measurement<T> {
        QueryCounter.reset()
        val value = block()
        return Measurement(QueryCounter.count(), value)
    }

    private data class Measurement<T>(
        val queryCount: Int,
        val value: T,
    )

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000007800"
        const val CLUB_SLUG = "guest-budget"
        const val CURRENT_SESSION_ID = "00000000-0000-0000-0000-000000007801"
        const val ARCHIVE_SESSION_ID = "00000000-0000-0000-0000-000000007802"
        const val MAX_DETAIL_ITEMS = 100

        fun userId(index: Int) = "00000000-0000-0000-0001-${index.toString().padStart(12, '0')}"

        fun membershipId(index: Int) = "00000000-0000-0000-0002-${index.toString().padStart(12, '0')}"

        fun participantId(
            index: Int,
            session: Int,
        ) = "00000000-0000-0000-0003-${(index * 2 + session).toString().padStart(12, '0')}"

        fun questionId(
            index: Int,
            session: Int,
        ) = "00000000-0000-0000-0004-${(index * 2 + session).toString().padStart(12, '0')}"

        fun longReviewId(
            index: Int,
            session: Int,
        ) = "00000000-0000-0000-0005-${(index * 2 + session).toString().padStart(12, '0')}"

        fun listSessionId(index: Int) = "00000000-0000-0000-0006-${index.toString().padStart(12, '0')}"
    }

    @TestConfiguration
    class QueryCountingConfig {
        @Bean
        fun queryCountingDataSourcePostProcessor(): BeanPostProcessor = QueryCountingDataSourcePostProcessor()
    }
}
