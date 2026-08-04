@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.operations.adapter.`in`.web

import com.readmates.admin.operations.application.port.`in`.AcknowledgeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.AdminOperationMutationCommand
import com.readmates.admin.operations.application.port.`in`.GetAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.ListAdminOperationCasesUseCase
import com.readmates.admin.operations.application.port.`in`.ResolveAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCaseUseCase
import com.readmates.admin.operations.application.port.`in`.SnoozeAdminOperationCommand
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ModelAttribute
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin/operations/cases")
class PlatformAdminOperationsController(
    private val listUseCase: ListAdminOperationCasesUseCase,
    private val getUseCase: GetAdminOperationCaseUseCase,
    private val acknowledgeUseCase: AcknowledgeAdminOperationCaseUseCase,
    private val snoozeUseCase: SnoozeAdminOperationCaseUseCase,
    private val resolveUseCase: ResolveAdminOperationCaseUseCase,
) {
    @GetMapping
    fun list(
        admin: CurrentPlatformAdmin,
        @ModelAttribute request: AdminOperationCaseListRequest,
    ): AdminOperationCasesResponse =
        listUseCase
            .list(admin, request.toFilter(), request.toPageRequest())
            .toResponse(admin)

    @GetMapping("/{caseId}")
    fun get(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
    ): AdminOperationCaseDetailResponse = getUseCase.get(admin, caseId).toResponse(admin)

    @PostMapping("/{caseId}/acknowledge")
    fun acknowledge(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationExpectedVersionRequest,
    ): AdminOperationCaseMutationResponse =
        acknowledgeUseCase
            .acknowledge(admin, AdminOperationMutationCommand(caseId, request.requiredExpectedVersion()))
            .toMutationResponse(admin)

    @PostMapping("/{caseId}/snooze")
    fun snooze(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationSnoozeRequest,
    ): AdminOperationCaseMutationResponse =
        snoozeUseCase
            .snooze(
                admin,
                SnoozeAdminOperationCommand(
                    caseId = caseId,
                    expectedVersion = request.requiredExpectedVersion(),
                    snoozedUntil = request.requiredSnoozedUntil(),
                ),
            ).toMutationResponse(admin)

    @PostMapping("/{caseId}/resolve")
    fun resolve(
        admin: CurrentPlatformAdmin,
        @PathVariable caseId: UUID,
        @RequestBody request: AdminOperationExpectedVersionRequest,
    ): AdminOperationCaseMutationResponse =
        resolveUseCase
            .resolve(admin, AdminOperationMutationCommand(caseId, request.requiredExpectedVersion()))
            .toMutationResponse(admin)
}
