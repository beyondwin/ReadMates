package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationRelayServiceTest {
    @Test
    fun `publish pending events marks them published`() {
        val item = publishingItem()
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher()
        val service = NotificationRelayService(outbox, publisher, maxAttempts = 5)

        val published = service.publishPending(limit = 10)

        assertThat(published).isEqualTo(1)
        assertThat(publisher.publishedMessages).containsExactly(PublishedMessage(message, item.kafkaTopic, item.kafkaKey))
        assertThat(outbox.publishedIds).containsExactly(item.id)
    }

    @Test
    fun `missing event message marks publish dead`() {
        val item = publishingItem()
        val outbox = FakeEventOutbox(claimedItems = listOf(item))
        val service = NotificationRelayService(outbox, RecordingPublisher(), maxAttempts = 5)

        val published = service.publishPending(limit = 10)

        assertThat(published).isEqualTo(1)
        assertThat(outbox.deadEvents).containsExactly(DeadEvent(item.id, "Notification event message missing"))
    }

    @Test
    fun `publish failure marks event failed with retry delay`() {
        val item = publishingItem(attemptCount = 1)
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher(failure = IllegalStateException("broker unavailable"))
        val service = NotificationRelayService(outbox, publisher, maxAttempts = 5)

        val published = service.publishPending(limit = 10)

        assertThat(published).isEqualTo(1)
        assertThat(outbox.failedEvents).containsExactly(FailedEvent(item.id, "broker unavailable", 15))
    }

    @Test
    fun `publish failure at max attempts marks event dead`() {
        val item = publishingItem(attemptCount = 4)
        val message = messageFor(item)
        val outbox = FakeEventOutbox(claimedItems = listOf(item), messages = mapOf(item.id to message))
        val publisher = RecordingPublisher(failure = IllegalStateException("broker unavailable"))
        val service = NotificationRelayService(outbox, publisher, maxAttempts = 5)

        val published = service.publishPending(limit = 10)

        assertThat(published).isEqualTo(1)
        assertThat(outbox.deadEvents).containsExactly(DeadEvent(item.id, "broker unavailable"))
    }

    @Test
    fun `non-positive limit does not claim events`() {
        val outbox = FakeEventOutbox()
        val service = NotificationRelayService(outbox, RecordingPublisher(), maxAttempts = 5)

        val published = service.publishPending(limit = 0)

        assertThat(published).isZero()
        assertThat(outbox.claimLimits).isEmpty()
    }
}

private class FakeEventOutbox(
    private val claimedItems: List<NotificationEventOutboxItem> = emptyList(),
    private val messages: Map<UUID, NotificationEventMessage> = emptyMap(),
) : NotificationEventOutboxPort {
    val claimLimits = mutableListOf<Int>()
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

    override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean {
        publishedIds += id
        return true
    }

    override fun markPublishFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean {
        failedEvents += FailedEvent(id, error, nextAttemptDelayMinutes)
        return true
    }

    override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean {
        deadEvents += DeadEvent(id, error)
        return true
    }

    override fun loadMessage(eventId: UUID): NotificationEventMessage? = messages[eventId]
}

private class RecordingPublisher(
    private val failure: RuntimeException? = null,
) : NotificationEventPublisherPort {
    val publishedMessages = mutableListOf<PublishedMessage>()

    override fun publish(message: NotificationEventMessage, topic: String, key: String) {
        failure?.let { throw it }
        publishedMessages += PublishedMessage(message, topic, key)
    }
}

private data class PublishedMessage(
    val message: NotificationEventMessage,
    val topic: String,
    val key: String,
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

private fun publishingItem(
    id: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001"),
    clubId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002"),
    aggregateId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000003"),
    attemptCount: Int = 0,
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
    )

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
