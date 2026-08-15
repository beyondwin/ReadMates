package com.readmates.auth.application.service

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.CurrentSessionPolicyResult
import com.readmates.auth.application.MemberLifecycleRequest
import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.LifecycleMembershipRow
import com.readmates.auth.application.port.out.MemberLifecycleStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class MemberLifecycleServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val targetMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000202")
    private val host =
        ClubActor(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = hostMembershipId,
            clubId = clubId,
            clubSlug = "reading-sai",
            capabilities = setOf(ClubCapability.MANAGE_INVITATIONS, ClubCapability.MANAGE_MEMBERS),
        )

    private val member =
        ClubActor(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
            membershipId = targetMembershipId,
            clubId = clubId,
            clubSlug = "reading-sai",
            capabilities = emptySet(),
        )

    @Test
    fun `evicts club content after member lifecycle mutation`() {
        val store = RecordingMemberLifecycleStorePort()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = MemberLifecycleService(store, invalidation)

        val response = service.suspend(host, targetMembershipId, MemberLifecycleRequest())

        assertEquals(MembershipStatus.SUSPENDED, response.member.status)
        assertEquals(listOf(clubId), invalidation.clubs)
        assertEquals(listOf("lock-club", "find-membership", "suspend"), store.mutationCalls)
    }

    @Test
    fun `active member leave locks hosts before membership and does not count hosts`() {
        val store = RecordingMemberLifecycleStorePort(role = MembershipRole.MEMBER, activeHostCount = 2)
        val service = MemberLifecycleService(store)

        val response = service.leave(member, MemberLifecycleRequest())

        assertEquals(CurrentSessionPolicyResult.NOT_APPLICABLE, response.currentSessionPolicyResult)
        assertEquals(
            listOf("lock-club", "lock-active-hosts", "find-membership", "mark-left"),
            store.mutationCalls,
        )
    }

    @Test
    fun `invitation management capability does not authorize member lifecycle management`() {
        val store = RecordingMemberLifecycleStorePort()
        val service = MemberLifecycleService(store)
        val invitationManager = host.copy(capabilities = setOf(ClubCapability.MANAGE_INVITATIONS))

        val error =
            assertThrows(AuthApplicationException::class.java) {
                service.suspend(invitationManager, targetMembershipId, MemberLifecycleRequest())
            }

        assertEquals(AuthApplicationError.HOST_REQUIRED, error.error)
        assertEquals(emptyList<String>(), store.mutationCalls)
    }

    @Test
    fun `suspended host actor cannot manage lifecycle before touching the store`() {
        val store = RecordingMemberLifecycleStorePort()
        val service = MemberLifecycleService(store)
        val suspendedHost = host.copy(capabilities = emptySet())

        val error =
            assertThrows(AuthApplicationException::class.java) {
                service.suspend(suspendedHost, targetMembershipId, MemberLifecycleRequest())
            }

        assertEquals(AuthApplicationError.HOST_REQUIRED, error.error)
        assertEquals(emptyList<String>(), store.mutationCalls)
    }

    @Test
    fun `active host leave counts locked persisted host and leaves when quorum remains`() {
        val store = RecordingMemberLifecycleStorePort(role = MembershipRole.HOST, activeHostCount = 2)
        val service = MemberLifecycleService(store)
        val activeHost = host.copy(membershipId = targetMembershipId)

        val response = service.leave(activeHost, MemberLifecycleRequest())

        assertEquals(CurrentSessionPolicyResult.NOT_APPLICABLE, response.currentSessionPolicyResult)
        assertEquals(
            listOf("lock-club", "lock-active-hosts", "find-membership", "active-host-count", "mark-left"),
            store.mutationCalls,
        )
    }

    @Test
    fun `active host leave protects the last locked host without writing`() {
        val store = RecordingMemberLifecycleStorePort(role = MembershipRole.HOST, activeHostCount = 1)
        val service = MemberLifecycleService(store)
        val activeHost = host.copy(membershipId = targetMembershipId)

        val error =
            assertThrows(AuthApplicationException::class.java) {
                service.leave(activeHost, MemberLifecycleRequest())
            }

        assertEquals(AuthApplicationError.MEMBER_CONFLICT, error.error)
        assertEquals("Last active host cannot leave", error.message)
        assertEquals(
            listOf("lock-club", "lock-active-hosts", "find-membership", "active-host-count"),
            store.mutationCalls,
        )
    }

    @Test
    fun `suspended host leave protects last persisted host without management capability`() {
        val store = RecordingMemberLifecycleStorePort(role = MembershipRole.HOST, activeHostCount = 1)
        val service = MemberLifecycleService(store)
        val suspendedHost = host.copy(membershipId = targetMembershipId, capabilities = emptySet())

        val error =
            assertThrows(AuthApplicationException::class.java) {
                service.leave(suspendedHost, MemberLifecycleRequest())
            }

        assertEquals(AuthApplicationError.MEMBER_CONFLICT, error.error)
        assertEquals("Last active host cannot leave", error.message)
        assertEquals(
            listOf("lock-club", "lock-active-hosts", "find-membership", "active-host-count"),
            store.mutationCalls,
        )
    }

    private inner class RecordingMemberLifecycleStorePort(
        private val role: MembershipRole = MembershipRole.MEMBER,
        private val activeHostCount: Int = 2,
    ) : MemberLifecycleStorePort {
        private var targetStatus = MembershipStatus.ACTIVE
        val mutationCalls = mutableListOf<String>()

        override fun lockClubForUpdate(clubId: UUID) {
            mutationCalls += "lock-club"
        }

        override fun listMembers(
            clubId: UUID,
            pageRequest: PageRequest,
        ): CursorPage<HostMemberListRow> = CursorPage(listOf(hostMemberListRow()), null)

        override fun suspendActiveMember(
            clubId: UUID,
            membershipId: UUID,
        ): Boolean {
            mutationCalls += "suspend"
            targetStatus = MembershipStatus.SUSPENDED
            return true
        }

        override fun restoreSuspendedMember(
            clubId: UUID,
            membershipId: UUID,
        ): Boolean {
            targetStatus = MembershipStatus.ACTIVE
            return true
        }

        override fun markMemberLeftByHost(
            clubId: UUID,
            membershipId: UUID,
        ): Boolean {
            targetStatus = MembershipStatus.LEFT
            return true
        }

        override fun markMembershipLeft(
            clubId: UUID,
            membershipId: UUID,
        ): Boolean {
            mutationCalls += "mark-left"
            targetStatus = MembershipStatus.LEFT
            return true
        }

        override fun findCurrentOpenSessionId(clubId: UUID): UUID? = null

        override fun addToCurrentSession(
            clubId: UUID,
            sessionId: UUID,
            membershipId: UUID,
        ) = Unit

        override fun markRemovedFromCurrentSession(
            clubId: UUID,
            sessionId: UUID,
            membershipId: UUID,
        ) = Unit

        override fun findMembershipInClubForUpdate(
            clubId: UUID,
            membershipId: UUID,
        ): LifecycleMembershipRow? {
            mutationCalls += "find-membership"
            return if (clubId == this@MemberLifecycleServiceTest.clubId && membershipId == targetMembershipId) {
                LifecycleMembershipRow(
                    membershipId = targetMembershipId,
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
                    clubId = clubId,
                    email = "member@example.com",
                    displayName = "멤버",
                    accountName = "멤버계정",
                    profileImageUrl = null,
                    avatarKey = "mushroom-green-book",
                    role = role,
                    status = targetStatus,
                )
            } else {
                null
            }
        }

        override fun lockActiveHostRows(clubId: UUID) {
            mutationCalls += "lock-active-hosts"
        }

        override fun activeHostCount(clubId: UUID): Int {
            mutationCalls += "active-host-count"
            return activeHostCount
        }

        override fun findHostMemberListItem(
            clubId: UUID,
            membershipId: UUID,
        ): HostMemberListRow? =
            hostMemberListRow().takeIf {
                clubId == this@MemberLifecycleServiceTest.clubId && membershipId == targetMembershipId
            }

        private fun hostMemberListRow() =
            HostMemberListRow(
                membershipId = targetMembershipId,
                userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
                email = "member@example.com",
                displayName = "멤버",
                accountName = "멤버계정",
                profileImageUrl = null,
                avatarKey = "mushroom-green-book",
                role = role,
                status = targetStatus,
                joinedAt = null,
                createdAt = OffsetDateTime.parse("2026-01-01T00:00:00Z"),
                currentSessionId = null,
                participationStatus = SessionParticipationStatus.ACTIVE,
            )
    }

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }
}
