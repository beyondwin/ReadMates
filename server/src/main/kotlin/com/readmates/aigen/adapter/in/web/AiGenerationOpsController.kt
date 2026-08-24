package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ConfirmAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.`in`.PreviewAiOpsAdminCommandUseCase
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.toPlatformActor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/ai-generation")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class AiGenerationOpsController(
    private val summaryUseCase: GetAiOpsSummaryUseCase,
    private val listUseCase: ListAiOpsJobsUseCase,
    private val getUseCase: GetAiOpsJobUseCase,
    private val previewAdminCommandUseCase: PreviewAiOpsAdminCommandUseCase,
    private val confirmAdminCommandUseCase: ConfirmAiOpsAdminCommandUseCase,
) {
    @GetMapping("/summary")
    fun summary(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) window: String?,
    ): AiOpsSummaryResponse = AiOpsSummaryResponse.from(summaryUseCase.summary(admin, AiOpsCostWindow.fromWire(window)))

    @GetMapping("/jobs")
    fun jobs(
        admin: CurrentPlatformAdmin,
        @RequestParam(required = false) status: JobStatus?,
        @RequestParam(required = false) clubId: UUID?,
        @RequestParam(required = false) errorCode: String?,
        @RequestParam(required = false) cursor: String?,
    ): AiOpsJobListResponse =
        AiOpsJobListResponse.from(
            listUseCase.list(
                admin = admin,
                filters =
                    AiOpsJobFilters(
                        status = status,
                        clubId = clubId,
                        errorCode = errorCode,
                        cursor = cursor,
                    ),
            ),
        )

    @GetMapping("/jobs/{jobId}")
    fun job(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): AiOpsJobResponse = AiOpsJobResponse.from(getUseCase.get(admin, jobId))

    @PostMapping("/jobs/{jobId}/force-cancel")
    fun forceCancel(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): Nothing = requireSafeConfirm(admin, jobId)

    @PostMapping("/jobs/{jobId}/retry-commit")
    fun retryCommit(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): Nothing = requireSafeConfirm(admin, jobId)

    @PostMapping("/jobs/{jobId}/force-cancel/preview")
    fun previewForceCancel(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): AiOpsAdminCommandPreviewResponse =
        AiOpsAdminCommandPreviewResponse.from(
            previewAdminCommandUseCase.previewAdminCommand(admin.toPlatformActor(), jobId, AiOpsAction.FORCE_CANCEL),
        )

    @PostMapping("/jobs/{jobId}/force-cancel/confirm")
    fun confirmForceCancel(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
        @RequestBody request: ConfirmAiOpsAdminCommandRequest,
    ): AiOpsAdminCommandReceiptResponse =
        AiOpsAdminCommandReceiptResponse.from(
            confirmAdminCommandUseCase.confirmAdminCommand(
                admin.toPlatformActor(),
                jobId,
                AiOpsAction.FORCE_CANCEL,
                request.toCommand(),
            ),
        )

    @PostMapping("/jobs/{jobId}/retry-commit/preview")
    fun previewRetryCommit(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
    ): AiOpsAdminCommandPreviewResponse =
        AiOpsAdminCommandPreviewResponse.from(
            previewAdminCommandUseCase.previewAdminCommand(admin.toPlatformActor(), jobId, AiOpsAction.RETRY_COMMIT),
        )

    @PostMapping("/jobs/{jobId}/retry-commit/confirm")
    fun confirmRetryCommit(
        admin: CurrentPlatformAdmin,
        @PathVariable jobId: UUID,
        @RequestBody request: ConfirmAiOpsAdminCommandRequest,
    ): AiOpsAdminCommandReceiptResponse =
        AiOpsAdminCommandReceiptResponse.from(
            confirmAdminCommandUseCase.confirmAdminCommand(
                admin.toPlatformActor(),
                jobId,
                AiOpsAction.RETRY_COMMIT,
                request.toCommand(),
            ),
        )

    private fun requireSafeConfirm(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): Nothing {
        if (!admin.toPlatformActor().can(PlatformCapability.MANAGE_AI_OPERATIONS)) {
            throw AccessDeniedException("Platform admin role cannot manage AI operations")
        }
        throw AiGenerationException.SafeOpsError(jobId, "SAFE_CONFIRM_REQUIRED")
    }
}
