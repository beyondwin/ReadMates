package com.readmates.admin.operations.adapter.out.source

import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Component
import java.util.UUID
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot as NotificationSnapshot

@Component
class NotificationOperationSignalProvider(
    private val notificationOperations: ManageAdminNotificationOperationsUseCase,
) : AdminOperationSignalProvider {
    override val sourceType = AdminOperationSourceType.NOTIFICATION

    override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
        val snapshot = notificationOperations.snapshot(admin)
        val authoritative = snapshot.clubHealth.size < CLUB_HEALTH_LIMIT
        val signals =
            snapshot.clubHealth.mapNotNull { it.toSignal(snapshot) } +
                listOfNotNull(snapshot.platformSignal())
        return AdminOperationSignalBatch(
            sourceType = sourceType,
            status = if (authoritative) AdminOperationSourceStatus.AVAILABLE else AdminOperationSourceStatus.PARTIAL,
            generatedAt = snapshot.generatedAt,
            authoritative = authoritative,
            signals = signals,
        )
    }

    @Suppress("ReturnCount")
    override fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification {
        val snapshot = notificationOperations.snapshot(admin)
        if (sourceKey == PLATFORM_SOURCE_KEY) {
            return snapshot.platformSignal().verification()
        }
        val clubId = sourceKey.notificationClubId() ?: return AdminOperationSignalVerification.ABSENT
        val health = snapshot.clubHealth.firstOrNull { it.clubId == clubId }
        if (health != null) {
            return health.toSignal(snapshot).verification()
        }
        return if (snapshot.clubHealth.size < CLUB_HEALTH_LIMIT) {
            AdminOperationSignalVerification.ABSENT
        } else {
            AdminOperationSignalVerification.UNAVAILABLE
        }
    }

    private fun AdminNotificationClubHealth.toSignal(snapshot: NotificationSnapshot): AdminOperationSignal? {
        val impact = failed.toLong() + dead.toLong()
        if (impact <= 0) return null
        return AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = "$CLUB_SOURCE_PREFIX$clubId",
            clubId = clubId,
            severity = if (dead > 0) AdminOperationSeverity.CRITICAL else AdminOperationSeverity.WARNING,
            summaryCode = "NOTIFICATION_DELIVERY_FAILURE",
            impactCount = impact.safeImpactCount(),
            detailHref = "/admin/notifications?clubId=$clubId",
            observedAt = snapshot.generatedAt,
        )
    }

    private fun NotificationSnapshot.platformSignal(): AdminOperationSignal? {
        val backlog =
            outboxSummary.failed.toLong() +
                outboxSummary.dead.toLong() +
                deliverySummary.failed.toLong() +
                deliverySummary.dead.toLong() +
                relaySummary.stalePublishing.toLong() +
                relaySummary.staleSending.toLong()
        if (backlog <= 0) return null
        return AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = PLATFORM_SOURCE_KEY,
            clubId = null,
            severity =
                if (outboxSummary.dead > 0 || deliverySummary.dead > 0) {
                    AdminOperationSeverity.CRITICAL
                } else {
                    AdminOperationSeverity.WARNING
                },
            summaryCode = "NOTIFICATION_PLATFORM_BACKLOG",
            impactCount = backlog.safeImpactCount(),
            detailHref = "/admin/notifications?focus=outbox_backlog",
            observedAt = generatedAt,
        )
    }

    private fun AdminOperationSignal?.verification(): AdminOperationSignalVerification =
        if (this == null) AdminOperationSignalVerification.ABSENT else AdminOperationSignalVerification.ACTIVE

    private fun Long.safeImpactCount(): Int = coerceAtMost(Int.MAX_VALUE.toLong()).toInt()

    private fun String.notificationClubId(): UUID? {
        if (!startsWith(CLUB_SOURCE_PREFIX)) return null
        return runCatching { UUID.fromString(removePrefix(CLUB_SOURCE_PREFIX)) }.getOrNull()
    }

    private companion object {
        const val CLUB_HEALTH_LIMIT = 25
        const val CLUB_SOURCE_PREFIX = "NOTIFICATION:CLUB:"
        const val PLATFORM_SOURCE_KEY = "NOTIFICATION:PLATFORM_BACKLOG"
    }
}
