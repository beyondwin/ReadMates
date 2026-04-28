package com.readmates.publication.adapter.out.redis

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.PublicReadCachePort
import com.readmates.shared.cache.CacheJsonCodec
import com.readmates.shared.cache.PublicCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.MySqlTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.support.StaticApplicationContext
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.public-cache.enabled=true",
    ],
)
class RedisPublicReadCacheAdapterTest(
    @param:Autowired private val adapter: RedisPublicReadCacheAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) {
    private val contextRunner = ApplicationContextRunner()
        .withUserConfiguration(PublicReadCacheAdapterBeanTestConfiguration::class.java)

    @Test
    fun `selects expected public read cache adapter for redis and public cache flags`() {
        val cases = listOf(
            PublicReadCacheAdapterCase(
                redisEnabled = true,
                publicCacheEnabled = true,
                expectedAdapter = RedisPublicReadCacheAdapter::class.java,
            ),
            PublicReadCacheAdapterCase(
                redisEnabled = true,
                publicCacheEnabled = false,
                expectedAdapter = NoopPublicReadCacheAdapter::class.java,
            ),
            PublicReadCacheAdapterCase(
                redisEnabled = false,
                publicCacheEnabled = true,
                expectedAdapter = NoopPublicReadCacheAdapter::class.java,
            ),
            PublicReadCacheAdapterCase(
                redisEnabled = false,
                publicCacheEnabled = false,
                expectedAdapter = NoopPublicReadCacheAdapter::class.java,
            ),
        )

        cases.forEach { case ->
            contextRunner
                .withPropertyValues(
                    "readmates.redis.enabled=${case.redisEnabled}",
                    "readmates.public-cache.enabled=${case.publicCacheEnabled}",
                ).run { context ->
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, public-cache=${case.publicCacheEnabled}")
                        .hasSingleBean(PublicReadCachePort::class.java)
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, public-cache=${case.publicCacheEnabled}")
                        .hasSingleBean(case.expectedAdapter)
                }
        }
    }

    @Test
    fun `stores and loads public club`() {
        redisTemplate.delete(CLUB_KEY)
        val hitsBefore = counterValue("readmates.public_cache.hit", "scope", "club")
        val club = publicClub()

        adapter.putClub(club)

        val rawJson = redisTemplate.opsForValue().get(CLUB_KEY)
        assertThat(rawJson).contains("ReadMates", "recentSessions")
        assertEquals(club, adapter.getClub())
        assertEquals(hitsBefore + 1.0, counterValue("readmates.public_cache.hit", "scope", "club"))
        assertThat(redisTemplate.getExpire(CLUB_KEY, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(14).toMillis())
    }

    @Test
    fun `stores and loads public session`() {
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val key = sessionKey(sessionId)
        redisTemplate.delete(key)
        val hitsBefore = counterValue("readmates.public_cache.hit", "scope", "session")
        val session = publicSession(sessionId)

        adapter.putSession(sessionId, session)

        val rawJson = redisTemplate.opsForValue().get(key)
        assertThat(rawJson).contains(sessionId.toString(), "Book")
        assertEquals(session, adapter.getSession(sessionId))
        assertEquals(hitsBefore + 1.0, counterValue("readmates.public_cache.hit", "scope", "session"))
        assertThat(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(14).toMillis())
    }

    @Test
    fun `missing public club records cache miss metric`() {
        redisTemplate.delete(CLUB_KEY)
        val missesBefore = counterValue("readmates.public_cache.miss", "scope", "club")

        assertNull(adapter.getClub())

        assertEquals(missesBefore + 1.0, counterValue("readmates.public_cache.miss", "scope", "club"))
    }

    @Test
    fun `decode failure deletes corrupt club and records fallback metrics`() {
        redisTemplate.opsForValue().set(CLUB_KEY, "{")
        val missesBefore = counterValue("readmates.public_cache.miss", "scope", "club")
        val fallbacksBefore = counterValue("readmates.redis.fallbacks", "feature", "public-cache-decode")
        val errorsBefore = counterValue(
            "readmates.redis.operation.errors",
            "feature",
            "public-cache",
            "operation",
            "decode",
        )

        assertNull(adapter.getClub())

        assertFalse(redisTemplate.hasKey(CLUB_KEY))
        assertEquals(missesBefore + 1.0, counterValue("readmates.public_cache.miss", "scope", "club"))
        assertEquals(fallbacksBefore + 1.0, counterValue("readmates.redis.fallbacks", "feature", "public-cache-decode"))
        assertEquals(
            errorsBefore + 1.0,
            counterValue(
                "readmates.redis.operation.errors",
                "feature",
                "public-cache",
                "operation",
                "decode",
            ),
        )
    }

    @Test
    fun `redis lookup failure returns cache miss and records operation metrics`() {
        val registry = SimpleMeterRegistry()
        val adapter = RedisPublicReadCacheAdapter(
            redisTemplate = failingRedisTemplate(),
            codec = CacheJsonCodec(JsonMapper.builder().findAndAddModules().build()),
            properties = PublicCacheProperties(enabled = true),
            metrics = metrics(registry),
        )

        assertNull(adapter.getClub())

        assertEquals(1.0, counterValue(registry, "readmates.public_cache.miss", "scope", "club"))
        assertEquals(1.0, counterValue(registry, "readmates.redis.fallbacks", "feature", "public-cache"))
        assertEquals(
            1.0,
            counterValue(
                registry,
                "readmates.redis.operation.errors",
                "feature",
                "public-cache",
                "operation",
                "get-club",
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
            override fun opsForValue() = throw IllegalStateException("redis unavailable")
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
        private const val CLUB_KEY = "public:club:v1"

        private fun sessionKey(sessionId: UUID) = "public:session:$sessionId:v1"

        @JvmStatic
        @DynamicPropertySource
        fun testProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}

private data class PublicReadCacheAdapterCase(
    val redisEnabled: Boolean,
    val publicCacheEnabled: Boolean,
    val expectedAdapter: Class<out PublicReadCachePort>,
)

@TestConfiguration(proxyBeanMethods = false)
@EnableConfigurationProperties(PublicCacheProperties::class)
@Import(
    RedisPublicReadCacheAdapter::class,
    NoopPublicReadCacheAdapter::class,
    RedisCacheMetrics::class,
)
private class PublicReadCacheAdapterBeanTestConfiguration {
    @Bean
    fun redisTemplate(): StringRedisTemplate =
        Mockito.mock(StringRedisTemplate::class.java)

    @Bean
    fun cacheJsonCodec(): CacheJsonCodec =
        CacheJsonCodec(JsonMapper.builder().findAndAddModules().build())
}

private fun publicClub() = PublicClubResult(
    clubName = "ReadMates",
    tagline = "Read together",
    about = "About",
    stats = PublicClubStatsResult(sessions = 1, books = 1, members = 3),
    recentSessions = emptyList(),
)

private fun publicSession(sessionId: UUID) = PublicSessionDetailResult(
    sessionId = sessionId.toString(),
    sessionNumber = 1,
    bookTitle = "Book",
    bookAuthor = "Author",
    bookImageUrl = null,
    date = "2026-04-28",
    summary = "Summary",
    highlights = emptyList(),
    oneLiners = emptyList(),
)
