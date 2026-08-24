package com.readmates.shared.security

import java.security.MessageDigest
import java.util.HexFormat

object TokenHashing {
    fun sha256(rawToken: String): String {
        val normalized = rawToken.trim()
        require(normalized.isNotEmpty()) { "Token must not be blank" }
        val digest = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }
}
