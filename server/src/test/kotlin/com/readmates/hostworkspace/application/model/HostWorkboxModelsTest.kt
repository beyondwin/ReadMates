package com.readmates.hostworkspace.application.model

import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostWorkboxModelsTest {
    private val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
    private val owner = HostWorkboxOwner(UUID.randomUUID(), UUID.randomUUID())

    @Test
    fun `snapshot rejects duplicate ordinals and duplicate authoritative keys`() {
        val first = item(0, "SCHEDULE_UNSEEN:session-1:r7")

        assertThatThrownBy {
            snapshot(listOf(first, item(0, "MEMBER_APPROVAL:membership-7:g1")))
        }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy {
            snapshot(listOf(first, item(1, first.key.value)))
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `snapshot metadata requires a sha256 filter positive schema and future expiry`() {
        assertThatThrownBy { snapshot(listOf(item(0, "SCHEDULE_UNSEEN:session-1:r7")), fingerprint = "short") }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { snapshot(listOf(item(0, "SCHEDULE_UNSEEN:session-1:r7")), schemaVersion = 0) }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { snapshot(listOf(item(0, "SCHEDULE_UNSEEN:session-1:r7")), expiresAt = evaluatedAt) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `snapshot projection rejects external destinations`() {
        assertThatThrownBy {
            projection(HostWorkItemKey("RECORD_CLOSING:session-3:g2"), "https://private.invalid/work")
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    private fun snapshot(
        items: List<HostWorkboxSnapshotItem>,
        fingerprint: String = "a".repeat(64),
        schemaVersion: Int = 1,
        expiresAt: OffsetDateTime = evaluatedAt.plusMinutes(15),
    ) = HostWorkboxSnapshot(
        id = UUID.randomUUID(),
        owner = owner,
        state = HostWorkboxState.NOW,
        filterFingerprint = fingerprint,
        schemaVersion = schemaVersion,
        evaluatedAt = evaluatedAt,
        sourceAvailability =
            listOf(
                HostWorkSourceAvailability(
                    HostWorkItemType.SCHEDULE_UNSEEN,
                    HostWorkSourceAvailabilityState.AVAILABLE,
                ),
            ),
        expiresAt = expiresAt,
        items = items,
    )

    private fun item(
        ordinal: Int,
        rawKey: String,
    ): HostWorkboxSnapshotItem {
        val key = HostWorkItemKey(rawKey)
        return HostWorkboxSnapshotItem(ordinal, key, projection(key, "/app/host/work/$ordinal"))
    }

    private fun projection(
        key: HostWorkItemKey,
        destinationHref: String,
    ) = HostWorkboxItemProjection(
        key = key,
        type = HostWorkItemType.valueOf(key.value.substringBefore(':')),
        state = HostWorkboxState.NOW,
        title = "Review",
        description = "Safe summary",
        count = 1,
        dueAt = evaluatedAt.plusDays(1),
        deferredUntil = null,
        resolvedAt = null,
        destinationHref = destinationHref,
        receiptSummary = null,
    )
}
