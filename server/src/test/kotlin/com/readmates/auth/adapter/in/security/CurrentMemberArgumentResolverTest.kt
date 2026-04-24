package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.context.request.ServletWebRequest
import java.util.UUID

class CurrentMemberArgumentResolverTest {
    private val member = CurrentMember(
        userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
        membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        email = "member@example.com",
        displayName = "멤버",
        accountName = "김멤버",
        role = MembershipRole.MEMBER,
        membershipStatus = MembershipStatus.ACTIVE,
    )

    @Test
    fun `supports CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val parameter = sampleMethodParameter("currentMemberEndpoint")

        assertTrue(resolver.supportsParameter(parameter))
    }

    @Test
    fun `does not support non CurrentMember parameters`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val parameter = sampleMethodParameter("stringEndpoint")

        assertFalse(resolver.supportsParameter(parameter))
    }

    @Test
    fun `resolves authenticated member from principal email`() {
        val resolver = CurrentMemberArgumentResolver(FakeResolveCurrentMemberUseCase(member))
        val request = MockHttpServletRequest()
        val authentication = UsernamePasswordAuthenticationToken("member@example.com", "password", emptyList())
        request.userPrincipal = authentication

        val resolved = resolver.resolveArgument(
            sampleMethodParameter("currentMemberEndpoint"),
            null,
            ServletWebRequest(request),
            null,
        )

        assertEquals(member, resolved)
    }

    private fun currentMemberEndpoint(member: CurrentMember) = member

    private fun stringEndpoint(value: String) = value

    private fun sampleMethodParameter(methodName: String): MethodParameter {
        val method = this::class.java.declaredMethods.first { it.name == methodName }
        return MethodParameter(method, 0)
    }

    private class FakeResolveCurrentMemberUseCase(
        private val member: CurrentMember?,
    ) : ResolveCurrentMemberUseCase {
        override fun resolveByEmail(email: String): CurrentMember? = member
    }
}
