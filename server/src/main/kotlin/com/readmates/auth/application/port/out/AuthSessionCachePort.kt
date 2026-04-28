package com.readmates.auth.application.port.out

import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset

data class AuthSessionCacheSnapshot(
    val sessionId: String,
    val userId: String,
    val expiresAt: OffsetDateTime,
)

interface AuthSessionCachePort {
    fun find(tokenHash: String): AuthSessionCacheSnapshot?
    fun store(tokenHash: String, snapshot: AuthSessionCacheSnapshot, ttl: Duration)
    fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration)
    fun shouldTouch(tokenHash: String, ttl: Duration): Boolean
    fun evict(tokenHash: String)
    fun evictAllForUser(userId: String)

    class Noop : AuthSessionCachePort {
        override fun find(tokenHash: String): AuthSessionCacheSnapshot? = null
        override fun store(tokenHash: String, snapshot: AuthSessionCacheSnapshot, ttl: Duration) = Unit
        override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) = Unit
        override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean = true
        override fun evict(tokenHash: String) = Unit
        override fun evictAllForUser(userId: String) = Unit
    }

    class InMemoryForTest : AuthSessionCachePort {
        private val sessions = mutableMapOf<String, CacheEntry<AuthSessionCacheSnapshot>>()
        private val touchKeys = mutableMapOf<String, OffsetDateTime>()
        private val userSessions = mutableMapOf<String, MutableSet<String>>()

        override fun find(tokenHash: String): AuthSessionCacheSnapshot? {
            val entry = sessions[tokenHash] ?: return null
            if (entry.expiresAt <= now()) {
                evict(tokenHash)
                return null
            }
            if (!entry.value.expiresAt.isAfter(now())) {
                evict(tokenHash)
                return null
            }
            return entry.value
        }

        override fun store(tokenHash: String, snapshot: AuthSessionCacheSnapshot, ttl: Duration) {
            if (ttl <= Duration.ZERO) {
                return
            }
            sessions[tokenHash] = CacheEntry(snapshot, now().plus(ttl))
        }

        override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) {
            if (ttl <= Duration.ZERO) {
                return
            }
            userSessions.getOrPut(userId) { mutableSetOf() } += tokenHash
        }

        override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean {
            if (ttl <= Duration.ZERO) {
                return true
            }
            val now = now()
            if ((touchKeys[tokenHash] ?: OffsetDateTime.MIN) > now) {
                return false
            }
            touchKeys[tokenHash] = now.plus(ttl)
            return true
        }

        override fun evict(tokenHash: String) {
            sessions.remove(tokenHash)
            touchKeys.remove(tokenHash)
        }

        override fun evictAllForUser(userId: String) {
            userSessions.remove(userId)?.forEach(::evict)
        }

        private fun now(): OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)

        private data class CacheEntry<T>(
            val value: T,
            val expiresAt: OffsetDateTime,
        )
    }
}
