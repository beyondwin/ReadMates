package com.readmates.support

import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class MySqlExplainTestSupportTest {
    @Test
    fun `assertUsesIndexFor rejects full table scans`() {
        val plan = listOf(
            MySqlExplainRow(
                id = 1,
                selectType = "SIMPLE",
                table = "sessions",
                accessType = "ALL",
                possibleKeys = "sessions_club_state_visibility_number_idx",
                key = null,
                rows = 5000,
                extra = null,
            ),
        )

        assertThatThrownBy { plan.assertUsesIndexFor("sessions", "cursor page") }
            .isInstanceOf(AssertionError::class.java)
            .hasMessageContaining("should use targeted indexed access")
    }

    @Test
    fun `assertUsesIndexFor rejects full index scans`() {
        val plan = listOf(
            MySqlExplainRow(
                id = 1,
                selectType = "SIMPLE",
                table = "sessions",
                accessType = "index",
                possibleKeys = "sessions_club_state_visibility_number_idx",
                key = "sessions_club_state_visibility_number_idx",
                rows = 5000,
                extra = null,
            ),
        )

        assertThatThrownBy { plan.assertUsesIndexFor("sessions", "cursor page") }
            .isInstanceOf(AssertionError::class.java)
            .hasMessageContaining("should use targeted indexed access")
    }
}
