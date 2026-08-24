@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.HostMutationReceiptResult
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.port.`in`.HostMutationReconciliationResult
import com.readmates.session.application.port.`in`.ReconcileHostMutationCommand
import com.readmates.session.application.port.`in`.ReconcileHostMutationUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/mutations")
class HostMutationReconciliationController(
    private val reconcileHostMutation: ReconcileHostMutationUseCase,
) {
    @GetMapping("/{operation}/{resourceSlot}/{idempotencyKey}")
    fun reconcile(
        member: CurrentMember,
        @PathVariable operation: String,
        @PathVariable resourceSlot: String,
        @PathVariable idempotencyKey: String,
    ): HostMutationReconciliationHttpResponse =
        reconcileHostMutation
            .reconcile(
                ReconcileHostMutationCommand(
                    host = member,
                    operation = operation,
                    resourceSlot = resourceSlot,
                    idempotencyKey = idempotencyKey,
                ),
            ).toHttp()
}

data class HostMutationReconciliationHttpResponse(
    val status: String,
    val receipt: HostMutationReceiptResult? = null,
    val current: HostProjectionSnapshot? = null,
    val attendanceVersions: List<AttendanceVersion>? = null,
    val attendanceSnapshotId: String? = null,
)

private fun HostMutationReconciliationResult.toHttp(): HostMutationReconciliationHttpResponse =
    when (this) {
        is HostMutationReconciliationResult.Committed ->
            HostMutationReconciliationHttpResponse(
                status = status,
                receipt = receipt,
                current = current,
                attendanceVersions = attendanceVersions,
                attendanceSnapshotId = attendanceSnapshotId,
            )
        is HostMutationReconciliationResult.NotExecuted ->
            HostMutationReconciliationHttpResponse(
                status = status,
                current = current,
                attendanceVersions = attendanceVersions,
                attendanceSnapshotId = attendanceSnapshotId,
            )
        HostMutationReconciliationResult.Pending ->
            HostMutationReconciliationHttpResponse(status = status)
    }
