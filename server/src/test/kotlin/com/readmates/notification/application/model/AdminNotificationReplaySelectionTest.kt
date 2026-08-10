package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class AdminNotificationReplaySelectionTest {
    @Test
    fun `canonical replay hash is order independent and binds every target identity and expected state`() {
        val first = target("00000000-0000-0000-0000-000000000011")
        val second = target("00000000-0000-0000-0000-000000000012", status = "DEAD")
        val filter =
            AdminNotificationFilter(
                clubId = CLUB_ID,
                deliveryStatus = NotificationDeliveryStatus.FAILED,
                channel = NotificationChannel.EMAIL,
            )

        val baseline = adminNotificationReplaySelectionHash(filter, listOf(first, second))

        assertThat(adminNotificationReplaySelectionHash(filter, listOf(second, first))).isEqualTo(baseline)
        assertThat(
            adminNotificationReplaySelectionHash(
                filter,
                listOf(first.copy(deliveryId = OTHER_DELIVERY_ID), second),
            ),
        ).isNotEqualTo(baseline)
        assertThat(adminNotificationReplaySelectionHash(filter, listOf(first.copy(status = "DEAD"), second)))
            .isNotEqualTo(baseline)
        assertThat(adminNotificationReplaySelectionHash(filter, listOf(first.copy(attemptCount = 3), second)))
            .isNotEqualTo(baseline)
        assertThat(
            adminNotificationReplaySelectionHash(
                filter,
                listOf(first.copy(updatedAt = first.updatedAt.plusNanos(1_000)), second),
            ),
        ).isNotEqualTo(baseline)
        assertThat(
            adminNotificationReplaySelectionHash(
                filter,
                listOf(first.copy(failureCode = "MAIL_PERMANENT"), second),
            ),
        ).isNotEqualTo(baseline)
        assertThat(
            adminNotificationReplaySelectionHash(
                filter,
                listOf(first.copy(clubId = OTHER_CLUB_ID), second),
            ),
        ).isNotEqualTo(baseline)
    }

    @Test
    fun `canonical replay bytes use fixed fields lowercase UUIDs and UTC microseconds`() {
        val canonical =
            adminNotificationReplayCanonicalBytes(
                AdminNotificationFilter(),
                listOf(target(DELIVERY_ID.toString())),
            ).decodeToString()

        assertThat(canonical).isEqualTo(
            "clubId=-\n" +
                "channel=-\n" +
                "deliveryStatus=-\n" +
                "targets\n" +
                "$DELIVERY_ID|$CLUB_ID|FAILED|2|MAIL_RETRYABLE|2026-05-27T01:02:03.123456Z",
        )
    }

    private fun target(
        deliveryId: String,
        status: String = "FAILED",
    ): AdminNotificationReplayTarget =
        AdminNotificationReplayTarget(
            deliveryId = UUID.fromString(deliveryId),
            clubId = CLUB_ID,
            status = status,
            attemptCount = 2,
            failureCode = "MAIL_RETRYABLE",
            updatedAt = OffsetDateTime.parse("2026-05-27T10:02:03.123456789+09:00"),
        )
}

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val OTHER_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
private val DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000011")
private val OTHER_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000099")
