package com.readmates.auth.application.service

import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.model.AuthoritySynthesisRequest
import com.readmates.auth.application.model.ClubContextInput
import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.UUID

class DefaultAuthoritySynthesisServiceTest {
    private val service: SynthesizeAuthoritiesUseCase = DefaultAuthoritySynthesisService()
    private val userId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000002")
    private val email = "user@example.com"

    @Test
    fun `role and status compatibility matrix keeps Spring authorities independent from actor capabilities`() {
        roleStatusRows().forEach { row ->
            val member = snapshot(role = row.role, status = row.status)

            val result =
                service.synthesize(
                    AuthoritySynthesisRequest(
                        incomingAuthorities = setOf("ROLE_USER", "ROLE_HOST", "ROLE_MEMBER", "ROLE_VIEWER"),
                        email = email,
                        userId = userId,
                        clubContext = knownClubContext(),
                        member = member,
                        supportSynthesis = null,
                    ),
                )

            assertEquals(setOf("ROLE_USER", row.expectedAuthority), result.authorities, row.description)
            assertNull(result.supportSynthesisToAttach, row.description)
            assertEquals(row.expectedCapabilities, member.actor.capabilities, row.description)
        }
    }

    @Test
    fun `suspended HOST retains ROLE_HOST despite no management capabilities`() {
        val member = snapshot(MembershipRole.HOST, MembershipStatus.SUSPENDED)

        val result =
            service.synthesize(
                AuthoritySynthesisRequest(
                    incomingAuthorities = setOf("ROLE_USER"),
                    email = email,
                    userId = userId,
                    clubContext = knownClubContext(),
                    member = member,
                    supportSynthesis = null,
                ),
            )

        assertEquals(setOf("ROLE_USER", "ROLE_HOST"), result.authorities)
        assertFalse(member.actor.can(ClubCapability.MANAGE_INVITATIONS))
        assertFalse(member.actor.can(ClubCapability.MANAGE_MEMBERS))
    }

    @Test
    fun `non-member loses stale member role authority`() {
        val result =
            service.synthesize(
                AuthoritySynthesisRequest(
                    incomingAuthorities = setOf("ROLE_USER", "ROLE_HOST"),
                    email = email,
                    userId = userId,
                    clubContext = knownClubContext(),
                    member = null,
                    supportSynthesis = null,
                ),
            )

        assertEquals(setOf("ROLE_USER"), result.authorities)
    }

    @Test
    fun `platform admin gets host authority only with a valid support synthesis`() {
        val synthesis =
            SupportMemberSynthesis(
                membershipProxyId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
                displayName = "Admin",
                accountName = "admin",
            )

        val result =
            service.synthesize(
                AuthoritySynthesisRequest(
                    incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
                    email = email,
                    userId = userId,
                    clubContext = knownClubContext(),
                    member = null,
                    supportSynthesis = synthesis,
                ),
            )

        assertEquals(setOf("ROLE_PLATFORM_ADMIN", "ROLE_HOST"), result.authorities)
        assertEquals(synthesis, result.supportSynthesisToAttach)
    }

    private fun knownClubContext() =
        ClubContextInput(
            supplied = true,
            clubId = clubId,
            clubSlug = "my-club",
            clubName = "My Club",
        )

    private fun snapshot(
        role: MembershipRole,
        status: MembershipStatus,
    ): AuthenticatedMemberSnapshot =
        AuthenticatedMemberSnapshot(
            actor =
                ClubActor(
                    userId = userId,
                    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000004"),
                    clubId = clubId,
                    clubSlug = "my-club",
                    capabilities = capabilitiesFor(role, status),
                ),
            email = email,
            displayName = "Test User",
            accountName = "testuser",
            clubName = "My Club",
            avatarKey = "mushroom-green-book",
            role = role,
            membershipStatus = status,
        )

    private fun capabilitiesFor(
        role: MembershipRole,
        status: MembershipStatus,
    ): Set<ClubCapability> =
        when (status) {
            MembershipStatus.VIEWER ->
                setOf(
                    ClubCapability.BROWSE_MEMBER_CONTENT,
                    ClubCapability.EDIT_OWN_PROFILE,
                    ClubCapability.VIEW_PENDING_APPROVAL,
                )
            MembershipStatus.ACTIVE ->
                setOf(
                    ClubCapability.BROWSE_MEMBER_CONTENT,
                    ClubCapability.EDIT_OWN_PROFILE,
                ) +
                    if (role == MembershipRole.HOST) {
                        setOf(ClubCapability.MANAGE_INVITATIONS, ClubCapability.MANAGE_MEMBERS)
                    } else {
                        emptySet()
                    }
            MembershipStatus.SUSPENDED ->
                setOf(ClubCapability.BROWSE_MEMBER_CONTENT, ClubCapability.EDIT_OWN_PROFILE)
            MembershipStatus.INVITED,
            MembershipStatus.LEFT,
            MembershipStatus.INACTIVE,
            -> emptySet()
        }

    private fun roleStatusRows() =
        listOf(
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.INVITED, "ROLE_HOST", emptySet()),
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.VIEWER, "ROLE_VIEWER", viewerCapabilities()),
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.ACTIVE, "ROLE_HOST", activeHostCapabilities()),
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.SUSPENDED, "ROLE_HOST", activeMemberCapabilities()),
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.LEFT, "ROLE_HOST", emptySet()),
            RoleStatusRow(MembershipRole.HOST, MembershipStatus.INACTIVE, "ROLE_HOST", emptySet()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.INVITED, "ROLE_MEMBER", emptySet()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.VIEWER, "ROLE_VIEWER", viewerCapabilities()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.ACTIVE, "ROLE_MEMBER", activeMemberCapabilities()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.SUSPENDED, "ROLE_MEMBER", activeMemberCapabilities()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.LEFT, "ROLE_MEMBER", emptySet()),
            RoleStatusRow(MembershipRole.MEMBER, MembershipStatus.INACTIVE, "ROLE_MEMBER", emptySet()),
        )

    private fun viewerCapabilities() =
        setOf(
            ClubCapability.BROWSE_MEMBER_CONTENT,
            ClubCapability.EDIT_OWN_PROFILE,
            ClubCapability.VIEW_PENDING_APPROVAL,
        )

    private fun activeMemberCapabilities(): Set<ClubCapability> =
        setOf(
            ClubCapability.BROWSE_MEMBER_CONTENT,
            ClubCapability.EDIT_OWN_PROFILE,
        )

    private fun activeHostCapabilities() =
        activeMemberCapabilities() + setOf(ClubCapability.MANAGE_INVITATIONS, ClubCapability.MANAGE_MEMBERS)

    private data class RoleStatusRow(
        val role: MembershipRole,
        val status: MembershipStatus,
        val expectedAuthority: String,
        val expectedCapabilities: Set<ClubCapability>,
    ) {
        val description: String
            get() = "$role/$status must synthesize $expectedAuthority"
    }
}
