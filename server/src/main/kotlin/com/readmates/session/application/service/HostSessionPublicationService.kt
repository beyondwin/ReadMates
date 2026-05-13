package com.readmates.session.application.service

import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionPublicationService(
    private val publicationPort: HostSessionPublicationPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : UpsertPublicationUseCase {
    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand) =
        publicationPort.upsertPublication(command).also {
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        }
}
