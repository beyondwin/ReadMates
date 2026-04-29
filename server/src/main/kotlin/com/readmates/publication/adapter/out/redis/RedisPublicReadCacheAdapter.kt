package com.readmates.publication.adapter.out.redis

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.PublicReadCachePort
import com.readmates.shared.cache.CacheJsonCodec
import com.readmates.shared.cache.PublicCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "public-cache.enabled"], havingValue = "true")
class RedisPublicReadCacheAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val codec: CacheJsonCodec,
    private val properties: PublicCacheProperties,
    private val metrics: RedisCacheMetrics,
) : PublicReadCachePort {
    override fun getClub(): PublicClubResult? =
        loadClubFromCache(CLUB_KEY)

    override fun getClub(clubSlug: String): PublicClubResult? =
        loadClubFromCache(clubKey(clubSlug))

    private fun loadClubFromCache(key: String): PublicClubResult? =
        runCatching {
            val raw = redisTemplate.opsForValue().get(key) ?: run {
                recordCacheMiss("club")
                return null
            }
            val decoded = codec.decode(raw, PublicClubResult::class.java)
            if (decoded == null) {
                safeDelete(key)
                recordCacheMiss("club")
                recordFallback("public-cache-decode")
                recordOperationError("decode")
                return null
            }
            recordCacheHit("club")
            decoded
        }.getOrElse {
            recordCacheMiss("club")
            recordFallback()
            recordOperationError("get-club")
            null
        }

    override fun putClub(result: PublicClubResult) {
        store(CLUB_KEY, result, properties.clubTtl, "put-club")
    }

    override fun putClub(clubSlug: String, result: PublicClubResult) {
        store(clubKey(clubSlug), result, properties.clubTtl, "put-club")
    }

    override fun getSession(sessionId: UUID): PublicSessionDetailResult? {
        return loadSessionFromCache(sessionKey(sessionId))
    }

    override fun getSession(clubSlug: String, sessionId: UUID): PublicSessionDetailResult? {
        return loadSessionFromCache(sessionKey(clubSlug, sessionId))
    }

    private fun loadSessionFromCache(key: String): PublicSessionDetailResult? =
        runCatching {
            val raw = redisTemplate.opsForValue().get(key) ?: run {
                recordCacheMiss("session")
                return null
            }
            val decoded = codec.decode(raw, PublicSessionDetailResult::class.java)
            if (decoded == null) {
                safeDelete(key)
                recordCacheMiss("session")
                recordFallback("public-cache-decode")
                recordOperationError("decode")
                return null
            }
            recordCacheHit("session")
            decoded
        }.getOrElse {
            recordCacheMiss("session")
            recordFallback()
            recordOperationError("get-session")
            null
        }

    override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) {
        store(sessionKey(sessionId), result, properties.sessionTtl, "put-session")
    }

    override fun putSession(clubSlug: String, sessionId: UUID, result: PublicSessionDetailResult) {
        store(sessionKey(clubSlug, sessionId), result, properties.sessionTtl, "put-session")
    }

    private fun store(key: String, result: Any, ttl: Duration, operation: String) {
        if (ttl <= Duration.ZERO) {
            return
        }
        runCatching {
            redisTemplate.opsForValue().set(key, codec.encode(result), ttl)
        }.onFailure {
            recordFallback()
            recordOperationError(operation)
        }
    }

    private fun safeDelete(key: String) {
        runCatching {
            redisTemplate.delete(key)
        }.onFailure {
            recordOperationError("delete")
        }
    }

    private fun recordCacheHit(scope: String) {
        metrics.increment("readmates.public_cache.hit", "scope", scope)
    }

    private fun recordCacheMiss(scope: String) {
        metrics.increment("readmates.public_cache.miss", "scope", scope)
    }

    private fun recordFallback(feature: String = "public-cache") {
        metrics.increment("readmates.redis.fallbacks", "feature", feature)
    }

    private fun recordOperationError(operation: String) {
        metrics.increment("readmates.redis.operation.errors", "feature", "public-cache", "operation", operation)
    }

    private companion object {
        const val CLUB_KEY = "public:club:v1"

        fun clubKey(clubSlug: String) =
            if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) CLUB_KEY else "public:club:$clubSlug:v1"

        fun sessionKey(sessionId: UUID) = "public:session:$sessionId:v1"

        fun sessionKey(clubSlug: String, sessionId: UUID) =
            if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
                sessionKey(sessionId)
            } else {
                "public:session:$clubSlug:$sessionId:v1"
            }
    }
}
