package com.readmates.notification.application.service

import com.readmates.notification.application.port.`in`.GetHostNotificationFailureWorkSourceUseCase
import com.readmates.notification.application.port.`in`.HostNotificationFailureWorkSourceItem
import com.readmates.notification.application.port.`in`.HostNotificationFailureWorkSourceResult
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQuery
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryPort
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryResult
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class HostNotificationFailureWorkSourceService(
    private val queryPort: HostNotificationFailureWorkSourceQueryPort,
) : GetHostNotificationFailureWorkSourceUseCase {
    override fun get(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostNotificationFailureWorkSourceResult =
        when (
            val result =
                queryPort.load(HostNotificationFailureWorkSourceQuery(clubId, completedSince))
        ) {
            HostNotificationFailureWorkSourceQueryResult.Unavailable ->
                HostNotificationFailureWorkSourceResult(
                    emptyList(),
                    "NOTIFICATION_SOURCE_UNAVAILABLE",
                )
            is HostNotificationFailureWorkSourceQueryResult.Available ->
                HostNotificationFailureWorkSourceResult(
                    result.rows.mapNotNull { row ->
                        val actionable = row.deliveryStatus in setOf("FAILED", "DEAD")
                        val resolvedAt = row.resolvedAt?.takeIf { !it.isBefore(completedSince) }
                        if (!actionable && (row.deliveryStatus !in RESOLVED || resolvedAt == null)) {
                            return@mapNotNull null
                        }
                        HostNotificationFailureWorkSourceItem(
                            row.deliveryId,
                            row.attemptOrdinal,
                            row.eventType,
                            row.channel,
                            row.deliveryStatus,
                            if (actionable) row.nextRetryAt else row.failureAt,
                            if (actionable) null else resolvedAt,
                            row.safeErrorCode,
                        )
                    },
                )
        }

    private companion object {
        val RESOLVED = setOf("SENT", "SKIPPED")
    }
}
