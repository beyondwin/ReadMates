package com.readmates.shared.adapter.out.redis

import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.redis", name = ["enabled"], havingValue = "true")
class RedisReadCacheInvalidationAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val metrics: RedisCacheMetrics,
) : ReadCacheInvalidationPort {
    override fun evictClubContent(clubId: UUID) {
        evictPublicContent(clubId)
        evictNotesContent(clubId)
    }

    private fun evictPublicContent(clubId: UUID) {
        runCatching {
            val publicKeys = mutableSetOf("public:club:$clubId:home:v1")
            redisTemplate.keys("public:club:$clubId:session:*:v1")?.let(publicKeys::addAll)
            delete(publicKeys)
            metrics.increment("readmates.public_cache.evicted", "scope", "club")
        }.onFailure {
            recordRedisFailure("evict-public-content")
        }
    }

    private fun evictNotesContent(clubId: UUID) {
        runCatching {
            val notesKeys = mutableSetOf(
                "notes:club:$clubId:feed:v1",
                "notes:club:$clubId:sessions:v1",
            )
            redisTemplate.keys("notes:club:$clubId:session:*:feed:v1")?.let(notesKeys::addAll)
            delete(notesKeys)
            metrics.increment("readmates.notes_cache.evicted", "scope", "club")
        }.onFailure {
            recordRedisFailure("evict-notes-content")
        }
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

}
