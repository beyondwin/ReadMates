package com.readmates.session.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.model.HostOperatingRoomCandidate
import com.readmates.session.application.model.HostOperatingRoomCandidateState
import com.readmates.session.application.port.out.HostOperatingRoomCandidateQueryPort
import com.readmates.session.application.port.out.HostSessionQueryPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.util.UUID

class HostSessionQueryServiceTest {
    private val host =
        CurrentMember(
            userId = uuid("101"),
            membershipId = uuid("201"),
            clubId = uuid("001"),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    @Test
    fun `active host delegates an Asia Seoul evaluation instant and preserves ordered raw candidates`() {
        val candidatePort = RecordingCandidatePort()
        val clock = Clock.fixed(Instant.parse("2026-08-30T03:04:05Z"), ZoneOffset.UTC)
        val service =
            HostSessionQueryService(
                queryPort = mock(HostSessionQueryPort::class.java),
                operatingRoomCandidateQueryPort = candidatePort,
                clock = clock,
            )

        val result = service.listHostOperatingRoomCandidates(host)

        assertEquals(LocalDateTime.parse("2026-08-30T12:04:05"), candidatePort.evaluatedAt)
        assertEquals(listOf(uuid("301"), uuid("302")), result.map { it.sessionId })
    }

    @Test
    fun `inactive or non-host authority is rejected before candidate persistence`() {
        val candidatePort = RecordingCandidatePort()
        val service =
            HostSessionQueryService(
                queryPort = mock(HostSessionQueryPort::class.java),
                operatingRoomCandidateQueryPort = candidatePort,
            )

        listOf(
            host.copy(role = MembershipRole.MEMBER),
            host.copy(membershipStatus = MembershipStatus.SUSPENDED),
        ).forEach { unauthorized ->
            assertThrows(AccessDeniedException::class.java) {
                service.listHostOperatingRoomCandidates(unauthorized)
            }
        }

        assertEquals(0, candidatePort.calls)
    }
}

private class RecordingCandidatePort : HostOperatingRoomCandidateQueryPort {
    var evaluatedAt: LocalDateTime? = null
    var calls: Int = 0

    override fun loadHostOperatingRoomCandidates(
        clubId: UUID,
        evaluatedAt: LocalDateTime,
    ): List<HostOperatingRoomCandidate> {
        calls += 1
        this.evaluatedAt = evaluatedAt
        return listOf(
            candidate("301", HostOperatingRoomCandidateState.OPEN),
            candidate("302", HostOperatingRoomCandidateState.CLOSED),
        )
    }
}

private fun candidate(
    id: String,
    state: HostOperatingRoomCandidateState,
) = HostOperatingRoomCandidate(
    sessionId = uuid(id),
    state = state,
    meetingDate = LocalDate.parse("2026-08-30"),
    startTime = LocalTime.parse("20:00"),
    sessionNumber = id.toInt(),
    scheduleSeenAvailable = state == HostOperatingRoomCandidateState.OPEN,
)

private fun uuid(suffix: String): UUID = UUID.fromString("00000000-0000-0000-0000-${suffix.padStart(12, '0')}")
