package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.config.AiGenerationProperties
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Returns 503 Service Unavailable for AI generation endpoints when
 * `readmates.aigen.enabled=false`, so operators see the kill-switch reason
 * rather than 404 (the controllers themselves are gated by
 * `@ConditionalOnProperty` and would otherwise not be registered at all).
 *
 * Registered unconditionally so the filter can answer requests even when the
 * feature is disabled. Non-matching paths pass through untouched.
 */
@Component
class AiGenerationKillSwitchFilter(
    private val properties: AiGenerationProperties,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (!properties.enabled && request.requestURI.matchesAiGenerationPath()) {
            response.status = HttpStatus.SERVICE_UNAVAILABLE.value()
            response.contentType = PROBLEM_JSON_CONTENT_TYPE
            response.characterEncoding = Charsets.UTF_8.name()
            response.writer.write(DISABLED_PROBLEM_BODY)
            return
        }
        filterChain.doFilter(request, response)
    }

    private fun String.matchesAiGenerationPath(): Boolean =
        AI_GENERATE_PATH.matches(this) ||
            AI_DEFAULTS_PATH.matches(this) ||
            AI_ADMIN_OPS_PATH.matches(this)

    private companion object {
        const val PROBLEM_JSON_CONTENT_TYPE = "application/problem+json"
        const val DISABLED_PROBLEM_BODY =
            """{"type":"https://readmates.com/problems/aigen/disabled",""" +
                """"title":"AI generation is disabled",""" +
                """"status":503,""" +
                """"detail":"This endpoint is currently disabled by operator kill-switch.",""" +
                """"code":"AI_DISABLED"}"""
        val AI_GENERATE_PATH = Regex("^/api/host/sessions/[^/]+/ai-generate(/.*)?$")
        val AI_DEFAULTS_PATH = Regex("^/api/host/clubs/[^/]+/ai-defaults(/.*)?$")
        val AI_ADMIN_OPS_PATH = Regex("^/api/admin/ai-generation(/.*)?$")
    }
}
