package com.readmates.auth.infrastructure.security

import com.readmates.shared.security.HostAuthorityLossCode
import com.readmates.shared.security.HostAuthorityLossContract
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.web.access.AccessDeniedHandler
import org.springframework.security.web.access.AccessDeniedHandlerImpl
import org.springframework.stereotype.Component

@Component
class HostAuthorityLossAccessDeniedHandler : AccessDeniedHandler {
    private val fallback = AccessDeniedHandlerImpl()

    override fun handle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        accessDeniedException: AccessDeniedException,
    ) {
        val code = request.getAttribute(HostAuthorityLossContract.REQUEST_ATTRIBUTE) as? HostAuthorityLossCode
        if (code == null) {
            fallback.handle(request, response, accessDeniedException)
            return
        }

        response.status = HttpServletResponse.SC_FORBIDDEN
        response.characterEncoding = Charsets.UTF_8.name()
        response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store")
        response.writer.write(code.problemJson())
    }
}

private fun HostAuthorityLossCode.problemJson(): String =
    """{"type":"about:blank","title":"Forbidden","status":403,"detail":"$detail","code":"$name"}"""
