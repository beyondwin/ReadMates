package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
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

class CurrentPlatformAdminArgumentResolver(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
) : HandlerMethodArgumentResolver {
    override fun supportsParameter(parameter: MethodParameter): Boolean =
        parameter.parameterType == CurrentPlatformAdmin::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): CurrentPlatformAdmin {
        val request = webRequest.getNativeRequest(HttpServletRequest::class.java)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val authentication = request.userPrincipal as? Authentication
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)

        val userId = when (val principal = authentication.principal) {
            is CurrentMember -> principal.userId
            is CurrentUser -> principal.userId
            else -> authentication.emailOrNull()
                ?.let(resolveCurrentMemberUseCase::findUserIdByEmail)
        } ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)

        return resolveCurrentMemberUseCase.findPlatformAdmin(userId)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
    }
}
