package com.readmates.auth.application

import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.LifecycleMembershipRow
import com.readmates.auth.application.port.out.MemberLifecycleStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class MemberLifecycleServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val hostMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")
    private val targetMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000202")
    private val host = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = hostMembershipId,
        clubId = clubId,
        email = "host@example.com",
        displayName = "호스트",
        accountName = "호스트계정",
        role = MembershipRole.HOST,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `evicts club content after member lifecycle mutation`() {
        val store = RecordingMemberLifecycleStorePort()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = MemberLifecycleService(store, invalidation)

        val response = service.suspend(host, targetMembershipId, MemberLifecycleRequest())

        assertEquals(MembershipStatus.SUSPENDED, response.member.status)
        assertEquals(listOf(clubId), invalidation.clubs)
    }

    private inner class RecordingMemberLifecycleStorePort : MemberLifecycleStorePort {
        private var targetStatus = MembershipStatus.ACTIVE

        override fun listMembers(clubId: UUID): List<HostMemberListRow> =
            listOf(hostMemberListRow())

        override fun suspendActiveMember(clubId: UUID, membershipId: UUID): Boolean {
            targetStatus = MembershipStatus.SUSPENDED
            return true
        }

        override fun restoreSuspendedMember(clubId: UUID, membershipId: UUID): Boolean {
            targetStatus = MembershipStatus.ACTIVE
            return true
        }

        override fun markMemberLeftByHost(clubId: UUID, membershipId: UUID): Boolean {
            targetStatus = MembershipStatus.LEFT
            return true
        }

        override fun markMembershipLeft(clubId: UUID, membershipId: UUID): Boolean {
            targetStatus = MembershipStatus.LEFT
            return true
        }

        override fun findCurrentOpenSessionId(clubId: UUID): UUID? = null

        override fun addToCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID) = Unit

        override fun markRemovedFromCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID) = Unit

        override fun findMembershipInClubForUpdate(clubId: UUID, membershipId: UUID): LifecycleMembershipRow? =
            if (clubId == this@MemberLifecycleServiceTest.clubId && membershipId == targetMembershipId) {
                LifecycleMembershipRow(
                    membershipId = targetMembershipId,
                    userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
                    clubId = clubId,
                    email = "member@example.com",
                    displayName = "멤버",
                    accountName = "멤버계정",
                    profileImageUrl = null,
                    role = MembershipRole.MEMBER,
                    status = targetStatus,
                )
            } else {
                null
            }

        override fun lockActiveHostRows(clubId: UUID) = Unit

        override fun activeHostCount(clubId: UUID) = 2

        override fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow? =
            hostMemberListRow().takeIf {
                clubId == this@MemberLifecycleServiceTest.clubId && membershipId == targetMembershipId
            }

        private fun hostMemberListRow() = HostMemberListRow(
            membershipId = targetMembershipId,
            userId = UUID.fromString("00000000-0000-0000-0000-000000000102"),
            email = "member@example.com",
            displayName = "멤버",
            accountName = "멤버계정",
            profileImageUrl = null,
            role = MembershipRole.MEMBER,
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
