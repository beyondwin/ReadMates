package com.readmates.auth.adapter.`in`.web

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/dev/invitations")
@Profile("!prod & !production")
@ConditionalOnProperty(prefix = "readmates.dev", name = ["login-enabled"], havingValue = "true")
class DevInvitationController {
    @PostMapping("/{token}/accept")
    fun accept(@PathVariable("token") _token: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password invitation acceptance has been removed")
}
