package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.model.StoredAuthSession
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostAuthorityContextCookieTest {
    private val cookie =
        HostAuthorityContextCookie(
            secret = "test-host-authority-context-secret",
            secureCookie = true,
            sessionCookieDomain = ".readmates.example",
        )

    @Test
    fun `signed context round trips only for its database session`() {
        val session = storedSession()
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val rawValue = cookie.signedValue(session, clubId)

        assertEquals(clubId, cookie.verify(rawValue, session)?.clubId)
        assertNull(cookie.verify(rawValue, session.copy(id = UUID.randomUUID().toString())))
    }

    @Test
    fun `tampered and expired contexts are rejected`() {
        val session = storedSession()
        val rawValue = cookie.signedValue(session, UUID.fromString("00000000-0000-0000-0000-000000000001"))
        val tampered = rawValue.dropLast(1) + if (rawValue.last() == 'A') "B" else "A"

        assertNull(cookie.verify(tampered, session))
        val expiredSession = session.copy(expiresAt = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1))
        assertNull(cookie.verify(rawValue, expiredSession))
    }

    @Test
    fun `issued and cleared cookies preserve session security attributes`() {
        val session = storedSession()
        val issued =
            cookie.issue(
                session.id,
                session.expiresAt,
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
            )

        assertTrue(issued.startsWith("readmates_host_authority="))
        assertTrue(issued.contains("Domain=.readmates.example"))
        assertTrue(issued.contains("Secure"))
        assertTrue(issued.contains("HttpOnly"))
        assertTrue(issued.contains("SameSite=Lax"))
        assertEquals(
            "readmates_host_authority=; Path=/; Max-Age=0; Domain=.readmates.example; Secure; HttpOnly; SameSite=Lax",
            cookie.clear(),
        )
    }

    private fun storedSession(): StoredAuthSession {
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        return StoredAuthSession(
            id = "00000000-0000-0000-0000-000000000901",
            userId = "00000000-0000-0000-0000-000000000101",
            sessionTokenHash = "test-session-hash",
            createdAt = now,
            lastSeenAt = now,
            expiresAt = now.plusHours(1),
            userAgent = null,
            ipHash = null,
        )
    }
}
