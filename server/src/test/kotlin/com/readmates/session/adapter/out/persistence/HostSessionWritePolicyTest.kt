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
        assertThat(reopenDecision("OPEN"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReopenNotAllowedException> {
            reopenDecision("PUBLISHED")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            reopenDecision("DRAFT")
        }
        assertThrows<HostSessionReopenNotAllowedException> {
            reopenDecision("CLOSED")
        }
    }

    @Test
    fun `unpublish is unchanged when already CLOSED`() {
        assertThat(unpublishDecision("CLOSED"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionUnpublishNotAllowedException> {
            unpublishDecision("OPEN")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            unpublishDecision("DRAFT")
        }
        assertThrows<HostSessionUnpublishNotAllowedException> {
            unpublishDecision("PUBLISHED")
        }
    }

    @Test
    fun `return to draft is unchanged when already DRAFT`() {
        assertThat(returnToDraftDecision("DRAFT"))
            .isEqualTo(HostSessionTransitionDecision.UNCHANGED)
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            returnToDraftDecision("CLOSED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            returnToDraftDecision("PUBLISHED")
        }
        assertThrows<HostSessionReturnToDraftNotAllowedException> {
            returnToDraftDecision("OPEN")
        }
    }
}
