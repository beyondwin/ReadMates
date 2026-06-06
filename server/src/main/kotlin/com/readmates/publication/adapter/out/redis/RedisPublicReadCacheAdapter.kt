package com.readmates.publication.adapter.out.redis

import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_ID
import com.readmates.publication.application.model.LEGACY_PUBLIC_CLUB_SLUG
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.PublicReadCachePort
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
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
    private val circuitBreakers: OutboundCircuitBreakers,
) : PublicReadCachePort {
    override fun getClub(): PublicClubResult? = loadClubFromCache(clubKey(UUID.fromString(LEGACY_PUBLIC_CLUB_ID)))

    override fun getClub(clubSlug: String): PublicClubResult? = if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getClub() else null

    override fun getClub(clubId: UUID): PublicClubResult? = loadClubFromCache(clubKey(clubId))

    private fun loadClubFromCache(key: String): PublicClubResult? =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordCacheMiss("club")
                recordFallback()
                recordOperationError("get-club")
                null
            },
        ) {
            val raw = redisTemplate.opsForValue().get(key)
            if (raw == null) {
                recordCacheMiss("club")
                null
            } else {
                val decoded = codec.decode(raw, PublicClubResult::class.java)
                if (decoded == null) {
                    safeDelete(key)
                    recordCacheMiss("club")
                    recordFallback("public-cache-decode")
                    recordOperationError("decode")
                    null
                } else {
                    recordCacheHit("club")
                    decoded
                }
            }
        }

    override fun putClub(result: PublicClubResult) {
        store(clubKey(UUID.fromString(LEGACY_PUBLIC_CLUB_ID)), result, properties.clubTtl, "put-club")
    }

    override fun putClub(
        clubSlug: String,
        result: PublicClubResult,
    ) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putClub(result)
        }
    }

    override fun putClub(
        clubId: UUID,
        result: PublicClubResult,
    ) {
        store(clubKey(clubId), result, properties.clubTtl, "put-club")
    }

    override fun getSession(sessionId: UUID): PublicSessionDetailResult? =
        loadSessionFromCache(sessionKey(UUID.fromString(LEGACY_PUBLIC_CLUB_ID), sessionId))

    override fun getSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult? = if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) getSession(sessionId) else null

    override fun getSession(
        clubId: UUID,
        sessionId: UUID,
    ): PublicSessionDetailResult? = loadSessionFromCache(sessionKey(clubId, sessionId))

    private fun loadSessionFromCache(key: String): PublicSessionDetailResult? =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordCacheMiss("session")
                recordFallback()
                recordOperationError("get-session")
                null
            },
        ) {
            val raw = redisTemplate.opsForValue().get(key)
            if (raw == null) {
                recordCacheMiss("session")
                null
            } else {
                val decoded = codec.decode(raw, PublicSessionDetailResult::class.java)
                if (decoded == null) {
                    safeDelete(key)
                    recordCacheMiss("session")
                    recordFallback("public-cache-decode")
                    recordOperationError("decode")
                    null
                } else {
                    recordCacheHit("session")
                    decoded
                }
            }
        }

    override fun putSession(
        sessionId: UUID,
        result: PublicSessionDetailResult,
    ) {
        store(sessionKey(UUID.fromString(LEGACY_PUBLIC_CLUB_ID), sessionId), result, properties.sessionTtl, "put-session")
    }

    override fun putSession(
        clubSlug: String,
        sessionId: UUID,
        result: PublicSessionDetailResult,
    ) {
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            putSession(sessionId, result)
        }
    }

    override fun putSession(
        clubId: UUID,
        sessionId: UUID,
        result: PublicSessionDetailResult,
    ) {
        store(sessionKey(clubId, sessionId), result, properties.sessionTtl, "put-session")
    }

    override fun getClubId(clubSlug: String): UUID? =
        if (clubSlug == LEGACY_PUBLIC_CLUB_SLUG) {
            UUID.fromString(LEGACY_PUBLIC_CLUB_ID)
        } else {
            loadClubIdFromCache(clubIdKey(clubSlug))
        }

    private fun loadClubIdFromCache(key: String): UUID? =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordCacheMiss("club-id")
                recordFallback()
                recordOperationError("get-club-id")
                null
            },
        ) {
            val raw = redisTemplate.opsForValue().get(key)
            if (raw == null) {
                recordCacheMiss("club-id")
                null
            } else {
                recordCacheHit("club-id")
                UUID.fromString(raw)
            }
        }

    override fun putClubId(
        clubSlug: String,
        clubId: UUID,
    ) {
        if (clubSlug != LEGACY_PUBLIC_CLUB_SLUG) {
            storeRaw(clubIdKey(clubSlug), clubId.toString(), properties.clubTtl, "put-club-id")
        }
    }

    private fun store(
        key: String,
        result: Any,
        ttl: Duration,
        operation: String,
    ) {
        if (ttl <= Duration.ZERO) {
            return
        }
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordFallback()
                recordOperationError(operation)
            },
        ) {
            redisTemplate.opsForValue().set(key, codec.encode(result), ttl)
        }
    }

    private fun storeRaw(
        key: String,
        value: String,
        ttl: Duration,
        operation: String,
    ) {
        if (ttl <= Duration.ZERO) {
            return
        }
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordFallback()
                recordOperationError(operation)
            },
        ) {
            redisTemplate.opsForValue().set(key, value, ttl)
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
        const val CIRCUIT_BREAKER_NAME = "redis-public-cache"

        fun clubKey(clubId: UUID) = "public:club:$clubId:home:v1"

        fun sessionKey(
            clubId: UUID,
            sessionId: UUID,
        ) = "public:club:$clubId:session:$sessionId:v1"

        fun clubIdKey(clubSlug: String) = "public:club-slug:$clubSlug:id:v1"
    }
}
