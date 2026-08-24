package com.readmates.club.application.service

import com.readmates.club.application.ClubLifecycleError
import com.readmates.club.application.ClubLifecycleException
import com.readmates.club.application.port.`in`.ClubLifecycleUseCase
import com.readmates.club.application.port.out.ClubLifecyclePort
import com.readmates.club.application.port.out.ClubLifecycleState
import com.readmates.club.application.port.out.ClubPublicProjectionLock
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.club.application.port.out.ClubPublicProjectionMutationPort
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Service
class ClubLifecycleService(
    private val port: ClubLifecyclePort,
    private val objectMapper: ObjectMapper,
    private val publicProjection: ClubPublicProjectionMutationPort = ClubPublicProjectionMutationPort.Noop(),
) : ClubLifecycleUseCase {
    @Transactional
    override fun activateAfterFirstHostJoin(clubId: UUID) {
        val exposureLock = publicProjection.lockForExposure(clubId)
        val current = loadOrThrow(clubId)
        if (current.status == ClubStatus.ACTIVE) return
        requireTransition(current.status, ClubStatus.ACTIVE)
        transition(clubId, current.status, ClubStatus.ACTIVE)
        recordPublicTransition(clubId, null, "CLUB_ACTIVATED", exposureLock)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = null,
            actorPlatformRole = null,
            eventType = "CLUB_ACTIVATED",
            metadataJson = auditJson("trigger" to "FIRST_HOST_JOIN"),
        )
    }

    @Transactional
    override fun suspend(
        clubId: UUID,
        actor: CurrentPlatformAdmin,
        reason: String,
    ) {
        val exposureLock = publicProjection.lockForExposure(clubId)
        val current = loadOrThrow(clubId)
        if (current.status == ClubStatus.SUSPENDED) return
        requireTransition(current.status, ClubStatus.SUSPENDED)
        transition(clubId, current.status, ClubStatus.SUSPENDED)
        recordPublicTransition(clubId, actor.userId, "CLUB_SUSPENDED", exposureLock)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_SUSPENDED",
            metadataJson = auditJson("reason" to reason),
        )
    }

    @Transactional
    override fun restore(
        clubId: UUID,
        actor: CurrentPlatformAdmin,
    ) {
        val exposureLock = publicProjection.lockForExposure(clubId)
        val current = loadOrThrow(clubId)
        if (current.status == ClubStatus.ACTIVE) return
        requireTransition(current.status, ClubStatus.ACTIVE)
        transition(clubId, current.status, ClubStatus.ACTIVE)
        recordPublicTransition(clubId, actor.userId, "CLUB_RESTORED", exposureLock)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_RESTORED",
            metadataJson = auditJson(),
        )
    }

    @Transactional
    override fun archive(
        clubId: UUID,
        actor: CurrentPlatformAdmin,
    ) {
        val exposureLock = publicProjection.lockForExposure(clubId)
        val current = loadOrThrow(clubId)
        if (current.status == ClubStatus.ARCHIVED) return
        requireTransition(current.status, ClubStatus.ARCHIVED)
        transition(clubId, current.status, ClubStatus.ARCHIVED)
        recordPublicTransition(clubId, actor.userId, "CLUB_ARCHIVED", exposureLock)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_ARCHIVED",
            metadataJson = auditJson(),
        )
    }

    private fun loadOrThrow(clubId: UUID): ClubLifecycleState =
        port.loadCurrentForUpdate(clubId)
            ?: throw ClubLifecycleException(ClubLifecycleError.CLUB_NOT_FOUND, "Club not found: $clubId")

    private fun requireTransition(
        from: ClubStatus,
        to: ClubStatus,
    ) {
        if (!from.canTransitionTo(to)) {
            throw ClubLifecycleException(
                ClubLifecycleError.INVALID_TRANSITION,
                "$from → $to is not a valid club status transition",
            )
        }
    }

    private fun transition(
        clubId: UUID,
        from: ClubStatus,
        to: ClubStatus,
    ) {
        val updated = port.transitionStatus(clubId, from, to)
        if (!updated) {
            throw ClubLifecycleException(
                ClubLifecycleError.INVALID_TRANSITION,
                "Concurrent modification: club $clubId status was not $from",
            )
        }
    }

    private fun auditJson(vararg pairs: Pair<String, Any?>): String = objectMapper.writeValueAsString(mapOf(*pairs))

    private fun recordPublicTransition(
        clubId: UUID,
        actorUserId: UUID?,
        operation: String,
        exposureLock: ClubPublicProjectionLock,
    ) {
        publicProjection.record(
            ClubPublicProjectionMutation(
                clubId = clubId,
                actorUserId = actorUserId,
                operation = operation,
                exposureChanged = true,
                exposureLock = exposureLock,
            ),
        )
    }
}
