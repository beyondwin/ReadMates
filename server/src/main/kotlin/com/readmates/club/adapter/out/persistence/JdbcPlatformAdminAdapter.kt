package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.LoadPlatformAdminSummaryPort
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcPlatformAdminAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadPlatformAdminSummaryPort {
    override fun countActiveClubs(): Long =
        jdbcTemplateProvider.ifAvailable?.queryForObject(
            "select count(*) from clubs where status = 'ACTIVE'",
            Long::class.java,
        ) ?: 0

    override fun countDomainsRequiringAction(): Long =
        jdbcTemplateProvider.ifAvailable?.queryForObject(
            "select count(*) from club_domains where status = 'ACTION_REQUIRED'",
            Long::class.java,
        ) ?: 0
}
