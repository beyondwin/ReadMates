package com.readmates.admin.operations.application.service

import com.readmates.admin.operations.application.AdminOperationException
import com.readmates.admin.operations.application.model.AdminOperationAction.ACKNOWLEDGE
import com.readmates.admin.operations.application.model.AdminOperationAction.RESOLVE
import com.readmates.admin.operations.application.model.AdminOperationAction.SNOOZE
import com.readmates.admin.operations.application.model.AdminOperationCaseState.OPEN
import com.readmates.club.domain.PlatformAdminRole
import org.assertj.core.api.Assertions.assertThat
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
        assertThatThrownBy { policy.validateSnooze(NOW, NOW.minusMinutes(1)) }
            .isInstanceOf(AdminOperationException::class.java)
        assertThatThrownBy { policy.validateSnooze(NOW, NOW.plusDays(7).plusSeconds(1)) }
            .isInstanceOf(AdminOperationException::class.java)
    }

    private companion object {
        val NOW: OffsetDateTime = OffsetDateTime.parse("2026-08-04T00:00:00Z")
    }
}
