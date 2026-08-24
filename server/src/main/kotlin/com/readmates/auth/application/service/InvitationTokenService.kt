package com.readmates.auth.application.service

import com.readmates.shared.security.TokenHashing
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.Base64

@Component
class InvitationTokenService {
    private val secureRandom = SecureRandom()

    fun generateToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun hashToken(rawToken: String): String = TokenHashing.sha256(rawToken)
}
