package com.readmates.hostworkspace.adapter.out.source

import com.readmates.auth.application.port.`in`.HostInvitationExpiryWorkSourceItem
import com.readmates.auth.application.port.`in`.HostInvitationExpiryWorkSourceResult
import com.readmates.auth.application.port.`in`.HostMemberApprovalWorkSourceItem
import com.readmates.auth.application.port.`in`.HostMemberApprovalWorkSourceResult
import com.readmates.hostworkspace.application.model.HostWorkItemType
import com.readmates.notification.application.port.`in`.HostNotificationFailureWorkSourceItem
import com.readmates.notification.application.port.`in`.HostNotificationFailureWorkSourceResult
import com.readmates.session.application.port.`in`.HostScheduleSeenWorkSourceItem
import com.readmates.session.application.port.`in`.HostScheduleSeenWorkSourceResult
import com.readmates.sessionclosing.application.port.`in`.HostRecordClosingWorkSourceItem
import com.readmates.sessionclosing.application.port.`in`.HostRecordClosingWorkSourceResult
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostWorkSourceAdaptersTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val at = OffsetDateTime.parse("2026-08-30T09:00:00Z")

    @Test
    @Suppress("LongMethod")
    fun `five translators emit stable keys safe destinations and exact availability`() {
        val schedule =
            SessionScheduleUnseenWorkSourceAdapter { _, _, _ ->
                HostScheduleSeenWorkSourceResult(
                    listOf(HostScheduleSeenWorkSourceItem(id(1), 7, 0, at, at, null, null, 0, 0)),
                )
            }
        val member =
            MemberApprovalWorkSourceAdapter { _, _, _ ->
                HostMemberApprovalWorkSourceResult(
                    listOf(
                        HostMemberApprovalWorkSourceItem(
                            id(2),
                            at.minusDays(1),
                            "ACTIVE",
                            at,
                            "APPROVED",
                            "APPROVED",
                            "ACTIVE",
                        ),
                    ),
                )
            }
        val closing =
            RecordClosingWorkSourceAdapter { _, _, _ ->
                HostRecordClosingWorkSourceResult(
                    listOf(
                        HostRecordClosingWorkSourceItem(
                            id(3),
                            "a".repeat(64),
                            true,
                            at,
                            null,
                            null,
                            null,
                            null,
                        ),
                    ),
                )
            }
        val invitation =
            InvitationExpiryWorkSourceAdapter { _, _, _ ->
                HostInvitationExpiryWorkSourceResult(
                    listOf(
                        HostInvitationExpiryWorkSourceItem(id(4), 9, "ACTIVE", 1, 5, 4, at, null, null),
                    ),
                )
            }
        val notification =
            NotificationFailureWorkSourceAdapter { _, _, _ ->
                HostNotificationFailureWorkSourceResult(
                    listOf(
                        HostNotificationFailureWorkSourceItem(
                            id(5),
                            2,
                            "SESSION_UPDATED",
                            "EMAIL",
                            "FAILED",
                            at,
                            null,
                            "DELIVERY_FAILED",
                        ),
                    ),
                )
            }

        val results =
            listOf(
                schedule.load(clubId, at, at.minusDays(30)),
                member.load(clubId, at, at.minusDays(30)),
                closing.load(clubId, at, at.minusDays(30)),
                invitation.load(clubId, at, at.minusDays(30)),
                notification.load(clubId, at, at.minusDays(30)),
            )

        assertThat(results.map { it.availability.type })
            .containsExactlyElementsOf(HostWorkItemType.entries)
        assertThat(results.map { it.records.single().sourceGeneration })
            .containsExactly("r7", "g1787994000", "a".repeat(64), "r9", "a2")
        assertThat(results.map { it.records.single().destinationHref })
            .containsExactly(
                "/app/host/sessions/00000000-0000-0000-0000-000000000001/schedule-review",
                "/app/host/people/00000000-0000-0000-0000-000000000002",
                "/app/host/sessions/00000000-0000-0000-0000-000000000003/closing",
                "/app/host/settings#invitations",
                "/app/host/notifications",
            )
    }

    @Test
    fun `typed source failures translate without records`() {
        val schedule =
            SessionScheduleUnseenWorkSourceAdapter { _, _, _ ->
                HostScheduleSeenWorkSourceResult(emptyList(), "SCHEDULE_SOURCE_UNAVAILABLE")
            }
        val result = schedule.load(clubId, at, at.minusDays(30))
        assertThat(result.records).isEmpty()
        assertThat(result.availability.failureCode).isEqualTo("SCHEDULE_SOURCE_UNAVAILABLE")
    }

    private fun id(last: Int): UUID = UUID.fromString("00000000-0000-0000-0000-${last.toString().padStart(12, '0')}")
}
