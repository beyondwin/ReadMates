package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.TrustedReturnHostPort
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcTrustedReturnHostAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : TrustedReturnHostPort {
    override fun activeClubSlugForHost(host: String): String? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select clubs.slug
            from club_domains
            join clubs on clubs.id = club_domains.club_id
            where lower(hostname) = ?
              and club_domains.status = 'ACTIVE'
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("slug") },
            host.trim().lowercase(),
        ).firstOrNull()
    }
}
