@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.context.request.ServletWebRequest
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class CurrentPlatformAdminArgumentResolverTest {
    @Test
    fun `supports CurrentPlatformAdmin parameters`() {
        val resolver = CurrentPlatformAdminArgumentResolver(FakeResolveCurrentMemberUseCase())
        val parameter = sampleMethodParameter("currentPlatformAdminEndpoint")

        assertTrue(resolver.supportsParameter(parameter))
    }

    @Test
    fun `does not support non CurrentPlatformAdmin parameters`() {
        val resolver = CurrentPlatformAdminArgumentResolver(FakeResolveCurrentMemberUseCase())
        val parameter = sampleMethodParameter("stringEndpoint")

        assertFalse(resolver.supportsParameter(parameter))
    }

    @Test
    fun `resolves active platform admin from CurrentUser principal`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(platformAdmin = ACTIVE_ADMIN)
        val resolver = CurrentPlatformAdminArgumentResolver(resolveMembers)
        val request = authenticatedRequest(CurrentUser(ADMIN_USER_ID, ADMIN_EMAIL))

        val resolved =
            resolver.resolveArgument(
                sampleMethodParameter("currentPlatformAdminEndpoint"),
                null,
                ServletWebRequest(request),
                null,
            )

        assertEquals(ACTIVE_ADMIN, resolved)
        assertEquals(1, resolveMembers.platformAdminLookups)
        assertEquals(ADMIN_USER_ID, resolveMembers.lastLookedUpUserId)
    }

    @Test
    fun `inactive or missing platform admin is forbidden`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(platformAdmin = null)
        val resolver = CurrentPlatformAdminArgumentResolver(resolveMembers)
        val request = authenticatedRequest(CurrentUser(ADMIN_USER_ID, ADMIN_EMAIL))

        val error =
            assertThrows<ResponseStatusException> {
                resolver.resolveArgument(
                    sampleMethodParameter("currentPlatformAdminEndpoint"),
                    null,
                    ServletWebRequest(request),
                    null,
                )
            }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(1, resolveMembers.platformAdminLookups)
        assertEquals(ADMIN_USER_ID, resolveMembers.lastLookedUpUserId)
    }

    @Test
    fun `host member without platform admin is forbidden`() {
        val resolveMembers = FakeResolveCurrentMemberUseCase(platformAdmin = null)
        val resolver = CurrentPlatformAdminArgumentResolver(resolveMembers)
        val request = authenticatedRequest(HOST_MEMBER)

        val error =
            assertThrows<ResponseStatusException> {
                resolver.resolveArgument(
                    sampleMethodParameter("currentPlatformAdminEndpoint"),
                    null,
                    ServletWebRequest(request),
                    null,
                )
            }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
        assertEquals(HOST_MEMBER.userId, resolveMembers.lastLookedUpUserId)
    }

    @Test
    fun `unauthenticated request is unauthorized`() {
        val resolver = CurrentPlatformAdminArgumentResolver(FakeResolveCurrentMemberUseCase())
        val request = MockHttpServletRequest()

        val error =
            assertThrows<ResponseStatusException> {
                resolver.resolveArgument(
                    sampleMethodParameter("currentPlatformAdminEndpoint"),
                    null,
                    ServletWebRequest(request),
                    null,
                )
            }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Suppress("UNUSED_PARAMETER")
    private fun currentPlatformAdminEndpoint(admin: CurrentPlatformAdmin) = admin

    @Suppress("UNUSED_PARAMETER")
    private fun stringEndpoint(value: String) = value

    private fun sampleMethodParameter(methodName: String): MethodParameter {
        val method = this::class.java.declaredMethods.first { it.name == methodName }
        return MethodParameter(method, 0)
    }

    private fun authenticatedRequest(principal: Any): MockHttpServletRequest {
        val request = MockHttpServletRequest()
        request.userPrincipal = UsernamePasswordAuthenticationToken(principal, null, emptyList())
        return request
    }

    private class FakeResolveCurrentMemberUseCase(
        private val platformAdmin: CurrentPlatformAdmin? = null,
    ) : ResolveCurrentMemberUseCase {
        var platformAdminLookups = 0
            private set
        var lastLookedUpUserId: UUID? = null
            private set

        override fun resolveByEmail(email: String): CurrentMember? = null

        override fun findUserIdByEmail(email: String): UUID? = platformAdmin?.userId

        override fun resolveByUserAndClub(
            userId: UUID,
            clubId: UUID,
        ): CurrentMember? = null

        override fun resolveByEmailAndClub(
            email: String,
            clubId: UUID,
        ): CurrentMember? = null

        override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()

        override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? {
            platformAdminLookups += 1
            lastLookedUpUserId = userId
            return platformAdmin?.takeIf { it.userId == userId }
        }
    }

    private companion object {
        val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        const val ADMIN_EMAIL = "admin@example.com"
        val ACTIVE_ADMIN =
            CurrentPlatformAdmin(
                userId = ADMIN_USER_ID,
                email = ADMIN_EMAIL,
                role = PlatformAdminRole.OWNER,
            )
        val HOST_MEMBER =
            CurrentMember(
                userId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
                membershipId = UUID.fromString("00000000-0000-0000-0000-000000000202"),
                clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                clubSlug = "reading-sai",
                email = "host@example.com",
                displayName = "Host",
                accountName = "Host Account",
                role = MembershipRole.HOST,
                membershipStatus = MembershipStatus.ACTIVE,
            )
    }
}
