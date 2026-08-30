package com.readmates.notification.application.service

import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQuery
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryPort
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceQueryResult
import com.readmates.notification.application.port.out.HostNotificationFailureWorkSourceRow
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostNotificationFailureWorkSourceServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val now = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    fun `failed ordinal is actionable while same delivery allowlisted resolution is completed`() {
        val failed = row("00000000-0000-0000-0000-000000005001", 2, "FAILED", null)
        val sent = row("00000000-0000-0000-0000-000000005002", 4, "SENT", now.minusMinutes(30))
        val pending = row("00000000-0000-0000-0000-000000005003", 0, "PENDING", null)
        val service =
            HostNotificationFailureWorkSourceService(
                FakePort(
                    HostNotificationFailureWorkSourceQueryResult.Available(
                        listOf(failed, sent, pending),
                    ),
                ),
            )

        val result = service.get(clubId, now, now.minusDays(30))

        assertThat(result.items.map { it.deliveryId })
            .containsExactly(failed.deliveryId, sent.deliveryId)
        assertThat(result.items[0].attemptOrdinal).isEqualTo(2)
        assertThat(result.items[0].safeErrorCode).isEqualTo("SMTP_TEMPORARY")
        assertThat(result.items[1].resolvedAt).isEqualTo(now.minusMinutes(30))
        assertThat(result.items[1].deliveryStatus).isEqualTo("SENT")
    }

    @Test
    fun `typed notification source unavailability uses exact code`() {
        val service =
            HostNotificationFailureWorkSourceService(
                FakePort(HostNotificationFailureWorkSourceQueryResult.Unavailable),
            )
        assertThat(service.get(clubId, now, now.minusDays(30)).failureCode)
            .isEqualTo("NOTIFICATION_SOURCE_UNAVAILABLE")
    }

    private fun row(
        id: String,
        ordinal: Int,
        status: String,
        resolvedAt: OffsetDateTime?,
    ) = HostNotificationFailureWorkSourceRow(
        deliveryId = UUID.fromString(id),
        attemptOrdinal = ordinal,
        eventType = "SESSION_SCHEDULE_UPDATED",
        channel = "EMAIL",
        deliveryStatus = status,
        nextRetryAt = now.plusMinutes(15),
        failureAt = now.minusMinutes(10),
        resolvedAt = resolvedAt,
        safeErrorCode = if (status == "FAILED") "SMTP_TEMPORARY" else null,
    )

    private class FakePort(
        private val result: HostNotificationFailureWorkSourceQueryResult,
    ) : HostNotificationFailureWorkSourceQueryPort {
        override fun load(query: HostNotificationFailureWorkSourceQuery) = result
    }
}
