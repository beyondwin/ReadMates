package com.readmates.shared.observability

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

class RequestIdFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val incoming = request.getHeader(HEADER)
        val id = if (incoming != null && ALLOWED.matches(incoming)) {
            incoming
        } else {
            UUID.randomUUID().toString().replace("-", "").take(12)
        }
        MDC.put(MDC_KEY, id)
        response.setHeader(HEADER, id)
        try {
            filterChain.doFilter(request, response)
        } finally {
            MDC.remove(MDC_KEY)
        }
    }

    companion object {
        const val HEADER = "X-Readmates-Request-Id"
        const val MDC_KEY = "requestId"
        private val ALLOWED = Regex("^[A-Za-z0-9-]{12,64}$")
    }
}
