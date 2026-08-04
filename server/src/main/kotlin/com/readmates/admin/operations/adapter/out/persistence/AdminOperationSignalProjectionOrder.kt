package com.readmates.admin.operations.adapter.out.persistence

import com.readmates.admin.operations.application.model.AdminOperationCase
import com.readmates.admin.operations.application.model.AdminOperationSignal

internal object AdminOperationSignalProjectionOrder {
    /**
     * Equal-time observations choose one whole projection with this stable order:
     * more severe, greater impact, then lexicographically smaller safe summary,
     * detail link, and club identifier. The source identity and observation instant
     * are equal by construction and therefore do not participate.
     */
    fun preferred(
        existing: AdminOperationCase,
        incoming: AdminOperationSignal,
    ): AdminOperationSignal {
        val persisted = existing.toSignal()
        return if (COMPARATOR.compare(incoming, persisted) < 0) incoming else persisted
    }

    private fun AdminOperationCase.toSignal() =
        AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = sourceKey,
            clubId = clubId,
            severity = severity,
            summaryCode = summaryCode,
            impactCount = impactCount,
            detailHref = detailHref,
            observedAt = lastObservedAt,
        )

    private val COMPARATOR =
        compareBy<AdminOperationSignal>(
            { it.severity.rank() },
            { -it.impactCount.toLong() },
            { it.summaryCode },
            { it.detailHref },
            { it.clubId?.toString().orEmpty() },
        )
}
