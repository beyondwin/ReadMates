package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.AdminNotificationFilter
import java.util.UUID

interface AdminNotificationJsonCodec {
    fun filterJson(filter: AdminNotificationFilter): String

    fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String
}
