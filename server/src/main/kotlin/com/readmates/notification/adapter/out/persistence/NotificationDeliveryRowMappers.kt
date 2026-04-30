package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.NotificationEmailTemplates
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.util.UUID

internal data class DeliveryRecipient(
    val membershipId: UUID,
    val displayName: String?,
    val emailAllowed: Boolean,
)

internal data class DeliveryCopy(
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val emailSubject: String,
    val emailBodyText: String,
    val emailBodyHtml: String,
)

internal data class DeliveryInsertRow(
    val id: UUID,
    val recipient: DeliveryRecipient,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val skipReason: String?,
)

internal data class MemberNotificationDeliveryRow(
    val id: UUID,
    val recipientMembershipId: UUID,
    val displayName: String?,
)

internal class NotificationDeliveryRowMappers(
    private val objectMapper: ObjectMapper,
    private val appBaseUrl: String,
) {
    private val payloadType = objectMapper.typeFactory.constructType(NotificationEventPayload::class.java)

    fun ResultSet.toDeliveryRecipient(): DeliveryRecipient =
        DeliveryRecipient(
            membershipId = uuid("recipient_membership_id"),
            displayName = getString("display_name"),
            emailAllowed = getBoolean("email_allowed"),
        )

    fun ResultSet.toNotificationDeliveryItem(message: NotificationEventMessage): NotificationDeliveryItem {
        val channel = NotificationChannel.valueOf(getString("channel"))
        val copy = if (channel == NotificationChannel.EMAIL) copyFor(message, getString("display_name")) else null
        return NotificationDeliveryItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            clubId = uuid("club_id"),
            recipientMembershipId = uuid("recipient_membership_id"),
            channel = channel,
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTimeOrNull("locked_at"),
            recipientEmail = if (channel == NotificationChannel.EMAIL) getString("recipient_email") else null,
            subject = copy?.emailSubject,
            bodyText = copy?.emailBodyText,
            bodyHtml = copy?.emailBodyHtml,
        )
    }

    fun ResultSet.toNotificationEventMessage(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            occurredAt = utcOffsetDateTime("created_at"),
            clubSlug = getString("club_slug"),
            payload = parsePayload(getString("payload_json")),
        )

    fun ResultSet.toClaimedNotificationDeliveryItem(): ClaimedNotificationDeliveryItem {
        val eventType = NotificationEventType.valueOf(getString("event_type"))
        val copy = copyFor(
            eventType = eventType,
            aggregateId = uuid("aggregate_id"),
            payload = parsePayload(getString("payload_json")),
            clubSlug = getString("club_slug"),
            displayName = getString("display_name"),
        )
        return ClaimedNotificationDeliveryItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            eventType = eventType,
            clubId = uuid("club_id"),
            recipientMembershipId = uuid("recipient_membership_id"),
            channel = NotificationChannel.valueOf(getString("channel")),
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTime("locked_at"),
            recipientEmail = getString("recipient_email"),
            subject = copy.emailSubject,
            bodyText = copy.emailBodyText,
            bodyHtml = copy.emailBodyHtml,
        )
    }

    fun ResultSet.toHostNotificationDelivery(): HostNotificationDelivery =
        HostNotificationDelivery(
            id = uuid("id"),
            eventId = uuid("event_id"),
            channel = NotificationChannel.valueOf(getString("channel")),
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    fun ResultSet.toHostNotificationFailure(): HostNotificationFailure =
        HostNotificationFailure(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    fun ResultSet.toHostNotificationItem(): HostNotificationItem =
        HostNotificationItem(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            status = NotificationDeliveryStatus.valueOf(getString("status")).toOutboxStatus(),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            nextAttemptAt = utcOffsetDateTime("next_attempt_at"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    fun ResultSet.toHostNotificationDetail(): HostNotificationDetail {
        val eventType = NotificationEventType.valueOf(getString("event_type"))
        val payload = parsePayload(getString("payload_json"))
        val copy = copyFor(
            eventType = eventType,
            aggregateId = uuid("aggregate_id"),
            payload = payload,
            clubSlug = getString("club_slug"),
            displayName = getString("display_name"),
        )
        return HostNotificationDetail(
            id = uuid("id"),
            eventType = eventType,
            status = NotificationDeliveryStatus.valueOf(getString("status")).toOutboxStatus(),
            recipientEmail = getString("recipient_email"),
            subject = copy.emailSubject,
            deepLinkPath = copy.deepLinkPath,
            metadata = mapOf(
                "sessionNumber" to payload.sessionNumber,
                "bookTitle" to payload.bookTitle,
            ).filterValues { it != null },
            attemptCount = getInt("attempt_count"),
            lastError = getString("last_error"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )
    }

    fun copyFor(message: NotificationEventMessage, displayName: String?): DeliveryCopy =
        copyFor(
            eventType = message.eventType,
            aggregateId = message.aggregateId,
            payload = message.payload,
            clubSlug = requireNotNull(message.clubSlug) { "Notification event ${message.eventId} missing clubSlug" },
            displayName = displayName,
        )

    private fun copyFor(
        eventType: NotificationEventType,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        clubSlug: String,
        displayName: String?,
    ): DeliveryCopy =
        copyFor(
            eventType = eventType,
            sessionId = payload.sessionId ?: aggregateId,
            sessionNumber = payload.sessionNumber ?: 0,
            bookTitle = payload.bookTitle ?: "선정 도서",
            clubSlug = clubSlug,
            displayName = displayName,
        )

    private fun copyFor(
        eventType: NotificationEventType,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        clubSlug: String,
        displayName: String?,
    ): DeliveryCopy {
        val rendered = NotificationEmailTemplates.eventCopy(
            eventType = eventType,
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            clubSlug = clubSlug,
            displayName = displayName,
            appBaseUrl = appBaseUrl,
        )
        return DeliveryCopy(
            title = rendered.title,
            body = rendered.body,
            deepLinkPath = requireNotNull(rendered.deepLinkPath),
            emailSubject = rendered.emailSubject,
            emailBodyText = rendered.emailBodyText,
            emailBodyHtml = rendered.emailBodyHtml,
        )
    }

    fun sessionId(message: NotificationEventMessage): UUID =
        message.payload.sessionId ?: message.aggregateId

    fun parsePayload(rawPayload: String): NotificationEventPayload =
        objectMapper.readValue(rawPayload, payloadType)

    private fun NotificationDeliveryStatus.toOutboxStatus(): NotificationOutboxStatus =
        when (this) {
            NotificationDeliveryStatus.PENDING -> NotificationOutboxStatus.PENDING
            NotificationDeliveryStatus.SENDING -> NotificationOutboxStatus.SENDING
            NotificationDeliveryStatus.SENT -> NotificationOutboxStatus.SENT
            NotificationDeliveryStatus.FAILED -> NotificationOutboxStatus.FAILED
            NotificationDeliveryStatus.DEAD -> NotificationOutboxStatus.DEAD
            NotificationDeliveryStatus.SKIPPED -> NotificationOutboxStatus.SENT
        }
}
