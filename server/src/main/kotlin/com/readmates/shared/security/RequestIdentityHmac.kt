package com.readmates.shared.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object RequestIdentityHmac {
    fun hmac(
        key: ByteArray,
        canonicalBytes: ByteArray,
    ): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
        mac.update(PURPOSE_PREFIX)
        return mac.doFinal(canonicalBytes)
    }

    fun equal(
        left: ByteArray,
        right: ByteArray,
    ): Boolean = MessageDigest.isEqual(left, right)

    private val PURPOSE_PREFIX = "readmates:mutation-identity:v1\u0000".toByteArray(StandardCharsets.UTF_8)
    private const val HMAC_ALGORITHM = "HmacSHA256"
}
