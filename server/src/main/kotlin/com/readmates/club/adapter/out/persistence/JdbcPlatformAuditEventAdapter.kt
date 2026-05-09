package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.WritePlatformAuditEventPort
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcPlatformAuditEventAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : WritePlatformAuditEventPort {

    override fun writeEvent(
        actorUserId: UUID,
        actorPlatformRole: String,
        targetUserId: UUID?,
        eventType: String,
        metadataJson: String,
    ) {
        val id = UUID.randomUUID()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            actorUserId.dbString(),
            actorPlatformRole,
            targetUserId?.dbString(),
            eventType,
            metadataJson,
            java.sql.Timestamp.from(now.toInstant()),
        )
    }
}
