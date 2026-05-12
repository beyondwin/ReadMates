package com.readmates.auth.application.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.CurrentMember
import java.util.UUID

/**
 * Unit tests for [DefaultAuthoritySynthesisService].
 *
 * All assertions use plain strings (authority names) — no Spring Security types.
 * This tests purely application logic: authority composition rules.
 */
class DefaultAuthoritySynthesisServiceTest {

    private val service: AuthoritySynthesisService = DefaultAuthoritySynthesisService()

    private val userId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000002")
    private val email = "user@example.com"

    private fun noClubContext() = ClubContextInput(
        supplied = false,
        clubId = null,
        clubSlug = null,
        clubName = null,
    )

    private fun suppliedKnownClubContext() = ClubContextInput(
        supplied = true,
        clubId = clubId,
        clubSlug = "my-club",
        clubName = "My Club",
    )

    private fun suppliedUnknownClubContext() = ClubContextInput(
        supplied = true,
        clubId = null,
        clubSlug = null,
        clubName = null,
    )

    private fun memberOf(role: MembershipRole, status: MembershipStatus = MembershipStatus.ACTIVE) =
        CurrentMember(
            userId = userId,
            membershipId = UUID.randomUUID(),
            clubId = clubId,
            clubSlug = "my-club",
            email = email,
            displayName = "Test User",
            accountName = "testuser",
            role = role,
            membershipStatus = status,
        )

    private fun fakeSynthesis() = SupportMemberSynthesis(
        membershipProxyId = UUID.randomUUID(),
        displayName = "Admin",
        accountName = "admin",
    )

    // -----------------------------------------------------------------------
    // 1. Member found → role added from membership, no synthesis
    // -----------------------------------------------------------------------

    @Test
    fun `active HOST member gets ROLE_HOST added`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_USER"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = memberOf(MembershipRole.HOST),
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_HOST" in result.authorities) {
            "Expected ROLE_HOST but got ${result.authorities}"
        }
        assertNull(result.supportSynthesisToAttach) {
            "No support synthesis should be attached when member is found"
        }
    }

    @Test
    fun `active MEMBER member gets ROLE_MEMBER added`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_USER"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = memberOf(MembershipRole.MEMBER),
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_MEMBER" in result.authorities) {
            "Expected ROLE_MEMBER but got ${result.authorities}"
        }
    }

    @Test
    fun `VIEWER membership status gets ROLE_VIEWER added instead of role`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_USER"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = memberOf(MembershipRole.MEMBER, MembershipStatus.VIEWER),
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_VIEWER" in result.authorities) {
            "Expected ROLE_VIEWER for VIEWER membership status, got ${result.authorities}"
        }
        assertFalse("ROLE_MEMBER" in result.authorities) {
            "ROLE_MEMBER must not be added when status is VIEWER, got ${result.authorities}"
        }
    }

    // -----------------------------------------------------------------------
    // 2. Incoming MEMBER_ROLE_AUTHORITIES are stripped before synthesis
    // -----------------------------------------------------------------------

    @Test
    fun `stale ROLE_HOST in incoming authorities is stripped when member has MEMBER role`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_USER", "ROLE_HOST"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = memberOf(MembershipRole.MEMBER),
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertFalse("ROLE_HOST" in result.authorities) {
            "Stale ROLE_HOST from incoming authorities must be stripped; got ${result.authorities}"
        }
        assertTrue("ROLE_MEMBER" in result.authorities) {
            "Expected fresh ROLE_MEMBER from member role; got ${result.authorities}"
        }
    }

    // -----------------------------------------------------------------------
    // 3. Platform admin + known club context + synthesis → ROLE_HOST added, synthesis attached
    // -----------------------------------------------------------------------

    @Test
    fun `platform admin with known club context and synthesis grant gets ROLE_HOST and synthesis attached`() {
        val synthesis = fakeSynthesis()
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = null,
            supportSynthesis = synthesis,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_HOST" in result.authorities) {
            "Expected ROLE_HOST for platform admin with synthesis grant; got ${result.authorities}"
        }
        assertNotNull(result.supportSynthesisToAttach) {
            "Expected synthesis to be attached; got null"
        }
        assertEquals(synthesis, result.supportSynthesisToAttach)
    }

    // -----------------------------------------------------------------------
    // 4. Platform admin + no club context → no ROLE_HOST, no synthesis
    // -----------------------------------------------------------------------

    @Test
    fun `platform admin with no club context does not get ROLE_HOST`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
            email = email,
            userId = userId,
            clubContext = noClubContext(),
            member = null,
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertFalse("ROLE_HOST" in result.authorities) {
            "ROLE_HOST must not be added when club context is not supplied; got ${result.authorities}"
        }
        assertNull(result.supportSynthesisToAttach)
    }

    // -----------------------------------------------------------------------
    // 5. Platform admin + slug supplied but unknown club (context=null) → no ROLE_HOST
    // -----------------------------------------------------------------------

    @Test
    fun `platform admin with supplied but unknown club context does not get ROLE_HOST`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
            email = email,
            userId = userId,
            clubContext = suppliedUnknownClubContext(),
            member = null,
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertFalse("ROLE_HOST" in result.authorities) {
            "ROLE_HOST must not be added when clubId is null (unknown club); got ${result.authorities}"
        }
        assertNull(result.supportSynthesisToAttach)
    }

    // -----------------------------------------------------------------------
    // 6. Platform admin + known club context but synthesis = null → no ROLE_HOST
    // -----------------------------------------------------------------------

    @Test
    fun `platform admin with known club but no synthesis grant does not get ROLE_HOST`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = null,
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertFalse("ROLE_HOST" in result.authorities) {
            "ROLE_HOST must not be added when there is no synthesis grant; got ${result.authorities}"
        }
        assertNull(result.supportSynthesisToAttach)
    }

    // -----------------------------------------------------------------------
    // 7. Regular user with no member, no admin → passthrough (no club roles)
    // -----------------------------------------------------------------------

    @Test
    fun `regular user with no member and no admin authority gets no club roles`() {
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_USER"),
            email = email,
            userId = userId,
            clubContext = noClubContext(),
            member = null,
            supportSynthesis = null,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_USER" in result.authorities) {
            "ROLE_USER must be preserved; got ${result.authorities}"
        }
        assertFalse("ROLE_HOST" in result.authorities)
        assertFalse("ROLE_MEMBER" in result.authorities)
        assertFalse("ROLE_VIEWER" in result.authorities)
        assertNull(result.supportSynthesisToAttach)
    }

    // -----------------------------------------------------------------------
    // 8. ROLE_PLATFORM_ADMIN is preserved (not in MEMBER_ROLE_AUTHORITIES)
    // -----------------------------------------------------------------------

    @Test
    fun `ROLE_PLATFORM_ADMIN is preserved through synthesis`() {
        val synthesis = fakeSynthesis()
        val request = AuthoritySynthesisRequest(
            incomingAuthorities = setOf("ROLE_PLATFORM_ADMIN"),
            email = email,
            userId = userId,
            clubContext = suppliedKnownClubContext(),
            member = null,
            supportSynthesis = synthesis,
        )

        val result = service.synthesize(request)

        assertTrue("ROLE_PLATFORM_ADMIN" in result.authorities) {
            "ROLE_PLATFORM_ADMIN must be preserved through synthesis; got ${result.authorities}"
        }
        assertTrue("ROLE_HOST" in result.authorities)
    }
}
