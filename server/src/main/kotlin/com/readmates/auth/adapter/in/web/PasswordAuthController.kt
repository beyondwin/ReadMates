package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.AuthSessionService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class PasswordAuthController(
    private val authSessionService: AuthSessionService,
) {
    @PostMapping("/api/auth/login")
    fun login(): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password login has been removed")

    @PostMapping("/api/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(request: HttpServletRequest, response: HttpServletResponse) {
        request.cookies
            ?.firstOrNull { it.name == AuthSessionService.COOKIE_NAME }
            ?.value
            ?.takeIf { it.isNotBlank() }
            ?.let(authSessionService::revokeSession)

        response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.clearedSessionCookie())
    }
}
