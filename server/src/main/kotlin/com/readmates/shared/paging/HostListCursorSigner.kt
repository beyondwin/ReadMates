package com.readmates.shared.paging

import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class VerifiedHostListCursor(
    val payload: String,
    val keyVersion: Int,
    val usedPreviousKey: Boolean,
)

class InvalidHostListCursorException : RuntimeException("Invalid host list cursor")

@Component
class HostListCursorSigner(
    private val properties: HostListCursorSigningProperties,
) {
    fun sign(
        payload: String,
        keyVersion: Int = properties.currentKeyVersion,
    ): String {
        val key = keyBytes(keyVersion) ?: throw InvalidHostListCursorException()
        val payloadPart = encoder.encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
        return "$keyVersion.$payloadPart.${macPart(key, payload)}"
    }

    @Suppress("ThrowsCount")
    fun verify(raw: String): VerifiedHostListCursor {
        val parts = raw.split('.')
        if (parts.size != SIGNED_CURSOR_PART_COUNT) throw InvalidHostListCursorException()
        val version = parts[0].toIntOrNull() ?: throw InvalidHostListCursorException()
        val payloadBytes = decodePart(parts[1])
        val providedMac = decodePart(parts[2])
        val payload = String(payloadBytes, StandardCharsets.UTF_8)
        val currentMac = hmac(properties.currentKey, payload)
        val previousMac = properties.previousKey.takeIf(String::isNotBlank)?.let { key -> hmac(key, payload) }
        val matchedCurrent =
            version == properties.currentKeyVersion && MessageDigest.isEqual(providedMac, currentMac)
        val matchedPrevious =
            previousMac != null &&
                version == properties.previousKeyVersion &&
                MessageDigest.isEqual(providedMac, previousMac)
        if (!matchedCurrent && !matchedPrevious) {
            throw InvalidHostListCursorException()
        }
        return VerifiedHostListCursor(
            payload = payload,
            keyVersion = version,
            usedPreviousKey = matchedPrevious && !matchedCurrent,
        )
    }

    private fun keyBytes(version: Int): ByteArray? =
        when (version) {
            properties.currentKeyVersion -> properties.currentKey.toByteArray(StandardCharsets.UTF_8)
            properties.previousKeyVersion ->
                properties.previousKey.takeIf(String::isNotBlank)?.toByteArray(StandardCharsets.UTF_8)
            else -> null
        }

    private fun macPart(
        key: ByteArray,
        payload: String,
    ): String = encoder.encodeToString(hmac(key, payload))

    private fun hmac(
        key: String,
        payload: String,
    ): ByteArray = hmac(key.toByteArray(StandardCharsets.UTF_8), payload)

    private fun hmac(
        key: ByteArray,
        payload: String,
    ): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
        return mac.doFinal((PURPOSE_PREFIX + payload).toByteArray(StandardCharsets.UTF_8))
    }

    private fun decodePart(value: String): ByteArray =
        try {
            val bytes = decoder.decode(value)
            if (encoder.encodeToString(bytes) != value) throw InvalidHostListCursorException()
            bytes
        } catch (_: IllegalArgumentException) {
            throw InvalidHostListCursorException()
        }

    private companion object {
        const val HMAC_ALGORITHM = "HmacSHA256"
        const val PURPOSE_PREFIX = "readmates:host-list:v1\u0000"
        const val SIGNED_CURSOR_PART_COUNT = 3
        val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val decoder: Base64.Decoder = Base64.getUrlDecoder()
    }
}
