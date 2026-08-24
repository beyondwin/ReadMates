package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsAdminCommandPreview
import com.readmates.aigen.application.model.AiOpsAdminCommandReceipt
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.ConfirmAiOpsAdminCommand
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
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

interface RetryAiOpsJobCommitUseCase {
    fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult
}

interface PreviewAiOpsAdminCommandUseCase {
    fun previewAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
    ): AiOpsAdminCommandPreview
}

interface ConfirmAiOpsAdminCommandUseCase {
    fun confirmAdminCommand(
        admin: PlatformActor,
        jobId: UUID,
        action: AiOpsAction,
        command: ConfirmAiOpsAdminCommand,
    ): AiOpsAdminCommandReceipt
}
