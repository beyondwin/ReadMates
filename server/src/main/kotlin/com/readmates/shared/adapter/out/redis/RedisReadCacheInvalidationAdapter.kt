package com.readmates.shared.adapter.out.redis

import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.ScanOptions
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.redis", name = ["enabled"], havingValue = "true")
class RedisReadCacheInvalidationAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val metrics: RedisCacheMetrics,
    private val circuitBreakers: OutboundCircuitBreakers,
) : ReadCacheInvalidationPort {
    override fun evictClubContent(clubId: UUID) {
        evictClubContentStrict(clubId)
    }

    override fun evictClubContentStrict(clubId: UUID): Boolean {
        val publicEvicted = evictPublicContent(clubId)
        val notesEvicted = evictNotesContent(clubId)
        return publicEvicted && notesEvicted
    }

    private fun evictPublicContent(clubId: UUID): Boolean =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordRedisFailure("evict-public-content")
                false
            },
        ) {
            val publicKeys = mutableSetOf("public:club:$clubId:home:v1")
            publicKeys.addAll(scanKeys("public:club:$clubId:session:*:v1"))
            delete(publicKeys)
            metrics.increment("readmates.public_cache.evicted", "scope", "club")
            true
        }

    private fun evictNotesContent(clubId: UUID): Boolean =
        circuitBreakers.execute(
            name = CIRCUIT_BREAKER_NAME,
            fallback = {
                recordRedisFailure("evict-notes-content")
                false
            },
        ) {
            val notesKeys =
                mutableSetOf(
                    "notes:club:$clubId:feed:v1",
                    "notes:club:$clubId:sessions:v1",
                )
            notesKeys.addAll(scanKeys("notes:club:$clubId:session:*:feed:v1"))
            delete(notesKeys)
            metrics.increment("readmates.notes_cache.evicted", "scope", "club")
            true
        }

    private fun delete(keys: Set<String>) {
        if (keys.isNotEmpty()) {
            redisTemplate.delete(keys)
        }
    }

    private fun recordRedisFailure(operation: String) {
        metrics.increment("readmates.redis.fallbacks", "feature", "read-cache-invalidation")
        metrics.increment(
            "readmates.redis.operation.errors",
            "feature",
            "read-cache-invalidation",
            "operation",
            operation,
        )
    }

    private fun scanKeys(pattern: String): Set<String> {
        val options =
            ScanOptions
                .scanOptions()
                .match(pattern)
                .count(SCAN_BATCH_SIZE)
                .build()
        val collected = mutableSetOf<String>()
        redisTemplate.execute<Unit> { connection ->
            connection.keyCommands().scan(options).use { cursor ->
                while (cursor.hasNext()) {
                    collected.add(String(cursor.next(), Charsets.UTF_8))
                }
            }
            Unit
        }
        return collected
    }

    private companion object {
        const val CIRCUIT_BREAKER_NAME = "redis-cache-invalidation"

        private const val SCAN_BATCH_SIZE = 256L
    }
}
