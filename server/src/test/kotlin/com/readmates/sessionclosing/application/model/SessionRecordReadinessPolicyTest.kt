package com.readmates.sessionclosing.application.model

import com.readmates.sessionrecord.application.model.SessionRecordStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SessionRecordReadinessPolicyTest {
    @Test
    fun `closed not started and draft records need attention but open records do not`() {
        val notStarted =
            SessionRecordReadinessPolicy.recordStatus(
                recordSaved = false,
                feedbackReady = false,
                hasDraft = false,
            )
        val draft =
            SessionRecordReadinessPolicy.recordStatus(
                recordSaved = false,
                feedbackReady = false,
                hasDraft = true,
            )

        assertThat(notStarted).isEqualTo(SessionRecordStatus.NOT_STARTED)
        assertThat(draft).isEqualTo(SessionRecordStatus.INCOMPLETE)
        assertThat(SessionRecordReadinessPolicy.needsAttention("CLOSED", notStarted, false)).isTrue()
        assertThat(SessionRecordReadinessPolicy.needsAttention("PUBLISHED", draft, true)).isTrue()
        assertThat(SessionRecordReadinessPolicy.needsAttention("OPEN", draft, true)).isFalse()
    }

    @Test
    fun `complete closed record without a draft does not need attention`() {
        val complete =
            SessionRecordReadinessPolicy.recordStatus(
                recordSaved = true,
                feedbackReady = true,
                hasDraft = false,
            )

        assertThat(complete).isEqualTo(SessionRecordStatus.COMPLETE)
        assertThat(SessionRecordReadinessPolicy.needsAttention("CLOSED", complete, false)).isFalse()
    }
}
