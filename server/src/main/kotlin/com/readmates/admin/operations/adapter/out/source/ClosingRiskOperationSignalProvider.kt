package com.readmates.admin.operations.adapter.out.source

import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class ClosingRiskOperationSignalProvider(
    private val closingRisksUseCase: ListAdminTodayClosingRisksUseCase,
) : AdminOperationSignalProvider {
    override val sourceType = AdminOperationSourceType.CLOSING_RISK

    override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
        val snapshot = closingRisksUseCase.todayClosingRisks(admin)
        val authoritative = snapshot.items.size < CLOSING_RISK_LIMIT
        return AdminOperationSignalBatch(
            sourceType = sourceType,
            status = if (authoritative) AdminOperationSourceStatus.AVAILABLE else AdminOperationSourceStatus.PARTIAL,
            generatedAt = snapshot.generatedAt,
            authoritative = authoritative,
            signals = snapshot.items.map { it.toSignal(snapshot.generatedAt) },
        )
    }

    @Suppress("ReturnCount")
    override fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification {
        val sessionId = sourceKey.closingRiskId() ?: return AdminOperationSignalVerification.ABSENT
        val snapshot = closingRisksUseCase.todayClosingRisks(admin)
        if (snapshot.items.any { it.sessionId == sessionId }) {
            return AdminOperationSignalVerification.ACTIVE
        }
        return if (snapshot.items.size < CLOSING_RISK_LIMIT) {
            AdminOperationSignalVerification.ABSENT
        } else {
            AdminOperationSignalVerification.UNAVAILABLE
        }
    }

    private fun AdminTodayClosingRiskItem.toSignal(observedAt: OffsetDateTime): AdminOperationSignal =
        AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = "$CLOSING_SOURCE_PREFIX$sessionId",
            clubId = clubId,
            severity = severity(),
            summaryCode = "SESSION_CLOSING_BLOCKED",
            impactCount = 1,
            detailHref = "/clubs/$clubSlug/app/host/sessions/$sessionId/closing",
            observedAt = observedAt,
        )

    private fun AdminTodayClosingRiskItem.severity(): AdminOperationSeverity =
        when (overallState) {
            "BLOCKED" -> AdminOperationSeverity.CRITICAL
            "IN_PROGRESS" -> AdminOperationSeverity.WARNING
            "READY" -> AdminOperationSeverity.READY
            else -> AdminOperationSeverity.WARNING
        }

    private fun String.closingRiskId(): UUID? {
        if (!startsWith(CLOSING_SOURCE_PREFIX)) return null
        return runCatching { UUID.fromString(removePrefix(CLOSING_SOURCE_PREFIX)) }.getOrNull()
    }

    private companion object {
        const val CLOSING_RISK_LIMIT = 25
        const val CLOSING_SOURCE_PREFIX = "CLOSING_RISK:"
    }
}
