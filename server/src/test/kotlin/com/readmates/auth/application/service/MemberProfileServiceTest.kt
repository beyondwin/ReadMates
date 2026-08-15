package com.readmates.auth.application.service

import com.readmates.auth.application.MemberProfileError
import com.readmates.auth.application.MemberProfileException
import com.readmates.auth.application.model.ReplaceOwnMemberProfileCommand
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
    fun `replaces own club profile with one normalized update`() {
        val store = RecordingMemberProfileStorePort()
        val invalidation = RecordingReadCacheInvalidationPort()
        val service = MemberProfileService(store, invalidation)

        val profile =
            service.replaceOwnProfile(
                " MEMBER@example.com ",
                clubId,
                ReplaceOwnMemberProfileCommand("  새이름  ", "  cloud-green-book  "),
            )

        assertEquals("새이름", profile.displayName)
        assertEquals("cloud-green-book", profile.avatarKey)
        assertEquals(
            listOf(OwnProfileUpdate(clubId, membershipId, "새이름", "cloud-green-book")),
            store.profileUpdates,
        )
        assertEquals(listOf(clubId), invalidation.clubs)
    }

    @Test
    fun `rejects invalid combined profile fields before writing`() {
        val cases =
            listOf(
                ReplaceOwnMemberProfileCommand(null, "cloud-green-book") to MemberProfileError.DISPLAY_NAME_REQUIRED,
                ReplaceOwnMemberProfileCommand("   ", "cloud-green-book") to MemberProfileError.DISPLAY_NAME_REQUIRED,
                ReplaceOwnMemberProfileCommand("member@example.com", "cloud-green-book") to
                    MemberProfileError.DISPLAY_NAME_INVALID,
                ReplaceOwnMemberProfileCommand("관리자", "cloud-green-book") to
                    MemberProfileError.DISPLAY_NAME_RESERVED,
                ReplaceOwnMemberProfileCommand("새이름", null) to MemberProfileError.AVATAR_KEY_REQUIRED,
                ReplaceOwnMemberProfileCommand("새이름", "   ") to MemberProfileError.AVATAR_KEY_REQUIRED,
                ReplaceOwnMemberProfileCommand("새이름", "hedgehog-green-mug") to
                    MemberProfileError.AVATAR_KEY_INVALID,
                ReplaceOwnMemberProfileCommand("새이름", "../cloud-green-book") to
                    MemberProfileError.AVATAR_KEY_INVALID,
                ReplaceOwnMemberProfileCommand("새이름", "CLOUD-GREEN-BOOK") to
                    MemberProfileError.AVATAR_KEY_INVALID,
            )

        cases.forEach { (command, expectedError) ->
            val store = RecordingMemberProfileStorePort()
            val invalidation = RecordingReadCacheInvalidationPort()

            val exception =
                assertThrows(MemberProfileException::class.java) {
                    MemberProfileService(store, invalidation).replaceOwnProfile("member@example.com", clubId, command)
                }

            assertEquals(expectedError, exception.error)
            assertEquals(emptyList<OwnProfileUpdate>(), store.profileUpdates)
            assertEquals(emptyList<UUID>(), invalidation.clubs)
        }
    }

    @Test
    fun `rejects duplicate combined profile name before writing`() {
        val store = RecordingMemberProfileStorePort(duplicateDisplayName = true)
        val invalidation = RecordingReadCacheInvalidationPort()

        val exception =
            assertThrows(MemberProfileException::class.java) {
                MemberProfileService(store, invalidation).replaceOwnProfile(
                    "member@example.com",
                    clubId,
                    ReplaceOwnMemberProfileCommand("새이름", "cloud-green-book"),
                )
            }

        assertEquals(MemberProfileError.DISPLAY_NAME_DUPLICATE, exception.error)
        assertEquals(emptyList<OwnProfileUpdate>(), store.profileUpdates)
        assertEquals(emptyList<UUID>(), invalidation.clubs)
    }

    @Test
    fun `rejects unauthenticated wrong-club and non-editable combined profile requests without writing`() {
        val otherClubId = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val cases =
            listOf(
                Triple(null, clubId, MembershipStatus.ACTIVE) to MemberProfileError.AUTHENTICATION_REQUIRED,
                Triple("member@example.com", otherClubId, MembershipStatus.ACTIVE) to
                    MemberProfileError.MEMBER_NOT_FOUND,
                Triple("member@example.com", clubId, MembershipStatus.LEFT) to
                    MemberProfileError.MEMBERSHIP_NOT_ALLOWED,
                Triple("member@example.com", clubId, MembershipStatus.INACTIVE) to
                    MemberProfileError.MEMBERSHIP_NOT_ALLOWED,
            )

        cases.forEach { (request, expectedError) ->
            val store = RecordingMemberProfileStorePort(status = request.third)
            val invalidation = RecordingReadCacheInvalidationPort()

            val exception =
                assertThrows(MemberProfileException::class.java) {
                    MemberProfileService(store, invalidation).replaceOwnProfile(
                        request.first,
                        request.second,
                        ReplaceOwnMemberProfileCommand("새이름", "cloud-green-book"),
                    )
                }

            assertEquals(expectedError, exception.error)
            assertEquals(emptyList<OwnProfileUpdate>(), store.profileUpdates)
            assertEquals(emptyList<UUID>(), invalidation.clubs)
        }
    }

    @Test
    fun `allows viewer active and suspended members to replace their combined profile`() {
        listOf(MembershipStatus.VIEWER, MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED).forEach { status ->
            val store = RecordingMemberProfileStorePort(status = status)

            val profile =
                MemberProfileService(store).replaceOwnProfile(
                    "member@example.com",
                    clubId,
                    ReplaceOwnMemberProfileCommand("새이름", "cloud-green-book"),
                )

            assertEquals("새이름", profile.displayName)
            assertEquals("cloud-green-book", profile.avatarKey)
            assertEquals(1, store.profileUpdates.size)
        }
    }

    @Test
    fun `rechecks locked membership when combined conditional update loses eligibility`() {
        val store =
            RecordingMemberProfileStorePort(
                updateOwnProfileResult = false,
                statusAfterFailedProfileUpdate = MembershipStatus.LEFT,
            )
        val invalidation = RecordingReadCacheInvalidationPort()

        val exception =
            assertThrows(MemberProfileException::class.java) {
                MemberProfileService(store, invalidation).replaceOwnProfile(
                    "member@example.com",
                    clubId,
                    ReplaceOwnMemberProfileCommand("새이름", "cloud-green-book"),
                )
            }

        assertEquals(MemberProfileError.MEMBERSHIP_NOT_ALLOWED, exception.error)
        assertEquals(emptyList<OwnProfileUpdate>(), store.profileUpdates)
        assertEquals(2, store.profileMemberForUpdateLookups)
        assertEquals(emptyList<UUID>(), invalidation.clubs)
    }

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
                UpdateMemberAvatarCommand("  balloon-green-book  "),
            )

        assertEquals(
            listOf(AvatarUpdate(clubId, membershipId, "balloon-green-book")),
            store.avatarUpdates,
        )
        assertEquals("balloon-green-book", profile.avatarKey)
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
        listOf("unknown-avatar-key", "../balloon-green-book", "HEDGEHOG-GREEN-MUG").forEach { avatarKey ->
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
                        UpdateMemberAvatarCommand("balloon-green-book"),
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
                UpdateMemberAvatarCommand("balloon-green-book"),
            )

        assertEquals("balloon-green-book", profile.avatarKey)
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
                    UpdateMemberAvatarCommand("balloon-green-book"),
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
                    UpdateMemberAvatarCommand("balloon-green-book"),
                )
            }

        assertEquals(MemberProfileError.MEMBERSHIP_NOT_ALLOWED, exception.error)
        assertEquals(1, store.profileMemberForUpdateLookups)
    }

    private inner class RecordingMemberProfileStorePort(
        status: MembershipStatus = MembershipStatus.ACTIVE,
        private val updateOwnAvatarResult: Boolean = true,
        private val statusAfterFailedAvatarUpdate: MembershipStatus? = null,
        private val duplicateDisplayName: Boolean = false,
        private val updateOwnProfileResult: Boolean = true,
        private val statusAfterFailedProfileUpdate: MembershipStatus? = null,
    ) : MemberProfileStorePort {
        val avatarUpdates = mutableListOf<AvatarUpdate>()
        val profileUpdates = mutableListOf<OwnProfileUpdate>()
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
                avatarKey = "mushroom-green-book",
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
        ) = duplicateDisplayName

        override fun updateOwnProfile(
            clubId: UUID,
            membershipId: UUID,
            displayName: String,
            avatarKey: String,
        ): Boolean {
            if (updateOwnProfileResult) {
                profileUpdates += OwnProfileUpdate(clubId, membershipId, displayName, avatarKey)
                row = row.copy(displayName = displayName, avatarKey = avatarKey)
            } else if (statusAfterFailedProfileUpdate != null) {
                row = row.copy(status = statusAfterFailedProfileUpdate)
            }
            return updateOwnProfileResult
        }

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

    private data class OwnProfileUpdate(
        val clubId: UUID,
        val membershipId: UUID,
        val displayName: String,
        val avatarKey: String,
    )

    private class RecordingReadCacheInvalidationPort : ReadCacheInvalidationPort {
        val clubs = mutableListOf<UUID>()

        override fun evictClubContent(clubId: UUID) {
            clubs += clubId
        }
    }
}
