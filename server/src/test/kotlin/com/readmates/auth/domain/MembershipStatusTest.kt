package com.readmates.auth.domain

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MembershipStatusTest {

    private val allowedTransitions: Map<MembershipStatus, Set<MembershipStatus>> = mapOf(
        MembershipStatus.INVITED to setOf(MembershipStatus.VIEWER, MembershipStatus.ACTIVE, MembershipStatus.INACTIVE, MembershipStatus.LEFT),
        MembershipStatus.VIEWER to setOf(MembershipStatus.ACTIVE, MembershipStatus.INACTIVE, MembershipStatus.LEFT),
        MembershipStatus.ACTIVE to setOf(MembershipStatus.SUSPENDED, MembershipStatus.INACTIVE, MembershipStatus.LEFT),
        MembershipStatus.SUSPENDED to setOf(MembershipStatus.ACTIVE, MembershipStatus.INACTIVE, MembershipStatus.LEFT),
        MembershipStatus.LEFT to emptySet(),
        MembershipStatus.INACTIVE to emptySet(),
    )

    @Test
    fun `allowed transitions return true`() {
        for ((from, targets) in allowedTransitions) {
            for (to in targets) {
                assertTrue(from.canTransitionTo(to), "$from → $to should be allowed")
            }
        }
    }

    @Test
    fun `disallowed transitions return false`() {
        for (from in MembershipStatus.entries) {
            val allowed = allowedTransitions[from] ?: emptySet()
            val disallowed = MembershipStatus.entries.filter { it !in allowed }
            for (to in disallowed) {
                assertFalse(from.canTransitionTo(to), "$from → $to should not be allowed")
            }
        }
    }

    @Test
    fun `LEFT is a terminal state with no outbound transitions`() {
        for (to in MembershipStatus.entries) {
            assertFalse(MembershipStatus.LEFT.canTransitionTo(to), "LEFT → $to should not be allowed")
        }
    }

    @Test
    fun `INACTIVE is a terminal state with no outbound transitions`() {
        for (to in MembershipStatus.entries) {
            assertFalse(MembershipStatus.INACTIVE.canTransitionTo(to), "INACTIVE → $to should not be allowed")
        }
    }
}
