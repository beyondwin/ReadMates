package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostAttendanceResponse
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidSessionExposureException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilityUpdateResult
import com.readmates.session.application.requireHost
import com.readmates.session.domain.CompatibilityExposure
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.session.domain.toCompatibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.toUtcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val DEFAULT_START_TIME = "20:00"
private const val DEFAULT_END_TIME = "22:00"

@Suppress("LargeClass")
internal class HostSessionWriteOperations(
    private val queries: HostSessionQueries,
) {
    fun createDraftSession(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
        request: HostSessionCommand,
    ): CreatedSessionResponse {
        requireHost(host)

        val sessionId = UUID.randomUUID()
        val sessionDate = LocalDate.parse(request.date)
        val startTime = parseSessionTime(request.startTime ?: DEFAULT_START_TIME)
        val endTime = parseSessionTime(request.endTime ?: DEFAULT_END_TIME)
        val questionDeadlineAt = deadlineOrDefault(request, sessionDate)
        val bookLink = blankToNull(request.bookLink)
        val bookImageUrl = blankToNull(request.bookImageUrl)
        val locationLabel = locationLabelOrDefault(request.locationLabel)
        val meetingUrl = blankToNull(request.meetingUrl)
        val meetingPasscode = blankToNull(request.meetingPasscode)
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            host.clubId.dbString(),
        )

        val nextNumber =
            jdbcTemplate.queryForObject(
                """
                select coalesce(max(number), 0) + 1
                from sessions
                where club_id = ?
                """.trimIndent(),
                Int::class.java,
                host.clubId.dbString(),
            ) ?: 1
        val state = "DRAFT"
        val visibility = SessionRecordVisibility.HOST_ONLY

        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state,
              visibility,
              access_scope
            )
            values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            sessionId.dbString(),
            host.clubId.dbString(),
            nextNumber,
            request.title,
            request.bookTitle,
            request.bookAuthor,
            bookLink,
            bookImageUrl,
            sessionDate,
            startTime,
            endTime,
            locationLabel,
            meetingUrl,
            meetingPasscode,
            questionDeadlineAt,
            state,
            visibility.name,
            SessionAccessScope.HOST_ONLY.name,
        )

        return CreatedSessionResponse(
            sessionId = sessionId.toString(),
            sessionNumber = nextNumber,
            title = request.title,
            bookTitle = request.bookTitle,
            bookAuthor = request.bookAuthor,
            bookLink = bookLink,
            bookImageUrl = bookImageUrl,
            date = sessionDate.toString(),
            startTime = startTime.toString(),
            endTime = endTime.toString(),
            questionDeadlineAt = questionDeadlineAt.toUtcOffsetDateTime().toString(),
            locationLabel = locationLabel,
            meetingUrl = meetingUrl,
            meetingPasscode = meetingPasscode,
            state = state,
            visibility = visibility,
            accessScope = SessionAccessScope.HOST_ONLY,
            siteVisibility = PublicSiteVisibility.HIDDEN,
        )
    }

    fun updateHostSession(
        jdbcTemplate: JdbcTemplate,
        member: CurrentMember,
        sessionId: UUID,
        request: HostSessionCommand,
    ): HostSessionDetailResponse {
        requireHost(member)
        val sessionDate = LocalDate.parse(request.date)
        val existingSchedule = queries.findExistingSchedule(jdbcTemplate, member, sessionId)
        val startTime = request.startTime?.let { parseSessionTime(it) } ?: existingSchedule.startTime
        val endTime = request.endTime?.let { parseSessionTime(it) } ?: existingSchedule.endTime
        if (!endTime.isAfter(startTime)) {
            throw InvalidSessionScheduleException()
        }
        val questionDeadlineAt =
            when (request.questionDeadlineAt) {
                null -> existingSchedule.questionDeadlineAt
                else -> deadlineOrDefault(request, sessionDate)
            }
        val shouldUpdateBookLink = request.bookLink != null
        val shouldUpdateBookImageUrl = request.bookImageUrl != null
        val shouldUpdateLocationLabel = request.locationLabel != null
        val shouldUpdateMeetingUrl = request.meetingUrl != null
        val shouldUpdateMeetingPasscode = request.meetingPasscode != null
        val bookLink = request.bookLink?.let { blankToNull(it) }
        val bookImageUrl = request.bookImageUrl?.let { blankToNull(it) }
        val locationLabel = request.locationLabel?.let { locationLabelOrDefault(it) }
        val meetingUrl = request.meetingUrl?.let { blankToNull(it) }
        val meetingPasscode = request.meetingPasscode?.let { blankToNull(it) }
        val updated =
            jdbcTemplate.update(
                """
                update sessions
                set title = ?,
                    book_title = ?,
                    book_author = ?,
                    book_link = case when ? then ? else book_link end,
                    book_image_url = case when ? then ? else book_image_url end,
                    session_date = ?,
                    start_time = ?,
                    end_time = ?,
                    location_label = case when ? then ? else location_label end,
                    meeting_url = case when ? then ? else meeting_url end,
                    meeting_passcode = case when ? then ? else meeting_passcode end,
                    question_deadline_at = ?,
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                """.trimIndent(),
                request.title,
                request.bookTitle,
                request.bookAuthor,
                shouldUpdateBookLink,
                bookLink,
                shouldUpdateBookImageUrl,
                bookImageUrl,
                sessionDate,
                startTime,
                endTime,
                shouldUpdateLocationLabel,
                locationLabel,
                shouldUpdateMeetingUrl,
                meetingUrl,
                shouldUpdateMeetingPasscode,
                meetingPasscode,
                questionDeadlineAt,
                sessionId.dbString(),
                member.clubId.dbString(),
            )
        if (updated == 0) {
            throw HostSessionNotFoundException()
        }

        return queries.findHostSessionAfterHostCheck(jdbcTemplate, member, sessionId)
    }

    fun confirmHostAttendance(
        jdbcTemplate: JdbcTemplate,
        command: ConfirmAttendanceCommand,
    ): HostAttendanceResponse {
        queries.requireHostSession(jdbcTemplate, command.host, command.sessionId)
        val entries =
            command.entries.map { entry ->
                parseMembershipId(entry.membershipId) to entry.attendanceStatus
            }
        val updated =
            jdbcTemplate.batchUpdate(
                """
                update session_participants
                set attendance_status = ?,
                    updated_at = utc_timestamp(6)
                where session_id = ?
                  and club_id = ?
                  and membership_id = ?
                  and participation_status = 'ACTIVE'
                """.trimIndent(),
                object : BatchPreparedStatementSetter {
                    override fun setValues(
                        ps: PreparedStatement,
                        i: Int,
                    ) {
                        val (membershipId, attendanceStatus) = entries[i]
                        ps.setString(1, attendanceStatus)
                        ps.setString(2, command.sessionId.dbString())
                        ps.setString(3, command.host.clubId.dbString())
                        ps.setString(4, membershipId.dbString())
                    }

                    override fun getBatchSize(): Int = entries.size
                },
            )
        if (updated.any { it == 0 }) {
            throw HostSessionParticipantNotFoundException()
        }

        return HostAttendanceResponse(
            sessionId = command.sessionId.toString(),
            count = command.entries.size,
        )
    }

    @Suppress("LongMethod")
    fun upsertHostPublication(
        jdbcTemplate: JdbcTemplate,
        command: UpsertPublicationCommand,
        stagingRequired: Boolean,
    ): HostPublicationResponse {
        val locked = lockExposure(jdbcTemplate, command.host, command.sessionId)
        if (stagingRequired && command.siteVisibility == null) {
            requireLegacyPublicationWriteAllowed(jdbcTemplate, command)
        }
        val exposure =
            when {
                command.siteVisibility != null -> locked.exposure.copy(siteVisibility = command.siteVisibility)
                else ->
                    SessionExposure.fromCompatibility(
                        locked.state,
                        command.visibility.name,
                        command.visibility.name,
                        command.visibility == SessionRecordVisibility.PUBLIC,
                    )
            }
        val compatibility =
            if (command.siteVisibility == null) {
                legacyCompatibility(command.visibility)
            } else {
                compatibilityOrInvalid(exposure, locked.state)
            }
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
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              site_visibility,
              published_at
            )
            values (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              case when ? then utc_timestamp(6) else null end
            )
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
            compatibility.isPublic,
            compatibility.publicationVisibility,
            exposure.siteVisibility.name,
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

    private fun requireLegacyPublicationWriteAllowed(
        jdbcTemplate: JdbcTemplate,
        command: UpsertPublicationCommand,
    ) {
        val state =
            jdbcTemplate.queryForObject(
                """
                select state
                from sessions
                where id = ? and club_id = ?
                for update
                """.trimIndent(),
                String::class.java,
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            ) ?: throw HostSessionNotFoundException()
        if (state == "CLOSED" || state == "PUBLISHED") {
            throw HostSessionRecordStagingRequiredException()
        }
    }

    fun updateVisibility(
        jdbcTemplate: JdbcTemplate,
        command: com.readmates.session.application.model.UpdateHostSessionVisibilityCommand,
    ): HostSessionVisibilityUpdateResult {
        val locked = lockExposure(jdbcTemplate, command.host, command.sessionId)
        val exposure =
            when {
                command.accessScope != null -> locked.exposure.copy(accessScope = command.accessScope)
                else ->
                    SessionExposure.fromCompatibility(
                        locked.state,
                        command.visibility.name,
                        command.visibility.name,
                        command.visibility == SessionRecordVisibility.PUBLIC,
                    )
            }
        val compatibility =
            if (command.accessScope == null) {
                legacyCompatibility(command.visibility)
            } else {
                compatibilityOrInvalid(exposure, locked.state)
            }
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
            detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
        )
    }

    private fun lockExposure(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
        sessionId: UUID,
    ): LockedExposure =
        jdbcTemplate
            .query(
                """
                select sessions.state,
                       sessions.visibility as session_visibility,
                       sessions.access_scope,
                       public_session_publications.visibility as publication_visibility,
                       public_session_publications.site_visibility,
                       public_session_publications.is_public
                from sessions
                left join public_session_publications
                  on public_session_publications.club_id = sessions.club_id
                 and public_session_publications.session_id = sessions.id
                where sessions.id = ?
                  and sessions.club_id = ?
                for update
                """.trimIndent(),
                { rs, _ ->
                    LockedExposure(
                        state = rs.getString("state"),
                        sessionVisibility = rs.getString("session_visibility"),
                        exposure =
                            SessionExposure(
                                accessScope = SessionAccessScope.valueOf(rs.getString("access_scope")),
                                siteVisibility =
                                    rs
                                        .getString("site_visibility")
                                        ?.let(PublicSiteVisibility::valueOf)
                                        ?: PublicSiteVisibility.HIDDEN,
                            ),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()

    private fun compatibilityOrInvalid(
        exposure: SessionExposure,
        state: String,
    ) = runCatching { exposure.toCompatibility(state) }
        .getOrElse { throw InvalidSessionExposureException() }

    private fun legacyCompatibility(visibility: SessionRecordVisibility) =
        CompatibilityExposure(
            sessionVisibility = visibility.name,
            publicationVisibility = visibility.name,
            isPublic = visibility == SessionRecordVisibility.PUBLIC,
        )

    private data class LockedExposure(
        val state: String,
        val sessionVisibility: String,
        val exposure: SessionExposure,
    )

    fun open(
        jdbcTemplate: JdbcTemplate,
        command: HostSessionIdCommand,
    ): HostSessionTransitionResult {
        requireHost(command.host)
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            command.host.clubId.dbString(),
        )
        val state =
            queries.findState(jdbcTemplate, command.host, command.sessionId)
                ?: throw HostSessionNotFoundException()

        if (state == "OPEN") {
            return HostSessionTransitionResult(
                detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
                changed = false,
            )
        }
        if (state != "DRAFT") {
            throw HostSessionOpenNotAllowedException()
        }

        val openSessionCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                where club_id = ?
                  and state = 'OPEN'
                """.trimIndent(),
                Int::class.java,
                command.host.clubId.dbString(),
            ) ?: 0
        if (openSessionCount > 0) {
            throw OpenSessionAlreadyExistsException()
        }

        jdbcTemplate.update(
            """
            update sessions
            set state = 'OPEN',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
        createActiveParticipants(jdbcTemplate, command.host.clubId, command.sessionId)
        return HostSessionTransitionResult(
            detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
            changed = true,
        )
    }

    fun close(
        jdbcTemplate: JdbcTemplate,
        command: HostSessionIdCommand,
    ): HostSessionTransitionResult {
        requireHost(command.host)
        val closedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'CLOSED',
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and state = 'OPEN'
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            )
        if (closedRows == 0) {
            val state =
                queries.findState(jdbcTemplate, command.host, command.sessionId)
                    ?: throw HostSessionNotFoundException()

            if (state == "CLOSED") {
                return HostSessionTransitionResult(
                    detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
                    changed = false,
                )
            }
            throw HostSessionCloseNotAllowedException()
        }
        return HostSessionTransitionResult(
            detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
            changed = true,
        )
    }

    fun publish(
        jdbcTemplate: JdbcTemplate,
        command: HostSessionIdCommand,
    ): HostSessionTransitionResult {
        requireHost(command.host)
        val publishedRows =
            jdbcTemplate.update(
                """
                update sessions
                set state = 'PUBLISHED',
                    updated_at = utc_timestamp(6)
                where id = ?
                  and club_id = ?
                  and state = 'CLOSED'
                  and access_scope = 'GUEST_READABLE'
                  and exists (
                    select 1
                    from public_session_publications
                    where public_session_publications.session_id = sessions.id
                      and public_session_publications.club_id = sessions.club_id
                      and public_session_publications.visibility in ('MEMBER', 'PUBLIC')
                      and trim(public_session_publications.public_summary) <> ''
                  )
                """.trimIndent(),
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            )
        if (publishedRows == 0) {
            val state =
                queries.findState(jdbcTemplate, command.host, command.sessionId)
                    ?: throw HostSessionNotFoundException()

            if (state == "PUBLISHED") {
                return HostSessionTransitionResult(
                    detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
                    changed = false,
                )
            }
            throw HostSessionPublishNotAllowedException()
        }

        jdbcTemplate.update(
            """
            update public_session_publications
            set is_public = true,
                site_visibility = 'PUBLIC_RECORD',
                published_at = coalesce(published_at, utc_timestamp(6)),
                updated_at = utc_timestamp(6)
            where session_id = ?
              and club_id = ?
              and visibility = 'PUBLIC'
            """.trimIndent(),
            command.sessionId.dbString(),
            command.host.clubId.dbString(),
        )
        return HostSessionTransitionResult(
            detail = queries.findHostSessionAfterHostCheck(jdbcTemplate, command.host, command.sessionId),
            changed = true,
        )
    }

    private fun createActiveParticipants(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        sessionId: UUID,
    ) {
        val activeMembershipIds =
            jdbcTemplate.query(
                """
                select id
                from memberships
                where club_id = ?
                  and status = 'ACTIVE'
                order by joined_at is null, joined_at, created_at
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                clubId.dbString(),
            )
        if (activeMembershipIds.isEmpty()) {
            return
        }

        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id,
              rsvp_status, attendance_status, participation_status
            )
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            on duplicate key update
              rsvp_status = values(rsvp_status),
              attendance_status = values(attendance_status),
              participation_status = values(participation_status),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(
                    ps: PreparedStatement,
                    i: Int,
                ) {
                    ps.setString(1, UUID.randomUUID().dbString())
                    ps.setString(2, clubId.dbString())
                    ps.setString(3, sessionId.dbString())
                    ps.setString(4, activeMembershipIds[i].dbString())
                }

                override fun getBatchSize(): Int = activeMembershipIds.size
            },
        )
    }

    private fun parseMembershipId(membershipId: String): UUID =
        runCatching { UUID.fromString(membershipId) }
            .getOrElse { throw InvalidMembershipIdException() }

    private fun parseSessionTime(value: String): LocalTime = LocalTime.parse(value)

    private fun deadlineOrDefault(
        request: HostSessionCommand,
        sessionDate: LocalDate,
    ) = request.questionDeadlineAt
        ?.takeIf { it.isNotBlank() }
        ?.let { OffsetDateTime.parse(it).toUtcLocalDateTime() }
        ?: sessionDate
            .minusDays(1)
            .atTime(23, 59)
            .atOffset(ZoneOffset.ofHours(9))
            .toUtcLocalDateTime()

    private fun blankToNull(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    private fun locationLabelOrDefault(value: String?): String = blankToNull(value) ?: "온라인"
}
