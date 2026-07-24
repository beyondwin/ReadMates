package com.readmates.shared.adapter.out.redis

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.note.adapter.out.redis.RedisNotesReadCacheAdapter
import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult
import com.readmates.note.application.port.out.LoadNotesFeedPort
import com.readmates.note.application.service.NotesFeedService
import com.readmates.publication.adapter.out.redis.RedisPublicReadCacheAdapter
import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicClubStatsResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.LoadPublishedPublicDataPort
import com.readmates.publication.application.service.PublicQueryService
import com.readmates.session.application.HostPublicationResponse
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.out.HostSessionPublicationPort
import com.readmates.session.application.service.HostSessionPublicationService
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import com.readmates.shared.cache.RedisCacheMetrics
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
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
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Duration
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.public-cache.enabled=true",
        "readmates.notes-cache.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
class RedisReadCacheInvalidationAdapterTest(
    @param:Autowired private val adapter: RedisReadCacheInvalidationAdapter,
    @param:Autowired private val publicCache: RedisPublicReadCacheAdapter,
    @param:Autowired private val notesCache: RedisNotesReadCacheAdapter,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val meterRegistry: MeterRegistry,
) : ReadmatesRedisIntegrationTestSupport() {
    @AfterEach
    fun cleanUp() {
        redisTemplate.delete(cleanupKeys)
    }

    @Test
    fun `evicts public keys and target club notes keys while preserving unrelated club notes keys`() {
        redisTemplate.delete(allKeys)
        allKeys.forEach { key -> redisTemplate.opsForValue().set(key, "cached") }
        val publicEvictionsBefore = counterValue("readmates.public_cache.evicted", "scope", "club")
        val notesEvictionsBefore = counterValue("readmates.notes_cache.evicted", "scope", "club")

        assertThat(adapter.evictClubContentStrict(TARGET_CLUB_ID)).isTrue()

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
    fun `host publication keeps stale entries until commit then target refetches while unrelated clubs stay cached`() {
        seedRealReadCaches()
        val publicationService = publicationService(adapter)

        TransactionSynchronizationManager.initSynchronization()
        try {
            publicationService.upsertPublication(publicationCommand("Refetched source summary"))

            assertEquals(
                "Target cached summary",
                publicCache.getSession(TARGET_CLUB_ID, SESSION_ID)?.summary,
            )
            assertEquals(
                "Target cached note",
                notesCache.getFeed(TARGET_CLUB_ID)?.single()?.text,
            )

            triggerCommitCompletion()
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }

        assertTargetKeysMissAndUnrelatedKeysHit()
        val publicResult = refetchPublicSession("Refetched source summary")
        val notesResult = refetchNotesFeed("Refetched source note")

        assertEquals("Refetched source summary", publicResult?.summary)
        assertEquals("Refetched source note", notesResult.items.single().text)
        assertEquals(
            "Refetched source summary",
            publicCache.getSession(TARGET_CLUB_ID, SESSION_ID)?.summary,
        )
        assertEquals(
            "Unrelated cached summary",
            publicCache.getSession(UNRELATED_CLUB_ID, OTHER_SESSION_ID)?.summary,
        )
        assertEquals(
            "Unrelated cached note",
            notesCache.getFeed(UNRELATED_CLUB_ID)?.single()?.text,
        )
    }

    @Test
    fun `post commit redis failure leaves stale cache observable and records content free failure metrics`() {
        redisTemplate.delete(cleanupKeys)
        publicCache.putSession(
            TARGET_CLUB_ID,
            SESSION_ID,
            publicSession(SESSION_ID, "Stale cached summary"),
        )
        val registry = SimpleMeterRegistry()
        val publicationService = publicationService(failingInvalidationAdapter(registry))
        val mutationResult: HostPublicationResponse

        TransactionSynchronizationManager.initSynchronization()
        try {
            mutationResult = publicationService.upsertPublication(publicationCommand("Refetched source summary"))

            assertEquals(
                0.0,
                counterValue(registry, "readmates.redis.fallbacks", "feature", "read-cache-invalidation"),
            )

            triggerCommitCompletion()
        } finally {
            TransactionSynchronizationManager.clearSynchronization()
        }

        val observedAfterFailure = refetchPublicSession("Refetched source summary")

        assertEquals("Refetched source summary", mutationResult.publicSummary)
        assertEquals("Stale cached summary", observedAfterFailure?.summary)
        assertInvalidationFailureMetrics(registry)
        assertMeterLabelsAreContentFree(registry)
    }

    private fun assertInvalidationFailureMetrics(registry: MeterRegistry) {
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

    private fun assertMeterLabelsAreContentFree(registry: MeterRegistry) {
        assertThat(
            registry.meters.flatMap { meter ->
                listOf(meter.id.name) + meter.id.tags.flatMap { tag -> listOf(tag.key, tag.value) }
            },
        ).noneMatch { label ->
            label.contains("Stale cached summary") || label.contains("Refetched source summary")
        }
    }

    @Test
    fun `redis failure records fallback and operation error metrics`() {
        val registry = SimpleMeterRegistry()
        val adapter =
            RedisReadCacheInvalidationAdapter(
                redisTemplate = failingRedisTemplate(),
                metrics = metrics(registry),
                circuitBreakers = circuitBreakers(registry),
            )

        assertThat(adapter.evictClubContentStrict(TARGET_CLUB_ID)).isFalse()

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

    private fun seedRealReadCaches() {
        redisTemplate.delete(cleanupKeys)

        publicCache.putClub(TARGET_CLUB_ID, publicClub("Target cached club"))
        publicCache.putSession(
            TARGET_CLUB_ID,
            SESSION_ID,
            publicSession(SESSION_ID, "Target cached summary"),
        )
        publicCache.putSession(
            TARGET_CLUB_ID,
            OTHER_SESSION_ID,
            publicSession(OTHER_SESSION_ID, "Target second cached summary"),
        )
        notesCache.putFeed(TARGET_CLUB_ID, listOf(noteFeedItem("Target cached note")))
        notesCache.putSessions(TARGET_CLUB_ID, listOf(noteSession("Target cached book")))
        notesCache.putSessionFeed(
            TARGET_CLUB_ID,
            SESSION_ID,
            listOf(noteFeedItem("Target cached session note")),
        )

        publicCache.putClub(UNRELATED_CLUB_ID, publicClub("Unrelated cached club"))
        publicCache.putSession(
            UNRELATED_CLUB_ID,
            SESSION_ID,
            publicSession(SESSION_ID, "Unrelated first cached summary"),
        )
        publicCache.putSession(
            UNRELATED_CLUB_ID,
            OTHER_SESSION_ID,
            publicSession(OTHER_SESSION_ID, "Unrelated cached summary"),
        )
        notesCache.putFeed(UNRELATED_CLUB_ID, listOf(noteFeedItem("Unrelated cached note")))
        notesCache.putSessions(UNRELATED_CLUB_ID, listOf(noteSession("Unrelated cached book")))
        notesCache.putSessionFeed(
            UNRELATED_CLUB_ID,
            OTHER_SESSION_ID,
            listOf(noteFeedItem("Unrelated cached session note")),
        )
    }

    private fun publicationService(cacheInvalidation: RedisReadCacheInvalidationAdapter) =
        HostSessionPublicationService(
            publicationPort = SuccessfulPublicationPort(),
            cacheInvalidation = cacheInvalidation,
        )

    private fun failingInvalidationAdapter(registry: MeterRegistry) =
        RedisReadCacheInvalidationAdapter(
            redisTemplate = failingRedisTemplate(),
            metrics = metrics(registry),
            circuitBreakers = circuitBreakers(registry),
        )

    private fun assertTargetKeysMissAndUnrelatedKeysHit() {
        targetKeys.forEach { key ->
            assertThat(redisTemplate.hasKey(key))
                .describedAs("$key should miss after commit")
                .isFalse()
        }
        unrelatedClubKeys.forEach { key ->
            assertThat(redisTemplate.hasKey(key))
                .describedAs("$key should remain a hit after target commit")
                .isTrue()
        }
    }

    private fun refetchPublicSession(summary: String) =
        PublicQueryService(
            loadPublishedPublicDataPort =
                SourcePublicLoader(
                    session = publicSession(SESSION_ID, summary),
                ),
            cache = publicCache,
            resolveClubContextUseCase = StaticClubContextResolver(TARGET_CLUB_ID),
        ).getSession(TARGET_CLUB_SLUG, SESSION_ID)

    private fun refetchNotesFeed(text: String) =
        NotesFeedService(
            loadNotesFeedPort =
                SourceNotesLoader(
                    feed = listOf(noteFeedItem(text)),
                ),
            cache = notesCache,
        ).getNotesFeed(targetHost, null, NOTES_FIRST_PAGE)

    private fun publicationCommand(publicSummary: String) =
        UpsertPublicationCommand(
            host = targetHost,
            sessionId = SESSION_ID,
            publicSummary = publicSummary,
            visibility = SessionRecordVisibility.PUBLIC,
        )

    private fun triggerCommitCompletion() {
        TransactionSynchronizationManager.getSynchronizations().forEach { synchronization ->
            synchronization.afterCommit()
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

    private fun circuitBreakers(meterRegistry: MeterRegistry) =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider =
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
        private const val TARGET_CLUB_SLUG = "target-reading-club"
        private val NOTES_FIRST_PAGE = PageRequest.cursor(null, null, defaultLimit = 60, maxLimit = 120)

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
                unrelatedPublicSessionKey(OTHER_SESSION_ID),
                notesFeedKey(UNRELATED_CLUB_ID),
                notesSessionsKey(UNRELATED_CLUB_ID),
                notesSessionFeedKey(UNRELATED_CLUB_ID, OTHER_SESSION_ID),
            )
        private val allKeys = targetKeys + unrelatedClubKeys
        private val cleanupKeys = allKeys + "public:club-slug:$TARGET_CLUB_SLUG:id:v1"

        private val targetHost =
            CurrentMember(
                userId = UUID.fromString("00000000-0000-0000-0000-000000000805"),
                membershipId = UUID.fromString("00000000-0000-0000-0000-000000000806"),
                clubId = TARGET_CLUB_ID,
                clubSlug = TARGET_CLUB_SLUG,
                email = "host@example.com",
                displayName = "Test Host",
                accountName = "Test Host",
                role = MembershipRole.HOST,
                membershipStatus = MembershipStatus.ACTIVE,
            )
    }
}

private class SuccessfulPublicationPort : HostSessionPublicationPort {
    override fun upsertPublication(command: UpsertPublicationCommand) =
        HostPublicationResponse(
            sessionId = command.sessionId.toString(),
            publicSummary = command.publicSummary,
            visibility = command.visibility,
        )
}

private class StaticClubContextResolver(
    private val clubId: UUID,
) : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String) =
        ResolvedClubContext(
            clubId = clubId,
            slug = slug,
            name = "Target reading club",
            status = "ACTIVE",
            hostname = null,
        )

    override fun resolveByHost(host: String?): ResolvedClubContext? = null
}

private class SourcePublicLoader(
    private val session: PublicSessionDetailResult,
) : LoadPublishedPublicDataPort {
    override fun loadClub(): PublicClubResult? = null

    override fun loadClub(clubSlug: String): PublicClubResult? = null

    override fun loadSession(sessionId: UUID): PublicSessionDetailResult = session

    override fun loadSession(
        clubSlug: String,
        sessionId: UUID,
    ): PublicSessionDetailResult = session
}

private class SourceNotesLoader(
    private val feed: List<NoteFeedResult>,
) : LoadNotesFeedPort {
    override fun loadNoteSessions(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<NoteSessionResult> = CursorPage(emptyList(), null)

    override fun loadNotesFeed(
        clubId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<NoteFeedResult> = CursorPage(feed, null)

    override fun loadNotesFeedForSession(
        clubId: UUID,
        sessionId: UUID,
        pageRequest: PageRequest,
    ): CursorPage<NoteFeedResult> = CursorPage(feed, null)
}

private fun publicClub(clubName: String) =
    PublicClubResult(
        clubName = clubName,
        tagline = "Read together",
        about = "Public club description",
        stats = PublicClubStatsResult(sessions = 1, books = 1, members = 3),
        recentSessions = emptyList(),
    )

private fun publicSession(
    sessionId: UUID,
    summary: String,
) = PublicSessionDetailResult(
    sessionId = sessionId.toString(),
    sessionNumber = 1,
    bookTitle = "Public book",
    bookAuthor = "Public author",
    bookImageUrl = null,
    date = "2026-07-25",
    summary = summary,
    highlights = emptyList(),
    oneLiners = emptyList(),
)

private fun noteFeedItem(text: String) =
    NoteFeedResult(
        sessionId = "00000000-0000-0000-0000-000000000803",
        sessionNumber = 1,
        bookTitle = "Published book",
        date = "2026-07-25",
        authorName = "Published member",
        authorShortName = "Member",
        kind = "QUESTION",
        text = text,
    )

private fun noteSession(bookTitle: String) =
    NoteSessionResult(
        sessionId = "00000000-0000-0000-0000-000000000803",
        sessionNumber = 1,
        bookTitle = bookTitle,
        date = "2026-07-25",
        questionCount = 1,
        oneLinerCount = 0,
        longReviewCount = 0,
        highlightCount = 0,
        totalCount = 1,
    )
