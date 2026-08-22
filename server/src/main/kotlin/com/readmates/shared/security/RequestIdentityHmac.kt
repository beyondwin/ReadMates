package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object RequestIdentityHmac {
    fun hmac(
        key: ByteArray,
        canonicalBytes: ByteArray,
        purpose: String,
    ): ByteArray {
        require(purpose.isNotBlank()) { "HMAC purpose must not be blank" }
        require('\u0000' !in purpose) { "HMAC purpose must not contain a null byte" }
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
        mac.update(purpose.toByteArray(StandardCharsets.UTF_8))
        mac.update(PURPOSE_SEPARATOR)
        return mac.doFinal(canonicalBytes)
    }

    fun equal(
        left: ByteArray,
        right: ByteArray,
    ): Boolean = MessageDigest.isEqual(left, right)

    private const val HMAC_ALGORITHM = "HmacSHA256"
    private const val PURPOSE_SEPARATOR: Byte = 0
}
