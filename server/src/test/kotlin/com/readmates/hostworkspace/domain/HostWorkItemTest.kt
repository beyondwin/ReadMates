package com.readmates.hostworkspace.domain

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.OffsetDateTime
import java.util.UUID

class HostWorkItemTest {
    @Test
    fun `authoritative work item keys accept visible ASCII through the exact maximum`() {
        val ordinary = HostWorkItemKey("SCHEDULE_UNSEEN:session-42:r7")
        val maximum = HostWorkItemKey("k".repeat(255))

        assertThat(ordinary.value).isEqualTo("SCHEDULE_UNSEEN:session-42:r7")
        assertThat(maximum.value).hasSize(255)
    }

    @ParameterizedTest
    @ValueSource(strings = ["", " ", "contains space", "line\nbreak", "unicode-일정"])
    fun `authoritative work item keys reject blank non visible or non ASCII input`(raw: String) {
        assertThatThrownBy { HostWorkItemKey(raw) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `authoritative work item keys reject values beyond 255 characters`() {
        assertThatThrownBy { HostWorkItemKey("k".repeat(256)) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `deferral is created only for a time strictly after evaluation`() {
        val evaluatedAt = OffsetDateTime.parse("2026-08-30T09:00:00Z")
        val owner = HostWorkboxOwner(UUID.randomUUID(), UUID.randomUUID())
        val key = HostWorkItemKey("MEMBER_APPROVAL:membership-7:g1")

        val deferral = HostWorkboxDeferral.create(owner, key, evaluatedAt.plusHours(1), evaluatedAt)

        assertThat(deferral.deferredUntil).isEqualTo(evaluatedAt.plusHours(1))
        assertThatThrownBy { HostWorkboxDeferral.create(owner, key, evaluatedAt, evaluatedAt) }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { HostWorkboxDeferral.create(owner, key, evaluatedAt.minusNanos(1), evaluatedAt) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }
}
