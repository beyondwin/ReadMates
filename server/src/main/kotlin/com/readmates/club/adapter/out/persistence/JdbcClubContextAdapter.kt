package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.ClubSlug
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.out.LoadClubContextPort
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet

@Repository
class JdbcClubContextAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadClubContextPort {
    override fun loadBySlug(slug: ClubSlug): ResolvedClubContext? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              clubs.id,
              clubs.slug,
              clubs.name,
              clubs.status,
              null as hostname
            from clubs
            where clubs.slug = ?
              and clubs.status in ('ACTIVE', 'SETUP_REQUIRED')
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toResolvedClubContext() },
            slug.value,
        ).firstOrNull()
    }

    override fun loadByHostname(hostname: String): ResolvedClubContext? {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return null
        return jdbcTemplate.query(
            """
            select
              clubs.id,
              clubs.slug,
              clubs.name,
              clubs.status,
              club_domains.hostname
            from club_domains
            join clubs on clubs.id = club_domains.club_id
            where club_domains.hostname = ?
              and club_domains.status = 'ACTIVE'
              and clubs.status in ('ACTIVE', 'SETUP_REQUIRED')
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toResolvedClubContext() },
            hostname,
        ).firstOrNull()
    }

    private fun ResultSet.toResolvedClubContext(): ResolvedClubContext =
        ResolvedClubContext(
            clubId = uuid("id"),
            slug = getString("slug"),
            name = getString("name"),
            status = getString("status"),
            hostname = getString("hostname"),
        )
}
