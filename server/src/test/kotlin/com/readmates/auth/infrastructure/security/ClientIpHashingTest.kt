package com.readmates.auth.infrastructure.security

import com.readmates.shared.security.ClientIpHashing
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class ClientIpHashingTest {
    @Test
    fun `same IP and same week produce the same hash`() {
        val clock = fixedClock("2026-05-06T12:00:00Z") // ISO week 19 of 2026
        val hash1 = ClientIpHashing.hashClientIp("192.168.1.1", "test-secret", clock)
        val hash2 = ClientIpHashing.hashClientIp("192.168.1.1", "test-secret", clock)

        assertEquals(hash1, hash2)
    }

    @Test
    fun `same IP but different ISO week produce different hashes`() {
        val week19Clock = fixedClock("2026-05-06T12:00:00Z") // ISO week 19 of 2026
        val week20Clock = fixedClock("2026-05-11T12:00:00Z") // ISO week 20 of 2026

        val hash1 = ClientIpHashing.hashClientIp("192.168.1.1", "test-secret", week19Clock)
        val hash2 = ClientIpHashing.hashClientIp("192.168.1.1", "test-secret", week20Clock)

        assertNotEquals(hash1, hash2)
    }

    @Test
    fun `null IP returns 'anonymous'`() {
        val clock = fixedClock("2026-05-06T12:00:00Z")
        val hash = ClientIpHashing.hashClientIp(null, "test-secret", clock)

        assertEquals("anonymous", hash)
    }

    @Test
    fun `blank IP returns 'anonymous'`() {
        val clock = fixedClock("2026-05-06T12:00:00Z")
        val hash = ClientIpHashing.hashClientIp("   ", "test-secret", clock)

        assertEquals("anonymous", hash)
    }

    @Test
    fun `hash is 32 hex characters`() {
        val clock = fixedClock("2026-05-06T12:00:00Z")
        val hash = ClientIpHashing.hashClientIp("10.0.0.1", "test-secret", clock)

        assertEquals(32, hash.length)
        assert(hash.all { it.isDigit() || it in 'a'..'f' }) { "Expected hex string but got: $hash" }
    }

    @Test
    fun `different IPs in same week produce different hashes`() {
        val clock = fixedClock("2026-05-06T12:00:00Z")
        val hash1 = ClientIpHashing.hashClientIp("192.168.1.1", "test-secret", clock)
        val hash2 = ClientIpHashing.hashClientIp("192.168.1.2", "test-secret", clock)

        assertNotEquals(hash1, hash2)
    }

    private fun fixedClock(instant: String): Clock =
        Clock.fixed(Instant.parse(instant), ZoneOffset.UTC)
}
