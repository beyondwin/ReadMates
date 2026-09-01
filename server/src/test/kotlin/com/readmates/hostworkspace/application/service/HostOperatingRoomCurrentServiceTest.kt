package com.readmates.hostworkspace.application.service

import com.readmates.hostworkspace.application.model.HostOperatingRoomAccessDeniedException
import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomAvailabilityException
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidate
import com.readmates.hostworkspace.application.model.HostOperatingRoomCandidateState
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirement
import com.readmates.hostworkspace.application.model.HostOperatingRoomClosingRequirementResult
import com.readmates.hostworkspace.application.model.HostOperatingRoomSelection
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomCandidateSourcePort
import com.readmates.hostworkspace.application.port.out.HostOperatingRoomClosingRequirementSourcePort
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.UUID

class HostOperatingRoomCurrentServiceTest {
    private val actor = HostOperatingRoomActor(uuid("101"), uuid("201"), uuid("001"), "reading-sai", true)

    @Test
    fun `open candidate short circuits draft and closing sources`() {
        val sources = Sources(listOf(candidate("301", HostOperatingRoomCandidateState.OPEN, true)))

        val current = HostOperatingRoomCurrentService(sources, sources).current(actor).currentMeeting

        assertEquals(uuid("301"), current?.sessionId)
        assertEquals(HostOperatingRoomSelection.OPEN, current?.selection)
        assertEquals(0, sources.closingCalls)
    }

    @Test
    fun `upcoming draft short circuits closing and keeps server schedule availability`() {
        val sources = Sources(listOf(candidate("302", HostOperatingRoomCandidateState.DRAFT, false)))

        val current = HostOperatingRoomCurrentService(sources, sources).current(actor).currentMeeting

        assertEquals(HostOperatingRoomSelection.UPCOMING_DRAFT, current?.selection)
        assertEquals("UNAVAILABLE", current?.scheduleSeenAvailability?.name)
        assertEquals(0, sources.closingCalls)
    }

    @Test
    fun `closed candidates are evaluated newest first and resolved or published candidates are skipped`() {
        val sources =
            Sources(
                candidates =
                    listOf(
                        candidate("305", HostOperatingRoomCandidateState.CLOSED, false),
                        candidate("304", HostOperatingRoomCandidateState.CLOSED, false),
                        candidate("303", HostOperatingRoomCandidateState.CLOSED, false),
                    ),
                closing =
                    mapOf(
                        uuid("305") to available(HostOperatingRoomClosingRequirement.RESOLVED),
                        uuid("304") to available(HostOperatingRoomClosingRequirement.PUBLISHED),
                        uuid("303") to available(HostOperatingRoomClosingRequirement.REQUIRED),
                    ),
            )

        val current = HostOperatingRoomCurrentService(sources, sources).current(actor).currentMeeting

        assertEquals(uuid("303"), current?.sessionId)
        assertEquals(HostOperatingRoomSelection.CLOSING_REQUIRED, current?.selection)
        assertEquals(listOf(uuid("305"), uuid("304"), uuid("303")), sources.requestedClosingIds)
    }

    @Test
    fun `partial closing lookup fails closed instead of selecting an older candidate`() {
        val sources =
            Sources(
                candidates =
                    listOf(
                        candidate("305", HostOperatingRoomCandidateState.CLOSED, false),
                        candidate("304", HostOperatingRoomCandidateState.CLOSED, false),
                    ),
                closing = mapOf(uuid("305") to HostOperatingRoomClosingRequirementResult.Unavailable),
            )

        assertThrows(HostOperatingRoomAvailabilityException::class.java) {
            HostOperatingRoomCurrentService(sources, sources).current(actor)
        }
        assertEquals(listOf(uuid("305")), sources.requestedClosingIds)
    }

    @Test
    fun `empty or fully resolved candidates return no current meeting`() {
        val empty = Sources(emptyList())
        assertNull(HostOperatingRoomCurrentService(empty, empty).current(actor).currentMeeting)

        val resolved =
            Sources(
                listOf(candidate("303", HostOperatingRoomCandidateState.CLOSED, false)),
                mapOf(uuid("303") to available(HostOperatingRoomClosingRequirement.RESOLVED)),
            )
        assertNull(HostOperatingRoomCurrentService(resolved, resolved).current(actor).currentMeeting)
    }

    @Test
    fun `inactive host authority is rejected before reading candidates`() {
        val sources = Sources(emptyList())

        assertThrows(HostOperatingRoomAccessDeniedException::class.java) {
            HostOperatingRoomCurrentService(sources, sources).current(actor.copy(activeHost = false))
        }

        assertEquals(0, sources.candidateCalls)
    }
}

private class Sources(
    private val candidates: List<HostOperatingRoomCandidate>,
    private val closing: Map<UUID, HostOperatingRoomClosingRequirementResult> = emptyMap(),
) : HostOperatingRoomCandidateSourcePort,
    HostOperatingRoomClosingRequirementSourcePort {
    var closingCalls: Int = 0
    var candidateCalls: Int = 0
    val requestedClosingIds = mutableListOf<UUID>()

    override fun loadCandidates(actor: HostOperatingRoomActor): List<HostOperatingRoomCandidate> {
        candidateCalls += 1
        return candidates
    }

    override fun loadClosingRequirement(
        actor: HostOperatingRoomActor,
        sessionId: UUID,
    ): HostOperatingRoomClosingRequirementResult {
        closingCalls += 1
        requestedClosingIds += sessionId
        return closing[sessionId] ?: HostOperatingRoomClosingRequirementResult.Unavailable
    }
}

private fun candidate(
    id: String,
    state: HostOperatingRoomCandidateState,
    scheduleSeenAvailable: Boolean,
) = HostOperatingRoomCandidate(uuid(id), state, scheduleSeenAvailable)

private typealias AvailableClosingRequirement = HostOperatingRoomClosingRequirementResult.Available

private fun available(requirement: HostOperatingRoomClosingRequirement): AvailableClosingRequirement =
    AvailableClosingRequirement(requirement)

private fun uuid(suffix: String): UUID = UUID.fromString("00000000-0000-0000-0000-${suffix.padStart(12, '0')}")
