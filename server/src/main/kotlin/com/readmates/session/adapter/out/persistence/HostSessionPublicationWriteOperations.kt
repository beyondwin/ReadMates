package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostPublicationWriteResult
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
    ): HostPublicationWriteResult {
        val locked = queries.lockExposure(command.host, command.sessionId)
        command.expectedExposureRevision?.let { expected ->
            if (locked.exposureRevision != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
        command.expectedPublicationRevision?.let { expected ->
            if (locked.publicationRevision != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
        if (stagingRequired && command.siteVisibility == null) {
            queries.requireLegacyPublicationWriteAllowed(command.host, command.sessionId)
        }
        val exposure = policy.publicationExposure(command, locked)
        val compatibility = policy.compatibility(exposure, locked.state)
        val changes =
            HostPublicationSemanticChanges(
                access = exposure.accessScope != locked.exposure.accessScope,
                placement = exposure.siteVisibility != locked.exposure.siteVisibility,
                summary = !locked.publicationExists || command.publicSummary != locked.publicSummary,
                sessionCompatibility = compatibility.sessionVisibility != locked.sessionVisibility,
                publicationCompatibility =
                    !locked.publicationExists ||
                        compatibility.publicationVisibility != locked.publicationVisibility ||
                        compatibility.isPublic != locked.publicationIsPublic,
            )
        if (changes.changed) {
            updateSessionExposure(
                command,
                exposure.accessScope.name,
                compatibility.sessionVisibility,
                bumpExposureRevision = changes.access,
            )
        }
        if (changes.publicationWrite) {
            upsertPublication(
                command,
                exposure.siteVisibility.name,
                compatibility.publicationVisibility,
                compatibility.isPublic,
            )
        }
        bumpPublicationRevision(command, changes.publication)
        return HostPublicationWriteResult(
            response =
                HostPublicationResponse(
                    sessionId = command.sessionId.toString(),
                    publicSummary = command.publicSummary,
                    visibility = SessionRecordVisibility.valueOf(compatibility.sessionVisibility),
                    accessScope = exposure.accessScope,
                    siteVisibility = exposure.siteVisibility,
                ),
            exposureChanged = changes.access,
            publicationChanged = changes.publication,
            compatibilityChanged = changes.compatibilityOnly,
        )
    }

    private fun bumpPublicationRevision(
        command: UpsertPublicationCommand,
        publicationChanged: Boolean,
    ) {
        if (!publicationChanged) return
        val expected = command.expectedPublicationRevision
        val bumped =
            if (expected == null) {
                jdbcTemplate.update(
                    """
                    update session_publication_versions
                    set publication_revision = publication_revision + 1
                    where session_id = ?
                    """.trimIndent(),
                    command.sessionId.dbString(),
                )
            } else {
                jdbcTemplate.update(
                    """
                    update session_publication_versions
                    set publication_revision = publication_revision + 1
                    where session_id = ?
                      and publication_revision = ?
                    """.trimIndent(),
                    command.sessionId.dbString(),
                    expected,
                )
            }
        queries.throwIfStale(bumped, command.host, command.sessionId)
    }

    private fun updateSessionExposure(
        command: UpsertPublicationCommand,
        accessScope: String,
        sessionVisibility: String,
        bumpExposureRevision: Boolean,
    ) {
        jdbcTemplate.update(
            """
            update sessions
            set access_scope = ?,
                visibility = ?,
                exposure_revision = exposure_revision + ?,
                updated_at = greatest(utc_timestamp(6), timestampadd(microsecond, 1, updated_at))
            where id = ?
              and club_id = ?
              and deleted_at is null
            """.trimIndent(),
            accessScope,
            sessionVisibility,
            if (bumpExposureRevision) 1 else 0,
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

private data class HostPublicationSemanticChanges(
    val access: Boolean,
    val placement: Boolean,
    val summary: Boolean,
    val sessionCompatibility: Boolean,
    val publicationCompatibility: Boolean,
) {
    val publication: Boolean = placement || summary
    val compatibilityOnly: Boolean =
        !access && !publication && (sessionCompatibility || publicationCompatibility)
    val publicationWrite: Boolean = publication || publicationCompatibility
    val changed: Boolean = access || publication || sessionCompatibility || publicationCompatibility
}
