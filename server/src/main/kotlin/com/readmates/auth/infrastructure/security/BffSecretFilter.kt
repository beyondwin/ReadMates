package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.auth.application.port.out.BffSecretRotationAuditPort
import com.readmates.shared.security.ClientIpHashing
import com.readmates.shared.security.ClientIpHashingProperties
import com.readmates.shared.security.SecretComparator
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.task.TaskExecutor
import org.springframework.core.task.TaskRejectedException
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.net.URI

@Component
@Suppress("LongParameterList")
class BffSecretFilter(
    @param:Value("\${readmates.security.bff.secrets:}")
    private val configuredSecretsRaw: String,
    @param:Value("\${readmates.bff-secret:}")
    private val legacyExpectedSecret: String,
    @param:Value("\${readmates.bff-secret-required:true}")
    private val bffSecretRequired: Boolean,
    private val allowedOriginPort: AllowedOriginPort,
    private val hostClientContractProperties: HostClientContractProperties = HostClientContractProperties(),
    private val ipHashingProperties: ClientIpHashingProperties = ClientIpHashingProperties(),
    @param:Autowired(required = false)
    private val auditPort: BffSecretRotationAuditPort? = null,
    @param:Value("\${readmates.security.bff.audit-mode:rotation-only}")
    private val auditModeRaw: String = "rotation-only",
    @param:Qualifier("bffSecretAuditExecutor")
    @param:Autowired(required = false)
    private val auditExecutor: TaskExecutor? = null,
    @param:Autowired(required = false)
    private val meterRegistry: MeterRegistry? = null,
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
        hostClientContractProperties.effectiveMode()
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

        val rejection = hostClientContractRejection(request)
        if (rejection != null) {
            operationalLogger.warn(
                "Host write client contract rejected method={}",
                request.method,
            )
            writeHostClientContractProblem(response, rejection)
        } else {
            filterChain.doFilter(request, response)
        }
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

    private fun isMutatingHostApi(request: HttpServletRequest): Boolean {
        if (!isMutatingRequest(request)) {
            return false
        }
        val path = request.requestPath()
        return path == HOST_API_ROOT || path.startsWith(HOST_API_PREFIX)
    }

    private fun hostClientContractRejection(request: HttpServletRequest): HostClientContractRejection? {
        if (!isMutatingHostApi(request)) {
            return null
        }
        val generation =
            ObservedHostClientGeneration.fromHeader(request.getHeader(CLIENT_CONTRACT_HEADER))
        val mode = hostClientContractProperties.effectiveMode()
        recordHostClientGeneration(mode, generation)
        return mode.rejectionFor(generation)
    }

    private fun recordHostClientGeneration(
        mode: HostClientContractMode,
        generation: ObservedHostClientGeneration,
    ) {
        val registry = meterRegistry ?: return
        val modeTag = mode.residueModeTag() ?: return
        Counter
            .builder(HOST_CLIENT_CONTRACT_METRIC)
            .description("Observed host write client contract generation on mutating /api/host requests")
            .tag("generation", generation.metricTag)
            .tag("mode", modeTag)
            .register(registry)
            .increment()
    }

    private fun writeHostClientContractProblem(
        response: HttpServletResponse,
        rejection: HostClientContractRejection,
    ) {
        response.status = rejection.status
        response.characterEncoding = Charsets.UTF_8.name()
        response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
        response.writer.write(
            buildString {
                append("""{"type":"about:blank","title":"""")
                append(rejection.title)
                append("""","status":""")
                append(rejection.status)
                append(""","detail":"""")
                append(HOST_CLIENT_CONTRACT_DETAIL)
                append("""","code":"""")
                append(rejection.code)
                append(""""}""")
            },
        )
    }

    private fun isApiRequest(request: HttpServletRequest): Boolean {
        val path = request.requestPath()
        return path == "/api" || path.startsWith("/api/")
    }

    private fun HttpServletRequest.requestPath(): String {
        val servletPathValue = servletPath.orEmpty()
        val pathInfoValue = pathInfo.orEmpty()
        return "$servletPathValue$pathInfoValue"
    }

    internal companion object {
        private val operationalLogger = LoggerFactory.getLogger(BffSecretFilter::class.java)
        const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
        const val CLIENT_CONTRACT_HEADER = "X-Readmates-Client-Contract"
        private const val HOST_API_ROOT = "/api/host"
        private const val HOST_API_PREFIX = "/api/host/"
        private const val HOST_CLIENT_CONTRACT_METRIC = "readmates.host.client_contract"
        private const val HOST_CLIENT_CONTRACT_DETAIL = "호스트 운영 화면을 최신 버전으로 새로고침해 주세요."
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
