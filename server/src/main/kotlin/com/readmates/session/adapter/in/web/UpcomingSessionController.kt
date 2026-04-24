package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.port.`in`.ListUpcomingSessionsUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/upcoming")
class UpcomingSessionController(
    private val listUpcomingSessionsUseCase: ListUpcomingSessionsUseCase,
) {
    @GetMapping
    fun upcoming(member: CurrentMember) = listUpcomingSessionsUseCase.upcoming(member)
}
