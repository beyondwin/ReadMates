package com.readmates.session.application.service

import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.mutation.application.model.HostMutationOperation
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionPublicationService(
    private val publicationPort: HostSessionPublicationPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val mutations: HostSessionMutationCoordinator? = null,
) : UpsertPublicationUseCase {
    @Transactional
    override fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse {
        val coordinator = mutations ?: return upsertOnce(command)
        return coordinator.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_PUBLICATION,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.publication(command),
            mutate = { HostMutationOutcome(command.sessionId, upsertOnce(command)) },
            replay = { _, projection ->
                val snapshot = projection ?: throw HostSessionNotFoundException()
                HostPublicationResponse(
                    sessionId = command.sessionId.toString(),
                    publicSummary = command.publicSummary,
                    visibility = snapshot.visibility,
                    accessScope = snapshot.accessScope,
                    siteVisibility = snapshot.siteVisibility,
                )
            },
        )
    }

    private fun upsertOnce(command: UpsertPublicationCommand) =
        publicationPort.upsertPublication(command).also {
            epochPort.bump(command.host.clubId, HostListEpochKind.RECORD)
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        }
}
