package com.readmates.session.application.service

import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.out.HostSessionAuditPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionDraftCommandService(
    private val draftPort: HostSessionDraftPort,
    private val auditPort: HostSessionAuditPort = HostSessionAuditPort.Noop(),
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : HostSessionDraftUseCase {
    @Transactional
    override fun create(command: HostSessionCommand) =
        draftPort.create(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        auditPort.loadBasicSnapshot(command.host, command.sessionId).let { before ->
            draftPort.update(command).also {
                val after = auditPort.loadBasicSnapshot(command.host, command.sessionId)
                val changedFields = changedBasicFields(before, after)
                if (changedFields.isNotEmpty()) {
                    auditPort.recordBasicUpdate(command.host, command.sessionId, changedFields)
                }
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
            }
        }
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
