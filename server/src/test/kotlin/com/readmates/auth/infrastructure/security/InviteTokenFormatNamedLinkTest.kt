package com.readmates.auth.infrastructure.security

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class InviteTokenFormatNamedLinkTest {
    @Test
    fun `strictly classifies legacy and named invitation tokens`() {
        val legacy = "A".repeat(43)
        val named = "lnk_${"B".repeat(43)}"

        assertThat(InviteTokenFormat.parse(legacy)?.kind).isEqualTo(InviteTokenKind.EMAIL)
        assertThat(InviteTokenFormat.parse(named)?.kind).isEqualTo(InviteTokenKind.NAMED_LINK)
        assertThat(InviteTokenFormat.parse("lnk_short")).isNull()
        assertThat(InviteTokenFormat.parse("lnk_${"B".repeat(42)}!")).isNull()
    }
}
