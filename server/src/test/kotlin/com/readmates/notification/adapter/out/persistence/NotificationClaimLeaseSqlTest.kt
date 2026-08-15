package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Duration
import java.time.LocalDateTime

@SpringBootTest(
    properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"],
)
@Tag("integration")
class NotificationClaimLeaseSqlTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `maximum claim lease has a non-null cutoff with deterministic inclusive expiry`() {
        val worker =
            NotificationRuntimeProperties.Worker(
                claimLease = Duration.ofHours(24),
                eventMaxAge = Duration.ofHours(25),
                deliveryMaxAge = Duration.ofHours(25),
            )
        val databaseAnchor =
            requireNotNull(
                jdbcTemplate.queryForObject("select utc_timestamp(6)", LocalDateTime::class.java),
            )
        val databaseCutoff =
            jdbcTemplate.queryForObject(
                "select timestampadd(MICROSECOND, ?, cast(? as datetime(6)))",
                LocalDateTime::class.java,
                -worker.claimLeaseMicroseconds,
                databaseAnchor,
            )
        val fixedAnchorPredicate =
            NOTIFICATION_CLAIM_LEASE_EXPIRED_PREDICATE.replace(
                NOTIFICATION_DATABASE_UTC_NOW_EXPRESSION,
                "cast(? as datetime(6))",
            )

        val expiredStates =
            jdbcTemplate.queryForList(
                """
                with lease_cutoff as (
                    select timestampadd(MICROSECOND, ?, cast(? as datetime(6))) as cutoff
                ), lease_boundaries as (
                    select 'inside' as lease_state, timestampadd(MICROSECOND, 1, cutoff) as locked_at
                    from lease_cutoff
                    union all
                    select 'equality', cutoff from lease_cutoff
                    union all
                    select 'outside', timestampadd(MICROSECOND, -1, cutoff) from lease_cutoff
                )
                select lease_state
                from lease_boundaries
                where $fixedAnchorPredicate
                order by lease_state
                """.trimIndent(),
                String::class.java,
                -worker.claimLeaseMicroseconds,
                databaseAnchor,
                -worker.claimLeaseMicroseconds,
                databaseAnchor,
            )

        assertThat(databaseCutoff).isNotNull.isEqualTo(databaseAnchor.minusHours(24))
        assertThat(expiredStates).containsExactly("equality", "outside")
    }
}
