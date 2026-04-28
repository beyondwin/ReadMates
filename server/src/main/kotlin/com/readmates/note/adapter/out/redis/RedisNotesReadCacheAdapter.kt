package com.readmates.note.adapter.out.redis

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.cache.NotesCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import tools.jackson.databind.JavaType
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "notes-cache.enabled"], havingValue = "true")
class RedisNotesReadCacheAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val objectMapper: ObjectMapper,
    private val properties: NotesCacheProperties,
    private val metrics: RedisCacheMetrics,
) : NotesReadCachePort {
    private val feedListType = objectMapper.typeFactory.constructCollectionType(List::class.java, NoteFeedResult::class.java)
    private val sessionListType = objectMapper.typeFactory.constructCollectionType(List::class.java, NoteSessionResult::class.java)

    override fun getFeed(clubId: UUID): List<NoteFeedResult>? =
        getList(feedKey(clubId), feedListType, "feed", "get-feed")

    override fun putFeed(clubId: UUID, result: List<NoteFeedResult>) {
        store(feedKey(clubId), result, "put-feed")
    }

    override fun getSessionFeed(clubId: UUID, sessionId: UUID): List<NoteFeedResult>? =
        getList(sessionFeedKey(clubId, sessionId), feedListType, "session-feed", "get-session-feed")

    override fun putSessionFeed(clubId: UUID, sessionId: UUID, result: List<NoteFeedResult>) {
        store(sessionFeedKey(clubId, sessionId), result, "put-session-feed")
    }

    override fun getSessions(clubId: UUID): List<NoteSessionResult>? =
        getList(sessionsKey(clubId), sessionListType, "sessions", "get-sessions")

    override fun putSessions(clubId: UUID, result: List<NoteSessionResult>) {
        store(sessionsKey(clubId), result, "put-sessions")
    }

    private fun <T : Any> getList(key: String, type: JavaType, scope: String, operation: String): List<T>? =
        runCatching {
            val raw = redisTemplate.opsForValue().get(key) ?: run {
                recordCacheMiss(scope)
                return null
            }
            decodeList<T>(raw, type, key, scope) ?: return null
        }.getOrElse {
            recordCacheMiss(scope)
            recordFallback()
            recordOperationError(operation)
            null
        }

    private fun <T : Any> decodeList(raw: String, type: JavaType, key: String, scope: String): List<T>? {
        val decoded = runCatching {
            objectMapper.readValue<List<T>>(raw, type)
        }.getOrNull()
        if (decoded == null) {
            safeDelete(key)
            recordCacheMiss(scope)
            recordFallback("notes-cache-decode")
            recordOperationError("decode")
            return null
        }
        recordCacheHit(scope)
        return decoded
    }

    private fun store(key: String, result: Any, operation: String) {
        if (properties.feedTtl <= Duration.ZERO) {
            return
        }
        runCatching {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(result), properties.feedTtl)
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
        metrics.increment("readmates.notes_cache.hit", "scope", scope)
    }

    private fun recordCacheMiss(scope: String) {
        metrics.increment("readmates.notes_cache.miss", "scope", scope)
    }

    private fun recordFallback(feature: String = "notes-cache") {
        metrics.increment("readmates.redis.fallbacks", "feature", feature)
    }

    private fun recordOperationError(operation: String) {
        metrics.increment("readmates.redis.operation.errors", "feature", "notes-cache", "operation", operation)
    }

    private companion object {
        fun feedKey(clubId: UUID) = "notes:club:$clubId:feed:v1"
        fun sessionFeedKey(clubId: UUID, sessionId: UUID) = "notes:club:$clubId:session:$sessionId:feed:v1"
        fun sessionsKey(clubId: UUID) = "notes:club:$clubId:sessions:v1"
    }
}
