package com.readmates.shared.adapter.out.redis

import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.MySqlTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
    ],
)
class RedisReadCacheInvalidationAdapterTest(
    @param:Autowired private val adapter: RedisReadCacheInvalidationAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) {
    @AfterEach
    fun cleanUp() {
        redisTemplate.delete(allKeys)
    }

    @Test
    fun `evicts public keys and target club notes keys while preserving unrelated club notes keys`() {
        redisTemplate.delete(allKeys)
        allKeys.forEach { key -> redisTemplate.opsForValue().set(key, "cached") }
        val publicEvictionsBefore = counterValue("readmates.public_cache.evicted", "scope", "club")
        val notesEvictionsBefore = counterValue("readmates.notes_cache.evicted", "scope", "club")

        adapter.evictClubContent(TARGET_CLUB_ID)

        targetKeys.forEach { key ->
            assertThat(redisTemplate.hasKey(key))
                .describedAs("$key should be deleted")
                .isFalse()
        }
        unrelatedClubKeys.forEach { key ->
            assertThat(redisTemplate.hasKey(key))
                .describedAs("$key should remain")
                .isTrue()
        }
        assertEquals(
            publicEvictionsBefore + 1.0,
            counterValue("readmates.public_cache.evicted", "scope", "club"),
        )
        assertEquals(
            notesEvictionsBefore + 1.0,
            counterValue("readmates.notes_cache.evicted", "scope", "club"),
        )
    }

    @Test
    fun `redis failure records fallback and operation error metrics`() {
        val registry = SimpleMeterRegistry()
        val adapter = RedisReadCacheInvalidationAdapter(
            redisTemplate = failingRedisTemplate(),
            metrics = metrics(registry),
        )

        adapter.evictClubContent(TARGET_CLUB_ID)

        assertEquals(
            2.0,
            counterValue(registry, "readmates.redis.fallbacks", "feature", "read-cache-invalidation"),
        )
        assertEquals(
            1.0,
            counterValue(
                registry,
                "readmates.redis.operation.errors",
                "feature",
                "read-cache-invalidation",
                "operation",
                "evict-public-content",
            ),
        )
        assertEquals(
            1.0,
            counterValue(
                registry,
                "readmates.redis.operation.errors",
                "feature",
                "read-cache-invalidation",
                "operation",
                "evict-notes-content",
            ),
        )
    }

    private fun counterValue(
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    private fun counterValue(
        meterRegistry: MeterRegistry,
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    private fun failingRedisTemplate() =
        object : StringRedisTemplate() {
            override fun keys(pattern: String) = throw IllegalStateException("redis unavailable")
        }

    private fun metrics(meterRegistry: MeterRegistry) =
        RedisCacheMetrics(
            object : ObjectProvider<MeterRegistry> {
                override fun getObject() = meterRegistry

                override fun getObject(vararg args: Any?) = meterRegistry

                override fun getIfAvailable() = meterRegistry

                override fun getIfUnique() = meterRegistry
            },
        )

    companion object {
        private val TARGET_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000801")
        private val UNRELATED_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000802")
        private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000803")
        private val OTHER_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000804")

        private const val PUBLIC_CLUB_KEY = "public:club:v1"

        private fun publicSessionKey(sessionId: UUID) = "public:session:$sessionId:v1"
        private fun notesFeedKey(clubId: UUID) = "notes:club:$clubId:feed:v1"
        private fun notesSessionsKey(clubId: UUID) = "notes:club:$clubId:sessions:v1"
        private fun notesSessionFeedKey(
            clubId: UUID,
            sessionId: UUID,
        ) = "notes:club:$clubId:session:$sessionId:feed:v1"

        private val targetKeys = setOf(
            PUBLIC_CLUB_KEY,
            publicSessionKey(SESSION_ID),
            publicSessionKey(OTHER_SESSION_ID),
            notesFeedKey(TARGET_CLUB_ID),
            notesSessionsKey(TARGET_CLUB_ID),
            notesSessionFeedKey(TARGET_CLUB_ID, SESSION_ID),
        )
        private val unrelatedClubKeys = setOf(
            notesFeedKey(UNRELATED_CLUB_ID),
            notesSessionsKey(UNRELATED_CLUB_ID),
            notesSessionFeedKey(UNRELATED_CLUB_ID, OTHER_SESSION_ID),
        )
        private val allKeys = targetKeys + unrelatedClubKeys

        @JvmStatic
        @DynamicPropertySource
        fun testProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}
