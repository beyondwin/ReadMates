package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.session.application.requireHost
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
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
        return createdResponse(sessionId, nextNumber, command, values, exposure)
    }

    fun update(command: UpdateHostSessionCommand) =
        with(command) {
            requireHost(host)
            val values = policy.normalizeUpdate(session, queries.existingSchedule(host, sessionId))
            val updated = updateDraft(host, sessionId, session, values)
            if (updated == 0) throw HostSessionNotFoundException()
            queries.detail(host, sessionId)
        }

    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
        val locked = queries.lockExposure(command.host, command.sessionId)
        val exposure = policy.visibilityExposure(command, locked)
        val compatibility = policy.compatibility(exposure, locked.state)
        jdbcTemplate.update(
            """
            update sessions
            set access_scope = ?,
                visibility = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
            """.trimIndent(),
            exposure.accessScope.name,
            compatibility.sessionVisibility,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
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
            exposure.siteVisibility.name,
            compatibility.publicationVisibility,
            compatibility.isPublic,
            compatibility.isPublic,
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
        return HostSessionVisibilityUpdateResult(
            previousVisibility = SessionRecordVisibility.valueOf(locked.sessionVisibility),
            detail = queries.detail(command.host, command.sessionId),
        )
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
                question_deadline_at = ?, updated_at = utc_timestamp(6)
            where id = ? and club_id = ?
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
            sessionId.dbString(),
            host.clubId.dbString(),
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
