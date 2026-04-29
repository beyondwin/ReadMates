package com.readmates.auth.application.service

import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class MemberProfileServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201")

    @Test
    fun `evicts club content after own profile update`() {
        val store = RecordingMemberProfileStorePort()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = MemberProfileService(store, invalidation)

        val profile = service.updateOwnProfile("member@example.com", UpdateMemberProfileCommand("새이름"))

        assertEquals("새이름", profile.displayName)
        assertEquals(listOf(clubId), invalidation.clubs)
    }

    private inner class RecordingMemberProfileStorePort : MemberProfileStorePort {
        private var row = MemberProfileRow(
            membershipId = membershipId,
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            clubId = clubId,
            clubSlug = "reading-sai",
            email = "member@example.com",
            displayName = "멤버",
            accountName = "계정",
            profileImageUrl = null,
            role = MembershipRole.MEMBER,
            status = MembershipStatus.ACTIVE,
        )

        override fun findProfileMemberByEmail(email: String) =
            row.takeIf { it.email == email }

        override fun findProfileMemberByUserId(userId: UUID) =
            row.takeIf { it.userId == userId }

        override fun findProfileMemberInClubForUpdate(clubId: UUID, membershipId: UUID) =
            row.takeIf { it.clubId == clubId && it.membershipId == membershipId }

        override fun lockClubProfileNames(clubId: UUID) = row.clubId == clubId

        override fun displayNameExistsInClub(
            clubId: UUID,
            displayName: String,
            excludingMembershipId: UUID,
        ) = false

        override fun updateOwnDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean {
            row = row.copy(displayName = displayName)
            return true
        }

        override fun updateDisplayName(clubId: UUID, membershipId: UUID, displayName: String): Boolean {
            row = row.copy(displayName = displayName)
            return true
        }

        override fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow? = null
    }

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }
}
