package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import java.time.OffsetDateTime
import java.util.UUID

interface NotificationTestMailAuditPort {
    fun reserveTestMailAuditAttempt(
        clubId: UUID,
        hostMembershipId: UUID,
        recipientMaskedEmail: String,
        recipientEmailHash: String,
        cooldownStartedAfter: OffsetDateTime,
    ): NotificationTestMailAuditItem?

    fun markTestMailAuditFailed(id: UUID, lastError: String): NotificationTestMailAuditItem
    fun listTestMailAudit(clubId: UUID, pageRequest: PageRequest): CursorPage<NotificationTestMailAuditItem>
}
