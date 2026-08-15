package com.readmates.notification.adapter.out.codec

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.port.out.AdminNotificationJsonCodec
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Service
class JacksonAdminNotificationJsonCodec(
    private val objectMapper: ObjectMapper,
) : AdminNotificationJsonCodec {
    override fun filterJson(filter: AdminNotificationFilter): String = objectMapper.writeValueAsString(filter)

    override fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String =
        objectMapper.writeValueAsString(
            mapOf(
                "previewId" to previewId.toString(),
                "clubId" to clubId?.toString(),
                "selectionHash" to selectionHash,
                "reason" to reason,
                "replayedCount" to replayedCount,
                "skippedCount" to skippedCount,
            ),
        )
}
