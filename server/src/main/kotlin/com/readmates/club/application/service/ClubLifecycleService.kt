package com.readmates.club.application.service

import com.readmates.club.application.ClubLifecycleError
import com.readmates.club.application.ClubLifecycleException
import com.readmates.club.application.port.`in`.ClubLifecycleUseCase
import com.readmates.club.application.port.out.ClubLifecyclePort
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
) : ClubLifecycleUseCase {

    @Transactional
    override fun activateAfterFirstHostJoin(clubId: UUID) {
        val current = loadOrThrow(clubId)
        requireTransition(current, ClubStatus.ACTIVE)
        transition(clubId, current, ClubStatus.ACTIVE)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = null,
            actorPlatformRole = null,
            eventType = "CLUB_ACTIVATED",
            metadataJson = auditJson("trigger" to "FIRST_HOST_JOIN"),
        )
    }

    @Transactional
    override fun suspend(clubId: UUID, actor: CurrentPlatformAdmin, reason: String) {
        val current = loadOrThrow(clubId)
        requireTransition(current, ClubStatus.SUSPENDED)
        transition(clubId, current, ClubStatus.SUSPENDED)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_SUSPENDED",
            metadataJson = auditJson("reason" to reason),
        )
    }

    @Transactional
    override fun restore(clubId: UUID, actor: CurrentPlatformAdmin) {
        val current = loadOrThrow(clubId)
        requireTransition(current, ClubStatus.ACTIVE)
        transition(clubId, current, ClubStatus.ACTIVE)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_RESTORED",
            metadataJson = auditJson(),
        )
    }

    @Transactional
    override fun archive(clubId: UUID, actor: CurrentPlatformAdmin) {
        val current = loadOrThrow(clubId)
        requireTransition(current, ClubStatus.ARCHIVED)
        transition(clubId, current, ClubStatus.ARCHIVED)
        port.insertAuditEvent(
            clubId = clubId,
            actorUserId = actor.userId,
            actorPlatformRole = actor.role.name,
            eventType = "CLUB_ARCHIVED",
            metadataJson = auditJson(),
        )
    }

    private fun loadOrThrow(clubId: UUID): ClubStatus =
        port.loadCurrentStatus(clubId)
            ?: throw ClubLifecycleException(ClubLifecycleError.CLUB_NOT_FOUND, "Club not found: $clubId")

    private fun requireTransition(from: ClubStatus, to: ClubStatus) {
        if (!from.canTransitionTo(to)) {
            throw ClubLifecycleException(
                ClubLifecycleError.INVALID_TRANSITION,
                "$from → $to is not a valid club status transition",
            )
        }
    }

    private fun transition(clubId: UUID, from: ClubStatus, to: ClubStatus) {
        val updated = port.transitionStatus(clubId, from, to)
        if (!updated) {
            throw ClubLifecycleException(
                ClubLifecycleError.INVALID_TRANSITION,
                "Concurrent modification: club $clubId status was not $from",
            )
        }
    }

    private fun auditJson(vararg pairs: Pair<String, Any?>): String =
        objectMapper.writeValueAsString(mapOf(*pairs))
}
