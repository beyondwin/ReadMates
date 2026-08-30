package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HostPersonActor
import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonAttendanceStatus
import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonCursorAnchor
import com.readmates.hostworkspace.application.model.HostPersonDetailAccessDeniedException
import com.readmates.hostworkspace.application.model.HostPersonDetailNotFoundException
import com.readmates.hostworkspace.application.model.HostPersonDetailProjection
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery
import com.readmates.hostworkspace.application.model.HostPersonDetailRequest
import com.readmates.hostworkspace.application.model.HostPersonMembershipRole
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.hostworkspace.application.model.HostPersonRsvpStatus
import com.readmates.hostworkspace.application.model.HostPersonSchedule
import com.readmates.hostworkspace.application.port.out.HostPersonDetailQueryPort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDateTime
import java.util.UUID

class HostPersonDetailServiceTest {
    private val queryPort = RecordingHostPersonDetailQueryPort()
    private val service = HostPersonDetailService(queryPort)

    @Test
    fun `active host reads the exact target directly and receives a bounded continuation`() {
        queryPort.result = projection(items = listOf(attendance(3), attendance(2), attendance(1)))

        val result = service.get(request(limit = 2))

        assertThat(result.attendanceHistory.items.map { it.sessionNumber }).containsExactly(3, 2)
        assertThat(result.attendanceHistory.next).isEqualTo(attendance(2).tuple)
        assertThat(queryPort.seenQuery!!.clubId).isEqualTo(CLUB_ID)
        assertThat(queryPort.seenQuery!!.targetMembershipId).isEqualTo(TARGET_ID)
        assertThat(queryPort.seenQuery!!.fetchLimit).isEqualTo(3)
        assertThat(queryPort.seenQuery!!.expectedHistoryFingerprint).isEqualTo(FINGERPRINT)
        assertThat(queryPort.callCount).isEqualTo(1)
    }

    @Test
    fun `viewer inactive host and authority loss fail before or after the direct query`() {
        assertThatThrownBy { service.get(request(actor = HOST.copy(activeHost = false))) }
            .isInstanceOf(HostPersonDetailAccessDeniedException::class.java)
        assertThat(queryPort.callCount).isZero()

        queryPort.result = null
        assertThatThrownBy { service.get(request()) }
            .isInstanceOf(HostPersonDetailNotFoundException::class.java)
        assertThat(queryPort.callCount).isEqualTo(1)
    }

    @Test
    fun `terminal membership does not retain current schedule rsvp or access telemetry`() {
        queryPort.result =
            projection(items = emptyList()).copy(
                displayName = "탈퇴 전 이름",
                status = HostPersonMembershipStatus.LEFT,
                lastClubAccessAt = Instant.parse("2026-08-30T01:23:45Z"),
                currentSchedule = schedule(),
                currentRsvp = HostPersonRsvpStatus.GOING,
            )

        val result = service.get(request())

        assertThat(result.displayName).isEqualTo("탈퇴한 멤버")
        assertThat(result.avatarKey).isEqualTo("cloud-green-book")
        assertThat(result.lastClubAccessAt).isNull()
        assertThat(result.currentSchedule).isNull()
        assertThat(result.currentRsvp).isNull()
    }

    private fun request(
        actor: HostPersonActor = HOST,
        limit: Int = 20,
    ) = HostPersonDetailRequest(
        actor = actor,
        targetMembershipId = TARGET_ID,
        limit = limit,
        cursor =
            HostPersonCursorAnchor(
                evaluatedAt = Instant.parse("2026-08-30T09:00:00Z"),
                expiry = Instant.parse("2026-08-31T09:00:00Z"),
                last = null,
                historyFingerprint = FINGERPRINT,
            ),
    )

    private fun projection(items: List<HostPersonAttendanceItem>) =
        HostPersonDetailProjection(
            membershipId = TARGET_ID,
            displayName = "가람",
            avatarKey = "mushroom-green-book",
            status = HostPersonMembershipStatus.ACTIVE,
            role = HostPersonMembershipRole.MEMBER,
            lastClubAccessAt = Instant.parse("2026-08-30T01:23:45Z"),
            currentSchedule = schedule(),
            currentRsvp = HostPersonRsvpStatus.GOING,
            attendanceItems = items,
            attendanceHistoryFingerprint = FINGERPRINT,
        )

    private fun schedule() =
        HostPersonSchedule(
            state = "OPEN",
            scheduleRevision = 7,
            scheduledAt = LocalDateTime.parse("2026-09-01T19:00:00"),
        )

    private fun attendance(number: Int) =
        HostPersonAttendanceItem(
            sessionNumber = number,
            scheduledAt = LocalDateTime.parse("2026-08-${20 + number}T19:00:00"),
            attendanceStatus = HostPersonAttendanceStatus.ATTENDED,
            tuple =
                HostPersonAttendanceTuple(
                    scheduledAt = LocalDateTime.parse("2026-08-${20 + number}T19:00:00"),
                    sessionNumber = number,
                    sessionId = UUID.nameUUIDFromBytes("session-$number".toByteArray()),
                ),
        )
}

private class RecordingHostPersonDetailQueryPort : HostPersonDetailQueryPort {
    var result: HostPersonDetailProjection? = null
    var seenQuery: HostPersonDetailQuery? = null
    var callCount = 0

    override fun load(query: HostPersonDetailQuery): HostPersonDetailProjection? {
        callCount += 1
        seenQuery = query
        return result
    }
}

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val HOST_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val TARGET_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val HOST = HostPersonActor(CLUB_ID, HOST_ID, activeHost = true)
private const val FINGERPRINT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
