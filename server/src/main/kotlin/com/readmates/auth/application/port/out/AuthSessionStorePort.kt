package com.readmates.auth.application.port.out

import com.readmates.auth.application.model.StoredAuthSession

interface AuthSessionStorePort {
    fun create(session: StoredAuthSession)
    fun findValidByTokenHash(tokenHash: String): StoredAuthSession?
    fun touchByTokenHash(tokenHash: String)
    fun revokeByTokenHash(tokenHash: String)
    fun revokeAllForUser(userId: String)

    class InMemoryForTest : AuthSessionStorePort {
        private val sessions = mutableMapOf<String, StoredAuthSession>()

        override fun create(session: StoredAuthSession) {
            sessions[session.sessionTokenHash] = session
        }

        override fun findValidByTokenHash(tokenHash: String): StoredAuthSession? = sessions[tokenHash]

        override fun touchByTokenHash(tokenHash: String) {
            sessions[tokenHash]?.let { session ->
                sessions[tokenHash] = session.copy(lastSeenAt = session.lastSeenAt.plusNanos(1))
            }
        }

        override fun revokeByTokenHash(tokenHash: String) {
            sessions[tokenHash]?.let { sessions[tokenHash] = it.copy(revoked = true) }
        }

        override fun revokeAllForUser(userId: String) {
            sessions.replaceAll { _, session -> if (session.userId == userId) session.copy(revoked = true) else session }
        }
    }
}
