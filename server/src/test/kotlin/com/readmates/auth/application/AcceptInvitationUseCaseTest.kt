package com.readmates.auth.application.service

import com.readmates.auth.application.port.out.GoogleAccountStorePort
import com.readmates.auth.application.port.out.HostInvitationStorePort
import com.readmates.auth.application.port.out.InvitationTokenRow
import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AcceptInvitationUseCaseTest {
    @Test
    fun `keeps invitation pending when google email does not match`() {
        val result =
            AcceptInvitationUseCase.validateEmailMatch(
                invitedEmail = "member@example.com",
                googleEmail = "other@example.com",
            )

        assertEquals(InvitationStatus.PENDING, result)
    }

    @Test
    @Suppress("LongMethod")
    fun `allocates club avatar before persisting accepted membership`() {
        val invitationStore = mock(HostInvitationStorePort::class.java)
        val memberIdentityLookup = mock(MemberIdentityLookupPort::class.java)
        val googleAccountStore = mock(GoogleAccountStorePort::class.java)
        val avatarAllocation = mock(MemberAvatarAllocationPort::class.java)
        val tokenService = InvitationTokenService()
        val clubId = UUID.randomUUID()
        val invitationId = UUID.randomUUID()
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val allocatedKey = BookClubAvatarKey.FOX_GLASSES_MUG
        val invitation =
            InvitationTokenRow(
                id = invitationId,
                clubId = clubId,
                clubSlug = "reading-sai",
                clubName = "Reading Sai",
                email = "invited.avatar@example.com",
                name = "Invited Avatar",
                role = MembershipRole.MEMBER,
                status = InvitationStatus.PENDING,
                expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1),
                applyToCurrentSession = false,
            )
        val currentMember =
            CurrentMember(
                userId = userId,
                membershipId = membershipId,
                clubId = clubId,
                clubSlug = invitation.clubSlug,
                email = invitation.email,
                displayName = invitation.name,
                accountName = invitation.name,
                role = invitation.role,
                membershipStatus = MembershipStatus.ACTIVE,
                avatarKey = allocatedKey.wireValue,
            )
        val rawToken = "accepted-avatar-token"
        `when`(invitationStore.findInvitationByTokenHash(tokenService.hashToken(rawToken), true)).thenReturn(invitation)
        `when`(memberIdentityLookup.findAnyUserIdByEmail(invitation.email)).thenReturn(userId)
        `when`(googleAccountStore.connectGoogleSubject(userId, "google-invited-avatar", null)).thenReturn(true)
        `when`(avatarAllocation.allocate(clubId, userId)).thenReturn(allocatedKey)
        `when`(
            invitationStore.upsertActiveMembership(clubId, userId, invitation.role, allocatedKey),
        ).thenReturn(membershipId)
        `when`(invitationStore.acceptInvitation(invitationId, userId)).thenReturn(true)
        `when`(invitationStore.findCurrentMember(membershipId)).thenReturn(currentMember)
        val service =
            InvitationService(
                invitationStore,
                tokenService,
                memberIdentityLookup,
                googleAccountStore,
                avatarAllocation,
                "http://localhost:3000",
            )

        val actual =
            service.acceptGoogleInvitation(
                rawToken = rawToken,
                googleSubjectId = "google-invited-avatar",
                email = invitation.email,
                displayName = invitation.name,
                profileImageUrl = null,
            )

        assertEquals(currentMember, actual)
        inOrder(avatarAllocation, invitationStore).apply {
            verify(avatarAllocation).allocate(clubId, userId)
            verify(invitationStore).upsertActiveMembership(clubId, userId, invitation.role, allocatedKey)
        }
    }
}
