package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.port.out.CreateClubDomainPort
import com.readmates.club.application.port.out.LoadClubDomainProvisioningPort
import com.readmates.club.application.port.out.LoadPlatformAdminSummaryPort
import com.readmates.club.application.port.out.UpdateClubDomainProvisioningPort
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcPlatformAdminAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadPlatformAdminSummaryPort,
    CreateClubDomainPort,
    LoadClubDomainProvisioningPort,
    UpdateClubDomainProvisioningPort {
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

    override fun listDomains(limit: Int): List<PlatformAdminClubDomain> =
        jdbcTemplateProvider.ifAvailable?.query(
            """
            select id, club_id, hostname, kind, status, is_primary, verified_at, last_checked_at, provisioning_error_code
            from club_domains
            order by updated_at desc, created_at desc
            limit ?
            """.trimIndent(),
            ::mapDomain,
            limit.coerceIn(1, 100),
        ) ?: emptyList()

    override fun listDomainsRequiringAction(limit: Int): List<PlatformAdminClubDomain> =
        jdbcTemplateProvider.ifAvailable?.query(
            """
            select id, club_id, hostname, kind, status, is_primary, verified_at, last_checked_at, provisioning_error_code
            from club_domains
            where status = 'ACTION_REQUIRED'
            order by updated_at desc, created_at desc
            limit ?
            """.trimIndent(),
            ::mapDomain,
            limit.coerceIn(1, 100),
        ) ?: emptyList()

    @Transactional
    override fun createClubDomain(
        clubId: UUID,
        hostname: String,
        kind: ClubDomainKind,
        @Suppress("UNUSED_PARAMETER") isPrimary: Boolean,
    ): PlatformAdminClubDomain {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Platform admin storage is unavailable")

        val clubExists = jdbcTemplate.queryForObject(
            "select count(*) from clubs where id = ?",
            Long::class.java,
            clubId.dbString(),
        ) ?: 0
        if (clubExists == 0L) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found")
        }

        val domainId = UUID.randomUUID()
        val primary = false

        try {
            jdbcTemplate.update(
                """
                insert into club_domains (id, club_id, hostname, kind, status, is_primary)
                values (?, ?, ?, ?, 'ACTION_REQUIRED', ?)
                """.trimIndent(),
                domainId.dbString(),
                clubId.dbString(),
                hostname,
                kind.name,
                primary,
            )
        } catch (_: DuplicateKeyException) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Club domain hostname already exists")
        }

        return PlatformAdminClubDomain(
            id = domainId,
            clubId = clubId,
            hostname = hostname,
            kind = kind,
            status = ClubDomainStatus.ACTION_REQUIRED,
            isPrimary = primary,
            verifiedAt = null,
            lastCheckedAt = null,
            errorCode = null,
        )
    }

    override fun loadClubDomain(domainId: UUID): PlatformAdminClubDomain? =
        jdbcTemplateProvider.ifAvailable?.query(
            """
            select id, club_id, hostname, kind, status, is_primary, verified_at, last_checked_at, provisioning_error_code
            from club_domains
            where id = ?
            limit 1
            """.trimIndent(),
            ::mapDomain,
            domainId.dbString(),
        )?.firstOrNull()

    @Transactional
    override fun updateClubDomainProvisioning(
        domainId: UUID,
        status: ClubDomainStatus,
        verifiedAt: OffsetDateTime?,
        lastCheckedAt: OffsetDateTime,
        errorCode: String?,
    ): PlatformAdminClubDomain {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Platform admin storage is unavailable")

        val updatedRows = jdbcTemplate.update(
            """
            update club_domains
            set status = ?,
                verified_at = ?,
                last_checked_at = ?,
                provisioning_error_code = ?
            where id = ?
            """.trimIndent(),
            status.name,
            verifiedAt?.toTimestamp(),
            lastCheckedAt.toTimestamp(),
            errorCode,
            domainId.dbString(),
        )
        if (updatedRows == 0) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club domain not found")
        }

        return loadClubDomain(domainId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Club domain not found")
    }

    private fun mapDomain(resultSet: ResultSet, @Suppress("UNUSED_PARAMETER") rowNumber: Int): PlatformAdminClubDomain =
        PlatformAdminClubDomain(
            id = resultSet.uuid("id"),
            clubId = resultSet.uuid("club_id"),
            hostname = resultSet.getString("hostname"),
            kind = ClubDomainKind.valueOf(resultSet.getString("kind")),
            status = ClubDomainStatus.valueOf(resultSet.getString("status")),
            isPrimary = resultSet.getBoolean("is_primary"),
            verifiedAt = resultSet.utcOffsetDateTimeOrNull("verified_at"),
            lastCheckedAt = resultSet.utcOffsetDateTimeOrNull("last_checked_at"),
            errorCode = resultSet.getString("provisioning_error_code"),
        )
}

private fun OffsetDateTime.toTimestamp(): Timestamp = Timestamp.from(toInstant())
