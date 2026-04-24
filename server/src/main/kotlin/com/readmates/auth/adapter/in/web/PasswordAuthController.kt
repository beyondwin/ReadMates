package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.LogoutAuthSessionUseCase
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class PasswordAuthController(
    private val logoutAuthSessionUseCase: LogoutAuthSessionUseCase,
) {
    @PostMapping("/api/auth/login")
    fun login(): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password login has been removed")

    @PostMapping("/api/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(request: HttpServletRequest, response: HttpServletResponse) {
        val rawToken = request.cookies
            ?.firstOrNull { it.name == logoutAuthSessionUseCase.sessionCookieName }
            ?.value

        request.getSession(false)?.invalidate()
        SecurityContextHolder.clearContext()
        response.addHeader(HttpHeaders.SET_COOKIE, logoutAuthSessionUseCase.logout(rawToken))
        response.addHeader(HttpHeaders.SET_COOKIE, logoutAuthSessionUseCase.clearedServletSessionCookie())
    }
}
