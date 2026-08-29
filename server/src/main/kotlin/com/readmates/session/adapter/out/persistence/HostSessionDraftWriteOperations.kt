package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.out.HostSessionDraftUpdateResult
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.session.application.requireHost
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.MemberVisibleSchedule
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.session.domain.SessionScheduleRevisionPolicy
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class HostSessionDraftWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
    private val queries: HostSessionWriteQueries,
    private val policy: HostSessionWritePolicy,
    private val publicProjection: HostPublicProjectionWriteOperations,
) {
    fun create(command: HostSessionCommand): CreatedSessionResponse {
        val host = command.host
        requireHost(host)
        val sessionId = UUID.randomUUID()
        val values = policy.normalizeCreate(command)
        val exposure = createExposure(command)
        queries.lockClub(host.clubId)
        val nextNumber = queries.nextSessionNumber(host.clubId)
        insertDraft(sessionId, nextNumber, command, values, exposure)
        queries.insertPublicationVersion(sessionId)
        return createdResponse(sessionId, nextNumber, command, values, exposure)
    }

    fun update(command: UpdateHostSessionCommand) =
        with(command) {
            requireHost(host)
            val before = queries.detail(host, sessionId)
            val existingSchedule = queries.existingSchedule(host, sessionId)
            val values = policy.normalizeUpdate(session, existingSchedule)
            val updated =
                updateDraft(
                    host,
                    sessionId,
                    session,
                    values,
                    if (
                        SessionScheduleRevisionPolicy.changed(
                            existingSchedule.memberVisibleSchedule(),
                            updatedMemberVisibleSchedule(session, values, existingSchedule),
                        )
                    ) {
                        1
                    } else {
                        0
                    },
                    queries.expectedRevision(expectedSessionRevision),
                )
            queries.throwIfStale(updated, host, sessionId)
            val detail = queries.detail(host, sessionId)
            HostSessionDraftUpdateResult(
                detail = detail,
                publicProjectionEffect =
                    if (before.publicBodyFingerprint() != detail.publicBodyFingerprint()) {
                        publicProjection.rotateAffectedContent(host.clubId, sessionId)
                    } else {
                        null
                    },
            )
        }

    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
        val locked = queries.lockExposure(command.host, command.sessionId)
        command.expectedExposureRevision?.let { expected ->
            if (locked.exposureRevision != expected) {
                queries.throwIfStale(0, command.host, command.sessionId)
            }
        }
        val exposure = policy.visibilityExposure(command, locked)
        val compatibility = policy.compatibility(exposure, locked.state)
        val changes =
            HostVisibilitySemanticChanges(
                access = exposure.accessScope != locked.exposure.accessScope,
                placement =
                    locked.publicationExists &&
                        exposure.siteVisibility != locked.exposure.siteVisibility,
                sessionCompatibility = compatibility.sessionVisibility != locked.sessionVisibility,
                publicationCompatibility =
                    locked.publicationExists &&
                        (
                            compatibility.publicationVisibility != locked.publicationVisibility ||
                                compatibility.isPublic != locked.publicationIsPublic
                        ),
            )
        if (changes.changed) {
            updateSessionExposure(
                command,
                exposure.accessScope.name,
                compatibility.sessionVisibility,
                changes.access,
            )
        }
        if (changes.publicationWrite) {
            updatePublicationProjection(
                command,
                exposure.siteVisibility.name,
                compatibility.publicationVisibility,
                compatibility.isPublic,
            )
        }
        if (changes.placement) bumpPublicationRevision(command)
        return HostSessionVisibilityUpdateResult(
            previousVisibility = SessionRecordVisibility.valueOf(locked.sessionVisibility),
            detail = queries.detail(command.host, command.sessionId),
            exposureChanged = changes.access,
            publicationChanged = changes.placement,
            compatibilityChanged = changes.compatibilityOnly,
            publicProjectionEffect =
                if (changes.changed) {
                    publicProjection.rotate(command.host.clubId, command.sessionId)
                } else {
                    null
                },
        )
    }

    private fun updateSessionExposure(
        command: UpdateHostSessionVisibilityCommand,
        accessScope: String,
        sessionVisibility: String,
        bumpExposureRevision: Boolean,
    ) {
        val expectedExposure = command.expectedExposureRevision
        val updated =
            if (expectedExposure == null) {
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
            } else {
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
                      and exposure_revision = ?
                    """.trimIndent(),
                    accessScope,
                    sessionVisibility,
                    if (bumpExposureRevision) 1 else 0,
                    command.sessionId.dbString(),
                    command.host.clubId.dbString(),
                    expectedExposure,
                )
            }
        queries.throwIfStale(updated, command.host, command.sessionId)
    }

    private fun updatePublicationProjection(
        command: UpdateHostSessionVisibilityCommand,
        siteVisibility: String,
        publicationVisibility: String,
        isPublic: Boolean,
    ) {
        jdbcTemplate.update(
            """
            update public_session_publications
            set site_visibility = ?,
                visibility = ?,
                is_public = ?,
                published_at = case when ? then coalesce(published_at, utc_timestamp(6)) else null end,
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
            """.trimIndent(),
            siteVisibility,
            publicationVisibility,
            isPublic,
            isPublic,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
    }

    private fun bumpPublicationRevision(command: UpdateHostSessionVisibilityCommand) {
        val bumped =
            jdbcTemplate.update(
                """
                update session_publication_versions
                set publication_revision = publication_revision + 1
                where session_id = ?
                """.trimIndent(),
                command.sessionId.dbString(),
            )
        queries.throwIfStale(bumped, command.host, command.sessionId)
    }

    private fun insertDraft(
        sessionId: UUID,
        nextNumber: Int,
        command: HostSessionCommand,
        values: NormalizedHostSessionWrite,
        exposure: SessionExposure,
    ) {
        val compatibility = policy.compatibility(exposure, "DRAFT")
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator,
              book_link, book_image_url, session_date, start_time, end_time, location_label,
              meeting_url, meeting_passcode, question_deadline_at, state, visibility, access_scope
            )
            values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            sessionId.dbString(),
            command.host.clubId.dbString(),
            nextNumber,
            command.title,
            command.bookTitle,
            command.bookAuthor,
            values.bookLink,
            values.bookImageUrl,
            values.sessionDate,
            values.startTime,
            values.endTime,
            values.locationLabel,
            values.meetingUrl,
            values.meetingPasscode,
            values.questionDeadlineAt,
            "DRAFT",
            compatibility.sessionVisibility,
            exposure.accessScope.name,
        )
    }

    private fun updateDraft(
        host: CurrentMember,
        sessionId: UUID,
        request: HostSessionCommand,
        values: NormalizedHostSessionWrite,
        scheduleRevisionDelta: Int,
        expectedRevision: Long,
    ): Int =
        jdbcTemplate.update(
            """
            update sessions
            set title = ?, book_title = ?, book_author = ?,
                book_link = case when ? then ? else book_link end,
                book_image_url = case when ? then ? else book_image_url end,
                session_date = ?, start_time = ?, end_time = ?,
                location_label = case when ? then ? else location_label end,
                meeting_url = case when ? then ? else meeting_url end,
                meeting_passcode = case when ? then ? else meeting_passcode end,
                question_deadline_at = ?,
                session_revision = session_revision + 1,
                schedule_revision = schedule_revision + ?,
                updated_at = greatest(utc_timestamp(6), timestampadd(microsecond, 1, updated_at))
            where id = ? and club_id = ? and deleted_at is null and session_revision = ?
            """.trimIndent(),
            request.title,
            request.bookTitle,
            request.bookAuthor,
            request.bookLink != null,
            values.bookLink,
            request.bookImageUrl != null,
            values.bookImageUrl,
            values.sessionDate,
            values.startTime,
            values.endTime,
            request.locationLabel != null,
            values.locationLabel,
            request.meetingUrl != null,
            values.meetingUrl,
            request.meetingPasscode != null,
            values.meetingPasscode,
            values.questionDeadlineAt,
            scheduleRevisionDelta,
            sessionId.dbString(),
            host.clubId.dbString(),
            expectedRevision,
        )

    private fun updatedMemberVisibleSchedule(
        request: HostSessionCommand,
        values: NormalizedHostSessionWrite,
        existing: ExistingHostSessionSchedule,
    ) =
        MemberVisibleSchedule(
            title = request.title,
            bookTitle = request.bookTitle,
            bookAuthor = request.bookAuthor,
            bookLink = if (request.bookLink != null) values.bookLink else existing.bookLink,
            bookImageUrl = if (request.bookImageUrl != null) values.bookImageUrl else existing.bookImageUrl,
            date = values.sessionDate,
            startTime = values.startTime,
            endTime = values.endTime,
            locationLabel = if (request.locationLabel != null) values.locationLabel else existing.locationLabel,
            meetingUrl = if (request.meetingUrl != null) values.meetingUrl else existing.meetingUrl,
            meetingPasscode = if (request.meetingPasscode != null) values.meetingPasscode else existing.meetingPasscode,
            questionDeadlineAt = values.questionDeadlineAt,
        )

    private fun createdResponse(
        sessionId: UUID,
        nextNumber: Int,
        command: HostSessionCommand,
        values: NormalizedHostSessionWrite,
        exposure: SessionExposure,
    ): CreatedSessionResponse {
        val compatibility = policy.compatibility(exposure, "DRAFT")
        return CreatedSessionResponse(
            sessionId = sessionId.toString(),
            sessionNumber = nextNumber,
            title = command.title,
            bookTitle = command.bookTitle,
            bookAuthor = command.bookAuthor,
            bookLink = values.bookLink,
            bookImageUrl = values.bookImageUrl,
            date = values.sessionDate.toString(),
            startTime = values.startTime.toString(),
            endTime = values.endTime.toString(),
            questionDeadlineAt = values.questionDeadlineAt.toUtcOffsetDateTime().toString(),
            locationLabel = values.locationLabel,
            meetingUrl = values.meetingUrl,
            meetingPasscode = values.meetingPasscode,
            state = "DRAFT",
            visibility = SessionRecordVisibility.valueOf(compatibility.sessionVisibility),
            accessScope = exposure.accessScope,
            siteVisibility = exposure.siteVisibility,
        )
    }

    private fun createExposure(command: HostSessionCommand) =
        SessionExposure(
            accessScope = command.accessScope ?: SessionAccessScope.HOST_ONLY,
            siteVisibility = PublicSiteVisibility.HIDDEN,
        )
}

private fun com.readmates.session.application.HostSessionDetailResponse.publicBodyFingerprint() =
    listOf(bookTitle, bookAuthor, bookImageUrl, date)

private data class HostVisibilitySemanticChanges(
    val access: Boolean,
    val placement: Boolean,
    val sessionCompatibility: Boolean,
    val publicationCompatibility: Boolean,
) {
    val compatibilityOnly: Boolean =
        !access && !placement && (sessionCompatibility || publicationCompatibility)
    val publicationWrite: Boolean = placement || publicationCompatibility
    val changed: Boolean = access || placement || sessionCompatibility || publicationCompatibility
}
