package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface GetAiOpsSummaryUseCase {
    fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow = AiOpsCostWindow.LAST_30D,
    ): AiOpsSummary
}

interface ListAiOpsJobsUseCase {
    fun list(
        admin: CurrentPlatformAdmin,
        filters: AiOpsJobFilters,
    ): AiOpsJobList
}

interface GetAiOpsJobUseCase {
    fun get(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsJobListItem
}

interface ForceCancelAiOpsJobUseCase {
    fun forceCancel(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult
}
