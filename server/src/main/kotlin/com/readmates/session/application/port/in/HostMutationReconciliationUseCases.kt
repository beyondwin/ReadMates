@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.application.port.`in`

import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.HostMutationReceiptResult
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.shared.security.CurrentMember

data class ReconcileHostMutationCommand(
    val host: CurrentMember,
    val operation: String,
    val resourceSlot: String,
    val idempotencyKey: String,
)

sealed class HostMutationReconciliationResult {
    abstract val status: String

    data class Committed(
        val receipt: HostMutationReceiptResult,
        val current: HostProjectionSnapshot?,
        val attendanceVersions: List<AttendanceVersion> = emptyList(),
        val attendanceSnapshotId: String? = null,
    ) : HostMutationReconciliationResult() {
        override val status: String = "COMMITTED"
    }

    data class NotExecuted(
        val current: HostProjectionSnapshot? = null,
        val attendanceVersions: List<AttendanceVersion> = emptyList(),
        val attendanceSnapshotId: String? = null,
    ) : HostMutationReconciliationResult() {
        override val status: String = "NOT_EXECUTED"
    }

    data object Pending : HostMutationReconciliationResult() {
        override val status: String = "PENDING"
    }
}

fun interface ReconcileHostMutationUseCase {
    fun reconcile(command: ReconcileHostMutationCommand): HostMutationReconciliationResult
}
