package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.club.adapter.`in`.web.resolveClubContext
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.http.HttpServletRequest
import org.springframework.core.MethodParameter
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import org.springframework.web.server.ResponseStatusException

class CurrentMemberArgumentResolver(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
    private val resolveClubContextUseCase: ResolveClubContextUseCase = NoopResolveClubContextUseCase,
    private val checkSupportAccessGrantUseCase: CheckSupportAccessGrantUseCase? = null,
) : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        parameter.parameterType == CurrentMember::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): CurrentMember {
        val request = webRequest.getNativeRequest(HttpServletRequest::class.java)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val authentication = request.userPrincipal as? Authentication
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val email = authentication.emailOrNull()
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val requestedClubContext = request.resolveClubContext(resolveClubContextUseCase)
        if (requestedClubContext.supplied) {
            val clubContext = requestedClubContext.context
                ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)

            // Attempt normal membership resolution first
            val member = resolveCurrentMemberUseCase.resolveByEmailAndClub(email, clubContext.clubId)
            if (member != null) return member

            // No membership — check if MemberAuthoritiesFilter already resolved a support synthesis
            val userId = when (val principal = authentication.principal) {
                is CurrentMember -> principal.userId
                is CurrentUser -> principal.userId
                else -> null
            }
            if (userId != null) {
                // Check if MemberAuthoritiesFilter already resolved the synthesis for this request
                val cached = request.getAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR) as? SupportMemberSynthesis
                val synthesis = cached ?: checkSupportAccessGrantUseCase?.synthesizeHostCurrentMember(
                    userId = userId,
                    email = email,
                    clubId = clubContext.clubId,
                    clubSlug = clubContext.slug,
                    clubName = clubContext.name,
                )
                if (synthesis != null) {
                    return CurrentMember(
                        userId = userId,
                        membershipId = synthesis.membershipProxyId,
                        clubId = clubContext.clubId,
                        clubSlug = clubContext.slug,
                        email = email,
                        displayName = synthesis.displayName,
                        accountName = synthesis.accountName,
                        role = synthesis.role,
                        membershipStatus = synthesis.membershipStatus,
                        clubName = clubContext.name,
                    )
                }
            }

            throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        }

        return resolveCurrentMemberUseCase.resolveByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}

private object NoopResolveClubContextUseCase : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String): ResolvedClubContext? = null

    override fun resolveByHost(host: String?): ResolvedClubContext? = null
}
