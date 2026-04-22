package com.readmates.auth.infrastructure.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
import org.springframework.core.env.StandardEnvironment
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@Component
class BffSecretFilter(
    @param:Value("\${readmates.bff-secret:}")
    private val expectedSecret: String,
    private val environment: Environment = StandardEnvironment(),
    @Value("\${readmates.allowed-origins:}")
    allowedOrigins: String = "",
    @Value("\${readmates.app-base-url:http://localhost:3000}")
    appBaseUrl: String = "http://localhost:3000",
    @param:Value("\${readmates.bff-secret-required:true}")
    private val bffSecretRequired: Boolean = true,
) : OncePerRequestFilter() {
    private val allowedOriginSet = parseAllowedOrigins(allowedOrigins, appBaseUrl)

    init {
        if (bffSecretRequired && expectedSecret.trim().isBlank()) {
            throw IllegalStateException("readmates.bff-secret must be configured when readmates.bff-secret-required is true")
        }
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val expected = expectedSecret.trim()
        if (isApiRequest(request) && expected.isNotBlank()) {
            val provided = request.getHeader(BFF_SECRET_HEADER)
            if (provided == null || !secretMatches(provided, expected)) {
                response.status = HttpServletResponse.SC_UNAUTHORIZED
                return
            }

            if (isMutatingRequest(request) && !hasAllowedOrigin(request)) {
                response.status = HttpServletResponse.SC_FORBIDDEN
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun secretMatches(provided: String, expected: String): Boolean =
        MessageDigest.isEqual(
            provided.toByteArray(StandardCharsets.UTF_8),
            expected.toByteArray(StandardCharsets.UTF_8),
        )

    private fun hasAllowedOrigin(request: HttpServletRequest): Boolean {
        val origin = request.getHeader("Origin")?.toOrigin()
            ?: request.getHeader("Referer")?.toOrigin()
            ?: return false

        return origin in allowedOriginSet
    }

    private fun isMutatingRequest(request: HttpServletRequest): Boolean =
        request.method in MUTATING_METHODS

    private fun isApiRequest(request: HttpServletRequest): Boolean {
        val servletPath = request.servletPath.orEmpty()
        val pathInfo = request.pathInfo.orEmpty()
        val path = "$servletPath$pathInfo"
        return path == "/api" || path.startsWith("/api/")
    }

    private companion object {
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")

        fun parseAllowedOrigins(allowedOrigins: String, appBaseUrl: String): Set<String> {
            val configuredOrigins = allowedOrigins.split(',')
                .mapNotNull { it.toOrigin() }
                .toSet()

            return configuredOrigins.ifEmpty {
                setOfNotNull(appBaseUrl.toOrigin())
            }
        }

        fun String.toOrigin(): String? =
            trim()
                .takeIf { it.isNotEmpty() }
                ?.let {
                    runCatching { URI.create(it).toURL().toURI().toString().trimEnd('/') }.getOrNull()
                }
                ?.let {
                    runCatching {
                        val uri = URI.create(it)
                        val scheme = uri.scheme ?: return@runCatching null
                        val host = uri.host ?: return@runCatching null
                        val port = if (uri.port == -1) "" else ":${uri.port}"
                        "$scheme://$host$port"
                    }.getOrNull()
                }
    }
}
