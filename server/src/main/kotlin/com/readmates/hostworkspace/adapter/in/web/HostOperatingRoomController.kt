@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.adapter.`in`.web

import com.readmates.hostworkspace.application.model.HostOperatingRoomAccessDeniedException
import com.readmates.hostworkspace.application.model.HostOperatingRoomActor
import com.readmates.hostworkspace.application.model.HostOperatingRoomAvailabilityException
import com.readmates.hostworkspace.application.model.HostOperatingRoomCurrent
import com.readmates.hostworkspace.application.port.`in`.GetHostOperatingRoomCurrentUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/host/operating-room")
class HostOperatingRoomController(
    private val getCurrent: GetHostOperatingRoomCurrentUseCase,
) {
    @GetMapping("/current")
    fun current(member: CurrentMember): HostOperatingRoomCurrent =
        try {
            getCurrent.current(
                HostOperatingRoomActor(
                    userId = member.userId,
                    membershipId = member.membershipId,
                    clubId = member.clubId,
                    clubSlug = member.clubSlug,
                    activeHost = member.isHost,
                ),
            )
        } catch (_: HostOperatingRoomAccessDeniedException) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        } catch (_: HostOperatingRoomAvailabilityException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)
        }
}
