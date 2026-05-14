package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.ClubLifecyclePort
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcClubLifecycleAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : ClubLifecyclePort {
    override fun loadCurrentStatus(clubId: UUID): ClubStatus? =
        jdbcTemplate
            .query(
                "select status from clubs where id = ? limit 1",
                { rs, _ -> ClubStatus.valueOf(rs.getString("status")) },
                clubId.dbString(),
            ).firstOrNull()

    override fun transitionStatus(
        clubId: UUID,
        from: ClubStatus,
        to: ClubStatus,
    ): Boolean =
        jdbcTemplate.update(
            """
            update clubs
            set status = ?
            where id = ?
              and status = ?
            """.trimIndent(),
            to.name,
            clubId.dbString(),
            from.name,
        ) > 0

    override fun insertAuditEvent(
        clubId: UUID,
        actorUserId: UUID?,
        actorPlatformRole: String?,
        eventType: String,
        metadataJson: String,
    ) {
        jdbcTemplate.update(
            """
            insert into club_audit_events (
              id,
              actor_user_id,
              actor_platform_role,
              club_id,
              event_type,
              metadata_json
            ) values (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            actorUserId?.dbString(),
            actorPlatformRole,
            clubId.dbString(),
            eventType,
            metadataJson,
        )
    }
}
