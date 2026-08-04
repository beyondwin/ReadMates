package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.AdminOperationError
import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction.ACKNOWLEDGE
import com.readmates.admin.operations.application.model.AdminOperationAction.RESOLVE
import com.readmates.admin.operations.application.model.AdminOperationAction.SNOOZE
import com.readmates.admin.operations.application.model.AdminOperationCaseState.ACKNOWLEDGED
import com.readmates.admin.operations.application.model.AdminOperationCaseState.OPEN
import com.readmates.admin.operations.application.model.AdminOperationCaseState.RESOLVED
import com.readmates.admin.operations.application.model.AdminOperationCaseState.SNOOZED
import com.readmates.club.domain.PlatformAdminRole
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

class AdminOperationCasePolicyTest {
    private val policy = AdminOperationCasePolicy()

    @Test
    fun `support receives no lifecycle actions`() {
        assertThat(policy.allowedActions(PlatformAdminRole.SUPPORT, OPEN)).isEmpty()
    }

    @Test
    fun `operator can acknowledge snooze and request resolution`() {
        assertThat(policy.allowedActions(PlatformAdminRole.OPERATOR, OPEN))
            .containsExactlyInAnyOrder(ACKNOWLEDGE, SNOOZE, RESOLVE)
    }

    @Test
    fun `snooze rejects past and more than seven days`() {
        assertThatThrownBy { policy.validateSnooze(NOW, NOW) }
            .isInstanceOf(AdminOperationException::class.java)
        assertThatThrownBy { policy.validateSnooze(NOW, NOW.minusMinutes(1)) }
            .isInstanceOf(AdminOperationException::class.java)
        assertThatThrownBy { policy.validateSnooze(NOW, NOW.plusDays(7).plusSeconds(1)) }
            .isInstanceOf(AdminOperationException::class.java)
        assertThatCode { policy.validateSnooze(NOW, NOW.plusDays(7)) }.doesNotThrowAnyException()
    }

    @Test
    fun `operator actions follow the non-open lifecycle matrix`() {
        assertThat(policy.allowedActions(PlatformAdminRole.OPERATOR, ACKNOWLEDGED))
            .containsExactlyInAnyOrder(SNOOZE, RESOLVE)
        assertThat(policy.allowedActions(PlatformAdminRole.OPERATOR, SNOOZED))
            .containsExactlyInAnyOrder(ACKNOWLEDGE, RESOLVE)
        assertThat(policy.allowedActions(PlatformAdminRole.OPERATOR, RESOLVED)).isEmpty()
    }

    @Test
    fun `reason code rejects arbitrary text with a safe error`() {
        assertThatThrownBy { policy.validateReasonCode("untrusted provider detail") }
            .isInstanceOfSatisfying(AdminOperationException::class.java) { exception ->
                assertThat(exception.error).isEqualTo(AdminOperationError.INVALID_REASON_CODE)
            }
    }

    @Test
    fun `reason code accepts an allowlisted lifecycle value`() {
        assertThatCode { policy.validateReasonCode("OPERATOR_ACKNOWLEDGED") }.doesNotThrowAnyException()
    }

    private companion object {
        val NOW: OffsetDateTime = OffsetDateTime.parse("2026-08-04T00:00:00Z")
    }
}
