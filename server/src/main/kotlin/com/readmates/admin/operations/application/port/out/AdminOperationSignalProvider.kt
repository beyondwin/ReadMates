package com.readmates.admin.operations.application.port.out

import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.shared.security.CurrentPlatformAdmin

interface AdminOperationSignalProvider {
    val sourceType: AdminOperationSourceType

    fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch

    fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification
}

enum class AdminOperationSignalVerification {
    ACTIVE,
    ABSENT,
    UNAVAILABLE,
}
