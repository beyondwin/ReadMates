package com.readmates.hostworkspace.adapter.out.source

import com.readmates.auth.application.port.`in`.GetHostMemberApprovalWorkSourceUseCase
import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxReceiptSummary
import com.readmates.hostworkspace.application.port.out.HostMemberApprovalWorkSourcePort
import com.readmates.hostworkspace.application.port.out.HostWorkSourceRecord
import com.readmates.hostworkspace.application.port.out.HostWorkSourceResult
import org.springframework.stereotype.Component
import java.time.OffsetDateTime
import java.util.UUID

@Component
class MemberApprovalWorkSourceAdapter(
    private val source: GetHostMemberApprovalWorkSourceUseCase,
) : HostMemberApprovalWorkSourcePort {
    override fun load(
        clubId: UUID,
        evaluatedAt: OffsetDateTime,
        completedSince: OffsetDateTime,
    ): HostWorkSourceResult {
        val result = source.get(clubId, evaluatedAt, completedSince)
        return HostWorkSourceResult(
            availability(HostWorkItemType.MEMBER_APPROVAL, result.failureCode),
            result.items.map { item ->
                HostWorkSourceRecord(
                    HostWorkItemType.MEMBER_APPROVAL,
                    item.membershipId.toString(),
                    "g${item.requestCreatedAt.toInstant().epochSecond}",
                    "가입 승인 요청",
                    if (item.resolvedAt == null) "새 멤버의 가입 승인을 검토해 주세요." else "가입 승인 요청 처리가 끝났어요.",
                    if (item.resolvedAt == null) 1 else 0,
                    item.requestCreatedAt,
                    item.resolvedAt,
                    "/app/host/people/${item.membershipId}",
                    item.receiptAction?.let {
                        HostWorkboxReceiptSummary(safeCode(it), safeCode(item.receiptStatus))
                    },
                )
            },
        )
    }
}
