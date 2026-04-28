package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.AuthSessionCacheSnapshot
import com.readmates.auth.application.port.out.AuthSessionCachePort
import com.readmates.shared.cache.CacheJsonCodec
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.OffsetDateTime

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "auth-session-cache.enabled"], havingValue = "true")
class RedisAuthSessionCacheAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val codec: CacheJsonCodec,
    private val metrics: RedisCacheMetrics,
) : AuthSessionCachePort {
    override fun find(tokenHash: String): AuthSessionCacheSnapshot? {
        val key = sessionKey(tokenHash)
        return runCatching {
            val raw = redisTemplate.opsForValue().get(key) ?: run {
                recordCacheMiss()
                return null
            }
            val cached = codec.decode(raw, CachedAuthSession::class.java)
            if (cached == null || cached.schemaVersion != SCHEMA_VERSION) {
                safeDelete(key)
                recordCacheMiss()
                recordFallback("auth-session-decode")
                recordOperationError("decode")
                return null
            }
            val snapshot = runCatching { cached.toSnapshot() }.getOrElse {
                safeDelete(key)
                recordCacheMiss()
                recordFallback("auth-session-decode")
                recordOperationError("decode")
                return null
            }
            if (!snapshot.expiresAt.isAfter(OffsetDateTime.now())) {
                safeDelete(key)
                recordCacheMiss()
                return null
            }
            recordCacheHit()
            snapshot
        }.getOrElse {
            recordFallback()
            recordOperationError("find")
            null
        }
    }

    override fun store(tokenHash: String, snapshot: AuthSessionCacheSnapshot, ttl: Duration) {
        if (ttl <= Duration.ZERO) {
            return
        }
        runCatching {
            redisTemplate.opsForValue().set(sessionKey(tokenHash), CachedAuthSession.from(snapshot).let(codec::encode), ttl)
        }.onFailure {
            recordFallback()
            recordOperationError("store")
        }
    }

    override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) {
        if (ttl <= Duration.ZERO) {
            return
        }
        runCatching {
            val key = userSessionsKey(userId)
            redisTemplate.execute(
                REMEMBER_USER_SESSION_SCRIPT,
                listOf(key),
                tokenHash,
                ttl.toRedisMillis().toString(),
            )
        }.onFailure {
            recordFallback()
            recordOperationError("remember-user-session")
        }
    }

    override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean {
        if (ttl <= Duration.ZERO) {
            return true
        }
        return runCatching {
            val shouldTouch = redisTemplate.opsForValue().setIfAbsent(touchKey(tokenHash), "1", ttl) == true
            if (!shouldTouch) {
                metrics.increment("readmates.auth_session_touch.skipped")
            }
            shouldTouch
        }.getOrElse {
            recordFallback()
            recordOperationError("should-touch")
            true
        }
    }

    override fun evict(tokenHash: String) {
        runCatching {
            val deleted = redisTemplate.delete(listOf(sessionKey(tokenHash), touchKey(tokenHash))) ?: 0
            if (deleted > 0) {
                metrics.increment("readmates.auth_session_cache.evicted", "scope", "session")
            }
        }.onFailure {
            recordFallback()
            recordOperationError("evict")
        }
    }

    override fun evictAllForUser(userId: String) {
        runCatching {
            val userKey = userSessionsKey(userId)
            val tokenHashes = redisTemplate.opsForSet().members(userKey).orEmpty()
            val keys = tokenHashes.flatMap { listOf(sessionKey(it), touchKey(it)) } + userKey
            if (keys.isNotEmpty()) {
                val deleted = redisTemplate.delete(keys) ?: 0
                if (deleted > 0) {
                    metrics.increment("readmates.auth_session_cache.evicted", "scope", "user")
                }
            }
        }.onFailure {
            recordFallback()
            recordOperationError("evict-all-for-user")
        }
    }

    private fun safeDelete(key: String) {
        runCatching {
            redisTemplate.delete(key)
        }.onFailure {
            recordOperationError("delete")
        }
    }

    private fun recordFallback(feature: String = "auth-session") {
        metrics.increment("readmates.redis.fallbacks", "feature", feature)
    }

    private fun recordOperationError(operation: String) {
        metrics.increment("readmates.redis.operation.errors", "feature", "auth-session", "operation", operation)
    }

    private fun recordCacheHit() {
        metrics.increment("readmates.auth_session_cache.hit")
    }

    private fun recordCacheMiss() {
        metrics.increment("readmates.auth_session_cache.miss")
    }

    private fun sessionKey(tokenHash: String) = "auth:session:$tokenHash"
    private fun touchKey(tokenHash: String) = "auth:last-seen-touch:$tokenHash"
    private fun userSessionsKey(userId: String) = "auth:user-sessions:$userId"
    private fun Duration.toRedisMillis() = maxOf(toMillis(), 1L)

    private data class CachedAuthSession(
        val schemaVersion: Int = 0,
        val sessionId: String = "",
        val userId: String = "",
        val expiresAt: String = "",
    ) {
        fun toSnapshot() =
            AuthSessionCacheSnapshot(
                sessionId = sessionId,
                userId = userId,
                expiresAt = OffsetDateTime.parse(expiresAt),
            )

        companion object {
            fun from(snapshot: AuthSessionCacheSnapshot) =
                CachedAuthSession(
                    schemaVersion = SCHEMA_VERSION,
                    sessionId = snapshot.sessionId,
                    userId = snapshot.userId,
                    expiresAt = snapshot.expiresAt.toString(),
                )
        }
    }

    private companion object {
        const val SCHEMA_VERSION = 1
        val REMEMBER_USER_SESSION_SCRIPT: DefaultRedisScript<Long> = DefaultRedisScript(
            """
            redis.call('SADD', KEYS[1], ARGV[1])
            local ttl = redis.call('PTTL', KEYS[1])
            local requestedTtl = tonumber(ARGV[2])
            if ttl < 0 or ttl < requestedTtl then
              redis.call('PEXPIRE', KEYS[1], requestedTtl)
            end
            return ttl
            """.trimIndent(),
            Long::class.java,
        )
    }
}
