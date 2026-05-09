package com.readmates.club.domain

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ClubStatusTest {

    @Test
    fun `canTransitionTo returns true for all allowed transitions`() {
        assertTrue(ClubStatus.SETUP_REQUIRED.canTransitionTo(ClubStatus.ACTIVE))
        assertTrue(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.SUSPENDED))
        assertTrue(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.ARCHIVED))
        assertTrue(ClubStatus.SUSPENDED.canTransitionTo(ClubStatus.ACTIVE))
        assertTrue(ClubStatus.SUSPENDED.canTransitionTo(ClubStatus.ARCHIVED))
    }

    @Test
    fun `canTransitionTo returns false for disallowed transitions`() {
        assertFalse(ClubStatus.SETUP_REQUIRED.canTransitionTo(ClubStatus.SUSPENDED))
        assertFalse(ClubStatus.SETUP_REQUIRED.canTransitionTo(ClubStatus.ARCHIVED))
        assertFalse(ClubStatus.ACTIVE.canTransitionTo(ClubStatus.SETUP_REQUIRED))
        assertFalse(ClubStatus.SUSPENDED.canTransitionTo(ClubStatus.SETUP_REQUIRED))
    }

    @Test
    fun `ARCHIVED is terminal state`() {
        ClubStatus.entries.forEach { next ->
            assertFalse(ClubStatus.ARCHIVED.canTransitionTo(next))
        }
    }
}
