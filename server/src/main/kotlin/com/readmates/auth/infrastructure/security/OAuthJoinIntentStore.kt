package com.readmates.auth.infrastructure.security

import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.io.Serializable
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.LinkedHashMap

data class IssuedOAuthJoinIntent(
    val token: String,
    val expiresAt: Instant,
)

@Component
class OAuthJoinIntentStore(
    @param:Value("\${readmates.auth.join-intent-ttl:5m}") private val ttl: Duration,
) {
    private val random = SecureRandom()

    fun issue(
        request: HttpServletRequest,
        clubSlug: String,
        returnTo: String,
        now: Instant = Instant.now(),
    ): IssuedOAuthJoinIntent {
        val token =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(ByteArray(TOKEN_BYTES).also(random::nextBytes))
        val expiresAt = now.plus(ttl)
        val session = request.getSession(true)
        synchronized(session) {
            val intents = intents(session.getAttribute(SESSION_ATTRIBUTE))
            prune(intents, now)
            intents[token] = StoredJoinIntent(clubSlug, returnTo, expiresAt.toEpochMilli())
            while (intents.size > MAX_INTENTS) intents.remove(intents.keys.first())
            session.setAttribute(SESSION_ATTRIBUTE, intents)
        }
        return IssuedOAuthJoinIntent(token, expiresAt)
    }

    fun consume(
        request: HttpServletRequest,
        token: String?,
        clubSlug: String,
        returnTo: String,
        now: Instant = Instant.now(),
    ): Boolean {
        val session = request.getSession(false)
        val normalizedToken = token?.trim()?.takeIf { it.length in MIN_TOKEN_LENGTH..MAX_TOKEN_LENGTH }
        return if (session == null || normalizedToken == null) {
            false
        } else {
            synchronized(session) {
                val intents = intents(session.getAttribute(SESSION_ATTRIBUTE))
                prune(intents, now)
                val stored = intents.remove(normalizedToken)
                if (intents.isEmpty()) {
                    session.removeAttribute(SESSION_ATTRIBUTE)
                } else {
                    session.setAttribute(SESSION_ATTRIBUTE, intents)
                }
                stored != null && stored.clubSlug == clubSlug && stored.returnTo == returnTo
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun intents(value: Any?): LinkedHashMap<String, StoredJoinIntent> =
        (value as? LinkedHashMap<String, StoredJoinIntent>) ?: LinkedHashMap()

    private fun prune(
        intents: LinkedHashMap<String, StoredJoinIntent>,
        now: Instant,
    ) {
        intents.entries.removeIf { it.value.expiresAtEpochMillis < now.toEpochMilli() }
    }

    private data class StoredJoinIntent(
        val clubSlug: String,
        val returnTo: String,
        val expiresAtEpochMillis: Long,
    ) : Serializable {
        private companion object {
            const val serialVersionUID: Long = 1L
        }
    }

    companion object {
        internal const val SESSION_ATTRIBUTE = "READMATES_OAUTH_JOIN_INTENTS"
        private const val MAX_INTENTS = 8
        private const val TOKEN_BYTES = 24
        private const val MIN_TOKEN_LENGTH = 32
        private const val MAX_TOKEN_LENGTH = 128
    }
}
