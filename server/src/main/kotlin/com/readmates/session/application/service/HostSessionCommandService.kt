package com.readmates.session.application.service

import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.ConfirmAttendanceUseCase
import com.readmates.session.application.port.`in`.GetHostDashboardUseCase
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.application.port.out.HostSessionWritePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.util.UUID

@Service
class HostSessionCommandService(
    private val port: HostSessionWritePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase = NoopRecordNotificationEventUseCase,
) : HostSessionLifecycleUseCase,
    HostSessionDraftUseCase,
    ConfirmAttendanceUseCase,
    UpsertPublicationUseCase,
    ListUpcomingSessionsUseCase,
    GetHostDashboardUseCase {
    override fun list(host: CurrentMember, pageRequest: PageRequest) = port.list(host, pageRequest)

    @Transactional
    override fun create(command: HostSessionCommand) =
        port.create(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    override fun detail(command: HostSessionIdCommand) = port.detail(command)

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        port.update(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
        val detail = port.updateVisibility(command)
        if (detail.state == "DRAFT" && detail.visibility != SessionRecordVisibility.HOST_ONLY) {
            recordNotificationEventUseCase.recordNextBookPublished(
                clubId = command.host.clubId,
                sessionId = command.sessionId,
                sessionNumber = detail.sessionNumber,
                bookTitle = detail.bookTitle,
            )
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return detail
    }

    @Transactional
    override fun open(command: HostSessionIdCommand) =
        port.open(command).also { result ->
            if (result.changed) {
                logger.info(
                    "Session state changed clubId={} sessionId={} oldState={} newState={}",
                    command.host.clubId,
                    command.sessionId,
                    "DRAFT",
                    "OPEN",
                )
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            }
        }.detail

    @Transactional
    override fun close(command: HostSessionIdCommand) =
        port.close(command).also { result ->
            if (result.changed) {
                logger.info(
                    "Session state changed clubId={} sessionId={} oldState={} newState={}",
                    command.host.clubId,
                    command.sessionId,
                    "OPEN",
                    "CLOSED",
                )
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            }
        }.detail

    @Transactional
    override fun publish(command: HostSessionIdCommand) =
        port.publish(command).also { result ->
            if (result.changed) {
                logger.info(
                    "Session state changed clubId={} sessionId={} oldState={} newState={}",
                    command.host.clubId,
                    command.sessionId,
                    "CLOSED",
                    "PUBLISHED",
                )
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            }
        }.detail

    override fun deletionPreview(command: HostSessionIdCommand) = port.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) =
        port.delete(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    @Transactional
    override fun confirmAttendance(command: ConfirmAttendanceCommand) =
        port.confirmAttendance(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) =
        port.upsertPublication(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    override fun dashboard(host: CurrentMember) = port.dashboard(host)

    override fun upcoming(member: CurrentMember) = port.upcoming(member)

    private companion object {
        private val logger = LoggerFactory.getLogger(HostSessionCommandService::class.java)
    }
}

private object NoopRecordNotificationEventUseCase : RecordNotificationEventUseCase {
    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) = Unit

    override fun recordNextBookPublished(clubId: UUID, sessionId: UUID, sessionNumber: Int, bookTitle: String) = Unit

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) = Unit
}
