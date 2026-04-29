package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.club.adapter.`in`.web.ClubContextHeader
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
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
        val requestedClubContext = request.resolveRequestedClubContext()
        if (requestedClubContext.supplied) {
            val clubContext = requestedClubContext.context
                ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
            return resolveCurrentMemberUseCase.resolveByEmailAndClub(email, clubContext.clubId)
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        }

        return resolveCurrentMemberUseCase.resolveByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }

    private fun HttpServletRequest.resolveRequestedClubContext(): RequestedClubContext {
        val slug = getHeader(ClubContextHeader.CLUB_SLUG)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (slug != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveBySlug(slug))
        }

        val host = getHeader(ClubContextHeader.CLUB_HOST)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (host != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveByHost(host))
        }

        return RequestedClubContext(supplied = false, context = null)
    }

    private data class RequestedClubContext(
        val supplied: Boolean,
        val context: ResolvedClubContext?,
    )
}

private object NoopResolveClubContextUseCase : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String): ResolvedClubContext? = null

    override fun resolveByHost(host: String?): ResolvedClubContext? = null
}
