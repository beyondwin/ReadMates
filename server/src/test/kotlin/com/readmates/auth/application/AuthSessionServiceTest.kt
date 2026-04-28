package com.readmates.auth.application

import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.out.AuthSessionCachePort
import com.readmates.auth.application.port.out.AuthSessionStorePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

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

    @Test
    fun `uses cached session only after repository validity check`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
        repository.findCount = 0

        val session = service.findValidSession(issued.rawToken)

        assertEquals(issued.storedTokenHash, session?.sessionTokenHash)
        assertNull(session?.userAgent)
        assertNull(session?.ipHash)
        assertEquals(1, repository.findCount)
    }

    @Test
    fun `rejects revoked repository session even when cache still has snapshot`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

        repository.revokeByTokenHash(issued.storedTokenHash)

        assertNotNull(cache.find(issued.storedTokenHash))
        assertNull(service.findValidSession(issued.rawToken))
        assertEquals(1, repository.findCount)
    }

    @Test
    fun `cache miss loads from repository and stores session`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
        cache.evict(issued.storedTokenHash)
        repository.findCount = 0

        val session = service.findValidSession(issued.rawToken)

        assertNotNull(session)
        assertEquals(1, repository.findCount)
        assertEquals(session?.id, cache.find(issued.storedTokenHash)?.sessionId)
    }

    @Test
    fun `throttles last seen touch while throttle key exists`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

        service.findValidSession(issued.rawToken)
        service.findValidSession(issued.rawToken)

        assertEquals(1, repository.touchCount)
    }

    @Test
    fun `logout evicts cached session after revoke`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
        assertNotNull(cache.find(issued.storedTokenHash))

        service.logout(issued.rawToken)

        assertNull(cache.find(issued.storedTokenHash))
        assertNull(service.findValidSession(issued.rawToken))
    }

    @Test
    fun `revoke all for user evicts indexed cached sessions`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val first = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")
        val second = service.issueSession("00000000-0000-0000-0000-000000000101", "agent", "127.0.0.1")

        service.revokeAllForUser("00000000-0000-0000-0000-000000000101")

        assertNull(cache.find(first.storedTokenHash))
        assertNull(cache.find(second.storedTokenHash))
        assertNull(service.findValidSession(first.rawToken))
        assertNull(service.findValidSession(second.rawToken))
    }

    @Test
    fun `revoke all for user normalizes uuid before repository and cache eviction`() {
        val repository = CountingAuthSessionStore()
        val cache = AuthSessionCachePort.InMemoryForTest()
        val service = AuthSessionService(repository, cache)
        val issued = service.issueSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab", "agent", "127.0.0.1")

        service.revokeAllForUser("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAB")

        assertNull(cache.find(issued.storedTokenHash))
        assertNull(service.findValidSession(issued.rawToken))
    }

    private class CountingAuthSessionStore : AuthSessionStorePort {
        private val sessions = mutableMapOf<String, StoredAuthSession>()
        var findCount = 0
        var touchCount = 0

        override fun create(session: StoredAuthSession) {
            sessions[session.sessionTokenHash] = session
        }

        override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? {
            findCount += 1
            return sessions[tokenHash]
                ?.takeIf { !it.revoked && it.expiresAt.isAfter(OffsetDateTime.now()) }
        }

        override fun touchByTokenHash(tokenHash: String) {
            touchCount += 1
            sessions[tokenHash]?.let { session ->
                sessions[tokenHash] = session.copy(lastSeenAt = session.lastSeenAt.plusNanos(1))
            }
        }

        override fun revokeByTokenHash(tokenHash: String) {
            sessions[tokenHash]?.let { sessions[tokenHash] = it.copy(revoked = true) }
        }

        override fun revokeAllForUser(userId: String) {
            sessions.replaceAll { _, session ->
                if (session.userId == userId) session.copy(revoked = true) else session
            }
        }
    }
}
