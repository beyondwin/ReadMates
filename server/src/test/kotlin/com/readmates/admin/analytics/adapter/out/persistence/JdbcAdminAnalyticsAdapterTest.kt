package com.readmates.admin.analytics.adapter.out.persistence

import com.readmates.admin.analytics.application.model.AnalyticsWindow
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Clock

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class JdbcAdminAnalyticsAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcAdminAnalyticsAdapter(jdbcTemplate, Clock.systemUTC())

    @Test
    fun `loads internally consistent aggregates against dev seed`() {
        val raw = adapter.loadAggregates(AnalyticsWindow.LAST_90D)

        assertThat(raw.sessionsCurrent).isGreaterThanOrEqualTo(0)
        assertThat(raw.completedSessionsCurrent).isLessThanOrEqualTo(raw.sessionsCurrent)
        assertThat(raw.goingMaybeCurrent).isLessThanOrEqualTo(raw.participantsCurrent)
        assertThat(raw.notifSentCurrent).isLessThanOrEqualTo(raw.notifTerminalCurrent)
        raw.benchmark.forEach { assertThat(it.slug).isNotBlank() }

        val monthlyRaw = adapter.loadAggregates(AnalyticsWindow.LAST_30D)
        assertThat(monthlyRaw.series).isNotEmpty
        assertThat(monthlyRaw.series).hasSizeLessThanOrEqualTo(5)
    }
}
