package com.readmates.hostworkspace.adapter.out.source

import com.readmates.auth.application.port.`in`.GetHostInvitationExpiryWorkSourceUseCase
import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.port.out.HostInvitationExpiryWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class InvitationExpiryWorkSourceAdapter(
    private val source: GetHostInvitationExpiryWorkSourceUseCase,
) : HostInvitationExpiryWorkSourcePort {
    override fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult {
        val result = source.get(clubId, evaluatedAt, completedSince)
        return HostWorkSourceResult(
            availability(HostWorkItemType.INVITATION_EXPIRY, result.failureCode),
            result.items.map { item ->
                HostWorkSourceRecord(
                    HostWorkItemType.INVITATION_EXPIRY,
                    item.linkId.toString(),
                    "r${item.linkRevision}",
                    "초대 링크 만료 예정",
                    if (item.resolvedAt == null) {
                        "남은 사용 횟수 ${item.remainingUses}회인 초대 링크를 확인해 주세요."
                    } else {
                        "초대 링크 상태가 변경됐어요."
                    },
                    item.remainingUses,
                    item.dueAt,
                    item.resolvedAt,
                    "/app/host/settings#invitations",
                    item.receiptAction?.let {
                        HostWorkboxReceiptSummary(
                            safeCode(it),
                            safeCode(item.linkStatus),
                            item.usedCount,
                        )
                    },
                )
            },
        )
    }
}
