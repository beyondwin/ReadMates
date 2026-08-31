@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.model.ClubAccessResult
import com.readmates.auth.application.model.TouchClubAccessCommand
import com.readmates.auth.application.port.`in`.TouchClubAccessUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/me/club-access")
class ClubAccessController(
    private val touchClubAccess: TouchClubAccessUseCase,
) {
    @PutMapping
    fun touch(member: CurrentMember): ClubAccessResult = touchClubAccess.touch(TouchClubAccessCommand(member))
}
