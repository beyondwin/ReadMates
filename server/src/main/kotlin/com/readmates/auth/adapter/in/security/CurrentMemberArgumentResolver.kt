package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
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
        return resolveCurrentMemberUseCase.resolveByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
