package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class HostSessionWritePolicyTest {
    @Test
    fun `reopen is unchanged when already OPEN and rejected otherwise except via CAS`() {
        assertThat(HostSessionWritePolicy.reopenDecision("OPEN"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("PUBLISHED")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("DRAFT")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            HostSessionWritePolicy.reopenDecision("CLOSED")
        }
    }

    @Test
    fun `unpublish is unchanged when already CLOSED`() {
        assertThat(HostSessionWritePolicy.unpublishDecision("CLOSED"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("OPEN")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("DRAFT")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            HostSessionWritePolicy.unpublishDecision("PUBLISHED")
        }
    }

    @Test
    fun `return to draft is unchanged when already DRAFT`() {
        assertThat(HostSessionWritePolicy.returnToDraftDecision("DRAFT"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("CLOSED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("PUBLISHED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            HostSessionWritePolicy.returnToDraftDecision("OPEN")
        }
    }
}
