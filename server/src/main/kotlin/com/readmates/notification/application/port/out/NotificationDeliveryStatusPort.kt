package com.readmates.notification.application.port.out

import com.readmates.notification.domain.NotificationDeliveryStatus
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationDeliveryStatusPort {
    fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus?

    fun markDeliverySent(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean

    fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean

    fun markDeliveryDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean

    fun restoreDeadEmailDeliveryForClub(
        clubId: UUID,
        id: UUID,
    ): Boolean
}
