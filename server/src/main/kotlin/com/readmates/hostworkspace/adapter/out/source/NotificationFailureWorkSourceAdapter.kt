package com.readmates.hostworkspace.adapter.out.source

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.port.out.HostNotificationFailureWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import com.readmates.notification.application.port.`in`.GetHostNotificationFailureWorkSourceUseCase
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class NotificationFailureWorkSourceAdapter(
    private val source: GetHostNotificationFailureWorkSourceUseCase,
) : HostNotificationFailureWorkSourcePort {
    override fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult {
        val result = source.get(clubId, evaluatedAt, completedSince)
        return HostWorkSourceResult(
            availability(HostWorkItemType.NOTIFICATION_FAILURE, result.failureCode),
            result.items.map { item ->
                HostWorkSourceRecord(
                    HostWorkItemType.NOTIFICATION_FAILURE,
                    item.deliveryId.toString(),
                    "a${item.attemptOrdinal}",
                    "알림 전달 실패",
                    if (item.resolvedAt == null) "전달 실패 알림을 확인해 주세요." else "알림 전달 문제가 해결됐어요.",
                    if (item.resolvedAt == null) 1 else 0,
                    item.dueAt,
                    item.resolvedAt,
                    "/app/host/notifications/${item.deliveryId}",
                    HostWorkboxReceiptSummary(
                        safeCode(item.eventType),
                        safeCode(item.deliveryStatus),
                        item.attemptOrdinal,
                    ),
                )
            },
        )
    }
}
