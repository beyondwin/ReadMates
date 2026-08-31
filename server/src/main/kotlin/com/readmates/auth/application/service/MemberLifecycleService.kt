package com.readmates.auth.application.service

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.CurrentSessionPolicy
import com.readmates.auth.application.CurrentSessionPolicyResult
import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.MemberLifecycleResponse
import com.readmates.auth.application.port.`in`.LeaveMembershipUseCase
import com.readmates.auth.application.port.`in`.ManageMemberLifecycleUseCase
import com.readmates.auth.application.port.out.AuthPublicProjectionMutation
import com.readmates.auth.application.port.out.AuthPublicProjectionMutationPort
import com.readmates.auth.application.port.out.LifecycleMembershipRow
import com.readmates.auth.application.port.out.MemberLifecycleStorePort
import com.readmates.auth.application.port.out.SessionParticipationChange
import com.readmates.auth.application.toHostMemberListItem
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.port.out.SessionParticipantAuditPort
import com.readmates.session.application.port.out.SessionParticipantChangeAuditEntry
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class MemberLifecycleService(
    private val memberLifecycleStore: MemberLifecycleStorePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val participantAudit: SessionParticipantAuditPort = SessionParticipantAuditPort.Noop(),
    private val publicProjection: AuthPublicProjectionMutationPort = AuthPublicProjectionMutationPort.Noop(),
) : ManageMemberLifecycleUseCase,
    LeaveMembershipUseCase {
    override fun listMembers(
        host: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostMemberListItem> {
        requireMemberManager(host)
        val page = memberLifecycleStore.listMembers(host.clubId, pageRequest)
        return CursorPage(
            items = page.items.map { row -> row.toHostMemberListItem(host.membershipId) },
            nextCursor = page.nextCursor,
        )
    }

    @Transactional
    override fun suspend(
        host: ClubActor,
        membershipId: UUID,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse {
        requireMemberManager(host)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(host.clubId)
        memberLifecycleStore.lockClubForUpdate(host.clubId)
        val membership = ensureMutableMembership(host, membershipId)
        if (!membership.status.canTransitionTo(MembershipStatus.SUSPENDED)) {
            throw lifecycleConflict("${membership.status} → SUSPENDED is not allowed")
        }

        if (!memberLifecycleStore.suspendActiveMember(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be suspended")
        }

        val policy =
            applyCurrentSessionPolicy(host.membershipId, host.clubId, membershipId, request.currentSessionPolicy)
        publicProjection.record(
            projectionLock,
            AuthPublicProjectionMutation(
                host.clubId,
                host.membershipId,
                membershipId,
                "MEMBER_SUSPENDED",
                clubBodyChanged = true,
                includeSubjectPublicContent = false,
                affectedSessionIds = policy.affectedSessionIds,
            ),
        )
        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = policy.result,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun restore(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse {
        requireMemberManager(host)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(host.clubId)
        memberLifecycleStore.lockClubForUpdate(host.clubId)
        val membership = ensureMutableMembership(host, membershipId)
        if (!membership.status.canTransitionTo(MembershipStatus.ACTIVE)) {
            throw lifecycleConflict("${membership.status} → ACTIVE is not allowed")
        }

        if (!memberLifecycleStore.restoreSuspendedMember(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be restored")
        }
        publicProjection.record(
            projectionLock,
            AuthPublicProjectionMutation(
                host.clubId,
                host.membershipId,
                membershipId,
                "MEMBER_RESTORED",
                clubBodyChanged = true,
                includeSubjectPublicContent = false,
            ),
        )

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun deactivate(
        host: ClubActor,
        membershipId: UUID,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse {
        requireMemberManager(host)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(host.clubId)
        memberLifecycleStore.lockClubForUpdate(host.clubId)
        val membership = ensureMutableMembership(host, membershipId)
        if (!membership.status.canTransitionTo(MembershipStatus.LEFT)) {
            throw lifecycleConflict("${membership.status} → LEFT is not allowed")
        }

        if (!memberLifecycleStore.markMemberLeftByHost(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be deactivated")
        }
        memberLifecycleStore.deleteClubAccess(host.clubId, membershipId)

        val policy =
            applyCurrentSessionPolicy(host.membershipId, host.clubId, membershipId, request.currentSessionPolicy)
        publicProjection.record(
            projectionLock,
            AuthPublicProjectionMutation(
                host.clubId,
                host.membershipId,
                membershipId,
                "MEMBER_DEACTIVATED",
                clubBodyChanged = membership.status == MembershipStatus.ACTIVE,
                affectedSessionIds = policy.affectedSessionIds,
            ),
        )
        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = policy.result,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun addToCurrentSession(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse {
        requireMemberManager(host)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(host.clubId)
        memberLifecycleStore.lockClubForUpdate(host.clubId)
        val membership = ensureMutableMembership(host, membershipId)
        if (membership.status != MembershipStatus.ACTIVE) {
            throw lifecycleConflict("Only active members can be added to current session")
        }

        val openSessionId =
            memberLifecycleStore.lockOpenSessionForUpdate(host.clubId)
                ?: return MemberLifecycleResponse(
                    member = findHostMemberListItem(host, membershipId),
                    currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
                )
        val change = memberLifecycleStore.addToCurrentSession(host.clubId, openSessionId, membershipId)
        val changed =
            recordParticipationChange(
                actorMembershipId = host.membershipId,
                clubId = host.clubId,
                change = change,
            )
        if (changed) {
            publicProjection.record(
                projectionLock,
                AuthPublicProjectionMutation(
                    host.clubId,
                    host.membershipId,
                    membershipId,
                    "SESSION_PARTICIPANT_ADDED",
                    includeSubjectPublicContent = false,
                    affectedSessionIds = setOf(change.sessionId),
                ),
            )
        }

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun removeFromCurrentSession(
        host: ClubActor,
        membershipId: UUID,
    ): MemberLifecycleResponse {
        requireMemberManager(host)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(host.clubId)
        memberLifecycleStore.lockClubForUpdate(host.clubId)
        ensureMutableMembership(host, membershipId)
        val openSessionId =
            memberLifecycleStore.lockOpenSessionForUpdate(host.clubId)
                ?: return MemberLifecycleResponse(
                    member = findHostMemberListItem(host, membershipId),
                    currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
                )
        val change = memberLifecycleStore.markRemovedFromCurrentSession(host.clubId, openSessionId, membershipId)
        val changed =
            recordParticipationChange(
                actorMembershipId = host.membershipId,
                clubId = host.clubId,
                change = change,
            )
        if (changed) {
            publicProjection.record(
                projectionLock,
                AuthPublicProjectionMutation(
                    host.clubId,
                    host.membershipId,
                    membershipId,
                    "SESSION_PARTICIPANT_REMOVED",
                    includeSubjectPublicContent = false,
                    affectedSessionIds = setOf(change.sessionId),
                ),
            )
        }

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun leave(
        actor: ClubActor,
        request: MemberLifecycleRequest,
    ): MemberLifecycleResponse {
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(actor.clubId)
        memberLifecycleStore.lockClubForUpdate(actor.clubId)
        memberLifecycleStore.lockActiveHostRows(actor.clubId)
        val membership =
            memberLifecycleStore.findMembershipInClubForUpdate(actor.clubId, actor.membershipId)
                ?: throw AuthApplicationException(AuthApplicationError.AUTHENTICATION_REQUIRED, "Authentication required")
        if (membership.role == MembershipRole.HOST && memberLifecycleStore.activeHostCount(actor.clubId) <= 1) {
            throw lifecycleConflict("Last active host cannot leave")
        }
        if (!membership.status.canTransitionTo(MembershipStatus.LEFT)) {
            throw lifecycleConflict("${membership.status} → LEFT is not allowed")
        }

        memberLifecycleStore.markMembershipLeft(actor.clubId, actor.membershipId)
        memberLifecycleStore.deleteClubAccess(actor.clubId, actor.membershipId)

        val policy =
            applyCurrentSessionPolicy(
                actor.membershipId,
                actor.clubId,
                actor.membershipId,
                request.currentSessionPolicy,
            )
        publicProjection.record(
            projectionLock,
            AuthPublicProjectionMutation(
                actor.clubId,
                actor.membershipId,
                actor.membershipId,
                "MEMBERSHIP_LEFT",
                clubBodyChanged = membership.status == MembershipStatus.ACTIVE,
                affectedSessionIds = policy.affectedSessionIds,
            ),
        )
        return MemberLifecycleResponse(
            member = findHostMemberListItem(actor, actor.membershipId),
            currentSessionPolicyResult = policy.result,
        ).also { cacheInvalidation.evictClubContentAfterCommit(actor.clubId) }
    }

    private fun ensureMutableMembership(
        host: ClubActor,
        membershipId: UUID,
    ): LifecycleMembershipRow {
        val membership =
            memberLifecycleStore.findMembershipInClubForUpdate(host.clubId, membershipId)
                ?: throw lifecycleNotFound()
        if (membership.membershipId == host.membershipId) {
            throw lifecycleConflict("Hosts cannot mutate their own membership")
        }
        if (membership.role == MembershipRole.HOST) {
            if (membership.status == MembershipStatus.ACTIVE && memberLifecycleStore.activeHostCount(host.clubId) <= 1) {
                throw lifecycleConflict("Last active host cannot be mutated")
            }
            throw lifecycleConflict("Host membership cannot be managed through member lifecycle")
        }
        return membership
    }

    private fun applyCurrentSessionPolicy(
        actorMembershipId: UUID,
        clubId: UUID,
        membershipId: UUID,
        policy: CurrentSessionPolicy,
    ): AppliedCurrentSessionPolicy {
        val openSessionId =
            memberLifecycleStore.lockOpenSessionForUpdate(clubId)
        return when {
            openSessionId == null -> AppliedCurrentSessionPolicy(CurrentSessionPolicyResult.NOT_APPLICABLE)
            policy == CurrentSessionPolicy.NEXT_SESSION ->
                AppliedCurrentSessionPolicy(CurrentSessionPolicyResult.DEFERRED)
            else -> {
                val change =
                    memberLifecycleStore.markRemovedFromCurrentSession(clubId, openSessionId, membershipId)
                val changed =
                    recordParticipationChange(
                        actorMembershipId = actorMembershipId,
                        clubId = clubId,
                        change = change,
                    )
                AppliedCurrentSessionPolicy(
                    CurrentSessionPolicyResult.APPLIED,
                    if (changed) setOf(change.sessionId) else emptySet(),
                )
            }
        }
    }

    private fun recordParticipationChange(
        actorMembershipId: UUID,
        clubId: UUID,
        change: SessionParticipationChange,
    ): Boolean {
        if (!change.changed) return false
        participantAudit.record(
            SessionParticipantChangeAuditEntry(
                actorMembershipId = actorMembershipId,
                clubId = clubId,
                sessionId = change.sessionId,
                membershipId = change.membershipId,
                beforeStatus = change.beforeStatus,
                afterStatus = change.afterStatus,
                participantSetRevision = change.participantSetRevision,
            ),
        )
        epochPort.bump(clubId, HostListEpochKind.MEETING)
        return true
    }

    private fun findHostMemberListItem(
        currentMember: ClubActor,
        membershipId: UUID,
    ): HostMemberListItem =
        memberLifecycleStore
            .findHostMemberListItem(currentMember.clubId, membershipId)
            ?.toHostMemberListItem(currentMember.membershipId)
            ?: throw lifecycleNotFound()

    private fun requireMemberManager(actor: ClubActor) {
        if (!actor.can(ClubCapability.MANAGE_MEMBERS)) throw existingHostRequiredFailure()
    }

    private fun existingHostRequiredFailure(): AuthApplicationException =
        AuthApplicationException(AuthApplicationError.HOST_REQUIRED, "Host role required")

    private fun lifecycleNotFound(): AuthApplicationException =
        AuthApplicationException(AuthApplicationError.MEMBER_NOT_FOUND, "Member not found")

    private fun lifecycleConflict(message: String): AuthApplicationException =
        AuthApplicationException(AuthApplicationError.MEMBER_CONFLICT, message)

    private data class AppliedCurrentSessionPolicy(
        val result: CurrentSessionPolicyResult,
        val affectedSessionIds: Set<UUID> = emptySet(),
    )
}
