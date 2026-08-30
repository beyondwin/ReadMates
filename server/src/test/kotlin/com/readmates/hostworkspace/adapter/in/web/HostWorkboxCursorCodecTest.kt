@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.hostworkspace.application.model.HostWorkboxItemProjection
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxState
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import com.readmates.shared.paging.HostListCursorSigningProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class HostWorkboxCursorCodecTest {
    private val now = Instant.parse("2026-08-30T09:00:00Z")
    private val owner =
        HostWorkboxOwner(
            UUID.fromString("00000000-0000-0000-0000-000000000001"),
            UUID.fromString("00000000-0000-0000-0000-000000000201"),
        )
    private val properties =
        HostListCursorSigningProperties(
            "current-signing-key",
            4,
            "previous-signing-key",
            3,
            Duration.ofMinutes(15),
        )

    @Test
    fun `cursor binds purpose owner state filter snapshot schema evaluation ordinal sort expiry and key version`() {
        val codec = HostWorkboxCursorCodec(properties, Clock.fixed(now, ZoneOffset.UTC))
        val encoded = codec.encode(owner, page(), keyVersion = 4)

        val decoded = codec.decode(encoded, owner, HostWorkboxState.NOW, "a".repeat(64))

        assertThat(decoded.snapshotId).isEqualTo(page().snapshotId)
        assertThat(decoded.schemaVersion).isEqualTo(1)
        assertThat(decoded.evaluatedAt).isEqualTo(OffsetDateTime.parse("2026-08-30T09:00:00Z"))
        assertThat(decoded.afterOrdinal).isEqualTo(4)
    }

    @Test
    fun `tamper and every bound identity state filter expiry and retired key fail with restart`() {
        val codec = HostWorkboxCursorCodec(properties, Clock.fixed(now, ZoneOffset.UTC))
        val encoded = codec.encode(owner, page(), keyVersion = 4)
        val otherOwner = HostWorkboxOwner(UUID.randomUUID(), owner.hostMembershipId)

        listOf<() -> Unit>(
            {
                codec.decode(
                    encoded.dropLast(1) + "A",
                    owner,
                    HostWorkboxState.NOW,
                    "a".repeat(64),
                )
            },
            { codec.decode(encoded, otherOwner, HostWorkboxState.NOW, "a".repeat(64)) },
            { codec.decode(encoded, owner, HostWorkboxState.DEFERRED, "a".repeat(64)) },
            { codec.decode(encoded, owner, HostWorkboxState.NOW, "b".repeat(64)) },
            {
                HostWorkboxCursorCodec(
                    properties,
                    Clock.fixed(now.plusSeconds(901), ZoneOffset.UTC),
                ).decode(encoded, owner, HostWorkboxState.NOW, "a".repeat(64))
            },
            {
                HostWorkboxCursorCodec(
                    properties.copy(currentKeyVersion = 5, previousKeyVersion = 2),
                    Clock.fixed(now, ZoneOffset.UTC),
                ).decode(encoded, owner, HostWorkboxState.NOW, "a".repeat(64))
            },
            {
                codec.decode(
                    encoded.replace('.', '+'),
                    owner,
                    HostWorkboxState.NOW,
                    "a".repeat(64),
                )
            },
        ).forEach { attempt ->
            assertThatThrownBy(attempt)
                .isInstanceOf(HostWorkboxCursorRestartException::class.java)
        }
    }

    @Test
    fun `previous key remains valid only while configured`() {
        val codec = HostWorkboxCursorCodec(properties, Clock.fixed(now, ZoneOffset.UTC))
        val previous = codec.encode(owner, page(), keyVersion = 3)
        assertThat(codec.decode(previous, owner, HostWorkboxState.NOW, "a".repeat(64)).snapshotId)
            .isEqualTo(page().snapshotId)
    }

    @Test
    fun `present blank cursor bytes fail with restart`() {
        val codec = HostWorkboxCursorCodec(properties, Clock.fixed(now, ZoneOffset.UTC))

        listOf("", "   ", "\t").forEach { invalid ->
            assertThatThrownBy {
                codec.decode(invalid, owner, HostWorkboxState.NOW, "a".repeat(64))
            }.isInstanceOf(HostWorkboxCursorRestartException::class.java)
        }
    }

    private fun page(): HostWorkboxPage =
        HostWorkboxPage(
            UUID.fromString("90000000-0000-4000-8000-000000000001"),
            HostWorkboxState.NOW,
            "a".repeat(64),
            1,
            OffsetDateTime.parse("2026-08-30T09:00:00Z"),
            OffsetDateTime.parse("2026-08-30T09:15:00Z"),
            emptyList(),
            listOf(
                HostWorkboxItemProjection(
                    HostWorkItemKey("MEMBER_APPROVAL:member-1:g1"),
                    HostWorkItemType.MEMBER_APPROVAL,
                    HostWorkboxState.NOW,
                    "title",
                    "description",
                    0,
                    null,
                    null,
                    null,
                    "/app/host/people/member-1",
                    null,
                ),
            ),
            4,
            true,
        )
}
