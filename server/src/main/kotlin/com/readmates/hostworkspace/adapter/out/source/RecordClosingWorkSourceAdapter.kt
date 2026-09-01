package com.readmates.hostworkspace.adapter.out.source

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.port.out.HostRecordClosingWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import com.readmates.sessionclosing.application.port.`in`.GetHostRecordClosingWorkSourceUseCase
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class RecordClosingWorkSourceAdapter(
    private val source: GetHostRecordClosingWorkSourceUseCase,
) : HostRecordClosingWorkSourcePort {
    override fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult {
        val result = source.get(clubId, evaluatedAt, completedSince)
        return HostWorkSourceResult(
            availability(HostWorkItemType.RECORD_CLOSING, result.failureCode),
            result.items.map { item ->
                HostWorkSourceRecord(
                    HostWorkItemType.RECORD_CLOSING,
                    item.sessionId.toString(),
                    item.sourceGeneration,
                    "모임 기록 마무리",
                    if (item.actionable) "기록 마무리 단계를 확인해 주세요." else "같은 기록 세대의 마무리가 완료됐어요.",
                    if (item.actionable) 1 else 0,
                    item.dueAt,
                    item.resolvedAt,
                    "/app/host/sessions/${item.sessionId}/closing",
                    item.receiptState?.let {
                        HostWorkboxReceiptSummary("RECORD_CLOSING", safeCode(it))
                    },
                )
            },
        )
    }
}
