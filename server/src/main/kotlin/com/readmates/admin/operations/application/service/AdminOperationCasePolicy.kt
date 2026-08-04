package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.AdminOperationError.INVALID_REASON_CODE
import com.readmates.admin.operations.application.AdminOperationError.INVALID_SNOOZE_WINDOW
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction
import com.readmates.admin.operations.application.model.AdminOperationCaseState
import com.readmates.club.domain.PlatformAdminRole
import java.time.OffsetDateTime

class AdminOperationCasePolicy {
    fun allowedActions(
        role: PlatformAdminRole,
        state: AdminOperationCaseState,
    ): Set<AdminOperationAction> =
        if (role == PlatformAdminRole.SUPPORT) {
            emptySet()
        } else {
            when (state) {
                AdminOperationCaseState.OPEN ->
                    setOf(
                        AdminOperationAction.ACKNOWLEDGE,
                        AdminOperationAction.SNOOZE,
                        AdminOperationAction.RESOLVE,
                    )
                AdminOperationCaseState.ACKNOWLEDGED ->
                    setOf(AdminOperationAction.SNOOZE, AdminOperationAction.RESOLVE)
                AdminOperationCaseState.SNOOZED ->
                    setOf(AdminOperationAction.ACKNOWLEDGE, AdminOperationAction.RESOLVE)
                AdminOperationCaseState.RESOLVED -> emptySet()
            }
        }

    fun validateSnooze(
        now: OffsetDateTime,
        snoozedUntil: OffsetDateTime,
    ) {
        if (!snoozedUntil.isAfter(now) || snoozedUntil.isAfter(now.plusDays(MAX_SNOOZE_DAYS))) {
            throw AdminOperationException(INVALID_SNOOZE_WINDOW)
        }
    }

    fun validateReasonCode(reasonCode: String) {
        if (reasonCode !in ALLOWED_REASON_CODES) {
            throw AdminOperationException(INVALID_REASON_CODE)
        }
    }

    private companion object {
        const val MAX_SNOOZE_DAYS = 7L
        val ALLOWED_REASON_CODES =
            setOf(
                "OPERATOR_ACKNOWLEDGED",
                "OPERATOR_SNOOZED",
                "OPERATOR_RESOLVED",
                "SIGNAL_OPENED",
                "SIGNAL_REOPENED",
                "SIGNAL_CLEARED",
            )
    }
}
