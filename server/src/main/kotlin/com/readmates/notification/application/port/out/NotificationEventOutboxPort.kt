package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationEventOutboxPort {
    fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean
    fun enqueueSessionReminderDue(targetDate: LocalDate): Int
    fun claimPublishable(limit: Int): List<NotificationEventOutboxItem>
    fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markPublishFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun loadMessage(eventId: UUID): NotificationEventMessage?
    fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationEvent> =
        CursorPage(listHostEvents(clubId, status, pageRequest.limit), null)
    fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        limit: Int,
    ): List<HostNotificationEvent> =
        error("Host notification event listing is unavailable")
}
