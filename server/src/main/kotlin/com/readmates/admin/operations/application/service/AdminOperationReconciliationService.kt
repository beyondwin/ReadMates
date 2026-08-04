package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceFreshness
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.NoOpAdminOperationMetricsPort
import com.readmates.admin.operations.application.port.out.WriteAdminOperationCasesPort
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.net.URI
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

data class AdminOperationReconciliationResult(
    val generatedAt: OffsetDateTime,
    val sources: List<AdminOperationSourceFreshness>,
)

@Service
class AdminOperationReconciliationService(
    private val providers: List<AdminOperationSignalProvider>,
    private val cases: WriteAdminOperationCasesPort,
    private val clock: Clock,
    metrics: AdminOperationMetricsPort? = null,
) {
    private val metrics = metrics ?: NoOpAdminOperationMetricsPort

    fun reconcile(admin: CurrentPlatformAdmin): AdminOperationReconciliationResult {
        val freshness =
            providers
                .sortedBy { it.sourceType.name }
                .map { provider -> reconcileProvider(provider, admin) }
        return AdminOperationReconciliationResult(
            generatedAt = OffsetDateTime.now(clock),
            sources = freshness,
        )
    }

    private fun reconcileProvider(
        provider: AdminOperationSignalProvider,
        admin: CurrentPlatformAdmin,
    ): AdminOperationSourceFreshness {
        val batch =
            runCatching {
                provider.collect(admin).also { collected ->
                    AdminOperationSignalBatchValidator.validate(provider.sourceType, collected)
                }
            }.getOrElse {
                return recordFreshness(unavailable(provider.sourceType))
            }
        return reconcileBatch(batch)
    }

    private fun reconcileBatch(batch: AdminOperationSignalBatch): AdminOperationSourceFreshness {
        val freshness = batch.toFreshness()
        cases.recordSourceFreshness(freshness)
        if (batch.status in SUCCESSFUL_SOURCE_STATUSES) {
            cases.reconcile(batch, OffsetDateTime.now(clock))
        }
        runCatching { metrics.recordReconciliation(freshness.sourceType, freshness.status) }
        return freshness
    }

    private fun recordFreshness(freshness: AdminOperationSourceFreshness): AdminOperationSourceFreshness {
        cases.recordSourceFreshness(freshness)
        runCatching { metrics.recordReconciliation(freshness.sourceType, freshness.status) }
        return freshness
    }

    private fun AdminOperationSignalBatch.toFreshness(): AdminOperationSourceFreshness =
        AdminOperationSourceFreshness(
            sourceType = sourceType,
            status = status,
            generatedAt = generatedAt,
            lastSuccessfulAt = generatedAt.takeIf { status in SUCCESSFUL_SOURCE_STATUSES },
            authoritative = authoritative,
        )

    private fun unavailable(sourceType: AdminOperationSourceType): AdminOperationSourceFreshness =
        AdminOperationSourceFreshness(
            sourceType = sourceType,
            status = AdminOperationSourceStatus.UNAVAILABLE,
            generatedAt = OffsetDateTime.now(clock),
            lastSuccessfulAt = null,
            authoritative = false,
        )
}

private object AdminOperationSignalBatchValidator {
    fun validate(
        providerSource: AdminOperationSourceType,
        batch: AdminOperationSignalBatch,
    ) {
        require(batch.sourceType == providerSource) { "Signal batch source ownership mismatch" }
        require(batch.status != AdminOperationSourceStatus.PARTIAL || !batch.authoritative) {
            "Partial signal batch cannot be authoritative"
        }
        require(
            batch.status in SUCCESSFUL_SOURCE_STATUSES ||
                (!batch.authoritative && batch.signals.isEmpty()),
        ) { "Unavailable or disabled signal batch must not contain signals" }

        val identities = mutableSetOf<String>()
        batch.signals.forEach { signal ->
            validateSignal(batch.sourceType, signal)
            require(identities.add(signal.sourceKey)) { "Duplicate signal identity" }
        }
    }

    private fun validateSignal(
        sourceType: AdminOperationSourceType,
        signal: AdminOperationSignal,
    ) {
        require(signal.sourceType == sourceType) { "Signal source ownership mismatch" }
        require(signal.sourceKey.isNotBlank() && signal.hasAllowlistedIdentity()) { "Invalid signal identity" }
        require(signal.summaryCode.isNotBlank() && signal.hasAllowlistedSummary()) { "Invalid signal summary" }
        require(signal.impactCount >= 0) { "Signal impact cannot be negative" }
        require(signal.detailHref.isSafeRelativeHref()) { "Unsafe signal detail link" }
    }

    private fun AdminOperationSignal.hasAllowlistedIdentity(): Boolean =
        when (sourceType) {
            AdminOperationSourceType.CLUB_READINESS -> sourceKey.hasUuidSuffix(CLUB_READINESS_PREFIX)
            AdminOperationSourceType.NOTIFICATION ->
                sourceKey == NOTIFICATION_PLATFORM_KEY || sourceKey.hasUuidSuffix(NOTIFICATION_CLUB_PREFIX)
            AdminOperationSourceType.AI_JOB -> sourceKey.hasUuidSuffix(AI_JOB_PREFIX)
            AdminOperationSourceType.CLOSING_RISK -> sourceKey.hasUuidSuffix(CLOSING_RISK_PREFIX)
        }

    private fun AdminOperationSignal.hasAllowlistedSummary(): Boolean =
        when (sourceType) {
            AdminOperationSourceType.CLUB_READINESS -> summaryCode in CLUB_READINESS_SUMMARIES
            AdminOperationSourceType.NOTIFICATION ->
                when {
                    sourceKey == NOTIFICATION_PLATFORM_KEY -> summaryCode == NOTIFICATION_PLATFORM_SUMMARY
                    else -> summaryCode == NOTIFICATION_CLUB_SUMMARY
                }
            AdminOperationSourceType.AI_JOB -> summaryCode in AI_JOB_SUMMARIES
            AdminOperationSourceType.CLOSING_RISK -> summaryCode == CLOSING_RISK_SUMMARY
        }

    private fun String.hasUuidSuffix(prefix: String): Boolean =
        takeIf { it.startsWith(prefix) }
            ?.removePrefix(prefix)
            ?.let { suffix ->
                runCatching { UUID.fromString(suffix) }
                    .getOrNull()
                    ?.toString() == suffix.lowercase()
            } == true

    private fun String.isSafeRelativeHref(): Boolean {
        val uri = runCatching { URI(this) }.getOrNull() ?: return false
        return hasSafeRelativeSyntax() && uri.hasSafeShape() && uri.rawPath.hasSafePathSegments()
    }

    private fun String.hasSafeRelativeSyntax(): Boolean = hasSafePrefix() && none { it.isISOControl() }

    private fun String.hasSafePrefix() = isNotBlank() && startsWith('/') && !startsWith("//") && !contains('\\')

    private fun URI.hasSafeShape() = !isAbsolute && rawAuthority == null && rawFragment == null && rawPath != null

    private fun String.hasSafePathSegments(): Boolean =
        split('/').none { it == "." || it == ".." } && !UNSAFE_ENCODED_PATH.containsMatchIn(this)

    private val CLUB_READINESS_SUMMARIES =
        setOf(
            "CLUB_SETUP_REQUIRED",
            "CLUB_DOMAIN_ACTION_REQUIRED",
            "CLUB_READY_TO_PUBLISH",
        )
    private val AI_JOB_SUMMARIES = setOf("AI_JOB_FAILED", "AI_JOB_STALE")
    private val UNSAFE_ENCODED_PATH = Regex("%(?:00|0[1-9a-f]|1[0-9a-f]|2e|2f|5c|7f|25)", RegexOption.IGNORE_CASE)
    private const val CLUB_READINESS_PREFIX = "CLUB_READINESS:"
    private const val NOTIFICATION_CLUB_PREFIX = "NOTIFICATION:CLUB:"
    private const val NOTIFICATION_PLATFORM_KEY = "NOTIFICATION:PLATFORM_BACKLOG"
    private const val NOTIFICATION_CLUB_SUMMARY = "NOTIFICATION_DELIVERY_FAILURE"
    private const val NOTIFICATION_PLATFORM_SUMMARY = "NOTIFICATION_PLATFORM_BACKLOG"
    private const val AI_JOB_PREFIX = "AI_JOB:"
    private const val CLOSING_RISK_PREFIX = "CLOSING_RISK:"
    private const val CLOSING_RISK_SUMMARY = "SESSION_CLOSING_BLOCKED"
}

private val SUCCESSFUL_SOURCE_STATUSES =
    setOf(
        AdminOperationSourceStatus.AVAILABLE,
        AdminOperationSourceStatus.PARTIAL,
    )
