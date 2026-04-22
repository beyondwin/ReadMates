package com.readmates.auth.api

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class PasswordResetController {
    @PostMapping("/api/host/members/{membershipId}/password-reset")
    fun issueReset(@PathVariable("membershipId") _membershipId: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password reset has been removed")

    @PostMapping("/api/auth/password-reset/{token}")
    fun resetPassword(@PathVariable("token") _token: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password reset has been removed")
}
