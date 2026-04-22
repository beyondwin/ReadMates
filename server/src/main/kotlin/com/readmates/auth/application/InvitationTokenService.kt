package com.readmates.auth.application

import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.HexFormat

@Component
class InvitationTokenService {
    private val secureRandom = SecureRandom()

    fun generateToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun hashToken(rawToken: String): String {
        val normalized = rawToken.trim()
        require(normalized.isNotEmpty()) { "Invitation token must not be blank" }
        val digest = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }
}
