package com.readmates.auth.application

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InvitationTokenServiceTest {
    private val service = InvitationTokenService()

    @Test
    fun `generates url safe one time tokens`() {
        val token = service.generateToken()

        assertTrue(token.length >= 43)
        assertFalse(token.contains("="))
        assertTrue(token.matches(Regex("^[A-Za-z0-9_-]+$")))
    }

    @Test
    fun `hashes tokens deterministically without returning the raw token`() {
        val first = service.hashToken("raw-token")
        val second = service.hashToken("raw-token")
        val third = service.hashToken("other-token")

        assertEquals(first, second)
        assertNotEquals(first, third)
        assertNotEquals("raw-token", first)
        assertTrue(first.matches(Regex("^[0-9a-f]{64}$")))
    }
}
