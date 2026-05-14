package com.readmates.shared.adapter.out.redis

import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.connection.RedisConnection
import org.springframework.data.redis.core.RedisCallback
import org.springframework.data.redis.core.StringRedisTemplate
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
class RedisReadCacheInvalidationAdapterTest(
    @param:Autowired private val adapter: RedisReadCacheInvalidationAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) : ReadmatesRedisIntegrationTestSupport() {
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
        val adapter =
            RedisReadCacheInvalidationAdapter(
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

    @Test
    fun `scenario A - evicts 50 public session keys for clubId while preserving other club keys`() {
        val scenarioClubId = UUID.fromString("00000000-0000-0000-0000-000000000A01")
        val otherClubId = UUID.fromString("00000000-0000-0000-0000-000000000A02")

        val clubKeys =
            (1..50)
                .map { i ->
                    val sessionId = UUID.fromString("00000000-0000-0000-0000-%012d".format(i))
                    "public:club:$scenarioClubId:session:$sessionId:v1"
                }.toSet() + setOf("public:club:$scenarioClubId:home:v1")

        val otherClubKeys =
            (1..5)
                .map { i ->
                    val sessionId = UUID.fromString("00000000-0000-0000-0000-%012d".format(i + 100))
                    "public:club:$otherClubId:session:$sessionId:v1"
                }.toSet()

        (clubKeys + otherClubKeys).forEach { key -> redisTemplate.opsForValue().set(key, "cached") }
        try {
            adapter.evictClubContent(scenarioClubId)

            clubKeys.forEach { key ->
                assertThat(redisTemplate.hasKey(key))
                    .describedAs("$key should be deleted")
                    .isFalse()
            }
            otherClubKeys.forEach { key ->
                assertThat(redisTemplate.hasKey(key))
                    .describedAs("$key should remain for other club")
                    .isTrue()
            }
        } finally {
            redisTemplate.delete(clubKeys + otherClubKeys)
        }
    }

    @Test
    fun `scenario B - evicts 30 notes session feed keys plus fixed notes keys for clubId`() {
        val scenarioClubId = UUID.fromString("00000000-0000-0000-0000-000000000B01")

        val notesSessionKeys =
            (1..30)
                .map { i ->
                    val sessionId = UUID.fromString("00000000-0000-0000-0000-%012d".format(i + 200))
                    "notes:club:$scenarioClubId:session:$sessionId:feed:v1"
                }.toSet()

        val fixedNotesKeys =
            setOf(
                "notes:club:$scenarioClubId:feed:v1",
                "notes:club:$scenarioClubId:sessions:v1",
            )

        val allScenarioKeys = notesSessionKeys + fixedNotesKeys
        allScenarioKeys.forEach { key -> redisTemplate.opsForValue().set(key, "cached") }
        try {
            adapter.evictClubContent(scenarioClubId)

            allScenarioKeys.forEach { key ->
                assertThat(redisTemplate.hasKey(key))
                    .describedAs("$key should be deleted")
                    .isFalse()
            }
        } finally {
            redisTemplate.delete(allScenarioKeys)
        }
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
            @Suppress("ktlint:standard:function-expression-body")
            override fun <T : Any?> execute(action: RedisCallback<T>): T? {
                throw IllegalStateException("redis unavailable")
            }
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

        private val PUBLIC_CLUB_KEY = "public:club:$TARGET_CLUB_ID:home:v1"
        private val UNRELATED_PUBLIC_CLUB_KEY = "public:club:$UNRELATED_CLUB_ID:home:v1"

        private fun publicSessionKey(sessionId: UUID) = "public:club:$TARGET_CLUB_ID:session:$sessionId:v1"

        private fun unrelatedPublicSessionKey(sessionId: UUID) = "public:club:$UNRELATED_CLUB_ID:session:$sessionId:v1"

        private fun notesFeedKey(clubId: UUID) = "notes:club:$clubId:feed:v1"

        private fun notesSessionsKey(clubId: UUID) = "notes:club:$clubId:sessions:v1"

        private fun notesSessionFeedKey(
            clubId: UUID,
            sessionId: UUID,
        ) = "notes:club:$clubId:session:$sessionId:feed:v1"

        private val targetKeys =
            setOf(
                PUBLIC_CLUB_KEY,
                publicSessionKey(SESSION_ID),
                publicSessionKey(OTHER_SESSION_ID),
                notesFeedKey(TARGET_CLUB_ID),
                notesSessionsKey(TARGET_CLUB_ID),
                notesSessionFeedKey(TARGET_CLUB_ID, SESSION_ID),
            )
        private val unrelatedClubKeys =
            setOf(
                UNRELATED_PUBLIC_CLUB_KEY,
                unrelatedPublicSessionKey(SESSION_ID),
                notesFeedKey(UNRELATED_CLUB_ID),
                notesSessionsKey(UNRELATED_CLUB_ID),
                notesSessionFeedKey(UNRELATED_CLUB_ID, OTHER_SESSION_ID),
            )
        private val allKeys = targetKeys + unrelatedClubKeys
    }
}
