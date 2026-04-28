package com.readmates.note.adapter.out.redis

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.NotesReadCachePort
import com.readmates.shared.cache.NotesCacheProperties
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.support.MySqlTestContainer
import com.readmates.support.RedisTestContainer
import io.micrometer.core.instrument.MeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.notes-cache.enabled=true",
    ],
)
class RedisNotesReadCacheAdapterTest(
    @param:Autowired private val adapter: RedisNotesReadCacheAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) {
    private val contextRunner = ApplicationContextRunner()
        .withUserConfiguration(NotesReadCacheAdapterBeanTestConfiguration::class.java)

    @Test
    fun `selects expected notes read cache adapter for redis and notes cache flags`() {
        val cases = listOf(
            NotesReadCacheAdapterCase(
                redisEnabled = true,
                notesCacheEnabled = true,
                expectedAdapter = RedisNotesReadCacheAdapter::class.java,
            ),
            NotesReadCacheAdapterCase(
                redisEnabled = true,
                notesCacheEnabled = false,
                expectedAdapter = NoopNotesReadCacheAdapter::class.java,
            ),
            NotesReadCacheAdapterCase(
                redisEnabled = false,
                notesCacheEnabled = true,
                expectedAdapter = NoopNotesReadCacheAdapter::class.java,
            ),
            NotesReadCacheAdapterCase(
                redisEnabled = false,
                notesCacheEnabled = false,
                expectedAdapter = NoopNotesReadCacheAdapter::class.java,
            ),
        )

        cases.forEach { case ->
            contextRunner
                .withPropertyValues(
                    "readmates.redis.enabled=${case.redisEnabled}",
                    "readmates.notes-cache.enabled=${case.notesCacheEnabled}",
                ).run { context ->
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, notes-cache=${case.notesCacheEnabled}")
                        .hasSingleBean(NotesReadCachePort::class.java)
                    assertThat(context)
                        .describedAs("redis=${case.redisEnabled}, notes-cache=${case.notesCacheEnabled}")
                        .hasSingleBean(case.expectedAdapter)
                }
        }
    }

    @Test
    fun `stores and loads notes club feed`() {
        val key = feedKey(CLUB_ID)
        redisTemplate.delete(key)
        val hitsBefore = counterValue("readmates.notes_cache.hit", "scope", "feed")
        val feed = listOf(feedItem())

        adapter.putFeed(CLUB_ID, feed)

        val rawJson = redisTemplate.opsForValue().get(key)
        assertThat(rawJson).contains(SESSION_ID.toString(), "QUESTION")
        assertEquals(feed, adapter.getFeed(CLUB_ID))
        assertEquals(hitsBefore + 1.0, counterValue("readmates.notes_cache.hit", "scope", "feed"))
        assertThat(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(2).toMillis())
    }

    @Test
    fun `stores and loads notes session feed`() {
        val key = sessionFeedKey(CLUB_ID, SESSION_ID)
        redisTemplate.delete(key)
        val hitsBefore = counterValue("readmates.notes_cache.hit", "scope", "session-feed")
        val feed = listOf(feedItem(kind = "HIGHLIGHT"))

        adapter.putSessionFeed(CLUB_ID, SESSION_ID, feed)

        val rawJson = redisTemplate.opsForValue().get(key)
        assertThat(rawJson).contains(SESSION_ID.toString(), "HIGHLIGHT")
        assertEquals(feed, adapter.getSessionFeed(CLUB_ID, SESSION_ID))
        assertEquals(hitsBefore + 1.0, counterValue("readmates.notes_cache.hit", "scope", "session-feed"))
        assertThat(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(2).toMillis())
    }

    @Test
    fun `stores and loads note sessions list`() {
        val key = sessionsKey(CLUB_ID)
        redisTemplate.delete(key)
        val hitsBefore = counterValue("readmates.notes_cache.hit", "scope", "sessions")
        val sessions = listOf(noteSession())

        adapter.putSessions(CLUB_ID, sessions)

        val rawJson = redisTemplate.opsForValue().get(key)
        assertThat(rawJson).contains(SESSION_ID.toString(), "questionCount")
        assertEquals(sessions, adapter.getSessions(CLUB_ID))
        assertEquals(hitsBefore + 1.0, counterValue("readmates.notes_cache.hit", "scope", "sessions"))
        assertThat(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS))
            .isGreaterThan(Duration.ofMinutes(2).toMillis())
    }

    @Test
    fun `missing notes feed records cache miss metric`() {
        redisTemplate.delete(feedKey(CLUB_ID))
        val missesBefore = counterValue("readmates.notes_cache.miss", "scope", "feed")

        assertNull(adapter.getFeed(CLUB_ID))

        assertEquals(missesBefore + 1.0, counterValue("readmates.notes_cache.miss", "scope", "feed"))
    }

    @Test
    fun `decode failure deletes corrupt feed and records fallback metrics`() {
        val key = feedKey(CLUB_ID)
        redisTemplate.opsForValue().set(key, "{")
        val missesBefore = counterValue("readmates.notes_cache.miss", "scope", "feed")
        val fallbacksBefore = counterValue("readmates.redis.fallbacks", "feature", "notes-cache-decode")
        val errorsBefore = counterValue(
            "readmates.redis.operation.errors",
            "feature",
            "notes-cache",
            "operation",
            "decode",
        )

        assertNull(adapter.getFeed(CLUB_ID))

        assertFalse(redisTemplate.hasKey(key))
        assertEquals(missesBefore + 1.0, counterValue("readmates.notes_cache.miss", "scope", "feed"))
        assertEquals(fallbacksBefore + 1.0, counterValue("readmates.redis.fallbacks", "feature", "notes-cache-decode"))
        assertEquals(
            errorsBefore + 1.0,
            counterValue(
                "readmates.redis.operation.errors",
                "feature",
                "notes-cache",
                "operation",
                "decode",
            ),
        )
    }

    private fun counterValue(
        name: String,
        vararg tags: String,
    ) = meterRegistry.counter(name, *tags).count()

    companion object {
        private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")

        private fun feedKey(clubId: UUID) = "notes:club:$clubId:feed:v1"
        private fun sessionFeedKey(clubId: UUID, sessionId: UUID) = "notes:club:$clubId:session:$sessionId:feed:v1"
        private fun sessionsKey(clubId: UUID) = "notes:club:$clubId:sessions:v1"

        @JvmStatic
        @DynamicPropertySource
        fun testProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
            RedisTestContainer.registerRedisProperties(registry)
        }
    }
}

private data class NotesReadCacheAdapterCase(
    val redisEnabled: Boolean,
    val notesCacheEnabled: Boolean,
    val expectedAdapter: Class<out NotesReadCachePort>,
)

@TestConfiguration(proxyBeanMethods = false)
@EnableConfigurationProperties(NotesCacheProperties::class)
@Import(
    RedisNotesReadCacheAdapter::class,
    NoopNotesReadCacheAdapter::class,
    RedisCacheMetrics::class,
)
private class NotesReadCacheAdapterBeanTestConfiguration {
    @Bean
    fun redisTemplate(): StringRedisTemplate =
        Mockito.mock(StringRedisTemplate::class.java)

    @Bean
    fun objectMapper(): ObjectMapper =
        JsonMapper.builder().findAndAddModules().build()
}

private fun feedItem(kind: String = "QUESTION") = NoteFeedResult(
    sessionId = "00000000-0000-0000-0000-000000000301",
    sessionNumber = 1,
    bookTitle = "Book",
    date = "2026-04-28",
    authorName = "Member",
    authorShortName = "Member",
    kind = kind,
    text = "Question",
)

private fun noteSession() = NoteSessionResult(
    sessionId = "00000000-0000-0000-0000-000000000301",
    sessionNumber = 1,
    bookTitle = "Book",
    date = "2026-04-28",
    questionCount = 1,
    oneLinerCount = 0,
    longReviewCount = 0,
    highlightCount = 0,
    totalCount = 1,
)
