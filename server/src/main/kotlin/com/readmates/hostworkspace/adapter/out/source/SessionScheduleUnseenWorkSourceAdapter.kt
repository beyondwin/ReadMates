package com.readmates.hostworkspace.adapter.out.source

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailability
import com.readmates.hostworkspace.application.model.HostWorkSourceAvailabilityState
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.port.out.HostScheduleUnseenWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import com.readmates.session.application.port.`in`.GetHostScheduleSeenWorkSourceUseCase
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class SessionScheduleUnseenWorkSourceAdapter(
    private val source: GetHostScheduleSeenWorkSourceUseCase,
) : HostScheduleUnseenWorkSourcePort {
    override fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult {
        val result = source.get(clubId, evaluatedAt, completedSince)
        return HostWorkSourceResult(
            availability(HostWorkItemType.SCHEDULE_UNSEEN, result.failureCode),
            result.items.map { item ->
                HostWorkSourceRecord(
                    HostWorkItemType.SCHEDULE_UNSEEN,
                    item.sessionId.toString(),
                    "r${item.scheduleRevision}",
                    "일정 확인이 필요해요",
                    if (item.resolvedAt == null) {
                        "${item.unseenCount}명이 변경된 일정을 아직 확인하지 않았어요."
                    } else {
                        "모든 참여자가 일정을 확인했어요."
                    },
                    item.unseenCount,
                    item.dueAt,
                    item.resolvedAt,
                    "/app/host/sessions/${item.sessionId}/schedule-review",
                    item.dispatchStatus?.let {
                        HostWorkboxReceiptSummary(
                            "MANUAL_DISPATCH",
                            safeCode(it),
                            item.dispatchDeliveryCount ?: item.dispatchTargetCount,
                        )
                    },
                )
            },
        )
    }
}

internal fun availability(
    type: HostWorkItemType,
    failureCode: String?,
): HostWorkSourceAvailability =
    if (failureCode == null) {
        HostWorkSourceAvailability(type, HostWorkSourceAvailabilityState.AVAILABLE)
    } else {
        HostWorkSourceAvailability(type, HostWorkSourceAvailabilityState.UNAVAILABLE, failureCode)
    }

internal fun safeCode(value: String): String =
    value.uppercase().replace(Regex("[^A-Z0-9_]+"), "_").take(SAFE_CODE_MAX_LENGTH).ifBlank {
        "UNKNOWN"
    }

private const val SAFE_CODE_MAX_LENGTH = 64
