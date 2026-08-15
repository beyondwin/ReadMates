package com.readmates.notification.adapter.out.codec

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.nio.charset.StandardCharsets
import java.util.UUID

class JacksonAdminNotificationJsonCodecTest {
    private val codec =
        JacksonAdminNotificationJsonCodec(
            JsonMapper.builder().findAndAddModules().build(),
        )

    @Test
    fun `filter JSON preserves exact field names order and enum spellings`() {
        val json =
            codec.filterJson(
                AdminNotificationFilter(
                    clubId = CLUB_ID,
                    eventStatus = NotificationEventOutboxStatus.FAILED,
                    deliveryStatus = NotificationDeliveryStatus.DEAD,
                    channel = NotificationChannel.EMAIL,
                ),
            )

        assertThat(json).isEqualTo(
            "{\"clubId\":\"$CLUB_ID\",\"eventStatus\":\"FAILED\"," +
                "\"deliveryStatus\":\"DEAD\",\"channel\":\"EMAIL\"}",
        )
    }

    @Test
    fun `audit metadata preserves exact keys order null and UTF-8 bytes`() {
        val json =
            codec.metadataJson(
                previewId = PREVIEW_ID,
                clubId = null,
                selectionHash = SELECTION_HASH,
                reason = "메일 재시도",
                replayedCount = 2,
                skippedCount = 1,
            )
        val expected =
            "{\"previewId\":\"$PREVIEW_ID\",\"clubId\":null," +
                "\"selectionHash\":\"$SELECTION_HASH\",\"reason\":\"메일 재시도\"," +
                "\"replayedCount\":2,\"skippedCount\":1}"

        assertThat(json).isEqualTo(expected)
        assertThat(json.toByteArray(StandardCharsets.UTF_8))
            .containsExactly(*expected.toByteArray(StandardCharsets.UTF_8))
    }
}

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000031")
private const val SELECTION_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
