package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/closing-status")
class HostSessionClosingController(
    private val getHostSessionClosingStatusUseCase: GetHostSessionClosingStatusUseCase,
) {
    @GetMapping
    fun get(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ): HostSessionClosingStatusResponse =
        getHostSessionClosingStatusUseCase
            .getHostSessionClosingStatus(member, parseSessionClosingId(sessionId))
            .toResponse()
}

private fun parseSessionClosingId(sessionId: String): UUID =
    runCatching { UUID.fromString(sessionId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
