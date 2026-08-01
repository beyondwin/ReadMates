package com.readmates.auth.application.service

import com.readmates.auth.application.model.UpdateMemberAvatarCommand
import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
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

    @Test
    fun `updates own avatar after trimming a valid avatar key`() {
        val store = RecordingMemberProfileStorePort()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = MemberProfileService(store, invalidation)

        val profile =
            service.updateOwnAvatar(
                "member@example.com",
                clubId,
                UpdateMemberAvatarCommand("  hedgehog-green-mug  "),
            )

        assertEquals(
            listOf(AvatarUpdate(clubId, membershipId, "hedgehog-green-mug")),
            store.avatarUpdates,
        )
        assertEquals("hedgehog-green-mug", profile.avatarKey)
        assertEquals(listOf(clubId), invalidation.clubs)
    }

    @Test
    fun `rejects missing avatar keys`() {
        listOf(null, "   ").forEach { avatarKey ->
            val exception =
                assertThrows(MemberProfileException::class.java) {
                    MemberProfileService(RecordingMemberProfileStorePort()).updateOwnAvatar(
                        "member@example.com",
                        clubId,
                        UpdateMemberAvatarCommand(avatarKey),
                    )
                }

            assertEquals(MemberProfileError.AVATAR_KEY_REQUIRED, exception.error)
        }
    }

    @Test
    fun `rejects unknown traversal and uppercase avatar keys`() {
        listOf("unknown-avatar-key", "../hedgehog-green-mug", "HEDGEHOG-GREEN-MUG").forEach { avatarKey ->
            val exception =
                assertThrows(MemberProfileException::class.java) {
                    MemberProfileService(RecordingMemberProfileStorePort()).updateOwnAvatar(
                        "member@example.com",
                        clubId,
                        UpdateMemberAvatarCommand(avatarKey),
                    )
                }

            assertEquals(MemberProfileError.AVATAR_KEY_INVALID, exception.error)
        }
    }

    @Test
    fun `rejects left and inactive members from changing their own avatar`() {
        listOf(MembershipStatus.LEFT, MembershipStatus.INACTIVE).forEach { status ->
            val exception =
                assertThrows(MemberProfileException::class.java) {
                    MemberProfileService(RecordingMemberProfileStorePort(status = status)).updateOwnAvatar(
                        "member@example.com",
                        clubId,
                        UpdateMemberAvatarCommand("hedgehog-green-mug"),
                    )
                }

            assertEquals(MemberProfileError.MEMBERSHIP_NOT_ALLOWED, exception.error)
        }
    }

    @Test
    fun `allows suspended members to change their own avatar`() {
        val store = RecordingMemberProfileStorePort(status = MembershipStatus.SUSPENDED)

        val profile =
            MemberProfileService(store).updateOwnAvatar(
                "member@example.com",
                clubId,
                UpdateMemberAvatarCommand("hedgehog-green-mug"),
            )

        assertEquals("hedgehog-green-mug", profile.avatarKey)
    }

    @Test
    fun `rechecks membership status when conditional avatar update affects no row`() {
        val store = RecordingMemberProfileStorePort(updateOwnAvatarResult = false)
        val service = MemberProfileService(store)

        val exception =
            assertThrows(MemberProfileException::class.java) {
                service.updateOwnAvatar(
                    "member@example.com",
                    clubId,
                    UpdateMemberAvatarCommand("hedgehog-green-mug"),
                )
            }

        assertEquals(MemberProfileError.MEMBER_NOT_FOUND, exception.error)
        assertEquals(1, store.profileMemberForUpdateLookups)
    }

    @Test
    fun `maps a conditional avatar update status transition to membership not allowed`() {
        val store =
            RecordingMemberProfileStorePort(
                updateOwnAvatarResult = false,
                statusAfterFailedAvatarUpdate = MembershipStatus.LEFT,
            )
        val service = MemberProfileService(store)

        val exception =
            assertThrows(MemberProfileException::class.java) {
                service.updateOwnAvatar(
                    "member@example.com",
                    clubId,
                    UpdateMemberAvatarCommand("hedgehog-green-mug"),
                )
            }

        assertEquals(MemberProfileError.MEMBERSHIP_NOT_ALLOWED, exception.error)
        assertEquals(1, store.profileMemberForUpdateLookups)
    }

    private inner class RecordingMemberProfileStorePort(
        status: MembershipStatus = MembershipStatus.ACTIVE,
        private val updateOwnAvatarResult: Boolean = true,
        private val statusAfterFailedAvatarUpdate: MembershipStatus? = null,
    ) : MemberProfileStorePort {
        val avatarUpdates = mutableListOf<AvatarUpdate>()
        var profileMemberForUpdateLookups = 0

        private var row =
            MemberProfileRow(
                membershipId = membershipId,
                userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
                clubId = clubId,
                clubSlug = "reading-sai",
                email = "member@example.com",
                displayName = "멤버",
                accountName = "계정",
                profileImageUrl = null,
                avatarKey = "squirrel-acorn",
                role = MembershipRole.MEMBER,
                status = status,
            )

        override fun findProfileMemberByEmail(
            email: String,
            clubId: UUID?,
        ) = row.takeIf { it.email == email && (clubId == null || it.clubId == clubId) }

        override fun findProfileMemberByUserId(userId: UUID) = row.takeIf { it.userId == userId }

        override fun findProfileMemberInClubForUpdate(
            clubId: UUID,
            membershipId: UUID,
        ): MemberProfileRow? {
            profileMemberForUpdateLookups += 1
            return row.takeIf { it.clubId == clubId && it.membershipId == membershipId }
        }

        override fun lockClubProfileNames(clubId: UUID) = row.clubId == clubId

        override fun displayNameExistsInClub(
            clubId: UUID,
            displayName: String,
            excludingMembershipId: UUID,
        ) = false

        override fun updateOwnDisplayName(
            clubId: UUID,
            membershipId: UUID,
            displayName: String,
        ): Boolean {
            row = row.copy(displayName = displayName)
            return true
        }

        override fun updateOwnAvatarKey(
            clubId: UUID,
            membershipId: UUID,
            avatarKey: String,
        ): Boolean {
            avatarUpdates += AvatarUpdate(clubId, membershipId, avatarKey)
            if (updateOwnAvatarResult) {
                row = row.copy(avatarKey = avatarKey)
            } else if (statusAfterFailedAvatarUpdate != null) {
                row = row.copy(status = statusAfterFailedAvatarUpdate)
            }
            return updateOwnAvatarResult
        }

        override fun updateDisplayName(
            clubId: UUID,
            membershipId: UUID,
            displayName: String,
        ): Boolean {
            row = row.copy(displayName = displayName)
            return true
        }

        override fun findHostMemberListItem(
            clubId: UUID,
            membershipId: UUID,
        ): HostMemberListRow? = null
    }

    private data class AvatarUpdate(
        val clubId: UUID,
        val membershipId: UUID,
        val avatarKey: String,
    )

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }
}
