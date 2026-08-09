package com.readmates.notification.application.service

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.TimeUnit

class NotificationRelayServiceTest {
    @Test
    fun `relay has only the injected runtime constructor`() {
        assertThat(NotificationRelayService::class.java.declaredConstructors).hasSize(1)
    }

    @Test
    fun `publish pending events marks them published`() {
        val item = publishingItem()
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher()
        val service = relayService(outbox, publisher)

        val published =
            captureRelayLogs().use { logs ->
                service.publishPending(limit = 10).also {
                    val event = logs.events.single()
                    assertThat(event.level).isEqualTo(Level.INFO)
                    assertThat(event.message).isEqualTo("Notification event publish transition committed result={}")
                    assertThat(event.argumentArray.toList()).containsExactly("success")
                    assertThat(event.formattedMessage).doesNotContain(message.payload.toString())
                }
            }

        assertThat(published).isEqualTo(1)
        assertThat(publisher.publishedMessages)
            .containsExactly(PublishedMessage(message, item.kafkaTopic, item.kafkaKey, requestId = null))
        assertThat(outbox.publishedIds).containsExactly(item.id)
    }

    @Test
    fun `publish forwards outbox requestId to publisher`() {
        val item = publishingItem(requestId = "req-relay-789")
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher()
        val service = relayService(outbox, publisher)

        val published = service.publishPending(limit = 10)

        assertThat(published).isEqualTo(1)
        assertThat(publisher.publishedMessages)
            .containsExactly(PublishedMessage(message, item.kafkaTopic, item.kafkaKey, requestId = "req-relay-789"))
    }

    @Test
    fun `missing event message marks publish dead`() {
        val item = publishingItem()
        val outbox = FakeEventOutbox(claimedItems = listOf(item))
        val service = relayService(outbox)

        val published =
            captureRelayLogs().use { logs ->
                service.publishPending(limit = 10).also {
                    val event = logs.events.single()
                    assertThat(event.level).isEqualTo(Level.WARN)
                    assertThat(event.message)
                        .isEqualTo("Notification event publish transition completed result={} attemptCount={}")
                    assertThat(event.argumentArray.toList()).containsExactly("missing_payload", item.attemptCount + 1)
                }
            }

        assertThat(published).isEqualTo(1)
        assertThat(outbox.deadEvents).containsExactly(DeadEvent(item.id, "Notification event message missing"))
    }

    @Test
    fun `publish failure marks event failed with retry delay`() {
        val item = publishingItem(attemptCount = 1)
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher(failure = IllegalStateException("broker unavailable"))
        val service =
            relayService(
                outbox,
                publisher,
                properties =
                    runtimeProperties(
                        retryDelays =
                            listOf(
                                Duration.ofMinutes(7),
                                Duration.ofMinutes(19),
                                Duration.ofMinutes(23),
                                Duration.ofMinutes(29),
                            ),
                    ),
            )

        val published =
            captureRelayLogs().use { logs ->
                service.publishPending(limit = 10).also {
                    val event = logs.events.single()
                    assertThat(event.level).isEqualTo(Level.WARN)
                    assertThat(event.message)
                        .isEqualTo("Notification event publish transition completed result={} attemptCount={}")
                    assertThat(event.argumentArray.toList()).containsExactly("failure", item.attemptCount + 1)
                }
            }

        assertThat(published).isEqualTo(1)
        assertThat(outbox.failedEvents).containsExactly(FailedEvent(item.id, "broker unavailable", 19))
    }

    @Test
    fun `publish failure at max attempts marks event dead`() {
        val item = publishingItem(attemptCount = 2)
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher(failure = IllegalStateException("broker unavailable"))
        val service = relayService(outbox, publisher, properties = runtimeProperties(maxPublishAttempts = 3))

        val published =
            captureRelayLogs().use { logs ->
                service.publishPending(limit = 10).also {
                    val event = logs.events.single()
                    assertThat(event.level).isEqualTo(Level.WARN)
                    assertThat(event.message)
                        .isEqualTo("Notification event publish transition completed result={} attemptCount={}")
                    assertThat(event.argumentArray.toList()).containsExactly("dead", item.attemptCount + 1)
                }
            }

        assertThat(published).isEqualTo(1)
        assertThat(outbox.deadEvents).containsExactly(DeadEvent(item.id, "broker unavailable"))
    }

    @Test
    fun `non-positive limit does not claim events`() {
        val outbox = FakeEventOutbox()
        val service = relayService(outbox)

        val published = service.publishPending(limit = 0)

        assertThat(published).isZero()
        assertThat(outbox.claimLimits).isEmpty()
    }

    @Test
    fun `one nanosecond before event deadline publishes but exact deadline expires before payload load`() {
        val createdAt = OffsetDateTime.parse("2026-04-29T00:00:00Z")
        val eligibleItem = publishingItem(createdAt = createdAt)
        val expiredItem =
            publishingItem(
                id = UUID.fromString("00000000-0000-0000-0000-000000000004"),
                createdAt = createdAt,
            )
        val properties = runtimeProperties(eventMaxAge = Duration.ofHours(24))
        val eligibleOutbox =
            FakeEventOutbox(
                claimedItems = listOf(eligibleItem),
                messages = mapOf(eligibleItem.id to messageFor(eligibleItem)),
            )
        val eligiblePublisher = RecordingPublisher()

        relayService(
            outbox = eligibleOutbox,
            publisher = eligiblePublisher,
            properties = properties,
            clock = Clock.fixed(createdAt.toInstant().plus(Duration.ofHours(24)).minusNanos(1), ZoneOffset.UTC),
        ).publishPending(1)

        assertThat(eligiblePublisher.publishedMessages).hasSize(1)
        assertThat(eligibleOutbox.publishedIds).containsExactly(eligibleItem.id)

        val expiredOutbox =
            FakeEventOutbox(
                claimedItems = listOf(expiredItem),
                messages = mapOf(expiredItem.id to messageFor(expiredItem)),
            )
        val expiredPublisher = RecordingPublisher()
        relayService(
            outbox = expiredOutbox,
            publisher = expiredPublisher,
            properties = properties,
            clock = Clock.fixed(createdAt.toInstant().plus(Duration.ofHours(24)), ZoneOffset.UTC),
        ).publishPending(1)

        assertThat(expiredOutbox.loadedMessageIds).isEmpty()
        assertThat(expiredPublisher.publishedMessages).isEmpty()
        assertThat(expiredOutbox.deadEvents).containsExactly(DeadEvent(expiredItem.id, "Notification event expired"))
    }

    @Test
    fun `claimed items record one fixed result for every committed transition`() {
        assertSingleResult(
            expected = NotificationEventPublishResult.SUCCESS,
            outbox = successfulOutbox(),
        )
        assertSingleResult(
            expected = NotificationEventPublishResult.MISSING_PAYLOAD,
            outbox = FakeEventOutbox(claimedItems = listOf(publishingItem())),
        )
        assertSingleResult(
            expected = NotificationEventPublishResult.FAILURE,
            outbox = successfulOutbox(item = publishingItem(attemptCount = 1)),
            publisher =
                RecordingPublisher(
                    IllegalStateException("private failure 00000000-0000-0000-0000-000000000099"),
                ),
        )
        assertSingleResult(
            expected = NotificationEventPublishResult.DEAD,
            outbox = successfulOutbox(item = publishingItem(attemptCount = 4)),
            publisher =
                RecordingPublisher(
                    IllegalStateException("private failure 00000000-0000-0000-0000-000000000099"),
                ),
        )
        assertSingleResult(
            expected = NotificationEventPublishResult.EXPIRED,
            outbox = successfulOutbox(item = publishingItem(createdAt = TEST_NOW.minusDays(1))),
        )
    }

    @Test
    fun `false publish failed and dead CAS results record stale lease instead of intended result`() {
        val successItem = publishingItem()
        val failureItem = publishingItem(id = UUID.fromString("00000000-0000-0000-0000-000000000011"))
        val missingItem = publishingItem(id = UUID.fromString("00000000-0000-0000-0000-000000000012"))
        val exhaustedItem =
            publishingItem(
                id = UUID.fromString("00000000-0000-0000-0000-000000000013"),
                attemptCount = 4,
            )
        val expiredItem =
            publishingItem(
                id = UUID.fromString("00000000-0000-0000-0000-000000000014"),
                createdAt = TEST_NOW.minusDays(1),
            )
        val cases =
            listOf(
                RelayCase(
                    FakeEventOutbox(
                        claimedItems = listOf(successItem),
                        messages = mapOf(successItem.id to messageFor(successItem)),
                        markPublishedResult = false,
                    ),
                    RecordingPublisher(),
                ),
                RelayCase(
                    FakeEventOutbox(
                        claimedItems = listOf(failureItem),
                        messages = mapOf(failureItem.id to messageFor(failureItem)),
                        markFailedResult = false,
                    ),
                    RecordingPublisher(IllegalStateException("retryable")),
                ),
                RelayCase(
                    FakeEventOutbox(claimedItems = listOf(missingItem), markDeadResult = false),
                    RecordingPublisher(),
                ),
                RelayCase(
                    FakeEventOutbox(
                        claimedItems = listOf(exhaustedItem),
                        messages = mapOf(exhaustedItem.id to messageFor(exhaustedItem)),
                        markDeadResult = false,
                    ),
                    RecordingPublisher(IllegalStateException("exhausted")),
                ),
                RelayCase(
                    FakeEventOutbox(
                        claimedItems = listOf(expiredItem),
                        messages = mapOf(expiredItem.id to messageFor(expiredItem)),
                        markDeadResult = false,
                    ),
                    RecordingPublisher(),
                ),
            )

        cases.forEach { case ->
            val registry = SimpleMeterRegistry()
            relayService(case.outbox, case.publisher, registry).publishPending(1)

            assertThat(registry.publishResults()).containsExactly("stale_lease")
        }
    }

    @Test
    fun `each item transition reads one clock instant and clamps negative latency to zero`() {
        val item = publishingItem(createdAt = TEST_NOW.plusSeconds(1))
        val outbox = successfulOutbox(item)
        val registry = SimpleMeterRegistry()
        val clock = CountingClock(TEST_NOW.toInstant())

        relayService(outbox, registry = registry, clock = clock).publishPending(1)

        assertThat(clock.instantCalls).isEqualTo(1)
        val timer =
            registry
                .find("readmates.notifications.delivery.latency")
                .tag("event_type", NotificationEventType.NEXT_BOOK_PUBLISHED.name)
                .timer()
        assertThat(timer).isNotNull
        assertThat(timer!!.count()).isEqualTo(1)
        assertThat(timer.totalTime(TimeUnit.NANOSECONDS)).isZero()
    }

    private fun assertSingleResult(
        expected: NotificationEventPublishResult,
        outbox: FakeEventOutbox,
        publisher: RecordingPublisher = RecordingPublisher(),
    ) {
        val registry = SimpleMeterRegistry()

        relayService(outbox, publisher, registry).publishPending(1)

        assertThat(registry.publishResults()).containsExactly(expected.tag)
    }
}

private class FakeEventOutbox(
    private val claimedItems: List<NotificationEventOutboxItem> = emptyList(),
    private val messages: Map<UUID, NotificationEventMessage> = emptyMap(),
    private val markPublishedResult: Boolean = true,
    private val markFailedResult: Boolean = true,
    private val markDeadResult: Boolean = true,
) : NotificationEventOutboxPort {
    val claimLimits = mutableListOf<Int>()
    val loadedMessageIds = mutableListOf<UUID>()
    val publishedIds = mutableListOf<UUID>()
    val failedEvents = mutableListOf<FailedEvent>()
    val deadEvents = mutableListOf<DeadEvent>()

    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean = error("unused")

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int = error("unused")

    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> {
        claimLimits += limit
        return claimedItems
    }

    override fun markPublished(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean {
        publishedIds += id
        return markPublishedResult
    }

    override fun markPublishFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean {
        failedEvents += FailedEvent(id, error, nextAttemptDelayMinutes)
        return markFailedResult
    }

    override fun markPublishDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean {
        deadEvents += DeadEvent(id, error)
        return markDeadResult
    }

    override fun loadMessage(eventId: UUID): NotificationEventMessage? {
        loadedMessageIds += eventId
        return messages[eventId]
    }

    override fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationEvent> = error("unused")
}

private class RecordingPublisher(
    private val failure: RuntimeException? = null,
) : NotificationEventPublisherPort {
    val publishedMessages = mutableListOf<PublishedMessage>()

    override fun publish(
        message: NotificationEventMessage,
        topic: String,
        key: String,
        requestId: String?,
    ) {
        failure?.let { throw it }
        publishedMessages += PublishedMessage(message, topic, key, requestId)
    }
}

private data class PublishedMessage(
    val message: NotificationEventMessage,
    val topic: String,
    val key: String,
    val requestId: String? = null,
)

private data class FailedEvent(
    val id: UUID,
    val error: String,
    val nextAttemptDelayMinutes: Long,
)

private data class DeadEvent(
    val id: UUID,
    val error: String,
)

private data class RelayCase(
    val outbox: FakeEventOutbox,
    val publisher: RecordingPublisher,
)

private fun publishingItem(
    id: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001"),
    clubId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002"),
    aggregateId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000003"),
    attemptCount: Int = 0,
    requestId: String? = null,
    createdAt: OffsetDateTime = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
): NotificationEventOutboxItem =
    NotificationEventOutboxItem(
        id = id,
        clubId = clubId,
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "SESSION",
        aggregateId = aggregateId,
        payload = NotificationEventPayload(sessionId = aggregateId),
        status = NotificationEventOutboxStatus.PUBLISHING,
        kafkaTopic = "readmates.notification.events.v1",
        kafkaKey = clubId.toString(),
        attemptCount = attemptCount,
        lockedAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
        createdAt = createdAt,
        requestId = requestId,
    )

private val TEST_NOW: OffsetDateTime = OffsetDateTime.parse("2026-04-29T00:01:00Z")

private fun successfulOutbox(item: NotificationEventOutboxItem = publishingItem()): FakeEventOutbox =
    FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to messageFor(item)))

private fun runtimeProperties(
    eventMaxAge: Duration = Duration.ofHours(24),
    retryDelays: List<Duration> =
        listOf(
            Duration.ofMinutes(5),
            Duration.ofMinutes(15),
            Duration.ofMinutes(60),
            Duration.ofMinutes(240),
        ),
    maxPublishAttempts: Int = 5,
): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        worker = NotificationRuntimeProperties.Worker(eventMaxAge = eventMaxAge, retryDelays = retryDelays),
        kafka = NotificationRuntimeProperties.Kafka(maxPublishAttempts = maxPublishAttempts),
    )

private fun relayService(
    outbox: FakeEventOutbox,
    publisher: RecordingPublisher = RecordingPublisher(),
    registry: SimpleMeterRegistry = SimpleMeterRegistry(),
    properties: NotificationRuntimeProperties = runtimeProperties(),
    clock: Clock = Clock.fixed(TEST_NOW.toInstant(), ZoneOffset.UTC),
): NotificationRelayService =
    NotificationRelayService(
        notificationEventOutboxPort = outbox,
        notificationEventPublisherPort = publisher,
        operationalMetrics = ReadmatesOperationalMetrics(registry),
        runtimeProperties = properties,
        clock = clock,
    )

private fun SimpleMeterRegistry.publishResults(): List<String> =
    find("readmates.outbox.publish")
        .counters()
        .filter { it.count() == 1.0 }
        .map { requireNotNull(it.id.getTag("result")) }

private class CountingClock(
    private val fixedInstant: Instant,
    private val zoneId: ZoneId = ZoneOffset.UTC,
) : Clock() {
    var instantCalls: Int = 0
        private set

    override fun getZone(): ZoneId = zoneId

    override fun withZone(zone: ZoneId): Clock = CountingClock(fixedInstant, zone)

    override fun instant(): Instant {
        instantCalls += 1
        return fixedInstant
    }
}

private fun messageFor(item: NotificationEventOutboxItem): NotificationEventMessage =
    NotificationEventMessage(
        eventId = item.id,
        clubId = item.clubId,
        eventType = item.eventType,
        aggregateType = item.aggregateType,
        aggregateId = item.aggregateId,
        occurredAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 0, ZoneOffset.UTC),
        payload = item.payload,
    )

private class RelayLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private fun captureRelayLogs(): RelayLogCapture {
    val logger = LoggerFactory.getLogger(NotificationRelayService::class.java) as Logger
    val appender = ListAppender<ILoggingEvent>().apply { start() }
    logger.addAppender(appender)
    return RelayLogCapture(logger, appender)
}
