package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.session.adapter.`in`.web.parseHostSessionId
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

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
            .getHostSessionClosingStatus(member, parseHostSessionId(sessionId))
            .toResponse()
}
