package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class HostSessionPublicationWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
) {
    fun upsert(
        command: UpsertPublicationCommand,
        stagingRequired: Boolean,
    ): HostPublicationResponse {
        val locked = queries.lockExposure(command.host, command.sessionId)
        if (stagingRequired && command.siteVisibility == null) {
            queries.requireLegacyPublicationWriteAllowed(command.host, command.sessionId)
        }
        val exposure = policy.publicationExposure(command, locked)
        val compatibility = policy.compatibility(exposure, locked.state)
        updateSessionExposure(command, exposure.accessScope.name, compatibility.sessionVisibility)
        upsertPublication(
            command,
            exposure.siteVisibility.name,
            compatibility.publicationVisibility,
            compatibility.isPublic,
        )
        return HostPublicationResponse(
            sessionId = command.sessionId.toString(),
            publicSummary = command.publicSummary,
            visibility = SessionRecordVisibility.valueOf(compatibility.sessionVisibility),
            accessScope = exposure.accessScope,
            siteVisibility = exposure.siteVisibility,
        )
    }

    private fun updateSessionExposure(
        command: UpsertPublicationCommand,
        accessScope: String,
        sessionVisibility: String,
    ) {
        jdbcTemplate.update(
            """
            update sessions
            set access_scope = ?,
                visibility = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
            """.trimIndent(),
            accessScope,
            sessionVisibility,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun upsertPublication(
        command: UpsertPublicationCommand,
        siteVisibility: String,
        publicationVisibility: String,
        isPublic: Boolean,
    ) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public,
              visibility, site_visibility, published_at
            )
            values (?, ?, ?, ?, ?, ?, ?, case when ? then utc_timestamp(6) else null end)
            on duplicate key update
              public_summary = values(public_summary),
              is_public = values(is_public),
              visibility = values(visibility),
              site_visibility = values(site_visibility),
              published_at = values(published_at),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            command.host.clubId.dbString(),
            command.sessionId.dbString(),
            command.publicSummary,
            isPublic,
            publicationVisibility,
            siteVisibility,
            isPublic,
        )
    }
}
