package com.readmates.session.application.service

import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.CreatedSessionResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.model.toDetail
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.mutation.application.model.HostMutationOperation
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class HostSessionDraftCommandService(
    private val draftPort: HostSessionDraftPort,
    private val auditPort: HostSessionAuditPort = HostSessionAuditPort.Noop(),
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val mutations: HostSessionMutationCoordinator? = null,
) : HostSessionDraftUseCase {
    @Transactional
    override fun create(command: HostSessionCommand): CreatedSessionResponse {
        val coordinator = mutations ?: return createOnce(command)
        return coordinator.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_CREATE,
            resourceSlot = HostMutationPayloads.CREATE_SLOT,
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.sessionFields(HostMutationOperation.SESSION_CREATE, command),
            mutate = {
                val created = createOnce(command)
                HostMutationOutcome(UUID.fromString(created.sessionId), created)
            },
            replay = { record, projection ->
                val snapshot = projection ?: throw HostSessionNotFoundException()
                CreatedSessionResponse(
                    sessionId = record.resourceId.toString(),
                    sessionNumber = snapshot.sessionNumber,
                    title = snapshot.title,
                    bookTitle = snapshot.bookTitle,
                    bookAuthor = snapshot.bookAuthor,
                    bookLink = null,
                    bookImageUrl = null,
                    date = snapshot.date,
                    startTime = snapshot.startTime,
                    endTime = snapshot.endTime,
                    questionDeadlineAt = "",
                    locationLabel = snapshot.locationLabel,
                    meetingUrl = null,
                    meetingPasscode = null,
                    state = snapshot.state,
                    visibility = snapshot.visibility,
                    accessScope = snapshot.accessScope,
                    siteVisibility = snapshot.siteVisibility,
                )
            },
        )
    }

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        mutations?.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_BASIC_SAVE,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.sessionFields(HostMutationOperation.SESSION_BASIC_SAVE, command.session),
            mutate = {
                HostMutationOutcome(command.sessionId, updateOnce(command))
            },
            replay = { _, projection ->
                projection?.toDetail(command.sessionId) ?: throw HostSessionNotFoundException()
            },
        ) ?: updateOnce(command)

    private fun createOnce(command: HostSessionCommand): CreatedSessionResponse {
        val created = draftPort.create(command)
        epochPort.bump(command.host.clubId, HostListEpochKind.MEETING)
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return attachFirstPublicationComposer(command, created)
    }

    private fun updateOnce(command: UpdateHostSessionCommand) =
        auditPort.loadBasicSnapshot(command.host, command.sessionId).let { before ->
            val detail = draftPort.update(command)
            val after = auditPort.loadBasicSnapshot(command.host, command.sessionId)
            val changedFields = changedBasicFields(before, after)
            val receipt =
                if (changedFields.isNotEmpty() && before != null && after != null) {
                    auditPort.recordBasicUpdate(
                        host = command.host,
                        sessionId = command.sessionId,
                        before = before,
                        after = after,
                        changedFields = changedFields,
                    )
                } else {
                    null
                }
            epochPort.bump(command.host.clubId, HostListEpochKind.MEETING, HostListEpochKind.RECORD)
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            detail.copy(changeReceipt = receipt)
        }
}

private fun attachFirstPublicationComposer(
    command: HostSessionCommand,
    created: CreatedSessionResponse,
): CreatedSessionResponse {
    if (command.accessScope != SessionAccessScope.GUEST_READABLE) {
        return created
    }
    val sessionId = UUID.fromString(created.sessionId)
    return created.copy(
        composer =
            HostNotificationComposerContext(
                sessionId = sessionId,
                eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                contentRevision =
                    ManualNotificationContentRevision.nextBook(
                        sessionId,
                        created.sessionNumber,
                        created.bookTitle,
                        created.visibility.name,
                    ),
            ),
    )
}

private fun changedBasicFields(
    before: com.readmates.session.application.HostSessionBasicAuditSnapshot?,
    after: com.readmates.session.application.HostSessionBasicAuditSnapshot?,
): Set<String> {
    if (before == null || after == null) return emptySet()
    return linkedMapOf(
        "title" to (before.title != after.title),
        "bookTitle" to (before.bookTitle != after.bookTitle),
        "bookAuthor" to (before.bookAuthor != after.bookAuthor),
        "bookLink" to (before.bookLink != after.bookLink),
        "bookImageUrl" to (before.bookImageUrl != after.bookImageUrl),
        "date" to (before.date != after.date),
        "startTime" to (before.startTime != after.startTime),
        "endTime" to (before.endTime != after.endTime),
        "questionDeadlineAt" to (before.questionDeadlineAt != after.questionDeadlineAt),
        "locationLabel" to (before.locationLabel != after.locationLabel),
        "meetingUrl" to (before.meetingUrl != after.meetingUrl),
        "meetingPasscode" to (before.meetingPasscode != after.meetingPasscode),
    ).filterValues { it }.keys
}
