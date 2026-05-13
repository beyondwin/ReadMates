package com.readmates.session.application.service

import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.`in`.HostSessionDraftUseCase
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionDraftCommandService(
    private val draftPort: HostSessionDraftPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : HostSessionDraftUseCase {
    @Transactional
    override fun create(command: HostSessionCommand) =
        draftPort.create(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    @Transactional
    override fun update(command: UpdateHostSessionCommand) =
        draftPort.update(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }
}
