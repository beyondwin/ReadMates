package com.readmates.admin.operations.application.port.out

import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType

enum class AdminOperationLifecycleResult {
    SUCCEEDED,
    NOT_FOUND,
    PERMISSION_DENIED,
    INVALID_REQUEST,
    VERSION_CONFLICT,
    STILL_ACTIVE,
    SOURCE_UNAVAILABLE,
}

interface AdminOperationMetricsPort {
    fun recordReconciliation(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus,
    )

    fun recordLifecycle(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
    )

    fun recordCaseAge(
        source: AdminOperationSourceType,
        severity: AdminOperationSeverity,
        seconds: Long,
    )
}

object NoOpAdminOperationMetricsPort : AdminOperationMetricsPort {
    override fun recordReconciliation(
        source: AdminOperationSourceType,
        status: AdminOperationSourceStatus,
    ) = Unit

    override fun recordLifecycle(
        action: AdminOperationAction,
        result: AdminOperationLifecycleResult,
    ) = Unit

    override fun recordCaseAge(
        source: AdminOperationSourceType,
        severity: AdminOperationSeverity,
        seconds: Long,
    ) = Unit
}
