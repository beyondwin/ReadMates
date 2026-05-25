package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
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
    private val forceCancelUseCase: ForceCancelAiOpsJobUseCase,
) {
    @GetMapping("/summary")
    fun summary(admin: CurrentPlatformAdmin): AiOpsSummaryResponse = AiOpsSummaryResponse.from(summaryUseCase.summary(admin))

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
    ): AiOpsAdminActionResponse = AiOpsAdminActionResponse.from(forceCancelUseCase.forceCancel(admin, jobId))
}
