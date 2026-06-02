package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.support.QueryCounter
import com.readmates.support.QueryCountingDataSourcePostProcessor
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Date
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneOffset

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class AdminAnalyticsSeriesQueryBudgetTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcAdminAnalyticsAdapter(jdbcTemplate, Clock.systemUTC())

    @AfterEach
    fun cleanupInsertedSessions() {
        jdbcTemplate.update("delete from sessions where id in (?, ?, ?)", *INSERTED_SESSION_IDS)
    }

    @Test
    fun `series query count does not scale with window size`() {
        QueryCounter.reset()
        adapter.loadAggregates(AnalyticsWindow.LAST_30D)
        val thirtyDayQueries = QueryCounter.count()

        QueryCounter.reset()
        adapter.loadAggregates(AnalyticsWindow.LAST_90D)
        val ninetyDayQueries = QueryCounter.count()

        assertThat(ninetyDayQueries)
            .describedAs("series must issue a fixed number of queries regardless of bucket count")
            .isEqualTo(thirtyDayQueries)
        assertThat(ninetyDayQueries)
            .describedAs("loadAggregates should stay a small fixed number of round trips")
            .isLessThanOrEqualTo(30)
    }

    @Test
    fun `additive series buckets partition the window without dropping or double counting`() {
        val today = LocalDate.now(ZoneOffset.UTC)
        insertSessions(today, today.minusDays(10), today.minusDays(40))

        val raw = adapter.loadAggregates(AnalyticsWindow.LAST_90D)
        val firstStart = today.minusDays(AnalyticsWindow.LAST_90D.days - 1)
        val endExclusive = today.plusDays(1)

        val totalSessions =
            jdbcTemplate.queryForObject(
                "select count(*) from sessions where session_date >= ? and session_date < ?",
                Int::class.java,
                Date.valueOf(firstStart),
                Date.valueOf(endExclusive),
            ) ?: 0

        assertThat(totalSessions).isGreaterThanOrEqualTo(3)
        assertThat(raw.series.sumOf { it.sessions }).isEqualTo(totalSessions)
    }

    private fun insertSessions(vararg dates: LocalDate) {
        dates.forEachIndexed { index, date ->
            jdbcTemplate.update(
                """
                insert into sessions (
                  id, club_id, number, title, book_title, book_author, session_date,
                  start_time, end_time, location_label, question_deadline_at, state
                )
                values (?, ?, ?, ?, ?, ?, ?, '20:00:00', '22:00:00', '온라인', ?, 'OPEN')
                """.trimIndent(),
                INSERTED_SESSION_IDS[index],
                CLUB_ID,
                9001 + index,
                "시계열 예산 테스트 ${index + 1}",
                "시계열 예산 테스트 책 ${index + 1}",
                "테스트 저자",
                Date.valueOf(date),
                java.sql.Timestamp.valueOf(date.minusDays(1).atTime(14, 59)),
            )
        }
    }

    private companion object {
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private val INSERTED_SESSION_IDS =
            arrayOf<Any>(
                "00000000-0000-0000-0000-000000009801",
                "00000000-0000-0000-0000-000000009802",
                "00000000-0000-0000-0000-000000009803",
            )
    }

    @TestConfiguration
    class QueryCountingConfig {
        @Bean
        fun queryCountingDataSourcePostProcessor(): BeanPostProcessor = QueryCountingDataSourcePostProcessor()
    }
}
