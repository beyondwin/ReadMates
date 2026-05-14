package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.auth.application.port.out.BffSecretRotationAuditPort
import com.readmates.shared.security.ClientIpHashing
import com.readmates.shared.security.ClientIpHashingProperties
import com.readmates.shared.security.SecretComparator
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.task.TaskExecutor
import org.springframework.core.task.TaskRejectedException
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI

@Component
class BffSecretFilter(
    @param:Value("\${readmates.security.bff.secrets:}")
    private val configuredSecretsRaw: String,
    @param:Value("\${readmates.bff-secret:}")
    private val legacyExpectedSecret: String,
    @param:Value("\${readmates.bff-secret-required:true}")
    private val bffSecretRequired: Boolean,
    private val allowedOriginPort: AllowedOriginPort,
    private val ipHashingProperties: ClientIpHashingProperties = ClientIpHashingProperties(),
    @param:Autowired(required = false)
    private val auditPort: BffSecretRotationAuditPort? = null,
    @param:Value("\${readmates.security.bff.audit-mode:rotation-only}")
    private val auditModeRaw: String = "rotation-only",
    @param:Qualifier("bffSecretAuditExecutor")
    @param:Autowired(required = false)
    private val auditExecutor: TaskExecutor? = null,
) : OncePerRequestFilter() {
    private val auditMode = BffSecretAuditMode.from(auditModeRaw)

    private val secrets: List<String> =
        run {
            val fromList =
                configuredSecretsRaw
                    .split(',')
                    .map { it.trim() }
                    .filter { it.isNotBlank() }
            val fromLegacy =
                legacyExpectedSecret
                    .trim()
                    .takeIf { it.isNotBlank() }
                    ?.let { listOf(it) }
                    ?: emptyList()
            if (fromList.isNotEmpty()) fromList else fromLegacy
        }

    init {
        if (bffSecretRequired && secrets.isEmpty()) {
            throw IllegalStateException(
                "readmates.security.bff.secrets must contain at least one entry " +
                    "when readmates.bff-secret-required is true",
            )
        }
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (isApiRequest(request) && secrets.isNotEmpty()) {
            val provided = request.getHeader(BFF_SECRET_HEADER)
            val alias = provided?.let { aliasFor(it) }
            if (alias == null) {
                operationalLogger.warn(
                    "BFF secret rejected method={} path={} clientIp={}",
                    request.method,
                    request.requestURI,
                    request.remoteAddr,
                )
                response.status = HttpServletResponse.SC_UNAUTHORIZED
                return
            }
            auditAsync(alias, request)

            if (isMutatingRequest(request) && !hasAllowedOrigin(request)) {
                operationalLogger.warn(
                    "BFF mutating origin rejected method={} path={} clientIp={}",
                    request.method,
                    request.requestURI,
                    request.remoteAddr,
                )
                response.status = HttpServletResponse.SC_FORBIDDEN
                return
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun auditAsync(
        alias: String,
        request: HttpServletRequest,
    ) {
        val port = auditPort ?: return
        if (!auditMode.shouldRecord(alias)) {
            return
        }
        val executor =
            auditExecutor ?: run {
                operationalLogger.warn("BFF audit record skipped: bffSecretAuditExecutor is not configured")
                return
            }

        val clientIpHash =
            ClientIpHashing.hashClientIp(
                raw = request.remoteAddr,
                baseSecret = ipHashingProperties.baseSecret,
                requireNonBlankSecret = false,
            )
        val path = request.requestURI
        val task =
            Runnable {
                try {
                    port.recordUsage(alias, clientIpHash, path)
                } catch (ex: Exception) {
                    operationalLogger.warn("BFF audit record failed: {}", ex.message)
                }
            }

        try {
            executor.execute(task)
        } catch (ex: TaskRejectedException) {
            operationalLogger.warn("BFF audit record skipped: {}", ex.message)
        }
    }

    internal fun aliasFor(provided: String): String? =
        when (val idx = SecretComparator.firstMatchingIndex(provided, secrets)) {
            -1 -> null
            0 -> "primary"
            1 -> "secondary"
            else -> "index_$idx"
        }

    private fun hasAllowedOrigin(request: HttpServletRequest): Boolean {
        val origin =
            request.getHeader("Origin")?.toOrigin()
                ?: request.getHeader("Referer")?.toOrigin()
                ?: return false

        return allowedOriginPort.isAllowed(origin)
    }

    private fun isMutatingRequest(request: HttpServletRequest): Boolean = request.method in MUTATING_METHODS

    private fun isApiRequest(request: HttpServletRequest): Boolean {
        val servletPath = request.servletPath.orEmpty()
        val pathInfo = request.pathInfo.orEmpty()
        val path = "$servletPath$pathInfo"
        return path == "/api" || path.startsWith("/api/")
    }

    internal companion object {
        private val operationalLogger = LoggerFactory.getLogger(BffSecretFilter::class.java)
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")

        fun parseAllowedOrigins(
            allowedOrigins: String,
            appBaseUrl: String,
        ): Set<String> {
            val configuredOrigins =
                allowedOrigins
                    .split(',')
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
                    runCatching {
                        URI
                            .create(it)
                            .toURL()
                            .toURI()
                            .toString()
                            .trimEnd('/')
                    }.getOrNull()
                }?.let {
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
