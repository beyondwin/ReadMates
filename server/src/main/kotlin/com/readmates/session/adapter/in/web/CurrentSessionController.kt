package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.CurrentSessionPayload
import com.readmates.session.application.port.`in`.GetCurrentSessionUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/current")
class CurrentSessionController(
    private val getCurrentSessionUseCase: GetCurrentSessionUseCase,
) {
    @GetMapping
    fun current(member: CurrentMember): CurrentSessionPayload =
        getCurrentSessionUseCase.currentSession(member)
}
