package com.readmates.auth.application

import com.readmates.auth.application.port.out.AuthSessionStorePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AuthSessionServiceTest {
    private val repository = AuthSessionStorePort.InMemoryForTest()
    private val service = AuthSessionService(repository)

    @Test
    fun `issues opaque session tokens and stores only hashes`() {
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

        assertTrue(issued.rawToken.length >= 43)
        assertFalse(issued.storedTokenHash.contains(issued.rawToken))
        assertEquals("00000000-0000-0000-0000-000000000101", issued.userId)
    }

    @Test
    fun `updates last seen when a valid session is used`() {
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
        val beforeLookup = repository.findValidByTokenHash(issued.storedTokenHash)
            ?: error("Expected stored session")

        service.findValidSession(issued.rawToken)

        val afterLookup = repository.findValidByTokenHash(issued.storedTokenHash)
            ?: error("Expected stored session")
        assertTrue(afterLookup.lastSeenAt.isAfter(beforeLookup.lastSeenAt))
    }
}
