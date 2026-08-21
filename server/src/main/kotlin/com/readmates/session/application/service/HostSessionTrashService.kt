package com.readmates.session.application.service

import com.readmates.session.application.HostSessionDeletionCounts
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionTrashExpiredException
import com.readmates.session.application.model.HostSessionTrashPage
import com.readmates.session.application.model.HostSessionTrashPurgeTarget
import com.readmates.session.application.model.HostSessionTrashRecord
import com.readmates.session.application.model.HostSessionTrashResponse
import com.readmates.session.application.port.`in`.GetHostSessionTrashUseCase
import com.readmates.session.application.port.`in`.ListHostSessionTrashCommand
import com.readmates.session.application.port.`in`.ListHostSessionTrashUseCase
import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.session.application.port.`in`.RestoreTrashedHostSessionUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.session.application.requireHost
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private const val MAX_PURGE_BATCH_SIZE = 500

@Service
class HostSessionTrashService(
    private val deletionPort: HostSessionDeletionPort,
    private val queryPort: HostSessionQueryPort,
    private val lifecycleAudit: HostSessionLifecycleAuditPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : ListHostSessionTrashUseCase,
    GetHostSessionTrashUseCase,
    RestoreTrashedHostSessionUseCase,
    PurgeExpiredHostSessionTrashUseCase {
    @Transactional(readOnly = true)
    override fun list(command: ListHostSessionTrashCommand): HostSessionTrashPage {
        requireHost(command.host)
        return deletionPort.listTrash(command.host, command.pageRequest)
    }

    @Transactional(readOnly = true)
    override fun trash(command: HostSessionIdCommand): HostSessionTrashResponse {
        requireHost(command.host)
        val record = deletionPort.findTrash(command) ?: throwMissingTrash(command)
        return record.toResponse(deletionPort.deletionCounts(command.host.clubId, command.sessionId))
    }

    @Transactional
    override fun restore(command: HostSessionIdCommand): HostSessionDetailResponse {
        requireHost(command.host)
        deletionPort.lockClub(command.host.clubId)
        val locked = deletionPort.lockTrash(command) ?: throwMissingTrash(command)
        if (!locked.restorable) {
            throw HostSessionTrashExpiredException()
        }
        if (locked.state == "OPEN") {
            val openSessionId = deletionPort.findOpenSessionId(command.host.clubId)
            if (openSessionId != null) {
                throw OpenSessionAlreadyExistsException(openSessionId)
            }
        }
        if (!deletionPort.restoreTrash(command)) {
            throw HostSessionTrashExpiredException()
        }
        lifecycleAudit.record(
            HostSessionLifecycleAuditEntry(
                host = command.host,
                sessionId = command.sessionId,
                action = HostSessionLifecycleAction.RESTORED,
                fromState = locked.state,
                toState = locked.state,
                reasonCode = HostSessionLifecycleReasonCode.OPERATIONAL_RECOVERY,
                reasonNote = null,
            ),
        )
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return queryPort.detail(command)
    }

    @Transactional
    override fun purgeExpired(limit: Int): Int {
        val targets = deletionPort.lockExpiredForPurge(limit.coerceIn(0, MAX_PURGE_BATCH_SIZE))
        val purgedClubs = linkedSetOf<UUID>()
        var purged = 0
        targets.forEach { target ->
            if (purgeOne(target)) {
                purged += 1
                purgedClubs += target.clubId
            }
        }
        purgedClubs.forEach(cacheInvalidation::evictClubContentAfterCommit)
        return purged
    }

    private fun purgeOne(target: HostSessionTrashPurgeTarget): Boolean = deletionPort.purgeLocked(target)

    private fun throwMissingTrash(command: HostSessionIdCommand): Nothing {
        val latest = deletionPort.latestDeletedOrRestoredAction(command.host.clubId, command.sessionId)
        if (latest == HostSessionLifecycleAction.DELETED) {
            throw HostSessionTrashExpiredException()
        }
        throw HostSessionNotFoundException()
    }
}

private fun HostSessionTrashRecord.toResponse(counts: HostSessionDeletionCounts) =
    HostSessionTrashResponse(
        sessionId = sessionId.toString(),
        sessionNumber = sessionNumber,
        title = title,
        state = state,
        trashed = true,
        deletedAt = deletedAt.toString(),
        purgeAfter = purgeAfter.toString(),
        counts = counts,
    )
