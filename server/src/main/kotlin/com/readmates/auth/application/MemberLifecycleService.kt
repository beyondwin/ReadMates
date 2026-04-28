package com.readmates.auth.application

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.auth.application.port.`in`.LeaveMembershipUseCase
import com.readmates.auth.application.port.`in`.ManageMemberLifecycleUseCase
import com.readmates.auth.application.port.out.LifecycleMembershipRow
import com.readmates.auth.application.port.out.MemberLifecycleStorePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class MemberLifecycleService(
    private val memberLifecycleStore: MemberLifecycleStorePort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
) : ManageMemberLifecycleUseCase, LeaveMembershipUseCase {
    override fun listMembers(host: CurrentMember): List<HostMemberListItem> {
        requireHost(host)
        return memberLifecycleStore.listMembers(host.clubId)
            .map { row -> row.toHostMemberListItem(host.membershipId) }
    }

    @Transactional
    override fun suspend(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse {
        requireHost(host)
        val membership = ensureMutableMembership(host, membershipId)
        if (membership.status != MembershipStatus.ACTIVE) {
            throw lifecycleConflict("Only active members can be suspended")
        }

        if (!memberLifecycleStore.suspendActiveMember(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be suspended")
        }

        val policyResult = applyCurrentSessionPolicy(host.clubId, membershipId, request.currentSessionPolicy)
        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = policyResult,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun restore(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        val membership = ensureMutableMembership(host, membershipId)
        if (membership.status != MembershipStatus.SUSPENDED) {
            throw lifecycleConflict("Only suspended members can be restored")
        }

        if (!memberLifecycleStore.restoreSuspendedMember(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be restored")
        }

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun deactivate(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse {
        requireHost(host)
        val membership = ensureMutableMembership(host, membershipId)
        if (membership.status !in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)) {
            throw lifecycleConflict("Only active or suspended members can leave")
        }

        if (!memberLifecycleStore.markMemberLeftByHost(host.clubId, membershipId)) {
            throw lifecycleConflict("Member could not be deactivated")
        }

        val policyResult = applyCurrentSessionPolicy(host.clubId, membershipId, request.currentSessionPolicy)
        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = policyResult,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun addToCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        val membership = ensureMutableMembership(host, membershipId)
        if (membership.status != MembershipStatus.ACTIVE) {
            throw lifecycleConflict("Only active members can be added to current session")
        }

        val openSessionId = memberLifecycleStore.findCurrentOpenSessionId(host.clubId)
            ?: return MemberLifecycleResponse(
                member = findHostMemberListItem(host, membershipId),
                currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
            )
        memberLifecycleStore.addToCurrentSession(host.clubId, openSessionId, membershipId)

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun removeFromCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        ensureMutableMembership(host, membershipId)
        val openSessionId = memberLifecycleStore.findCurrentOpenSessionId(host.clubId)
            ?: return MemberLifecycleResponse(
                member = findHostMemberListItem(host, membershipId),
                currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
            )
        memberLifecycleStore.markRemovedFromCurrentSession(host.clubId, openSessionId, membershipId)

        return MemberLifecycleResponse(
            member = findHostMemberListItem(host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        ).also { cacheInvalidation.evictClubContentAfterCommit(host.clubId) }
    }

    @Transactional
    override fun leave(member: CurrentMember, request: MemberLifecycleRequest): MemberLifecycleResponse {
        if (member.role == MembershipRole.HOST) {
            memberLifecycleStore.lockActiveHostRows(member.clubId)
        }
        val membership = memberLifecycleStore.findMembershipInClubForUpdate(member.clubId, member.membershipId)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")
        if (membership.role == MembershipRole.HOST && memberLifecycleStore.activeHostCount(member.clubId) <= 1) {
            throw lifecycleConflict("Last active host cannot leave")
        }
        if (membership.status !in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)) {
            throw lifecycleConflict("Only active or suspended members can leave")
        }

        memberLifecycleStore.markMembershipLeft(member.clubId, member.membershipId)

        val policyResult = applyCurrentSessionPolicy(
            member.clubId,
            member.membershipId,
            request.currentSessionPolicy,
        )
        return MemberLifecycleResponse(
            member = findHostMemberListItem(member, member.membershipId),
            currentSessionPolicyResult = policyResult,
        ).also { cacheInvalidation.evictClubContentAfterCommit(member.clubId) }
    }

    private fun ensureMutableMembership(
        host: CurrentMember,
        membershipId: UUID,
    ): LifecycleMembershipRow {
        val membership = memberLifecycleStore.findMembershipInClubForUpdate(host.clubId, membershipId)
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
        clubId: UUID,
        membershipId: UUID,
        policy: CurrentSessionPolicy,
    ): CurrentSessionPolicyResult {
        val openSessionId = memberLifecycleStore.findCurrentOpenSessionId(clubId)
            ?: return CurrentSessionPolicyResult.NOT_APPLICABLE
        if (policy == CurrentSessionPolicy.NEXT_SESSION) {
            return CurrentSessionPolicyResult.DEFERRED
        }
        memberLifecycleStore.markRemovedFromCurrentSession(clubId, openSessionId, membershipId)
        return CurrentSessionPolicyResult.APPLIED
    }

    private fun findHostMemberListItem(
        currentMember: CurrentMember,
        membershipId: UUID,
    ): HostMemberListItem =
        memberLifecycleStore.findHostMemberListItem(currentMember.clubId, membershipId)
            ?.toHostMemberListItem(currentMember.membershipId)
            ?: throw lifecycleNotFound()

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun lifecycleNotFound(): ResponseStatusException =
        ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found")

    private fun lifecycleConflict(message: String): ResponseStatusException =
        ResponseStatusException(HttpStatus.CONFLICT, message)
}
